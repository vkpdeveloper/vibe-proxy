package executor

import (
	"net/http"
	"testing"

	cliproxyauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
)

// A long-lived credential serves inference with its one-year token and sends
// only Anthropic account endpoints with the separate limits login.
func TestPrepareRequestUsesLimitsLoginOnlyForAccountEndpoints(t *testing.T) {
	auth := &cliproxyauth.Auth{
		Provider: "claude",
		Metadata: map[string]any{
			"access_token":       "sk-ant-oat01-long",
			"usage_access_token": "sk-ant-oat01-usage",
		},
	}
	cases := map[string]string{
		"https://api.anthropic.com/v1/messages":              "Bearer sk-ant-oat01-long",
		"https://api.anthropic.com/api/oauth/usage":          "Bearer sk-ant-oat01-usage",
		"https://api.anthropic.com/api/oauth/profile":        "Bearer sk-ant-oat01-usage",
		"https://example.com/api/oauth/usage":                "Bearer sk-ant-oat01-long",
		"https://api.anthropic.com/v1/messages/count_tokens": "Bearer sk-ant-oat01-long",
	}
	executor := &ClaudeExecutor{}
	for target, want := range cases {
		req, err := http.NewRequest(http.MethodGet, target, nil)
		if err != nil {
			t.Fatal(err)
		}
		if err = executor.PrepareRequest(req, auth); err != nil {
			t.Fatal(err)
		}
		if got := req.Header.Get("Authorization"); got != want {
			t.Errorf("%s Authorization = %q, want %q", target, got, want)
		}
	}
}
