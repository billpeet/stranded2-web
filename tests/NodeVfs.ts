import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { normalizePath, ntfsOrder, type Vfs } from '../src/lib/s2/io/Vfs';

/** Vfs over a mod directory on disk, for tests. */
export class NodeVfs implements Vfs {
	private files = new Map<string, string>();

	constructor(private root: string) {
		const walk = (dir: string) => {
			for (const name of readdirSync(dir)) {
				const p = join(dir, name);
				if (statSync(p).isDirectory()) walk(p);
				else {
					const rel = relative(root, p).split(sep).join('/');
					this.files.set(rel.toLowerCase(), rel);
				}
			}
		};
		walk(root);
	}

	all(): string[] {
		return [...this.files.values()];
	}

	exists(path: string): boolean {
		return this.files.has(normalizePath(path));
	}

	list(dir: string): string[] {
		const prefix = normalizePath(dir).replace(/\/$/, '') + '/';
		const out: string[] = [];
		for (const [key, real] of this.files) {
			if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
				out.push(real.slice(prefix.length));
			}
		}
		return out.sort(ntfsOrder);
	}

	url(path: string): string {
		return 'file://' + join(this.root, this.files.get(normalizePath(path)) ?? path);
	}

	async readBytes(path: string): Promise<Uint8Array> {
		const real = this.files.get(normalizePath(path));
		if (real === undefined) throw new Error(`File not found: ${path}`);
		return new Uint8Array(readFileSync(join(this.root, real)));
	}
}
