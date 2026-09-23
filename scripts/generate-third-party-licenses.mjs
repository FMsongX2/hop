// HOP 배포본에 동봉할 서드파티 고지 문서를 생성함. cargo metadata·pnpm licenses·폰트 목록을 한 문서로 모음.
// 실행: node scripts/generate-third-party-licenses.mjs  (의존성·rhwp 갱신 뒤 다시 실행)
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const tauriDir = join(root, 'apps/desktop/src-tauri');
const upstream = JSON.parse(readFileSync(join(root, 'config/rhwp-upstream.json'), 'utf8'));

const cargo = JSON.parse(execFileSync('cargo', ['metadata', '--format-version', '1'], { cwd: tauriDir, maxBuffer: 256 * 1024 * 1024 }).toString());
const workspace = new Set(cargo.workspace_members);
const crates = cargo.packages
  .filter((p) => !workspace.has(p.id) && p.source)
  .map((p) => ({ name: p.name, version: p.version, license: p.license ?? 'UNKNOWN', repo: p.repository ?? '' }))
  .sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version));

const npmRaw = JSON.parse(execFileSync('pnpm', ['licenses', 'list', '--json'], { cwd: root }).toString());
const npm = Object.entries(npmRaw)
  .flatMap(([license, pkgs]) => pkgs.map((p) => ({ name: p.name, versions: p.versions ?? [p.version], license })))
  .sort((a, b) => a.name.localeCompare(b.name));

const fontsMd = readFileSync(join(root, 'assets/fonts/FONTS.md'), 'utf8');
const fontTable = fontsMd.slice(fontsMd.indexOf('| 파일'));

const summary = {};
for (const c of crates) summary[c.license] = (summary[c.license] ?? 0) + 1;

const lines = [];
lines.push('# HOP Third-Party Licenses', '');
lines.push('HOP는 MIT 라이선스로 배포된다. 이 문서는 배포본에 포함되는 서드파티 구성 요소와 라이선스를 정리한 것이며,');
lines.push('`node scripts/generate-third-party-licenses.mjs`로 생성한다. 의존성이나 rhwp를 갱신하면 다시 생성한다.', '');
lines.push('## 문서 엔진', '');
lines.push(`- rhwp ${upstream.version} (${upstream.commit}) — MIT, https://github.com/edwardkim/rhwp`);
lines.push('- rhwp가 포함하는 서드파티 고지(포팅 알고리즘, 폰트, 크레이트)는 동봉된 `rhwp-THIRD_PARTY_LICENSES.md`를 따른다.', '');
lines.push('## 번들 폰트', '', fontTable.trim(), '');
lines.push('- PDF 내보내기용 `NotoSansKR-Regular.ttf` — SIL OFL 1.1 (rhwp `ttfs/opensource`, 동봉 `NotoSansKR-OFL.txt`)', '');
lines.push('## 고지 의무가 있는 항목', '');
lines.push('- BSD-3-Clause 크레이트(`encoding_rs` 등): 저작권·라이선스 고지를 이 문서로 유지한다.');
lines.push('- MPL-2.0 크레이트·패키지(`cssparser`, `selectors`, `lightningcss` 등): 수정 없이 사용하며, 소스는 각 저장소에서 받을 수 있다.');
lines.push('- Volexity hwp-extract(BSD-3-Clause): rhwp가 포팅한 HWP5 암호 문서 복호화. 원문 고지는 rhwp 문서에 있다.', '');
lines.push('## Rust 크레이트 라이선스 요약', '');
for (const [license, count] of Object.entries(summary).sort((a, b) => b[1] - a[1])) lines.push(`- ${license}: ${count}`);
lines.push('', '## Rust 크레이트', '', '| 크레이트 | 버전 | 라이선스 | 저장소 |', '| --- | --- | --- | --- |');
for (const c of crates) lines.push(`| ${c.name} | ${c.version} | ${c.license} | ${c.repo} |`);
lines.push('', '## npm 패키지 (studio host)', '', '| 패키지 | 버전 | 라이선스 |', '| --- | --- | --- |');
for (const p of npm) lines.push(`| ${p.name} | ${p.versions.join(', ')} | ${p.license} |`);
lines.push('');
writeFileSync(join(root, 'THIRD_PARTY_LICENSES.md'), lines.join('\n'));
console.log(`THIRD_PARTY_LICENSES.md: crates=${crates.length} npm=${npm.length}`);
