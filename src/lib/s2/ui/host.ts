/**
 * Everything the interface code calls that lives in other parts of the game
 * (sound, console, script variables, definitions, files, maps). The GUI
 * modules call `host.*`; the integrator replaces the defaults with
 * `setHost({...})`. Defaults are inert so the GUI runs stand-alone.
 */
import type { ImageHandle } from '../gfx2d';
import { fromGameString, toGameString } from './bb';

/** Type Tsg: an entry of the map/savegame list built by load_maps. */
export interface Tsg {
	name: string;
}
/** Type Tsc: script command reference entry (core\scriptcommands.inf). */
export interface Tsc {
	cmd: string;
	groups: string;
	params: string;
}
/** Type Tsgr: script command group. */
export interface Tsgr {
	group: string;
}
/** Type Tdefvar: variable definition of an object/unit/item type. */
export interface Tdefvar {
	class: number;
	typ: number;
	key: string;
	descr: string;
	defaultval: string;
	isglobal: number;
}
/** Type Tgroup: editor group of a class. */
export interface Tgroup {
	class: number;
	group: string;
	name: string;
	count: number;
}

export interface GuiHost {
	// ---- sound: `sound` is the name of the original global, e.g. "sfx_click"
	play(sound: string): void;

	// ---- console / debug / frame pacing
	con_add(txt: string, col?: number): void;
	con_open(): void;
	con_close(): void;
	/** console(): draw and handle the drop-down console. */
	console(): void;
	/** debug(): debug overlay drawn by endinput. */
	debug(): void;
	/** calcfpsfactor(); undefined = use the port in input.ts. */
	calcfpsfactor?: () => void;
	/** if_drop(): drag and drop release handler of the inventory. */
	if_drop(): void;
	/** p_rectscreen(): repaint after a blocking screen. */
	p_rectscreen(): void;
	/**
	 * Wait for the next display frame. Modal GUI loops ("Repeat ... Flip ...
	 * Forever") await this after every Flip, which is where the original
	 * blocked on vertical sync.
	 */
	frame(): Promise<void>;

	// ---- script engine
	/** var_rep$(txt): replace $variables in a line of text. */
	var_rep(txt: string): string;
	/** Value of local variable `key` of entity (class,id): Tx with mode=4. */
	var_local_get(cls: number, id: number, key: string): string | undefined;
	/** Value of global variable `key`: Tx with mode=1. */
	var_global_get(key: string): string | undefined;
	var_local_delete(cls: number, id: number, key: string): void;
	var_global_delete(key: string): void;
	var_set_local(cls: number, id: number, key: string, value: number): void;
	var_set(key: string, value: number): void;
	Tdefvar: Tdefvar[];
	Tsc: Tsc[];
	Tsgr: Tsgr[];
	/**
	 * The "Update" button of the command window (dev mode only): downloads
	 * the command list from stranded.unrealsoftware.de, rewrites
	 * core\scriptcommands.inf and calls editor_ini_sc().
	 */
	update_scriptcommands(): Promise<void>;

	// ---- definitions
	Dobject_iconh(typ: number): ImageHandle;
	Dunit_iconh(typ: number): ImageHandle;
	Ditem_iconh(typ: number): ImageHandle;
	Dstate_frame(typ: number): number;
	Tgroup: Tgroup[];

	// ---- clipboard (functions.bb copy / paste$), game byte strings
	copy(txt: string): void;
	paste(): string;

	// ---- files
	/** FileType(path): 0 missing, 1 file, 2 directory. */
	fileType(path: string): number;
	/** ReadDir/NextFile: every entry name in the directory, files and directories. */
	readDir(path: string): string[];
	/** Lines of a text file (ReadLine until Eof), or null if it cannot be opened. */
	readLines(path: string): Promise<string[] | null>;
	/** WriteFile + WriteLine per entry; false if the file cannot be written. */
	writeLines(path: string, lines: string[]): Promise<boolean>;

	// ---- maps (gui_win_map)
	Tsg: Tsg[];
	/** load_maps(mode,mp): fills Tsg. */
	load_maps(mode: number, mp: number): void | Promise<void>;
	/** load_map_header(path): sets map_image, sg_date, sg_time. */
	load_map_header(path: string): void | Promise<void>;
	map_image: ImageHandle;
	sg_date: string;
	sg_time: string;
}

// ---------------------------------------------------------------- clipboard default

let clipboardMirror = '';
let clipboardHooked = false;

function refreshClipboard(): void {
	if (typeof navigator === 'undefined' || !navigator.clipboard?.readText) return;
	navigator.clipboard.readText().then(
		(t) => {
			clipboardMirror = toGameString(t);
		},
		() => {}
	);
}

/**
 * paste$() must answer synchronously, the browser clipboard cannot. The
 * default keeps a mirror that is refreshed whenever Ctrl goes down or the
 * page receives a paste event, i.e. before the game sees Ctrl+V.
 */
function hookClipboard(): void {
	if (clipboardHooked || typeof window === 'undefined') return;
	clipboardHooked = true;
	window.addEventListener('keydown', (e) => {
		if (e.key === 'Control' && !e.repeat) refreshClipboard();
	});
	window.addEventListener('paste', (e) => {
		const t = e.clipboardData?.getData('text/plain');
		if (t !== undefined) clipboardMirror = toGameString(t);
	});
}

// ---------------------------------------------------------------- defaults

const nextFrame = (): Promise<void> =>
	new Promise((resolve) => {
		if (typeof requestAnimationFrame !== 'undefined') requestAnimationFrame(() => resolve());
		else setTimeout(resolve, 16);
	});

export const host: GuiHost = {
	play() {},
	con_add() {},
	con_open() {},
	con_close() {},
	console() {},
	debug() {},
	if_drop() {},
	p_rectscreen() {},
	frame: nextFrame,

	var_rep: (txt) => txt,
	var_local_get: () => undefined,
	var_global_get: () => undefined,
	var_local_delete() {},
	var_global_delete() {},
	var_set_local() {},
	var_set() {},
	Tdefvar: [],
	Tsc: [],
	Tsgr: [],
	async update_scriptcommands() {},

	Dobject_iconh: () => 0,
	Dunit_iconh: () => 0,
	Ditem_iconh: () => 0,
	Dstate_frame: () => 0,
	Tgroup: [],

	copy(txt) {
		// If txt$="" Then Return
		if (txt === '') return;
		clipboardMirror = txt;
		if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
			navigator.clipboard.writeText(fromGameString(txt)).catch(() => {});
		}
	},
	paste() {
		hookClipboard();
		return clipboardMirror;
	},

	fileType: () => 0,
	readDir: () => [],
	readLines: async () => null,
	writeLines: async () => false,

	Tsg: [],
	load_maps() {},
	load_map_header() {},
	map_image: 0,
	sg_date: '',
	sg_time: ''
};

/** Replace parts of the host. Call once the owning subsystems exist. */
export function setHost(part: Partial<GuiHost>): void {
	Object.assign(host, part);
	hookClipboard();
}

/**
 * File-system view for the file window built from a flat list of file paths
 * (e.g. the keys of static/game/manifest.json): gives FileType and ReadDir
 * with directories, which the read-only Vfs interface does not expose.
 * Paths use backslashes and are case-insensitive, relative to the mod folder.
 */
export function makeFileHost(allFiles: string[]): Pick<GuiHost, 'fileType' | 'readDir'> {
	const norm = (p: string) =>
		p
			.replaceAll('\\', '/')
			.replace(/^\.?\/+/, '')
			.replace(/\/+/g, '/')
			.replace(/\/$/, '')
			.toLowerCase();
	const files = new Set<string>();
	/** directory (normalised, '' = root) -> entry names in original case */
	const dirs = new Map<string, Map<string, string>>();
	dirs.set('', new Map());
	for (const f of allFiles) {
		const parts = f.replaceAll('\\', '/').split('/').filter(Boolean);
		files.add(parts.join('/').toLowerCase());
		let dir = '';
		for (const part of parts) {
			let entries = dirs.get(dir);
			if (!entries) dirs.set(dir, (entries = new Map()));
			if (!entries.has(part.toLowerCase())) entries.set(part.toLowerCase(), part);
			dir = dir ? `${dir}/${part.toLowerCase()}` : part.toLowerCase();
		}
		// every prefix except the file itself is a directory
		let d = '';
		for (let i = 0; i < parts.length - 1; i++) {
			d = d ? `${d}/${parts[i].toLowerCase()}` : parts[i].toLowerCase();
			if (!dirs.has(d)) dirs.set(d, new Map());
		}
	}
	return {
		fileType(path) {
			const p = norm(path);
			if (files.has(p)) return 1;
			if (dirs.has(p) && !files.has(p)) return 2;
			return 0;
		},
		readDir(path) {
			const entries = dirs.get(norm(path));
			if (!entries) return [];
			// Windows lists "." and ".." first; the file window drops them (names of 2 or fewer characters).
			return ['.', '..', ...[...entries.values()].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))];
		}
	};
}
