package management

import (
	"context"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/MoeForge/moego/json"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/auth/claude"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
	coreauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
)

type claudeRoundTrip func(*http.Request) (*http.Response, error)

func (f claudeRoundTrip) RoundTrip(req *http.Request) (*http.Response, error) { return f(req) }

// fakeAnthropic answers the full-scope exchange with fullAccount, the
// long-lived (expires_in) exchange with a one-year token, and the companion
// profile and roles lookups.
func fakeAnthropic(t *testing.T, fullAccount string) *claude.ClaudeAuth {
	t.Helper()
	respond := func(req *http.Request, body string) (*http.Response, error) {
		return &http.Response{StatusCode: http.StatusOK, Body: io.NopCloser(strings.NewReader(body)), Header: make(http.Header), Request: req}, nil
	}
	return claude.NewClaudeAuthWithHTTPClient(&http.Client{Transport: claudeRoundTrip(func(req *http.Request) (*http.Response, error) {
		switch req.URL.String() {
		case claude.TokenURL:
			raw, _ := io.ReadAll(req.Body)
			if strings.Contains(string(raw), `"expires_in":31536000`) {
				return respond(req, `{"access_token":"sk-ant-oat01-year","expires_in":31536000,"account":{"uuid":"acct-1"}}`)
			}
			return respond(req, `{"access_token":"sk-ant-oat01-full","refresh_token":"sk-ant-ort01-full","expires_in":28800,
				"account":{"uuid":"`+fullAccount+`","email_address":"user@example.com"},"organization":{"uuid":"org-1","name":"Org"}}`)
		case claude.ProfileURL:
			return respond(req, `{"account":{"uuid":"`+fullAccount+`","email":"user@example.com"},"organization":{"uuid":"org-1","name":"Org"}}`)
		case claude.RolesURL:
			return respond(req, `{}`)
		}
		t.Errorf("unexpected request %s", req.URL)
		return nil, io.EOF
	})})
}

func waitFor(t *testing.T, what string, done func() bool) {
	t.Helper()
	deadline := time.Now().Add(5 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			t.Fatalf("timed out waiting for %s", what)
		}
		time.Sleep(20 * time.Millisecond)
	}
}

func TestClaudeLongLivedLoginStoresBothTokens(t *testing.T) {
	authDir := t.TempDir()
	h := NewHandler(&config.Config{AuthDir: authDir}, "", nil)
	anthropic := fakeAnthropic(t, "acct-1")
	login := claudeLogin{
		auth:        anthropic,
		longAuth:    anthropic,
		state:       "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa01",
		pkce:        &claude.PKCECodes{CodeVerifier: "v1"},
		accountName: "Work",
		longState:   "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa02",
		longPKCE:    &claude.PKCECodes{CodeVerifier: "v2"},
		longURL:     "https://claude.ai/oauth/authorize?step=2",
	}
	RegisterOAuthSession(login.state, "anthropic")
	RegisterOAuthSession(login.longState, "anthropic")
	defer CancelOAuthSession(login.state)
	defer claudeSecondStepURLs.Delete(login.state)
	go h.runClaudeLogin(context.Background(), login)

	if claudeSecondStepURL(login.state) != "" {
		t.Fatal("second step published before the first consent")
	}
	if _, err := WriteOAuthCallbackFileForPendingSession(authDir, "anthropic", login.state, "code-1", ""); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "second step URL", func() bool { return claudeSecondStepURL(login.state) == login.longURL })
	if _, err := WriteOAuthCallbackFileForPendingSession(authDir, "anthropic", login.longState, "code-2", ""); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "login to finish", func() bool { return !IsOAuthSessionPending(login.state, "anthropic") })
	if _, status, _ := GetOAuthSession(login.state); status != "" {
		t.Fatalf("login failed: %s", status)
	}

	raw, err := os.ReadFile(filepath.Join(authDir, claude.CredentialFileName("user@example.com", "org-1", "acct-1")))
	if err != nil {
		t.Fatal(err)
	}
	var saved map[string]any
	if err = json.Unmarshal(raw, &saved); err != nil {
		t.Fatal(err)
	}
	want := map[string]any{
		"access_token":        "sk-ant-oat01-year",
		"refresh_token":       "",
		"usage_access_token":  "sk-ant-oat01-full",
		"usage_refresh_token": "sk-ant-ort01-full",
		"account_name":        "Work",
		"email":               "user@example.com",
	}
	for key, value := range want {
		if saved[key] != value {
			t.Errorf("%s = %v, want %v", key, saved[key], value)
		}
	}
	expire, _ := time.Parse(time.RFC3339, saved["expired"].(string))
	if time.Until(expire) < 364*24*time.Hour {
		t.Errorf("expired = %v, want about a year out", saved["expired"])
	}
}

func registerReconnectTarget(t *testing.T) (*Handler, string) {
	t.Helper()
	manager := coreauth.NewManager(nil, nil, nil)
	auth := &coreauth.Auth{
		ID:       "claude-work.json",
		Provider: "claude",
		Metadata: map[string]any{
			"access_token":        "sk-ant-oat01-year",
			"account_uuid":        "acct-1",
			"organization_uuid":   "org-1",
			"email":               "user@example.com",
			"usage_access_token":  "dead",
			"usage_refresh_token": "dead",
		},
	}
	if _, err := manager.Register(coreauth.WithSkipPersist(context.Background()), auth); err != nil {
		t.Fatal(err)
	}
	return NewHandler(&config.Config{AuthDir: t.TempDir()}, "", manager), auth.ID
}

func runReconnect(t *testing.T, h *Handler, id, state, account string) string {
	t.Helper()
	login := claudeLogin{auth: fakeAnthropic(t, account), state: state, pkce: &claude.PKCECodes{CodeVerifier: "v"}, reconnectID: id}
	RegisterOAuthSession(state, "anthropic")
	defer CancelOAuthSession(state)
	go h.runClaudeLogin(context.Background(), login)
	if _, err := WriteOAuthCallbackFileForPendingSession(h.cfg.AuthDir, "anthropic", state, "code", ""); err != nil {
		t.Fatal(err)
	}
	waitFor(t, "reconnect to finish", func() bool { return !IsOAuthSessionPending(state, "anthropic") })
	_, status, _ := GetOAuthSession(state)
	return status
}

func TestClaudeLimitsReconnectRequiresSameAccount(t *testing.T) {
	h, id := registerReconnectTarget(t)

	if status := runReconnect(t, h, id, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb01", "acct-other"); !strings.Contains(status, "different Claude account") {
		t.Fatalf("status = %q, want a different-account error", status)
	}
	current, _ := h.authManager.GetByID(id)
	if current.Metadata["usage_access_token"] != "dead" {
		t.Fatal("a different account replaced the limits login")
	}

	if status := runReconnect(t, h, id, "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbb02", "acct-1"); status != "" {
		t.Fatalf("status = %q, want success", status)
	}
	current, _ = h.authManager.GetByID(id)
	if current.Metadata["usage_access_token"] != "sk-ant-oat01-full" || current.Metadata["usage_refresh_token"] != "sk-ant-ort01-full" {
		t.Fatalf("usage pair = %v/%v, want the new login", current.Metadata["usage_access_token"], current.Metadata["usage_refresh_token"])
	}
	if current.Metadata["access_token"] != "sk-ant-oat01-year" {
		t.Fatalf("access_token = %v, want the long-lived token untouched", current.Metadata["access_token"])
	}
}
