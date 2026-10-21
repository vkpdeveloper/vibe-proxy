package registry

import "testing"

func TestGetClaudeModelsIncludesSonnet55(t *testing.T) {
	models := GetClaudeModels()
	count := 0
	for _, model := range models {
		if model.ID != "claude-sonnet-5-5" {
			continue
		}
		count++
		if model.Type != "claude" || model.ContextLength != 1000000 || model.MaxCompletionTokens != 128000 {
			t.Fatalf("unexpected Sonnet 5.5 metadata: %+v", model)
		}
	}
	if count != 1 {
		t.Fatalf("expected exactly one Sonnet 5.5 model, got %d", count)
	}
}
