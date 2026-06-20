package provisioning

import (
	"database/sql"
	"errors"

	"github.com/skaia/backend/database"
	"github.com/skaia/backend/models"
)

type Repository interface {
	GetBlueprintByID(id int64) (*models.AppBlueprint, error)
	ListActiveBlueprints() ([]*models.AppBlueprint, error)
	CreateInstance(instance *models.ProvisionedInstance) (*models.ProvisionedInstance, error)
	GetInstanceByID(id int64) (*models.ProvisionedInstance, error)
	ListInstancesByClient(clientID int64) ([]*models.ProvisionedInstance, error)
	UpdateInstanceStatus(id int64, status string) error
	UpdateInstanceConfig(id int64, configPayload []byte) error
	DeleteInstance(id int64) error
}

type sqlRepository struct {
	db database.Executor
}

func NewRepository(db database.Executor) Repository {
	return &sqlRepository{db: db}
}

func (r *sqlRepository) GetBlueprintByID(id int64) (*models.AppBlueprint, error) {
	bp := &models.AppBlueprint{}
	err := r.db.QueryRow(`
		SELECT id, name, description, supported_versions, config_schema, is_active, created_at, updated_at
		 FROM app_blueprints WHERE id = $1`, id,
	).Scan(&bp.ID, &bp.Name, &bp.Description, &bp.SupportedVersions, &bp.ConfigSchema, &bp.IsActive, &bp.CreatedAt, &bp.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("blueprint not found")
	}
	if err != nil {
		return nil, err
	}
	return bp, nil
}

func (r *sqlRepository) ListActiveBlueprints() ([]*models.AppBlueprint, error) {
	rows, err := r.db.Query(`
		SELECT id, name, description, supported_versions, config_schema, is_active, created_at, updated_at
		 FROM app_blueprints WHERE is_active = true ORDER BY name ASC`,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var bps []*models.AppBlueprint
	for rows.Next() {
		var bp models.AppBlueprint
		if err := rows.Scan(&bp.ID, &bp.Name, &bp.Description, &bp.SupportedVersions, &bp.ConfigSchema, &bp.IsActive, &bp.CreatedAt, &bp.UpdatedAt); err != nil {
			return nil, err
		}
		bps = append(bps, &bp)
	}
	return bps, rows.Err()
}

func (r *sqlRepository) CreateInstance(instance *models.ProvisionedInstance) (*models.ProvisionedInstance, error) {
	err := r.db.QueryRow(
		`INSERT INTO provisioned_instances (client_id, blueprint_id, version_tag, status, config_payload)
		 VALUES ($1, $2, $3, $4, $5)
		 RETURNING id, created_at, updated_at`,
		instance.ClientID, instance.BlueprintID, instance.VersionTag, instance.Status, instance.ConfigPayload,
	).Scan(&instance.ID, &instance.CreatedAt, &instance.UpdatedAt)
	if err != nil {
		return nil, err
	}
	return instance, nil
}

func (r *sqlRepository) GetInstanceByID(id int64) (*models.ProvisionedInstance, error) {
	i := &models.ProvisionedInstance{}
	err := r.db.QueryRow(
		`SELECT id, client_id, blueprint_id, version_tag, status, config_payload, created_at, updated_at
		 FROM provisioned_instances WHERE id = $1`, id,
	).Scan(&i.ID, &i.ClientID, &i.BlueprintID, &i.VersionTag, &i.Status, &i.ConfigPayload, &i.CreatedAt, &i.UpdatedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, errors.New("instance not found")
	}
	if err != nil {
		return nil, err
	}
	return i, nil
}

func (r *sqlRepository) ListInstancesByClient(clientID int64) ([]*models.ProvisionedInstance, error) {
	rows, err := r.db.Query(
		`SELECT id, client_id, blueprint_id, version_tag, status, config_payload, created_at, updated_at
		 FROM provisioned_instances WHERE client_id = $1 ORDER BY created_at DESC`, clientID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var instances []*models.ProvisionedInstance
	for rows.Next() {
		i := &models.ProvisionedInstance{}
		if err := rows.Scan(&i.ID, &i.ClientID, &i.BlueprintID, &i.VersionTag, &i.Status, &i.ConfigPayload, &i.CreatedAt, &i.UpdatedAt); err != nil {
			return nil, err
		}
		instances = append(instances, i)
	}
	return instances, rows.Err()
}

func (r *sqlRepository) UpdateInstanceStatus(id int64, status string) error {
	_, err := r.db.Exec(
		`UPDATE provisioned_instances SET status = $1, updated_at = NOW() WHERE id = $2`,
		status, id,
	)
	return err
}

func (r *sqlRepository) UpdateInstanceConfig(id int64, configPayload []byte) error {
	_, err := r.db.Exec(
		`UPDATE provisioned_instances SET config_payload = $1, updated_at = NOW() WHERE id = $2`,
		configPayload, id,
	)
	return err
}

func (r *sqlRepository) DeleteInstance(id int64) error {
	_, err := r.db.Exec(`DELETE FROM provisioned_instances WHERE id = $1`, id)
	return err
}
