package store

import (
	"errors"
	"testing"
	"time"

	"github.com/skaia/backend/models"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAwardReferenceCodePayoutCreditsOnce(t *testing.T) {
	refRepo := &fakeReferenceCodeRepo{
		byCode: map[string]*models.ReferenceCode{
			"ALICE": {ID: 7, Code: "ALICE", UserID: 42, IncentiveAmount: 250, IsActive: true},
		},
		payouts: map[int64]*models.ReferenceCodePayout{},
	}
	svc := NewService(nil, nil, nil, nil, refRepo, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	order := &models.Order{ID: 99, ReferralCode: "ALICE"}
	require.NoError(t, svc.AwardReferenceCodePayout(order))
	require.NoError(t, svc.AwardReferenceCodePayout(order))

	require.Len(t, refRepo.walletCredits, 1)
	assert.Equal(t, int64(42), refRepo.walletCredits[0].UserID)
	assert.Equal(t, int64(250), refRepo.walletCredits[0].Amount)
}

func TestAwardReferenceCodePayoutSkipsSelfReference(t *testing.T) {
	refRepo := &fakeReferenceCodeRepo{
		byCode: map[string]*models.ReferenceCode{
			"ALICE": {ID: 7, Code: "ALICE", UserID: 42, IncentiveAmount: 250, IsActive: true},
		},
		payouts: map[int64]*models.ReferenceCodePayout{},
	}
	svc := NewService(nil, nil, nil, nil, refRepo, nil, nil, nil, nil, nil, nil, nil, nil, nil)

	buyerID := int64(42)
	require.NoError(t, svc.AwardReferenceCodePayout(&models.Order{
		ID:           100,
		UserID:       &buyerID,
		ReferralCode: "ALICE",
	}))

	assert.Empty(t, refRepo.walletCredits)
	assert.Empty(t, refRepo.payouts)
}

type fakeReferenceCodeRepo struct {
	byCode        map[string]*models.ReferenceCode
	payouts       map[int64]*models.ReferenceCodePayout
	walletCredits []*models.ReferenceCodePayout
}

func (r *fakeReferenceCodeRepo) Create(code *models.ReferenceCode) (*models.ReferenceCode, error) {
	return code, nil
}

func (r *fakeReferenceCodeRepo) Update(code *models.ReferenceCode) (*models.ReferenceCode, error) {
	return code, nil
}

func (r *fakeReferenceCodeRepo) GetByID(id int64) (*models.ReferenceCode, error) {
	for _, code := range r.byCode {
		if code.ID == id {
			return code, nil
		}
	}
	return nil, errors.New("reference code not found")
}

func (r *fakeReferenceCodeRepo) GetByCode(code string) (*models.ReferenceCode, error) {
	if refCode, ok := r.byCode[code]; ok {
		return refCode, nil
	}
	return nil, errors.New("reference code not found")
}

func (r *fakeReferenceCodeRepo) List(limit, offset int) ([]*models.ReferenceCode, error) {
	var codes []*models.ReferenceCode
	for _, code := range r.byCode {
		codes = append(codes, code)
	}
	return codes, nil
}

func (r *fakeReferenceCodeRepo) Delete(id int64) error {
	return nil
}

func (r *fakeReferenceCodeRepo) CreatePayout(payout *models.ReferenceCodePayout) (*models.ReferenceCodePayout, error) {
	if _, exists := r.payouts[payout.OrderID]; exists {
		return nil, errors.New("duplicate key")
	}
	payout.ID = int64(len(r.payouts) + 1)
	payout.CreatedAt = time.Now()
	r.payouts[payout.OrderID] = payout
	return payout, nil
}

func (r *fakeReferenceCodeRepo) CreatePayoutWithWalletCredit(payout *models.ReferenceCodePayout, description string) (*models.ReferenceCodePayout, error) {
	created, err := r.CreatePayout(payout)
	if err != nil {
		return nil, err
	}
	r.walletCredits = append(r.walletCredits, created)
	return created, nil
}

func (r *fakeReferenceCodeRepo) GetPayoutByOrderID(orderID int64) (*models.ReferenceCodePayout, error) {
	if payout, ok := r.payouts[orderID]; ok {
		return payout, nil
	}
	return nil, errors.New("reference code payout not found")
}
