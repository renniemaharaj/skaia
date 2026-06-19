package user

import (
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNormalizeUserBatchIDsDeduplicatesInOrder(t *testing.T) {
	ids, err := normalizeUserBatchIDs([]int64{3, 1, 3, 2, 1})

	require.NoError(t, err)
	assert.Equal(t, []int64{3, 1, 2}, ids)
}

func TestNormalizeUserBatchIDsRejectsInvalidID(t *testing.T) {
	_, err := normalizeUserBatchIDs([]int64{1, 0, 2})

	assert.ErrorIs(t, err, errInvalidUserBatchID)
}

func TestNormalizeUserBatchIDsCapsUniqueIDs(t *testing.T) {
	ids := make([]int64, maxUserBatchSize+1)
	for i := range ids {
		ids[i] = int64(i + 1)
	}

	_, err := normalizeUserBatchIDs(ids)

	assert.True(t, errors.Is(err, errUserBatchTooLarge))
}
