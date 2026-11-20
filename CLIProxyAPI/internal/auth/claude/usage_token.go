package claude

import (
	"context"
	"fmt"
	"strings"
	"time"

	coreauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
	log "github.com/sirupsen/logrus"
)

// Long-lived Claude credentials keep two token sets. access_token is the
// one-year inference-only token (what `claude setup-token` mints) and serves
// every proxied request. The usage_* pair is a normal full-scope login used only
// for account endpoints such as /api/oauth/usage, which the inference-only token
// cannot read. When the usage pair dies, limits stop showing but traffic keeps
// flowing, and the pair can be replaced without touching access_token.
const (
	UsageAccessTokenKey  = "usage_access_token"
	UsageRefreshTokenKey = "usage_refresh_token"
	UsageExpiredKey      = "usage_expired"
	AccountNameKey       = "account_name"

	// Renew well before expiry so a missed collector cycle or a short outage
	// never lets the limits login lapse.
	usageRefreshLead = time.Hour
	// usageKeeperInterval must stay well below usageRefreshLead.
	usageKeeperInterval = 15 * time.Minute
)

func metadataText(metadata map[string]any, key string) string {
	value, _ := metadata[key].(string)
	return strings.TrimSpace(value)
}

// HasUsageLogin reports whether metadata carries a separate limits login, which
// marks the credential as long-lived.
func HasUsageLogin(metadata map[string]any) bool {
	return metadataText(metadata, UsageAccessTokenKey) != "" || metadataText(metadata, UsageRefreshTokenKey) != ""
}

// UsageAccessToken returns the stored limits access token without refreshing it.
func UsageAccessToken(metadata map[string]any) string {
	return metadataText(metadata, UsageAccessTokenKey)
}

// SetUsageTokens stores a full-scope token set as the limits login.
func SetUsageTokens(metadata map[string]any, accessToken, refreshToken, expire string) {
	metadata[UsageAccessTokenKey] = accessToken
	metadata[UsageRefreshTokenKey] = refreshToken
	metadata[UsageExpiredKey] = expire
}

func usageTokenFresh(metadata map[string]any, now time.Time) bool {
	if UsageAccessToken(metadata) == "" {
		return false
	}
	expire, err := time.Parse(time.RFC3339, metadataText(metadata, UsageExpiredKey))
	return err == nil && expire.After(now.Add(usageRefreshLead))
}

// EnsureUsageToken returns a usable limits access token for a long-lived
// credential, refreshing the usage pair and persisting it through manager when
// it is close to expiry. Refresh tokens are single-use, so the refresh runs under
// the manager's per-auth mutation gate and re-checks the latest stored pair.
func EnsureUsageToken(ctx context.Context, svc *ClaudeAuth, manager *coreauth.Manager, auth *coreauth.Auth) (string, error) {
	if auth == nil || !HasUsageLogin(auth.Metadata) {
		return "", fmt.Errorf("claude credential has no limits login")
	}
	if usageTokenFresh(auth.Metadata, time.Now()) {
		return UsageAccessToken(auth.Metadata), nil
	}
	if manager == nil || svc == nil {
		return "", fmt.Errorf("claude limits token expired and cannot be refreshed here")
	}
	var token string
	_, _, errModify := manager.Modify(ctx, auth.ID, 0, func(current *coreauth.Auth) error {
		if current.Metadata == nil {
			current.Metadata = make(map[string]any)
		}
		if usageTokenFresh(current.Metadata, time.Now()) {
			token = UsageAccessToken(current.Metadata)
			return nil
		}
		refreshToken := metadataText(current.Metadata, UsageRefreshTokenKey)
		if refreshToken == "" {
			return fmt.Errorf("claude limits login has no refresh token")
		}
		td, errRefresh := svc.RefreshTokens(ctx, refreshToken)
		if errRefresh != nil {
			return fmt.Errorf("refresh claude limits login: %w", errRefresh)
		}
		nextRefresh := td.RefreshToken
		if nextRefresh == "" {
			// Not rotated: the current refresh token stays valid.
			nextRefresh = refreshToken
		}
		SetUsageTokens(current.Metadata, td.AccessToken, nextRefresh, td.Expire)
		token = td.AccessToken
		return nil
	})
	if errModify != nil {
		return "", errModify
	}
	if token == "" {
		return "", fmt.Errorf("claude credential %s is no longer registered", auth.ID)
	}
	return token, nil
}

// KeepUsageTokensFresh renews every long-lived credential's limits login ahead
// of expiry until ctx ends. It runs regardless of routing strategy and also
// covers disabled credentials, which the quota collector skips, so limits and
// resets keep working without a reconnect.
func KeepUsageTokensFresh(ctx context.Context, manager *coreauth.Manager) {
	if manager == nil {
		return
	}
	ticker := time.NewTicker(usageKeeperInterval)
	defer ticker.Stop()
	for {
		renewUsageTokens(ctx, manager, func(auth *coreauth.Auth) *ClaudeAuth {
			return NewClaudeAuthWithProxyURL(nil, auth.ProxyURL)
		})
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
		}
	}
}

func renewUsageTokens(ctx context.Context, manager *coreauth.Manager, newService func(*coreauth.Auth) *ClaudeAuth) {
	now := time.Now()
	for _, auth := range manager.List() {
		if auth == nil || !strings.EqualFold(auth.Provider, "claude") || !HasUsageLogin(auth.Metadata) || usageTokenFresh(auth.Metadata, now) {
			continue
		}
		if _, err := EnsureUsageToken(ctx, newService(auth), manager, auth); err != nil {
			log.WithField("auth_id", auth.ID).Warnf("claude limits login refresh failed: %v", err)
		}
	}
}
