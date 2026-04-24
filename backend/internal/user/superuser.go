package user

import (
	"net/http"

	ievents "github.com/skaia/backend/internal/events"
	"github.com/skaia/backend/internal/utils"
)

func (h *Handler) isSuperUser(w http.ResponseWriter, usrId int64) bool {
	user, err := h.svc.GetByID(usrId)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to load user")
		return false
	}
	for _, r := range user.Roles {
		if r == "superuser" {
			return true
		}
	}
	return false
}

func (h *Handler) newDistinctSuperuserDemotionVote(w http.ResponseWriter, r *http.Request) {
	actorID, ok := utils.UserIDFromCtx(r)
	if !ok {
		utils.WriteError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	targetID, err := parseID(r, "id")
	if err != nil {
		utils.WriteError(w, http.StatusBadRequest, "invalid user id")
		return
	}

	hasSuperActor := h.isSuperUser(w, actorID)
	hasSuperTarget := h.isSuperUser(w, targetID)
	if !hasSuperActor || !hasSuperTarget {
		utils.WriteError(w, http.StatusForbidden, "both users must be superusers")
		return
	}

	// Record the vote in the database, ensuring uniqueness per actor-target pair. If the vote already exists, this will do nothing.
	err = h.svc.NewDistinctSuperuserDemotionVote(actorID, targetID)
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to record vote")
		return
	}

	// Optionally, you could check the total votes for this target and automatically demote if a threshold is reached. For now, we just record the vote.

	h.dispatcher.Dispatch(ievents.Job{
		UserID:     actorID,
		Activity:   "superuser_voted_demote",
		Resource:   ievents.ResUser,
		ResourceID: targetID,
	})
	utils.WriteJSON(w, http.StatusOK, map[string]string{"status": "target demoted from superuser"})
}
