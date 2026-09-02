// Package clientpolicy enforces routing and usage policies for client-facing API keys.
package clientpolicy

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

type contextKey struct{}

// GinDecisionKey is the carrier key used when an execution context retains a Gin context
// instead of directly inheriting the HTTP request context.
const GinDecisionKey = "clientAPIKeyPolicyDecision"

// UsageSnapshot contains ledger totals used to enforce a client key policy.
type UsageSnapshot struct {
	DailyUSD       float64
	DailyRequests  int64
	DailyTokens    int64
	MinuteRequests int64
}

// UsageReader supplies persisted client-key usage to the policy manager.
type UsageReader interface {
	ClientUsage(clientKeyID string, dayStart, minuteStart, now time.Time) UsageSnapshot
}

// Decision is the immutable policy attached to one authenticated request.
type Decision struct {
	ClientKeyID       string
	Name              string
	AllowedProviders  []string
	AllowedModels     []string
	DailyLimitUSD     float64
	DailyRequestLimit int64
	DailyTokenLimit   int64
	RequestsPerMinute int64
	Usage             UsageSnapshot
	ResetAt           time.Time
	RetryAt           time.Time
	Denied            bool
	DenialCode        string
	DenialMessage     string
	Managed           bool
}

// Manager owns a hot-reloadable policy snapshot.
type Manager struct {
	mu       sync.RWMutex
	policies map[string]config.ClientAPIKeyPolicy
	usage    UsageReader
}

func NewManager(usage UsageReader) *Manager {
	return &Manager{usage: usage, policies: make(map[string]config.ClientAPIKeyPolicy)}
}

// Update replaces the active policies, ignoring orphaned policies whose keys are no longer valid.
func (m *Manager) Update(keys []string, policies []config.ClientAPIKeyPolicy) {
	if m == nil {
		return
	}
	valid := make(map[string]struct{}, len(keys))
	for _, key := range keys {
		if key = strings.TrimSpace(key); key != "" {
			valid[key] = struct{}{}
		}
	}
	next := make(map[string]config.ClientAPIKeyPolicy, len(policies))
	for _, policy := range policies {
		key := strings.TrimSpace(policy.APIKey)
		if _, ok := valid[key]; !ok || key == "" {
			continue
		}
		policy.APIKey = key
		policy.ID = strings.TrimSpace(policy.ID)
		policy.Name = strings.TrimSpace(policy.Name)
		policy.AllowedProviders = normalizeList(policy.AllowedProviders)
		policy.AllowedModels = normalizeList(policy.AllowedModels)
		if policy.DailyLimitUSD < 0 {
			policy.DailyLimitUSD = 0
		}
		if policy.DailyRequestLimit < 0 {
			policy.DailyRequestLimit = 0
		}
		if policy.DailyTokenLimit < 0 {
			policy.DailyTokenLimit = 0
		}
		if policy.RequestsPerMinute < 0 {
			policy.RequestsPerMinute = 0
		}
		next[key] = policy
	}
	m.mu.Lock()
	m.policies = next
	m.mu.Unlock()
}

// Evaluate resolves limits for a client key at the supplied time.
func (m *Manager) Evaluate(apiKey string, now time.Time) Decision {
	apiKey = strings.TrimSpace(apiKey)
	decision := Decision{ClientKeyID: ClientKeyID(apiKey)}
	if m == nil || apiKey == "" {
		return decision
	}
	m.mu.RLock()
	policy, ok := m.policies[apiKey]
	m.mu.RUnlock()
	if !ok {
		return decision
	}
	if stableID := strings.TrimSpace(policy.ID); stableID != "" {
		decision.ClientKeyID = stableID
	}
	if now.IsZero() {
		now = time.Now()
	}
	dayStart := now.UTC().Truncate(24 * time.Hour)
	resetAt := dayStart.Add(24 * time.Hour)
	minuteStart := now.Add(-time.Minute)
	usage := UsageSnapshot{}
	if m.usage != nil {
		usage = m.usage.ClientUsage(decision.ClientKeyID, dayStart, minuteStart, now)
	}
	decision = Decision{
		ClientKeyID:       decision.ClientKeyID,
		Name:              policy.Name,
		AllowedProviders:  append([]string(nil), policy.AllowedProviders...),
		AllowedModels:     append([]string(nil), policy.AllowedModels...),
		DailyLimitUSD:     policy.DailyLimitUSD,
		DailyRequestLimit: policy.DailyRequestLimit,
		DailyTokenLimit:   policy.DailyTokenLimit,
		RequestsPerMinute: policy.RequestsPerMinute,
		Usage:             usage,
		ResetAt:           resetAt,
		Managed:           true,
	}
	switch {
	case policy.Disabled:
		decision.Denied = true
		decision.DenialCode = "api_key_disabled"
		decision.DenialMessage = "this API key is disabled"
	case policy.DailyLimitUSD > 0 && usage.DailyUSD+1e-12 >= policy.DailyLimitUSD:
		decision.Denied = true
		decision.DenialCode = "daily_usd_limit_exceeded"
		decision.DenialMessage = fmt.Sprintf("daily USD limit of %.6g has been reached", policy.DailyLimitUSD)
		decision.RetryAt = resetAt
	case policy.DailyRequestLimit > 0 && usage.DailyRequests >= policy.DailyRequestLimit:
		decision.Denied = true
		decision.DenialCode = "daily_request_limit_exceeded"
		decision.DenialMessage = fmt.Sprintf("daily request limit of %d has been reached", policy.DailyRequestLimit)
		decision.RetryAt = resetAt
	case policy.DailyTokenLimit > 0 && usage.DailyTokens >= policy.DailyTokenLimit:
		decision.Denied = true
		decision.DenialCode = "daily_token_limit_exceeded"
		decision.DenialMessage = fmt.Sprintf("daily token limit of %d has been reached", policy.DailyTokenLimit)
		decision.RetryAt = resetAt
	case policy.RequestsPerMinute > 0 && usage.MinuteRequests >= policy.RequestsPerMinute:
		decision.Denied = true
		decision.DenialCode = "rate_limit_exceeded"
		decision.DenialMessage = fmt.Sprintf("rate limit of %d requests per minute has been reached", policy.RequestsPerMinute)
		decision.RetryAt = now.Add(time.Minute)
	}
	return decision
}

func WithDecision(ctx context.Context, decision Decision) context.Context {
	if ctx == nil {
		ctx = context.Background()
	}
	return context.WithValue(ctx, contextKey{}, decision)
}

func FromContext(ctx context.Context) (Decision, bool) {
	if ctx == nil {
		return Decision{}, false
	}
	if decision, ok := ctx.Value(contextKey{}).(Decision); ok {
		return decision, true
	}
	carrier, ok := ctx.Value("gin").(interface {
		Get(string) (any, bool)
	})
	if !ok || carrier == nil {
		return Decision{}, false
	}
	decision, ok := carrier.Get(GinDecisionKey)
	if !ok {
		return Decision{}, false
	}
	value, ok := decision.(Decision)
	return value, ok
}

// RestrictExecution validates the requested model and removes disallowed providers.
func RestrictExecution(ctx context.Context, providers []string, requestedModel, normalizedModel string) ([]string, string, bool) {
	decision, ok := FromContext(ctx)
	if !ok || !decision.Managed {
		return providers, "", true
	}
	if len(decision.AllowedModels) > 0 && !containsModel(decision.AllowedModels, requestedModel, normalizedModel) {
		return nil, "model_not_allowed", false
	}
	if len(decision.AllowedProviders) == 0 {
		return providers, "", true
	}
	allowed := make(map[string]struct{}, len(decision.AllowedProviders))
	for _, provider := range decision.AllowedProviders {
		allowed[canonical(provider)] = struct{}{}
	}
	filtered := make([]string, 0, len(providers))
	for _, provider := range providers {
		if _, exists := allowed[canonical(provider)]; exists {
			filtered = append(filtered, provider)
		}
	}
	if len(filtered) == 0 {
		return nil, "provider_not_allowed", false
	}
	return filtered, "", true
}

func ModelAllowed(ctx context.Context, model string, providers []string) bool {
	decision, ok := FromContext(ctx)
	if !ok || !decision.Managed {
		return true
	}
	if len(decision.AllowedModels) > 0 && !containsModel(decision.AllowedModels, model, model) {
		return false
	}
	if len(decision.AllowedProviders) == 0 || len(providers) == 0 {
		return true
	}
	for _, provider := range providers {
		for _, allowed := range decision.AllowedProviders {
			if canonical(provider) == canonical(allowed) {
				return true
			}
		}
	}
	return false
}

func ClientKeyID(apiKey string) string {
	if apiKey = strings.TrimSpace(apiKey); apiKey == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(apiKey))
	return hex.EncodeToString(sum[:8])
}

func MaskAPIKey(apiKey string) string {
	apiKey = strings.TrimSpace(apiKey)
	if len(apiKey) <= 8 {
		return "••••••••"
	}
	return apiKey[:3] + "••••••••" + apiKey[len(apiKey)-4:]
}

func DisplayName(policy config.ClientAPIKeyPolicy, apiKey string) string {
	if name := strings.TrimSpace(policy.Name); name != "" {
		return name
	}
	return "Key " + MaskAPIKey(apiKey)
}

func normalizeList(values []string) []string {
	seen := make(map[string]string, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		key := canonical(value)
		if _, exists := seen[key]; !exists {
			seen[key] = value
		}
	}
	keys := make([]string, 0, len(seen))
	for key := range seen {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	out := make([]string, 0, len(keys))
	for _, key := range keys {
		out = append(out, seen[key])
	}
	return out
}

func containsModel(allowed []string, candidates ...string) bool {
	for _, item := range allowed {
		want := canonicalModel(item)
		for _, candidate := range candidates {
			if want != "" && want == canonicalModel(candidate) {
				return true
			}
		}
	}
	return false
}

func canonical(value string) string {
	return strings.ToLower(strings.TrimSpace(value))
}

func canonicalModel(value string) string {
	value = canonical(value)
	value = strings.TrimPrefix(value, "models/")
	if open := strings.LastIndex(value, "("); open > 0 && strings.HasSuffix(value, ")") {
		value = strings.TrimSpace(value[:open])
	}
	return value
}
