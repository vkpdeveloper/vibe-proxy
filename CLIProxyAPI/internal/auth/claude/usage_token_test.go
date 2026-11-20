package claude

import (
	"context"
	"io"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"

	coreauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
)

// The long-lived login must reproduce `claude setup-token` (Claude Code
// 2.1.329): inference-only scope, and the code exchange asking for a one-year
// token as the last body key, with no profile or roles lookups.
func TestLongLivedLoginMatchesSetupToken(t *testing.T) {
	svc := &ClaudeAuth{}
	authURL, err := svc.GenerateLongLivedAuthURL("state-2", &PKCECodes{CodeChallenge: "challenge"})
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := url.Parse(authURL)
	if err != nil {
		t.Fatal(err)
	}
	if got := parsed.Query().Get("scope"); got != "user:inference" {
		t.Fatalf("scope = %q, want user:inference", got)
	}
	if got := parsed.Query().Get("redirect_uri"); got != RedirectURI {
		t.Fatalf("redirect_uri = %q, want %q", got, RedirectURI)
	}

	var requests []string
	var body string
	svc.httpClient = &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		requests = append(requests, req.URL.String())
		raw, _ := io.ReadAll(req.Body)
		body = string(raw)
		return jsonResponse(req, `{"access_token":"sk-ant-oat01-long","expires_in":31536000,"account":{"uuid":"acct-1"}}`), nil
	})}

	token, err := svc.ExchangeCodeForLongLivedToken(context.Background(), "code#state-2", "state-2", &PKCECodes{CodeVerifier: "verifier"})
	if err != nil {
		t.Fatal(err)
	}
	if len(requests) != 1 || requests[0] != TokenURL {
		t.Fatalf("requests = %v, want only the token exchange", requests)
	}
	wantBody := `{"grant_type":"authorization_code","code":"code","redirect_uri":"` + RedirectURI + `","client_id":"` + ClientID + `","code_verifier":"verifier","state":"state-2","expires_in":31536000}`
	if body != wantBody {
		t.Fatalf("exchange body = %s, want %s", body, wantBody)
	}
	if token.AccessToken != "sk-ant-oat01-long" || token.AccountUUID != "acct-1" {
		t.Fatalf("token = %#v", token)
	}
	expire, err := time.Parse(time.RFC3339, token.Expire)
	if err != nil || time.Until(expire) < 364*24*time.Hour {
		t.Fatalf("expire = %q, want about a year out", token.Expire)
	}
}

func registerLongLivedAuth(t *testing.T, usageExpire time.Time) (*coreauth.Manager, *coreauth.Auth) {
	t.Helper()
	manager := coreauth.NewManager(nil, nil, nil)
	auth := &coreauth.Auth{
		ID:       "claude-test.json",
		Provider: "claude",
		Metadata: map[string]any{
			"type":               "claude",
			"access_token":       "sk-ant-oat01-long",
			UsageAccessTokenKey:  "usage-old",
			UsageRefreshTokenKey: "refresh-old",
			UsageExpiredKey:      usageExpire.Format(time.RFC3339),
		},
	}
	registered, err := manager.Register(coreauth.WithSkipPersist(context.Background()), auth)
	if err != nil {
		t.Fatal(err)
	}
	return manager, registered
}

func TestEnsureUsageTokenRefreshesOnlyTheLimitsLogin(t *testing.T) {
	resetClaudeRefreshState()
	defer resetClaudeRefreshState()
	manager, auth := registerLongLivedAuth(t, time.Now().Add(-time.Minute))

	var refreshBody string
	svc := &ClaudeAuth{httpClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		switch req.URL.String() {
		case RefreshTokenURL:
			raw, _ := io.ReadAll(req.Body)
			refreshBody = string(raw)
			return jsonResponse(req, `{"access_token":"usage-new","refresh_token":"refresh-new","expires_in":28800}`), nil
		case ProfileURL:
			return jsonResponse(req, `{"account":{"uuid":"acct-1","email":"user@example.com"}}`), nil
		}
		t.Fatalf("unexpected request %s", req.URL)
		return nil, nil
	})}}

	token, err := EnsureUsageToken(coreauth.WithSkipPersist(context.Background()), svc, manager, auth)
	if err != nil {
		t.Fatal(err)
	}
	if token != "usage-new" {
		t.Fatalf("token = %q, want usage-new", token)
	}
	if !strings.Contains(refreshBody, `"refresh_token":"refresh-old"`) {
		t.Fatalf("refresh body = %s, want the limits refresh token", refreshBody)
	}
	latest, _ := manager.GetByID(auth.ID)
	if got := latest.Metadata["access_token"]; got != "sk-ant-oat01-long" {
		t.Fatalf("access_token = %v, want the long-lived token untouched", got)
	}
	if latest.Metadata[UsageAccessTokenKey] != "usage-new" || latest.Metadata[UsageRefreshTokenKey] != "refresh-new" {
		t.Fatalf("usage pair = %v/%v, want the refreshed pair", latest.Metadata[UsageAccessTokenKey], latest.Metadata[UsageRefreshTokenKey])
	}
}

func TestEnsureUsageTokenUsesFreshTokenWithoutNetwork(t *testing.T) {
	manager, auth := registerLongLivedAuth(t, time.Now().Add(time.Hour))
	svc := &ClaudeAuth{httpClient: &http.Client{Transport: roundTripFunc(func(req *http.Request) (*http.Response, error) {
		t.Fatalf("unexpected request %s", req.URL)
		return nil, nil
	})}}
	token, err := EnsureUsageToken(context.Background(), svc, manager, auth)
	if err != nil || token != "usage-old" {
		t.Fatalf("token = %q, err = %v, want usage-old", token, err)
	}
}
