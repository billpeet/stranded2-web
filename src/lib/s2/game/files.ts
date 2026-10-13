/**
 * The Blitz3D file commands for ported game code, over a writable virtual
 * file system:
 *
 *   base     the read-only mod directory (Vfs: static/game/mod in the browser,
 *            NodeVfs in tests)
 *   overlay  everything the game writes: saves\*.sav, sys\settings.cfg,
 *            sys\controls.cfg, sys\load.cache, sys\recent.cache, maps written
 *            by the editor, core\mods.inf ... kept in memory and persisted
 *            (IndexedDB in the browser, nothing in tests)
 *
 * Reads are synchronous, as in Blitz. That works because of the warm-up:
 * `await warmUp()` loads the persisted overlay and every non-media file of
 * the mod (.inf .s2 .s2s .sav .cfg .cache .txt .bmpf ..., about 1.5 MB)
 * into memory before the game starts. Media files (images, models, sounds)
 * are loaded by their own layers; reading one of them with ReadFile needs
 * `await ensureFile(path)` first.
 *
 * Paths are what the original passes: backslashes or slashes, any case,
 * relative to the mod directory (the original's working directory) or
 * absolute below set_rootdir$ (ROOT_DIR). "C:\Stranded II\mods\<mod>\x" and
 * "x" are the same file; other absolute paths (core\mods.inf) only exist in
 * the overlay.
 *
 * Strings are byte strings (one char per byte), numbers little endian, as
 * bbruntime/bbfilesystem.cpp and bbstream.cpp read and write them.
 */
import { f32 } from '../blitz';
import { ntfsOrder, type Vfs } from '../io/Vfs';

/** set_rootdir$ of the port: SystemProperty("APPDIR"). */
export const ROOT_DIR = 'C:\\Stranded II\\';

/** Where the overlay is kept between sessions. */
export interface Persistence {
	load(): Promise<Map<string, StoredFile>>;
	put(key: string, file: StoredFile): void;
	delete(key: string): void;
}
export interface StoredFile {
	/** Path in the case it was written with. */
	name: string;
	/** null marks a deleted base file. */
	data: Uint8Array | null;
	/** True for a directory made with CreateDir. */
	dir?: boolean;
}

const MEDIA_EXT = /\.(bmp|jpg|jpeg|png|tga|dds|b3d|x|3ds|wav|ogg|mp3|mid|avi)$/i;

interface State {
	vfs: Vfs | null;
	moddir: string;
	/** key -> real name, for every base file */
	baseFiles: Map<string, string>;
	/** directories of the base, key -> real name */
	baseDirs: Map<string, string>;
	/** base file contents loaded so far */
	cache: Map<string, Uint8Array>;
	overlay: Map<string, StoredFile>;
	persistence: Persistence | null;
	cwd: string;
}
const st: State = {
	vfs: null,
	moddir: 'Stranded II',
	baseFiles: new Map(),
	baseDirs: new Map(),
	cache: new Map(),
	overlay: new Map(),
	persistence: null,
	cwd: ''
};

/**
 * Normalised key of a path: lower case, forward slashes, relative to the mod
 * directory; files outside the mod get the prefix "@root/".
 */
export function fileKey(path: string): string {
	let p = path.replaceAll('\\', '/');
	const root = ROOT_DIR.replaceAll('\\', '/').toLowerCase();
	let abs = false;
	if (p.toLowerCase().startsWith(root)) {
		p = p.slice(root.length);
		abs = true;
	} else if (/^[a-z]:\//i.test(p)) {
		return '@abs/' + p.toLowerCase();
	}
	p = p.replace(/^\.?\/+/, '').replace(/\/+/g, '/').replace(/\/$/, '');
	// resolve . and ..
	const parts: string[] = [];
	for (const s of p.split('/')) {
		if (s === '' || s === '.') continue;
		if (s === '..') parts.pop();
		else parts.push(s);
	}
	p = parts.join('/').toLowerCase();
	if (!abs) return p;
	const mod = `mods/${st.moddir.toLowerCase()}`;
	if (p === mod) return '';
	if (p.startsWith(mod + '/')) return p.slice(mod.length + 1);
	return '@root/' + p;
}

export interface WarmUpOptions {
	vfs: Vfs;
	/** Every file of the mod, relative paths in real case (manifest.json values, NodeVfs.all()). */
	allFiles: readonly string[];
	/** set_moddir$ */
	moddir?: string;
	persistence?: Persistence | null;
	/** Load these extensions too / skip the default preload. */
	preload?: (path: string) => boolean;
	onProgress?: (done: number, total: number) => void;
}

/** Makes the file commands usable: loads the overlay and the mod's data files. */
export async function warmUp(o: WarmUpOptions): Promise<void> {
	st.vfs = o.vfs;
	st.moddir = o.moddir ?? 'Stranded II';
	st.baseFiles.clear();
	st.baseDirs.clear();
	st.cache.clear();
	st.overlay.clear();
	st.persistence = o.persistence ?? null;
	st.cwd = '';
	for (const f of o.allFiles) {
		const real = f.replaceAll('\\', '/');
		st.baseFiles.set(real.toLowerCase(), real);
		const parts = real.split('/');
		for (let i = 1; i < parts.length; i++) {
			const dir = parts.slice(0, i).join('/');
			if (!st.baseDirs.has(dir.toLowerCase())) st.baseDirs.set(dir.toLowerCase(), dir);
		}
	}
	if (st.persistence) st.overlay = await st.persistence.load();
	const wanted = [...st.baseFiles.values()].filter(o.preload ?? ((p) => !MEDIA_EXT.test(p)));
	let done = 0;
	let next = 0;
	const worker = async () => {
		while (next < wanted.length) {
			const p = wanted[next++];
			st.cache.set(p.toLowerCase(), await o.vfs.readBytes(p));
			o.onProgress?.(++done, wanted.length);
		}
	};
	await Promise.all(Array.from({ length: Math.min(8, wanted.length) }, worker));
}

/** Loads one base file that the warm-up skipped (a media file), so that ReadFile can open it. */
export async function ensureFile(path: string): Promise<boolean> {
	const key = fileKey(path);
	if (st.overlay.has(key) || st.cache.has(key)) return true;
	if (!st.vfs || !st.baseFiles.has(key)) return false;
	st.cache.set(key, await st.vfs.readBytes(st.baseFiles.get(key)!));
	return true;
}

/** The current contents of a file, or null. Synchronous; see ensureFile for media files. */
export function readFileBytes(path: string): Uint8Array | null {
	const key = fileKey(path);
	const o = st.overlay.get(key);
	if (o) return o.dir ? null : o.data;
	return st.cache.get(key) ?? null;
}

/** Creates or replaces a file. */
export function writeFileBytes(path: string, data: Uint8Array): boolean {
	const key = fileKey(path);
	if (key === '' || isDirKey(key)) return false;
	const dir = key.includes('/') ? key.slice(0, key.lastIndexOf('/')) : '';
	// WriteFile fails when the directory does not exist. Outside the mod (core\mods.inf) every directory is taken to exist.
	if (dir !== '' && !key.startsWith('@') && !isDirKey(dir)) return false;
	const rel = relName(path, key);
	const f: StoredFile = { name: st.overlay.get(key)?.name ?? st.baseFiles.get(key) ?? rel, data };
	st.overlay.set(key, f);
	st.persistence?.put(key, f);
	return true;
}

/** Lines of a text file as ReadLine gives them, or null. */
export function readFileLines(path: string): string[] | null {
	const s = ReadFile(path);
	if (s === 0) return null;
	const lines: string[] = [];
	while (!Eof(s)) lines.push(ReadLine(s));
	CloseFile(s);
	return lines;
}

function relName(path: string, key: string): string {
	// keep the case the game wrote; fall back to the key
	const p = path.replaceAll('\\', '/').replace(/^\.?\/+/, '');
	return p.toLowerCase().endsWith(key.replace(/^@root\//, '')) ? p.slice(p.length - key.replace(/^@root\//, '').length) : key;
}

function isDirKey(key: string): boolean {
	if (key === '' || key === '@root') return true;
	const o = st.overlay.get(key);
	if (o) return !!o.dir;
	if (st.baseDirs.has(key)) return true;
	// a directory exists as soon as something lives in it
	const prefix = key + '/';
	for (const [k, f] of st.overlay) if (k.startsWith(prefix) && (f.data !== null || f.dir)) return true;
	return false;
}

function isFileKey(key: string): boolean {
	const o = st.overlay.get(key);
	if (o) return !o.dir && o.data !== null;
	return st.baseFiles.has(key);
}

// ---------------------------------------------------------------- file system commands

/** FileType(path): 1 file, 2 directory, 0 nothing. */
export function FileType(path: string): number {
	const key = fileKey(path);
	if (isFileKey(key)) return 1;
	if (isDirKey(key)) return 2;
	return 0;
}

/** FileSize(path): bytes, 0 when the file does not exist (or is a media file that is not loaded). */
export function FileSize(path: string): number {
	return readFileBytes(path)?.length ?? 0;
}

/** CreateDir path */
export function CreateDir(path: string): void {
	const key = fileKey(path);
	if (key === '' || FileType(path) !== 0) return;
	const f: StoredFile = { name: relName(path, key), data: null, dir: true };
	st.overlay.set(key, f);
	st.persistence?.put(key, f);
}

/** DeleteDir path: only an empty directory goes. */
export function DeleteDir(path: string): void {
	const key = fileKey(path);
	if (listDir(key).length) return;
	if (st.overlay.get(key)?.dir) {
		st.overlay.delete(key);
		st.persistence?.delete(key);
	}
}

/** DeleteFile path */
export function DeleteFile(path: string): void {
	const key = fileKey(path);
	if (!isFileKey(key)) return;
	if (st.baseFiles.has(key)) {
		const f: StoredFile = { name: st.baseFiles.get(key)!, data: null };
		st.overlay.set(key, f);
		st.persistence?.put(key, f);
	} else {
		st.overlay.delete(key);
		st.persistence?.delete(key);
	}
}

/** CopyFile from,to. Nothing happens when the source cannot be read. */
export function CopyFile(from: string, to: string): void {
	const data = readFileBytes(from);
	if (data) writeFileBytes(to, data.slice());
}

/** CurrentDir$(): the mod directory, with a trailing backslash as Blitz returns it. */
export function CurrentDir(): string {
	return st.cwd !== '' ? st.cwd : `${ROOT_DIR}mods\\${st.moddir}\\`;
}

/** ChangeDir path: the port always resolves relative paths against the mod directory; only remembered. */
export function ChangeDir(path: string): void {
	st.cwd = path.endsWith('\\') ? path : path + '\\';
}

function listDir(key: string): string[] {
	const names = new Map<string, string>();
	const prefix = key === '' ? '' : key + '/';
	const depth = key === '' ? 0 : key.split('/').length;
	/** k: key of an entry below the directory; real: the same path in its real case (same number of segments), or '' */
	const add = (k: string, real: string) => {
		if (!k.startsWith(prefix)) return;
		const rest = k.slice(prefix.length);
		if (rest === '' || rest.startsWith('@')) return;
		const first = rest.split('/')[0];
		if (names.has(first)) return;
		const ksegs = k.split('/');
		let segs = real.replaceAll('\\', '/').split('/');
		if (ksegs[0] === '@root' && segs.length === ksegs.length - 1) segs = ['@root', ...segs];
		names.set(first, segs.length === ksegs.length ? segs[depth] : first);
	};
	for (const [k, real] of st.baseFiles) {
		const o = st.overlay.get(k);
		if (o && o.data === null && !o.dir) continue; // deleted
		add(k, real);
	}
	for (const [k, f] of st.overlay) {
		if (f.data === null && !f.dir) continue;
		add(k, f.name);
	}
	return [...names.values()].sort(ntfsOrder);
}

class Dir {
	pos = 0;
	constructor(readonly names: string[]) {}
}
export type DirHandle = Dir | 0;

/** ReadDir(path): 0 when it is not a directory. NextFile then yields ".", "..", and every file and directory name. */
export function ReadDir(path: string): DirHandle {
	const key = fileKey(path);
	if (!isDirKey(key)) return 0;
	return new Dir(['.', '..', ...listDir(key)]);
}

/** NextFile$(dir): "" at the end. */
export function NextFile(dir: DirHandle): string {
	if (dir === 0) return '';
	return dir.pos < dir.names.length ? dir.names[dir.pos++] : '';
}

/** CloseDir dir */
export function CloseDir(_dir: DirHandle): void {}

/** Every entry of a directory without "." and ".." (ui host.readDir wants them with). */
export function dirEntries(path: string): string[] {
	const key = fileKey(path);
	return isDirKey(key) ? listDir(key) : [];
}

// ---------------------------------------------------------------- streams

/** A file opened with ReadFile / WriteFile / OpenFile. */
export class FileStream {
	pos = 0;
	size: number;
	buf: Uint8Array;
	closed = false;
	/** bbStream::eof state: set when a read ran past the end */
	failed = false;

	constructor(
		readonly path: string,
		data: Uint8Array,
		readonly canRead: boolean,
		readonly canWrite: boolean
	) {
		this.buf = canWrite ? data.slice() : data;
		this.size = data.length;
	}

	read(n: number): Uint8Array {
		const avail = Math.max(0, Math.min(n, this.size - this.pos));
		const out = new Uint8Array(n);
		if (this.canRead) out.set(this.buf.subarray(this.pos, this.pos + avail));
		if (avail < n) this.failed = true;
		this.pos += avail;
		return out;
	}

	write(bytes: Uint8Array): void {
		if (!this.canWrite) return;
		const end = this.pos + bytes.length;
		if (end > this.buf.length) {
			const nb = new Uint8Array(Math.max(end, this.buf.length * 2, 256));
			nb.set(this.buf.subarray(0, this.size));
			this.buf = nb;
		}
		this.buf.set(bytes, this.pos);
		this.pos = end;
		if (end > this.size) this.size = end;
	}
}
/** A Blitz stream handle: 0 = could not be opened. */
export type Stream = FileStream | 0;

/** ReadFile(path): 0 when the file does not exist. */
export function ReadFile(path: string): Stream {
	const data = readFileBytes(path);
	if (data === null) return 0;
	return new FileStream(path, data, true, false);
}

/** WriteFile(path): creates or truncates. 0 when the directory does not exist. */
export function WriteFile(path: string): Stream {
	if (!writeFileBytes(path, new Uint8Array(0))) return 0;
	return new FileStream(path, new Uint8Array(0), false, true);
}

/** OpenFile(path): read and write an existing file. 0 when it does not exist. */
export function OpenFile(path: string): Stream {
	const data = readFileBytes(path);
	if (data === null) return 0;
	return new FileStream(path, data, true, true);
}

/** CloseFile stream: a written file is stored (and persisted) here. */
export function CloseFile(s: Stream): void {
	if (s === 0 || s.closed) return;
	s.closed = true;
	if (s.canWrite) writeFileBytes(s.path, s.buf.slice(0, s.size));
}

/** Eof(stream): 1 at the end, -1 after a failed read (bbStream::eof), 0 otherwise. */
export function Eof(s: Stream): number {
	if (s === 0) return 1;
	if (s.failed) return -1;
	return s.pos >= s.size ? 1 : 0;
}

export function FilePos(s: Stream): number {
	return s === 0 ? 0 : s.pos;
}

export function SeekFile(s: Stream, pos: number): number {
	if (s === 0) return 0;
	s.pos = Math.max(0, Math.min(pos, s.size));
	return s.pos;
}

const dv = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);
const need = (s: Stream): FileStream => {
	if (s === 0) throw new Error('Stream does not exist');
	return s;
};

export function ReadByte(s: Stream): number {
	return need(s).read(1)[0];
}
export function ReadShort(s: Stream): number {
	return dv(need(s).read(2)).getUint16(0, true);
}
export function ReadInt(s: Stream): number {
	return dv(need(s).read(4)).getInt32(0, true);
}
export function ReadFloat(s: Stream): number {
	return dv(need(s).read(4)).getFloat32(0, true);
}
/** ReadString$(stream): Int length, then the bytes. */
export function ReadString(s: Stream): string {
	const f = need(s);
	const len = ReadInt(f);
	if (len <= 0 || len > f.size - f.pos) return '';
	return bytesToString(f.read(len));
}
/**
 * ReadLine$(stream): bytes up to LF; CR is dropped. Stops at the end of the
 * file. Reads byte by byte like bbReadLine, so it works on binary files too.
 */
export function ReadLine(s: Stream): string {
	const f = need(s);
	let out = '';
	while (f.pos < f.size) {
		const c = f.buf[f.pos++];
		if (c === 10) return out;
		if (c !== 13) out += String.fromCharCode(c);
	}
	return out;
}
/** ReadBytes(bank-like, stream, offset, count): returns the bytes read. */
export function ReadBytes(target: Uint8Array, s: Stream, offset: number, count: number): number {
	const f = need(s);
	const n = Math.max(0, Math.min(count, f.size - f.pos, target.length - offset));
	target.set(f.read(n), offset);
	return n;
}

export function WriteByte(s: Stream, v: number): void {
	need(s).write(Uint8Array.of(v & 255));
}
export function WriteShort(s: Stream, v: number): void {
	const b = new Uint8Array(2);
	dv(b).setUint16(0, v & 0xffff, true);
	need(s).write(b);
}
export function WriteInt(s: Stream, v: number): void {
	const b = new Uint8Array(4);
	dv(b).setInt32(0, v | 0, true);
	need(s).write(b);
}
export function WriteFloat(s: Stream, v: number): void {
	const b = new Uint8Array(4);
	dv(b).setFloat32(0, f32(v), true);
	need(s).write(b);
}
/** WriteString stream,txt$: Int length, then the bytes. */
export function WriteString(s: Stream, txt: string): void {
	WriteInt(s, txt.length);
	need(s).write(stringToBytes(txt));
}
/**
 * WriteLine stream,txt$: the bytes and CR LF. Numbers are converted by the
 * caller the way Blitz does it (Str): `WriteLine(stream, Str(set_scrx_c))`.
 */
export function WriteLine(s: Stream, txt: string): void {
	const f = need(s);
	f.write(stringToBytes(txt));
	f.write(Uint8Array.of(13, 10));
}
export function WriteBytes(source: Uint8Array, s: Stream, offset: number, count: number): number {
	const n = Math.max(0, Math.min(count, source.length - offset));
	need(s).write(source.subarray(offset, offset + n));
	return n;
}

export function bytesToString(b: Uint8Array): string {
	let out = '';
	for (let i = 0; i < b.length; i += 8192) out += String.fromCharCode(...b.subarray(i, i + 8192));
	return out;
}
export function stringToBytes(s: string): Uint8Array {
	const b = new Uint8Array(s.length);
	for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 255;
	return b;
}

// ---------------------------------------------------------------- views for the other layers

/** A Vfs over base + overlay, for layers that take a Vfs (definition loaders after the editor wrote files). */
export function overlayVfs(): Vfs {
	const base = st.vfs;
	if (!base) throw new Error('files.ts: warmUp() has not run');
	return {
		exists: (path) => FileType(path) === 1,
		list: (dir) => dirEntries(dir).filter((n) => FileType(`${dir}\\${n}`) === 1),
		readBytes: async (path) => {
			const d = readFileBytes(path);
			if (d) return d;
			return base.readBytes(path);
		},
		url: (path) => {
			const o = st.overlay.get(fileKey(path));
			if (o?.data && typeof URL !== 'undefined' && typeof Blob !== 'undefined') return URL.createObjectURL(new Blob([o.data as BlobPart]));
			return base.url(path);
		}
	};
}

/** Names and sizes of the overlay (the files the player owns): for an export / "download my saves" UI. */
export function overlayFiles(): { name: string; size: number }[] {
	return [...st.overlay.values()].filter((f) => f.data !== null).map((f) => ({ name: f.name, size: f.data!.length }));
}

// ---------------------------------------------------------------- IndexedDB

/** The browser persistence: one object store, key = fileKey. Writes are fire-and-forget. */
export function indexedDbPersistence(dbName = 'stranded2-files'): Persistence {
	const open = (): Promise<IDBDatabase> =>
		new Promise((resolve, reject) => {
			const req = indexedDB.open(dbName, 1);
			req.onupgradeneeded = () => req.result.createObjectStore('files');
			req.onsuccess = () => resolve(req.result);
			req.onerror = () => reject(req.error);
		});
	let db: Promise<IDBDatabase> | null = null;
	const store = async (mode: IDBTransactionMode) => (await (db ??= open())).transaction('files', mode).objectStore('files');
	return {
		async load() {
			const out = new Map<string, StoredFile>();
			try {
				const s = await store('readonly');
				await new Promise<void>((resolve, reject) => {
					const req = s.openCursor();
					req.onsuccess = () => {
						const c = req.result;
						if (!c) return resolve();
						out.set(String(c.key), c.value as StoredFile);
						c.continue();
					};
					req.onerror = () => reject(req.error);
				});
			} catch (e) {
				console.warn('files.ts: the saved files could not be read (private mode?)', e);
			}
			return out;
		},
		put(key, file) {
			void store('readwrite').then(
				(s) => s.put(file, key),
				() => {}
			);
		},
		delete(key) {
			void store('readwrite').then(
				(s) => s.delete(key),
				() => {}
			);
		}
	};
}
