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
	windows   []capacityWindowRank
}

type capacityWindowRank struct {
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
		rank.known = true
		rank.windows = append(rank.windows, capacityWindowRank{remaining: remaining, resetAt: window.ResetAt})
		if window.HardExhausted {
			rank.exhausted = true
			if resetBefore(window.ResetAt, rank.resetAt) {
				rank.resetAt = window.ResetAt
			}
		}
	}
	if !rank.known {
		return rank
	}
	sort.SliceStable(rank.windows, func(i, j int) bool {
		return capacityWindowRankLess(rank.windows[i], rank.windows[j])
	})
	rank.remaining = rank.windows[0].remaining
	if !rank.exhausted {
		rank.resetAt = rank.windows[0].resetAt
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
	commonWindows := min(len(left.windows), len(right.windows))
	for index := 0; index < commonWindows; index++ {
		if capacityWindowRanksEqual(left.windows[index], right.windows[index]) {
			continue
		}
		return capacityWindowRankLess(left.windows[index], right.windows[index])
	}
	if len(left.windows) != len(right.windows) {
		// When every shared window ties, the additional active quota window is
		// another constraint to drain and should rank ahead of an unknown one.
		return len(left.windows) > len(right.windows)
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
	if len(left.windows) != len(right.windows) {
		return false
	}
	for index := range left.windows {
		if !capacityWindowRanksEqual(left.windows[index], right.windows[index]) {
			return false
		}
	}
	return true
}

func capacityWindowRankLess(left, right capacityWindowRank) bool {
	if math.Abs(left.remaining-right.remaining) > capacityPercentEpsilon {
		return left.remaining < right.remaining
	}
	if !left.resetAt.Equal(right.resetAt) {
		return resetBefore(left.resetAt, right.resetAt)
	}
	return false
}

func capacityWindowRanksEqual(left, right capacityWindowRank) bool {
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
