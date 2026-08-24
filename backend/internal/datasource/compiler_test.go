package datasource

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestExecuteTypeScriptCapturesPreviewDetailsInBackendRunner(t *testing.T) {
	files := map[string]string{
		"main.ts": `return [{ heading: "Sandboxed", subheading: env.MESSAGE }];`,
	}

	result, err := ExecuteTypeScript(files, map[string]string{"MESSAGE": "Backend"}, true)
	if err != nil {
		t.Fatalf("ExecuteTypeScript() error = %v", err)
	}
	if result.Error != "" || len(result.Diagnostics) != 0 {
		t.Fatalf("unexpected execution result: error=%q diagnostics=%v", result.Error, result.Diagnostics)
	}
	if result.JS == "" {
		t.Fatal("expected compiled JavaScript in privileged preview response")
	}
	if len(result.FetchLog) != 0 {
		t.Fatalf("unexpected fetch log: %#v", result.FetchLog)
	}

	var rows []map[string]any
	if err := json.Unmarshal(result.Data, &rows); err != nil {
		t.Fatalf("decode result data: %v", err)
	}
	if len(rows) != 1 || rows[0]["subheading"] != "Backend" {
		t.Fatalf("unexpected rows: %#v", rows)
	}
}

func TestExecuteTypeScriptBlocksPrivateNetworkFetches(t *testing.T) {
	result, err := ExecuteTypeScript(
		map[string]string{
			"main.ts": `
const response = await fetch("http://127.0.0.1:8080/private");
return [{ heading: "Unexpected", subheading: await response.text() }];`,
		},
		nil,
		true,
	)
	if err != nil {
		t.Fatalf("ExecuteTypeScript() error = %v", err)
	}
	if !strings.Contains(result.Error, "private network destinations are not allowed") {
		t.Fatalf("private destination was not denied: error=%q", result.Error)
	}
	if len(result.FetchLog) != 1 || !strings.Contains(result.FetchLog[0].Error, "private network") {
		t.Fatalf("unexpected denied fetch log: %#v", result.FetchLog)
	}
}

func TestExecuteTypeScriptCannotReachHostFunctionConstructors(t *testing.T) {
	files := map[string]string{
		"main.ts": `
const outcomes = [];
for (const probe of [
  () => fetch.constructor("return typeof process")(),
  () => globalThis.constructor.constructor("return typeof process")(),
]) {
  try {
    outcomes.push(await probe());
  } catch (error) {
    outcomes.push(error.name);
  }
}
return [{ heading: "Isolation", subheading: outcomes.join(",") }];`,
	}

	result, err := ExecuteTypeScript(files, nil, true)
	if err != nil {
		t.Fatalf("ExecuteTypeScript() error = %v", err)
	}
	var rows []map[string]any
	if err := json.Unmarshal(result.Data, &rows); err != nil {
		t.Fatalf("decode result data: %v", err)
	}
	if len(rows) != 1 || rows[0]["subheading"] != "EvalError,EvalError" {
		t.Fatalf("host constructor escape was not blocked: %#v", rows)
	}
}

func TestSandboxedNodeArgsDenyUnneededHostCapabilities(t *testing.T) {
	dir := tsRunnerDir()
	args, err := sandboxedNodeArgs(dir, dir+"/execute.js")
	if err != nil {
		t.Fatalf("sandboxedNodeArgs() error = %v", err)
	}
	joined := strings.Join(args, " ")
	if !strings.Contains(joined, "permission") || !strings.Contains(joined, "--allow-fs-read="+dir) {
		t.Fatalf("permission boundary missing from %q", joined)
	}
	for _, forbidden := range []string{"--allow-child-process", "--allow-fs-write", "--allow-worker", "--allow-addons"} {
		if strings.Contains(joined, forbidden) {
			t.Fatalf("runner grants forbidden capability %q in %q", forbidden, joined)
		}
	}
}

func TestExecuteTypeScriptOmitsPreviewDetailsForSavedRenders(t *testing.T) {
	result, err := ExecuteTypeScript(
		map[string]string{"main.ts": `return [{ heading: "Saved", subheading: "Render" }];`},
		nil,
		false,
	)
	if err != nil {
		t.Fatalf("ExecuteTypeScript() error = %v", err)
	}
	if result.JS != "" || len(result.FetchLog) != 0 {
		t.Fatalf("saved render disclosed preview details: js=%q fetch_log=%#v", result.JS, result.FetchLog)
	}
}
