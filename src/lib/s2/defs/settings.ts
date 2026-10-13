import { Float, Int } from '../blitz';
import { BinaryReader } from '../io/BinaryReader';
import type { Vfs } from '../io/Vfs';
import { ftoa } from './_helpers';

/**
 * User settings (sys/controls.cfg, sys/scriptcontrols.cfg, sys/settings.cfg).
 * Ported from load_settings() and save_settings() in
 * includes/load_settings.bb. Field names are the original globals.
 */

export interface Settings {
	/** in_keys(0..20): key codes for the Ckey_* actions */
	in_keys: number[];
	set_msens: number;
	set_minvert: number;
	set_msmooth: number;
	/** game_scriptkey(0..20): key codes for the script keys of game.inf */
	game_scriptkey: number[];
	set_scrx: number;
	set_scry: number;
	set_scrbit: number;
	/** The values as stored in the file; the originals above may be overridden at run time. */
	set_scrx_c: number;
	set_scry_c: number;
	set_scrbit_c: number;
	set_viewrange: number;
	set_terrain: number;
	set_water: number;
	set_sky: number;
	set_effects: number;
	set_musicvolume: number;
	set_fxvolume: number;
	set_grass: number;
	set_2dfx: number;
	set_lightfx: number;
	set_windsway: number;
	set_name: string;
	set_serverport: number;
	set_fog: number;
	set_hwmultitex: number;
	set_mb: number;
	set_mb_alpha: number;
	/** View range factor derived from set_viewrange (see set_viewfac_load / set_viewfac_save) */
	set_viewfac: number;
}

/** The set_viewfac# table at the end of load_settings(). */
export function set_viewfac_load(set_viewrange: number): number {
	switch (set_viewrange) {
		case 0:
			return 0.5;
		case 1:
			return 1.0;
		case 2:
			return 1.5;
		case 3:
			return 2.5;
		case 4:
			return 4.0;
		default:
			return 1.5;
	}
}

/**
 * The set_viewfac# table at the end of save_settings(). It differs from the
 * one used when loading for view ranges 3 and 4, so the factor changes when
 * the settings are saved and again on the next start.
 */
export function set_viewfac_save(set_viewrange: number): number {
	switch (set_viewrange) {
		case 0:
			return 0.5;
		case 1:
			return 1.0;
		case 2:
			return 1.5;
		case 3:
			return 2.0;
		case 4:
			return 2.5;
		default:
			return 1.5;
	}
}

/** Blitz stream reads return 0 once the file is exhausted. */
class Stream {
	private r: BinaryReader;

	constructor(data: Uint8Array) {
		this.r = new BinaryReader(data);
	}

	private left(): number {
		return this.r.length - this.r.pos;
	}

	line(): string {
		return this.left() > 0 ? this.r.line() : '';
	}

	byte(): number {
		return this.left() >= 1 ? this.r.byte() : 0;
	}

	short(): number {
		if (this.left() >= 2) return this.r.short();
		this.r.pos = this.r.length;
		return 0;
	}

	float(): number {
		if (this.left() >= 4) return this.r.float();
		this.r.pos = this.r.length;
		return 0;
	}
}

export async function loadSettings(vfs: Vfs): Promise<Settings> {
	const set: Settings = {
		in_keys: new Array<number>(21).fill(0),
		set_msens: 0,
		set_minvert: 0,
		set_msmooth: 0,
		game_scriptkey: new Array<number>(21).fill(0),
		set_scrx: 0,
		set_scry: 0,
		set_scrbit: 0,
		set_scrx_c: 0,
		set_scry_c: 0,
		set_scrbit_c: 0,
		set_viewrange: 0,
		set_terrain: 0,
		set_water: 0,
		set_sky: 0,
		set_effects: 0,
		set_musicvolume: 0,
		set_fxvolume: 0,
		set_grass: 0,
		set_2dfx: 0,
		set_lightfx: 0,
		set_windsway: 0,
		set_name: '',
		set_serverport: 0,
		set_fog: 0,
		set_hwmultitex: 0,
		set_mb: 0,
		set_mb_alpha: 0,
		set_viewfac: 0
	};

	if (!vfs.exists('sys\\controls.cfg')) {
		set.set_msens = Math.fround(0.2);
		set.set_minvert = 1;
		set.set_msmooth = 0;
	} else {
		const stream = new Stream(await vfs.readBytes('sys\\controls.cfg'));
		stream.line();
		for (let i = 0; i <= 20; i++) set.in_keys[i] = stream.short();
		set.set_msens = stream.float();
		set.set_minvert = stream.byte() - 128;
		set.set_msmooth = stream.byte();
	}

	if (vfs.exists('sys\\scriptcontrols.cfg')) {
		const stream = new Stream(await vfs.readBytes('sys\\scriptcontrols.cfg'));
		stream.line();
		for (let i = 0; i <= 20; i++) set.game_scriptkey[i] = stream.short();
	}

	if (!vfs.exists('sys\\settings.cfg')) {
		// The *_c copies and every setting not listed here stay 0.
		set.set_scrx = 800;
		set.set_scry = 600;
		set.set_scrbit = 32;
		set.set_hwmultitex = 1;
		set.set_mb = 1;
		set.set_mb_alpha = Math.fround(0.35);
	} else {
		const stream = new Stream(await vfs.readBytes('sys\\settings.cfg'));
		stream.line();
		set.set_scrx = set.set_scrx_c = Int(stream.line());
		set.set_scry = set.set_scry_c = Int(stream.line());
		set.set_scrbit = set.set_scrbit_c = Int(stream.line());
		set.set_viewrange = Int(stream.line());
		set.set_terrain = Int(stream.line());
		set.set_water = Int(stream.line());
		set.set_sky = Int(stream.line());
		set.set_effects = Int(stream.line());
		set.set_musicvolume = Float(stream.line());
		set.set_fxvolume = Float(stream.line());
		set.set_grass = Int(stream.line());
		set.set_2dfx = Int(stream.line());
		set.set_lightfx = Int(stream.line());
		set.set_windsway = Int(stream.line());
		set.set_name = stream.line();
		set.set_serverport = Int(stream.line());
		set.set_fog = Int(stream.line());
		set.set_hwmultitex = Int(stream.line());
		set.set_mb = Int(stream.line());
		set.set_mb_alpha = Float(stream.line());
	}

	set.set_viewfac = set_viewfac_load(set.set_viewrange);
	// The original then applies set_mb_alpha# (capped at Cpeakblur#) to mb_sprite.
	return set;
}

export interface SavedSettings {
	/** Contents of sys\controls.cfg */
	controls: Uint8Array;
	/** Contents of sys\scriptcontrols.cfg; undefined when game_scriptkeys is 0 and the file is left alone */
	scriptcontrols?: Uint8Array;
	/** Contents of sys\settings.cfg */
	settings: Uint8Array;
}

class Writer {
	private bytes: number[] = [];

	/** WriteLine: text plus CR LF */
	line(text: string): void {
		for (let i = 0; i < text.length; i++) this.bytes.push(text.charCodeAt(i) & 0xff);
		this.bytes.push(13, 10);
	}

	byte(v: number): void {
		this.bytes.push(v & 0xff);
	}

	short(v: number): void {
		this.bytes.push(v & 0xff, (v >> 8) & 0xff);
	}

	float(v: number): void {
		const b = new Uint8Array(4);
		new DataView(b.buffer).setFloat32(0, v, true);
		this.bytes.push(...b);
	}

	done(): Uint8Array {
		return Uint8Array.from(this.bytes);
	}
}

/**
 * The file-writing part of save_settings(): builds the three files and sets
 * set_viewfac from the save-time table. set_name must already have gone
 * through mp_checkname(set_name$,0). The original then also re-applies motion
 * blur, water and grass (e_environment_setup_water, grass_map,
 * grass_heightmap, grass_spread).
 */
export function saveSettings(set: Settings, set_moddir: string, game_scriptkeys: number): SavedSettings {
	const warn = '(Warning: Editing this File may cause Errors)';

	const controls = new Writer();
	controls.line(`### ${set_moddir} Control Settings ${warn}`);
	for (let i = 0; i <= 20; i++) controls.short(set.in_keys[i]);
	controls.float(set.set_msens);
	controls.byte(set.set_minvert + 128);
	controls.byte(set.set_msmooth);

	let scriptcontrols: Writer | undefined;
	if (game_scriptkeys > 0) {
		scriptcontrols = new Writer();
		scriptcontrols.line(`### ${set_moddir} Script Control Settings ${warn}`);
		for (let i = 0; i <= 20; i++) scriptcontrols.short(set.game_scriptkey[i]);
	}

	const settings = new Writer();
	settings.line(`### ${set_moddir} Settings ${warn}`);
	settings.line(String(set.set_scrx_c));
	settings.line(String(set.set_scry_c));
	settings.line(String(set.set_scrbit_c));
	settings.line(String(set.set_viewrange));
	settings.line(String(set.set_terrain));
	settings.line(String(set.set_water));
	settings.line(String(set.set_sky));
	settings.line(String(set.set_effects));
	settings.line(ftoa(set.set_musicvolume));
	settings.line(ftoa(set.set_fxvolume));
	settings.line(String(set.set_grass));
	settings.line(String(set.set_2dfx));
	settings.line(String(set.set_lightfx));
	settings.line(String(set.set_windsway));
	settings.line(set.set_name);
	settings.line(String(set.set_serverport));
	settings.line(String(set.set_fog));
	settings.line(String(set.set_hwmultitex));
	settings.line(String(set.set_mb));
	settings.line(ftoa(set.set_mb_alpha));

	set.set_viewfac = set_viewfac_save(set.set_viewrange);

	return {
		controls: controls.done(),
		scriptcontrols: scriptcontrols?.done(),
		settings: settings.done()
	};
}
