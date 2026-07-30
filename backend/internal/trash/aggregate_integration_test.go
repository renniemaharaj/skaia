package trash_test

import (
	"context"
	"testing"

	iconfig "github.com/skaia/backend/internal/config"
	icustomsection "github.com/skaia/backend/internal/customsection"
	idatasource "github.com/skaia/backend/internal/datasource"
	iforum "github.com/skaia/backend/internal/forum"
	iinbox "github.com/skaia/backend/internal/inbox"
	inotification "github.com/skaia/backend/internal/notification"
	ipage "github.com/skaia/backend/internal/page"
	istore "github.com/skaia/backend/internal/store"
	"github.com/skaia/backend/internal/testutil"
	"github.com/skaia/backend/internal/trash"
	iuser "github.com/skaia/backend/internal/user"
	"github.com/skaia/backend/models"
)

type allowAllAuthorizer struct{}

func (allowAllAuthorizer) HasPermission(int64, string) (bool, error) {
	return true, nil
}

func TestAggregateListPreparesEveryRegisteredProviderQuery(t *testing.T) {
	db := testutil.OpenTestDB(t)
	userRepo := iuser.NewRepository(db)
	name := testutil.UniqueStr("trash_aggregate_actor")
	actor, err := userRepo.Create(&models.User{
		Username: name,
		Email:    name + "@example.com",
	}, "hash")
	if err != nil {
		t.Fatal(err)
	}

	providers := iforum.NewTrashProviders(db)
	providers = append(
		providers,
		inotification.NewTrashProvider(db),
		idatasource.NewTrashProvider(db),
		icustomsection.NewTrashProvider(db),
	)
	providers = append(providers, ipage.NewTrashProviders(db)...)
	providers = append(providers, istore.NewTrashProviders(db)...)
	providers = append(providers, iinbox.NewTrashProviders(db)...)
	providers = append(providers, iuser.NewTrashProviders(db)...)
	providers = append(providers, iconfig.NewTrashProviders(db)...)

	groups, err := trash.NewService(allowAllAuthorizer{}, providers...).List(
		context.Background(), actor.ID, 25, 0,
	)
	if err != nil {
		t.Fatal(err)
	}
	if len(groups) != len(providers) {
		t.Fatalf("got %d groups for %d providers", len(groups), len(providers))
	}
}
