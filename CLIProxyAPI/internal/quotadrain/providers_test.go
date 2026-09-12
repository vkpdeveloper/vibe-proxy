package quotadrain

import (
	"context"
	"encoding/base64"
	"net/http"
	"testing"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
)

func TestSettingsFromConfig(t *testing.T) {
	settings := SettingsFromConfig(config.RoutingConfig{
		Strategy: "quota-drain",
		QuotaDrain: config.QuotaDrainRoutingConfig{
			RefreshInterval: "30s",
			StaleAfter:      "3m",
		},
	})
	if !settings.Enabled {
		t.Fatal("Enabled = false, want true")
	}
	if settings.RefreshInterval != 30*time.Second {
		t.Fatalf("RefreshInterval = %s, want 30s", settings.RefreshInterval)
	}
	if settings.StaleAfter != 3*time.Minute {
		t.Fatalf("StaleAfter = %s, want 3m", settings.StaleAfter)
	}

	defaults := SettingsFromConfig(config.RoutingConfig{Strategy: "round-robin"})
	if defaults.Enabled {
		t.Fatal("round-robin Enabled = true, want false")
	}
	if defaults.RefreshInterval != DefaultRefreshInterval || defaults.StaleAfter != DefaultStaleAfter {
		t.Fatalf("defaults = %s/%s, want %s/%s", defaults.RefreshInterval, defaults.StaleAfter, DefaultRefreshInterval, DefaultStaleAfter)
	}
	if defaults.RefreshInterval != 5*time.Minute {
		t.Fatalf("default RefreshInterval = %s, want 5m", defaults.RefreshInterval)
	}
}

func TestCodexAccountIDAcceptsPaddedJWTEncoding(t *testing.T) {
	claims := base64.URLEncoding.EncodeToString([]byte(`{"https://api.openai.com/auth":{"chatgpt_account_id":"acct-padded"}}`))
	auth := &coreauth.Auth{Metadata: map[string]any{"id_token": "header." + claims + ".signature"}}
	if got := codexAccountID(auth); got != "acct-padded" {
		t.Fatalf("codexAccountID() = %q, want acct-padded", got)
	}
}

func TestParseClaudeCapacity_DynamicScopes(t *testing.T) {
	now := time.Now().UTC()
	payload := map[string]any{
		"limits": []any{
			map[string]any{"kind": "session", "percent": 82.5, "resets_at": now.Add(time.Hour).Format(time.RFC3339)},
			map[string]any{
				"kind":      "weekly_scoped",
				"percent":   100.0,
				"resets_at": now.Add(2 * time.Hour).Format(time.RFC3339),
				"scope":     map[string]any{"model": map[string]any{"id": "claude-opus", "display_name": "Opus"}},
				"is_active": true,
			},
			map[string]any{"kind": "weekly_scoped", "percent": 20.0},
		},
	}

	windows, err := parseClaudeCapacity(payload, now)
	if err != nil {
		t.Fatalf("parseClaudeCapacity() error = %v", err)
	}
	if len(windows) != 3 {
		t.Fatalf("len(windows) = %d, want 3", len(windows))
	}
	if !windows[0].Routing || windows[0].RemainingPercent != 17.5 {
		t.Fatalf("session window = %#v, want routing with 17.5 remaining", windows[0])
	}
	if !windows[1].Routing || windows[1].ScopeModel != "claude-opus" || !windows[1].HardExhausted {
		t.Fatalf("scoped window = %#v, want routed exhausted claude-opus", windows[1])
	}
	if windows[2].Routing {
		t.Fatalf("scope-less weekly_scoped window Routing = true, want false")
	}
}

func TestParseCodexCapacity_OnlyGeneralRateLimitRoutes(t *testing.T) {
	now := time.Now().UTC()
	window := func(used float64) map[string]any {
		return map[string]any{
			"used_percent":        used,
			"reset_after_seconds": 3600.0,
		}
	}
	payload := map[string]any{
		"rate_limit": map[string]any{
			"allowed":          true,
			"primary_window":   window(90),
			"secondary_window": window(40),
		},
		"code_review_rate_limit": map[string]any{
			"limit_reached":  true,
			"primary_window": window(100),
		},
		"additional_rate_limits": []any{
			map[string]any{
				"limit_name": "other",
				"rate_limit": map[string]any{"primary_window": window(50)},
			},
		},
	}

	windows, err := parseCodexCapacity(payload, now)
	if err != nil {
		t.Fatalf("parseCodexCapacity() error = %v", err)
	}
	if len(windows) != 4 {
		t.Fatalf("len(windows) = %d, want 4", len(windows))
	}
	if !windows[0].Routing || !windows[1].Routing {
		t.Fatalf("general rate windows should route: %#v", windows[:2])
	}
	if windows[2].Routing || windows[3].Routing {
		t.Fatalf("specialty rate windows must be display-only: %#v", windows[2:])
	}
	if !windows[2].HardExhausted {
		t.Fatalf("code-review exhausted flag = false, want true")
	}
}

func TestParseCursorCapacity_UsesSeparatePoolsWithoutAggregate(t *testing.T) {
	now := time.Now().UTC()
	resetAt := now.Add(30 * 24 * time.Hour).Truncate(time.Second)
	windows := parseCursorPeriodCapacity(map[string]any{
		"billingCycleEnd": resetAt.Format(time.RFC3339),
		"planUsage": map[string]any{
			"totalPercentUsed": 35.0,
			"autoPercentUsed":  20.0,
			"apiPercentUsed":   55.0,
		},
	}, now)

	if len(windows) != 2 {
		t.Fatalf("len(windows) = %d, want 2", len(windows))
	}
	if windows[0].ID != "cursor-models" || windows[0].RemainingPercent != 80 {
		t.Fatalf("cursor models = %#v, want 80%% remaining", windows[0])
	}
	if windows[1].ID != "other-models" || windows[1].RemainingPercent != 45 {
		t.Fatalf("other models = %#v, want 45%% remaining", windows[1])
	}
	for _, window := range windows {
		if window.Routing {
			t.Fatalf("Cursor tracker window %q must be display-only", window.ID)
		}
		if !window.ResetAt.Equal(resetAt) {
			t.Fatalf("ResetAt = %s, want %s", window.ResetAt, resetAt)
		}
	}
}

func TestParseCursorCapacity_FallsBackToLegacyAggregate(t *testing.T) {
	windows := parseCursorPeriodCapacity(map[string]any{
		"planUsage": map[string]any{"totalPercentUsed": 25.0},
	}, time.Now().UTC())

	if len(windows) != 1 || windows[0].ID != "cursor-included" || windows[0].RemainingPercent != 75 {
		t.Fatalf("windows = %#v, want legacy aggregate with 75%% remaining", windows)
	}
}

func TestParseCursorSandCapacity_StoresSeparateWeeklyUsage(t *testing.T) {
	now := time.Now().UTC()
	resetAt := now.Add(7 * 24 * time.Hour).Truncate(time.Second)
	windows := parseCursorSandCapacity(map[string]any{
		"usagePercent":          9.0,
		"nextResetTimestampUtc": resetAt.Format(time.RFC3339),
	}, now)

	if len(windows) != 1 || windows[0].ID != "cursor-grok-bot" || windows[0].RemainingPercent != 91 {
		t.Fatalf("windows = %#v, want Grok Bot with 91%% remaining", windows)
	}
	if windows[0].Routing {
		t.Fatal("Grok Bot tracker window must be display-only")
	}
}

func TestParseOpenCodeGoCapacity_StoresThreeDisplayOnlyWindows(t *testing.T) {
	now := time.Now().UTC()
	rollingReset := now.Add(5 * time.Hour).Truncate(time.Second)
	weeklyReset := now.Add(7 * 24 * time.Hour).Truncate(time.Second)
	monthlyReset := now.Add(30 * 24 * time.Hour).Truncate(time.Second)
	windows, err := parseOpenCodeGoCapacity(map[string]any{
		"usage": map[string]any{
			"rolling": map[string]any{"status": "ok", "percent": 25.0, "resetsAt": rollingReset.Format(time.RFC3339)},
			"weekly":  map[string]any{"status": "ok", "percent": 40.0, "resetsAt": weeklyReset.Format(time.RFC3339)},
			"monthly": map[string]any{"status": "rate-limited", "percent": 100.0, "resetsAt": monthlyReset.Format(time.RFC3339)},
		},
	}, now)
	if err != nil {
		t.Fatalf("parseOpenCodeGoCapacity() error = %v", err)
	}
	if len(windows) != 3 {
		t.Fatalf("len(windows) = %d, want 3", len(windows))
	}
	if windows[0].ID != "opencode-go-rolling" || windows[0].RemainingPercent != 75 {
		t.Fatalf("rolling window = %#v, want 75%% remaining", windows[0])
	}
	if windows[1].ID != "opencode-go-weekly" || windows[1].RemainingPercent != 60 {
		t.Fatalf("weekly window = %#v, want 60%% remaining", windows[1])
	}
	if !windows[2].HardExhausted || windows[2].RemainingPercent != 0 {
		t.Fatalf("monthly window = %#v, want exhausted", windows[2])
	}
	for _, window := range windows {
		if window.Routing {
			t.Fatalf("OpenCode Go tracker window %q must be display-only", window.ID)
		}
	}
}

func TestParseXAICapacity_PreservesUnmeteredBillingPeriod(t *testing.T) {
	now := time.Now().UTC()
	resetAt := now.Add(7 * 24 * time.Hour).Truncate(time.Second)
	windows := parseXAICapacity(map[string]any{
		"config": map[string]any{
			"currentPeriod": map[string]any{"end": resetAt.Format(time.RFC3339)},
			"monthlyLimit":  map[string]any{"val": 0.0},
			"used":          map[string]any{"val": 0.0},
		},
	}, "xai-weekly", "Weekly credits", now)

	if len(windows) != 1 {
		t.Fatalf("len(windows) = %d, want 1", len(windows))
	}
	if windows[0].Known || windows[0].Routing {
		t.Fatalf("window = %#v, want unknown display-only billing period", windows[0])
	}
	if !windows[0].ResetAt.Equal(resetAt) {
		t.Fatalf("ResetAt = %s, want %s", windows[0].ResetAt, resetAt)
	}
}

func TestSupportedAuthIncludesCursorTracker(t *testing.T) {
	auth := &coreauth.Auth{
		Provider: "cursor",
		Metadata: map[string]any{
			"access_token": "cursor-token",
		},
	}
	if !supportedAuth(auth) {
		t.Fatal("supportedAuth(cursor) = false, want true")
	}
}

func TestSupportedAuthIncludesOpenCodeGoAPIKeyTracker(t *testing.T) {
	auth := &coreauth.Auth{
		Provider: "opencode-go",
		Metadata: map[string]any{
			"auth_kind": "api_key",
			"api_key":   "opencode-go-key",
		},
	}
	if !supportedAuth(auth) {
		t.Fatal("supportedAuth(opencode-go) = false, want true")
	}

	delete(auth.Metadata, "api_key")
	if supportedAuth(auth) {
		t.Fatal("supportedAuth(opencode-go without an API key) = true, want false")
	}
}

func TestSupportedAuthIncludesXAIOAuthTracker(t *testing.T) {
	auth := &coreauth.Auth{
		Provider: "xai",
		Metadata: map[string]any{
			"auth_kind":    "oauth",
			"access_token": "xai-token",
		},
	}
	if !supportedAuth(auth) {
		t.Fatal("supportedAuth(xai oauth) = false, want true")
	}
}

func TestCollectorRefreshFailureKeepsLastGoodSnapshot(t *testing.T) {
	manager := coreauth.NewManager(nil, nil, nil)
	now := time.Now().UTC()
	auth := &coreauth.Auth{
		ID:       "claude-1",
		Provider: "claude",
		Attributes: map[string]string{
			coreauth.AttributeAuthKind: coreauth.AuthKindOAuth,
		},
		Capacity: coreauth.CapacityState{
			Provider:  "claude",
			Supported: true,
			FetchedAt: now,
			StaleAt:   now.Add(time.Hour),
			Windows: []coreauth.CapacityWindow{{
				ID:               "last-good",
				RemainingPercent: 12,
				Known:            true,
				Routing:          true,
			}},
		},
	}
	if _, err := manager.Register(coreauth.WithSkipPersist(context.Background()), auth); err != nil {
		t.Fatalf("Register() error = %v", err)
	}

	collector := NewCollector(manager)
	collector.collectAuth(context.Background(), auth, time.Hour)
	updated, ok := manager.GetByID(auth.ID)
	if !ok || updated == nil {
		t.Fatal("GetByID() did not return auth")
	}
	if len(updated.Capacity.Windows) != 1 || updated.Capacity.Windows[0].ID != "last-good" {
		t.Fatalf("windows = %#v, want preserved last-good snapshot", updated.Capacity.Windows)
	}
	if updated.Capacity.LastError == "" {
		t.Fatal("LastError is empty after failed refresh")
	}
	if !updated.Capacity.FetchedAt.Equal(now) {
		t.Fatalf("FetchedAt = %s, want preserved %s", updated.Capacity.FetchedAt, now)
	}
}

func TestCollectorWakesAfterRepeatedQuotaFailures(t *testing.T) {
	manager := coreauth.NewManager(nil, nil, nil)
	auth := &coreauth.Auth{ID: "claude-1", Provider: "claude"}
	if _, err := manager.Register(coreauth.WithSkipPersist(context.Background()), auth); err != nil {
		t.Fatalf("Register() error = %v", err)
	}
	collector := NewCollector(manager)
	failure := coreauth.Result{
		AuthID:   auth.ID,
		Provider: auth.Provider,
		Model:    "claude-opus",
		Error:    &coreauth.Error{HTTPStatus: http.StatusTooManyRequests, Message: "rate limited"},
	}
	for range 4 {
		manager.MarkResult(context.Background(), failure)
	}

	select {
	case <-collector.wake:
	default:
		t.Fatal("collector was not woken after repeated quota failures")
	}
}
