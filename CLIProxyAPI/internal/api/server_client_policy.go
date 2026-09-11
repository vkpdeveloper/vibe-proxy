package api

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/clientpolicy"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/logging"
	usageledger "github.com/router-for-me/CLIProxyAPI/v7/internal/usage"
	coreusage "github.com/router-for-me/CLIProxyAPI/v7/sdk/cliproxy/usage"
	log "github.com/sirupsen/logrus"
)

func (s *Server) clientAPIKeyPolicyMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		if s == nil || s.clientPolicyManager == nil || c == nil || c.Request == nil {
			c.Next()
			return
		}
		rawKey, exists := c.Get("userApiKey")
		apiKey, _ := rawKey.(string)
		if !exists || strings.TrimSpace(apiKey) == "" {
			c.Next()
			return
		}
		decision := s.clientPolicyManager.Evaluate(apiKey, time.Now())
		c.Set(clientpolicy.GinDecisionKey, decision)
		c.Request = c.Request.WithContext(clientpolicy.WithDecision(c.Request.Context(), decision))
		if !decision.Denied {
			c.Next()
			return
		}
		isModelList := c.Request.Method == http.MethodGet && (c.Request.URL.Path == "/v1/models" || c.Request.URL.Path == "/v1beta/models")
		if isModelList && decision.DenialCode != "api_key_disabled" {
			c.Next()
			return
		}
		status := http.StatusTooManyRequests
		errorType := "rate_limit_error"
		if decision.DenialCode == "api_key_disabled" {
			status = http.StatusForbidden
			errorType = "permission_error"
		}
		resetAt := ""
		if !decision.RetryAt.IsZero() {
			resetAt = decision.RetryAt.UTC().Format(time.RFC3339)
			seconds := int64(time.Until(decision.RetryAt).Seconds())
			if seconds < 1 {
				seconds = 1
			}
			c.Header("Retry-After", strconv.FormatInt(seconds, 10))
			c.Header("X-Usage-Reset", resetAt)
		}
		c.AbortWithStatusJSON(status, gin.H{"error": gin.H{
			"message":  decision.DenialMessage,
			"type":     errorType,
			"code":     decision.DenialCode,
			"reset_at": resetAt,
		}})
	}
}

func (s *Server) updateClientPolicies(cfg *config.Config) {
	if s == nil || cfg == nil {
		return
	}
	if s.clientPolicyManager != nil {
		s.clientPolicyManager.Update(cfg.APIKeys, cfg.ClientAPIKeyPolicies)
	}
	if s.usageStore == nil {
		return
	}
	policies := make(map[string]config.ClientAPIKeyPolicy, len(cfg.ClientAPIKeyPolicies))
	for _, policy := range cfg.ClientAPIKeyPolicies {
		policies[strings.TrimSpace(policy.APIKey)] = policy
	}
	labels := make(map[string]string, len(cfg.APIKeys))
	for _, apiKey := range cfg.APIKeys {
		apiKey = strings.TrimSpace(apiKey)
		if apiKey == "" {
			continue
		}
		policy := policies[apiKey]
		id := strings.TrimSpace(policy.ID)
		if id == "" {
			id = apiKey
		}
		name := strings.TrimSpace(policy.Name)
		if name == "" {
			name = id
		}
		labels[apiKey] = name
	}
	s.usageStore.SetClientKeyLabels(labels)
}

func usageAccountingRequired(cfg *config.Config) bool {
	if cfg == nil {
		return false
	}
	if cfg.UsageStatisticsEnabled {
		return true
	}
	return len(cfg.ClientAPIKeyPolicies) > 0
}

// initUsageLedger wires the persistent usage ledger and client policy manager.
func (s *Server) initUsageLedger(cfg *config.Config) {
	usageStore, errUsageStore := usageledger.NewStore(usageledger.DefaultStoreDirectory(s.configFilePath), logging.ResolveLogDirectory(cfg), usageAccountingRequired(cfg))
	if errUsageStore != nil {
		log.WithError(errUsageStore).Error("failed to initialize persistent usage accounting")
		return
	}
	s.usageStore = usageStore
	s.mgmt.SetUsageStore(usageStore)
	coreusage.RegisterNamedPlugin("persistent-usage-ledger", usageStore)
	s.clientPolicyManager = clientpolicy.NewManager(usageStore)
	s.updateClientPolicies(cfg)
}
