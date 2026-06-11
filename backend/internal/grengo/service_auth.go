package grengo

import (
	"bytes"
	"encoding/json"
)

// PasscodeConfigured checks with the grengo API whether a passcode is set.
func (s *Service) PasscodeConfigured() bool {
	resp, err := s.client.Get(s.apiURL + "/passcode/status")
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var result struct {
		Configured bool `json:"configured"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Configured
}

// VerifyPasscode checks a (p1, p2) pair via the grengo API.
func (s *Service) VerifyPasscode(p1, p2 string) bool {
	body, _ := json.Marshal(map[string]string{"p1": p1, "p2": p2})
	resp, err := s.client.Post(s.apiURL+"/verify-passcode", "application/json", bytes.NewReader(body))
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	var result struct {
		Valid bool `json:"valid"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false
	}
	return result.Valid
}
