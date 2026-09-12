package quotadrain

import (
	"context"
	"strings"
	"sync"
	"time"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	coreauth "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/auth"
	log "github.com/sirupsen/logrus"
)

const (
	DefaultRefreshInterval = 5 * time.Minute
	DefaultStaleAfter      = 10 * time.Minute
	MinimumRefreshInterval = 30 * time.Second
	maxWorkers             = 4
)

// Settings controls the proactive quota collector.
type Settings struct {
	Enabled         bool
	RefreshInterval time.Duration
	StaleAfter      time.Duration
}

// SettingsFromConfig normalizes quota-drain routing configuration.
func SettingsFromConfig(routing config.RoutingConfig) Settings {
	strategy := strings.ToLower(strings.TrimSpace(routing.Strategy))
	enabled := strategy == "quota-drain" || strategy == "quotadrain" || strategy == "qd"
	refreshInterval := positiveDuration(routing.QuotaDrain.RefreshInterval, DefaultRefreshInterval)
	if refreshInterval < MinimumRefreshInterval {
		refreshInterval = MinimumRefreshInterval
	}
	return Settings{
		Enabled:         enabled,
		RefreshInterval: refreshInterval,
		StaleAfter:      positiveDuration(routing.QuotaDrain.StaleAfter, DefaultStaleAfter),
	}
}

func positiveDuration(raw string, fallback time.Duration) time.Duration {
	parsed, err := time.ParseDuration(strings.TrimSpace(raw))
	if err != nil || parsed <= 0 {
		return fallback
	}
	return parsed
}

// Collector periodically acquires provider quota metadata for OAuth auths and
// explicit quota-tracker credentials such as OpenCode Go API keys.
type Collector struct {
	manager *coreauth.Manager

	mu       sync.RWMutex
	settings Settings
	cancel   context.CancelFunc
	wake     chan struct{}
}

// NewCollector creates a quota collector backed by manager.
func NewCollector(manager *coreauth.Manager) *Collector {
	collector := &Collector{manager: manager, wake: make(chan struct{}, 1)}
	if manager != nil {
		manager.SetQuotaRefreshNotifier(collector.Wake)
	}
	return collector
}

// Start launches the collector. Calling Start again updates settings and wakes
// the existing loop instead of creating a second one.
func (c *Collector) Start(parent context.Context, settings Settings) {
	if c == nil || c.manager == nil {
		return
	}
	if parent == nil {
		parent = context.Background()
	}
	c.mu.Lock()
	c.settings = normalizeSettings(settings)
	if c.cancel != nil {
		c.mu.Unlock()
		c.Wake()
		return
	}
	ctx, cancel := context.WithCancel(parent)
	c.cancel = cancel
	c.mu.Unlock()
	go c.run(ctx)
}

// Update changes collection settings and requests an immediate refresh when enabled.
func (c *Collector) Update(settings Settings) {
	if c == nil {
		return
	}
	c.mu.Lock()
	c.settings = normalizeSettings(settings)
	c.mu.Unlock()
	c.Wake()
}

// Wake requests a collection pass without blocking the caller.
func (c *Collector) Wake() {
	if c == nil {
		return
	}
	select {
	case c.wake <- struct{}{}:
	default:
	}
}

// Stop cancels quota collection. It does not touch auth runtime or file state.
func (c *Collector) Stop() {
	if c == nil {
		return
	}
	c.mu.Lock()
	cancel := c.cancel
	c.cancel = nil
	c.mu.Unlock()
	if cancel != nil {
		cancel()
	}
}

func normalizeSettings(settings Settings) Settings {
	if settings.RefreshInterval <= 0 {
		settings.RefreshInterval = DefaultRefreshInterval
	}
	if settings.RefreshInterval < MinimumRefreshInterval {
		settings.RefreshInterval = MinimumRefreshInterval
	}
	if settings.StaleAfter <= 0 {
		settings.StaleAfter = DefaultStaleAfter
	}
	return settings
}

func (c *Collector) currentSettings() Settings {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.settings
}

func (c *Collector) run(ctx context.Context) {
	timer := time.NewTimer(0)
	defer timer.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-timer.C:
		case <-c.wake:
		}

		settings := c.currentSettings()
		if settings.Enabled {
			c.collect(ctx, settings)
		}
		if ctx.Err() != nil {
			return
		}
		interval := settings.RefreshInterval
		if interval <= 0 {
			interval = DefaultRefreshInterval
		}
		resetTimer(timer, jitteredInterval(interval))
	}
}

func resetTimer(timer *time.Timer, interval time.Duration) {
	if !timer.Stop() {
		select {
		case <-timer.C:
		default:
		}
	}
	timer.Reset(interval)
}

func jitteredInterval(interval time.Duration) time.Duration {
	span := interval / 5
	if span <= 0 {
		return interval
	}
	offset := time.Duration(time.Now().UnixNano()%int64(span)) - span/2
	return interval + offset
}

func (c *Collector) collect(ctx context.Context, settings Settings) {
	auths := c.manager.List()
	jobs := make(chan *coreauth.Auth)
	workers := maxWorkers
	if len(auths) < workers {
		workers = len(auths)
	}
	if workers == 0 {
		return
	}

	var wg sync.WaitGroup
	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for auth := range jobs {
				c.collectAuth(ctx, auth, settings.StaleAfter)
			}
		}()
	}

	for _, auth := range auths {
		if !supportedAuth(auth) {
			continue
		}
		select {
		case <-ctx.Done():
			close(jobs)
			wg.Wait()
			return
		case jobs <- auth:
		}
	}
	close(jobs)
	wg.Wait()
}

func supportedAuth(auth *coreauth.Auth) bool {
	if auth == nil || auth.Disabled || auth.Status == coreauth.StatusDisabled {
		return false
	}
	provider := strings.ToLower(strings.TrimSpace(auth.Provider))
	if provider == "opencode-go" {
		// OpenCode Go is quota-only, so the useful eligibility check is the
		// presence of the API key itself. File-backed tracker credentials can be
		// synthesized before auth-kind attributes are normalized.
		return authString(auth, "api_key", "api-key") != ""
	}
	if auth.AuthKind() != coreauth.AuthKindOAuth {
		return false
	}
	switch provider {
	case "claude", "codex", "cursor", "kimi", "xai", "antigravity":
		return true
	default:
		return false
	}
}

func (c *Collector) collectAuth(ctx context.Context, auth *coreauth.Auth, staleAfter time.Duration) {
	if auth == nil || ctx.Err() != nil {
		return
	}
	provider := strings.ToLower(strings.TrimSpace(auth.Provider))
	attemptedAt := time.Now().UTC()
	windows, err := fetchProviderCapacity(ctx, c.manager, auth, provider, attemptedAt)
	state := auth.Capacity
	state.Provider = provider
	state.Supported = true
	state.LastAttemptAt = attemptedAt
	if err != nil {
		state.LastError = safeError(err)
		c.manager.UpdateCapacity(auth.ID, state)
		if ctx.Err() == nil {
			log.WithFields(log.Fields{"auth_id": auth.ID, "provider": provider}).Debugf("quota-drain refresh failed: %v", err)
		}
		return
	}
	state.FetchedAt = attemptedAt
	state.StaleAt = attemptedAt.Add(staleAfter)
	state.LastError = ""
	state.Windows = windows
	c.manager.UpdateCapacity(auth.ID, state)
}

func safeError(err error) string {
	if err == nil {
		return ""
	}
	message := strings.TrimSpace(err.Error())
	if len(message) > 240 {
		message = message[:240]
	}
	return message
}
