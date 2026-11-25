package auth

import (
	"context"
	"sync"
	"testing"
	"time"
)

// lastSaveStore records the most recent persisted copy of each auth.
type lastSaveStore struct {
	mu    sync.Mutex
	saved map[string]*Auth
}

func (s *lastSaveStore) List(context.Context) ([]*Auth, error) { return nil, nil }

func (s *lastSaveStore) Save(_ context.Context, auth *Auth) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.saved == nil {
		s.saved = make(map[string]*Auth)
	}
	s.saved[auth.ID] = auth.Clone()
	return "", nil
}

func (s *lastSaveStore) Delete(context.Context, string) error { return nil }

func (s *lastSaveStore) get(id string) *Auth {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saved[id].Clone()
}

// registerDisabledOAuth registers an OAuth account whose access token is inside the
// provider refresh lead, then disables it the way the management API does.
func registerDisabledOAuth(t *testing.T, manager *Manager, provider string) *Auth {
	t.Helper()
	ctx := context.Background()
	auth := &Auth{
		ID:       provider + "-disabled",
		Provider: provider,
		Status:   StatusActive,
		Metadata: map[string]any{
			"type":          provider,
			"access_token":  "old-token",
			"refresh_token": "refresh-1",
			"expired":       time.Now().Add(time.Hour).Format(time.RFC3339),
		},
	}
	registered, errRegister := manager.Register(ctx, auth)
	if errRegister != nil {
		t.Fatalf("register: %v", errRegister)
	}
	disabled, committed, errModify := manager.Modify(ctx, auth.ID, registered.RegistrationEpoch, func(current *Auth) error {
		current.Disabled = true
		current.Status = StatusDisabled
		current.StatusMessage = "disabled via management API"
		current.Metadata["disabled"] = true
		return nil
	})
	if errModify != nil || !committed {
		t.Fatalf("disable: committed=%v err=%v", committed, errModify)
	}
	return disabled
}

func assertRenewedWhileDisabled(t *testing.T, manager *Manager, store *lastSaveStore, id string) {
	t.Helper()
	current, ok := manager.GetByID(id)
	if !ok || current.Metadata["access_token"] != "new-valid-token" {
		t.Fatalf("renewed token not committed: %+v", current)
	}
	if !current.Disabled || current.Status != StatusDisabled {
		t.Fatalf("refresh re-enabled the account: disabled=%v status=%v", current.Disabled, current.Status)
	}
	saved := store.get(id)
	if saved == nil || saved.Metadata["access_token"] != "new-valid-token" || !saved.Disabled {
		t.Fatalf("renewed disabled account not persisted: %+v", saved)
	}
}

// A disabled OAuth account must keep renewing in the background so it is
// usable again the moment it is re-enabled.
func TestAutoRefreshRenewsDisabledOAuthAccounts(t *testing.T) {
	for _, provider := range []string{"codex", "claude"} {
		t.Run(provider, func(t *testing.T) {
			ctx := context.Background()
			store := &lastSaveStore{}
			manager := NewManager(store, &RoundRobinSelector{}, nil)
			executor := &mockOAuthErrorExecutor{id: provider}
			manager.RegisterExecutor(executor)
			auth := registerDisabledOAuth(t, manager, provider)

			loop := newAuthAutoRefreshLoop(manager, refreshCheckInterval, 1)
			manager.refreshLoop = loop
			now := time.Now()
			loop.rebuild(now)
			loop.handleDue(ctx, now)
			if got := len(loop.jobs); got != 1 {
				t.Fatalf("queued refresh jobs = %d, want 1 for the disabled account", got)
			}
			// Run the queued job exactly as a loop worker does.
			job := <-loop.jobs
			if manager.beginRefreshJob(ctx, job) {
				_, _ = manager.refreshAuthForRequestAtEpoch(ctx, job.id, "", job.registrationEpoch)
			}
			manager.finishRefreshJob(job, time.Time{}, false)

			if got := executor.refreshCalls.Load(); got != 1 {
				t.Fatalf("executor refresh calls = %d, want 1", got)
			}
			assertRenewedWhileDisabled(t, manager, store, auth.ID)
		})
	}
}

func TestForceRefreshAllIncludesDisabledAccounts(t *testing.T) {
	store := &lastSaveStore{}
	manager := NewManager(store, &RoundRobinSelector{}, nil)
	executor := &mockOAuthErrorExecutor{id: "codex"}
	manager.RegisterExecutor(executor)
	auth := registerDisabledOAuth(t, manager, "codex")

	results := manager.ForceRefreshAll(context.Background())
	if len(results) != 1 || results[0].ID != auth.ID || !results[0].Success {
		t.Fatalf("ForceRefreshAll results = %+v, want one success for the disabled account", results)
	}
	assertRenewedWhileDisabled(t, manager, store, auth.ID)
}
