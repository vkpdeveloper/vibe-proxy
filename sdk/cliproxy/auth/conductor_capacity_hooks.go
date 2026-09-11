package auth

import (
	"strings"
	"time"
)

// UpdateCapacity replaces the runtime-only proactive quota snapshot for an auth.
// It deliberately bypasses persistence and lifecycle hooks so credential files
// are never rewritten by quota polling.
func (m *Manager) UpdateCapacity(authID string, state CapacityState) bool {
	if m == nil || strings.TrimSpace(authID) == "" {
		return false
	}
	state.Provider = strings.ToLower(strings.TrimSpace(state.Provider))
	if len(state.Windows) > 0 {
		state.Windows = append([]CapacityWindow(nil), state.Windows...)
	}

	m.mu.Lock()
	auth := m.auths[authID]
	if auth == nil {
		m.mu.Unlock()
		return false
	}
	auth.Capacity = state
	snapshot := auth.Clone()
	m.mu.Unlock()

	if m.scheduler != nil {
		m.scheduler.upsertAuth(snapshot)
	}
	return true
}

// RecordRoutingSelection marks authID as the provider's current routing choice.
// The marker is runtime-only and remains visible to management clients for ten
// minutes after the most recent selection.
func (m *Manager) RecordRoutingSelection(authID, model string) bool {
	if m == nil || strings.TrimSpace(authID) == "" {
		return false
	}
	now := time.Now().UTC()
	m.mu.Lock()
	selected := m.auths[authID]
	if selected == nil {
		m.mu.Unlock()
		return false
	}
	provider := executorKeyFromAuth(selected)
	for _, auth := range m.auths {
		if auth == nil || auth.ID == authID || executorKeyFromAuth(auth) != provider {
			continue
		}
		auth.RoutingSelection = RoutingSelectionState{}
	}
	selected.RoutingSelection = RoutingSelectionState{
		Selected:   true,
		Model:      strings.TrimSpace(model),
		SelectedAt: now,
		ExpiresAt:  now.Add(routingSelectionTTL),
	}
	m.mu.Unlock()
	return true
}

// routeReadyAuths filters out auths blocked for the given model so quota-drain
// selection only ranks credentials that can actually serve the request.
func (m *Manager) routeReadyAuths(auths []*Auth, routeModel string, now time.Time) []*Auth {
	ready := make([]*Auth, 0, len(auths))
	for _, candidate := range auths {
		checkModel := m.selectionModelForAuth(candidate, routeModel)
		blocked, _, _ := isAuthBlockedForModel(candidate, checkModel, now)
		if !blocked {
			ready = append(ready, candidate)
		}
	}
	return ready
}

func selectorUsesQuotaDrain(selector Selector) bool {
	switch typed := selector.(type) {
	case *QuotaDrainSelector:
		return true
	case *SessionAffinitySelector:
		return typed != nil && selectorUsesQuotaDrain(typed.fallback)
	default:
		return false
	}
}
