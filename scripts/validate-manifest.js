#!/usr/bin/env node
/**
 * Validate manifest.json before it ships. Runs in CI and, most importantly,
 * after the release workflow patches the version: a tag like v1.2.3-rc1 would
 * otherwise produce a manifest Chrome refuses to load.
 */
const fs = require("fs");
const path = require("path");

const manifestPath = path.join(__dirname, "..", "manifest.json");
const errors = [];

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
} catch (err) {
  console.error(`manifest.json is not valid JSON: ${err.message}`);
  process.exit(1);
}

// Chrome requires 1-4 dot-separated integers, each 0-65535, no leading zeros.
const VERSION_RE = /^(0|[1-9]\d{0,4})(\.(0|[1-9]\d{0,4})){0,3}$/;
if (!VERSION_RE.test(manifest.version || "")) {
  errors.push(
    `version "${manifest.version}" is not a valid Chrome extension version ` +
      "(1-4 dot-separated integers, e.g. 1.2.3)"
  );
}

if (manifest.manifest_version !== 3) {
  errors.push("manifest_version must be 3");
}

// The header must never be injectable everywhere by default: host access is
// granted per domain at runtime instead.
if (manifest.host_permissions?.length) {
  errors.push(
    `host_permissions must stay empty (found ${JSON.stringify(manifest.host_permissions)}); ` +
      "use optional_host_permissions and request access per domain"
  );
}

// The Chrome Web Store rejects a package whose description is empty or longer
// than 132 characters, at upload time rather than at review time.
const description = manifest.description || "";
if (!description || description.length > 132) {
  errors.push(
    `description must be 1-132 characters for the Chrome Web Store (found ${description.length})`
  );
}

if (manifest.permissions?.includes("declarativeNetRequest")) {
  errors.push(
    "use declarativeNetRequestWithHostAccess so rules only apply to granted hosts"
  );
}

for (const file of [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  ...Object.values(manifest.icons || {}),
]) {
  if (file && !fs.existsSync(path.join(__dirname, "..", file))) {
    errors.push(`referenced file is missing: ${file}`);
  }
}

if (errors.length) {
  console.error("manifest.json validation failed:");
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}

console.log(`manifest.json OK (version ${manifest.version})`);
