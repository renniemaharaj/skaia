package page

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteTypedMutationErrorReturnsContentFreeRevisionConflict(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeTypedMutationError(recorder, &SectionRevisionConflict{Expected: 4, Actual: 7})

	if recorder.Code != http.StatusConflict {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusConflict)
	}
	var payload struct {
		Error    string                  `json:"error"`
		Conflict SectionRevisionConflict `json:"conflict"`
	}
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.Error != "section revision conflict" || payload.Conflict.Expected != 4 || payload.Conflict.Actual != 7 {
		t.Fatalf("unexpected conflict payload: %+v", payload)
	}
	var shape map[string]json.RawMessage
	if err := json.Unmarshal(recorder.Body.Bytes(), &shape); err != nil {
		t.Fatalf("decode response shape: %v", err)
	}
	if len(shape) != 2 || shape["error"] == nil || shape["conflict"] == nil {
		t.Fatalf("unexpected top-level response fields: %v", shape)
	}
	var conflictShape map[string]json.RawMessage
	if err := json.Unmarshal(shape["conflict"], &conflictShape); err != nil {
		t.Fatalf("decode conflict shape: %v", err)
	}
	if len(conflictShape) != 2 || conflictShape["expected_revision"] == nil || conflictShape["actual_revision"] == nil {
		t.Fatalf("unexpected conflict fields: %v", conflictShape)
	}
}

func TestWriteTypedMutationErrorSanitizesInvalidInput(t *testing.T) {
	recorder := httptest.NewRecorder()

	writeTypedMutationError(recorder, ErrTypedSectionInvalid)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
	}
	if recorder.Body.String() != "{\"error\":\"invalid typed mutation\"}\n" {
		t.Fatalf("unexpected invalid-input response: %s", recorder.Body.String())
	}
}
