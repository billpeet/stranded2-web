/**
 * Creates and wires the runtime singletons of a game session (RT, rt.ts):
 * file systems, bb3d world, 2D layer, input, audio, script engine,
 * environment. This is the only place that knows how the layers fit
 * together; ported game code uses RT and the facades.
 *
 *   createRuntime(opts)      browser: WebGL renderer, Web Audio, IndexedDB
 *   createTestRuntime(opts)  headless: no renderer, fake audio, files in memory
 *   createEnvironment()      called by load_setup once `cam` exists
 *   disposeRuntime()
 *
 * ## One storage per variable
 *
 * The layers were written before G existed and keep original globals as
 * fields of their objects. `bind` turns those fields into accessors of the G
 * variable of the same name (BOUND lists them), and `share` makes a layer's
 * list array the array behind the Type's list (types.ts LIST_STORES). After
 * that `G.map_hour`, `RT.core.map_hour` and what the environment code reads
 * are one value, and `Tx.list`, `RT.script.tx.items` one list.
 *
 * ## Script commands
 *
 * The script interpreter calls the game through ScriptHost (script/host.ts,
 * about 300 methods). Game modules provide them piecewise: every file
 * game/script_host/*.ts exports `host`, a `Partial<ScriptHost>`; the parts are
 * merged here (import.meta.glob), a method defined twice is an error, and
 * methods nobody provides yet are inert (they return undefined, which the
 * command handlers treat as 0 / ""). So an agent adds its commands by adding
 * a file, without editing a shared one.
 */
import * as THREE from 'three';
import { BlitzAudio, FakeBackend, S2Audio, WebAudioBackend, type ListenerEntity } from '../audio';
import {
	CameraRange,
	EntityBlend,
	EntityColor,
	EntityX,
	EntityY,
	EntityZ,
	Graphics3D,
	PositionEntity,
	RotateEntity,
	TFormVector,
	TFormedX,
	TFormedY,
	TFormedZ,
	World,
	type BBEntity
} from '../bb3d';
import { WorldEnvironment } from '../bb3d/environment';
import { MeshCache } from '../engine/b3dToThree';
import { configureRenderer } from '../engine/blitzSpace';
import { EnvCore, defaultSettings, type EnvEngine, type EnvHooks, type EnvSettings, type EnvSound } from '../engine/environment/envCore';
import { FrameTimer } from '../engine/environment/fps';
import { Terrain } from '../engine/terrain';
import { TextureCache } from '../engine/textures';
import { parseMap } from '../formats/map';
import { Graphics, SceneRendered, attachCanvas, setGraphicsDepth, setSceneGrabber, setVfs } from '../gfx2d';
import { attachInput, resetInput, setInputSize } from '../input';
import type { Vfs } from '../io/Vfs';
import { createScriptEngine, type ScriptEngine } from '../script';
import { createRecordingHost, type ScriptHost } from '../script/host';
import { host as uiHost, makeFileHost, setHost } from '../ui/host';
import { con_add } from './con_add';
import * as consoleMod from './console';
import * as debugMod from './debug';
import * as loadMapMod from './e_load_map';
import * as interfaceMod from './interface';
import * as statesMod from './handle_states';
import * as particlesMod from './particles';
import { Csection_editor, Cstate_fire } from './consts';
import { Dinfo_script, Dinfo_scriptk, Ditem_iconh, Ditem_script, Ditem_scriptk, Dobject_iconh, Dobject_script, Dobject_scriptk, Dstate_frame, Dunit_iconh, Dunit_script, Dunit_scriptk } from './defs_arrays';
import { arrayView } from './defs_store';
import * as files from './files';
import { frame } from './flow';
import { calcfpsfactor } from './load_fps';
import { game_cd } from './game_changeday';
import { RT, clearRuntime, hasRuntime, installRuntime, type Runtime } from './rt';
import { G } from './state';
import { After, CONST_STORE, First, LIST_STORES, Tstate } from './types';

// =====================================================================================
// binding
// =====================================================================================

/** What bind() connected: `<object>.<field>` -> G name. For the guide, the tests and debugging. */
export const BOUND: { object: string; field: string; g: string }[] = [];

type Rec = Record<string, unknown>;

/** Makes `target[field]` an accessor of `G[g]`. G's current value wins. */
function bind(object: string, target: object, fields: readonly string[] | Readonly<Record<string, string>>): void {
	const map: Readonly<Record<string, string>> = Array.isArray(fields) ? Object.fromEntries(fields.map((f) => [f, f])) : (fields as Record<string, string>);
	for (const [field, g] of Object.entries(map)) {
		if (!(field in target)) throw new Error(`runtime: ${object}.${field} does not exist`);
		if (!(g in G)) throw new Error(`runtime: G.${g} does not exist (bound from ${object}.${field})`);
		Object.defineProperty(target, field, {
			get: () => (G as unknown as Rec)[g],
			set: (v) => {
				(G as unknown as Rec)[g] = v;
			},
			enumerable: true,
			configurable: true
		});
		if (!BOUND.some((b) => b.object === object && b.field === field)) BOUND.push({ object, field, g });
	}
}

/** Makes `target[field]` permanently the array `arr`; assigning another array replaces the contents. */
function share<T>(target: object, field: string, arr: T[]): void {
	if (!(field in target)) throw new Error(`runtime: list field ${field} does not exist`);
	Object.defineProperty(target, field, {
		get: () => arr,
		set: (v: T[]) => {
			if (v === arr) return;
			arr.length = 0;
			arr.push(...v);
		},
		enumerable: true,
		configurable: true
	});
}

const TIMER_FIELDS = [
	'looplimit', 'f', 'in_gtmod', 'ms', 'lastms', 'gt',
	'in_t50', 'in_t50go', 'in_t100', 'in_t100go', 'in_t500', 'in_t500go', 'in_t1000', 'in_t1000go',
	'in_t2000', 'in_t2000go', 'in_t3000', 'in_t3000go', 'in_t5000', 'in_t5000go', 'in_t10000', 'in_t10000go',
	'in_gt20', 'in_gt20go', 'in_gt50', 'in_gt50go', 'in_gt100', 'in_gt100go', 'in_gt500', 'in_gt500go',
	'in_gt1000', 'in_gt1000go', 'in_gt5000', 'in_gt5000go'
] as const; // prettier-ignore

const ENVCORE_FIELDS = [
	'Dlightcycle', 'map_day', 'map_hour', 'map_minute', 'map_freezetime', 'map_skybox', 'map_climate', 'map_fog',
	'map_timeupdate', 'map_lday', 'map_lhour', 'map_lminute', 'g_unpaused', 'g_dive', 'g_airtimer', 'in_tgametime',
	'in_waverate', 'in_skyoverride', 'in_tercol', 'set_flarefx', 'game_waverate', 'game_minwavespace', 'env_seascr',
	'env_seasinus', 'env_watersin', 'env_cweather', 'env_weatherchan', 'env_wa', 'env_col', 'env_wcol',
	'set_water_texsize', 'set_water_updaterate', 'set_water_updatet', 'set_water_updatestep'
] as const; // prettier-ignore

const ENVSETTINGS_FIELDS = [
	'set_scrx', 'set_scry', 'set_viewrange', 'set_viewfac', 'set_terrain', 'set_water', 'set_sky', 'set_effects',
	'set_grass', 'set_2dfx', 'set_lightfx', 'set_windsway', 'set_fog', 'set_debug'
] as const; // prettier-ignore

const AUDIO_FIELDS = [
	'set_musicvolume', 'set_fxvolume', 'mfx_chan', 'mfx_file', 'mfx_filename', 'mfx_peakvol', 'mfx_vol', 'mfx_fade',
	'mfx_fadestart', 'mfx_fadeend', 'amb_file', 'amb_chan', 'amb_mode', 'map_music', 'speech_chan'
] as const; // prettier-ignore

const SCRIPT_FIELDS = [
	'set_debug', 'ed_setscript', 'map_briefing', 'map_briefing_key', 'game_script', 'game_scriptk',
	'p_l', 'p_len', 'p_lines', 'p_pl', 'p_p', 'p_gotparam', 'p_com', 'p_bracelevel', 'p_bracemode', 'p_bracetype',
	'p_bracepar', 'p_elseif', 'p_varname', 'p_loopmode', 'p_looprow', 'p_loopcol', 'p_looptype', 'p_loopargs',
	'p_looplevel', 'p_loopi', 'p_parseinprogress', 'p_env_class', 'p_env_id', 'p_env_event', 'p_env_info',
	'p_skipevent', 'p_m_ol', 'p_m_or', 'p_m_base', 'p_m_value', 'p_m_basec', 'p_m_o', 'p_error', 'p_erd', 'p_noerror',
	'p_return', 'p_internal', 'p_internaltxt', 'tmp_skipevent', 'tmp_dumpvars', 'tmp_gclass', 'tmp_gid', 'tmp_constv'
] as const; // prettier-ignore

/** ParseVars field -> G name (pv_x#, pv_buffer$, ...). */
const PV_FIELDS = [
	'x', 'y', 'z', 'buffer', 'attack_damage', 'attack_weapon', 'attack_ammo', 'impact_class', 'impact_id',
	'impact_kill', 'impact_num', 'impact_amount', 'impact_x', 'impact_y', 'impact_z', 'impact_ground', 'ai_eater',
	'state', 'lastbuilding', 'loadmaploaded'
] as const; // prettier-ignore

// =====================================================================================
// script host
// =====================================================================================

/**
 * Merges the `host` export of every game/script_host/*.ts module. Each part
 * is a Partial<ScriptHost>; two parts must not define the same method.
 */
export function assembleScriptHost(): { host: ScriptHost; provided: Map<string, string> } {
	const modules = import.meta.glob<{ host?: Partial<ScriptHost> }>('./script_host/*.ts', { eager: true });
	const impl: Rec = {};
	const provided = new Map<string, string>();
	for (const [path, mod] of Object.entries(modules).sort(([a], [b]) => (a < b ? -1 : 1))) {
		if (!mod.host) continue;
		for (const [name, fn] of Object.entries(mod.host)) {
			if (provided.has(name)) throw new Error(`ScriptHost.${name} is defined in both ${provided.get(name)} and ${path}`);
			provided.set(name, path);
			impl[name] = fn;
		}
	}
	// methods nobody provides: inert, return undefined ("0 / empty / leave p_return$ alone")
	return { host: createRecordingHost(impl as Partial<ScriptHost>, false).host, provided };
}

function wireScript(engine: ScriptEngine): void {
	bind('script', engine, SCRIPT_FIELDS);
	bind('script.pv', engine.pv, Object.fromEntries(PV_FIELDS.map((f) => [f, 'pv_' + f])));
	bind('script.dialogue', engine.dialogue, ['in_dlg', 'in_dlg_page', 'in_msgtitle', 'in_msgtext', 'in_scr_scr']);
	// in_sb*(0..9): the engine keeps one record per button, the original one array per field
	const cols = { active: 'in_sb', icon: 'in_sb_icon', txt: 'in_sb_txt', scr: 'in_sb_scr', handle: 'in_sb_handle' } as const;
	engine.dialogue.buttons.forEach((b, i) => {
		for (const [field, g] of Object.entries(cols)) {
			Object.defineProperty(b, field, {
				get: () => ((G as unknown as Rec)[g] as unknown[])[i],
				set: (v) => {
					((G as unknown as Rec)[g] as unknown[])[i] = v;
				},
				enumerable: true,
				configurable: true
			});
		}
	});
	for (const [field, g] of Object.entries(cols)) BOUND.push({ object: 'script.dialogue.buttons[i]', field, g: g + '(i)' });
	// "action:close" of a dialogue button: m_menu=0
	Object.defineProperty(engine.dialogue, 'm_menu_closed', {
		get: () => false,
		set: (v: boolean) => {
			if (v) G.m_menu = 0;
		},
		enumerable: true,
		configurable: true
	});
	// m_section=Csection_editor
	Object.defineProperty(engine, 'm_section_editor', { get: () => G.m_section === Csection_editor, set: () => {}, enumerable: true, configurable: true });

	// lists
	(engine.tx as unknown as { items: unknown[] }).items = LIST_STORES.Tx;
	share(engine, 'timers', LIST_STORES.Ttimer);
	share(engine, 'tasks', LIST_STORES.Tpt);
	share(engine, 'Tpkill', LIST_STORES.Tpkill);
	share(engine, 'Tdefvar', LIST_STORES.Tdefvar);
	share(engine.dialogue, 'trades', LIST_STORES.Ttrade);
	Object.defineProperty(engine, 'Tconst', { value: CONST_STORE, enumerable: true, configurable: true });

	// definition scripts: D<class>_script$(typ) / _scriptk$(typ), and the id limits
	const E = engine as unknown as { Dscript: Record<number, string[]>; Dscriptk: Record<number, string[]>; Dcount: Record<number, number> };
	E.Dscript[1] = arrayView(Dobject_script);
	E.Dscript[2] = arrayView(Dunit_script);
	E.Dscript[3] = arrayView(Ditem_script);
	E.Dscript[4] = arrayView(Dinfo_script);
	E.Dscriptk[1] = arrayView(Dobject_scriptk);
	E.Dscriptk[2] = arrayView(Dunit_scriptk);
	E.Dscriptk[3] = arrayView(Ditem_scriptk);
	E.Dscriptk[4] = arrayView(Dinfo_scriptk);
	Object.defineProperties(E.Dcount, {
		1: { get: () => G.Cobject_count, set: () => {}, enumerable: true, configurable: true },
		2: { get: () => G.Cunit_count, set: () => {}, enumerable: true, configurable: true },
		3: { get: () => G.Citem_count, set: () => {}, enumerable: true, configurable: true },
		4: { get: () => 100 /* Cinfo_count */, set: () => {}, enumerable: true, configurable: true }
	});
}

// =====================================================================================
// audio
// =====================================================================================

/** A bb3d entity as the audio layer wants it (EmitSound source, CreateListener parent). */
export function audioEntity(h: BBEntity): ListenerEntity {
	const cached = audioEntities.get(h);
	if (cached) return cached;
	let last = { x: 0, y: 0, z: 0 };
	const e: ListenerEntity = {
		// A freed emitter is no longer updated in Blitz (its channels keep playing where they were).
		worldPosition: () => (h.freed ? last : (last = { x: EntityX(h, 1), y: EntityY(h, 1), z: EntityZ(h, 1) })),
		worldForward: () => {
			if (h.freed) return { x: 0, y: 0, z: 1 };
			TFormVector(0, 0, 1, h, null);
			return { x: TFormedX(), y: TFormedY(), z: TFormedZ() };
		},
		worldUp: () => {
			if (h.freed) return { x: 0, y: 1, z: 0 };
			TFormVector(0, 1, 0, h, null);
			return { x: TFormedX(), y: TFormedY(), z: TFormedZ() };
		},
		audible: () => !h.freed
	};
	audioEntities.set(h, e);
	return e;
}
const audioEntities = new WeakMap<BBEntity, ListenerEntity>();

const ORIGIN: ListenerEntity = {
	worldPosition: () => ({ x: 0, y: 0, z: 0 }),
	worldForward: () => ({ x: 0, y: 0, z: 1 }),
	worldUp: () => ({ x: 0, y: 1, z: 0 })
};
/** `cam` for the audio layer: follows G.cam, the origin while there is no camera. */
const camEntity: ListenerEntity = {
	worldPosition: () => (G.cam && !G.cam.freed ? audioEntity(G.cam) : ORIGIN).worldPosition(),
	worldForward: () => (G.cam && !G.cam.freed ? audioEntity(G.cam) : ORIGIN).worldForward(),
	worldUp: () => (G.cam && !G.cam.freed ? audioEntity(G.cam) : ORIGIN).worldUp()
};

function wireAudio(audio: S2Audio): void {
	bind('audio', audio, AUDIO_FIELDS);
	// every sfx_* sound global of load_media.bb
	bind(
		'audio',
		audio,
		Object.keys(audio).filter((k) => k.startsWith('sfx_') && k in G)
	);
	share(audio, 'Tres', LIST_STORES.Tres);
	share(audio, 'Tsoundset', LIST_STORES.Tsoundset);
	share(audio, 'Tsfx', LIST_STORES.Tsfx);
	share(audio, 'Tspeech', LIST_STORES.Tspeech);
}

// =====================================================================================
// environment
// =====================================================================================

function envSoundHandle(name: EnvSound): number {
	const m = /^(.*?)(\d)$/.exec(name);
	const g = G as unknown as Rec;
	if (m && Array.isArray(g['sfx_' + m[1]])) return (g['sfx_' + m[1]] as number[])[Number(m[2])];
	return (g['sfx_' + name] as number) ?? 0;
}

/** The environment's callbacks into the game (EnvHooks). Calls that reach a module that is not ported yet do nothing. */
export function envHooks(): EnvHooks {
	return {
		game_cd: () => {
			game_cd();
		},
		p_add: (p) => {
			particlesMod.p_add(p.x, p.y, p.z, p.typ, p.size, p.a);
			// EntityColor / EntityBlend TCp\h: the statements that follow p_add in e_environment.bb
			if (p.color) EntityColor(G.TCp!.h, p.color[0], p.color[1], p.color[2]);
			if (p.blend !== undefined) EntityBlend(G.TCp!.h, p.blend);
		},
		sfx: (sound, volume = 1) => RT.audio.sfx(envSoundHandle(sound), volume),
		sfx_emit: (sound) => RT.audio.sfx_emit(envSoundHandle(sound), camEntity),
		ChannelPlaying: (chan) => !!RT.audio.bb.ChannelPlaying(chan as number),
		StopChannel: (chan) => RT.audio.bb.StopChannel(chan as number),
		free_fire_states: () => {
			// For Tstate.Tstate=Each Tstate : If Tstate	yp=Cstate_fire Then free_state(...) : Next  (e_environment.bb:984)
			for (let s = First(Tstate); s !== null; s = After(Tstate, s)) {
				if (s.typ === Cstate_fire) statesMod.free_state(Cstate_fire, s.parent_class, s.parent_id);
			}
		},
		con_add: (text) => con_add(text)
	};
}


/** An EnvEngine that draws nothing, for the headless runtime. */
function nullEnvEngine(): EnvEngine {
	return new Proxy({} as EnvEngine, {
		get(_t, key) {
			if (key === 'cameraProject') return () => [0, 0];
			if (key === 'waveTerrain') return () => undefined;
			if (key === 'camX') return () => (G.cam ? EntityX(G.cam) : 0);
			if (key === 'camY') return () => (G.cam ? EntityY(G.cam) : 0);
			if (key === 'camZ') return () => (G.cam ? EntityZ(G.cam) : 0);
			if (key === 'positionCam') return (x: number, y: number, z: number) => G.cam && PositionEntity(G.cam, x, y, z);
			return () => 0;
		}
	});
}

function wireCore(core: EnvCore): void {
	bind('core', core, ENVCORE_FIELDS);
	Object.defineProperty(core, 'editor', { get: () => G.m_section === Csection_editor, set: () => {}, enumerable: true, configurable: true });
	share(core, 'lensf', LIST_STORES.Tlensf);
	share(core, 'waves', LIST_STORES.Twave);
}

function boundSettings(): EnvSettings {
	const s = defaultSettings();
	bind('env.settings', s, ENVSETTINGS_FIELDS);
	return s;
}

function boundTimer(): FrameTimer {
	const t = new FrameTimer();
	bind('timer', t, TIMER_FIELDS);
	return t;
}

/**
 * grass_mapsize and Dim grass_rgb(size,size,3): the layer keeps them in its grass object
 * (a flat Uint8Array). G.grass_mapsize / G.grass_rgb(x)(y)(c) become views of it, so that the
 * editor's grass map functions (editor_functions.bb) read and paint what the layer spreads.
 */
function bindGrass(env: WorldEnvironment): void {
	const grass = env.grass as unknown as { grass_mapsize: number; grass_rgb: Uint8Array };
	const cell = (x: number, y: number): number[] =>
		new Proxy([] as number[], {
			get: (_t, c) => {
				if (c === 'length') return 4;
				const m = grass.grass_mapsize + 1;
				return typeof c === 'string' && /^\d+$/.test(c) ? (grass.grass_rgb[(x * m + y) * 4 + Number(c)] ?? 0) : undefined;
			},
			set: (_t, c, v) => {
				const m = grass.grass_mapsize + 1;
				if (typeof c === 'string' && /^\d+$/.test(c) && x >= 0 && y >= 0 && x < m && y < m) grass.grass_rgb[(x * m + y) * 4 + Number(c)] = v as number;
				return true;
			}
		});
	const row = (x: number): number[][] =>
		new Proxy([] as number[][], {
			get: (_t, y) => (typeof y === 'string' && /^\d+$/.test(y) ? cell(x, Number(y)) : y === 'length' ? grass.grass_mapsize + 1 : undefined)
		});
	const view = new Proxy([] as number[][][], {
		get: (_t, x) => (typeof x === 'string' && /^\d+$/.test(x) ? row(Number(x)) : x === 'length' ? grass.grass_mapsize + 1 : undefined)
	});
	Object.defineProperty(G, 'grass_mapsize', { get: () => grass.grass_mapsize, set: () => {}, enumerable: true, configurable: true });
	Object.defineProperty(G, 'grass_rgb', { get: () => view, set: () => {}, enumerable: true, configurable: true });
}

/**
 * Creates the environment (the port of e_environment.bb) on the bb3d world.
 * Called by include_load_setup() right after `cam=CreateCamera()` and
 * `env_light=CreateLight(1)`, because the environment needs both. In a
 * headless runtime only RT.core is created.
 */
export function createEnvironment(): void {
	const timer = RT.timer;
	const settings = boundSettings();
	if (RT.headless || !RT.world.renderer) {
		const core = new EnvCore(nullEnvEngine(), settings, envHooks(), timer);
		wireCore(core);
		installRuntime({ core });
		return;
	}
	if (!G.cam) throw new Error('createEnvironment: G.cam must exist (cam=CreateCamera())');
	const env = new WorldEnvironment({
		world: RT.world,
		cam: G.cam,
		env_light: G.env_light ?? undefined,
		vfs: RT.vfs,
		textures: RT.textures,
		meshes: RT.meshes,
		settings,
		hooks: envHooks(),
		timer
	});
	wireCore(env.core);
	// ter, env_sea, env_sea2, env_ground: the environment replaces them when it rebuilds
	bind('env.entities', env.entities, ['ter', 'env_sea', 'env_sea2', 'env_ground']);
	G.env_light = env.env_light;
	bindGrass(env);
	env.setScreenSize(G.set_scrx, G.set_scry);
	installRuntime({ env, core: env.core });
}

// =====================================================================================
// graphics
// =====================================================================================

let renderer: THREE.WebGLRenderer | null = null;

/**
 * Graphics3D width,height,depth,mode for the whole port: the bb3d world, the
 * 2D layer (back and front buffer), the mouse range, the WebGL drawing
 * buffer and the environment's screen size.
 */
export function setGraphics(width: number, height: number, depth = 0, mode = 0): void {
	Graphics3D(width, height, depth, mode);
	Graphics(width, height);
	setGraphicsDepth(depth);
	setInputSize(width, height);
	renderer?.setSize(width, height, false);
	if (hasRuntime('env')) RT.env.setScreenSize(width, height);
}

// =====================================================================================
// creation
// =====================================================================================

export interface RuntimeOptions {
	/** The WebGL canvas (3D scene). */
	canvas3d: HTMLCanvasElement;
	/** The 2D canvas layered over it (Blitz 2D commands). */
	canvas2d: HTMLCanvasElement;
	/** Element that receives mouse and keyboard input. */
	stage: HTMLElement;
	/** Base URL of the synced game data (default "/game"). */
	base?: string;
	/** Progress of the data warm-up, before the game's own load screen can draw. */
	onStatus?: (text: string) => void;
}

let detachInput: (() => void) | null = null;
let unlockAudio: (() => void) | null = null;

function common(vfs: Vfs, allFiles: readonly string[], headless: boolean, world: World, audio: S2Audio): Runtime {
	const timer = boundTimer();
	const textures = new TextureCache(vfs);
	const meshes = new MeshCache(vfs, textures);
	const { host } = assembleScriptHost();
	const script = createScriptEngine(host);
	wireScript(script);
	wireAudio(audio);

	// the interface layer's view of the game (ui/host.ts): files, lists, frame
	const fh = makeFileHost([...allFiles]);
	setHost({
		frame,
		// endinput(): the frame factor with the limiter accounted for (load_fps.ts)
		calcfpsfactor,
		fileType: (p) => files.FileType(p) || fh.fileType(p),
		readDir: (p) => ['.', '..', ...files.dirEntries(p)],
		readLines: async (p) => files.readFileLines(p),
		writeLines: async (p, lines) => {
			const s = files.WriteFile(p);
			if (s === 0) return false;
			for (const l of lines) files.WriteLine(s, l);
			files.CloseFile(s);
			return true;
		},
		Tdefvar: LIST_STORES.Tdefvar,
		var_rep: (txt) => script.var_rep(txt),

		// ---- the game functions the interface layer calls (gui.bb, input.bb, load_bmpf.bb)
		// play(sound): `sound` is the name of the sound global
		play: (sound) => audio.play((G as unknown as Rec)[sound] as number),
		con_add: (txt, col = -1) => consoleMod.con_add(txt, col),
		con_open: () => consoleMod.con_open(),
		con_close: () => consoleMod.con_close(),
		console: () => {
			consoleMod.console();
		},
		debug: () => debugMod.debug(),
		if_drop: () => interfaceMod.if_drop(),
		p_rectscreen: () => particlesMod.p_rectscreen(),
		// gui_win_defvars (gui.bb:1647-1751): For Tx.Tx=Each Tx ... Exit / Delete Tx
		var_local_get: (cls, id, key) => LIST_STORES.Tx.find((tx) => tx.mode === 4 && tx.parent_class === cls && tx.parent_id === id && tx.key === key)?.value,
		var_global_get: (key) => LIST_STORES.Tx.find((tx) => tx.mode === 1 && tx.key === key)?.value,
		var_local_delete: (cls, id, key) => {
			script.tx.remove((tx) => tx.mode === 4 && tx.parent_class === cls && tx.parent_id === id && tx.key === key);
		},
		var_global_delete: (key) => {
			script.tx.remove((tx) => tx.mode === 1 && tx.key === key);
		},
		var_set_local: (cls, id, key, value) => {
			script.var_set_local(cls, id, key, String(value));
		},
		var_set: (key, value) => {
			script.var_set(key, String(value));
		},
		Dobject_iconh: (typ) => Dobject_iconh(typ),
		Dunit_iconh: (typ) => Dunit_iconh(typ),
		Ditem_iconh: (typ) => Ditem_iconh(typ),
		Dstate_frame: (typ) => Dstate_frame(typ),
		load_maps: (mode, mp) => loadMapMod.load_maps(mode, mp),
		load_map_header: (path) => {
			loadMapMod.load_map_header(path);
		}
	});
	// map_image, sg_date$, sg_time$: globals of the game that gui_win_map reads
	for (const g of ['map_image', 'sg_date', 'sg_time'] as const) {
		Object.defineProperty(uiHost, g, { get: () => G[g], set: (v) => ((G as unknown as Rec)[g] = v), enumerable: true, configurable: true });
	}

	// RenderWorld: 3D sound positions, and the 2D back buffer becomes transparent over the new scene
	const renderWorld = world.renderWorld.bind(world);
	world.renderWorld = () => {
		renderWorld();
		audio.bb.renderWorld();
		SceneRendered();
	};
	const updateWorld = world.updateWorld.bind(world);
	world.updateWorld = (elapsed = 1) => {
		updateWorld(elapsed);
		audio.bb.updateWorld(elapsed);
	};

	installRuntime({ vfs, world, audio, script, timer, textures, meshes, headless });
	return RT;
}

/** The browser runtime. Call once; then run main() of main.ts. */
export async function createRuntime(o: RuntimeOptions): Promise<Runtime> {
	const base = o.base ?? '/game';
	o.onStatus?.('Reading the game data index');
	const { HttpVfs } = await import('../io/Vfs');
	const vfs = await HttpVfs.open(base);
	const manifest = (await (await fetch(`${base}/manifest.json`)).json()) as { mod: string; files: Record<string, string> };
	const allFiles = Object.values(manifest.files);

	o.onStatus?.('Reading the data files');
	await files.warmUp({ vfs, allFiles, moddir: manifest.mod, persistence: typeof indexedDB !== 'undefined' ? files.indexedDbPersistence() : null });

	renderer = new THREE.WebGLRenderer({ canvas: o.canvas3d, antialias: true, preserveDrawingBuffer: true });
	configureRenderer(renderer);
	renderer.setPixelRatio(1);
	renderer.setSize(800, 600, false);
	renderer.setClearColor(0x000000);
	const world = new World({ vfs, renderer, width: 800, height: 600, manifestUrl: `${base}/manifest.json` });

	Graphics(800, 600);
	setVfs(vfs);
	attachCanvas(o.canvas2d);
	setSceneGrabber(() => world.grabScene());
	resetInput();
	setInputSize(800, 600);
	detachInput = attachInput(o.stage);

	const backend = new WebAudioBackend();
	unlockAudio = backend.unlockOnGesture();
	// base + overlay, so that resources the game wrote (map attachments) are found as well
	const bb = new BlitzAudio(backend, files.overlayVfs());
	const audio = new S2Audio(bb, {
		cam: camEntity,
		gt: () => G.gt,
		Rand: (lo, hi) => RT.script.Rand(lo, hi),
		con_add,
		set_debug: () => G.set_debug !== 0
	});
	return common(vfs, allFiles, false, world, audio);
}

export interface TestRuntimeOptions {
	/** Mod directory (NodeVfs). Without one the runtime has no files. */
	vfs?: Vfs & { all?: () => string[] };
	/** Load these data files only (default: every non-media file, as in the browser). */
	preload?: (path: string) => boolean;
	/**
	 * Let the audio layer see the sound files (default false: every sound loads as 0, silently).
	 * With true, preload what the test plays: `await RT.audio.bb.preload([...])`.
	 */
	sounds?: boolean;
}

/**
 * The headless runtime for tests: bb3d world without renderer, fake audio
 * backend, files in memory, 800x600 2D buffers, RT.core without drawing.
 * Call disposeRuntime() (afterEach) to start the next test from scratch.
 */
export async function createTestRuntime(o: TestRuntimeOptions = {}): Promise<Runtime> {
	const empty: Vfs = { exists: () => false, list: () => [], readBytes: async (p) => Promise.reject(new Error('File not found: ' + p)), url: (p) => p };
	const vfs = o.vfs ?? empty;
	const allFiles = o.vfs?.all?.() ?? [];
	await files.warmUp({ vfs, allFiles, persistence: null, preload: o.preload });
	renderer = null;
	const world = new World({ vfs, width: 800, height: 600 });
	Graphics(800, 600);
	setVfs(vfs);
	resetInput();
	setInputSize(800, 600);
	// load_res() of the audio layer serves every resource class and asks these files whether a path exists:
	// hide only the sound files (unless asked for), so that every sound loads as 0 without a warning.
	const all = files.overlayVfs();
	const audioFiles: Vfs = o.sounds ? all : { ...all, exists: (p) => !/\.(wav|ogg|mp3)$/i.test(p) && all.exists(p), list: () => [] };
	const bb = new BlitzAudio(new FakeBackend(), audioFiles);
	const audio = new S2Audio(bb, {
		cam: camEntity,
		gt: () => G.gt,
		Rand: (lo, hi) => RT.script.Rand(lo, hi),
		con_add,
		set_debug: () => G.set_debug !== 0
	});
	const rt = common(vfs, allFiles, true, world, audio);
	createEnvironment();
	return rt;
}

/** Ends the session: listeners, WebGL resources, RT. G and the lists are not reset (resetGameState, DeleteEach). */
export function disposeRuntime(): void {
	detachInput?.();
	detachInput = null;
	unlockAudio?.();
	unlockAudio = null;
	attachCanvas(null);
	setSceneGrabber(null);
	if (hasRuntime('env')) RT.env.dispose();
	renderer?.dispose();
	renderer = null;
	BOUND.length = 0;
	clearRuntime();
}
