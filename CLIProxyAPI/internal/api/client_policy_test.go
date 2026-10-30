package api

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/clientpolicy"
	proxyconfig "github.com/router-for-me/CLIProxyAPI/v8/internal/config"
)

type policyUsageReader struct{ usage clientpolicy.UsageSnapshot }

func (r policyUsageReader) ClientUsage(string, time.Time, time.Time, time.Time) clientpolicy.UsageSnapshot {
	return r.usage
}

func TestClientAPIKeyPolicyMiddlewareBlocksAtDailyLimit(t *testing.T) {
	gin.SetMode(gin.TestMode)
	manager := clientpolicy.NewManager(policyUsageReader{usage: clientpolicy.UsageSnapshot{DailyUSD: 1}})
	manager.Update([]string{"limited"}, []proxyconfig.ClientAPIKeyPolicy{{APIKey: "limited", DailyLimitUSD: 1}})
	server := &Server{clientPolicyManager: manager}
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("userApiKey", "limited"); c.Next() })
	router.Use(server.clientAPIKeyPolicyMiddleware())
	router.POST("/v1/chat/completions", func(c *gin.Context) { c.Status(http.StatusNoContent) })
	router.GET("/v1/models", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	blocked := httptest.NewRecorder()
	router.ServeHTTP(blocked, httptest.NewRequest(http.MethodPost, "/v1/chat/completions", nil))
	if blocked.Code != http.StatusTooManyRequests {
		t.Fatalf("status=%d body=%s", blocked.Code, blocked.Body.String())
	}
	if blocked.Header().Get("Retry-After") == "" || blocked.Header().Get("X-Usage-Reset") == "" {
		t.Fatalf("missing retry headers: %#v", blocked.Header())
	}

	models := httptest.NewRecorder()
	router.ServeHTTP(models, httptest.NewRequest(http.MethodGet, "/v1/models", nil))
	if models.Code != http.StatusNoContent {
		t.Fatalf("model list status=%d body=%s", models.Code, models.Body.String())
	}
}

func TestClientAPIKeyPolicyMiddlewareBlocksDisabledKeyEverywhere(t *testing.T) {
	gin.SetMode(gin.TestMode)
	manager := clientpolicy.NewManager(nil)
	manager.Update([]string{"disabled"}, []proxyconfig.ClientAPIKeyPolicy{{APIKey: "disabled", Disabled: true}})
	server := &Server{clientPolicyManager: manager}
	router := gin.New()
	router.Use(func(c *gin.Context) { c.Set("userApiKey", "disabled"); c.Next() })
	router.Use(server.clientAPIKeyPolicyMiddleware())
	router.GET("/v1/models", func(c *gin.Context) { c.Status(http.StatusNoContent) })

	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodGet, "/v1/models", nil))
	if recorder.Code != http.StatusForbidden {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestClientKeyLabelsUseUsageKeyIDsAndMaskUnnamedKeys(t *testing.T) {
	labels := clientKeyLabels(&proxyconfig.Config{
		SDKConfig: proxyconfig.SDKConfig{APIKeys: []string{"stable", "hashed", "unnamed"}},
		ClientAPIKeyPolicies: []proxyconfig.ClientAPIKeyPolicy{
			{APIKey: "stable", ID: "50d09941a032bfea", Name: "Raghav"},
			{APIKey: "hashed", Name: "sandbox"},
			{APIKey: "unnamed", ID: "d1c3f106"},
		},
	})
	want := map[string]string{
		"50d09941a032bfea":                 "Raghav",
		clientpolicy.ClientKeyID("hashed"): "sandbox",
		"d1c3f106":                         "Key " + clientpolicy.MaskAPIKey("unnamed"),
	}
	if len(labels) != len(want) {
		t.Fatalf("labels = %#v", labels)
	}
	for id, name := range want {
		if labels[id] != name {
			t.Fatalf("labels = %#v, want %#v", labels, want)
		}
	}
}
