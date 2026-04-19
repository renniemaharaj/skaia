package datasource

import (
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/events"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/internal/utils"
	"github.com/skaia/backend/models"
)

// DataSourceResponse wraps a DataSource with optional creator info.
type DataSourceResponse struct {
	*models.DataSource
	Creator *CreatorInfo `json:"creator,omitempty"`
}

// CreatorInfo is the subset of user fields returned with a datasource.
type CreatorInfo struct {
	ID          int64  `json:"id"`
	Username    string `json:"username"`
	DisplayName string `json:"display_name"`
	AvatarURL   string `json:"avatar_url"`
}

// Handler serves data-source endpoints.
type Handler struct {
	svc               *Service
	userSvc           *iuser.Service
	compileCache      *CompileCache
	compileDispatcher *CompileDispatcher
	executeCache      *ExecuteCache
}

// NewHandler creates a datasource Handler.
func NewHandler(svc *Service, userSvc *iuser.Service, compileCache *CompileCache, compileDispatcher *CompileDispatcher, executeCache *ExecuteCache) *Handler {
	return &Handler{svc: svc, userSvc: userSvc, compileCache: compileCache, compileDispatcher: compileDispatcher, executeCache: executeCache}
}

// enrich attaches creator info to a datasource.
func (h *Handler) enrich(ds *models.DataSource) DataSourceResponse {
	resp := DataSourceResponse{DataSource: ds}
	if ds.CreatedBy != nil {
		u, err := h.userSvc.GetByID(*ds.CreatedBy)
		if err == nil && u != nil {
			resp.Creator = &CreatorInfo{
				ID:          u.ID,
				Username:    u.Username,
				DisplayName: u.DisplayName,
				AvatarURL:   u.AvatarURL,
			}
		}
	}
	return resp
}

// Mount registers data-source routes under /config/datasources.
func (h *Handler) Mount(r chi.Router, jwt func(http.Handler) http.Handler, optionalJWT func(http.Handler) http.Handler, compileIPLimit func(http.Handler) http.Handler, compileClientLimit func(http.Handler) http.Handler) {
	r.Route("/config/datasources", func(r chi.Router) {
		// Public reads
		r.Get("/", h.listDataSources)
		r.Get("/{id}", h.getDataSource)

		// Guests may request compiled output for a datasource by id.
		r.With(optionalJWT, compileIPLimit, compileClientLimit).Get("/{id}/compile", h.compileDataSourceByID)

		// Server-side execute with env vars.
		r.With(optionalJWT, compileIPLimit, compileClientLimit).Post("/{id}/execute", h.executeDataSourceByID)

		// Environment variables per datasource.
		r.With(optionalJWT).Get("/{id}/env", h.getEnvData)

		// Protected writes and raw compile.
		r.Group(func(r chi.Router) {
			r.Use(jwt)
			r.Post("/compile", h.compileTypeScript)
			r.Post("/", h.createDataSource)
			r.Put("/{id}", h.updateDataSource)
			r.Delete("/{id}", h.deleteDataSource)
			r.Put("/{id}/env", h.upsertEnvData)
			r.Delete("/{id}/env", h.deleteEnvData)
		})
	})
}

func (h *Handler) requireHomeManage(r *http.Request) bool {
	uid, ok := utils.UserIDFromCtx(r)
	if !ok {
		return false
	}
	has, _ := h.userSvc.HasPermission(uid, "home.manage")
	return has
}

func (h *Handler) listDataSources(w http.ResponseWriter, r *http.Request) {
	list, err := h.svc.List()
	if err != nil {
		log.Printf("datasource.list: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to list data sources")
		return
	}
	resp := make([]DataSourceResponse, 0, len(list))
	for _, ds := range list {
		resp = append(resp, h.enrich(ds))
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

func (h *Handler) getDataSource(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	ds, err := h.svc.GetByID(id)
	if err != nil {
		utils.WriteError(w, http.StatusNotFound, "data source not found")
		return
	}
	utils.WriteJSON(w, http.StatusOK, h.enrich(ds))
}

func (h *Handler) createDataSource(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	var ds models.DataSource
	if err := json.NewDecoder(r.Body).Decode(&ds); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if ds.Name == "" {
		utils.WriteError(w, http.StatusBadRequest, "name is required")
		return
	}
	uid, _ := utils.UserIDFromCtx(r)
	if uid != 0 {
		ds.CreatedBy = &uid
	}
	if err := h.svc.Create(&ds); err != nil {
		log.Printf("datasource.create: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "create failed")
		return
	}
	utils.WriteJSON(w, http.StatusCreated, h.enrich(&ds))
}

func (h *Handler) updateDataSource(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	var ds models.DataSource
	if err := json.NewDecoder(r.Body).Decode(&ds); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	ds.ID = id
	if err := h.svc.Update(&ds); err != nil {
		log.Printf("datasource.update: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "update failed")
		return
	}
	if h.executeCache != nil {
		h.executeCache.Invalidate(id)
	}
	updated, _ := h.svc.GetByID(id)
	if updated != nil {
		utils.WriteJSON(w, http.StatusOK, h.enrich(updated))
	} else {
		utils.WriteJSON(w, http.StatusOK, h.enrich(&ds))
	}
}

func (h *Handler) deleteDataSource(w http.ResponseWriter, r *http.Request) {
	if !h.requireHomeManage(r) {
		utils.WriteError(w, http.StatusForbidden, "forbidden")
		return
	}
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := h.svc.Delete(id); err != nil {
		log.Printf("datasource.delete: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "delete failed")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (h *Handler) compileTypeScript(w http.ResponseWriter, r *http.Request) {
	var body struct {
		Code  string            `json:"code"`
		Files map[string]string `json:"files"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	// Support both legacy single-code and multi-file.
	files := body.Files
	if len(files) == 0 {
		if body.Code == "" {
			utils.WriteError(w, http.StatusBadRequest, "code or files required")
			return
		}
		files = map[string]string{"main.ts": body.Code}
	}

	result, err := CompileTypeScript(files)
	if err != nil {
		log.Printf("datasource.compile: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "compilation failed")
		return
	}
	result.Cached = false
	utils.WriteJSON(w, http.StatusOK, result)
}

func (h *Handler) compileDataSourceByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid datasource id")
		return
	}

	ds, err := h.svc.GetByID(id)
	if err != nil {
		log.Printf("datasource.compile: lookup failed: %v", err)
		utils.WriteError(w, http.StatusNotFound, "datasource not found")
		return
	}
	if ds.Code == "" && len(filesFromDS(ds)) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "datasource has no code")
		return
	}

	if h.compileCache != nil {
		if cached, ok := h.compileCache.Get(ds.Code); ok {
			utils.WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	// Use files if available, fall back to legacy code.
	files := filesFromDS(ds)

	job := CompileJob{
		DataSourceID: id,
		Source:       ds.Code,
		Files:        files,
		IP:           events.ClientIP(r),
		ResultCh:     make(chan compileResult, 1),
	}
	if uid, ok := utils.UserIDFromCtx(r); ok {
		job.UserID = uid
	}

	if h.compileDispatcher == nil || !h.compileDispatcher.Dispatch(job) {
		utils.WriteError(w, http.StatusServiceUnavailable, "compiler queue is busy")
		return
	}

	select {
	case res := <-job.ResultCh:
		if res.Err != nil {
			log.Printf("datasource.compile: %v", res.Err)
			utils.WriteError(w, http.StatusInternalServerError, "compilation failed")
			return
		}
		utils.WriteJSON(w, http.StatusOK, res.Result)
	case <-time.After(15 * time.Second):
		utils.WriteError(w, http.StatusGatewayTimeout, "compiler timed out")
	}
}

// executeDataSourceByID compiles a datasource and executes it server-side
// with the datasource's own environment variables injected.
// If the datasource has a cache_ttl > 0, results are served from Redis.
func (h *Handler) executeDataSourceByID(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid datasource id")
		return
	}

	ds, err := h.svc.GetByID(id)
	if err != nil {
		log.Printf("datasource.execute: lookup failed: %v", err)
		utils.WriteError(w, http.StatusNotFound, "datasource not found")
		return
	}
	if ds.Code == "" && len(filesFromDS(ds)) == 0 {
		utils.WriteError(w, http.StatusBadRequest, "datasource has no code")
		return
	}

	// Serve from cache if the datasource has a TTL and the result is cached.
	if ds.CacheTTL > 0 && h.executeCache != nil {
		if cached, ok := h.executeCache.Get(id); ok {
			utils.WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	// Check for client-supplied env_data (editor context); fall back to DB.
	var body struct {
		EnvData string `json:"env_data"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body) // intentionally ignoring errors (empty body is fine)

	env := map[string]string{}
	if body.EnvData != "" {
		env = parseEnvData(body.EnvData)
	} else if ds.EnvData != "" {
		env = parseEnvData(ds.EnvData)
	}

	files := filesFromDS(ds)

	result, err := ExecuteTypeScript(files, env)
	if err != nil {
		log.Printf("datasource.execute: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "execution failed")
		return
	}

	// Cache the result if TTL is configured and execution succeeded.
	if ds.CacheTTL > 0 && h.executeCache != nil && result.Error == "" {
		h.executeCache.Set(id, result, time.Duration(ds.CacheTTL)*time.Second)
	}

	// Return with cached_at = now for fresh executions
	resp := CachedExecuteResult{
		ExecuteResult: *result,
		CachedAt:      time.Now(),
		CacheTTL:      ds.CacheTTL,
	}
	utils.WriteJSON(w, http.StatusOK, resp)
}

// ── Environment variables per datasource ────────────────────────────────────

func (h *Handler) getEnvData(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid datasource id")
		return
	}
	// Only privileged users may read env vars — guests get empty.
	if !h.requireHomeManage(r) {
		utils.WriteJSON(w, http.StatusOK, map[string]string{"env_data": ""})
		return
	}
	envData, err := h.svc.GetEnvData(id)
	if err != nil {
		utils.WriteJSON(w, http.StatusOK, map[string]string{"env_data": ""})
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"env_data": envData})
}

func (h *Handler) upsertEnvData(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid datasource id")
		return
	}
	var body struct {
		EnvData string `json:"env_data"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if err := h.svc.UpdateEnvData(id, body.EnvData); err != nil {
		log.Printf("datasource.upsertEnvData: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to save env vars")
		return
	}
	if h.executeCache != nil {
		h.executeCache.Invalidate(id)
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *Handler) deleteEnvData(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(chi.URLParam(r, "id"), 10, 64)
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid datasource id")
		return
	}
	if err := h.svc.UpdateEnvData(id, ""); err != nil {
		log.Printf("datasource.deleteEnvData: %v", err)
		utils.WriteError(w, http.StatusInternalServerError, "failed to clear env vars")
		return
	}
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

// parseEnvData parses raw .env-format text into a key-value map.
func parseEnvData(raw string) map[string]string {
	env := map[string]string{}
	for _, line := range splitLines(raw) {
		line = trimSpace(line)
		if line == "" || line[0] == '#' {
			continue
		}
		idx := -1
		for i := 0; i < len(line); i++ {
			if line[i] == '=' {
				idx = i
				break
			}
		}
		if idx < 1 {
			continue
		}
		key := trimSpace(line[:idx])
		val := trimSpace(line[idx+1:])
		if len(val) >= 2 && ((val[0] == '"' && val[len(val)-1] == '"') || (val[0] == '\'' && val[len(val)-1] == '\'')) {
			val = val[1 : len(val)-1]
		}
		env[key] = val
	}
	return env
}

func splitLines(s string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(s); i++ {
		if s[i] == '\n' {
			lines = append(lines, s[start:i])
			start = i + 1
		}
	}
	if start < len(s) {
		lines = append(lines, s[start:])
	}
	return lines
}

func trimSpace(s string) string {
	i, j := 0, len(s)
	for i < j && (s[i] == ' ' || s[i] == '\t' || s[i] == '\r') {
		i++
	}
	for j > i && (s[j-1] == ' ' || s[j-1] == '\t' || s[j-1] == '\r') {
		j--
	}
	return s[i:j]
}

// filesFromDS extracts the files map from a datasource, falling back to
// legacy single-code mode when the files column is empty.
func filesFromDS(ds *models.DataSource) map[string]string {
	if len(ds.Files) > 2 { // not empty "{}"
		var m map[string]string
		if json.Unmarshal(ds.Files, &m) == nil && len(m) > 0 {
			return m
		}
	}
	if ds.Code != "" {
		return map[string]string{"main.ts": ds.Code}
	}
	return map[string]string{}
}
