package management

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	usageledger "github.com/router-for-me/CLIProxyAPI/v8/internal/usage"
)

// maxQuotaDetailsBytes bounds one saved card. Real cards are a few KB.
const maxQuotaDetailsBytes = 256 << 10

const quotaDetailsFileName = "quota-details.json"

// quotaDetailsEntry is the management center's full quota card for one auth
// file, kept verbatim so the dashboard can render it again after a reload.
// The server never interprets Data; the background collector keeps the
// routing percentages fresh separately in auth.Capacity.
type quotaDetailsEntry struct {
	SavedAt time.Time       `json:"saved_at"`
	Data    json.RawMessage `json:"data"`
}

// quotaDetailsStore persists quota cards as one JSON file next to the usage
// ledger, keyed by auth ID. It loads lazily and rewrites the whole file on
// every save, which is fine for a handful of credentials.
type quotaDetailsStore struct {
	mu      sync.Mutex
	path    string
	loaded  bool
	entries map[string]quotaDetailsEntry
}

func newQuotaDetailsStore(configFilePath string) *quotaDetailsStore {
	return &quotaDetailsStore{
		path: filepath.Join(usageledger.DefaultStoreDirectory(configFilePath), quotaDetailsFileName),
	}
}

func (s *quotaDetailsStore) loadLocked() {
	if s.loaded {
		return
	}
	s.loaded = true
	s.entries = make(map[string]quotaDetailsEntry)
	raw, err := os.ReadFile(s.path)
	if err != nil {
		return
	}
	// A corrupt file only loses saved cards; the next refresh rewrites it.
	_ = json.Unmarshal(raw, &s.entries)
}

func (s *quotaDetailsStore) get(authID string) (quotaDetailsEntry, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	entry, ok := s.entries[authID]
	return entry, ok
}

// save stores one card and drops entries for auths that no longer exist.
func (s *quotaDetailsStore) save(authID string, entry quotaDetailsEntry, live map[string]struct{}) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.loadLocked()
	s.entries[authID] = entry
	for id := range s.entries {
		if _, ok := live[id]; !ok {
			delete(s.entries, id)
		}
	}
	raw, err := json.Marshal(s.entries)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o750); err != nil {
		return err
	}
	tmp := s.path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.path)
}

func (h *Handler) quotaDetailsStore() *quotaDetailsStore {
	h.quotaDetailsOnce.Do(func() {
		h.quotaDetails = newQuotaDetailsStore(h.configFilePath)
	})
	return h.quotaDetails
}

// PutQuotaDetails saves the dashboard's full quota card for one auth file.
// The body is an opaque JSON object owned by the management center.
func (h *Handler) PutQuotaDetails(c *gin.Context) {
	if h == nil || h.authManager == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "auth manager unavailable"})
		return
	}
	auth, ok := h.lookupAuthFile(c.Query("name"), c.Query("auth_index"))
	if !ok {
		c.JSON(http.StatusNotFound, gin.H{"error": "auth file not found"})
		return
	}
	body, err := io.ReadAll(io.LimitReader(c.Request.Body, maxQuotaDetailsBytes+1))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "failed to read body"})
		return
	}
	if len(body) > maxQuotaDetailsBytes {
		c.JSON(http.StatusRequestEntityTooLarge, gin.H{"error": fmt.Sprintf("quota details exceed %d bytes", maxQuotaDetailsBytes)})
		return
	}
	var object map[string]json.RawMessage
	if err := json.Unmarshal(body, &object); err != nil || object == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "body must be a JSON object"})
		return
	}

	live := make(map[string]struct{})
	for _, item := range h.authManager.List() {
		if item != nil {
			live[item.ID] = struct{}{}
		}
	}
	entry := quotaDetailsEntry{SavedAt: time.Now().UTC(), Data: body}
	if err := h.quotaDetailsStore().save(auth.ID, entry, live); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": errors.Join(errors.New("save quota details"), err).Error()})
		return
	}
	c.JSON(http.StatusOK, gin.H{"saved_at": entry.SavedAt})
}

func (h *Handler) quotaDetailsFor(authID string) (quotaDetailsEntry, bool) {
	if h == nil || strings.TrimSpace(authID) == "" {
		return quotaDetailsEntry{}, false
	}
	return h.quotaDetailsStore().get(authID)
}
