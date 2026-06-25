package app

import (
	"reflect"
	"testing"
)

func TestNginxHostsForDomainAddsWildcardForApexDomains(t *testing.T) {
	tests := []struct {
		name   string
		domain string
		want   []string
	}{
		{
			name:   "apex domain",
			domain: "thewriterco.com",
			want:   []string{"thewriterco.com", "*.thewriterco.com"},
		},
		{
			name:   "www domain",
			domain: "www.thewriterco.com",
			want:   []string{"www.thewriterco.com"},
		},
		{
			name:   "localhost",
			domain: "localhost",
			want:   []string{"localhost"},
		},
		{
			name:   "ip address",
			domain: "127.0.0.1",
			want:   []string{"127.0.0.1"},
		},
		{
			name:   "already wildcard",
			domain: "*.thewriterco.com",
			want:   []string{"*.thewriterco.com"},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := nginxHostsForDomain(tt.domain)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("nginxHostsForDomain(%q) = %#v, want %#v", tt.domain, got, tt.want)
			}
		})
	}
}
