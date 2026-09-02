// Package usage provides durable request usage accounting and API-price estimates.
package usage

import (
	"bufio"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	internallogging "github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	coreusage "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/usage"
	log "github.com/sirupsen/logrus"
)

const eventsFileName = "events.jsonl"

//go:embed pricing.json
var defaultPricingJSON []byte

type PricingCatalog struct {
	Currency string        `json:"currency"`
	AsOf     string        `json:"as_of"`
	Rules    []PricingRule `json:"rules"`
}

type PricingRule struct {
	ID                        string  `json:"id"`
	Provider                  string  `json:"provider,omitempty"`
	Model                     string  `json:"model"`
	InputPerMillion           float64 `json:"input_per_million"`
	CachedInputPerMillion     float64 `json:"cached_input_per_million"`
	CacheWritePerMillion      float64 `json:"cache_write_per_million"`
	OutputPerMillion          float64 `json:"output_per_million"`
	LongContextThreshold      int64   `json:"long_context_threshold,omitempty"`
	LongInputPerMillion       float64 `json:"long_input_per_million,omitempty"`
	LongCachedInputPerMillion float64 `json:"long_cached_input_per_million,omitempty"`
	LongCacheWritePerMillion  float64 `json:"long_cache_write_per_million,omitempty"`
	LongOutputPerMillion      float64 `json:"long_output_per_million,omitempty"`
	CacheAccounting           string  `json:"cache_accounting,omitempty"`
	SourceURL                 string  `json:"source_url,omitempty"`
}

type TokenDetail struct {
	InputTokens         int64 `json:"input_tokens"`
	OutputTokens        int64 `json:"output_tokens"`
	ReasoningTokens     int64 `json:"reasoning_tokens"`
	CachedTokens        int64 `json:"cached_tokens"`
	CacheReadTokens     int64 `json:"cache_read_tokens"`
	CacheCreationTokens int64 `json:"cache_creation_tokens"`
	TotalTokens         int64 `json:"total_tokens"`
}

type CostDetail struct {
	InputUSD       float64 `json:"input_usd"`
	CachedInputUSD float64 `json:"cached_input_usd"`
	CacheWriteUSD  float64 `json:"cache_write_usd"`
	OutputUSD      float64 `json:"output_usd"`
	TotalUSD       float64 `json:"total_usd"`
	Priced         bool    `json:"priced"`
	RuleID         string  `json:"rule_id,omitempty"`
	SourceURL      string  `json:"source_url,omitempty"`
	LongContext    bool    `json:"long_context,omitempty"`
	TierMultiplier float64 `json:"tier_multiplier,omitempty"`
}

type Event struct {
	ID              string      `json:"id"`
	Timestamp       time.Time   `json:"timestamp"`
	Provider        string      `json:"provider"`
	Account         string      `json:"account"`
	AuthType        string      `json:"auth_type"`
	AuthIndex       string      `json:"auth_index,omitempty"`
	Model           string      `json:"model"`
	Alias           string      `json:"alias,omitempty"`
	ServiceTier     string      `json:"service_tier,omitempty"`
	ReasoningEffort string      `json:"reasoning_effort,omitempty"`
	RequestID       string      `json:"request_id,omitempty"`
	Failed          bool        `json:"failed"`
	Tokens          TokenDetail `json:"tokens"`
	Cost            CostDetail  `json:"cost"`
	Origin          string      `json:"origin"`
}

type HistoricalCoverage struct {
	DetailedLogFiles       int       `json:"detailed_log_files"`
	ImportedUsageRecords   int       `json:"imported_usage_records"`
	LegacyRequestsSeen     int64     `json:"legacy_requests_seen"`
	UncostableLegacyRows   int64     `json:"uncostable_legacy_rows"`
	LastScanAt             time.Time `json:"last_scan_at"`
	HistoricalImportNotice string    `json:"notice"`
}

type Store struct {
	mu       sync.RWMutex
	dir      string
	events   []Event
	ids      map[string]struct{}
	catalog  PricingCatalog
	coverage HistoricalCoverage
	enabled  atomic.Bool
}

func DefaultStoreDirectory(configFilePath string) string {
	if configured := strings.TrimSpace(os.Getenv("USAGE_STORE_PATH")); configured != "" {
		return configured
	}
	base := filepath.Dir(strings.TrimSpace(configFilePath))
	if base == "." || base == "" {
		base = "."
	}
	return filepath.Join(base, "usage")
}

func NewStore(dir, logDir string, enabled bool) (*Store, error) {
	dir = strings.TrimSpace(dir)
	if dir == "" {
		return nil, errors.New("usage store directory is required")
	}
	if errMkdir := os.MkdirAll(dir, 0o750); errMkdir != nil {
		return nil, fmt.Errorf("create usage store: %w", errMkdir)
	}

	store := &Store{dir: dir, ids: make(map[string]struct{})}
	store.enabled.Store(enabled)
	if errCatalog := json.Unmarshal(defaultPricingJSON, &store.catalog); errCatalog != nil {
		return nil, fmt.Errorf("load embedded usage pricing: %w", errCatalog)
	}
	if errLoad := store.load(); errLoad != nil {
		return nil, errLoad
	}
	if strings.TrimSpace(logDir) != "" {
		if errImport := store.importHistoricalLogs(logDir); errImport != nil {
			log.WithError(errImport).Warn("usage: historical log import completed with errors")
		}
	}
	return store, nil
}

func (s *Store) SetEnabled(enabled bool) {
	if s != nil {
		s.enabled.Store(enabled)
	}
}

func (s *Store) HandleUsage(ctx context.Context, record coreusage.Record) {
	if s == nil || !s.enabled.Load() {
		return
	}
	event := s.eventFromRecord(ctx, record)
	if errAppend := s.append(event); errAppend != nil {
		log.WithError(errAppend).Error("usage: failed to persist usage event")
	}
}

func (s *Store) eventFromRecord(ctx context.Context, record coreusage.Record) Event {
	timestamp := record.RequestedAt
	if timestamp.IsZero() {
		timestamp = time.Now()
	}
	provider := normalizedLabel(record.Provider, "unknown")
	model := normalizedLabel(record.Model, "unknown")
	requestID := strings.TrimSpace(internallogging.GetRequestID(ctx))
	tokens := TokenDetail{
		InputTokens:         record.Detail.InputTokens,
		OutputTokens:        record.Detail.OutputTokens,
		ReasoningTokens:     record.Detail.ReasoningTokens,
		CachedTokens:        record.Detail.CachedTokens,
		CacheReadTokens:     record.Detail.CacheReadTokens,
		CacheCreationTokens: record.Detail.CacheCreationTokens,
		TotalTokens:         record.Detail.TotalTokens,
	}
	if tokens.TotalTokens == 0 {
		tokens.TotalTokens = tokens.InputTokens + tokens.OutputTokens + tokens.ReasoningTokens + tokens.CacheReadTokens + tokens.CacheCreationTokens
	}
	event := Event{
		Timestamp:       timestamp,
		Provider:        provider,
		Account:         safeAccountLabel(provider, record.Source, record.AuthID, record.AuthIndex),
		AuthType:        normalizedLabel(record.AuthType, "unknown"),
		AuthIndex:       strings.TrimSpace(record.AuthIndex),
		Model:           model,
		Alias:           strings.TrimSpace(record.Alias),
		ServiceTier:     normalizedLabel(record.ServiceTier, coreusage.DefaultServiceTier),
		ReasoningEffort: strings.TrimSpace(record.ReasoningEffort),
		RequestID:       requestID,
		Failed:          record.Failed,
		Tokens:          tokens,
		Origin:          "live",
	}
	event.ID = eventFingerprint(event)
	event.Cost = s.price(event)
	return event
}

func (s *Store) append(event Event) error {
	if event.ID == "" {
		event.ID = eventFingerprint(event)
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.ids[event.ID]; exists {
		return nil
	}
	raw, errMarshal := json.Marshal(event)
	if errMarshal != nil {
		return fmt.Errorf("marshal usage event: %w", errMarshal)
	}
	path := filepath.Join(s.dir, eventsFileName)
	file, errOpen := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o640)
	if errOpen != nil {
		return fmt.Errorf("open usage events: %w", errOpen)
	}
	_, errWrite := file.Write(append(raw, '\n'))
	if errWrite == nil {
		errWrite = file.Sync()
	}
	if errClose := file.Close(); errWrite == nil && errClose != nil {
		errWrite = errClose
	}
	if errWrite != nil {
		return fmt.Errorf("write usage event: %w", errWrite)
	}
	s.events = append(s.events, event)
	s.ids[event.ID] = struct{}{}
	return nil
}

func (s *Store) hasEvent(id string) bool {
	if s == nil || strings.TrimSpace(id) == "" {
		return false
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	_, exists := s.ids[id]
	return exists
}

func (s *Store) load() error {
	path := filepath.Join(s.dir, eventsFileName)
	file, errOpen := os.Open(path)
	if errors.Is(errOpen, os.ErrNotExist) {
		return nil
	}
	if errOpen != nil {
		return fmt.Errorf("open usage history: %w", errOpen)
	}
	defer func() {
		if errClose := file.Close(); errClose != nil {
			log.WithError(errClose).Warn("usage: failed to close history file")
		}
	}()

	scanner := bufio.NewScanner(file)
	scanner.Buffer(make([]byte, 64*1024), 4*1024*1024)
	line := 0
	for scanner.Scan() {
		line++
		raw := strings.TrimSpace(scanner.Text())
		if raw == "" {
			continue
		}
		var event Event
		if errDecode := json.Unmarshal([]byte(raw), &event); errDecode != nil {
			log.WithFields(log.Fields{"line": line, "error": errDecode}).Warn("usage: skipping invalid history row")
			continue
		}
		if event.ID == "" {
			event.ID = eventFingerprint(event)
		}
		if _, exists := s.ids[event.ID]; exists {
			continue
		}
		s.events = append(s.events, event)
		s.ids[event.ID] = struct{}{}
	}
	if errScan := scanner.Err(); errScan != nil {
		return fmt.Errorf("scan usage history: %w", errScan)
	}
	return nil
}

func (s *Store) price(event Event) CostDetail {
	if event.Failed {
		return CostDetail{}
	}
	rule, ok := s.matchRule(event.Provider, event.Model)
	if !ok {
		return CostDetail{}
	}
	inputRate := rule.InputPerMillion
	cachedRate := rule.CachedInputPerMillion
	writeRate := rule.CacheWritePerMillion
	outputRate := rule.OutputPerMillion
	contextTokens := event.Tokens.InputTokens
	if strings.EqualFold(rule.CacheAccounting, "separate") {
		contextTokens += event.Tokens.CacheReadTokens + event.Tokens.CacheCreationTokens
	}
	longContext := rule.LongContextThreshold > 0 && contextTokens > rule.LongContextThreshold
	if longContext {
		inputRate = fallbackRate(rule.LongInputPerMillion, inputRate)
		cachedRate = fallbackRate(rule.LongCachedInputPerMillion, cachedRate)
		writeRate = fallbackRate(rule.LongCacheWritePerMillion, writeRate)
		outputRate = fallbackRate(rule.LongOutputPerMillion, outputRate)
	}

	regularInput := event.Tokens.InputTokens
	cacheRead := event.Tokens.CacheReadTokens
	cacheWrite := event.Tokens.CacheCreationTokens
	if strings.EqualFold(rule.CacheAccounting, "separate") {
		if cacheRead == 0 {
			cacheRead = event.Tokens.CachedTokens
		}
	} else {
		if cacheRead == 0 {
			cacheRead = event.Tokens.CachedTokens
		}
		includedCache := cacheRead + cacheWrite
		if includedCache > regularInput {
			includedCache = regularInput
		}
		regularInput -= includedCache
	}

	billableOutput := event.Tokens.OutputTokens
	if event.Tokens.ReasoningTokens > 0 && event.Tokens.TotalTokens >= event.Tokens.InputTokens+event.Tokens.OutputTokens+event.Tokens.ReasoningTokens {
		billableOutput += event.Tokens.ReasoningTokens
	}
	multiplier := serviceTierMultiplier(event.ServiceTier, event.Model)
	cost := CostDetail{
		InputUSD:       perMillionCost(regularInput, inputRate) * multiplier,
		CachedInputUSD: perMillionCost(cacheRead, cachedRate) * multiplier,
		CacheWriteUSD:  perMillionCost(cacheWrite, writeRate) * multiplier,
		OutputUSD:      perMillionCost(billableOutput, outputRate) * multiplier,
		Priced:         true,
		RuleID:         rule.ID,
		SourceURL:      rule.SourceURL,
		LongContext:    longContext,
		TierMultiplier: multiplier,
	}
	cost.TotalUSD = cost.InputUSD + cost.CachedInputUSD + cost.CacheWriteUSD + cost.OutputUSD
	return cost
}

func (s *Store) matchRule(provider, model string) (PricingRule, bool) {
	model = strings.ToLower(strings.TrimSpace(model))
	provider = strings.ToLower(strings.TrimSpace(provider))
	bestScore := -1
	var best PricingRule
	for _, rule := range s.catalog.Rules {
		if ruleProvider := strings.ToLower(strings.TrimSpace(rule.Provider)); ruleProvider != "" && ruleProvider != "*" && ruleProvider != provider {
			continue
		}
		pattern := strings.ToLower(strings.TrimSpace(rule.Model))
		matched := false
		if strings.HasSuffix(pattern, "*") {
			matched = strings.HasPrefix(model, strings.TrimSuffix(pattern, "*"))
		} else {
			matched = model == pattern
		}
		if !matched {
			continue
		}
		score := len(strings.TrimSuffix(pattern, "*"))
		if !strings.HasSuffix(pattern, "*") {
			score += 1000
		}
		if strings.TrimSpace(rule.Provider) != "" && rule.Provider != "*" {
			score += 100
		}
		if score > bestScore {
			bestScore = score
			best = rule
		}
	}
	return best, bestScore >= 0
}

func fallbackRate(value, fallback float64) float64 {
	if value > 0 {
		return value
	}
	return fallback
}

func perMillionCost(tokens int64, rate float64) float64 {
	if tokens <= 0 || rate <= 0 {
		return 0
	}
	return float64(tokens) * rate / 1_000_000
}

func serviceTierMultiplier(tier, model string) float64 {
	model = strings.ToLower(strings.TrimSpace(model))
	if !strings.HasPrefix(model, "gpt-") && !strings.HasPrefix(model, "o1") && !strings.HasPrefix(model, "o3") && !strings.HasPrefix(model, "o4") {
		return 1
	}
	switch strings.ToLower(strings.TrimSpace(tier)) {
	case "batch", "flex":
		return 0.5
	case "priority":
		return 2
	default:
		return 1
	}
}

func normalizedLabel(value, fallback string) string {
	if value = strings.TrimSpace(value); value != "" {
		return value
	}
	return fallback
}

func safeAccountLabel(provider, source, authID, authIndex string) string {
	source = strings.TrimSpace(source)
	if source != "" && !looksLikeSecret(source) {
		return source
	}
	candidate := strings.TrimSpace(authID)
	if candidate != "" && !looksLikeSecret(candidate) {
		candidate = filepath.Base(candidate)
		candidate = strings.TrimSuffix(candidate, filepath.Ext(candidate))
		if candidate != "" && candidate != "." {
			return candidate
		}
	}
	if source != "" {
		sum := sha256.Sum256([]byte(source))
		return normalizedLabel(provider, "provider") + " key " + hex.EncodeToString(sum[:6])
	}
	if index := strings.TrimSpace(authIndex); index != "" {
		return normalizedLabel(provider, "provider") + " account " + index
	}
	return normalizedLabel(provider, "unknown") + " account"
}

func looksLikeSecret(value string) bool {
	lower := strings.ToLower(strings.TrimSpace(value))
	if strings.Contains(lower, "@") || strings.Contains(lower, ".json") {
		return false
	}
	for _, prefix := range []string{"sk-", "key-", "AIza", "xai-", "Bearer "} {
		if strings.HasPrefix(value, prefix) || strings.HasPrefix(lower, strings.ToLower(prefix)) {
			return true
		}
	}
	if len(value) >= 28 && !strings.ContainsAny(value, " /\\") {
		return true
	}
	return false
}

func eventFingerprint(event Event) string {
	basis := event.RequestID
	if basis == "" {
		basis = event.Timestamp.UTC().Format(time.RFC3339Nano)
	}
	basis += fmt.Sprintf("|%s|%s|%s|%d|%d|%d", event.Provider, event.Model, event.Account, event.Tokens.InputTokens, event.Tokens.OutputTokens, event.Tokens.TotalTokens)
	sum := sha256.Sum256([]byte(basis))
	return hex.EncodeToString(sum[:16])
}

func (s *Store) Events() []Event {
	if s == nil {
		return nil
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Event, len(s.events))
	copy(out, s.events)
	sort.SliceStable(out, func(i, j int) bool { return out[i].Timestamp.Before(out[j].Timestamp) })
	return out
}

func (s *Store) CatalogInfo() (currency, asOf string, rules int) {
	if s == nil {
		return "USD", "", 0
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.catalog.Currency, s.catalog.AsOf, len(s.catalog.Rules)
}

func (s *Store) Coverage() HistoricalCoverage {
	if s == nil {
		return HistoricalCoverage{}
	}
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.coverage
}
