package bench

import (
	"regexp"
	"strings"
	"testing"
)

var re = regexp.MustCompile(`server_name\s+[^;]+;`)

// TestServerNameRegex tests matching and replacement behavior clearly
func TestServerNameRegex(t *testing.T) {

	tests := []struct {
		name        string
		input       string
		replacement string
		expected    string
		shouldMatch bool
	}{
		{
			name:        "single line server_name",
			input:       "server_name example.com;",
			replacement: "server_name frappe.localhost;",
			expected:    "server_name frappe.localhost;",
			shouldMatch: true,
		},
		{
			name: "multi-line server_name",
			input: `server_name
		example.com
		www.example.com;`,
			replacement: "server_name frappe.localhost;",
			expected:    "server_name frappe.localhost;",
			shouldMatch: true,
		},
		{
			name:        "extra whitespace",
			input:       "server_name   example.com   ;",
			replacement: "server_name hrtmpaydev.thewriterco.com;",
			expected:    "server_name hrtmpaydev.thewriterco.com;",
			shouldMatch: true,
		},
		{
			name:        "no server_name",
			input:       "listen 80;\nroot /var/www;",
			replacement: "server_name frappe.localhost;",
			expected:    "listen 80;\nroot /var/www;",
			shouldMatch: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			match := re.FindString(tt.input)

			if tt.shouldMatch && match == "" {
				t.Fatalf(
					"EXPECTED MATCH, GOT NONE\nINPUT:\n%s",
					tt.input,
				)
			}

			if !tt.shouldMatch && match != "" {
				t.Fatalf(
					"EXPECTED NO MATCH, GOT: %q\nINPUT:\n%s",
					match,
					tt.input,
				)
			}

			result := re.ReplaceAllString(tt.input, tt.replacement)

			if result != tt.expected {
				t.Fatalf(
					"REPLACEMENT FAILED\nMATCHED: %q\nINPUT:\n%s\nEXPECTED:\n%s\nGOT:\n%s",
					match,
					tt.input,
					tt.expected,
					result,
				)
			}

			t.Logf("PASS | MATCHED: %q", match)
		})
	}
}

// TestServerNameRegexInContext validates behavior inside a full nginx config
func TestServerNameRegexInContext(t *testing.T) {
	re := regexp.MustCompile(`server_name\s+[^;]+;`)

	nginxConfig := `upstream frappe_app {
	server frappe:8080 fail_timeout=0;
}

server {
	listen 80;
	listen [::]:80;

	server_name
		frappe.localhost
		hrms.localhost;

	root /home/frappe/frappe-bench/sites;
	location / {
		proxy_pass http://frappe_app;
	}
}`

	replacement := "server_name hrtmpaydev.thewriterco.com;"

	match := re.FindString(nginxConfig)
	if match == "" {
		t.Fatal("EXPECTED server_name BLOCK, GOT NONE")
	}

	result := re.ReplaceAllString(nginxConfig, replacement)

	if !contains(result, replacement) {
		t.Fatalf(
			"REPLACEMENT NOT FOUND\nEXPECTED: %s\nGOT:\n%s",
			replacement,
			result,
		)
	}

	if strings.Count(result, "server_name") != 1 {
		t.Fatalf(
			"EXPECTED EXACTLY 1 server_name, GOT %d\n%s",
			strings.Count(result, "server_name"),
			result,
		)
	}

	t.Logf("PASS | CONTEXT PATCH SUCCESSFUL")
}

// TestServerNameRegressionPatchingFail ensures multiline regression is covered
func TestServerNameRegressionPatchingFail(t *testing.T) {
	re := regexp.MustCompile(`server_name\s+[^;]+;`)

	input := `server {
	listen 80;
	server_name
		site1.example.com
		site2.example.com;

	location / {
		proxy_pass http://upstream;
	}
}`

	replacement := "server_name hrtmpaydev.thewriterco.com;"

	if !re.MatchString(input) {
		t.Fatal("REGRESSION: MULTILINE server_name DID NOT MATCH")
	}

	result := re.ReplaceAllString(input, replacement)

	if contains(result, "site1.example.com") {
		t.Fatalf("OLD server_name STILL PRESENT\n%s", result)
	}

	if !contains(result, replacement) {
		t.Fatalf("PATCH FAILED\n%s", result)
	}

	t.Log("PASS | REGRESSION COVERED")
}

// BenchmarkServerNameRegex benchmarks regex replacement performance
func BenchmarkServerNameRegex(b *testing.B) {
	re := regexp.MustCompile(`server_name\s+[^;]+;`)

	config := `server {
	listen 80;
	server_name
		example.com
		www.example.com;
	location / {
		proxy_pass http://upstream;
	}
}`

	replacement := "server_name frappe.localhost;"

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		re.ReplaceAllString(config, replacement)
	}
}
