import { readFileSync, readdirSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";

const sourceRoot = resolve(process.cwd(), "src");
const knownRawForms = new Set([
  // Authentication and access challenges intentionally keep their dedicated surface.
  "components/auth/Auth.tsx",
  "components/auth/ForgotPasswordPage.tsx",
  "components/auth/ResetPasswordPage.tsx",
  "pages/MFAChallenge.tsx",
  "pages/RateLimitedPage.tsx",
  // Embedded command/confirmation microforms are not routed editor screens.
  "components/page/layout/voice/MediaSection.tsx",
  "components/ui/Console.tsx",
  "components/ui/Prompt.tsx",
]);

function filesUnder(directory) {
  return readdirSync(directory).flatMap(name => {
    const path = resolve(directory, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

const rawFormFiles = filesUnder(sourceRoot)
  .filter(path => path.endsWith(".tsx"))
  .filter(path => /<form\b/.test(readFileSync(path, "utf8")))
  .map(path => relative(sourceRoot, path));

const unknown = rawFormFiles.filter(path => !knownRawForms.has(path));
if (unknown.length) {
  console.error("Raw forms must use ManagedForm or be classified in the form-system audit:");
  for (const path of unknown) console.error(`- ${path}`);
  process.exit(1);
}

console.log(
  `Managed form audit passed: ${rawFormFiles.length} classified raw-form files, no untracked forms.`
);
