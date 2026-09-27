package auth

import (
	"context"
	"testing"
	"time"

	cliproxyexecutor "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/executor"
)

const (
	quotaPinTestSession = int64(5 * 60 * 60)
	quotaPinTestWeekly  = int64(7 * 24 * 60 * 60)
)

func quotaPinTestWindows(now time.Time, sessionRemaining float64, sessionReset time.Time, weeklyRemaining float64, weeklyReset time.Time) CapacityState {
	session := quotaDrainTestWindow(sessionRemaining, sessionReset)
	session.ID = "session"
	session.PeriodSeconds = quotaPinTestSession
	weekly := quotaDrainTestWindow(weeklyRemaining, weeklyReset)
	weekly.ID = "weekly_all"
	weekly.PeriodSeconds = quotaPinTestWeekly
	return quotaDrainTestCapacity(now, now.Add(time.Hour), session, weekly)
}

// The screenshot case: social has a tighter 5h window, but kuru's weekly budget
// resets in ~34h with 80% left and would be wasted.
func quotaPinTestAccounts(now time.Time) (*Auth, *Auth) {
	social := &Auth{ID: "social", Provider: "claude", Capacity: quotaPinTestWindows(now, 44, now.Add(3*time.Hour), 96, now.Add(170*time.Hour))}
	kuru := &Auth{ID: "kuru", Provider: "claude", Capacity: quotaPinTestWindows(now, 100, time.Time{}, 80, now.Add(34*time.Hour))}
	return social, kuru
}

func pickClaude(t *testing.T, scheduler *authScheduler, tried map[string]struct{}) string {
	t.Helper()
	got, err := scheduler.pickSingle(context.Background(), "claude", "", cliproxyexecutor.Options{}, tried)
	if err != nil {
		t.Fatalf("pickSingle() error = %v", err)
	}
	if got == nil {
		t.Fatal("pickSingle() returned nil auth")
	}
	return got.ID
}

func TestQuotaDrain_PrefersExpiringWeeklyBudgetOverTighterSessionWindow(t *testing.T) {
	now := time.Now()
	social, kuru := quotaPinTestAccounts(now)

	scheduler := newSchedulerForTest(&QuotaDrainSelector{}, social, kuru)
	if got := pickClaude(t, scheduler, nil); got != "kuru" {
		t.Fatalf("scheduler picked %q, want kuru", got)
	}

	got, err := (&QuotaDrainSelector{}).Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, []*Auth{social, kuru})
	if err != nil {
		t.Fatalf("Pick() error = %v", err)
	}
	if got == nil || got.ID != "kuru" {
		t.Fatalf("selector picked %#v, want kuru", got)
	}
}

func TestSchedulerQuotaDrain_PinsUntilSessionExhaustedThenReturnsOnRecovery(t *testing.T) {
	now := time.Now()
	social, kuru := quotaPinTestAccounts(now)
	scheduler := newSchedulerForTest(&QuotaDrainSelector{}, social, kuru)
	if got := pickClaude(t, scheduler, nil); got != "kuru" {
		t.Fatalf("initial pick = %q, want kuru", got)
	}

	// Heavy use drains kuru's weekly budget below social's urgency; the pin holds.
	kuru.Capacity = quotaPinTestWindows(now, 5, now.Add(4*time.Hour), 10, now.Add(34*time.Hour))
	scheduler.upsertAuth(kuru)
	if got := pickClaude(t, scheduler, nil); got != "kuru" {
		t.Fatalf("pick with drained weekly = %q, want pinned kuru", got)
	}

	// A request-scoped exclusion (e.g. a transient error retry) does not move the pin.
	if got := pickClaude(t, scheduler, map[string]struct{}{"kuru": {}}); got != "social" {
		t.Fatalf("retry pick = %q, want social", got)
	}
	kuru.Capacity = quotaPinTestWindows(now, 60, now.Add(4*time.Hour), 80, now.Add(34*time.Hour))
	scheduler.upsertAuth(kuru)
	if got := pickClaude(t, scheduler, nil); got != "kuru" {
		t.Fatalf("pick after retry = %q, want kuru", got)
	}

	// Kuru's 5h window is exhausted: switch to social.
	sessionReset := now.Add(2 * time.Hour)
	kuru.Capacity = quotaPinTestWindows(now, 0, sessionReset, 80, now.Add(34*time.Hour))
	scheduler.upsertAuth(kuru)
	if got := pickClaude(t, scheduler, nil); got != "social" {
		t.Fatalf("pick with exhausted session = %q, want social", got)
	}
	if got := pickClaude(t, scheduler, nil); got != "social" {
		t.Fatalf("repeat pick with exhausted session = %q, want social", got)
	}

	// Kuru's 5h window resets: go back to kuru immediately.
	kuru.Capacity = quotaPinTestWindows(now, 100, now.Add(5*time.Hour), 80, now.Add(34*time.Hour))
	scheduler.upsertAuth(kuru)
	if got := pickClaude(t, scheduler, nil); got != "kuru" {
		t.Fatalf("pick after session reset = %q, want kuru", got)
	}
}

func TestSchedulerQuotaDrain_RerankOnWeeklyRollover(t *testing.T) {
	now := time.Now()
	social, kuru := quotaPinTestAccounts(now)
	scheduler := newSchedulerForTest(&QuotaDrainSelector{}, social, kuru)
	if got := pickClaude(t, scheduler, nil); got != "kuru" {
		t.Fatalf("initial pick = %q, want kuru", got)
	}

	// Kuru's week rolls over; social now has the budget closest to expiring.
	kuru.Capacity = quotaPinTestWindows(now, 100, time.Time{}, 100, now.Add(7*24*time.Hour))
	social.Capacity = quotaPinTestWindows(now, 100, time.Time{}, 96, now.Add(24*time.Hour))
	scheduler.upsertAuth(kuru)
	scheduler.upsertAuth(social)
	if got := pickClaude(t, scheduler, nil); got != "social" {
		t.Fatalf("pick after weekly rollover = %q, want social", got)
	}
}

func TestQuotaDrainSelector_PinsUntilSessionExhaustedThenReturnsOnRecovery(t *testing.T) {
	now := time.Now()
	social, kuru := quotaPinTestAccounts(now)
	selector := &QuotaDrainSelector{}
	pick := func() string {
		t.Helper()
		got, err := selector.Pick(context.Background(), "claude", "", cliproxyexecutor.Options{}, []*Auth{social, kuru})
		if err != nil || got == nil {
			t.Fatalf("Pick() = %#v, %v", got, err)
		}
		return got.ID
	}
	if got := pick(); got != "kuru" {
		t.Fatalf("initial pick = %q, want kuru", got)
	}
	kuru.Capacity = quotaPinTestWindows(now, 5, now.Add(4*time.Hour), 10, now.Add(34*time.Hour))
	if got := pick(); got != "kuru" {
		t.Fatalf("pick with drained weekly = %q, want pinned kuru", got)
	}
	kuru.Capacity = quotaPinTestWindows(now, 0, now.Add(2*time.Hour), 10, now.Add(34*time.Hour))
	if got := pick(); got != "social" {
		t.Fatalf("pick with exhausted session = %q, want social", got)
	}
	kuru.Capacity = quotaPinTestWindows(now, 100, now.Add(5*time.Hour), 80, now.Add(34*time.Hour))
	if got := pick(); got != "kuru" {
		t.Fatalf("pick after session reset = %q, want kuru", got)
	}
}
