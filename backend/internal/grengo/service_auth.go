package grengo

import (
	"context"
	"log"

	pb "github.com/skaia/grpc/grengo"
)

func (s *Service) PasscodeConfigured() bool {
	resp, err := s.client.PasscodeStatus(context.Background(), &pb.EmptyRequest{})
	if err != nil {
		log.Printf("grengo PasscodeStatus error: %v", err)
		return false
	}
	return resp.Configured
}

func (s *Service) VerifyPasscode(p1, p2 string) bool {
	resp, err := s.client.VerifyPasscode(context.Background(), &pb.VerifyPasscodeRequest{
		P1: p1,
		P2: p2,
	})
	if err != nil {
		return false
	}
	return resp.Valid
}
