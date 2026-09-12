package quotadrain

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	"github.com/router-for-me/CLIProxyAPI/v7/sdk/proxyutil"
	log "github.com/sirupsen/logrus"
)

const maxQuotaResponseBytes = 2 << 20

var antigravityQuotaURLs = []string{
	"https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
	"https://daily-cloudcode-pa.sandbox.googleapis.com/v1internal:retrieveUserQuotaSummary",
	"https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary",
}

func fetchProviderCapacity(ctx context.Context, manager *coreauth.Manager, auth *coreauth.Auth, provider string, now time.Time) ([]coreauth.CapacityWindow, error) {
	switch provider {
	case "claude":
		payload, err := requestJSON(ctx, manager, auth, http.MethodGet, "https://api.anthropic.com/api/oauth/usage", nil, http.Header{
			"Content-Type":   []string{"application/json"},
			"anthropic-beta": []string{"oauth-2025-04-20"},
		})
		if err != nil {
			return nil, err
		}
		return parseClaudeCapacity(payload, now)
	case "codex":
		headers := http.Header{
			"Content-Type": []string{"application/json"},
			"User-Agent":   []string{"codex_cli_rs/0.76.0 (Debian 13.0.0; x86_64) WindowsTerminal"},
		}
		if accountID := codexAccountID(auth); accountID != "" {
			headers.Set("Chatgpt-Account-Id", accountID)
		}
		payload, err := requestJSON(ctx, manager, auth, http.MethodGet, "https://chatgpt.com/backend-api/wham/usage", nil, headers)
		if err != nil {
			return nil, err
		}
		return parseCodexCapacity(payload, now)
	case "cursor":
		return fetchCursorCapacity(ctx, auth, now)
	case "kimi":
		payload, err := requestJSON(ctx, manager, auth, http.MethodGet, "https://api.kimi.com/coding/v1/usages", nil, nil)
		if err != nil {
			return nil, err
		}
		return parseKimiCapacity(payload, now)
	case "opencode-go":
		payload, err := requestBearerJSON(ctx, auth, http.MethodGet, "https://opencode.ai/zen/go/v1/usage", nil, http.Header{
			"Accept": []string{"application/json"},
		})
		if err != nil {
			return nil, err
		}
		return parseOpenCodeGoCapacity(payload, now)
	case "xai":
		return fetchXAICapacity(ctx, manager, auth, now)
	case "antigravity":
		return fetchAntigravityCapacity(ctx, manager, auth, now)
	default:
		return nil, fmt.Errorf("unsupported quota provider %q", provider)
	}
}

const cursorDashboardAPIBase = "https://api2.cursor.sh/aiserver.v1.DashboardService"

func requestBearerJSON(ctx context.Context, auth *coreauth.Auth, method, target string, body []byte, headers http.Header) (map[string]any, error) {
	token := authString(auth, "access_token", "accessToken", "token", "api_key", "api-key")
	if token == "" {
		return nil, fmt.Errorf("quota access token is missing")
	}
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return nil, fmt.Errorf("build quota request: %w", err)
	}
	if headers != nil {
		req.Header = headers.Clone()
	}
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 60 * time.Second}
	if proxyURL := strings.TrimSpace(auth.ProxyURL); proxyURL != "" {
		transport, _, errBuild := proxyutil.BuildHTTPTransport(proxyURL)
		if errBuild != nil {
			return nil, fmt.Errorf("build quota proxy: %w", errBuild)
		}
		client.Transport = transport
	}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("quota request failed: %w", err)
	}
	defer func() {
		if errClose := resp.Body.Close(); errClose != nil {
			log.Debugf("quota-drain: close response body: %v", errClose)
		}
	}()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxQuotaResponseBytes))
		return nil, fmt.Errorf("quota endpoint returned HTTP %d", resp.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxQuotaResponseBytes))
	decoder.UseNumber()
	var payload map[string]any
	if errDecode := decoder.Decode(&payload); errDecode != nil {
		return nil, fmt.Errorf("decode quota response: %w", errDecode)
	}
	if payload == nil {
		return nil, fmt.Errorf("quota response was empty")
	}
	return payload, nil
}

func fetchCursorCapacity(ctx context.Context, auth *coreauth.Auth, now time.Time) ([]coreauth.CapacityWindow, error) {
	headers := http.Header{
		"Content-Type":             []string{"application/json"},
		"Accept":                   []string{"application/json"},
		"Connect-Protocol-Version": []string{"1"},
	}
	windows := make([]coreauth.CapacityWindow, 0, 3)
	var lastErr error

	period, err := requestBearerJSON(ctx, auth, http.MethodPost, cursorDashboardAPIBase+"/GetCurrentPeriodUsage", []byte("{}"), headers)
	if err != nil {
		lastErr = err
	} else {
		windows = append(windows, parseCursorPeriodCapacity(period, now)...)
	}

	sand, err := requestBearerJSON(ctx, auth, http.MethodPost, cursorDashboardAPIBase+"/GetSandUsageStatus", []byte("{}"), headers)
	if err != nil {
		lastErr = err
	} else {
		windows = append(windows, parseCursorSandCapacity(sand, now)...)
	}

	if len(windows) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return requireWindows(windows)
}

func parseCursorPeriodCapacity(payload map[string]any, now time.Time) []coreauth.CapacityWindow {
	usage := objectValue(value(payload, "planUsage", "plan_usage"))
	resetAt := parseAbsoluteTime(value(payload, "billingCycleEnd", "billing_cycle_end"), now)
	windows := make([]coreauth.CapacityWindow, 0, 2)
	appendPercent := func(id, label string, raw any) {
		used, known := numberValue(raw)
		if !known {
			return
		}
		// Cursor tracker credentials are display-only and are never selected for
		// model execution, so their allowance windows must not affect routing.
		windows = append(windows, capacityWindow(id, label, used, resetAt, false, "", used >= 100))
	}
	appendPercent("cursor-models", "Cursor Models", value(usage, "autoPercentUsed", "auto_percent_used"))
	appendPercent("other-models", "Other Models", value(usage, "apiPercentUsed", "api_percent_used"))
	if len(windows) == 0 {
		appendPercent("cursor-included", "Overall included usage", value(usage, "totalPercentUsed", "total_percent_used"))
	}
	return windows
}

func parseCursorSandCapacity(payload map[string]any, now time.Time) []coreauth.CapacityWindow {
	if boolValue(value(payload, "usesPooledEnterpriseAllowance", "uses_pooled_enterprise_allowance")) {
		return nil
	}
	used, known := numberValue(value(payload, "usagePercent", "usage_percent"))
	if !known {
		return nil
	}
	resetAt := parseAbsoluteTime(value(payload, "nextResetTimestampUtc", "next_reset_timestamp_utc"), now)
	return []coreauth.CapacityWindow{
		capacityWindow("cursor-grok-bot", "Grok Bot · Weekly usage", used, resetAt, false, "", used >= 100),
	}
}

func parseOpenCodeGoCapacity(payload map[string]any, now time.Time) ([]coreauth.CapacityWindow, error) {
	usage := objectValue(value(payload, "usage"))
	specs := []struct {
		key   string
		label string
	}{
		{key: "rolling", label: "5-hour usage"},
		{key: "weekly", label: "Weekly usage"},
		{key: "monthly", label: "Monthly usage"},
	}
	windows := make([]coreauth.CapacityWindow, 0, len(specs))
	for _, spec := range specs {
		window := objectValue(value(usage, spec.key))
		used, known := numberValue(value(window, "percent"))
		if !known {
			continue
		}
		resetAt := parseAbsoluteTime(value(window, "resetsAt", "resets_at"), now)
		rateLimited := strings.EqualFold(stringValue(value(window, "status")), "rate-limited")
		windows = append(windows, capacityWindow("opencode-go-"+spec.key, spec.label, used, resetAt, false, "", rateLimited || used >= 100))
	}
	return requireWindows(windows)
}

func requestJSON(ctx context.Context, manager *coreauth.Manager, auth *coreauth.Auth, method, target string, body []byte, headers http.Header) (map[string]any, error) {
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequestWithContext(ctx, method, target, reader)
	if err != nil {
		return nil, fmt.Errorf("build quota request: %w", err)
	}
	if headers != nil {
		req.Header = headers.Clone()
	}
	resp, err := manager.HttpRequest(ctx, auth, req)
	if err != nil {
		return nil, fmt.Errorf("quota request failed: %w", err)
	}
	defer func() {
		if errClose := resp.Body.Close(); errClose != nil {
			log.Debugf("quota-drain: close response body: %v", errClose)
		}
	}()
	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, maxQuotaResponseBytes))
		return nil, fmt.Errorf("quota endpoint returned HTTP %d", resp.StatusCode)
	}
	decoder := json.NewDecoder(io.LimitReader(resp.Body, maxQuotaResponseBytes))
	decoder.UseNumber()
	var payload map[string]any
	if errDecode := decoder.Decode(&payload); errDecode != nil {
		return nil, fmt.Errorf("decode quota response: %w", errDecode)
	}
	if payload == nil {
		return nil, fmt.Errorf("quota response was empty")
	}
	return payload, nil
}

func parseClaudeCapacity(payload map[string]any, now time.Time) ([]coreauth.CapacityWindow, error) {
	windows := make([]coreauth.CapacityWindow, 0)
	limits := arrayValue(value(payload, "limits"))
	for index, raw := range limits {
		limit := objectValue(raw)
		used, known := numberValue(value(limit, "percent", "utilization"))
		if !known {
			continue
		}
		kind := strings.ToLower(stringValue(value(limit, "kind")))
		group := strings.ToLower(stringValue(value(limit, "group")))
		scope := objectValue(value(limit, "scope"))
		scopeModel := stringValue(value(objectValue(value(scope, "model")), "id"))
		label := kind
		if label == "" {
			label = group
		}
		if display := stringValue(value(objectValue(value(scope, "model")), "display_name", "displayName")); display != "" {
			label = strings.TrimSpace(label + " · " + display)
		}
		routing := kind == "session" || kind == "weekly_all" || (kind == "weekly_scoped" && scopeModel != "")
		windows = append(windows, capacityWindow(fmt.Sprintf("claude-limit-%d", index), label, used, parseAbsoluteTime(value(limit, "resets_at", "resetsAt"), now), routing, scopeModel, used >= 100))
	}
	if len(windows) == 0 {
		legacy := []struct {
			key     string
			label   string
			routing bool
		}{
			{"five_hour", "5 hour", true},
			{"seven_day", "7 day", true},
			{"seven_day_oauth_apps", "7 day OAuth apps", false},
			{"seven_day_opus", "7 day Opus", false},
			{"seven_day_sonnet", "7 day Sonnet", false},
			{"seven_day_cowork", "7 day Cowork", false},
		}
		for _, item := range legacy {
			window := objectValue(value(payload, item.key))
			used, known := numberValue(value(window, "utilization"))
			if !known {
				continue
			}
			windows = append(windows, capacityWindow("claude-"+item.key, item.label, used, parseAbsoluteTime(value(window, "resets_at", "resetsAt"), now), item.routing, "", used >= 100))
		}
	}
	return requireWindows(windows)
}

func parseCodexCapacity(payload map[string]any, now time.Time) ([]coreauth.CapacityWindow, error) {
	windows := make([]coreauth.CapacityWindow, 0)
	appendRateInfo := func(prefix, label string, info map[string]any, routing bool) {
		if len(info) == 0 {
			return
		}
		reached := boolValue(value(info, "limit_reached", "limitReached")) || explicitlyFalse(value(info, "allowed"))
		for _, spec := range []struct {
			key   string
			camel string
			name  string
		}{{"primary_window", "primaryWindow", "primary"}, {"secondary_window", "secondaryWindow", "secondary"}} {
			window := objectValue(value(info, spec.key, spec.camel))
			if len(window) == 0 {
				continue
			}
			used, known := numberValue(value(window, "used_percent", "usedPercent"))
			if !known && reached {
				used, known = 100, true
			}
			if !known {
				continue
			}
			resetAt := windowResetAt(window, now)
			windows = append(windows, capacityWindow(prefix+"-"+spec.name, label+" "+spec.name, used, resetAt, routing, "", reached || used >= 100))
		}
	}
	appendRateInfo("codex", "Codex", objectValue(value(payload, "rate_limit", "rateLimit")), true)
	appendRateInfo("codex-review", "Code review", objectValue(value(payload, "code_review_rate_limit", "codeReviewRateLimit")), false)
	for index, raw := range arrayValue(value(payload, "additional_rate_limits", "additionalRateLimits")) {
		item := objectValue(raw)
		label := stringValue(value(item, "limit_name", "limitName", "metered_feature", "meteredFeature"))
		if label == "" {
			label = fmt.Sprintf("Additional %d", index+1)
		}
		appendRateInfo(fmt.Sprintf("codex-additional-%d", index), label, objectValue(value(item, "rate_limit", "rateLimit")), false)
	}
	return requireWindows(windows)
}

func parseKimiCapacity(payload map[string]any, now time.Time) ([]coreauth.CapacityWindow, error) {
	windows := make([]coreauth.CapacityWindow, 0)
	appendUsage := func(id, label, scope string, raw map[string]any, routing bool) {
		limit, hasLimit := numberValue(value(raw, "limit"))
		used, hasUsed := numberValue(value(raw, "used"))
		remaining, hasRemaining := numberValue(value(raw, "remaining"))
		if !hasUsed && hasLimit && hasRemaining {
			used, hasUsed = limit-remaining, true
		}
		if !hasLimit || limit <= 0 || !hasUsed {
			return
		}
		usedPercent := used / limit * 100
		hard := hasRemaining && remaining <= 0
		windows = append(windows, capacityWindow(id, label, usedPercent, windowResetAt(raw, now), routing, scope, hard || usedPercent >= 100))
	}
	appendUsage("kimi-summary", "Weekly usage", "", objectValue(value(payload, "usage")), true)
	for index, raw := range arrayValue(value(payload, "limits")) {
		item := objectValue(raw)
		detail := objectValue(value(item, "detail"))
		if len(detail) == 0 {
			detail = item
		}
		scope := stringValue(value(item, "scope"))
		label := stringValue(value(item, "name", "title"))
		if label == "" {
			label = fmt.Sprintf("Limit %d", index+1)
		}
		appendUsage(fmt.Sprintf("kimi-limit-%d", index), label, scope, detail, true)
	}
	return requireWindows(windows)
}

func fetchXAICapacity(ctx context.Context, manager *coreauth.Manager, auth *coreauth.Auth, now time.Time) ([]coreauth.CapacityWindow, error) {
	headers := http.Header{
		"x-xai-token-auth":      []string{"xai-grok-cli"},
		"x-grok-client-version": []string{"0.2.91"},
		"Accept":                []string{"*/*"},
		"User-Agent":            []string{"grok-pager/0.2.91 grok-shell/0.2.91 (macos; aarch64)"},
	}
	if userID := xaiUserID(auth); userID != "" {
		headers.Set("x-userid", userID)
	}
	urls := []struct {
		id    string
		label string
		url   string
	}{{"xai-weekly", "Weekly credits", "https://cli-chat-proxy.grok.com/v1/billing?format=credits"}, {"xai-monthly", "Monthly credits", "https://cli-chat-proxy.grok.com/v1/billing"}}
	windows := make([]coreauth.CapacityWindow, 0, 2)
	var lastErr error
	for _, target := range urls {
		payload, err := requestJSON(ctx, manager, auth, http.MethodGet, target.url, nil, headers)
		if err != nil {
			lastErr = err
			continue
		}
		windows = append(windows, parseXAICapacity(payload, target.id, target.label, now)...)
	}
	if len(windows) == 0 && lastErr != nil {
		return nil, lastErr
	}
	return requireWindows(windows)
}

func parseXAICapacity(payload map[string]any, id, label string, now time.Time) []coreauth.CapacityWindow {
	config := objectValue(value(payload, "config"))
	if len(config) == 0 {
		return nil
	}
	used, known := numberValue(value(config, "creditUsagePercent", "credit_usage_percent"))
	if !known {
		limit, hasLimit := nestedNumber(value(config, "monthlyLimit", "monthly_limit"))
		spent, hasSpent := nestedNumber(value(config, "used"))
		if hasLimit && limit > 0 && hasSpent {
			used, known = spent/limit*100, true
		}
	}
	period := objectValue(value(config, "currentPeriod", "current_period"))
	resetAt := parseAbsoluteTime(value(period, "end"), now)
	if resetAt.IsZero() {
		resetAt = parseAbsoluteTime(value(config, "billingPeriodEnd", "billing_period_end"), now)
	}
	if known {
		return []coreauth.CapacityWindow{capacityWindow(id, label, used, resetAt, true, "", used >= 100)}
	}
	// Paid xAI accounts can return a real billing period while intentionally
	// omitting a percentage/limit. Preserve that successful reading as an
	// unknown, display-only window instead of turning it into a refresh error.
	if resetAt.IsZero() {
		return nil
	}
	return []coreauth.CapacityWindow{{
		ID:      id,
		Label:   label,
		ResetAt: resetAt,
		Known:   false,
		Routing: false,
	}}
}

func fetchAntigravityCapacity(ctx context.Context, manager *coreauth.Manager, auth *coreauth.Auth, now time.Time) ([]coreauth.CapacityWindow, error) {
	projectID := authString(auth, "project_id", "projectId", "gemini_virtual_project")
	if projectID == "" {
		return nil, fmt.Errorf("quota project id is missing")
	}
	body, _ := json.Marshal(map[string]string{"project": projectID})
	var payload map[string]any
	var lastErr error
	for _, target := range antigravityQuotaURLs {
		payload, lastErr = requestJSON(ctx, manager, auth, http.MethodPost, target, body, http.Header{"Content-Type": []string{"application/json"}})
		if lastErr == nil {
			break
		}
	}
	if lastErr != nil {
		return nil, lastErr
	}
	groups := arrayValue(value(payload, "groups"))
	windows := make([]coreauth.CapacityWindow, 0)
	global := len(groups) == 1
	for groupIndex, rawGroup := range groups {
		group := objectValue(rawGroup)
		groupLabel := stringValue(value(group, "displayName", "display_name"))
		for bucketIndex, rawBucket := range arrayValue(value(group, "buckets")) {
			bucket := objectValue(rawBucket)
			remaining, known := numberValue(value(bucket, "remainingFraction", "remaining_fraction"))
			if !known {
				continue
			}
			if remaining <= 1 {
				remaining *= 100
			}
			label := stringValue(value(bucket, "displayName", "display_name", "window"))
			if label == "" {
				label = groupLabel
			}
			resetAt := parseAbsoluteTime(value(bucket, "resetTime", "reset_time"), now)
			windows = append(windows, capacityWindow(fmt.Sprintf("antigravity-%d-%d", groupIndex, bucketIndex), label, 100-remaining, resetAt, global, "", remaining <= 0))
		}
	}
	return requireWindows(windows)
}

func capacityWindow(id, label string, used float64, resetAt time.Time, routing bool, scope string, exhausted bool) coreauth.CapacityWindow {
	if label == "" {
		label = id
	}
	if used < 0 {
		used = 0
	}
	if used > 100 {
		used = 100
	}
	return coreauth.CapacityWindow{
		ID:               id,
		Label:            label,
		ScopeModel:       scope,
		UsedPercent:      used,
		RemainingPercent: 100 - used,
		ResetAt:          resetAt,
		Known:            true,
		HardExhausted:    exhausted,
		Routing:          routing,
	}
}

func requireWindows(windows []coreauth.CapacityWindow) ([]coreauth.CapacityWindow, error) {
	if len(windows) == 0 {
		return nil, fmt.Errorf("quota response had no usable windows")
	}
	return windows, nil
}

func objectValue(value any) map[string]any {
	if typed, ok := value.(map[string]any); ok {
		return typed
	}
	return nil
}

func arrayValue(value any) []any {
	if typed, ok := value.([]any); ok {
		return typed
	}
	return nil
}

func value(object map[string]any, keys ...string) any {
	for _, key := range keys {
		if object != nil {
			if found, ok := object[key]; ok {
				return found
			}
		}
	}
	return nil
}

func stringValue(value any) string {
	switch typed := value.(type) {
	case string:
		return strings.TrimSpace(typed)
	case json.Number:
		return typed.String()
	case float64:
		return strconv.FormatFloat(typed, 'f', -1, 64)
	default:
		return ""
	}
}

func numberValue(value any) (float64, bool) {
	normalize := func(number float64, ok bool) (float64, bool) {
		if !ok || math.IsNaN(number) || math.IsInf(number, 0) {
			return 0, false
		}
		return number, true
	}
	switch typed := value.(type) {
	case json.Number:
		parsed, err := typed.Float64()
		return normalize(parsed, err == nil)
	case float64:
		return normalize(typed, true)
	case float32:
		return normalize(float64(typed), true)
	case int:
		return float64(typed), true
	case int64:
		return float64(typed), true
	case string:
		trimmed := strings.TrimSpace(strings.TrimSuffix(typed, "%"))
		parsed, err := strconv.ParseFloat(trimmed, 64)
		return normalize(parsed, err == nil)
	default:
		return 0, false
	}
}

func nestedNumber(raw any) (float64, bool) {
	if direct, ok := numberValue(raw); ok {
		return direct, true
	}
	return numberValue(value(objectValue(raw), "val"))
}

func boolValue(value any) bool {
	switch typed := value.(type) {
	case bool:
		return typed
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		return err == nil && parsed
	default:
		return false
	}
}

func explicitlyFalse(value any) bool {
	switch typed := value.(type) {
	case bool:
		return !typed
	case string:
		parsed, err := strconv.ParseBool(strings.TrimSpace(typed))
		return err == nil && !parsed
	default:
		return false
	}
}

func parseAbsoluteTime(value any, now time.Time) time.Time {
	if text := stringValue(value); text != "" {
		for _, layout := range []string{time.RFC3339Nano, time.RFC3339} {
			if parsed, err := time.Parse(layout, text); err == nil {
				return parsed.UTC()
			}
		}
	}
	number, ok := numberValue(value)
	if !ok || number <= 0 {
		return time.Time{}
	}
	if number > 1_000_000_000_000 {
		return time.UnixMilli(int64(number)).UTC()
	}
	return time.Unix(int64(number), 0).UTC()
}

func windowResetAt(window map[string]any, now time.Time) time.Time {
	if absolute := parseAbsoluteTime(value(window, "reset_at", "resetAt", "resets_at", "resetsAt", "reset_time", "resetTime"), now); !absolute.IsZero() {
		return absolute
	}
	seconds, ok := numberValue(value(window, "reset_after_seconds", "resetAfterSeconds", "reset_in", "resetIn", "ttl"))
	if !ok || seconds <= 0 {
		return time.Time{}
	}
	return now.Add(time.Duration(seconds * float64(time.Second))).UTC()
}

func authString(auth *coreauth.Auth, keys ...string) string {
	if auth == nil {
		return ""
	}
	for _, key := range keys {
		if auth.Metadata != nil {
			if found := stringValue(auth.Metadata[key]); found != "" {
				return found
			}
		}
		if auth.Attributes != nil {
			if found := strings.TrimSpace(auth.Attributes[key]); found != "" {
				return found
			}
		}
	}
	return ""
}

func codexAccountID(auth *coreauth.Auth) string {
	if direct := authString(auth, "chatgpt_account_id", "chatgptAccountId", "account_id"); direct != "" {
		return direct
	}
	if auth == nil || auth.Metadata == nil {
		return ""
	}
	token := stringValue(auth.Metadata["id_token"])
	parts := strings.Split(token, ".")
	if len(parts) < 2 {
		return ""
	}
	payload, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		payload, err = base64.URLEncoding.DecodeString(parts[1])
		if err != nil {
			return ""
		}
	}
	var claims map[string]any
	if json.Unmarshal(payload, &claims) != nil {
		return ""
	}
	if id := stringValue(value(claims, "chatgpt_account_id", "chatgptAccountId")); id != "" {
		return id
	}
	return stringValue(value(objectValue(value(claims, "https://api.openai.com/auth")), "chatgpt_account_id", "chatgptAccountId"))
}

func xaiUserID(auth *coreauth.Auth) string {
	if direct := authString(auth, "sub", "subject", "user_id", "userId"); direct != "" {
		return direct
	}
	if auth == nil || auth.Metadata == nil {
		return ""
	}
	for _, parent := range []string{"oauth", "user"} {
		nested := objectValue(auth.Metadata[parent])
		if found := stringValue(value(nested, "sub", "subject", "id")); found != "" {
			return found
		}
	}
	return ""
}
