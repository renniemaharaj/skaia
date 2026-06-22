package app

import (
	"testing"

	pb "github.com/skaia/grpc/grengo"
)

func TestPasscodeExemptMethod(t *testing.T) {
	exempt := []string{
		pb.GrengoService_PasscodeStatus_FullMethodName,
		pb.GrengoService_VerifyPasscode_FullMethodName,
	}
	for _, method := range exempt {
		if !passcodeExemptMethod(method) {
			t.Fatalf("expected %s to be passcode exempt", method)
		}
	}

	if passcodeExemptMethod(pb.GrengoService_ListSites_FullMethodName) {
		t.Fatalf("expected %s to require passcode", pb.GrengoService_ListSites_FullMethodName)
	}
}
