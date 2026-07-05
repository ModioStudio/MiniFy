// Builds the Tauri updater manifest (latest.json) from the release artifacts.
//
// The updater endpoint in tauri.conf.json points at this file on the "latest"
// GitHub release. For each platform we reference the signed updater artifact
// and inline the contents of its detached `.sig` file, which the app verifies
// against the public key baked into the build.
//
// Env:
//   ARTIFACTS_DIR  directory holding the collected release files (+ .sig)
//   REPO           owner/name, e.g. ModioStudio/MiniFy
//   TAG            release tag used in the download URL, e.g. v0.7.0
//   VERSION        plain semver written into the manifest, e.g. 0.7.0
//   NOTES          optional release notes string
//   OUT            output path for latest.json

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const artifactsDir = process.env.ARTIFACTS_DIR;
const repo = process.env.REPO;
const tag = process.env.TAG;
const version = (process.env.VERSION || "").replace(/^v/, "");
const notes = process.env.NOTES || `Update to version ${version}.`;
const out = process.env.OUT || "latest.json";

if (!artifactsDir || !repo || !tag || !version) {
  console.error("Missing required env: ARTIFACTS_DIR, REPO, TAG, VERSION");
  process.exit(1);
}

const files = readdirSync(artifactsDir);

const downloadUrl = (file) =>
  `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(file)}`;

const readSig = (file) => readFileSync(join(artifactsDir, `${file}.sig`), "utf8").trim();

// Each rule maps an updater artifact (matched by suffix) to the platform keys
// it should populate. The macOS universal build covers both architectures.
const rules = [
  { match: (f) => f.endsWith("-setup.exe"), platforms: ["windows-x86_64"] },
  { match: (f) => f.endsWith(".app.tar.gz"), platforms: ["darwin-x86_64", "darwin-aarch64"] },
  { match: (f) => f.endsWith(".AppImage"), platforms: ["linux-x86_64"] },
];

const platforms = {};

for (const rule of rules) {
  const artifact = files.find((f) => rule.match(f) && !f.endsWith(".sig"));
  if (!artifact) continue;

  if (!files.includes(`${artifact}.sig`)) {
    console.warn(`Skipping ${artifact}: no matching .sig signature found`);
    continue;
  }

  const entry = { signature: readSig(artifact), url: downloadUrl(artifact) };
  for (const platform of rule.platforms) {
    platforms[platform] = entry;
  }
  console.log(`+ ${rule.platforms.join(", ")} -> ${artifact}`);
}

if (Object.keys(platforms).length === 0) {
  console.error("No updater artifacts with signatures found; refusing to write an empty manifest.");
  process.exit(1);
}

const manifest = {
  version,
  notes,
  pub_date: new Date().toISOString(),
  platforms,
};

writeFileSync(out, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Wrote ${out} for ${version} with ${Object.keys(platforms).length} platform(s).`);
