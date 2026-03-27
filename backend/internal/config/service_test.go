package config_test

import (
	"testing"

	"github.com/skaia/backend/internal/config"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestConfigService_CreateSection_ShiftsExistingSections(t *testing.T) {
	db := testutil.OpenTestDB(t)
	repo := config.NewRepository(db)
	svc := config.NewService(repo)

	sec1 := &models.LandingSection{
		DisplayOrder: 1,
		SectionType:  "hero",
		Heading:      "First",
		Subheading:   "",
		Config:       "{}",
	}
	require.NoError(t, svc.CreateSection(sec1))

	sec2 := &models.LandingSection{
		DisplayOrder: 2,
		SectionType:  "cta",
		Heading:      "Third",
		Subheading:   "",
		Config:       "{}",
	}
	require.NoError(t, svc.CreateSection(sec2))

	secMid := &models.LandingSection{
		DisplayOrder: 2,
		SectionType:  "feature_grid",
		Heading:      "Second",
		Subheading:   "",
		Config:       "{}",
	}
	require.NoError(t, svc.CreateSection(secMid))

	sections, err := svc.ListSections()
	require.NoError(t, err)
	assert.Len(t, sections, 3)

	assert.Equal(t, int(1), sections[0].DisplayOrder)
	assert.Equal(t, sec1.ID, sections[0].ID)

	assert.Equal(t, int(2), sections[1].DisplayOrder)
	assert.Equal(t, secMid.ID, sections[1].ID)

	assert.Equal(t, int(3), sections[2].DisplayOrder)
	assert.Equal(t, sec2.ID, sections[2].ID)
}
