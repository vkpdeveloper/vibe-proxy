package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"testing"
	"time"

	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/executor"
)

func TestCapacityStateIsExcludedFromAuthJSON(t *testing.T) {
	payload, err := json.Marshal(&Auth{
		ID:       "auth-1",
		Provider: "claude",
		Capacity: CapacityState{
			Provider:  "claude",
			Supported: true,
			Windows:   []CapacityWindow{{ID: "secret-runtime-snapshot", Known: true}},
		},
	})
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	if strings.Contains(string(payload), "capacity") || strings.Contains(string(payload), "secret-runtime-snapshot") {
		t.Fatalf("Auth JSON unexpectedly contains runtime capacity: %s", payload)
	}
}

func quotaDrainTestCapacity(now time.Time, staleAt time.Time, windows ...CapacityWindow) CapacityState {
	return CapacityState{
		Provider:  "claude",
		Supported: true,
		FetchedAt: now.Add(-time.Minute),
		StaleAt:   staleAt,
		Windows:   windows,
	}
}

func quotaDrainTestWindow(remaining float64, resetAt time.Time) CapacityWindow {
	return CapacityWindow{
		ID:               "global",
		Label:            "Global",
		UsedPercent:      100 - remaining,
		RemainingPercent: remaining,
		ResetAt:          resetAt,
		Known:            true,
		HardExhausted:    remaining <= 0,
		Routing:          true,
	}
}

func TestQuotaDrainSelector_DrainsLowestRemainingWithinProvider(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	auths := []*Auth{
		{ID: "thirty", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(30, now.Add(5*time.Hour)))},
		{ID: "five", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(5, now.Add(5*time.Hour)))},
		{ID: "unknown", Provider: "claude"},
	}

	got, err := selector.Pick(context.Background(), "claude", "claude-sonnet", cliproxyexecutor.Options{}, auths)
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "five" {
		t.Fatalf("Pick() auth = %#v, want five", got)
	}
}

func TestQuotaDrainSelector_StaleSnapshotFallsBack(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	auths := []*Auth{
		{ID: "stale", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(-time.Second), quotaDrainTestWindow(1, now.Add(time.Hour)))},
		{ID: "fresh", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(40, now.Add(time.Hour)))},
	}

	got, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, auths)
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "fresh" {
		t.Fatalf("Pick() auth = %#v, want fresh", got)
	}
}

func TestQuotaDrainSelector_ExhaustedFallsBackToUnknown(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	auths := []*Auth{
		{ID: "exhausted", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(time.Hour)))},
		{ID: "unknown", Provider: "claude"},
	}

	got, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, auths)
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "unknown" {
		t.Fatalf("Pick() auth = %#v, want unknown", got)
	}
}

func TestQuotaDrainSelector_ExhaustedWithoutResetFallsBack(t *testing.T) {
	now := time.Now()
	exhaustedWindow := quotaDrainTestWindow(0, time.Time{})
	selector := &QuotaDrainSelector{}
	auths := []*Auth{
		{ID: "exhausted", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), exhaustedWindow)},
		{ID: "available", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(40, now.Add(time.Hour)))},
	}

	got, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, auths)
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "available" {
		t.Fatalf("Pick() auth = %#v, want available", got)
	}
}

func TestQuotaDrainSelector_UsesOnlyMatchingModelScope(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	scoped := quotaDrainTestWindow(1, now.Add(time.Hour))
	scoped.ID = "scoped"
	scoped.ScopeModel = "model-x"
	authA := &Auth{ID: "a", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(50, now.Add(time.Hour)), scoped)}
	authB := &Auth{ID: "b", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(10, now.Add(time.Hour)))}

	gotX, err := selector.Pick(context.Background(), "claude", "model-x", cliproxyexecutor.Options{}, []*Auth{authA, authB})
	if err != nil {
		t.Fatalf("Pick(model-x) error = %v", err)
	}
	if gotX == nil || gotX.ID != "a" {
		t.Fatalf("Pick(model-x) auth = %#v, want a", gotX)
	}

	gotY, err := selector.Pick(context.Background(), "claude", "model-y", cliproxyexecutor.Options{}, []*Auth{authA, authB})
	if err != nil {
		t.Fatalf("Pick(model-y) error = %v", err)
	}
	if gotY == nil || gotY.ID != "b" {
		t.Fatalf("Pick(model-y) auth = %#v, want b", gotY)
	}
}

func TestQuotaDrainSelector_PriorityPrecedesCapacity(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	high := &Auth{
		ID:         "high",
		Provider:   "claude",
		Attributes: map[string]string{"priority": "10"},
		Capacity:   quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(80, now.Add(time.Hour))),
	}
	low := &Auth{
		ID:         "low",
		Provider:   "claude",
		Attributes: map[string]string{"priority": "0"},
		Capacity:   quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(1, now.Add(time.Hour))),
	}

	got, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, []*Auth{low, high})
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "high" {
		t.Fatalf("Pick() auth = %#v, want high", got)
	}

	high.Capacity = quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(time.Hour)))
	got, err = selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, []*Auth{low, high})
	if err != nil {
		t.Fatalf("Pick() exhausted priority error = %v", err)
	}
	if got == nil || got.ID != "low" {
		t.Fatalf("Pick() exhausted priority auth = %#v, want low", got)
	}
}

func TestQuotaDrainSelector_AllExhaustedReturnsResetCooldown(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	_, err := selector.Pick(context.Background(), "claude", "model", cliproxyexecutor.Options{}, []*Auth{
		{ID: "a", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(30*time.Minute)))},
		{ID: "b", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(time.Hour)))},
	})
	var cooldownErr *modelCooldownError
	if !errors.As(err, &cooldownErr) {
		t.Fatalf("Pick() error = %v, want modelCooldownError", err)
	}
	if cooldownErr.resetIn < 29*time.Minute || cooldownErr.resetIn > 31*time.Minute {
		t.Fatalf("resetIn = %s, want about 30m", cooldownErr.resetIn)
	}
}

func TestQuotaDrainSelector_MixedProviderChoiceDoesNotCompareQuota(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	auths := []*Auth{
		{ID: "claude-high", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(60, now.Add(time.Hour)))},
		{ID: "claude-low", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(20, now.Add(time.Hour)))},
		{ID: "codex-lowest", Provider: "codex", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(1, now.Add(time.Hour)))},
	}

	got, err := selector.Pick(context.Background(), "mixed", "", cliproxyexecutor.Options{}, auths)
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "claude-low" {
		t.Fatalf("first mixed Pick() auth = %#v, want claude-low", got)
	}

	got, err = selector.Pick(context.Background(), "mixed", "", cliproxyexecutor.Options{}, auths)
	if err != nil {
		t.Fatalf("second Pick() error = %v", err)
	}
	if got == nil || got.ID != "codex-lowest" {
		t.Fatalf("second mixed Pick() auth = %#v, want codex-lowest", got)
	}
}

func TestQuotaDrainSelector_BoundsCursorKeys(t *testing.T) {
	selector := &QuotaDrainSelector{maxKeys: 2}
	auths := []*Auth{{ID: "available", Provider: "claude"}}
	for _, model := range []string{"model-a", "model-b", "model-c"} {
		if _, err := selector.Pick(context.Background(), "claude", model, cliproxyexecutor.Options{}, auths); err != nil {
			t.Fatalf("Pick(%q) error = %v", model, err)
		}
	}
	if got := len(selector.cursors); got > selector.maxKeys {
		t.Fatalf("cursor keys = %d, want at most %d", got, selector.maxKeys)
	}
}

func TestQuotaDrainSelector_PreservesCodexWebsocketPreference(t *testing.T) {
	now := time.Now()
	selector := &QuotaDrainSelector{}
	httpAuth := &Auth{ID: "http", Provider: "codex", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(1, now.Add(time.Hour)))}
	wsAuth := &Auth{
		ID:         "websocket",
		Provider:   "codex",
		Attributes: map[string]string{"websockets": "true"},
		Capacity:   quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(90, now.Add(time.Hour))),
	}

	ctx := cliproxyexecutor.WithDownstreamWebsocket(context.Background())
	got, err := selector.Pick(ctx, "codex", "", cliproxyexecutor.Options{}, []*Auth{httpAuth, wsAuth})
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "websocket" {
		t.Fatalf("Pick() auth = %#v, want websocket", got)
	}
}

func TestSessionAffinitySelector_FailsOverWhenQuotaDrainSnapshotIsExhausted(t *testing.T) {
	now := time.Now()
	fallback := &QuotaDrainSelector{}
	selector := NewSessionAffinitySelector(fallback)
	t.Cleanup(selector.Stop)
	authA := &Auth{ID: "a", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(1, now.Add(time.Hour)))}
	authB := &Auth{ID: "b", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(50, now.Add(time.Hour)))}
	opts := cliproxyexecutor.Options{Headers: http.Header{"X-Session-ID": []string{"session-1"}}}

	first, err := selector.Pick(context.Background(), "claude", "", opts, []*Auth{authA, authB})
	if err != nil {
		t.Fatalf("first Pick() error = %v", err)
	}
	if first == nil || first.ID != "a" {
		t.Fatalf("first Pick() auth = %#v, want a", first)
	}

	authA.Capacity = quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(time.Hour)))
	second, err := selector.Pick(context.Background(), "claude", "", opts, []*Auth{authA, authB})
	if err != nil {
		t.Fatalf("second Pick() error = %v", err)
	}
	if second == nil || second.ID != "b" {
		t.Fatalf("second Pick() auth = %#v, want b", second)
	}
}

func TestSchedulerQuotaDrain_MixedProviderRotatesBeforeCredentialRanking(t *testing.T) {
	now := time.Now()
	scheduler := newSchedulerForTest(
		&QuotaDrainSelector{},
		&Auth{ID: "claude-high", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(60, now.Add(time.Hour)))},
		&Auth{ID: "claude-low", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(20, now.Add(time.Hour)))},
		&Auth{ID: "codex-lowest", Provider: "codex", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(1, now.Add(time.Hour)))},
	)

	got, provider, err := scheduler.pickMixed(context.Background(), []string{"claude", "codex"}, "", cliproxyexecutor.Options{}, nil)
	if err != nil {
		t.Fatalf("pickMixed() error = %v", err)
	}
	if provider != "claude" || got == nil || got.ID != "claude-low" {
		t.Fatalf("pickMixed() = provider %q auth %#v, want claude/claude-low", provider, got)
	}
}

func TestSchedulerQuotaDrain_MixedExhaustionReturnsEarliestReset(t *testing.T) {
	now := time.Now()
	scheduler := newSchedulerForTest(
		&QuotaDrainSelector{},
		&Auth{ID: "claude", Provider: "claude", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(20*time.Minute)))},
		&Auth{ID: "codex", Provider: "codex", Capacity: quotaDrainTestCapacity(now, now.Add(time.Hour), quotaDrainTestWindow(0, now.Add(40*time.Minute)))},
	)

	_, _, err := scheduler.pickMixed(context.Background(), []string{"claude", "codex"}, "", cliproxyexecutor.Options{}, nil)
	var cooldownErr *modelCooldownError
	if !errors.As(err, &cooldownErr) {
		t.Fatalf("pickMixed() error = %v, want modelCooldownError", err)
	}
	if cooldownErr.resetIn < 19*time.Minute || cooldownErr.resetIn > 21*time.Minute {
		t.Fatalf("resetIn = %s, want about 20m", cooldownErr.resetIn)
	}
}
