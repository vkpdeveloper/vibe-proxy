package management

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/clientpolicy"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
)

type clientAPIKeyInput struct {
	Name              string   `json:"name"`
	AllowedProviders  []string `json:"allowed_providers"`
	AllowedModels     []string `json:"allowed_models"`
	DailyLimitUSD     float64  `json:"daily_limit_usd"`
	DailyRequestLimit int64    `json:"daily_request_limit"`
	DailyTokenLimit   int64    `json:"daily_token_limit"`
	RequestsPerMinute int64    `json:"requests_per_minute"`
	Disabled          bool     `json:"disabled"`
}

type clientAPIKeyView struct {
	ID                string   `json:"id"`
	Name              string   `json:"name"`
	MaskedKey         string   `json:"masked_key"`
	AllowedProviders  []string `json:"allowed_providers"`
	AllowedModels     []string `json:"allowed_models"`
	DailyLimitUSD     float64  `json:"daily_limit_usd"`
	DailyRequestLimit int64    `json:"daily_request_limit"`
	DailyTokenLimit   int64    `json:"daily_token_limit"`
	RequestsPerMinute int64    `json:"requests_per_minute"`
	Disabled          bool     `json:"disabled"`
	Managed           bool     `json:"managed"`
	TodayUSD          float64  `json:"today_usd"`
	TodayRequests     int64    `json:"today_requests"`
	TodayTokens       int64    `json:"today_tokens"`
	MinuteRequests    int64    `json:"minute_requests"`
	RemainingUSD      *float64 `json:"remaining_usd"`
	Blocked           bool     `json:"blocked"`
	BlockReason       string   `json:"block_reason,omitempty"`
	ResetAt           string   `json:"reset_at"`
}

type clientAPIKeyModelOption struct {
	ID        string   `json:"id"`
	Providers []string `json:"providers"`
}

type clientAPIKeyOptions struct {
	Providers []string                  `json:"providers"`
	Models    []clientAPIKeyModelOption `json:"models"`
}

// GetClientAPIKeys returns safe key metadata, current UTC-day usage, and live routing options.
func (h *Handler) GetClientAPIKeys(c *gin.Context) {
	h.mu.Lock()
	keys := append([]string(nil), h.cfg.APIKeys...)
	policies := append([]config.ClientAPIKeyPolicy(nil), h.cfg.ClientAPIKeyPolicies...)
	store := h.usageStore
	h.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{
		"keys":    buildClientAPIKeyViews(keys, policies, store, time.Now()),
		"options": availableClientAPIKeyOptions(),
	})
}

// CreateClientAPIKey generates a new secret and persists its policy. The secret is returned once.
func (h *Handler) CreateClientAPIKey(c *gin.Context) {
	var input clientAPIKeyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	policy, errorText := clientAPIKeyPolicyFromInput(input)
	if errorText != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": errorText})
		return
	}
	apiKey, err := generateClientAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate API key"})
		return
	}
	policy.APIKey = apiKey
	policy.ID = clientpolicy.ClientKeyID(apiKey)

	h.mu.Lock()
	for containsString(h.cfg.APIKeys, apiKey) {
		apiKey, err = generateClientAPIKey()
		if err != nil {
			h.mu.Unlock()
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate API key"})
			return
		}
		policy.APIKey = apiKey
		policy.ID = clientpolicy.ClientKeyID(apiKey)
	}
	h.cfg.APIKeys = append(h.cfg.APIKeys, apiKey)
	h.cfg.ClientAPIKeyPolicies = append(h.cfg.ClientAPIKeyPolicies, policy)
	snapshot, ok := h.saveConfigAndSnapshotLocked(c)
	h.mu.Unlock()
	if !ok {
		return
	}
	h.reloadConfigAfterManagementSaveAsync(c.Request.Context(), snapshot)
	views := buildClientAPIKeyViews([]string{apiKey}, []config.ClientAPIKeyPolicy{policy}, h.usageStore, time.Now())
	c.JSON(http.StatusCreated, gin.H{"api_key": apiKey, "key": views[0]})
}

// UpdateClientAPIKey replaces all editable policy details for one client key.
func (h *Handler) UpdateClientAPIKey(c *gin.Context) {
	var input clientAPIKeyInput
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid body"})
		return
	}
	policy, errorText := clientAPIKeyPolicyFromInput(input)
	if errorText != "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": errorText})
		return
	}
	id := strings.TrimSpace(c.Param("id"))
	h.mu.Lock()
	apiKey, found := findClientAPIKey(h.cfg.APIKeys, h.cfg.ClientAPIKeyPolicies, id)
	if !found {
		h.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}
	policy.APIKey = apiKey
	if existing, ok := clientAPIKeyPolicyFor(h.cfg.ClientAPIKeyPolicies, apiKey); ok {
		policy.ID = existing.ID
	}
	if policy.ID == "" {
		policy.ID = clientpolicy.ClientKeyID(apiKey)
	}
	upsertClientAPIKeyPolicy(&h.cfg.ClientAPIKeyPolicies, policy)
	snapshot, ok := h.saveConfigAndSnapshotLocked(c)
	h.mu.Unlock()
	if !ok {
		return
	}
	h.reloadConfigAfterManagementSaveAsync(c.Request.Context(), snapshot)
	views := buildClientAPIKeyViews([]string{apiKey}, []config.ClientAPIKeyPolicy{policy}, h.usageStore, time.Now())
	c.JSON(http.StatusOK, gin.H{"key": views[0]})
}

// RotateClientAPIKey replaces the secret while retaining its name, restrictions, limits, and history label.
func (h *Handler) RotateClientAPIKey(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	newKey, err := generateClientAPIKey()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate API key"})
		return
	}
	h.mu.Lock()
	oldKey, found := findClientAPIKey(h.cfg.APIKeys, h.cfg.ClientAPIKeyPolicies, id)
	if !found {
		h.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}
	for index := range h.cfg.APIKeys {
		if h.cfg.APIKeys[index] == oldKey {
			h.cfg.APIKeys[index] = newKey
			break
		}
	}
	policyFound := false
	for index := range h.cfg.ClientAPIKeyPolicies {
		if h.cfg.ClientAPIKeyPolicies[index].APIKey == oldKey {
			h.cfg.ClientAPIKeyPolicies[index].APIKey = newKey
			if strings.TrimSpace(h.cfg.ClientAPIKeyPolicies[index].ID) == "" {
				h.cfg.ClientAPIKeyPolicies[index].ID = id
			}
			policyFound = true
			break
		}
	}
	if !policyFound {
		h.cfg.ClientAPIKeyPolicies = append(h.cfg.ClientAPIKeyPolicies, config.ClientAPIKeyPolicy{
			ID:     id,
			APIKey: newKey,
			Name:   "Key " + clientpolicy.MaskAPIKey(oldKey),
		})
	}
	snapshot, ok := h.saveConfigAndSnapshotLocked(c)
	h.mu.Unlock()
	if !ok {
		return
	}
	h.reloadConfigAfterManagementSaveAsync(c.Request.Context(), snapshot)
	c.JSON(http.StatusOK, gin.H{"api_key": newKey, "id": id})
}

// DeleteClientAPIKey removes both the credential and its attached policy.
func (h *Handler) DeleteClientAPIKey(c *gin.Context) {
	id := strings.TrimSpace(c.Param("id"))
	h.mu.Lock()
	apiKey, found := findClientAPIKey(h.cfg.APIKeys, h.cfg.ClientAPIKeyPolicies, id)
	if !found {
		h.mu.Unlock()
		c.JSON(http.StatusNotFound, gin.H{"error": "API key not found"})
		return
	}
	h.cfg.APIKeys = removeExactString(h.cfg.APIKeys, apiKey)
	policies := h.cfg.ClientAPIKeyPolicies[:0]
	for _, policy := range h.cfg.ClientAPIKeyPolicies {
		if strings.TrimSpace(policy.APIKey) != apiKey {
			policies = append(policies, policy)
		}
	}
	h.cfg.ClientAPIKeyPolicies = policies
	snapshot, ok := h.saveConfigAndSnapshotLocked(c)
	h.mu.Unlock()
	if !ok {
		return
	}
	h.reloadConfigAfterManagementSaveAsync(c.Request.Context(), snapshot)
	c.JSON(http.StatusOK, gin.H{"status": "ok"})
}

func clientAPIKeyPolicyFromInput(input clientAPIKeyInput) (config.ClientAPIKeyPolicy, string) {
	input.Name = strings.TrimSpace(input.Name)
	input.AllowedProviders = cleanStringList(input.AllowedProviders)
	input.AllowedModels = cleanStringList(input.AllowedModels)
	if input.Name == "" {
		return config.ClientAPIKeyPolicy{}, "name is required"
	}
	if len(input.AllowedProviders) == 0 {
		return config.ClientAPIKeyPolicy{}, "select at least one provider"
	}
	if input.DailyLimitUSD < 0 || input.DailyRequestLimit < 0 || input.DailyTokenLimit < 0 || input.RequestsPerMinute < 0 {
		return config.ClientAPIKeyPolicy{}, "limits cannot be negative"
	}
	return config.ClientAPIKeyPolicy{
		Name:              input.Name,
		AllowedProviders:  input.AllowedProviders,
		AllowedModels:     input.AllowedModels,
		DailyLimitUSD:     input.DailyLimitUSD,
		DailyRequestLimit: input.DailyRequestLimit,
		DailyTokenLimit:   input.DailyTokenLimit,
		RequestsPerMinute: input.RequestsPerMinute,
		Disabled:          input.Disabled,
	}, ""
}

func buildClientAPIKeyViews(keys []string, policies []config.ClientAPIKeyPolicy, store clientpolicy.UsageReader, now time.Time) []clientAPIKeyView {
	manager := clientpolicy.NewManager(store)
	manager.Update(keys, policies)
	dayStart := now.UTC().Truncate(24 * time.Hour)
	minuteStart := now.Add(-time.Minute)
	resetAt := dayStart.Add(24 * time.Hour)
	policyByKey := make(map[string]config.ClientAPIKeyPolicy, len(policies))
	for _, policy := range policies {
		policyByKey[strings.TrimSpace(policy.APIKey)] = policy
	}
	views := make([]clientAPIKeyView, 0, len(keys))
	for _, apiKey := range keys {
		apiKey = strings.TrimSpace(apiKey)
		if apiKey == "" {
			continue
		}
		policy, managed := policyByKey[apiKey]
		clientKeyID := strings.TrimSpace(policy.ID)
		if clientKeyID == "" {
			clientKeyID = clientpolicy.ClientKeyID(apiKey)
		}
		decision := manager.Evaluate(apiKey, now)
		usage := decision.Usage
		if !managed && store != nil {
			usage = store.ClientUsage(clientKeyID, dayStart, minuteStart, now)
		}
		view := clientAPIKeyView{
			ID:                clientKeyID,
			Name:              clientpolicy.DisplayName(policy, apiKey),
			MaskedKey:         clientpolicy.MaskAPIKey(apiKey),
			AllowedProviders:  append([]string{}, policy.AllowedProviders...),
			AllowedModels:     append([]string{}, policy.AllowedModels...),
			DailyLimitUSD:     policy.DailyLimitUSD,
			DailyRequestLimit: policy.DailyRequestLimit,
			DailyTokenLimit:   policy.DailyTokenLimit,
			RequestsPerMinute: policy.RequestsPerMinute,
			Disabled:          policy.Disabled,
			Managed:           managed,
			TodayUSD:          usage.DailyUSD,
			TodayRequests:     usage.DailyRequests,
			TodayTokens:       usage.DailyTokens,
			MinuteRequests:    usage.MinuteRequests,
			Blocked:           decision.Denied,
			BlockReason:       decision.DenialCode,
			ResetAt:           resetAt.Format(time.RFC3339),
		}
		if policy.DailyLimitUSD > 0 {
			remaining := max(0, policy.DailyLimitUSD-usage.DailyUSD)
			view.RemainingUSD = &remaining
		}
		views = append(views, view)
	}
	return views
}

func availableClientAPIKeyOptions() clientAPIKeyOptions {
	modelRegistry := registry.GetGlobalRegistry()
	modelProviders := make(map[string]map[string]struct{})
	for _, protocol := range []string{"openai", "claude", "gemini"} {
		for _, model := range modelRegistry.GetAvailableModels(protocol) {
			id, _ := model["id"].(string)
			if id == "" {
				id, _ = model["name"].(string)
			}
			id = strings.TrimPrefix(strings.TrimSpace(id), "models/")
			if id == "" {
				continue
			}
			if modelProviders[id] == nil {
				modelProviders[id] = make(map[string]struct{})
			}
			for _, provider := range modelRegistry.GetModelProviders(id) {
				modelProviders[id][provider] = struct{}{}
			}
		}
	}
	providerSet := make(map[string]struct{})
	options := make([]clientAPIKeyModelOption, 0, len(modelProviders))
	for id, values := range modelProviders {
		providers := make([]string, 0, len(values))
		for provider := range values {
			providers = append(providers, provider)
			providerSet[provider] = struct{}{}
		}
		sort.Strings(providers)
		options = append(options, clientAPIKeyModelOption{ID: id, Providers: providers})
	}
	sort.Slice(options, func(i, j int) bool { return options[i].ID < options[j].ID })
	providers := make([]string, 0, len(providerSet))
	for provider := range providerSet {
		providers = append(providers, provider)
	}
	sort.Strings(providers)
	return clientAPIKeyOptions{Providers: providers, Models: options}
}

func generateClientAPIKey() (string, error) {
	raw := make([]byte, 24)
	if _, err := rand.Read(raw); err != nil {
		return "", err
	}
	return "vp_" + base64.RawURLEncoding.EncodeToString(raw), nil
}

func findClientAPIKey(keys []string, policies []config.ClientAPIKeyPolicy, id string) (string, bool) {
	for _, policy := range policies {
		if strings.TrimSpace(policy.ID) == id && containsString(keys, strings.TrimSpace(policy.APIKey)) {
			return strings.TrimSpace(policy.APIKey), true
		}
	}
	for _, key := range keys {
		key = strings.TrimSpace(key)
		if key != "" && clientpolicy.ClientKeyID(key) == id {
			return key, true
		}
	}
	return "", false
}

func clientAPIKeyPolicyFor(policies []config.ClientAPIKeyPolicy, apiKey string) (config.ClientAPIKeyPolicy, bool) {
	for _, policy := range policies {
		if strings.TrimSpace(policy.APIKey) == apiKey {
			return policy, true
		}
	}
	return config.ClientAPIKeyPolicy{}, false
}

func upsertClientAPIKeyPolicy(policies *[]config.ClientAPIKeyPolicy, policy config.ClientAPIKeyPolicy) {
	for index := range *policies {
		if strings.TrimSpace((*policies)[index].APIKey) == policy.APIKey {
			(*policies)[index] = policy
			return
		}
	}
	*policies = append(*policies, policy)
}

func cleanStringList(values []string) []string {
	seen := make(map[string]struct{}, len(values))
	clean := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		key := strings.ToLower(value)
		if value == "" {
			continue
		}
		if _, exists := seen[key]; exists {
			continue
		}
		seen[key] = struct{}{}
		clean = append(clean, value)
	}
	sort.Strings(clean)
	return clean
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func removeExactString(values []string, remove string) []string {
	out := values[:0]
	for _, value := range values {
		if value != remove {
			out = append(out, value)
		}
	}
	return out
}
