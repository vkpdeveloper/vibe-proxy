package usage

import (
	"bufio"
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/tidwall/gjson"
)

var mainLogRequestPattern = regexp.MustCompile(`^\[[^]]+\].*\|\s+(?:GET|POST|PUT|PATCH|DELETE)\s+"(/(?:v1|v0|openai|anthropic)/[^"? ]+)`)

func (s *Store) importHistoricalLogs(logDir string) error {
	coverage := HistoricalCoverage{
		LastScanAt:             time.Now(),
		HistoricalImportNotice: "Detailed request logs with model and token fields are imported once. Application main logs do not contain token or account data, so their requests are reported as historical coverage only and are never assigned a guessed cost.",
	}
	entries, errRead := os.ReadDir(logDir)
	if errRead != nil {
		if errors.Is(errRead, os.ErrNotExist) {
			s.mu.Lock()
			s.coverage = coverage
			s.mu.Unlock()
			return nil
		}
		return fmt.Errorf("read historical log directory: %w", errRead)
	}

	var firstErr error
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(strings.ToLower(entry.Name()), ".log") {
			continue
		}
		path := filepath.Join(logDir, entry.Name())
		if strings.HasPrefix(entry.Name(), "main") {
			count, errCount := countMainLogRequests(path)
			if errCount != nil && firstErr == nil {
				firstErr = errCount
			}
			coverage.LegacyRequestsSeen += count
			continue
		}
		raw, errFile := os.ReadFile(path)
		if errFile != nil {
			if firstErr == nil {
				firstErr = errFile
			}
			continue
		}
		if !bytes.Contains(raw, []byte("=== REQUEST INFO ===")) {
			continue
		}
		coverage.DetailedLogFiles++
		event, ok := s.eventFromDetailedLog(entry.Name(), raw)
		if !ok {
			continue
		}
		if s.hasEvent(event.ID) {
			continue
		}
		if errAppend := s.append(event); errAppend != nil && firstErr == nil {
			firstErr = errAppend
			continue
		}
	}
	s.mu.RLock()
	for _, event := range s.events {
		if event.Origin == "historical-request-log" {
			coverage.ImportedUsageRecords++
		}
	}
	s.mu.RUnlock()
	coverage.UncostableLegacyRows = coverage.LegacyRequestsSeen
	s.mu.Lock()
	s.coverage = coverage
	s.mu.Unlock()
	return firstErr
}

func countMainLogRequests(path string) (int64, error) {
	file, errOpen := os.Open(path)
	if errOpen != nil {
		return 0, errOpen
	}
	defer func() { _ = file.Close() }()
	var count int64
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		match := mainLogRequestPattern.FindStringSubmatch(scanner.Text())
		if len(match) == 2 && !strings.Contains(match[1], "count_tokens") {
			count++
		}
	}
	return count, scanner.Err()
}

func (s *Store) eventFromDetailedLog(name string, raw []byte) (Event, bool) {
	timestamp := extractLogTimestamp(raw)
	model := extractLogModel(raw)
	if model == "" {
		return Event{}, false
	}
	tokens := extractLogTokens(raw)
	if tokens.TotalTokens == 0 && tokens.InputTokens == 0 && tokens.OutputTokens == 0 {
		return Event{}, false
	}
	provider := inferProvider(model, raw)
	event := Event{
		Timestamp:   timestamp,
		Provider:    provider,
		Account:     "Historical / unknown account",
		AuthType:    "historical-log",
		Model:       model,
		RequestID:   requestIDFromLogName(name),
		Tokens:      tokens,
		Origin:      "historical-request-log",
		ServiceTier: "default",
	}
	event.ID = eventFingerprint(event)
	event.Cost = s.price(event)
	return event, true
}

func extractLogTimestamp(raw []byte) time.Time {
	for _, line := range strings.Split(string(raw), "\n") {
		if !strings.HasPrefix(line, "Timestamp: ") {
			continue
		}
		if parsed, errParse := time.Parse(time.RFC3339Nano, strings.TrimSpace(strings.TrimPrefix(line, "Timestamp: "))); errParse == nil {
			return parsed
		}
	}
	return time.Now()
}

func extractLogModel(raw []byte) string {
	for _, section := range []string{"=== REQUEST BODY ===", "=== API REQUEST ==="} {
		body := logSection(raw, section)
		if value := firstJSONValue(body, "model", "request.model"); value != "" {
			return value
		}
	}
	return ""
}

func extractLogTokens(raw []byte) TokenDetail {
	var best TokenDetail
	for _, section := range []string{"=== API RESPONSE ===", "=== API WEBSOCKET TIMELINE ===", "=== RESPONSE ==="} {
		body := logSection(raw, section)
		for _, line := range bytes.Split(body, []byte("\n")) {
			candidate := bytes.TrimSpace(line)
			if bytes.HasPrefix(candidate, []byte("data:")) {
				candidate = bytes.TrimSpace(bytes.TrimPrefix(candidate, []byte("data:")))
			}
			if bytes.HasPrefix(candidate, []byte("{")) {
				mergeTokenDetail(&best, tokensFromJSON(candidate))
			}
		}
		if json.Valid(bytes.TrimSpace(body)) {
			mergeTokenDetail(&best, tokensFromJSON(bytes.TrimSpace(body)))
		}
	}
	if best.TotalTokens == 0 {
		best.TotalTokens = best.InputTokens + best.OutputTokens + best.ReasoningTokens + best.CacheReadTokens + best.CacheCreationTokens
	}
	return best
}

func tokensFromJSON(raw []byte) TokenDetail {
	for _, prefix := range []string{"response.usage", "message.usage", "usage", "response.usageMetadata", "usageMetadata"} {
		node := gjson.GetBytes(raw, prefix)
		if !node.Exists() || !node.IsObject() {
			continue
		}
		input := firstInt(node, "input_tokens", "prompt_tokens", "promptTokenCount", "total_input_tokens")
		output := firstInt(node, "output_tokens", "completion_tokens", "candidatesTokenCount", "total_output_tokens")
		reasoning := firstInt(node, "reasoning_tokens", "thoughtsTokenCount", "total_thought_tokens", "output_tokens_details.reasoning_tokens", "completion_tokens_details.reasoning_tokens")
		cached := firstInt(node, "cached_tokens", "cachedContentTokenCount", "total_cached_tokens", "input_tokens_details.cached_tokens", "prompt_tokens_details.cached_tokens")
		read := firstInt(node, "cache_read_input_tokens", "cache_read_tokens")
		write := firstInt(node, "cache_creation_input_tokens", "cache_creation_tokens", "input_tokens_details.cache_write_tokens")
		total := firstInt(node, "total_tokens", "totalTokenCount")
		return TokenDetail{InputTokens: input, OutputTokens: output, ReasoningTokens: reasoning, CachedTokens: cached, CacheReadTokens: read, CacheCreationTokens: write, TotalTokens: total}
	}
	return TokenDetail{}
}

func firstInt(node gjson.Result, paths ...string) int64 {
	for _, path := range paths {
		value := node.Get(path)
		if value.Exists() {
			return value.Int()
		}
	}
	return 0
}

func mergeTokenDetail(dst *TokenDetail, candidate TokenDetail) {
	if dst == nil {
		return
	}
	if candidate.InputTokens > dst.InputTokens {
		dst.InputTokens = candidate.InputTokens
	}
	if candidate.OutputTokens > dst.OutputTokens {
		dst.OutputTokens = candidate.OutputTokens
	}
	if candidate.ReasoningTokens > dst.ReasoningTokens {
		dst.ReasoningTokens = candidate.ReasoningTokens
	}
	if candidate.CachedTokens > dst.CachedTokens {
		dst.CachedTokens = candidate.CachedTokens
	}
	if candidate.CacheReadTokens > dst.CacheReadTokens {
		dst.CacheReadTokens = candidate.CacheReadTokens
	}
	if candidate.CacheCreationTokens > dst.CacheCreationTokens {
		dst.CacheCreationTokens = candidate.CacheCreationTokens
	}
	if candidate.TotalTokens > dst.TotalTokens {
		dst.TotalTokens = candidate.TotalTokens
	}
}

func firstJSONValue(raw []byte, paths ...string) string {
	trimmed := bytes.TrimSpace(raw)
	if json.Valid(trimmed) {
		for _, path := range paths {
			if value := strings.TrimSpace(gjson.GetBytes(trimmed, path).String()); value != "" {
				return value
			}
		}
	}
	for _, line := range bytes.Split(trimmed, []byte("\n")) {
		line = bytes.TrimSpace(bytes.TrimPrefix(bytes.TrimSpace(line), []byte("data:")))
		if !json.Valid(line) {
			continue
		}
		for _, path := range paths {
			if value := strings.TrimSpace(gjson.GetBytes(line, path).String()); value != "" {
				return value
			}
		}
	}
	return ""
}

func logSection(raw []byte, heading string) []byte {
	start := bytes.Index(raw, []byte(heading))
	if start < 0 {
		return nil
	}
	start += len(heading)
	remainder := raw[start:]
	if next := bytes.Index(remainder, []byte("\n=== ")); next >= 0 {
		remainder = remainder[:next]
	}
	return bytes.TrimSpace(remainder)
}

func inferProvider(model string, raw []byte) string {
	lowerModel := strings.ToLower(model)
	switch {
	case strings.HasPrefix(lowerModel, "claude-"):
		return "claude"
	case strings.HasPrefix(lowerModel, "gemini-"):
		return "gemini"
	case strings.HasPrefix(lowerModel, "grok-"):
		return "xai"
	case strings.HasPrefix(lowerModel, "kimi-"):
		return "kimi"
	case strings.HasPrefix(lowerModel, "gpt-") || strings.HasPrefix(lowerModel, "o"):
		return "openai"
	}
	lower := strings.ToLower(string(raw))
	for marker, provider := range map[string]string{"anthropic.com": "claude", "generativelanguage.googleapis.com": "gemini", "api.x.ai": "xai", "api.openai.com": "openai"} {
		if strings.Contains(lower, marker) {
			return provider
		}
	}
	return "unknown"
}

func requestIDFromLogName(name string) string {
	base := strings.TrimSuffix(filepath.Base(name), filepath.Ext(name))
	marker := regexp.MustCompile(`-\d{4}-\d{2}-\d{2}T\d{6}-`)
	location := marker.FindStringIndex(base)
	if location == nil {
		return ""
	}
	return strings.TrimSpace(base[location[1]:])
}
