package quotadrain

import (
	"context"
	"encoding/base64"
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
