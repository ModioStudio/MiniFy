import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tauriDir = join(__dirname, '..');
const projectRoot = join(tauriDir, '..', '..', '..');
const configPath = join(tauriDir, 'tauri.conf.json');
const pubkeyPath = join(projectRoot, '.tauri', 'updater.key.pub');

if (!existsSync(pubkeyPath)) {
  console.log('No updater.key.pub found, skipping pubkey injection');
  process.exit(0);
}

const pubkey = readFileSync(pubkeyPath, 'utf8').trim();

if (pubkey === 'REPLACE_WITH_YOUR_PUBLIC_KEY' || pubkey === '') {
  console.log('Updater pubkey not configured, skipping injection');
  process.exit(0);
}

const config = JSON.parse(readFileSync(configPath, 'utf8'));

if (!config.bundle) {
  config.bundle = {};
}

if (!config.plugins) {
  config.plugins = {};
}

if (!config.plugins.updater) {
  config.plugins.updater = {};
}

config.bundle.createUpdaterArtifacts = 'v1Compatible';
config.plugins.updater.pubkey = pubkey;

writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
console.log('Injected updater pubkey into tauri.conf.json');

