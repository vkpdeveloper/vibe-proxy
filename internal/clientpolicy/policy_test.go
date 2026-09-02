package clientpolicy

import (
	"context"
	"testing"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

type fixedUsageReader struct{ usage UsageSnapshot }

type decisionCarrier map[string]any

func (c decisionCarrier) Get(key string) (any, bool) {
	value, ok := c[key]
	return value, ok
}

func (f fixedUsageReader) ClientUsage(string, time.Time, time.Time, time.Time) UsageSnapshot {
	return f.usage
}

func TestManagerEvaluateDailyUSDBudget(t *testing.T) {
	now := time.Date(2026, time.September, 2, 18, 30, 0, 0, time.FixedZone("IST", 5*60*60+30*60))
	manager := NewManager(fixedUsageReader{usage: UsageSnapshot{DailyUSD: 3.5}})
	manager.Update([]string{"secret"}, []config.ClientAPIKeyPolicy{{
		APIKey:        "secret",
		Name:          "Production",
		DailyLimitUSD: 3.5,
	}})

	decision := manager.Evaluate("secret", now)
	if !decision.Denied || decision.DenialCode != "daily_usd_limit_exceeded" {
		t.Fatalf("decision = %#v, want daily USD denial", decision)
	}
	wantReset := time.Date(2026, time.September, 3, 0, 0, 0, 0, time.UTC)
	if !decision.ResetAt.Equal(wantReset) || !decision.RetryAt.Equal(wantReset) {
		t.Fatalf("reset = %s retry = %s, want %s", decision.ResetAt, decision.RetryAt, wantReset)
	}
}

func TestManagerLeavesLegacyKeyUnrestricted(t *testing.T) {
	manager := NewManager(fixedUsageReader{usage: UsageSnapshot{DailyUSD: 999}})
	manager.Update([]string{"legacy"}, nil)
	decision := manager.Evaluate("legacy", time.Now())
	if decision.Managed || decision.Denied {
		t.Fatalf("legacy decision = %#v, want unmanaged and allowed", decision)
	}
}

func TestRestrictExecutionFiltersProvidersAndModels(t *testing.T) {
	ctx := WithDecision(context.Background(), Decision{
		Managed:          true,
		AllowedProviders: []string{"codex"},
		AllowedModels:    []string{"gpt-5.6-codex"},
	})
	providers, code, allowed := RestrictExecution(ctx, []string{"claude", "codex"}, "gpt-5.6-codex", "gpt-5.6-codex")
	if !allowed || code != "" || len(providers) != 1 || providers[0] != "codex" {
		t.Fatalf("providers=%v code=%q allowed=%v", providers, code, allowed)
	}
	if _, code, allowed = RestrictExecution(ctx, []string{"codex"}, "gpt-5.5", "gpt-5.5"); allowed || code != "model_not_allowed" {
		t.Fatalf("code=%q allowed=%v, want model denial", code, allowed)
	}
}

func TestModelAllowedRequiresProviderIntersection(t *testing.T) {
	ctx := WithDecision(context.Background(), Decision{Managed: true, AllowedProviders: []string{"claude"}})
	if ModelAllowed(ctx, "shared-model", []string{"codex"}) {
		t.Fatal("model should be hidden when no permitted provider serves it")
	}
	if !ModelAllowed(ctx, "shared-model", []string{"codex", "claude"}) {
		t.Fatal("model should be visible when a permitted provider serves it")
	}
}

func TestFromContextReadsExecutorGinCarrier(t *testing.T) {
	want := Decision{Managed: true, ClientKeyID: "stable-key-id"}
	ctx := context.WithValue(context.Background(), "gin", decisionCarrier{GinDecisionKey: want})
	got, ok := FromContext(ctx)
	if !ok || got.ClientKeyID != want.ClientKeyID || !got.Managed {
		t.Fatalf("decision=%#v ok=%v", got, ok)
	}
}
