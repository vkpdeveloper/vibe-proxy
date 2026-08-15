package auth

import (
	"math"
	"sort"
	"strings"
	"time"
)

const capacityPercentEpsilon = 0.0001

type capacityRank struct {
	known     bool
	exhausted bool
	remaining float64
	resetAt   time.Time
}

func normalizedCapacityPercent(value float64) float64 {
	if math.IsNaN(value) || math.IsInf(value, 0) {
		return 0
	}
	if value < 0 {
		return 0
	}
	if value > 100 {
		return 100
	}
	return value
}

func capacityScopeMatches(scopeModel, model string) bool {
	scopeModel = strings.ToLower(canonicalModelKey(scopeModel))
	if scopeModel == "" {
		return true
	}
	model = strings.ToLower(canonicalModelKey(model))
	return model != "" && scopeModel == model
}

func quotaCapacityRank(auth *Auth, model string, now time.Time) capacityRank {
	if auth == nil {
		return capacityRank{}
	}
	state := auth.Capacity
	if !state.Supported || state.FetchedAt.IsZero() {
		return capacityRank{}
	}
	if !state.StaleAt.IsZero() && !now.Before(state.StaleAt) {
		return capacityRank{}
	}

	rank := capacityRank{remaining: 100}
	for _, window := range state.Windows {
		if !window.Routing || !window.Known || !capacityScopeMatches(window.ScopeModel, model) {
			continue
		}
		if !window.ResetAt.IsZero() && !window.ResetAt.After(now) {
			continue
		}
		remaining := normalizedCapacityPercent(window.RemainingPercent)
		if !rank.known || remaining < rank.remaining-capacityPercentEpsilon ||
			(math.Abs(remaining-rank.remaining) <= capacityPercentEpsilon && resetBefore(window.ResetAt, rank.resetAt)) {
			rank.known = true
			rank.remaining = remaining
			rank.resetAt = window.ResetAt
		}
		if window.HardExhausted {
			rank.exhausted = true
			if rank.resetAt.IsZero() || window.ResetAt.Before(rank.resetAt) {
				rank.resetAt = window.ResetAt
			}
		}
	}
	return rank
}

func resetBefore(left, right time.Time) bool {
	if left.IsZero() {
		return false
	}
	return right.IsZero() || left.Before(right)
}

func quotaCapacityExhausted(auth *Auth, model string, now time.Time) bool {
	rank := quotaCapacityRank(auth, model, now)
	return rank.known && rank.exhausted
}

func quotaRankLess(left, right capacityRank) bool {
	if left.known != right.known {
		return left.known
	}
	if !left.known {
		return false
	}
	if math.Abs(left.remaining-right.remaining) > capacityPercentEpsilon {
		return left.remaining < right.remaining
	}
	if !left.resetAt.Equal(right.resetAt) {
		return resetBefore(left.resetAt, right.resetAt)
	}
	return false
}

func quotaRanksEqual(left, right capacityRank) bool {
	if left.known != right.known {
		return false
	}
	if !left.known {
		return true
	}
	return math.Abs(left.remaining-right.remaining) <= capacityPercentEpsilon && left.resetAt.Equal(right.resetAt)
}

func quotaDrainPriorities(available map[int][]*Auth) []int {
	priorities := make([]int, 0, len(available))
	for priority := range available {
		priorities = append(priorities, priority)
	}
	sort.Slice(priorities, func(i, j int) bool { return priorities[i] > priorities[j] })
	return priorities
}
