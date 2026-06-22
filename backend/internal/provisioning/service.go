package provisioning

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	pb "github.com/skaia/grpc/skaia"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"

	"github.com/renniemaharaj/conveyor/pkg/conveyor"
	"github.com/renniemaharaj/grouplogs/pkg/logger"
	igrengo "github.com/skaia/backend/internal/grengo"
	"github.com/skaia/backend/internal/ws"
	"github.com/skaia/backend/models"
)

// MaxInstancesPerClient defines the limit of instances a client can provision.
const MaxInstancesPerClient = 10

// MaxSitesPerBench defines the maximum number of sites a single Frappe bench cluster can host.
const MaxSitesPerBench = 50

type Service interface {
	GetBlueprints() ([]*models.AppBlueprint, error)
	ProvisionInstance(ctx context.Context, clientID int64, req ProvisionRequest) (*models.ProvisionedInstance, error)
	GetClientInstances(clientID int64) ([]*models.ProvisionedInstance, error)
	StartInstance(id int64) error
	StopInstance(id int64) error
	RestartInstance(id int64) error
	GetInstanceLogs(id int64) ([]logger.Line, error)
	TearDownInstance(id int64) error
	GetStats(ctx context.Context) (interface{}, error)
	GetAvailableApps() ([]map[string]interface{}, error)
	InstallApp(id int64, app string) error
	UninstallApp(id int64, app string) error
}

type service struct {
	repo     Repository
	manager  *conveyor.Manager
	hub      *ws.Hub
	logGroup *logger.Group
	grengo   *igrengo.Service
}

type ProvisionRequest struct {
	BlueprintID   int64  `json:"blueprint_id"`
	VersionTag    string `json:"version_tag"`
	ConfigPayload []byte `json:"config_payload"`
}

func NewService(repo Repository, manager *conveyor.Manager, hub *ws.Hub, grengo *igrengo.Service) Service {
	g := logger.NewGroup()
	sub := g.Delegate.Subscribe()

	go func() {
		for entry := range sub.C {
			payloadBytes, _ := json.Marshal(entry)
			
			// Parse instanceID from entry.Prefix
			var instanceID int64
			fmt.Sscanf(entry.Prefix, "%d", &instanceID)
			
			if instanceID > 0 {
				hub.BroadcastToSubscribers("provisioning_logs", instanceID, &ws.Message{
					Type:    ws.ProvisioningProgress,
					Payload: payloadBytes,
				})
			}
		}
	}()

	return &service{
		repo:     repo,
		manager:  manager,
		hub:      hub,
		logGroup: g,
		grengo:   grengo,
	}
}

func (s *service) GetBlueprints() ([]*models.AppBlueprint, error) {
	return s.repo.ListActiveBlueprints()
}

func (s *service) ProvisionInstance(ctx context.Context, clientID int64, req ProvisionRequest) (*models.ProvisionedInstance, error) {
	// 1. Check quotas / limits
	instances, err := s.repo.ListInstancesByClient(clientID)
	if err != nil {
		return nil, fmt.Errorf("failed to check client quota: %w", err)
	}

	if len(instances) >= MaxInstancesPerClient {
		return nil, errors.New("instance quota exceeded")
	}

	// 2. Verify blueprint
	bp, err := s.repo.GetBlueprintByID(req.BlueprintID)
	if err != nil {
		return nil, fmt.Errorf("invalid blueprint: %w", err)
	}
	if !bp.IsActive {
		return nil, errors.New("blueprint is not active")
	}

	// 3. Create the instance record in DB
	instance := &models.ProvisionedInstance{
		ClientID:      clientID,
		BlueprintID:   bp.ID,
		VersionTag:    req.VersionTag,
		Status:        "queued", // Initial state
		ConfigPayload: req.ConfigPayload,
	}

	created, err := s.repo.CreateInstance(instance)
	if err != nil {
		return nil, fmt.Errorf("failed to create instance: %w", err)
	}

	var configMap map[string]interface{}
	json.Unmarshal(req.ConfigPayload, &configMap)
	if configMap == nil {
		configMap = make(map[string]interface{})
	}

	port := 8000 + created.ID
	if bp.Name == "Superset" || bp.Name == "superset" || bp.Name == "Apache Superset" {
		port = 8080 + created.ID
	}
	
	baseDomain := os.Getenv("DOMAINS")
	if baseDomain == "" {
		baseDomain = "http://localhost:8080"
	} else if !strings.HasPrefix(baseDomain, "http") {
		domain := strings.Fields(baseDomain)[0]
		if domain == "localhost" || strings.HasPrefix(domain, "localhost:") {
			baseDomain = "http://" + domain
		} else {
			baseDomain = "https://" + domain
		}
	}
	
	configMap["url"] = fmt.Sprintf("%s/instances/%d", baseDomain, created.ID)
	configMap["port"] = port

	newPayload, _ := json.Marshal(configMap)
	created.ConfigPayload = newPayload
	s.repo.UpdateInstanceConfig(created.ID, newPayload)

	// 4. Determine Target Cluster (Bench Clustering Logic)
	// Here we treat a single bench as a multi-tenant cluster node.
	// We would query the current active bench cluster for this blueprint.
	// If the number of sites on the active bench >= MaxSitesPerBench,
	// we spin up a new bench cluster container/deployment and assign its ID.
	// For now, we'll store the assigned cluster ID in the config payload.

	// 5. Dispatch the job to conveyorbelt
	type jobPayload struct {
		ID            int64
		BlueprintName string
		ConfigPayload []byte
	}

	payload := jobPayload{
		ID:            created.ID,
		BlueprintName: bp.Name,
		ConfigPayload: newPayload,
	}

	job := conveyor.CreateJob(context.Background(), payload, func(param any) error {
		defer func() {
			if r := recover(); r != nil {
				fmt.Println("Conveyor job panicked:", r)
			}
		}()
		p := param.(jobPayload)

		l := logger.New().Prefix(fmt.Sprintf("%d", p.ID)).Subscribable(true)
		s.logGroup.Join(l)
		defer s.logGroup.Remove(l)

		l.Info("Starting provisioning job...")

		var err error
		if p.BlueprintName == "Superset" || p.BlueprintName == "superset" || p.BlueprintName == "Apache Superset" {
			err = SupersetProvisionWorker(p.ID, p.ConfigPayload, l)
		} else {
			err = FrappeProvisionWorker(p.ID, p.ConfigPayload, l, s.grengo)
		}

		if err == nil {
			_ = s.repo.UpdateInstanceStatus(p.ID, "completed")
			payloadBytes, _ := json.Marshal(map[string]interface{}{
				"id":     p.ID,
				"status": "completed",
			})
			statusMsg := &ws.Message{
				Type:    ws.ProvisioningStatus,
				Payload: payloadBytes,
			}
			s.hub.BroadcastToPermission("admin.general", statusMsg)
			s.hub.BroadcastToSubscribers("provisioning_logs", p.ID, statusMsg)
		}

		return err
	}, func(w conveyor.Worker, j *conveyor.Job) {
		p := j.Param.(jobPayload)
		_ = s.repo.UpdateInstanceStatus(p.ID, "running")
		payloadBytes, _ := json.Marshal(map[string]interface{}{
			"id":     p.ID,
			"status": "running",
		})
		statusMsg := &ws.Message{
			Type:    ws.ProvisioningStatus,
			Payload: payloadBytes,
		}
		s.hub.BroadcastToPermission("admin.general", statusMsg)
		s.hub.BroadcastToSubscribers("provisioning_logs", p.ID, statusMsg)
	}, func(w conveyor.Worker, j *conveyor.Job) {
		p := j.Param.(jobPayload)
		_ = s.repo.UpdateInstanceStatus(p.ID, "failed")
		payloadBytes, _ := json.Marshal(map[string]interface{}{
			"id":     p.ID,
			"status": "failed",
		})
		statusMsg := &ws.Message{
			Type:    ws.ProvisioningStatus,
			Payload: payloadBytes,
		}
		s.hub.BroadcastToPermission("admin.general", statusMsg)
		s.hub.BroadcastToSubscribers("provisioning_logs", p.ID, statusMsg)
	})

	s.manager.B.Push(job)

	return created, nil
}

func (s *service) GetClientInstances(clientID int64) ([]*models.ProvisionedInstance, error) {
	return s.repo.ListInstancesByClient(clientID)
}

func (s *service) StartInstance(id int64) error {
	isFrappe, err := s.isFrappe(id)
	if err != nil {
		return err
	}
	if isFrappe {
		return errors.New("Not supported for multi-tenant")
	}

	dir, err := s.findInstanceDir(id)
	if err != nil {
		return err
	}
	cmd := exec.Command("docker", "compose", "start")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		return err
	}
	s.repo.UpdateInstanceStatus(id, "running")
	payloadBytes, _ := json.Marshal(map[string]interface{}{
		"id":     id,
		"status": "running",
	})
	s.hub.BroadcastToPermission("admin.general", &ws.Message{
		Type:    "provisioning:status",
		Payload: payloadBytes,
	})
	return nil
}

func (s *service) StopInstance(id int64) error {
	isFrappe, err := s.isFrappe(id)
	if err != nil {
		return err
	}
	if isFrappe {
		return errors.New("Not supported for multi-tenant")
	}

	dir, err := s.findInstanceDir(id)
	if err != nil {
		return err
	}
	cmd := exec.Command("docker", "compose", "stop")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		return err
	}
	s.repo.UpdateInstanceStatus(id, "stopped")
	payloadBytes, _ := json.Marshal(map[string]interface{}{
		"id":     id,
		"status": "stopped",
	})
	s.hub.BroadcastToPermission("admin.general", &ws.Message{
		Type:    "provisioning:status",
		Payload: payloadBytes,
	})
	return nil
}

func (s *service) RestartInstance(id int64) error {
	isFrappe, err := s.isFrappe(id)
	if err != nil {
		return err
	}
	if isFrappe {
		return errors.New("Not supported for multi-tenant")
	}

	dir, err := s.findInstanceDir(id)
	if err != nil {
		return err
	}
	cmd := exec.Command("docker", "compose", "restart")
	cmd.Dir = dir
	if err := cmd.Run(); err != nil {
		return err
	}
	s.repo.UpdateInstanceStatus(id, "running")
	payloadBytes, _ := json.Marshal(map[string]interface{}{
		"id":     id,
		"status": "running",
	})
	s.hub.BroadcastToPermission("admin.general", &ws.Message{
		Type:    "provisioning:status",
		Payload: payloadBytes,
	})

	// Log to websocket
	l := logger.New().Prefix(fmt.Sprintf("%d", id)).Subscribable(true)
	s.logGroup.Join(l)
	defer s.logGroup.Remove(l)
	l.Info("Instance restarted successfully")

	return nil
}

func (s *service) isFrappe(id int64) (bool, error) {
	inst, err := s.repo.GetInstanceByID(id)
	if err != nil {
		return false, err
	}
	bp, err := s.repo.GetBlueprintByID(inst.BlueprintID)
	if err != nil {
		return false, err
	}
	name := bp.Name
	if name == "Superset" || name == "superset" || name == "Apache Superset" {
		return false, nil
	}
	return true, nil
}

func (s *service) GetAvailableApps() ([]map[string]interface{}, error) {
	conn, err := grpc.NewClient("skaia_frappe_cluster_1:3001", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("gRPC dial failed: %w", err)
	}
	defer conn.Close()

	c := pb.NewGoFTWServiceClient(conn)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	resp, err := c.GetApps(ctx, &pb.GetAppsRequest{})
	if err != nil {
		return nil, fmt.Errorf("gRPC GetApps failed: %w", err)
	}

	var apps []map[string]interface{}
	for _, appName := range resp.Apps {
		apps = append(apps, map[string]interface{}{"name": appName})
	}
	return apps, nil
}

func (s *service) InstallApp(id int64, appName string) error {
	l := logger.New().Prefix(fmt.Sprintf("%d", id)).Subscribable(true)
	s.logGroup.Join(l)
	defer s.logGroup.Remove(l)

	l.Info(fmt.Sprintf("Installing app %s...", appName))

	siteName := fmt.Sprintf("site%d.frappe.localhost", id)
	
	conn, err := grpc.NewClient("skaia_frappe_cluster_1:3001", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		l.Error(fmt.Sprintf("gRPC dial failed: %v", err))
		return err
	}
	defer conn.Close()

	c := pb.NewGoFTWServiceClient(conn)
	// InstallApp is a streaming RPC
	stream, err := c.InstallApp(context.Background(), &pb.InstallAppRequest{
		SiteName: siteName,
		AppName:  appName,
	})
	if err != nil {
		l.Error(fmt.Sprintf("gRPC InstallApp failed: %v", err))
		return err
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			l.Error(fmt.Sprintf("Stream error: %v", err))
			return err
		}
		l.Info(resp.Output)
	}

	l.Success(fmt.Sprintf("Successfully installed app %s", appName))
	return nil
}

func (s *service) UninstallApp(id int64, appName string) error {
	l := logger.New().Prefix(fmt.Sprintf("%d", id)).Subscribable(true)
	s.logGroup.Join(l)
	defer s.logGroup.Remove(l)

	l.Info(fmt.Sprintf("Uninstalling app %s...", appName))

	siteName := fmt.Sprintf("site%d.frappe.localhost", id)
	
	conn, err := grpc.NewClient("skaia_frappe_cluster_1:3001", grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		l.Error(fmt.Sprintf("gRPC dial failed: %v", err))
		return err
	}
	defer conn.Close()

	c := pb.NewGoFTWServiceClient(conn)
	// UninstallApp is a streaming RPC
	stream, err := c.UninstallApp(context.Background(), &pb.UninstallAppRequest{
		SiteName: siteName,
		AppName:  appName,
	})
	if err != nil {
		l.Error(fmt.Sprintf("gRPC UninstallApp failed: %v", err))
		return err
	}

	for {
		resp, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			l.Error(fmt.Sprintf("Stream error: %v", err))
			return err
		}
		l.Info(resp.Output)
	}

	l.Success(fmt.Sprintf("Successfully uninstalled app %s", appName))
	return nil
}

func (s *service) GetInstanceLogs(id int64) ([]logger.Line, error) {
	var logs []logger.Line

	// 1. Read from grouplogs (twcLogs)
	files, err := filepath.Glob("twcLogs/log-*.log")
	if err == nil {
		for _, f := range files {
			file, err := os.Open(f)
			if err != nil {
				continue
			}
			scanner := bufio.NewScanner(file)
			for scanner.Scan() {
				var line logger.Line
				// Only parse if it looks like JSON to avoid errors on non-JSON lines
				if err := json.Unmarshal(scanner.Bytes(), &line); err == nil {
					if line.Prefix == fmt.Sprintf("%d", id) {
						logs = append(logs, line)
					}
				}
			}
			file.Close()
		}
	}

	// 2. Read from docker compose logs
	dir, err := s.findInstanceDir(id)
	if err == nil {
		cmd := exec.Command("docker", "compose", "logs", "--tail", "100")
		cmd.Dir = dir
		if out, err := cmd.CombinedOutput(); err == nil && len(out) > 0 {
			lines := strings.Split(string(out), "\n")
			for _, l := range lines {
				if strings.TrimSpace(l) == "" {
					continue
				}
				logs = append(logs, logger.Line{
					Prefix: fmt.Sprintf("%d", id),
					Msg:    l,
					Level:  "INFO",
					Time:   "historical",
				})
			}
		}
	}

	// Cap to latest 100 logs
	if len(logs) > 100 {
		logs = logs[len(logs)-100:]
	}

	return logs, nil
}

func (s *service) TearDownInstance(id int64) error {
	dir, err := s.findInstanceDir(id)
	if err == nil {
		cmd := exec.Command("docker", "compose", "down", "-v")
		cmd.Dir = dir
		_ = cmd.Run()
		os.RemoveAll(dir)
	}
	return s.repo.DeleteInstance(id)
}

func (s *service) findInstanceDir(id int64) (string, error) {
	frappeDir := fmt.Sprintf("/tmp/skaia/frappe/instance_%d", id)
	if _, err := os.Stat(frappeDir); err == nil {
		return frappeDir, nil
	}
	supersetDir := fmt.Sprintf("/tmp/skaia/superset/instance_%d", id)
	if _, err := os.Stat(supersetDir); err == nil {
		return supersetDir, nil
	}
	return "", errors.New("instance directory not found")
}

func (s *service) GetStats(ctx context.Context) (interface{}, error) {
	if s.grengo != nil {
		stats, err := s.grengo.Stats()
		if err == nil {
			return stats, nil
		}
		// fallback to local docker stats if grengo fails or is inaccessible
	}

	cmd := exec.CommandContext(ctx, "docker", "stats", "--no-stream", "--format", "{{json .}}")
	out, err := cmd.Output()
	if err != nil {
		return nil, fmt.Errorf("failed to get docker stats: %w", err)
	}

	var stats []map[string]interface{}
	lines := strings.Split(string(out), "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		var stat map[string]interface{}
		if err := json.Unmarshal([]byte(line), &stat); err == nil {
			stats = append(stats, stat)
		}
	}

	return stats, nil
}
