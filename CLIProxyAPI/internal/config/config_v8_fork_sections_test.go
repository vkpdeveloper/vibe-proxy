package config

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// Client API key policies and quota-drain routing are fork sections. The v8
// migration must keep them live instead of archiving them as comments, or a
// restricted client key would silently lose its limits on the next save.
func TestV8MigrationKeepsForkSections(t *testing.T) {
	raw := `port: 8317
api-keys:
  - client-key
routing:
  strategy: quota-drain
  quota-drain:
    refresh-interval: 5m
    stale-after: 10m
api-key-policies:
  - id: policy-1
    api-key: client-key
    allowed-providers: [codex]
    daily-limit-usd: 100
`
	out, _, err := NormalizeConfigLayout([]byte(raw), true)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(out), "# api-key-policies") {
		t.Fatalf("api-key-policies was commented out:\n%s", out)
	}
	if err = ValidateV8Config(out); err != nil {
		t.Fatalf("migrated config is not valid v8: %v\n%s", err, out)
	}
	var cfg Config
	if err = yaml.Unmarshal(out, &cfg); err != nil {
		t.Fatal(err)
	}
	if len(cfg.ClientAPIKeyPolicies) != 1 || cfg.ClientAPIKeyPolicies[0].APIKey != "client-key" || cfg.ClientAPIKeyPolicies[0].DailyLimitUSD != 100 {
		t.Fatalf("policies = %+v", cfg.ClientAPIKeyPolicies)
	}
	if cfg.Routing.Strategy != "quota-drain" || cfg.Routing.QuotaDrain.RefreshInterval != "5m" || cfg.Routing.QuotaDrain.StaleAfter != "10m" {
		t.Fatalf("routing = %+v", cfg.Routing)
	}
	if len(cfg.APIKeys) != 1 || cfg.APIKeys[0] != "client-key" {
		t.Fatalf("api keys = %v", cfg.APIKeys)
	}
}
