package bible

import (
	"errors"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/skaia/backend/internal/utils"
)

type Handler struct {
	service *Service
}

func NewHandler(service *Service) *Handler {
	return &Handler{service: service}
}

func (h *Handler) Mount(r chi.Router) {
	r.Route("/bible/kjv", func(r chi.Router) {
		r.Get("/books", h.listBooks)
		r.Get("/books/{book}", h.getBook)
	})
}

func (h *Handler) listBooks(w http.ResponseWriter, _ *http.Request) {
	utils.WriteJSON(w, http.StatusOK, h.service.ListBooks())
}

func (h *Handler) getBook(w http.ResponseWriter, r *http.Request) {
	book, err := h.service.GetBook(chi.URLParam(r, "book"))
	if errors.Is(err, ErrBookNotFound) {
		utils.WriteError(w, http.StatusNotFound, "bible book not found")
		return
	}
	if err != nil {
		utils.WriteError(w, http.StatusInternalServerError, "failed to load bible book")
		return
	}
	utils.WriteJSON(w, http.StatusOK, book)
}
