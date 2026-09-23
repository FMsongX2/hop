import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)));

test('HOP license names HOP contributors and points to third-party notices', async () => {
  const license = await readFile(join(repoRoot, 'LICENSE'), 'utf8');
  assert.match(license, /HOP contributors/);
  assert.match(license, /Edward Kim/);
  assert.match(license, /THIRD_PARTY_LICENSES\.md/);
});

test('third-party notice tracks the pinned rhwp release and is bundled with the app', async () => {
  const upstream = JSON.parse(await readFile(join(repoRoot, 'config/rhwp-upstream.json'), 'utf8'));
  const notice = await readFile(join(repoRoot, 'THIRD_PARTY_LICENSES.md'), 'utf8');
  assert.match(notice, new RegExp(`rhwp ${upstream.version.replace(/\\./g, '\\\\.')} \\(${upstream.commit}\\)`));
  assert.match(notice, /## Rust 크레이트/);
  assert.match(notice, /## npm 패키지/);

  const tauriConfig = JSON.parse(await readFile(join(repoRoot, 'apps/desktop/src-tauri/tauri.conf.json'), 'utf8'));
  const resources = tauriConfig.bundle.resources;
  assert.equal(resources['../../../LICENSE'], 'licenses/LICENSE');
  assert.equal(resources['../../../THIRD_PARTY_LICENSES.md'], 'licenses/THIRD_PARTY_LICENSES.md');
  assert.equal(resources['../../../third_party/rhwp/THIRD_PARTY_LICENSES.md'], 'licenses/rhwp-THIRD_PARTY_LICENSES.md');
  assert.equal(resources['../../../third_party/rhwp/LICENSE'], 'licenses/rhwp-LICENSE');
});
