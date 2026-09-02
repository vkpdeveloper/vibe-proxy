package management

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

const usageDateLayout = "2006-01-02"

// GetUsageCosts returns persistent usage totals and API-price estimates.
func (h *Handler) GetUsageCosts(c *gin.Context) {
	if h == nil || h.usageStore == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "persistent usage accounting is unavailable"})
		return
	}
	from, errFrom := parseUsageTime(c.Query("from"), false)
	if errFrom != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid from date; use YYYY-MM-DD or RFC3339"})
		return
	}
	to, errTo := parseUsageTime(c.Query("to"), true)
	if errTo != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid to date; use YYYY-MM-DD or RFC3339"})
		return
	}
	if from != nil && to != nil && !from.Before(*to) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "from must be earlier than to"})
		return
	}
	c.JSON(http.StatusOK, h.usageStore.Report(from, to))
}

func parseUsageTime(value string, endExclusive bool) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if parsed, errParse := time.Parse(time.RFC3339, value); errParse == nil {
		return &parsed, nil
	}
	parsed, errParse := time.Parse(usageDateLayout, value)
	if errParse != nil {
		return nil, errParse
	}
	if endExclusive {
		parsed = parsed.AddDate(0, 0, 1)
	}
	return &parsed, nil
}
