// Copies the original game's mod folder into static/game and writes a manifest.
// The original resolves paths case-insensitively with backslashes (Windows);
// the manifest lets the web build do the same on any host.
import { cpSync, mkdirSync, readdirSync, statSync, writeFileSync, rmSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const src = resolve(process.argv[2] ?? '../stranded2_en');
const mod = process.argv[3] ?? 'Stranded II';
const out = resolve('static/game');
const modSrc = join(src, 'mods', mod);
const modOut = join(out, 'mod');

rmSync(out, { recursive: true, force: true });
mkdirSync(modOut, { recursive: true });
cpSync(modSrc, modOut, {
	recursive: true,
	filter: (p) => !relative(modSrc, p).split(sep).slice(0, -1).includes('saves')
});

const files = {};
const walk = (dir) => {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p);
		else {
			const rel = relative(modOut, p).split(sep).join('/');
			files[rel.toLowerCase()] = rel;
		}
	}
};
walk(modOut);
writeFileSync(join(out, 'manifest.json'), JSON.stringify({ mod, files }));
console.log(`synced ${Object.keys(files).length} files from ${modSrc}`);
