package auth

import "time"

// budgetRolloverTolerance ignores small jitter in reported reset times; only a
// real rollover (a new weekly window) invalidates a pin.
const budgetRolloverTolerance = time.Hour

// quotaPinCandidate is one credential that is currently able to serve the
// provider/model: not in cooldown and without an exhausted quota window.
type quotaPinCandidate struct {
	id      string
	rank    capacityRank
	allowed bool // passes request-specific filters (tried set, API key policy)
}

// quotaDrainPin keeps quota-drain routing on one credential per provider/model.
// The pin is kept while its credential stays eligible, so a transient failure
// or a request-specific exclusion never moves it. It is re-evaluated only when
// the pinned credential drops out (quota exhaustion or cooldown), when another
// credential rejoins the pool (for example after its 5h window resets), or
// when a budget window rolls over.
type quotaDrainPin struct {
	authID  string
	members map[string]time.Time
}

// validFor reports whether the pin still describes the current candidate pool.
func (p *quotaDrainPin) validFor(candidates []quotaPinCandidate) (int, bool) {
	if p == nil || p.authID == "" {
		return -1, false
	}
	pinned := -1
	for index, candidate := range candidates {
		recorded, ok := p.members[candidate.id]
		if !ok {
			return -1, false
		}
		if budgetRolledOver(recorded, candidate.rank.budgetResetAt) {
			return -1, false
		}
		if candidate.id == p.authID {
			pinned = index
		}
	}
	return pinned, pinned >= 0
}

func (p *quotaDrainPin) set(authID string, candidates []quotaPinCandidate) {
	if p == nil {
		return
	}
	p.authID = authID
	p.members = make(map[string]time.Time, len(candidates))
	for _, candidate := range candidates {
		p.members[candidate.id] = candidate.rank.budgetResetAt
	}
}

func budgetRolledOver(recorded, current time.Time) bool {
	if recorded.IsZero() != current.IsZero() {
		return true
	}
	diff := current.Sub(recorded)
	if diff < 0 {
		diff = -diff
	}
	return diff > budgetRolloverTolerance
}

// pickQuotaPinned resolves a quota-drain choice. order lists candidate indexes
// in tie-rotation order. It returns the chosen candidate index or -1.
func pickQuotaPinned(pin *quotaDrainPin, candidates []quotaPinCandidate, order []int) int {
	if len(candidates) == 0 {
		return -1
	}
	if pinned, ok := pin.validFor(candidates); ok {
		if candidates[pinned].allowed {
			return pinned
		}
		return bestQuotaCandidate(candidates, order, true)
	}
	best := bestQuotaCandidate(candidates, order, false)
	if best >= 0 && pin != nil {
		pin.set(candidates[best].id, candidates)
	}
	if best >= 0 && candidates[best].allowed {
		return best
	}
	return bestQuotaCandidate(candidates, order, true)
}

// bestQuotaCandidate returns the best-ranked candidate; ties go to the earliest
// entry in order.
func bestQuotaCandidate(candidates []quotaPinCandidate, order []int, allowedOnly bool) int {
	best := -1
	for _, index := range order {
		candidate := candidates[index]
		if allowedOnly && !candidate.allowed {
			continue
		}
		if best < 0 || quotaRankLess(candidate.rank, candidates[best].rank) {
			best = index
		}
	}
	return best
}
