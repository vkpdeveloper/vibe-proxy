package management

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/gin-gonic/gin"
	"github.com/router-for-me/CLIProxyAPI/v8/internal/config"
	coreauth "github.com/router-for-me/CLIProxyAPI/v8/sdk/cliproxy/auth"
)

func TestPutQuotaDetails_PersistsCardAndListsIt(t *testing.T) {
	t.Setenv("MANAGEMENT_KEY", "")
	usageDir := t.TempDir()
	t.Setenv("USAGE_STORE_PATH", usageDir)

	manager := coreauth.NewManager(nil, nil, nil)
	record := &coreauth.Auth{
		ID:         "runtime-only-claude",
		Provider:   "claude",
		Attributes: map[string]string{"runtime_only": "true"},
		Metadata:   map[string]any{"type": "claude"},
	}
	if _, err := manager.Register(context.Background(), record); err != nil {
		t.Fatalf("register auth: %v", err)
	}
	h := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, manager)
	h.tokenStore = &memoryAuthStore{}

	put := func(name, body string) int {
		rec := httptest.NewRecorder()
		ctx, _ := gin.CreateTestContext(rec)
		ctx.Request = httptest.NewRequest(http.MethodPut, "/v8/management/credentials/quota-details?name="+name, strings.NewReader(body))
		h.PutQuotaDetails(ctx)
		return rec.Code
	}

	if code := put(record.ID, `[1,2]`); code != http.StatusBadRequest {
		t.Fatalf("array body status = %d, want 400", code)
	}
	if code := put("missing", `{}`); code != http.StatusNotFound {
		t.Fatalf("unknown auth status = %d, want 404", code)
	}
	card := `{"status":"success","planType":"plan_max","windows":[{"id":"five-hour","usedPercent":11}]}`
	if code := put(record.ID, card); code != http.StatusOK {
		t.Fatalf("save status = %d, want 200", code)
	}
	if _, err := os.Stat(filepath.Join(usageDir, quotaDetailsFileName)); err != nil {
		t.Fatalf("quota details file not written: %v", err)
	}

	// A fresh handler must read the card back from disk.
	reloaded := NewHandlerWithoutConfigFilePath(&config.Config{AuthDir: t.TempDir()}, manager)
	reloaded.tokenStore = &memoryAuthStore{}
	rec := httptest.NewRecorder()
	ctx, _ := gin.CreateTestContext(rec)
	ctx.Request = httptest.NewRequest(http.MethodGet, "/v8/management/credentials", nil)
	reloaded.ListAuthFiles(ctx)

	var payload struct {
		Files []struct {
			QuotaDetails *struct {
				SavedAt string          `json:"saved_at"`
				Data    json.RawMessage `json:"data"`
			} `json:"quota_details"`
		} `json:"files"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode list: %v", err)
	}
	if len(payload.Files) != 1 || payload.Files[0].QuotaDetails == nil {
		t.Fatalf("list body = %s, want one file with quota_details", rec.Body.String())
	}
	if got := string(payload.Files[0].QuotaDetails.Data); got != card {
		t.Fatalf("saved data = %s, want %s", got, card)
	}
	if payload.Files[0].QuotaDetails.SavedAt == "" {
		t.Fatal("saved_at is empty")
	}
}
