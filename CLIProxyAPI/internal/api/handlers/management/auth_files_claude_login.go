package management

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/auth/claude"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/misc"
	coreauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
	log "github.com/sirupsen/logrus"
)

// A web UI Claude login mints a long-lived credential in two consents (see
// internal/auth/claude/usage_token.go). Step 1 is the normal full-scope login,
// which provides the account identity and the limits login. Step 2 repeats the
// authorize flow with the inference-only scope and a one-year expiry, exactly
// like `claude setup-token`; that token serves all proxied traffic.
//
// The browser is chained from step 1 to step 2 two ways: the local callback
// redirects straight to the second consent, and the status endpoint publishes
// next_url for browsers that cannot reach the callback port and paste the
// callback URL instead.
//
// With ?reconnect=<auth id>, only step 1 runs and its tokens replace the limits
// login of that credential, keeping its long-lived token untouched.

const (
	maxClaudeAccountNameLength = 64
	claudeCallbackTimeout      = 5 * time.Minute
)

var (
	// step-1 state -> step-2 authorize URL, read by the local callback redirect.
	claudeChainedAuthURLs sync.Map
	// step-1 state -> step-2 authorize URL, published once step 1 has finished.
	claudeSecondStepURLs sync.Map
)

// ClaudeChainedAuthURL returns the second consent URL that the callback for a
// step-1 state should redirect the browser to, or "" when there is none.
func ClaudeChainedAuthURL(state string) string {
	value, _ := claudeChainedAuthURLs.Load(strings.TrimSpace(state))
	url, _ := value.(string)
	return url
}

func claudeSecondStepURL(state string) string {
	value, _ := claudeSecondStepURLs.Load(state)
	url, _ := value.(string)
	return url
}

type claudeLogin struct {
	auth        *claude.ClaudeAuth
	state       string
	pkce        *claude.PKCECodes
	accountName string
	reconnectID string
	// Set only for a long-lived login.
	longState string
	longPKCE  *claude.PKCECodes
	longURL   string
}

func (h *Handler) RequestAnthropicToken(c *gin.Context) {
	ctx := PopulateAuthContext(context.Background(), c)
	isWebUI := isWebUIRequest(c)

	accountName := strings.TrimSpace(c.Query("name"))
	if utf8.RuneCountInString(accountName) > maxClaudeAccountNameLength {
		c.JSON(http.StatusBadRequest, gin.H{"error": fmt.Sprintf("name must be at most %d characters", maxClaudeAccountNameLength)})
		return
	}
	reconnectID := strings.TrimSpace(c.Query("reconnect"))
	if reconnectID != "" {
		target, ok := h.authManager.GetByID(reconnectID)
		if !ok || target == nil || !strings.EqualFold(strings.TrimSpace(target.Provider), "claude") {
			c.JSON(http.StatusNotFound, gin.H{"error": "credential not found"})
			return
		}
		if !claude.HasUsageLogin(target.Metadata) {
			c.JSON(http.StatusBadRequest, gin.H{"error": "credential has no long-lived token, log in again instead"})
			return
		}
	}

	login := claudeLogin{
		auth:        claude.NewClaudeAuth(h.cfg),
		accountName: accountName,
		reconnectID: reconnectID,
	}
	var err error
	if login.pkce, err = claude.GeneratePKCECodes(); err != nil {
		log.Errorf("Failed to generate PKCE codes: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate PKCE codes"})
		return
	}
	if login.state, err = misc.GenerateRandomState(); err != nil {
		log.Errorf("Failed to generate state parameter: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate state parameter"})
		return
	}
	authURL, _, err := login.auth.GenerateAuthURL(login.state, login.pkce)
	if err != nil {
		log.Errorf("Failed to generate authorization URL: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate authorization url"})
		return
	}

	// The CLI and TUI paste a single callback, so only the web UI chains the
	// second consent. Their logins stay on the refreshable token.
	if isWebUI && reconnectID == "" {
		if login.longPKCE, err = claude.GeneratePKCECodes(); err != nil {
			log.Errorf("Failed to generate PKCE codes: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate PKCE codes"})
			return
		}
		if login.longState, err = misc.GenerateRandomState(); err != nil {
			log.Errorf("Failed to generate state parameter: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate state parameter"})
			return
		}
		if login.longURL, err = login.auth.GenerateLongLivedAuthURL(login.longState, login.longPKCE); err != nil {
			log.Errorf("Failed to generate long-lived authorization URL: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate authorization url"})
			return
		}
	}

	var forwarder *callbackForwarder
	if isWebUI {
		targetURL, errTarget := h.managementCallbackURL("/anthropic/callback")
		if errTarget != nil {
			log.WithError(errTarget).Error("failed to compute anthropic callback target")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "callback server unavailable"})
			return
		}
		var errStart error
		if forwarder, errStart = startCallbackForwarder(anthropicCallbackPort, "anthropic", targetURL); errStart != nil {
			log.WithError(errStart).Error("failed to start anthropic callback forwarder")
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start callback server"})
			return
		}
	}

	RegisterOAuthSession(login.state, "anthropic")
	if login.longState != "" {
		RegisterOAuthSession(login.longState, "anthropic")
		claudeChainedAuthURLs.Store(login.state, login.longURL)
	}

	go func() {
		if forwarder != nil {
			defer stopCallbackForwarderInstance(anthropicCallbackPort, forwarder)
		}
		defer claudeChainedAuthURLs.Delete(login.state)
		defer claudeSecondStepURLs.Delete(login.state)
		h.runClaudeLogin(ctx, login)
		if login.longState != "" && IsOAuthSessionPending(login.longState, "anthropic") {
			CancelOAuthSession(login.longState)
		}
	}()

	c.JSON(http.StatusOK, gin.H{"status": "ok", "url": authURL, "state": login.state})
}

func (h *Handler) runClaudeLogin(ctx context.Context, login claudeLogin) {
	code, ok := h.waitClaudeCallback(login.state, login.state)
	if !ok {
		return
	}
	bundle, errExchange := login.auth.ExchangeCodeForTokens(ctx, code, login.state, login.pkce)
	if errExchange != nil {
		log.Errorf("Failed to exchange authorization code for tokens: %v", claude.NewAuthenticationError(claude.ErrCodeExchangeFailed, errExchange))
		SetOAuthSessionError(login.state, "Failed to exchange authorization code for tokens")
		return
	}

	if login.reconnectID != "" {
		h.reconnectClaudeLimits(ctx, login, bundle)
		return
	}

	storage := login.auth.CreateTokenStorage(bundle)
	storage.AccountName = login.accountName
	if login.longState != "" {
		claudeSecondStepURLs.Store(login.state, login.longURL)
		longCode, okLong := h.waitClaudeCallback(login.state, login.longState)
		if !okLong {
			return
		}
		token, errLong := login.auth.ExchangeCodeForLongLivedToken(ctx, longCode, login.longState, login.longPKCE)
		if errLong != nil {
			log.Errorf("Failed to exchange long-lived authorization code: %v", errLong)
			SetOAuthSessionError(login.state, "Failed to get the long-lived token")
			return
		}
		if token.AccountUUID != "" && storage.AccountUUID != "" && !strings.EqualFold(token.AccountUUID, storage.AccountUUID) {
			SetOAuthSessionError(login.state, "The two approvals used different Claude accounts")
			return
		}
		// The full-scope login becomes the limits login; the one-year token
		// serves traffic and has nothing to refresh.
		storage.UsageAccessToken = storage.AccessToken
		storage.UsageRefreshToken = storage.RefreshToken
		storage.UsageExpire = storage.Expire
		storage.AccessToken = token.AccessToken
		storage.RefreshToken = ""
		storage.Expire = token.Expire
	}

	metadata := map[string]any{"email": storage.Email}
	if storage.AccountUUID != "" {
		metadata["account_uuid"] = storage.AccountUUID
	}
	if storage.OrganizationUUID != "" {
		metadata["organization_uuid"] = storage.OrganizationUUID
	}
	if storage.OrganizationName != "" {
		metadata["organization_name"] = storage.OrganizationName
	}
	if storage.AccountName != "" {
		metadata[claude.AccountNameKey] = storage.AccountName
	}
	if storage.UsageRefreshToken != "" || storage.UsageAccessToken != "" {
		claude.SetUsageTokens(metadata, storage.UsageAccessToken, storage.UsageRefreshToken, storage.UsageExpire)
	}
	if len(storage.DeviceIDs) > 0 {
		metadata[claude.ClaudeDeviceIDsMetadataKey] = append([]string(nil), storage.DeviceIDs...)
	}
	fileName := claude.CredentialFileName(storage.Email, storage.OrganizationUUID, storage.AccountUUID)
	record := &coreauth.Auth{
		ID:       fileName,
		Provider: "claude",
		FileName: fileName,
		Storage:  storage,
		Metadata: metadata,
	}
	if errGuard := guardOAuthSessionPendingForSave(login.state, "anthropic"); errGuard != nil {
		return
	}
	savedPath, errSave := h.saveTokenRecord(ctx, record)
	if errSave != nil {
		log.Errorf("Failed to save authentication tokens: %v", errSave)
		SetOAuthSessionError(login.state, "Failed to save authentication tokens")
		return
	}
	log.Infof("Claude authentication saved to %s (long-lived: %t)", savedPath, login.longState != "")
	if login.longState != "" {
		CompleteOAuthSession(login.longState)
	}
	CompleteOAuthSession(login.state)
}

// reconnectClaudeLimits replaces the limits login of an existing long-lived
// credential. It refuses a different account so limits can never be shown for
// the wrong subscription.
func (h *Handler) reconnectClaudeLimits(ctx context.Context, login claudeLogin, bundle *claude.ClaudeAuthBundle) {
	target, ok := h.authManager.GetByID(login.reconnectID)
	if !ok || target == nil {
		SetOAuthSessionError(login.state, "Credential no longer exists")
		return
	}
	wantAccount := stringValue(target.Metadata, "account_uuid")
	gotAccount := strings.TrimSpace(bundle.TokenData.AccountUUID)
	wantOrg := stringValue(target.Metadata, "organization_uuid")
	gotOrg := strings.TrimSpace(bundle.TokenData.OrganizationUUID)
	if wantAccount == "" || !strings.EqualFold(wantAccount, gotAccount) || (wantOrg != "" && gotOrg != "" && !strings.EqualFold(wantOrg, gotOrg)) {
		message := "Signed in to a different Claude account"
		if email := stringValue(target.Metadata, "email"); email != "" {
			message = fmt.Sprintf("Signed in to a different Claude account, use %s", email)
		}
		SetOAuthSessionError(login.state, message)
		return
	}
	if errGuard := guardOAuthSessionPendingForSave(login.state, "anthropic"); errGuard != nil {
		return
	}
	_, committed, errModify := h.authManager.Modify(ctx, login.reconnectID, 0, func(current *coreauth.Auth) error {
		if current.Metadata == nil {
			current.Metadata = make(map[string]any)
		}
		claude.SetUsageTokens(current.Metadata, bundle.TokenData.AccessToken, bundle.TokenData.RefreshToken, bundle.TokenData.Expire)
		return nil
	})
	if errModify != nil || !committed {
		log.Errorf("Failed to save Claude limits login for %s: %v", login.reconnectID, errModify)
		SetOAuthSessionError(login.state, "Failed to save authentication tokens")
		return
	}
	CompleteOAuthSession(login.state)
}

// waitClaudeCallback waits for the callback file of waitState while the login
// identified by visibleState (the one the UI polls) is still pending. Failures
// are reported on visibleState.
func (h *Handler) waitClaudeCallback(visibleState, waitState string) (string, bool) {
	path := filepath.Join(h.cfg.AuthDir, fmt.Sprintf(".oauth-anthropic-%s.oauth", waitState))
	deadline := time.Now().Add(claudeCallbackTimeout)
	var result map[string]string
	for {
		if !IsOAuthSessionPending(visibleState, "anthropic") || !IsOAuthSessionPending(waitState, "anthropic") {
			return "", false
		}
		if time.Now().After(deadline) {
			log.Error(claude.GetUserFriendlyMessage(claude.NewAuthenticationError(claude.ErrCallbackTimeout, fmt.Errorf("timeout waiting for OAuth callback"))))
			SetOAuthSessionError(visibleState, "Timeout waiting for OAuth callback")
			return "", false
		}
		data, errRead := os.ReadFile(path)
		if errRead == nil {
			_ = json.Unmarshal(data, &result)
			_ = os.Remove(path)
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if errStr := result["error"]; errStr != "" {
		log.Error(claude.GetUserFriendlyMessage(claude.NewOAuthError(errStr, "", http.StatusBadRequest)))
		SetOAuthSessionError(visibleState, "Bad request")
		return "", false
	}
	if result["state"] != waitState {
		log.Error(claude.GetUserFriendlyMessage(claude.NewAuthenticationError(claude.ErrInvalidState, fmt.Errorf("expected %s, got %s", waitState, result["state"]))))
		SetOAuthSessionError(visibleState, "State code error")
		return "", false
	}
	// Claude may append the state after '#'.
	return strings.Split(result["code"], "#")[0], true
}
