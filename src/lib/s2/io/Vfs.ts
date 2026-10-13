import { latin1 } from './BinaryReader';

/**
 * Read-only view of the mod directory. The original game runs with the mod
 * folder as its working directory and uses case-insensitive, backslash paths
 * such as "gfx\palm01.b3d"; every implementation accepts those as-is.
 */
export interface Vfs {
	/** FileType(path)=1 */
	exists(path: string): boolean;
	/** ReadDir/NextFile: file names (not sub-directories) directly inside dir. */
	list(dir: string): string[];
	readBytes(path: string): Promise<Uint8Array>;
	/** URL a browser can load the file from (images, audio). */
	url(path: string): string;
}

export function normalizePath(path: string): string {
	return path.replaceAll('\\', '/').replace(/^\.?\/+/, '').replace(/\/+/g, '/').toLowerCase();
}

/**
 * Directory enumeration order of the original on NTFS: by upper-cased
 * character code (so "objects.inf" comes before "objects_bushes.inf").
 * Definition loaders depend on it for carry-over between files.
 */
export function ntfsOrder(a: string, b: string): number {
	const x = a.toUpperCase();
	const y = b.toUpperCase();
	return x < y ? -1 : x > y ? 1 : 0;
}

export async function readText(vfs: Vfs, path: string): Promise<string> {
	return latin1(await vfs.readBytes(path));
}

/** ReadLine semantics over a whole file: split on LF, drop CR. */
export async function readLines(vfs: Vfs, path: string): Promise<string[]> {
	const text = (await readText(vfs, path)).replaceAll('\r', '');
	const lines = text.split('\n');
	if (lines.length && lines[lines.length - 1] === '') lines.pop();
	return lines;
}

interface Manifest {
	mod: string;
	files: Record<string, string>;
}

/** Vfs backed by static/game (see scripts/sync-assets.mjs). */
export class HttpVfs implements Vfs {
	private constructor(
		private base: string,
		private files: Record<string, string>
	) {}

	static async open(base = '/game'): Promise<HttpVfs> {
		const res = await fetch(`${base}/manifest.json`);
		if (!res.ok) throw new Error(`Game data missing: run "pnpm sync-assets" (${res.status})`);
		const manifest = (await res.json()) as Manifest;
		return new HttpVfs(base, manifest.files);
	}

	exists(path: string): boolean {
		return normalizePath(path) in this.files;
	}

	list(dir: string): string[] {
		const prefix = normalizePath(dir).replace(/\/$/, '') + '/';
		const out: string[] = [];
		for (const [key, real] of Object.entries(this.files)) {
			if (key.startsWith(prefix) && !key.slice(prefix.length).includes('/')) {
				out.push(real.slice(prefix.length));
			}
		}
		return out.sort(ntfsOrder);
	}

	url(path: string): string {
		const real = this.files[normalizePath(path)];
		if (real === undefined) throw new Error(`File not found: ${path}`);
		return `${this.base}/mod/${real.split('/').map(encodeURIComponent).join('/')}`;
	}

	async readBytes(path: string): Promise<Uint8Array> {
		const res = await fetch(this.url(path));
		if (!res.ok) throw new Error(`Unable to read ${path} (${res.status})`);
		return new Uint8Array(await res.arrayBuffer());
	}
}
