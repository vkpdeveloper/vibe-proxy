package usage

import (
	"context"
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

	reloaded, errReload := NewStore(filepath.Join(dir, "usage"), "", true)
	if errReload != nil {
		t.Fatalf("reloaded NewStore() error = %v", errReload)
	}
	if got := reloaded.Report(nil, nil).Totals.Requests; got != 1 {
		t.Fatalf("persisted request count = %d, want 1", got)
	}
	// Replaying the same request ID/model/tokens is idempotent.
	reloaded.HandleUsage(ctx, coreusage.Record{
		Provider: "codex", Model: "gpt-5.4", Source: "person@example.com", AuthType: "oauth", RequestedAt: requestedAt,
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
	if report.ByProvider == nil || report.ByAccount == nil || report.ByModel == nil || report.ByProviderModel == nil || report.ByAuthType == nil {
		t.Fatal("empty report breakdowns must be JSON arrays, not null")
	}
	if report.Daily == nil || report.UnpricedModels == nil || report.Recent == nil {
		t.Fatal("empty report collections must be JSON arrays, not null")
	}
}
