package management

import "testing"

func TestNormalizeRoutingStrategyQuotaDrain(t *testing.T) {
	for _, raw := range []string{"quota-drain", "quotadrain", "qd", " QUOTA-DRAIN "} {
		got, ok := normalizeRoutingStrategy(raw)
		if !ok || got != "quota-drain" {
			t.Fatalf("normalizeRoutingStrategy(%q) = %q, %t; want quota-drain, true", raw, got, ok)
		}
	}
}
