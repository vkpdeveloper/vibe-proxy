package usage

import (
	"sort"
	"strings"
	"time"
)

type Totals struct {
	Requests         int64   `json:"requests"`
	Successful       int64   `json:"successful"`
	Failed           int64   `json:"failed"`
	InputTokens      int64   `json:"input_tokens"`
	OutputTokens     int64   `json:"output_tokens"`
	ReasoningTokens  int64   `json:"reasoning_tokens"`
	CachedTokens     int64   `json:"cached_tokens"`
	CacheWriteTokens int64   `json:"cache_write_tokens"`
	TotalTokens      int64   `json:"total_tokens"`
	EstimatedUSD     float64 `json:"estimated_usd"`
	PricedRequests   int64   `json:"priced_requests"`
	UnpricedRequests int64   `json:"unpriced_requests"`
}

type Breakdown struct {
	Key         string `json:"key"`
	Provider    string `json:"provider,omitempty"`
	Account     string `json:"account,omitempty"`
	Model       string `json:"model,omitempty"`
	AuthType    string `json:"auth_type,omitempty"`
	ClientKeyID string `json:"client_key_id,omitempty"`
	ClientKey   string `json:"client_key,omitempty"`
	Totals
}

type DailyTotal struct {
	Date string `json:"date"`
	Totals
}

type UnpricedModel struct {
	Provider string `json:"provider"`
	Model    string `json:"model"`
	Requests int64  `json:"requests"`
	Tokens   int64  `json:"tokens"`
}

type Report struct {
	Currency        string             `json:"currency"`
	PricingAsOf     string             `json:"pricing_as_of"`
	PricingRules    int                `json:"pricing_rules"`
	From            *time.Time         `json:"from,omitempty"`
	To              *time.Time         `json:"to,omitempty"`
	GeneratedAt     time.Time          `json:"generated_at"`
	Totals          Totals             `json:"totals"`
	ByProvider      []Breakdown        `json:"by_provider"`
	ByAccount       []Breakdown        `json:"by_account"`
	ByModel         []Breakdown        `json:"by_model"`
	ByProviderModel []Breakdown        `json:"by_provider_model"`
	ByAuthType      []Breakdown        `json:"by_auth_type"`
	ByClientKey     []Breakdown        `json:"by_client_key"`
	Daily           []DailyTotal       `json:"daily"`
	UnpricedModels  []UnpricedModel    `json:"unpriced_models"`
	Recent          []Event            `json:"recent"`
	Historical      HistoricalCoverage `json:"historical"`
}

func (s *Store) Report(from, to *time.Time) Report {
	currency, asOf, rules := s.CatalogInfo()
	report := Report{
		Currency:        normalizedLabel(currency, "USD"),
		PricingAsOf:     asOf,
		PricingRules:    rules,
		From:            from,
		To:              to,
		GeneratedAt:     time.Now(),
		ByProvider:      make([]Breakdown, 0),
		ByAccount:       make([]Breakdown, 0),
		ByModel:         make([]Breakdown, 0),
		ByProviderModel: make([]Breakdown, 0),
		ByAuthType:      make([]Breakdown, 0),
		ByClientKey:     make([]Breakdown, 0),
		Daily:           make([]DailyTotal, 0),
		UnpricedModels:  make([]UnpricedModel, 0),
		Recent:          make([]Event, 0),
		Historical:      s.Coverage(),
	}
	provider := make(map[string]*Breakdown)
	account := make(map[string]*Breakdown)
	model := make(map[string]*Breakdown)
	providerModel := make(map[string]*Breakdown)
	authType := make(map[string]*Breakdown)
	clientKey := make(map[string]*Breakdown)
	daily := make(map[string]*DailyTotal)
	unpriced := make(map[string]*UnpricedModel)

	for _, event := range s.Events() {
		if from != nil && event.Timestamp.Before(*from) {
			continue
		}
		if to != nil && !event.Timestamp.Before(*to) {
			continue
		}
		addEventTotals(&report.Totals, event)

		providerKey := normalizedLabel(event.Provider, "unknown")
		providerRow := ensureBreakdown(provider, providerKey)
		providerRow.Provider = providerKey
		addEventTotals(&providerRow.Totals, event)

		accountKey := normalizedLabel(event.Account, "unknown account")
		accountRow := ensureBreakdown(account, accountKey)
		accountRow.Account = accountKey
		addEventTotals(&accountRow.Totals, event)

		modelKey := normalizedLabel(event.Model, "unknown")
		modelRow := ensureBreakdown(model, modelKey)
		modelRow.Model = modelKey
		addEventTotals(&modelRow.Totals, event)

		pmKey := providerKey + "\x00" + modelKey
		pmRow := ensureBreakdown(providerModel, pmKey)
		pmRow.Provider = providerKey
		pmRow.Model = modelKey
		addEventTotals(&pmRow.Totals, event)

		authKey := normalizedLabel(event.AuthType, "unknown")
		authRow := ensureBreakdown(authType, authKey)
		authRow.AuthType = authKey
		addEventTotals(&authRow.Totals, event)

		clientKeyID := event.ClientKeyID
		clientKeyRow := ensureBreakdown(clientKey, normalizedLabel(clientKeyID, "unattributed"))
		clientKeyRow.ClientKeyID = clientKeyID
		clientKeyRow.ClientKey = s.clientKeyLabel(clientKeyID)
		clientKeyRow.Key = clientKeyRow.ClientKey
		addEventTotals(&clientKeyRow.Totals, event)

		date := event.Timestamp.UTC().Format("2006-01-02")
		day := daily[date]
		if day == nil {
			day = &DailyTotal{Date: date}
			daily[date] = day
		}
		addEventTotals(&day.Totals, event)

		if !event.Failed && !event.Cost.Priced {
			key := providerKey + "\x00" + modelKey
			entry := unpriced[key]
			if entry == nil {
				entry = &UnpricedModel{Provider: providerKey, Model: modelKey}
				unpriced[key] = entry
			}
			entry.Requests++
			entry.Tokens += event.Tokens.TotalTokens
		}
		report.Recent = append(report.Recent, event)
	}

	report.ByProvider = sortedBreakdowns(provider)
	report.ByAccount = sortedBreakdowns(account)
	report.ByModel = sortedBreakdowns(model)
	report.ByProviderModel = sortedBreakdowns(providerModel)
	report.ByAuthType = sortedBreakdowns(authType)
	report.ByClientKey = sortedBreakdowns(clientKey)
	for _, value := range daily {
		report.Daily = append(report.Daily, *value)
	}
	sort.Slice(report.Daily, func(i, j int) bool { return report.Daily[i].Date < report.Daily[j].Date })
	for _, value := range unpriced {
		report.UnpricedModels = append(report.UnpricedModels, *value)
	}
	sort.Slice(report.UnpricedModels, func(i, j int) bool {
		if report.UnpricedModels[i].Tokens != report.UnpricedModels[j].Tokens {
			return report.UnpricedModels[i].Tokens > report.UnpricedModels[j].Tokens
		}
		return report.UnpricedModels[i].Model < report.UnpricedModels[j].Model
	})
	sort.Slice(report.Recent, func(i, j int) bool { return report.Recent[i].Timestamp.After(report.Recent[j].Timestamp) })
	if len(report.Recent) > 50 {
		report.Recent = report.Recent[:50]
	}
	return report
}

func ensureBreakdown(values map[string]*Breakdown, key string) *Breakdown {
	if existing := values[key]; existing != nil {
		return existing
	}
	row := &Breakdown{Key: strings.ReplaceAll(key, "\x00", " / ")}
	values[key] = row
	return row
}

func sortedBreakdowns(values map[string]*Breakdown) []Breakdown {
	out := make([]Breakdown, 0, len(values))
	for _, value := range values {
		out = append(out, *value)
	}
	sort.Slice(out, func(i, j int) bool {
		if out[i].EstimatedUSD != out[j].EstimatedUSD {
			return out[i].EstimatedUSD > out[j].EstimatedUSD
		}
		if out[i].TotalTokens != out[j].TotalTokens {
			return out[i].TotalTokens > out[j].TotalTokens
		}
		return out[i].Key < out[j].Key
	})
	return out
}

func addEventTotals(total *Totals, event Event) {
	if total == nil {
		return
	}
	total.Requests++
	if event.Failed {
		total.Failed++
	} else {
		total.Successful++
	}
	total.InputTokens += event.Tokens.InputTokens
	total.OutputTokens += event.Tokens.OutputTokens
	total.ReasoningTokens += event.Tokens.ReasoningTokens
	cacheRead := event.Tokens.CacheReadTokens
	if cacheRead == 0 {
		cacheRead = event.Tokens.CachedTokens
	}
	total.CachedTokens += cacheRead
	total.CacheWriteTokens += event.Tokens.CacheCreationTokens
	total.TotalTokens += event.Tokens.TotalTokens
	if event.Cost.Priced {
		total.PricedRequests++
		total.EstimatedUSD += event.Cost.TotalUSD
	} else if !event.Failed {
		total.UnpricedRequests++
	}
}
