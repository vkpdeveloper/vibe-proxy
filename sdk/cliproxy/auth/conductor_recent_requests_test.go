package auth

import (
	"context"
	"net/http"
	"testing"
	"time"
)

func TestManagerMarkResultRecordsRecentRequests(t *testing.T) {
	mgr := NewManager(nil, nil, nil)
	auth := &Auth{
		ID:       "auth-1",
		Provider: "antigravity",
		Attributes: map[string]string{
			"runtime_only": "true",
		},
		Metadata: map[string]any{
			"type": "antigravity",
		},
	}

	if _, err := mgr.Register(WithSkipPersist(context.Background()), auth); err != nil {
		t.Fatalf("Register returned error: %v", err)
	}

	mgr.MarkResult(context.Background(), Result{AuthID: "auth-1", Provider: "antigravity", Model: "gpt-5", Success: true})
	mgr.MarkResult(context.Background(), Result{AuthID: "auth-1", Provider: "antigravity", Model: "gpt-5", Success: false})

	gotAuth, ok := mgr.GetByID("auth-1")
	if !ok || gotAuth == nil {
		t.Fatalf("GetByID returned ok=%v auth=%v", ok, gotAuth)
	}

	if gotAuth.Success != 1 || gotAuth.Failed != 1 {
		t.Fatalf("auth totals = success=%d failed=%d, want 1/1", gotAuth.Success, gotAuth.Failed)
	}

	snapshot := gotAuth.RecentRequestsSnapshot(time.Now())
	var successTotal int64
	var failedTotal int64
	for _, bucket := range snapshot {
		successTotal += bucket.Success
		failedTotal += bucket.Failed
	}
	if successTotal != 1 || failedTotal != 1 {
		t.Fatalf("totals = success=%d failed=%d, want 1/1", successTotal, failedTotal)
	}
}

func TestManagerMarkResultCountTokensDoesNotClearQuotaFailure(t *testing.T) {
	mgr := NewManager(nil, nil, nil)
	auth := &Auth{ID: "claude-1", Provider: "claude"}
	if _, err := mgr.Register(WithSkipPersist(context.Background()), auth); err != nil {
		t.Fatalf("Register returned error: %v", err)
	}

	refreshes := 0
	mgr.SetQuotaRefreshNotifier(func() { refreshes++ })
	quotaFailure := Result{
		AuthID:   auth.ID,
		Provider: auth.Provider,
		Model:    "claude-opus",
		Error:    &Error{HTTPStatus: http.StatusTooManyRequests, Message: "rate limited"},
	}
	mgr.MarkResult(context.Background(), quotaFailure)
	mgr.MarkResult(context.Background(), Result{
		AuthID:      auth.ID,
		Provider:    auth.Provider,
		Model:       quotaFailure.Model,
		Success:     true,
		CountTokens: true,
	})

	gotAuth, ok := mgr.GetByID(auth.ID)
	if !ok || gotAuth == nil {
		t.Fatal("GetByID did not return auth")
	}
	state := gotAuth.ModelStates[quotaFailure.Model]
	if state == nil || !state.Unavailable || !state.Quota.Exceeded {
		t.Fatalf("model state = %#v, want preserved quota cooldown", state)
	}

	for range quotaRefreshFailureCount - 1 {
		mgr.MarkResult(context.Background(), quotaFailure)
	}
	if refreshes != 1 {
		t.Fatalf("usage refreshes = %d, want 1 after %d quota failures", refreshes, quotaRefreshFailureCount)
	}

	mgr.MarkResult(context.Background(), Result{
		AuthID:   auth.ID,
		Provider: auth.Provider,
		Model:    quotaFailure.Model,
		Success:  true,
	})
	for range quotaRefreshFailureCount - 1 {
		mgr.MarkResult(context.Background(), quotaFailure)
	}
	if refreshes != 1 {
		t.Fatalf("usage refreshes = %d, want successful execution to reset the failure count", refreshes)
	}
	mgr.MarkResult(context.Background(), quotaFailure)
	if refreshes != 2 {
		t.Fatalf("usage refreshes = %d, want another refresh after the next %d failures", refreshes, quotaRefreshFailureCount)
	}
}

func TestManagerUpdatePreservesRecentRequestsAndTotals(t *testing.T) {
	mgr := NewManager(nil, nil, nil)
	auth := &Auth{
		ID:       "auth-1",
		Provider: "antigravity",
		Metadata: map[string]any{
			"type": "antigravity",
		},
	}
	if _, err := mgr.Register(WithSkipPersist(context.Background()), auth); err != nil {
		t.Fatalf("Register returned error: %v", err)
	}

	mgr.MarkResult(context.Background(), Result{AuthID: "auth-1", Provider: "antigravity", Model: "gpt-5", Success: true})

	updated := &Auth{
		ID:       "auth-1",
		Provider: "antigravity",
		Metadata: map[string]any{
			"type": "antigravity",
			"note": "updated",
		},
	}
	if _, err := mgr.Update(WithSkipPersist(context.Background()), updated); err != nil {
		t.Fatalf("Update returned error: %v", err)
	}

	gotAuth, ok := mgr.GetByID("auth-1")
	if !ok || gotAuth == nil {
		t.Fatalf("GetByID returned ok=%v auth=%v", ok, gotAuth)
	}
	if gotAuth.Success != 1 || gotAuth.Failed != 0 {
		t.Fatalf("auth totals = success=%d failed=%d, want 1/0", gotAuth.Success, gotAuth.Failed)
	}

	snapshot := gotAuth.RecentRequestsSnapshot(time.Now())
	var successTotal int64
	var failedTotal int64
	for _, bucket := range snapshot {
		successTotal += bucket.Success
		failedTotal += bucket.Failed
	}
	if successTotal != 1 || failedTotal != 0 {
		t.Fatalf("bucket totals = success=%d failed=%d, want 1/0", successTotal, failedTotal)
	}
}
