package handlers

import (
	"context"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/clientpolicy"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/registry"
)

// RequestContext returns the request context for policy evaluation, falling back
// to context.Background when no HTTP request is attached (e.g. in tests).
func RequestContext(c *gin.Context) context.Context {
	if c == nil || c.Request == nil {
		return context.Background()
	}
	return c.Request.Context()
}

// HasManagedClientPolicy reports whether this request carries an explicit client-key policy.
func HasManagedClientPolicy(ctx context.Context) bool {
	decision, ok := clientpolicy.FromContext(ctx)
	return ok && decision.Managed
}

// FilterModelsForClientPolicy removes models that cannot be executed by the
// authenticated client API key. The registry remains the source of truth for
// which providers currently serve each model.
func FilterModelsForClientPolicy(ctx context.Context, models []map[string]any) []map[string]any {
	filtered := make([]map[string]any, 0, len(models))
	modelRegistry := registry.GetGlobalRegistry()
	for _, model := range models {
		id, _ := model["id"].(string)
		if strings.TrimSpace(id) == "" {
			id, _ = model["name"].(string)
		}
		lookupID := strings.TrimPrefix(strings.TrimSpace(id), "models/")
		if lookupID == "" || !clientpolicy.ModelAllowed(ctx, lookupID, modelRegistry.GetModelProviders(lookupID)) {
			continue
		}
		filtered = append(filtered, model)
	}
	return filtered
}
