// Packs static/game (made by `pnpm sync-assets`) into game-data.tar.gz for a
// deployment: the archive has manifest.json and mod/ at its top level, which
// is what deploy/40-game-data.sh expects behind GAME_DATA_URL.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { relative, resolve, sep } from 'node:path';

const src = resolve('static/game');
const out = resolve(process.argv[2] ?? 'game-data.tar.gz');

if (!existsSync(resolve(src, 'manifest.json'))) {
	console.error('static/game/manifest.json not found: run "pnpm sync-assets <game folder>" first.');
	process.exit(1);
}

// Run inside static/game with relative paths: GNU tar reads "C:" in an
// absolute Windows path as a remote host. bsdtar and GNU tar both accept this.
const outRel = relative(src, out).split(sep).join('/');
execFileSync('tar', ['-czf', outRel, 'manifest.json', 'mod'], { cwd: src, stdio: 'inherit' });

const sha = createHash('sha256').update(readFileSync(out)).digest('hex');
console.log(`wrote ${out} (${(statSync(out).size / 1048576).toFixed(1)} MB)`);
console.log(`GAME_DATA_SHA256=${sha}`);
