/**
 * The game's audio layer, ported from the Stranded II source:
 *
 *   sfx.bb         sfx_update, sfx_play, sfx_music, stopsounds, sfx_3d, sfx, sfx_emit
 *   functions.bb   play
 *   ressources.bb  load_res (sound and music types), load_soundset, play_soundset
 *   speech.bb      speech
 *   load_media.bb  every sfx_* global ("SYSTEM SFX" block), same paths and order
 *   load_setup.bb  listener=CreateListener(cam,0.02,1,1)
 *   plus the audio statements of parser_commands.bb (music, stopmusic,
 *   fademusic, musicvolume, ambientsfx), e_load_map.bb, e_clear.bb and
 *   menu.bb (sound settings), as small methods so their callers stay one-liners.
 *
 * Globals of the original are public fields with their original names.
 * Original quirks are kept on purpose and marked "(sic)".
 */
import { floatToInt as bbInt, path as path$ } from '../blitz';
import type { AudioEntity, BlitzAudio, BlitzListener, ChannelHandle, ListenerEntity, SoundHandle } from './BlitzAudio';

/* load_const.bb */
export const Cres_image = 0;
export const Cres_texture = 1;
export const Cres_sound = 2;
export const Cres_mesh = 3;
export const Cres_animmesh = 4;
export const Cres_music = 5;

export const snd_spot = 1;
export const snd_attack = 2;
export const snd_idle1 = 3;
export const snd_idle2 = 4;
export const snd_idle3 = 5;
export const snd_die = 6;
export const snd_flee = 7;
export const snd_move = 8;

/** Console colour used for errors (Cbmpf_red in load_const.bb). */
export const Cbmpf_red = 3;

export interface Tres {
	file: string;
	h: number;
	typ: number;
}

export interface Tsoundset {
	name: string;
	spot: SoundHandle;
	attack: SoundHandle;
	idle1: SoundHandle;
	idle2: SoundHandle;
	idle3: SoundHandle;
	die: SoundHandle;
	flee: SoundHandle;
	move: SoundHandle;
}

export interface Tsfx {
	file: SoundHandle;
	chan: ChannelHandle;
}

export interface Tspeech {
	file: string;
	limit: number;
	lastplayed: number;
}

/** Everything the audio layer reads from the rest of the game. */
export interface S2AudioHost {
	/** The camera entity `cam`: listener parent, speech emitter, EntityY(cam) for the ambient switch. */
	cam: ListenerEntity;
	/** `gt`: game time in milliseconds (MilliSecs() sampled once per frame). */
	gt(): number;
	/** Rand(low, high): integer in low..high inclusive. Defaults to Math.random. */
	Rand?(low: number, high: number): number;
	/** con_add(txt, special). Defaults to console.log. */
	con_add?(txt: string, special?: number): void;
	/** `set_debug` */
	set_debug?(): boolean;
	/** load_res for the resource types that are not sounds (images, textures, meshes). */
	load_other_res?(path: string, typ: number, mode: number): number;
}

/** Blitz Float -> Int conversion and functions.bb path$: the shared implementations of blitz.ts. */
export { bbInt, path$ };

function latin1(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
	return s;
}

export class S2Audio {
	/* load_vars.bb */
	set_musicvolume = 1;
	set_fxvolume = 1;

	mfx_chan: ChannelHandle = 0;
	mfx_file: SoundHandle = 0;
	mfx_filename = '';
	mfx_peakvol = 0;
	mfx_vol = 0;
	/** 0=none, 1=in, -1=out */
	mfx_fade = 0;
	mfx_fadestart = 0;
	mfx_fadeend = 0;

	amb_file: SoundHandle = 0;
	amb_chan: ChannelHandle = 0;
	/** 1 land, -1 water */
	amb_mode = 0;
	map_music = '';

	speech_chan: ChannelHandle = 0;
	listener: BlitzListener | null = null;

	Tres: Tres[] = [];
	Tsoundset: Tsoundset[] = [];
	Tsfx: Tsfx[] = [];
	Tspeech: Tspeech[] = [];

	/* load_media.bb, "SYSTEM SFX" */
	sfx_click = 0;
	sfx_switch = 0;
	sfx_menu = 0;
	sfx_fail = 0;
	sfx_build = 0;
	sfx_build_finish = 0;
	sfx_eat = 0;
	sfx_drink = 0;
	sfx_swing_fast = 0;
	sfx_swing_slow = 0;
	sfx_dive = 0;
	sfx_collect = 0;
	sfx_pistol = 0;
	sfx_splash = 0;
	sfx_splash2 = 0;
	sfx_blubb = 0;
	sfx_sleep = 0;
	sfx_fire = 0;
	sfx_gasp = 0;
	sfx_startdive = 0;
	sfx_drown = 0;
	sfx_treefall = 0;
	sfx_fizzle = 0;
	sfx_launch = 0;
	sfx_fish = 0;
	sfx_dig = 0;
	sfx_rain = 0;
	sfx_diary = 0;
	sfx_step: number[] = [0, 0, 0, 0];
	sfx_waterstep = 0;
	sfx_woodstep: number[] = [0, 0];
	sfx_stonestep: number[] = [0, 0];
	sfx_swim = 0;
	sfx_fountain = 0;
	sfx_thunder: number[] = [0, 0, 0];
	sfx_pang = 0;
	sfx_wave: number[] = [0, 0, 0];
	sfx_crack: number[] = [0, 0, 0, 0];
	sfx_spark: number[] = [0, 0, 0, 0];
	sfx_explode: number[] = [0, 0, 0, 0, 0];
	sfx_humanhit: number[] = [0, 0, 0, 0, 0];
	sfx_humandie: number[] = [0, 0, 0];
	sfx_mat_wood: number[] = [0, 0];
	sfx_mat_stone: number[] = [0];
	sfx_mat_dust: number[] = [0];
	sfx_mat_metal: number[] = [0];
	sfx_mat_flesh: number[] = [0, 0, 0, 0, 0];
	sfx_mat_fruit: number[] = [0, 0];
	sfx_mat_glass: number[] = [0, 0];
	sfx_mat_leaf: number[] = [0, 0, 0, 0];

	/** First line of every resource link file (sfx\*.inf) read by preload(). */
	private links = new Map<string, string>();

	constructor(
		readonly bb: BlitzAudio,
		readonly host: S2AudioHost
	) {}

	private Rand(low: number, high: number): number {
		return this.host.Rand ? this.host.Rand(low, high) : low + Math.floor(Math.random() * (high - low + 1));
	}

	private con_add(txt: string, special?: number): void {
		if (this.host.con_add) this.host.con_add(txt, special);
		else console.log(txt);
	}

	private FileType(path: string): number {
		return this.bb.files.exists(path) ? 1 : 0;
	}

	/* ------------------------------------------------------------- startup */

	/**
	 * Not in the original (it loads synchronously): decodes every sound under
	 * sfx\ and sfx\speech\ and reads the resource link files, so that all the
	 * functions below can stay synchronous. Call once before load_media_sfx().
	 * Returns the sound files that could not be decoded.
	 */
	async preload(onProgress?: (done: number, total: number) => void): Promise<string[]> {
		const files = this.bb.files;
		for (const dir of ['sfx', 'sfx\\speech']) {
			for (const name of files.list(dir)) {
				if (!/\.inf$/i.test(name)) continue;
				try {
					await this.preload_link(`${dir}\\${name}`);
				} catch {
					/* load_res reports it when the link is used */
				}
			}
		}
		return this.bb.preload('all', onProgress);
	}

	/** Reads one resource link file (ReadLine of its first line) ahead of time. */
	async preload_link(path: string): Promise<void> {
		const text = latin1(await this.bb.files.readBytes(path));
		const nl = text.indexOf('\n');
		this.links.set(path.replaceAll('/', '\\').toLowerCase(), (nl < 0 ? text : text.slice(0, nl)).replace(/\r$/, ''));
	}

	/** load_setup.bb: listener=CreateListener(cam,0.02,1,1) */
	load_setup_listener(): void {
		this.listener = this.bb.CreateListener(this.host.cam, 0.02, 1, 1);
	}

	/** load_media.bb, block "SYSTEM SFX" */
	load_media_sfx(): void {
		const snd = (p: string) => this.load_res(p, Cres_sound);
		//Basic
		this.sfx_click = snd('sfx\\click.wav');
		this.sfx_switch = snd('sfx\\switch.wav');
		this.sfx_menu = snd('sfx\\menu.wav');
		this.sfx_fail = snd('sfx\\fail.wav');

		this.sfx_build = snd('sfx\\build.wav');
		this.sfx_build_finish = snd('sfx\\build_finish.wav');
		this.sfx_eat = snd('sfx\\eat.wav');
		this.sfx_drink = snd('sfx\\drink.wav');
		this.sfx_swing_fast = snd('sfx\\swing_fast.wav');
		this.sfx_swing_slow = snd('sfx\\swing_slow.wav');
		this.sfx_dive = snd('sfx\\dive.wav');
		if (this.sfx_dive !== 0) this.bb.LoopSound(this.sfx_dive);
		this.sfx_collect = snd('sfx\\collect.wav');
		this.sfx_pistol = snd('sfx\\pistol.wav');
		this.sfx_splash = snd('sfx\\splash.wav');
		this.sfx_splash2 = snd('sfx\\splash2.wav');
		this.sfx_blubb = snd('sfx\\blubb.wav');
		this.sfx_sleep = snd('sfx\\sleep.wav');
		this.sfx_fire = snd('sfx\\fire.wav');
		this.sfx_gasp = snd('sfx\\gasp.wav');
		this.sfx_startdive = snd('sfx\\startdive.wav');
		this.sfx_drown = snd('sfx\\drown.wav');
		this.sfx_treefall = snd('sfx\\treefall.wav');
		this.sfx_fizzle = snd('sfx\\fizzle.wav');
		this.sfx_launch = snd('sfx\\launch.wav');
		this.sfx_fish = snd('sfx\\fish.wav');
		this.sfx_dig = snd('sfx\\dig.wav');
		this.sfx_rain = snd('sfx\\rain.wav');
		if (this.sfx_rain !== 0) this.bb.LoopSound(this.sfx_rain);
		this.sfx_diary = this.load_res('sfx\\diary.wav', Cres_music);
		for (let i = 0; i <= 3; i++) this.sfx_step[i] = snd('sfx\\step' + (i + 1) + '.wav');
		this.sfx_waterstep = snd('sfx\\waterstep.wav');
		this.sfx_woodstep[0] = snd('sfx\\woodstep1.wav');
		this.sfx_woodstep[1] = snd('sfx\\woodstep2.wav');
		this.sfx_stonestep[0] = snd('sfx\\stonestep1.wav');
		this.sfx_stonestep[1] = snd('sfx\\stonestep2.wav');
		this.sfx_swim = snd('sfx\\swim.wav');
		this.sfx_fountain = snd('sfx\\fountain.wav');
		this.sfx_thunder[0] = snd('sfx\\thunder1.wav');
		this.sfx_thunder[1] = snd('sfx\\thunder2.wav');
		this.sfx_thunder[2] = snd('sfx\\thunder3.wav');
		this.sfx_pang = snd('sfx\\pang.wav');
		this.sfx_wave[0] = snd('sfx\\wave1.wav');
		this.sfx_wave[1] = snd('sfx\\wave2.wav');
		this.sfx_wave[2] = snd('sfx\\wave3.wav');

		for (let i = 0; i <= 3; i++) this.sfx_crack[i] = snd('sfx\\crack' + (i + 1) + '.wav');
		for (let i = 0; i <= 3; i++) this.sfx_spark[i] = snd('sfx\\spark' + (i + 1) + '.wav');
		for (let i = 0; i <= 4; i++) this.sfx_explode[i] = snd('sfx\\explode' + (i + 1) + '.wav');
		for (let i = 0; i <= 4; i++) this.sfx_humanhit[i] = snd('sfx\\human_hit' + (i + 1) + '.wav');
		for (let i = 0; i <= 2; i++) this.sfx_humandie[i] = snd('sfx\\human_die' + (i + 1) + '.wav');

		this.sfx_mat_wood[0] = snd('sfx\\mat_wood1.wav');
		this.sfx_mat_wood[1] = snd('sfx\\mat_wood2.wav');
		this.sfx_mat_stone[0] = snd('sfx\\mat_stone1.wav');
		this.sfx_mat_dust[0] = snd('sfx\\mat_dust1.wav');
		this.sfx_mat_metal[0] = snd('sfx\\mat_metal1.wav');
		this.sfx_mat_flesh[0] = snd('sfx\\mat_flesh1.wav');
		this.sfx_mat_flesh[1] = snd('sfx\\mat_flesh2.wav');
		this.sfx_mat_flesh[2] = snd('sfx\\mat_flesh3.wav');
		this.sfx_mat_flesh[3] = snd('sfx\\mat_flesh4.wav');
		this.sfx_mat_flesh[4] = snd('sfx\\mat_flesh5.wav');
		this.sfx_mat_fruit[0] = snd('sfx\\mat_fruit1.wav');
		this.sfx_mat_fruit[1] = snd('sfx\\mat_fruit2.wav');
		this.sfx_mat_glass[0] = snd('sfx\\mat_glass1.wav');
		this.sfx_mat_glass[1] = snd('sfx\\mat_glass2.wav');
		this.sfx_mat_leaf[0] = snd('sfx\\mat_leaf1.wav');
		this.sfx_mat_leaf[1] = snd('sfx\\mat_leaf2.wav');
		this.sfx_mat_leaf[2] = snd('sfx\\mat_leaf3.wav');
		this.sfx_mat_leaf[3] = snd('sfx\\mat_leaf4.wav');
	}

	/* -------------------------------------------------------- ressources.bb */

	/** load_res(path$,typ,mode=1) */
	load_res(path: string, typ: number, mode = 1): number {
		//Link
		if (this.FileType(path) === 0) {
			const dot = path.indexOf('.');
			if (dot < 0) return 0;
			path = path.slice(0, dot) + '.inf';
			if (this.FileType(path) === 1) {
				const line = this.links.get(path.replaceAll('/', '\\').toLowerCase());
				if (line !== undefined) {
					path = path$(path) + line.trim();
				} else {
					this.con_add('ERROR: Unable to read Resource Link from ' + path, Cbmpf_red);
					return 0;
				}
			} else {
				return 0;
			}
		}
		//Exists
		for (const r of this.Tres) {
			if (r.typ === typ && r.file === path) return r.h;
		}
		//Load
		if (this.host.set_debug?.()) this.con_add('Loading Res.: ' + path + ' (Type: ' + typ + ', Mode: ' + mode + ')');
		let h = 0;
		switch (typ) {
			case Cres_sound:
				h = this.bb.Load3DSound(path);
				break;
			case Cres_music:
				h = this.bb.LoadSound(path);
				break;
			default:
				h = this.host.load_other_res?.(path, typ, mode) ?? 0;
		}
		//Return
		if (h === 0) {
			if (path.slice(0, 11) !== 'sfx\\speech\\') {
				this.con_add('ERROR: Unable to load ' + path, Cbmpf_red);
			}
			return 0;
		}
		this.Tres.push({ file: path, typ, h });
		return h;
	}

	/** load_soundset(name$) */
	load_soundset(name: string): number {
		//Exists?
		for (const s of this.Tsoundset) {
			if (s.name === name) return 1;
		}
		//Load
		const set: Tsoundset = { name, spot: 0, attack: 0, idle1: 0, idle2: 0, idle3: 0, die: 0, flee: 0, move: 0 };
		this.Tsoundset.push(set);
		set.spot = this.load_res('sfx\\' + name + '_spot.wav', Cres_sound);
		set.attack = this.load_res('sfx\\' + name + '_attack.wav', Cres_sound);
		set.idle1 = this.load_res('sfx\\' + name + '_idle1.wav', Cres_sound);
		set.idle2 = this.load_res('sfx\\' + name + '_idle2.wav', Cres_sound);
		set.idle3 = this.load_res('sfx\\' + name + '_idle3.wav', Cres_sound);
		set.die = this.load_res('sfx\\' + name + '_die.wav', Cres_sound);
		set.flee = this.load_res('sfx\\' + name + '_flee.wav', Cres_sound);
		set.move = this.load_res('sfx\\' + name + '_move.wav', Cres_sound);
		return 1;
	}

	/** play_soundset(name$,sound,entity) */
	play_soundset(name: string, sound: number, entity: AudioEntity): ChannelHandle {
		//Find
		for (const s of this.Tsoundset) {
			if (s.name === name) {
				switch (sound) {
					case snd_spot:
						return this.sfx_emit(s.spot, entity);
					case snd_attack:
						return this.sfx_emit(s.attack, entity);
					case snd_idle1:
						return this.sfx_emit(s.idle1, entity);
					case snd_idle2:
						return this.sfx_emit(s.idle2, entity);
					case snd_idle3:
						return this.sfx_emit(s.idle3, entity);
					case snd_die:
						return this.sfx_emit(s.die, entity);
					case snd_flee:
						return this.sfx_emit(s.flee, entity);
					case snd_move:
						return this.sfx_emit(s.move, entity);
				}
				return 0;
			}
		}
		//Failed
		return 0;
	}

	/* --------------------------------------------------------------- sfx.bb */

	/** sfx_update() */
	sfx_update(): void {
		const bb = this.bb;
		const gt = this.host.gt();

		//Music
		if (this.mfx_chan !== 0) {
			//Repeat
			if (!bb.ChannelPlaying(this.mfx_chan)) {
				this.mfx_chan = bb.PlaySound(this.mfx_file);
			}
			//Fading
			if (this.mfx_fade !== 0) {
				let perc: number;
				if (this.mfx_fade === 1) {
					//In
					perc = (gt - this.mfx_fadestart) / this.mfx_fadeend;
					if (gt - this.mfx_fadestart >= this.mfx_fadeend) {
						this.mfx_vol = this.mfx_peakvol * this.set_musicvolume;
						this.mfx_fade = 0;
					} else {
						this.mfx_vol = this.mfx_peakvol * perc * this.set_musicvolume;
					}
				} else {
					//Out
					perc = 1 - (gt - this.mfx_fadestart) / this.mfx_fadeend;
					if (gt - this.mfx_fadestart >= this.mfx_fadeend) {
						this.mfx_fade = 0;
						bb.FreeSound(this.mfx_file);
						this.mfx_file = 0;
						this.mfx_filename = '';
						this.mfx_chan = 0;
					} else {
						this.mfx_vol = this.mfx_peakvol * perc * this.set_musicvolume;
					}
				}
			} else {
				//Use Peak-Volume @ no Fading
				this.mfx_vol = this.mfx_peakvol * this.set_musicvolume;
			}
			//Set Volume
			// (sic) set_musicvolume is applied a second time here
			bb.ChannelVolume(this.mfx_chan, this.mfx_vol * this.set_musicvolume);
		}

		//SFXs (free played sfx)
		for (let i = 0; i < this.Tsfx.length; i++) {
			const t = this.Tsfx[i];
			if (!bb.ChannelPlaying(t.chan)) {
				bb.FreeSound(t.file);
				this.Tsfx.splice(i--, 1);
			}
		}

		//Ambient
		if (this.host.cam.worldPosition().y > 0) {
			//Over Water
			if (this.amb_mode !== 1) {
				if (this.amb_chan !== 0) bb.StopChannel(this.amb_chan);
				if (this.amb_file !== 0) {
					this.amb_chan = this.sfx(this.amb_file);
				}
				this.amb_mode = 1;
			} else {
				if (this.amb_chan !== 0) {
					if (bb.ChannelPlaying(this.amb_chan) === 0) {
						if (this.amb_file !== 0) {
							this.amb_chan = this.sfx(this.amb_file);
						}
					}
				} else {
					if (this.amb_file !== 0) {
						this.amb_chan = this.sfx(this.amb_file);
					}
				}
			}
		} else {
			//Under Water
			if (this.amb_mode !== -1) {
				if (this.amb_chan !== 0) bb.StopChannel(this.amb_chan);
				this.amb_chan = this.sfx(this.sfx_dive);
				this.amb_mode = -1;
			}
		}
	}

	/**
	 * sfx_play(file$,vol#=1.,pan#=1.,pitch=0)
	 * (sic) the default pan is 1 = hard right; the script command "play"
	 * passes 0 unless the script gives a pan. Has no Return at the end, so the
	 * result is always 0.
	 */
	sfx_play(file: string, vol = 1, pan = 1, pitch = 0): number {
		const bb = this.bb;
		const t: Tsfx = { file: bb.LoadSound('sfx\\' + file), chan: 0 };
		if (t.file === 0) return 0;
		this.Tsfx.push(t);
		t.chan = bb.PlaySound(t.file);
		bb.ChannelVolume(t.chan, vol * this.set_fxvolume);
		bb.ChannelPan(t.chan, pan);
		pitch = bbInt(pitch);
		if (pitch !== 0) {
			bb.ChannelPitch(t.chan, pitch);
		}
		return 0;
	}

	/** sfx_music(file$,vol#=1.) */
	sfx_music(file: string, vol = 1): number {
		const bb = this.bb;
		if (this.mfx_file !== 0) bb.FreeSound(this.mfx_file);
		this.mfx_file = bb.LoadSound('sfx\\' + file);
		if (this.mfx_file === 0) {
			return 0;
		}
		this.mfx_filename = file;
		this.mfx_chan = bb.PlaySound(this.mfx_file);
		this.mfx_fade = 0;
		this.mfx_peakvol = vol;
		bb.ChannelVolume(this.mfx_chan, this.mfx_peakvol * this.set_musicvolume);
		return 0;
	}

	/** stopsounds() */
	stopsounds(): void {
		for (const t of this.Tsfx) this.bb.FreeSound(t.file);
		this.Tsfx.length = 0;
	}

	/**
	 * sfx_3d(x,y,z,sound)
	 * (sic) x, y and z are Int parameters, so the position is rounded to whole units.
	 */
	sfx_3d(x: number, y: number, z: number, sound: SoundHandle): void {
		const p = { x: bbInt(x), y: bbInt(y), z: bbInt(z) };
		const emitter: AudioEntity = { worldPosition: () => p };
		const chan = this.bb.EmitSound(sound, emitter);
		if (chan !== 0) {
			this.bb.ChannelVolume(chan, this.set_fxvolume);
		}
		this.bb.FreeEntity(emitter);
	}

	/** sfx(sound,volume#=1.) */
	sfx(sound: SoundHandle, volume = 1): ChannelHandle {
		const chan = this.bb.PlaySound(sound);
		if (chan !== 0) {
			this.bb.ChannelVolume(chan, this.set_fxvolume * volume);
		}
		return chan;
	}

	/** sfx_emit(sound,emitter,volume#=1.) */
	sfx_emit(sound: SoundHandle, emitter: AudioEntity, volume = 1): ChannelHandle {
		const chan = this.bb.EmitSound(sound, emitter);
		if (chan !== 0) {
			this.bb.ChannelVolume(chan, this.set_fxvolume * volume);
		}
		return chan;
	}

	/** functions.bb play(sound) */
	play(sound: SoundHandle): void {
		const chan = this.bb.PlaySound(sound);
		this.bb.ChannelVolume(chan, this.set_fxvolume);
	}

	/* ------------------------------------------------------------ speech.bb */

	/** speech(file$,override=0,forceid=0) */
	speech(file: string, override = 0, forceid = 0): number {
		const bb = this.bb;
		//Playing?
		if (bb.ChannelPlaying(this.speech_chan)) {
			if (override === 0) {
				return 0;
			} else {
				bb.StopChannel(this.speech_chan);
			}
		}
		//Speech Type
		let s = this.Tspeech.find((t) => t.file === file);
		//New
		if (!s) {
			s = { file, limit: 0, lastplayed: 0 };
			this.Tspeech.push(s);
			for (let i = 1; i <= 99; i++) {
				if (this.FileType('sfx\\speech\\' + file + i + '.ogg') === 1) {
					s.limit = i;
				} else {
					break;
				}
			}
		}
		//Load and Play Random
		if (s.limit > 0) {
			let i = 1;
			if (s.limit !== 1) {
				let newplay = 0;
				while (newplay === 0) {
					i = this.Rand(1, s.limit);
					if (i !== s.lastplayed) {
						newplay = 1;
					}
				}
			}
			if (forceid > 0) i = forceid;
			s.lastplayed = i;
			const speech = this.load_res('sfx\\speech\\' + file + i + '.ogg', Cres_sound);
			if (speech !== 0) {
				this.speech_chan = this.sfx_emit(speech, this.host.cam);
			}
			//Load and Play
		} else {
			const speech = this.load_res('sfx\\speech\\' + file + '.ogg', Cres_sound);
			if (speech !== 0) {
				this.speech_chan = this.sfx_emit(speech, this.host.cam);
			}
		}
		return 0;
	}

	/* --------------------------------- parser_commands.bb, "SOUNDS" section */

	/** Script command `music "file"[,volume][,fade]`; pass fade only when the script gives it. */
	cmd_music(file: string, vol = 1, fade?: number): void {
		this.sfx_music(file, vol);
		if (fade !== undefined) {
			this.mfx_fade = 1;
			this.mfx_fadestart = this.host.gt();
			this.mfx_fadeend = Math.abs(bbInt(fade));
		}
	}

	/** Script command `stopmusic` */
	cmd_stopmusic(): void {
		if (this.mfx_file !== 0) this.bb.FreeSound(this.mfx_file);
		this.mfx_file = 0;
		this.mfx_chan = 0;
	}

	/** Script command `fademusic duration` */
	cmd_fademusic(fade: number): void {
		this.mfx_fade = -1;
		this.mfx_fadestart = this.host.gt();
		this.mfx_fadeend = Math.abs(bbInt(fade));
	}

	/** Script command `musicvolume volume` */
	cmd_musicvolume(volume: number): void {
		this.mfx_fade = 0;
		this.mfx_peakvol = volume;
	}

	/**
	 * Script command `ambientsfx "file"`.
	 * (sic) amb_chan and amb_file keep their old values when the new name is
	 * empty; the stale handles are harmless (freed sound, stopped channel).
	 */
	cmd_ambientsfx(file: string): void {
		if (this.amb_chan !== 0) this.bb.StopChannel(this.amb_chan);
		if (this.amb_file !== 0) this.bb.FreeSound(this.amb_file);
		this.map_music = file;
		if (this.map_music !== '') {
			this.amb_file = this.bb.LoadSound('sfx\\' + this.map_music);
		}
	}

	/* ------------------------------------------- e_load_map.bb / e_clear.bb */

	/** e_load_map.bb ";Music": the map's ambient loop */
	load_map_music(map_music: string): void {
		this.map_music = map_music;
		if (this.map_music !== '') {
			this.amb_file = this.bb.LoadSound('sfx\\' + this.map_music);
		}
	}

	/** e_clear.bb: the ambient and music part */
	e_clear_audio(): void {
		const bb = this.bb;
		if (this.amb_chan !== 0) {
			bb.StopChannel(this.amb_chan);
			this.amb_chan = 0;
		}
		if (this.amb_file !== 0) {
			bb.FreeSound(this.amb_file);
			this.amb_file = 0;
		}
		this.amb_chan = 0;
		this.amb_mode = 0;

		if (this.mfx_chan !== 0) {
			if (bb.ChannelPlaying(this.mfx_chan)) {
				bb.StopChannel(this.mfx_chan);
			}
			this.mfx_chan = 0;
		}
		if (this.mfx_file !== 0) bb.FreeSound(this.mfx_file);
		this.mfx_fade = 0;
		this.mfx_file = 0;
		this.mfx_filename = '';
	}

	/* -------------------------------------------- menu.bb / load_settings.bb */

	/**
	 * menu.bb Cmenu_set_sfx: the sliders (0..100) are applied and the running
	 * ambient channel follows immediately; music follows in sfx_update, other
	 * channels keep the volume they were started with.
	 */
	menu_set_sfx(musicSlider: number, fxSlider: number): void {
		this.set_musicvolume = musicSlider / 100;
		this.set_fxvolume = fxSlider / 100;
		if (this.amb_chan !== 0) {
			this.bb.ChannelVolume(this.amb_chan, this.set_fxvolume);
		}
	}
}
