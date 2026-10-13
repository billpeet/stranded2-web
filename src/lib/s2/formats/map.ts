import { atoi, strinv } from '../blitz';
import { BinaryReader } from '../io/BinaryReader';

/**
 * Parser for Stranded II map (.s2) and savegame (.sav) files.
 * Ported from load_map() in includes/e_load_map.bb. This is the pure
 * file-format half: it produces data and performs no engine side effects.
 */

export interface MapObject {
	id: number;
	typ: number;
	x: number;
	z: number;
	yaw: number;
	health: number;
	healthMax: number;
	daytimer: number;
}

export interface MapUnit {
	id: number;
	typ: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	health: number;
	healthMax: number;
	hunger: number;
	thirst: number;
	exhaustion: number;
	aiCx: number;
	aiCz: number;
}

export interface MapItem {
	id: number;
	typ: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	health: number;
	count: number;
	parentClass: number;
	parentMode: number;
	parentId: number;
}

export interface MapInfo {
	id: number;
	typ: number;
	x: number;
	y: number;
	z: number;
	pitch: number;
	yaw: number;
	vars: string;
}

export interface MapState {
	typ: number;
	parentClass: number;
	parentId: number;
	x: number;
	y: number;
	z: number;
	fx: number;
	fy: number;
	fz: number;
	value: number;
	valueF: number;
	valueS: string;
}

/** "Tx" record: script variables, scripts, build locks, timers and other extensions. */
export interface MapExtension {
	typ: number;
	parentClass: number;
	parentId: number;
	mode: number;
	key: string;
	value: string;
	stuff: string;
}

export interface MapAttachment {
	path: string;
	data: Uint8Array;
}

export interface MapHeader {
	headerLine: string;
	version: string;
	date: string;
	time: string;
	format: string;
	/** "map" or "sav" */
	mode: string;
	/** 1 when the corresponding type id is stored as a 16-bit value instead of 8-bit. */
	typeFormat: { object: number; unit: number; item: number };
	/** 96x72 preview, RGB, stored column-major: index = (x*72 + y)*3 */
	image: Uint8Array;
	passwordKey: number;
	passwordCoded: string;
	day: number;
	hour: number;
	minute: number;
	freezeTime: number;
	skybox: string;
	multiplayer: number;
	climate: number;
	music: string;
	briefing: string;
	fog: [number, number, number, number];
	extended: number;
}

export interface MapData extends MapHeader {
	quickslots: string[];
	/** Colormap edge length in pixels. */
	colormapSize: number;
	/** RGB, column-major: index = (x*colormapSize + y)*3, where y runs along world Z. */
	colormap: Uint8Array;
	/** Terrain grid size in cells; there are (terrainSize+1)^2 height samples. */
	terrainSize: number;
	/** Heights 0..1, column-major: index = x*(terrainSize+1) + z */
	heights: Float32Array;
	/** (colormapSize+1)^2 flags, column-major: index = x*(colormapSize+1) + y */
	grass: Uint8Array;
	objects: MapObject[];
	units: MapUnit[];
	items: MapItem[];
	infos: MapInfo[];
	states: MapState[];
	extensions: MapExtension[];
	/** Savegames only. */
	camera?: { pitch: number; yaw: number };
	/** False when the trailer is missing (the original warns the map may be damaged). */
	complete: boolean;
	attachments: MapAttachment[];
}

export const MAP_IMAGE_W = 96;
export const MAP_IMAGE_H = 72;

export class MapFormatError extends Error {}

function readHeader(r: BinaryReader): MapHeader {
	const headerLine = r.line();
	if (!headerLine.startsWith('### Stranded II')) {
		throw new MapFormatError('Invalid Map! (Invalid Header)');
	}
	const version = r.line();
	const date = r.line();
	const time = r.line();
	const format = r.line();
	const mode = r.line();
	const tf = r.line();
	const typeFormat = { object: 0, unit: 0, item: 0 };
	if (tf !== '') {
		typeFormat.object = blitzInt(tf.substring(0, 1));
		typeFormat.unit = blitzInt(tf.substring(1, 2));
		typeFormat.item = blitzInt(tf.substring(2, 3));
	}
	for (let i = 0; i < 5; i++) r.line();

	const image = r.take(MAP_IMAGE_W * MAP_IMAGE_H * 3).slice();
	const passwordKey = r.byte();
	const passwordCoded = r.line();

	const day = r.int();
	const hour = r.byte();
	const minute = r.byte();
	const freezeTime = r.byte();
	const skybox = r.string();
	const multiplayer = r.byte();
	const climate = r.byte();
	const music = r.string();
	const briefing = r.string();
	const fog: [number, number, number, number] = [r.byte(), r.byte(), r.byte(), r.byte()];
	const extended = r.byte();

	return {
		headerLine,
		version,
		date,
		time,
		format,
		mode,
		typeFormat,
		image,
		passwordKey,
		passwordCoded,
		day,
		hour,
		minute,
		freezeTime,
		skybox,
		multiplayer,
		climate,
		music,
		briefing,
		fog,
		extended
	};
}

/** load_map_header(): everything up to and including the map variables. */
export function parseMapHeader(data: Uint8Array): MapHeader {
	return readHeader(new BinaryReader(data));
}

export function parseMap(data: Uint8Array): MapData {
	const r = new BinaryReader(data);
	const header = readHeader(r);

	if (header.hour < 0 || header.hour > 24) throw new MapFormatError('Error in Map Vars (Hour)!');
	if (header.minute < 0 || header.minute > 60) {
		throw new MapFormatError('Error in Map Vars (Minute)!');
	}

	const quickslots: string[] = [];
	for (let i = 0; i < 10; i++) quickslots.push(r.string());

	const colormapSize = r.int();
	const colormap = r.take(colormapSize * colormapSize * 3).slice();

	let terrainSize = r.int();
	if (terrainSize < 0) terrainSize = 32;
	const n = (terrainSize + 1) * (terrainSize + 1);
	const heights = new Float32Array(n);
	for (let i = 0; i < n; i++) heights[i] = r.float();

	const grass = r.take((colormapSize + 1) * (colormapSize + 1)).slice();

	const objects: MapObject[] = [];
	for (let c = r.int(), i = 0; i < c; i++) {
		objects.push({
			id: r.int(),
			typ: header.typeFormat.object ? r.short() : r.byte(),
			x: r.float(),
			z: r.float(),
			yaw: r.float(),
			health: r.float(),
			healthMax: r.float(),
			daytimer: r.int()
		});
	}

	const units: MapUnit[] = [];
	for (let c = r.int(), i = 0; i < c; i++) {
		units.push({
			id: r.int(),
			typ: header.typeFormat.unit ? r.short() : r.byte(),
			x: r.float(),
			y: r.float(),
			z: r.float(),
			yaw: r.float(),
			health: r.float(),
			healthMax: r.float(),
			hunger: r.float(),
			thirst: r.float(),
			exhaustion: r.float(),
			aiCx: r.float(),
			aiCz: r.float()
		});
	}

	const items: MapItem[] = [];
	for (let c = r.int(), i = 0; i < c; i++) {
		items.push({
			id: r.int(),
			typ: header.typeFormat.item ? r.short() : r.byte(),
			x: r.float(),
			y: r.float(),
			z: r.float(),
			yaw: r.float(),
			health: r.float(),
			count: r.int(),
			parentClass: r.byte(),
			parentMode: r.byte(),
			parentId: r.int()
		});
	}

	const infos: MapInfo[] = [];
	for (let c = r.int(), i = 0; i < c; i++) {
		infos.push({
			id: r.int(),
			typ: r.byte(),
			x: r.float(),
			y: r.float(),
			z: r.float(),
			pitch: r.float(),
			yaw: r.float(),
			vars: r.string()
		});
	}

	const states: MapState[] = [];
	for (let c = r.int(), i = 0; i < c; i++) {
		states.push({
			typ: r.byte(),
			parentClass: r.byte(),
			parentId: r.int(),
			x: r.float(),
			y: r.float(),
			z: r.float(),
			fx: r.float(),
			fy: r.float(),
			fz: r.float(),
			value: r.int(),
			valueF: r.float(),
			valueS: r.string()
		});
	}

	const extensions: MapExtension[] = [];
	for (let c = r.int(), i = 0; i < c; i++) {
		extensions.push({
			typ: r.byte(),
			parentClass: r.byte(),
			parentId: r.int(),
			mode: r.int(),
			key: r.string(),
			value: r.string(),
			stuff: r.string()
		});
	}

	let camera: MapData['camera'];
	if (header.mode === 'sav') camera = { pitch: r.float(), yaw: r.float() };

	r.line();
	r.line();
	const complete = r.line() === 'www.unrealsoftware.de';

	const attachments: MapAttachment[] = [];
	if (complete && header.mode === 'map') {
		while (!r.eof()) {
			const path = strinv(r.line());
			const size = r.int();
			const raw = r.take(size);
			const out = new Uint8Array(raw.length);
			for (let i = 0; i < raw.length; i++) out[i] = 255 - raw[i];
			attachments.push({ path, data: out });
		}
	}

	return {
		...header,
		quickslots,
		colormapSize,
		colormap,
		terrainSize,
		heights,
		grass,
		objects,
		units,
		items,
		infos,
		states,
		extensions,
		camera,
		complete,
		attachments
	};
}

/** Blitz Int(string) and strinv$() of functions.bb: the shared implementations of blitz.ts, kept under the names this module exported. */
const blitzInt = atoi;
export { blitzInt, strinv };
