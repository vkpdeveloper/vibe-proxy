package management

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v7/internal/config"
)

func newClientAPIKeyTestHandler(t *testing.T) (*Handler, *gin.Engine) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte("api-keys: []\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	h := NewHandler(&config.Config{}, path, nil)
	router := gin.New()
	router.GET("/keys", h.GetClientAPIKeys)
	router.POST("/keys", h.CreateClientAPIKey)
	router.PUT("/keys/:id", h.UpdateClientAPIKey)
	router.POST("/keys/:id/rotate", h.RotateClientAPIKey)
	router.DELETE("/keys/:id", h.DeleteClientAPIKey)
	return h, router
}

func TestClientAPIKeyLifecycle(t *testing.T) {
	h, router := newClientAPIKeyTestHandler(t)
	createBody := `{"name":"Production","allowed_providers":["codex"],"allowed_models":["gpt-5.6-codex"],"daily_limit_usd":12.5,"daily_request_limit":100,"daily_token_limit":5000,"requests_per_minute":10}`
	create := httptest.NewRecorder()
	router.ServeHTTP(create, httptest.NewRequest(http.MethodPost, "/keys", strings.NewReader(createBody)))
	if create.Code != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", create.Code, create.Body.String())
	}
	var created struct {
		APIKey string           `json:"api_key"`
		Key    clientAPIKeyView `json:"key"`
	}
	if err := json.Unmarshal(create.Body.Bytes(), &created); err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(created.APIKey, "vp_") || created.Key.ID == "" {
		t.Fatalf("unexpected create response: %#v", created)
	}
	if len(h.cfg.APIKeys) != 1 || len(h.cfg.ClientAPIKeyPolicies) != 1 {
		t.Fatalf("config keys=%d policies=%d", len(h.cfg.APIKeys), len(h.cfg.ClientAPIKeyPolicies))
	}

	updateBody := bytes.NewBufferString(`{"name":"Staging","allowed_providers":["claude"],"allowed_models":[],"daily_limit_usd":2,"disabled":true}`)
	update := httptest.NewRecorder()
	router.ServeHTTP(update, httptest.NewRequest(http.MethodPut, "/keys/"+created.Key.ID, updateBody))
	if update.Code != http.StatusOK || h.cfg.ClientAPIKeyPolicies[0].Name != "Staging" || !h.cfg.ClientAPIKeyPolicies[0].Disabled {
		t.Fatalf("update status=%d body=%s policy=%#v", update.Code, update.Body.String(), h.cfg.ClientAPIKeyPolicies[0])
	}

	rotate := httptest.NewRecorder()
	router.ServeHTTP(rotate, httptest.NewRequest(http.MethodPost, "/keys/"+created.Key.ID+"/rotate", nil))
	if rotate.Code != http.StatusOK {
		t.Fatalf("rotate status=%d body=%s", rotate.Code, rotate.Body.String())
	}
	if h.cfg.APIKeys[0] == created.APIKey || h.cfg.ClientAPIKeyPolicies[0].APIKey != h.cfg.APIKeys[0] {
		t.Fatalf("rotation did not replace credential and policy together")
	}

	list := httptest.NewRecorder()
	router.ServeHTTP(list, httptest.NewRequest(http.MethodGet, "/keys", nil))
	if list.Code != http.StatusOK || strings.Contains(list.Body.String(), h.cfg.APIKeys[0]) {
		t.Fatalf("list leaked raw API key: status=%d body=%s", list.Code, list.Body.String())
	}

	rotatedID := clientKeyIDFromResponse(t, rotate.Body.Bytes())
	remove := httptest.NewRecorder()
	router.ServeHTTP(remove, httptest.NewRequest(http.MethodDelete, "/keys/"+rotatedID, nil))
	if remove.Code != http.StatusOK || len(h.cfg.APIKeys) != 0 || len(h.cfg.ClientAPIKeyPolicies) != 0 {
		t.Fatalf("delete status=%d keys=%d policies=%d", remove.Code, len(h.cfg.APIKeys), len(h.cfg.ClientAPIKeyPolicies))
	}
}

func TestCreateClientAPIKeyRequiresProvider(t *testing.T) {
	_, router := newClientAPIKeyTestHandler(t)
	recorder := httptest.NewRecorder()
	router.ServeHTTP(recorder, httptest.NewRequest(http.MethodPost, "/keys", strings.NewReader(`{"name":"No scope"}`)))
	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestGetClientAPIKeysSerializesLegacyScopesAsArrays(t *testing.T) {
	gin.SetMode(gin.TestMode)
	cfg := &config.Config{}
	cfg.APIKeys = []string{"legacy-key"}
	h := NewHandlerWithoutConfigFilePath(cfg, nil)
	recorder := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(recorder)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/keys", nil)
	h.GetClientAPIKeys(ctx)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	if strings.Contains(recorder.Body.String(), `"allowed_providers":null`) || strings.Contains(recorder.Body.String(), `"allowed_models":null`) {
		t.Fatalf("legacy scopes must be arrays: %s", recorder.Body.String())
	}
}

func clientKeyIDFromResponse(t *testing.T, raw []byte) string {
	t.Helper()
	var response struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(raw, &response); err != nil {
		t.Fatal(err)
	}
	return response.ID
}
