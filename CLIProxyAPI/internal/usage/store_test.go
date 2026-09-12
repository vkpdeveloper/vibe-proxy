package usage

import (
	"context"
	"math"
	"os"
	"path/filepath"
	"testing"
	"time"

	internallogging "github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	coreusage "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/usage"
)

func TestStorePersistsPricesAndGroupsUsage(t *testing.T) {
	dir := t.TempDir()
	store, errStore := NewStore(filepath.Join(dir, "usage"), filepath.Join(dir, "logs"), true)
	if errStore != nil {
		t.Fatalf("NewStore() error = %v", errStore)
	}
	requestedAt := time.Date(2026, 9, 2, 12, 0, 0, 0, time.UTC)
	ctx := internallogging.WithRequestID(context.Background(), "request-1")
	store.HandleUsage(ctx, coreusage.Record{
		Provider:    "codex",
		Model:       "gpt-5.4",
		APIKey:      "client-secret",
		Source:      "person@example.com",
		AuthType:    "oauth",
		RequestedAt: requestedAt,
		Detail: coreusage.Detail{
			InputTokens:  100_000,
			OutputTokens: 100_000,
			CachedTokens: 20_000,
			TotalTokens:  200_000,
		},
	})

	report := store.Report(nil, nil)
	if report.Totals.Requests != 1 || report.Totals.TotalTokens != 200_000 {
		t.Fatalf("unexpected totals: %+v", report.Totals)
	}
	// 80k regular input ($0.20) + 20k cached input ($0.005) + 100k output ($1.50).
	if report.Totals.EstimatedUSD != 1.705 {
		t.Fatalf("estimated cost = %.8f, want 1.705", report.Totals.EstimatedUSD)
	}
	if len(report.ByProvider) != 1 || report.ByProvider[0].Provider != "codex" {
		t.Fatalf("provider breakdown = %+v", report.ByProvider)
	}
	if len(report.ByAccount) != 1 || report.ByAccount[0].Account != "person@example.com" {
		t.Fatalf("account breakdown = %+v", report.ByAccount)
	}
	if len(report.ByClientKey) != 1 || report.ByClientKey[0].ClientKeyID == "" {
		t.Fatalf("client key breakdown = %+v", report.ByClientKey)
	}
	usage := store.ClientUsage(report.ByClientKey[0].ClientKeyID, requestedAt.Truncate(24*time.Hour), requestedAt.Add(-time.Minute), requestedAt.Add(time.Minute))
	if usage.DailyRequests != 1 || usage.DailyTokens != 200_000 || usage.DailyUSD != 1.705 || usage.MinuteRequests != 1 {
		t.Fatalf("client usage = %+v", usage)
	}

	reloaded, errReload := NewStore(filepath.Join(dir, "usage"), "", true)
	if errReload != nil {
		t.Fatalf("reloaded NewStore() error = %v", errReload)
	}
	if got := reloaded.Report(nil, nil).Totals.Requests; got != 1 {
		t.Fatalf("persisted request count = %d, want 1", got)
	}
	// Replaying the same request ID/model/tokens is idempotent.
	reloaded.HandleUsage(ctx, coreusage.Record{
		Provider: "codex", Model: "gpt-5.4", APIKey: "client-secret", Source: "person@example.com", AuthType: "oauth", RequestedAt: requestedAt,
		Detail: coreusage.Detail{InputTokens: 100_000, OutputTokens: 100_000, CachedTokens: 20_000, TotalTokens: 200_000},
	})
	if got := reloaded.Report(nil, nil).Totals.Requests; got != 1 {
		t.Fatalf("deduplicated request count = %d, want 1", got)
	}
}

func TestStorePricesClaudeSeparateCacheAndProtectsAPIKey(t *testing.T) {
	store, errStore := NewStore(filepath.Join(t.TempDir(), "usage"), "", true)
	if errStore != nil {
		t.Fatalf("NewStore() error = %v", errStore)
	}
	store.HandleUsage(context.Background(), coreusage.Record{
		Provider: "claude", Model: "claude-sonnet-4-6", Source: "sk-ant-secret-value-that-must-not-persist", AuthType: "api_key",
		Detail: coreusage.Detail{InputTokens: 1_000_000, OutputTokens: 1_000_000, CacheReadTokens: 1_000_000, CacheCreationTokens: 1_000_000, TotalTokens: 4_000_000},
	})
	events := store.Events()
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	if events[0].Account == "sk-ant-secret-value-that-must-not-persist" {
		t.Fatal("raw API key persisted as account label")
	}
	// $3 base input + $0.30 cache read + $3.75 cache write + $15 output.
	if events[0].Cost.TotalUSD != 22.05 {
		t.Fatalf("estimated cost = %.8f, want 22.05", events[0].Cost.TotalUSD)
	}
}

func TestStorePricesGPT6Astra(t *testing.T) {
	store, errStore := NewStore(filepath.Join(t.TempDir(), "usage"), "", true)
	if errStore != nil {
		t.Fatalf("NewStore() error = %v", errStore)
	}
	store.HandleUsage(context.Background(), coreusage.Record{
		Provider: "codex", Model: "gpt-6-astra", Source: "person@example.com", AuthType: "oauth",
		Detail: coreusage.Detail{
			InputTokens:         100_000,
			OutputTokens:        100_000,
			CacheReadTokens:     10_000,
			CacheCreationTokens: 10_000,
			TotalTokens:         200_000,
		},
	})
	events := store.Events()
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	// 80k regular input ($0.80) + 10k cached input ($0.01) + 10k cache writes ($0.125) + 100k output ($5).
	if math.Abs(events[0].Cost.TotalUSD-5.935) > 1e-9 {
		t.Fatalf("estimated cost = %.8f, want 5.935", events[0].Cost.TotalUSD)
	}
	if events[0].Cost.RuleID != "openai-gpt-6-astra" {
		t.Fatalf("pricing rule = %q, want openai-gpt-6-astra", events[0].Cost.RuleID)
	}
}

func TestStorePricesGPT6AstraLongContext(t *testing.T) {
	store, errStore := NewStore(filepath.Join(t.TempDir(), "usage"), "", true)
	if errStore != nil {
		t.Fatalf("NewStore() error = %v", errStore)
	}
	store.HandleUsage(context.Background(), coreusage.Record{
		Provider: "codex", Model: "gpt-6-astra", Source: "person@example.com", AuthType: "oauth",
		Detail: coreusage.Detail{
			InputTokens:         1_000_000,
			OutputTokens:        1_000_000,
			CacheReadTokens:     100_000,
			CacheCreationTokens: 100_000,
			TotalTokens:         2_000_000,
		},
	})
	events := store.Events()
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	// Above 272k context: 800k regular input ($16) + 100k cached ($0.20) + 100k writes ($2.50) + 1M output ($75).
	if math.Abs(events[0].Cost.TotalUSD-93.7) > 1e-9 {
		t.Fatalf("estimated long-context cost = %.8f, want 93.7", events[0].Cost.TotalUSD)
	}
}

func TestStoreImportsDetailedLogsAndCountsUncostableMainLogs(t *testing.T) {
	root := t.TempDir()
	logDir := filepath.Join(root, "logs")
	if errMkdir := os.MkdirAll(logDir, 0o755); errMkdir != nil {
		t.Fatal(errMkdir)
	}
	detailed := `=== REQUEST INFO ===
Version: dev
URL: /v1/responses
Method: POST
Timestamp: 2026-08-01T12:00:00Z

=== REQUEST BODY ===
{"model":"gpt-5.4","input":"hello"}

=== API RESPONSE ===
{"response":{"usage":{"input_tokens":100,"output_tokens":20,"total_tokens":120,"input_tokens_details":{"cached_tokens":40}}}}

=== RESPONSE ===
Status: 200
`
	if errWrite := os.WriteFile(filepath.Join(logDir, "v1-responses-2026-08-01T120000-request-old.log"), []byte(detailed), 0o600); errWrite != nil {
		t.Fatal(errWrite)
	}
	mainLog := `[2026-08-01 12:00:01] [abcd] [info] [gin_logger.go:1] 200 | 1s | 127.0.0.1 | POST    "/v1/messages?beta=true"
`
	if errWrite := os.WriteFile(filepath.Join(logDir, "main.log"), []byte(mainLog), 0o600); errWrite != nil {
		t.Fatal(errWrite)
	}

	store, errStore := NewStore(filepath.Join(root, "usage"), logDir, true)
	if errStore != nil {
		t.Fatalf("NewStore() error = %v", errStore)
	}
	report := store.Report(nil, nil)
	if report.Totals.Requests != 1 || report.Totals.TotalTokens != 120 {
		t.Fatalf("imported totals = %+v", report.Totals)
	}
	if report.Historical.ImportedUsageRecords != 1 || report.Historical.UncostableLegacyRows != 1 {
		t.Fatalf("historical coverage = %+v", report.Historical)
	}
	if report.Recent[0].Origin != "historical-request-log" {
		t.Fatalf("origin = %q", report.Recent[0].Origin)
	}

	reloaded, errReload := NewStore(filepath.Join(root, "usage"), logDir, true)
	if errReload != nil {
		t.Fatal(errReload)
	}
	if got := reloaded.Report(nil, nil).Totals.Requests; got != 1 {
		t.Fatalf("reimported totals request count = %d, want 1", got)
	}
}

func TestStoreRespectsDisabledAccounting(t *testing.T) {
	store, errStore := NewStore(filepath.Join(t.TempDir(), "usage"), "", false)
	if errStore != nil {
		t.Fatal(errStore)
	}
	store.HandleUsage(context.Background(), coreusage.Record{Provider: "codex", Model: "gpt-5.4", Detail: coreusage.Detail{TotalTokens: 1}})
	if got := len(store.Events()); got != 0 {
		t.Fatalf("events = %d, want 0", got)
	}
}

func TestEmptyReportUsesEmptyCollections(t *testing.T) {
	store, errStore := NewStore(filepath.Join(t.TempDir(), "usage"), "", true)
	if errStore != nil {
		t.Fatal(errStore)
	}
	report := store.Report(nil, nil)
	if report.ByProvider == nil || report.ByAccount == nil || report.ByModel == nil || report.ByProviderModel == nil || report.ByAuthType == nil || report.ByClientKey == nil {
		t.Fatal("empty report breakdowns must be JSON arrays, not null")
	}
	if report.Daily == nil || report.UnpricedModels == nil || report.Recent == nil {
		t.Fatal("empty report collections must be JSON arrays, not null")
	}
}
