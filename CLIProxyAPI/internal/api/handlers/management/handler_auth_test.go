package management

import (
	"net/http"
	"testing"

	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
	"golang.org/x/crypto/bcrypt"
)

func newEnvOnlyAuthHandler(t *testing.T) *Handler {
	t.Helper()
	configHash, err := bcrypt.GenerateFromPassword([]byte("config-secret"), bcrypt.MinCost)
	if err != nil {
		t.Fatalf("hash config secret: %v", err)
	}
	cfg := &config.Config{}
	cfg.RemoteManagement.AllowRemote = true
	cfg.RemoteManagement.SecretKey = string(configHash)
	cfg.APIKeys = []string{"client-api-key"}
	return &Handler{
		cfg:                 cfg,
		failedAttempts:      make(map[string]*attemptInfo),
		envSecret:           "env-secret",
		allowRemoteOverride: true,
		localPassword:       "local-password",
	}
}

func TestAuthenticateManagementKey_EnvSecretOpensManagement(t *testing.T) {
	h := newEnvOnlyAuthHandler(t)

	for _, client := range []struct {
		ip    string
		local bool
	}{{"203.0.113.7", false}, {"127.0.0.1", true}} {
		if allowed, status, msg := h.AuthenticateManagementKey(client.ip, client.local, "env-secret"); !allowed {
			t.Fatalf("env secret denied for %s: status=%d msg=%q", client.ip, status, msg)
		}
	}
}

func TestAuthenticateManagementKey_EnvSecretIsTheOnlyKey(t *testing.T) {
	cases := []struct {
		name  string
		key   string
		local bool
	}{
		{name: "client API key", key: "client-api-key"},
		{name: "config secret-key", key: "config-secret"},
		{name: "local password from a spoofed local client", key: "local-password", local: true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			h := newEnvOnlyAuthHandler(t)
			ip := "203.0.113.7"
			if tc.local {
				ip = "127.0.0.1"
			}
			allowed, status, msg := h.AuthenticateManagementKey(ip, tc.local, tc.key)
			if allowed {
				t.Fatalf("%s opened management while MANAGEMENT_KEY is set", tc.name)
			}
			if status != http.StatusUnauthorized || msg != "invalid management key" {
				t.Fatalf("unexpected denial: status=%d msg=%q", status, msg)
			}
		})
	}
}

func TestAuthenticateManagementKey_ConfigSecretWithoutEnvSecret(t *testing.T) {
	h := newEnvOnlyAuthHandler(t)
	h.envSecret = ""
	h.allowRemoteOverride = false

	if allowed, status, msg := h.AuthenticateManagementKey("203.0.113.7", false, "config-secret"); !allowed {
		t.Fatalf("config secret denied without env secret: status=%d msg=%q", status, msg)
	}
	if allowed, _, _ := h.AuthenticateManagementKey("203.0.113.7", false, "client-api-key"); allowed {
		t.Fatalf("client API key opened management")
	}
}
