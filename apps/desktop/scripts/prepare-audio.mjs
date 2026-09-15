import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const YT_DLP = "2026.08.19";
const DENO = "v2.9.6";
const root = fileURLToPath(new URL("../src-tauri/resources/audio/", import.meta.url));
// yt-dlp's unpacked (onedir) builds: the single-file ones extract themselves to
// a temp folder on every start, which added over a second to each song.
const targets = {
  "windows-x86_64": {
    ytDlp: ["yt-dlp_win.zip", "30b4c14aafab6082becff7881e41b76df46dc43ea7633479410a91e29da492bf"],
    deno: [
      "x86_64-pc-windows-msvc",
      "15e5300b0ba3c3695a7621d90160a746ec9e710228cee639afa9d580f6e3cd11",
    ],
  },
  "linux-x86_64": {
    ytDlp: ["yt-dlp_linux.zip", "32e72032766bef9199d99d15beb69fd52e46df8f8b06f0d8745db59e04d339e9"],
    deno: [
      "x86_64-unknown-linux-gnu",
      "394f07f4da2bebe6ce6f1e7ce0fa16429b29b08c35e3fac3fe25972676dff4b2",
    ],
  },
  "macos-x86_64": {
    ytDlp: ["yt-dlp_macos.zip", "07e54b0865303c864006925913bce2604f8ee8cc6f18699bac9c309f9328a6d8"],
    deno: [
      "x86_64-apple-darwin",
      "7d4524b82bcc557fe020a1a5b56956ed42b992ae5b28026e8ad5d17329533f5f",
    ],
  },
  "macos-aarch64": {
    ytDlp: ["yt-dlp_macos.zip", "07e54b0865303c864006925913bce2604f8ee8cc6f18699bac9c309f9328a6d8"],
    deno: [
      "aarch64-apple-darwin",
      "213a2f304f04d3c9cb5220669afad138f60a5aab1fe80962abdeb8f35807a472",
    ],
  },
};
const platform = { win32: "windows", linux: "linux", darwin: "macos" }[process.platform];
const arch = { x64: "x86_64", arm64: "aarch64" }[process.arch];
const selected =
  process.platform === "darwin" ? ["macos-x86_64", "macos-aarch64"] : [`${platform}-${arch}`];
const hash = (data) => createHash("sha256").update(data).digest("hex");

async function fetchVerified(url, expected) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio download failed: ${response.status} ${url}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (hash(data) !== expected) throw new Error(`Audio checksum mismatch: ${url}`);
  return data;
}

function unzip(zip, destination) {
  const result =
    process.platform === "win32"
      ? spawnSync(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            "Expand-Archive -LiteralPath $env:MINIFY_AUDIO_ZIP -DestinationPath $env:MINIFY_AUDIO_DIR -Force",
          ],
          {
            env: { ...process.env, MINIFY_AUDIO_ZIP: zip, MINIFY_AUDIO_DIR: destination },
            windowsHide: true,
            stdio: "inherit",
          }
        )
      : spawnSync("unzip", ["-oq", zip, "-d", destination], { stdio: "inherit" });
  if (result.status !== 0) throw new Error("Could not unpack audio helper");
}

async function removeFile(file) {
  const info = await stat(file).catch(() => null);
  if (info?.isFile()) await rm(file);
}

/**
 * Unpacks a verified archive into its own folder, and skips all of it while the
 * folder still holds that exact archive: dev starts used to download ~60 MB.
 */
async function install(url, expected, destination, name, extension) {
  const stamp = path.join(destination, ".archive-sha256");
  if ((await readFile(stamp, "utf8").catch(() => "")) === expected) return;
  const data = await fetchVerified(url, expected);
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const zip = `${destination}.zip`;
  await writeFile(zip, data);
  try {
    unzip(zip, destination);
  } finally {
    await rm(zip, { force: true });
  }
  const executable = path.join(destination, `${name}${extension}`);
  const entries = await readdir(destination, { withFileTypes: true });
  if (!entries.some((entry) => entry.isFile() && entry.name === `${name}${extension}`)) {
    // yt-dlp names its macOS and Linux builds after the platform.
    const found = entries.find((entry) => entry.isFile() && entry.name.startsWith(name));
    if (!found) throw new Error(`${name} is missing from ${path.basename(url)}`);
    await rename(path.join(destination, found.name), executable);
  }
  await chmod(executable, 0o755);
  await writeFile(stamp, expected);
}

async function downloadIfMissing(url, destination) {
  if (await stat(destination).catch(() => null)) return;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio download failed: ${response.status} ${url}`);
  await writeFile(destination, Buffer.from(await response.arrayBuffer()));
}

for (const target of selected) {
  const asset = targets[target];
  if (!asset) throw new Error(`Unsupported audio target: ${target}`);
  const directory = path.join(root, target);
  await mkdir(directory, { recursive: true });
  const extension = target.startsWith("windows") ? ".exe" : "";
  // Earlier layouts kept both binaries at the top of the folder.
  for (const old of [`yt-dlp${extension}`, `deno${extension}`]) {
    await removeFile(path.join(directory, old));
  }
  await install(
    `https://github.com/yt-dlp/yt-dlp/releases/download/${YT_DLP}/${asset.ytDlp[0]}`,
    asset.ytDlp[1],
    path.join(directory, "yt-dlp"),
    "yt-dlp",
    extension
  );
  await install(
    `https://github.com/denoland/deno/releases/download/${DENO}/deno-${asset.deno[0]}.zip`,
    asset.deno[1],
    path.join(directory, "deno"),
    "deno",
    extension
  );
  console.log(`Audio helpers ready: ${target}`);
}
await downloadIfMissing(
  `https://raw.githubusercontent.com/yt-dlp/yt-dlp/${YT_DLP}/THIRD_PARTY_LICENSES.txt`,
  path.join(root, "YT-DLP-THIRD-PARTY-LICENSES.txt")
);
await downloadIfMissing(
  `https://raw.githubusercontent.com/denoland/deno/${DENO}/LICENSE.md`,
  path.join(root, "DENO-LICENSE.md")
);
await copyFile(
  fileURLToPath(new URL("../AUDIO-NOTICES.md", import.meta.url)),
  path.join(root, "AUDIO-NOTICES.md")
);
