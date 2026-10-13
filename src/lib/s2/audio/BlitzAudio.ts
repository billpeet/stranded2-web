/**
 * Blitz3D audio runtime (bbruntime/bbaudio.cpp, gxruntime/gxaudio.cpp,
 * gxsound.cpp, blitz3d/object.cpp emitSound/updateSounds, listener.cpp) on
 * top of an AudioBackend.
 *
 * Function names, argument order and defaults are the Blitz ones:
 *
 *   LoadSound$filename            Load3DSound$filename      FreeSound%sound
 *   LoopSound%sound               SoundPitch%sound%pitch    SoundVolume%sound#volume
 *   SoundPan%sound#pan            PlaySound%sound           PlayMusic$file
 *   StopChannel%channel           PauseChannel%channel      ResumeChannel%channel
 *   ChannelPitch%channel%pitch    ChannelVolume%channel#volume
 *   ChannelPan%channel#pan        ChannelPlaying%channel
 *   CreateListener%parent#rolloff_factor=1#doppler_scale=1#distance_scale=1
 *   EmitSound%sound%entity
 *
 * Handles are non-zero integers and 0 is "no sound"/"no channel", exactly as
 * in Blitz, because the game stores them in Int fields and tests `<>0`.
 * Every function accepts 0 (and null/undefined) and then does nothing, as the
 * `if( !sound ) return` guards in bbaudio.cpp do.
 *
 * ## Channel handles
 *
 * A Blitz channel handle is a pointer to a SoundChannel object that wraps an
 * FMOD channel id. gxaudio.cpp allocSoundChannel() keeps 4096 of them in a
 * ring and hands out the next one that is not playing, so
 *  - a handle stays valid forever: ChannelPlaying on a finished channel is 0
 *    and Stop/Volume/Pan/Pitch on it do nothing (FMOD rejects the stale id);
 *  - after enough other sounds have started, an old handle is recycled and
 *    then refers to the newer sound.
 * Both are reproduced: handle = ring slot index + 1.
 *
 * ## Browser constraints
 *
 * 1. Autoplay policy. An AudioContext stays suspended until a user gesture.
 *    The runtime behaves like a PC with the speakers switched off: channels
 *    are timed on the backend's wall clock, so a sound started before the
 *    gesture "plays" silently, ChannelPlaying turns 0 when its length has
 *    elapsed, loops keep looping. When the context starts, every channel that
 *    is still playing becomes audible at its current offset. Nothing is
 *    queued, so there is no burst of stale sounds on the first click, and
 *    game logic that polls ChannelPlaying (music repeat, ambient restart,
 *    speech override, sfx_update's cleanup) runs identically either way.
 * 2. Decoding is asynchronous, Blitz loads synchronously. `preload(paths)`
 *    or `preload('all')` decodes ahead of time; afterwards Load* are
 *    synchronous. A file that does not exist or cannot be decoded gives 0,
 *    like Blitz. A file that exists but was never preloaded also gives 0,
 *    logs a warning once and starts decoding in the background so a later
 *    call succeeds; `ensureLoaded(path)` awaits a single file.
 */
import type { AudioBackend, BackendVoice, SoundData, Vec3, VoiceParams } from './backend';
import {
	DEFAULT_3D,
	FSOUND_STEREOPAN,
	dopplerRate,
	fmodPan,
	fmodVolume,
	mix2d,
	mix3d,
	pitchRate,
	type Listener3d,
	type Options3d
} from './fmod';

/** What EmitSound needs from an entity. bb3d entities can implement this directly. */
export interface AudioEntity {
	/** EntityX/Y/Z(entity, True) in Blitz world coordinates. */
	worldPosition(): Vec3;
	/**
	 * Object::getVelocity(): world units moved per UpdateWorld tick divided by
	 * the tick's elapsed value. Optional; when absent the runtime derives it
	 * from successive worldPosition() values in updateWorld().
	 */
	worldVelocity?(): Vec3;
	/** False for hidden entities: World::render only updates the sounds of visible objects. */
	audible?(): boolean;
}

/** What CreateListener needs from its parent. */
export interface ListenerEntity extends AudioEntity {
	/** World transform k axis (Blitz +Z), any length. */
	worldForward(): Vec3;
	/** World transform j axis (Blitz +Y), any length. */
	worldUp(): Vec3;
}

/** The subset of the project's Vfs the audio code uses (structurally compatible with io/Vfs). */
export interface AudioFiles {
	exists(path: string): boolean;
	list(dir: string): string[];
	readBytes(path: string): Promise<Uint8Array>;
}

export type SoundHandle = number;
export type ChannelHandle = number;

/** gxSound */
interface Sound {
	id: number;
	path: string;
	data: SoundData;
	/** Loaded with Load3DSound (FSOUND_FORCEMONO, positional) rather than LoadSound (FSOUND_2D). */
	is3d: boolean;
	/** FSOUND_Sample_SetMode LOOP_NORMAL / LOOP_OFF */
	loop: boolean;
	/** def_freq, def_vol (0..255), def_pan (0..255 or FSOUND_STEREOPAN) */
	defFreq: number;
	defVol: number;
	defPan: number;
}

/** One FMOD channel: a playing instance of a sample. */
interface Voice {
	sound: Sound;
	volume: number; // 0..255
	pan: number; // 0..255 or FSOUND_STEREOPAN
	freq: number; // hertz
	loop: boolean;
	paused: boolean;
	stopped: boolean;
	/**
	 * 3D position and velocity (Load3DSound samples only). FMOD's channel start
	 * routine places every new channel at the listener with zero velocity;
	 * EmitSound and Object::updateSounds overwrite that with the entity's.
	 */
	pos: Vec3;
	vel: Vec3;
	/** Doppler factor in effect since the last FSOUND_Update. */
	doppler: number;
	/** Playback position in seconds of native-rate sample time at `stamp`. */
	cursor: number;
	stamp: number;
	out: BackendVoice | null;
}

/** gxaudio.cpp SoundChannel: a reusable slot that points at an FMOD channel. */
interface SoundChannel {
	voice: Voice | null;
}

/** gxaudio.cpp StreamChannel (PlayMusic): one per file name, replayed in place. */
interface StreamChannel {
	sound: Sound;
	voice: Voice | null;
}

interface Tracked {
	prev: Vec3;
	vel: Vec3;
	/** Object::channels */
	channels: (SoundChannel | null)[];
}

export interface BlitzListener {
	parent: ListenerEntity | null;
}

const AUDIO_EXT = /\.(wav|ogg|mp3)$/i;
/** PlayMusic handles live outside the 4096+ ring. */
const STREAM_BASE = 0x40000000;
const ZERO: Vec3 = { x: 0, y: 0, z: 0 };

/** Case-insensitive, slash-agnostic key, same rule as io/Vfs normalizePath. */
export function audioPathKey(path: string): string {
	return path.replaceAll('\\', '/').replace(/^\.?\/+/, '').replace(/\/+/g, '/').toLowerCase();
}

function sub(a: Vec3, b: Vec3): Vec3 {
	return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export class BlitzAudio {
	private data = new Map<string, SoundData>();
	private mono = new Map<string, SoundData>();
	private failed = new Set<string>();
	private pending = new Map<string, Promise<boolean>>();
	private warned = new Set<string>();

	private sounds = new Map<number, Sound>();
	private nextSound = 1;

	/** gxaudio.cpp: soundChannels (4096, doubled when every slot is playing) and next_chan */
	private soundChannels: (SoundChannel | null)[] = new Array(4096).fill(null);
	private next_chan = 0;
	private slotIndex = new Map<SoundChannel, number>();

	/** gxaudio.cpp: songs */
	private songs = new Map<string, number>();
	private streams: StreamChannel[] = [];

	private voices = new Set<Voice>();
	private tracked = new Map<AudioEntity, Tracked>();

	private listenerEntity: BlitzListener | null = null;
	/** Listener attributes as of the last FSOUND_3D_Listener_SetAttributes. */
	private listener: Listener3d & { vel: Vec3 } = {
		pos: { ...ZERO },
		vel: { ...ZERO },
		forward: { x: 0, y: 0, z: 1 },
		up: { x: 0, y: 1, z: 0 }
	};
	/** FSOUND_3D_SetRolloffFactor / DopplerFactor / DistanceFactor; FMOD defaults until CreateListener. */
	private options: Options3d = { ...DEFAULT_3D };

	constructor(
		readonly backend: AudioBackend,
		readonly files: AudioFiles
	) {
		backend.onRunning = () => this.syncVoices();
	}

	/* ------------------------------------------------------------ loading */

	/**
	 * Decodes sound files so that LoadSound/Load3DSound/PlayMusic can be
	 * synchronous. 'all' takes every .wav/.ogg/.mp3 directly inside sfx\ and
	 * sfx\speech\. Files that fail are remembered and load as 0. Returns the
	 * paths that failed.
	 */
	async preload(paths: readonly string[] | 'all', onProgress?: (done: number, total: number) => void): Promise<string[]> {
		const list =
			paths === 'all'
				? ['sfx', 'sfx\\speech'].flatMap((dir) =>
						this.files
							.list(dir)
							.filter((n) => AUDIO_EXT.test(n))
							.map((n) => `${dir}\\${n}`)
					)
				: [...paths];
		const bad: string[] = [];
		let done = 0;
		let next = 0;
		const worker = async () => {
			while (next < list.length) {
				const p = list[next++];
				if (!(await this.ensureLoaded(p))) bad.push(p);
				onProgress?.(++done, list.length);
			}
		};
		await Promise.all(Array.from({ length: Math.min(8, list.length) }, worker));
		return bad;
	}

	/** Decodes one file. Resolves false when it is missing or undecodable. */
	ensureLoaded(path: string): Promise<boolean> {
		const key = audioPathKey(path);
		if (this.data.has(key)) return Promise.resolve(true);
		if (this.failed.has(key)) return Promise.resolve(false);
		let p = this.pending.get(key);
		if (!p) {
			p = (async () => {
				try {
					if (!this.files.exists(path)) throw new Error('file not found');
					const d = await this.backend.decode(await this.files.readBytes(path));
					if (!(d.duration > 0)) throw new Error('empty sound');
					this.data.set(key, d);
					return true;
				} catch (e) {
					this.failed.add(key);
					console.warn(`[audio] cannot load ${path}: ${e instanceof Error ? e.message : e}`);
					return false;
				} finally {
					this.pending.delete(key);
				}
			})();
			this.pending.set(key, p);
		}
		return p;
	}

	/** True when a Load* call for this path would succeed right now. */
	isLoaded(path: string): boolean {
		return this.data.has(audioPathKey(path));
	}

	/** Registers already decoded data (tests, generated sounds). */
	provide(path: string, data: SoundData): void {
		const key = audioPathKey(path);
		this.data.set(key, data);
		this.mono.delete(key);
		this.failed.delete(key);
	}

	private lookup(path: string, use3d: boolean): SoundData | null {
		const key = audioPathKey(path);
		const d = this.data.get(key);
		if (!d) {
			if (!this.failed.has(key) && !this.warned.has(key) && this.files.exists(path)) {
				this.warned.add(key);
				console.warn(`[audio] ${path} was not preloaded; returning 0 and decoding in the background`);
				void this.ensureLoaded(path);
			}
			return null;
		}
		if (!use3d || d.channels === 1) return d;
		let m = this.mono.get(key);
		if (!m) this.mono.set(key, (m = this.backend.toMono(d)));
		return m;
	}

	/** gxAudio::loadSound */
	private loadSound(filename: string, use3d: boolean): SoundHandle {
		const data = this.lookup(filename, use3d);
		if (!data) return 0;
		const sound: Sound = {
			id: this.nextSound++,
			path: filename,
			data,
			is3d: use3d,
			loop: false,
			// gxSound::gxSound: FSOUND_Sample_GetDefaults. FMOD's defaults for a
			// fresh sample are its file rate, volume 255 and pan 128 for mono or
			// FSOUND_STEREOPAN for stereo data.
			defFreq: data.nativeRate,
			defVol: 255,
			defPan: data.channels > 1 ? FSOUND_STEREOPAN : 128
		};
		this.sounds.set(sound.id, sound);
		return sound.id;
	}

	/** LoadSound: 2D sample (FSOUND_2D), keeps stereo. */
	LoadSound(filename: string): SoundHandle {
		return this.loadSound(filename, false);
	}

	/** Load3DSound: positional sample, forced to mono (FSOUND_FORCEMONO). */
	Load3DSound(filename: string): SoundHandle {
		return this.loadSound(filename, true);
	}

	/**
	 * FreeSound. FSOUND_Sample_Free also silences every channel playing the
	 * sample; the game depends on that (script command "stopmusic" and the end
	 * of a music fade only call FreeSound, stopsounds() likewise).
	 */
	FreeSound(sound: SoundHandle | null | undefined): void {
		const s = this.sound(sound);
		if (!s) return;
		this.sounds.delete(s.id);
		for (const v of [...this.voices]) if (v.sound === s) this.stopVoice(v);
	}

	/** LoopSound: later plays of the sound loop (FSOUND_Sample_SetMode LOOP_NORMAL). */
	LoopSound(sound: SoundHandle | null | undefined): void {
		const s = this.sound(sound);
		if (s) s.loop = true;
	}

	/** SoundPitch: default frequency in hertz for later plays. */
	SoundPitch(sound: SoundHandle | null | undefined, pitch: number): void {
		const s = this.sound(sound);
		if (s) s.defFreq = Math.trunc(pitch);
	}

	/** SoundVolume: default volume 0..1 for later plays (def_vol=volume*255). */
	SoundVolume(sound: SoundHandle | null | undefined, volume: number): void {
		const s = this.sound(sound);
		if (s) s.defVol = fmodVolume(volume);
	}

	/** SoundPan: default pan -1..1 for later plays (def_pan=(pan+1)*127.5). */
	SoundPan(sound: SoundHandle | null | undefined, pan: number): void {
		const s = this.sound(sound);
		if (s) s.defPan = fmodPan(pan);
	}

	private sound(h: SoundHandle | null | undefined): Sound | null {
		return h ? (this.sounds.get(h) ?? null) : null;
	}

	/* ------------------------------------------------------------ playing */

	/**
	 * PlaySound: gxSound::play -> FSOUND_PlaySound(FSOUND_FREE, sample).
	 * Also legal on a Load3DSound sample (the game does it for every interface
	 * sound, the rain and the diving loop): the channel is then a 3D source
	 * fixed at the spot where the listener was when it started, see fmod.ts
	 * mix3d.
	 */
	PlaySound(sound: SoundHandle | null | undefined): ChannelHandle {
		const s = this.sound(sound);
		if (!s) return 0;
		return this.handleOf(this.allocSoundChannel(this.startVoice(s)));
	}

	/**
	 * EmitSound: Object::emitSound -> gxSound::play3d(position, velocity).
	 * The channel is then repositioned from the entity on every renderWorld()
	 * for as long as it plays (Object::updateSounds). A sound loaded with
	 * LoadSound ignores the 3D attributes and plays flat.
	 */
	EmitSound(sound: SoundHandle | null | undefined, entity: AudioEntity): ChannelHandle {
		const s = this.sound(sound);
		if (!s) return 0;
		const t = this.track(entity);
		const voice = this.startVoice(s, { pos: entity.worldPosition(), vel: this.velocityOf(entity, t) });
		const chan = this.allocSoundChannel(voice);
		// Object::emitSound's bookkeeping of its channel list
		let stored = false;
		for (let k = 0; k < t.channels.length; k++) {
			if (t.channels[k] === chan) {
				stored = true;
				break;
			}
			if (!t.channels[k]) {
				t.channels[k] = chan;
				stored = true;
				break;
			}
		}
		if (!stored) t.channels.push(chan);
		return this.handleOf(chan);
	}

	/**
	 * PlayMusic: gxAudio::playFile. Streams wav/mp3/ogg (the tracker and MIDI
	 * formats FMUSIC handles are not supported and give 0). One channel exists
	 * per file name; playing the same file again restarts it and returns the
	 * same handle. Never loops.
	 */
	PlayMusic(file: string): ChannelHandle {
		const key = file.toLowerCase();
		const known = this.songs.get(key);
		if (known !== undefined) {
			const st = this.streams[known - STREAM_BASE];
			if (st.voice) this.stopVoice(st.voice);
			st.voice = this.startVoice(st.sound);
			return known;
		}
		if (!AUDIO_EXT.test(key)) return 0;
		const data = this.lookup(file, false);
		if (!data) return 0;
		const sound: Sound = {
			id: 0,
			path: file,
			data,
			is3d: false,
			loop: false,
			defFreq: data.nativeRate,
			defVol: 255,
			defPan: data.channels > 1 ? FSOUND_STEREOPAN : 128
		};
		const handle = STREAM_BASE + this.streams.length;
		this.streams.push({ sound, voice: this.startVoice(sound) });
		this.songs.set(key, handle);
		return handle;
	}

	private startVoice(s: Sound, at?: { pos: Vec3; vel: Vec3 }): Voice {
		const v: Voice = {
			sound: s,
			volume: s.defVol,
			pan: s.defPan,
			freq: s.defFreq,
			loop: s.loop,
			paused: false,
			stopped: false,
			pos: { ...(at ? at.pos : this.listener.pos) },
			vel: { ...(at ? at.vel : ZERO) },
			// The start routine resets the doppler scale to 1; the real value
			// comes with the next FSOUND_Update.
			doppler: 1,
			cursor: 0,
			stamp: this.backend.now(),
			out: null
		};
		this.voices.add(v);
		this.attach(v);
		return v;
	}

	/** gxaudio.cpp allocSoundChannel */
	private allocSoundChannel(voice: Voice): SoundChannel {
		let chan: SoundChannel | null = null;
		for (let k = 0; k < this.soundChannels.length; ++k) {
			chan = this.soundChannels[this.next_chan];
			if (!chan) {
				chan = this.newSlot(this.next_chan);
			} else if (this.isPlaying(chan.voice)) {
				chan = null;
			}
			if (++this.next_chan === this.soundChannels.length) this.next_chan = 0;
			if (chan) break;
		}
		if (!chan) {
			this.next_chan = this.soundChannels.length;
			this.soundChannels.length *= 2;
			this.soundChannels.fill(null, this.next_chan);
			chan = this.newSlot(this.next_chan++);
		}
		chan.voice = voice;
		return chan;
	}

	private newSlot(index: number): SoundChannel {
		const chan: SoundChannel = { voice: null };
		this.soundChannels[index] = chan;
		this.slotIndex.set(chan, index);
		return chan;
	}

	private handleOf(chan: SoundChannel): ChannelHandle {
		return this.slotIndex.get(chan)! + 1;
	}

	private voiceOf(channel: ChannelHandle | null | undefined): Voice | null {
		if (!channel) return null;
		const v =
			channel >= STREAM_BASE
				? this.streams[channel - STREAM_BASE]?.voice
				: this.soundChannels[channel - 1]?.voice;
		// A finished or stopped FMOD channel id is stale: every FSOUND_* call on it fails.
		return v && this.isPlaying(v) ? v : null;
	}

	/* ----------------------------------------------------------- channels */

	/** StopChannel */
	StopChannel(channel: ChannelHandle | null | undefined): void {
		const v = this.voiceOf(channel);
		if (v) this.stopVoice(v);
	}

	/** PauseChannel. A paused channel still counts as playing. */
	PauseChannel(channel: ChannelHandle | null | undefined): void {
		const v = this.voiceOf(channel);
		if (!v || v.paused) return;
		this.advance(v);
		v.paused = true;
		v.out?.stop();
		v.out = null;
	}

	/** ResumeChannel */
	ResumeChannel(channel: ChannelHandle | null | undefined): void {
		const v = this.voiceOf(channel);
		if (!v || !v.paused) return;
		v.paused = false;
		v.stamp = this.backend.now();
		this.attach(v);
	}

	/** ChannelPitch: playback frequency in hertz (FSOUND_SetFrequency). */
	ChannelPitch(channel: ChannelHandle | null | undefined, pitch: number): void {
		const v = this.voiceOf(channel);
		if (!v) return;
		this.advance(v);
		v.freq = Math.trunc(pitch);
		this.push(v);
	}

	/** ChannelVolume: 0..1 (FSOUND_SetVolume(volume*255)). */
	ChannelVolume(channel: ChannelHandle | null | undefined, volume: number): void {
		const v = this.voiceOf(channel);
		if (!v) return;
		v.volume = fmodVolume(volume);
		this.push(v);
	}

	/**
	 * ChannelPan: -1 left .. 1 right (FSOUND_SetPan((pan+1)*127.5)).
	 * No effect on Load3DSound samples: FMOD's 3D update overwrites their pan
	 * on every FSOUND_Update.
	 */
	ChannelPan(channel: ChannelHandle | null | undefined, pan: number): void {
		const v = this.voiceOf(channel);
		if (!v) return;
		v.pan = fmodPan(pan);
		if (!v.sound.is3d) this.push(v);
	}

	/** ChannelPlaying: 1 while the channel's sound is playing or paused, else 0. */
	ChannelPlaying(channel: ChannelHandle | null | undefined): number {
		return this.voiceOf(channel) ? 1 : 0;
	}

	/* ------------------------------------------------------ voice plumbing */

	/** Moves the play cursor up to the backend clock. */
	private advance(v: Voice): void {
		const now = this.backend.now();
		if (!v.paused && !v.stopped) {
			v.cursor += (now - v.stamp) * this.rate(v);
			const len = v.sound.data.duration;
			if (v.loop && len > 0) v.cursor %= len;
		}
		v.stamp = now;
	}

	private rate(v: Voice): number {
		return pitchRate(v.freq, v.sound.data.nativeRate, v.doppler);
	}

	private isPlaying(v: Voice | null): boolean {
		if (!v || v.stopped) return false;
		this.advance(v);
		if (!v.loop && v.cursor >= v.sound.data.duration) {
			// Ran out. The backend voice ends by itself; do not cut its tail.
			v.stopped = true;
			v.out = null;
			this.voices.delete(v);
			return false;
		}
		return true;
	}

	private stopVoice(v: Voice): void {
		v.stopped = true;
		v.out?.stop();
		v.out = null;
		this.voices.delete(v);
	}

	private params(v: Voice): VoiceParams {
		if (!v.sound.is3d) {
			const g = mix2d(v.volume, v.pan, v.sound.data.channels);
			return { left: g.left, right: g.right, rate: this.rate(v), loop: v.loop, spatial: null };
		}
		const g = mix3d(v.volume, v.pos, this.listener, this.options);
		return {
			left: g.left,
			right: g.right,
			rate: this.rate(v),
			loop: v.loop,
			spatial: { position: v.pos, volume: v.volume / 255, rolloff: this.options.rolloff }
		};
	}

	/** Starts the backend voice for a channel that should be audible and has none. */
	private attach(v: Voice): void {
		if (v.out || v.paused || !this.backend.running || !this.isPlaying(v)) return;
		v.out = this.backend.start(v.sound.data, this.params(v), v.cursor);
	}

	private push(v: Voice): void {
		if (v.out) v.out.set(this.params(v));
	}

	/** The output device became available: make every live channel audible at its current offset. */
	private syncVoices(): void {
		for (const v of [...this.voices]) this.attach(v);
	}

	/* ------------------------------------------------------------- 3D world */

	/**
	 * CreateListener(parent, rolloff_factor=1, doppler_scale=1, distance_scale=1).
	 * Listener::Listener sets FMOD's three global 3D factors and positions the
	 * listener. The Blitz listener is an entity parented to `parent`; the game
	 * never moves it relative to the parent, so the parent's transform is the
	 * listener's. Blitz allows only one listener ("Listener already created").
	 */
	CreateListener(parent: ListenerEntity | null, rolloff_factor = 1, doppler_scale = 1, distance_scale = 1): BlitzListener {
		// FSOUND_3D_SetRolloffFactor clamps to 0..10 (0x100c9733)
		this.options = { rolloff: Math.min(10, Math.max(0, rolloff_factor)), doppler: doppler_scale, distance: distance_scale };
		this.listenerEntity = { parent };
		this.renderListener();
		return this.listenerEntity;
	}

	/** FreeEntity on the listener: Listener::~Listener resets FMOD's listener to the origin. */
	FreeListener(): void {
		this.listenerEntity = null;
		this.listener = { pos: { ...ZERO }, vel: { ...ZERO }, forward: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 1 } };
		this.fsoundUpdate();
	}

	/**
	 * FreeEntity on an emitter: Object::~Object zeroes the velocity and runs
	 * updateSounds() one last time; after that its channels keep playing where
	 * they are (sfx_3d relies on it: it frees its pivot right after EmitSound).
	 */
	FreeEntity(entity: AudioEntity): void {
		const t = this.tracked.get(entity);
		if (!t) return;
		t.vel = { ...ZERO };
		this.updateSounds(entity, t, true);
		this.tracked.delete(entity);
	}

	private track(entity: AudioEntity): Tracked {
		let t = this.tracked.get(entity);
		if (!t) this.tracked.set(entity, (t = { prev: entity.worldPosition(), vel: { ...ZERO }, channels: [] }));
		return t;
	}

	private velocityOf(entity: AudioEntity, t: Tracked | undefined): Vec3 {
		return entity.worldVelocity?.() ?? t?.vel ?? ZERO;
	}

	/**
	 * UpdateWorld(elapsed_time=1): Object::endUpdate,
	 * velocity = (position - previous position) / elapsed.
	 * Only entities that have sounds attached and the listener's parent are
	 * followed (Blitz does it for every enabled object, which is why an entity
	 * should implement worldVelocity() if the first frames of a sound matter).
	 */
	updateWorld(elapsed = 1): void {
		const parent = this.listenerEntity?.parent;
		if (parent) this.track(parent);
		for (const [entity, t] of this.tracked) {
			const p = entity.worldPosition();
			const d = sub(p, t.prev);
			t.vel = { x: d.x / elapsed, y: d.y / elapsed, z: d.z / elapsed };
			t.prev = p;
		}
	}

	/**
	 * The audio part of RenderWorld: Object::beginRender -> updateSounds() for
	 * every visible object, then Listener::renderListener() ->
	 * FSOUND_3D_Listener_SetAttributes + FSOUND_Update, which is the moment
	 * FMOD recomputes volume, pan and doppler of all 3D channels.
	 */
	renderWorld(): void {
		const parent = this.listenerEntity?.parent ?? null;
		for (const [entity, t] of this.tracked) {
			this.updateSounds(entity, t, false);
			if (!t.channels.some((c) => c) && entity !== parent) this.tracked.delete(entity);
		}
		if (this.listenerEntity && parent?.audible?.() !== false) this.renderListener();
		else this.fsoundUpdate();
	}

	/** Per frame: updateWorld(elapsed) followed by renderWorld(). */
	update(elapsed = 1): void {
		this.updateWorld(elapsed);
		this.renderWorld();
	}

	/** Object::updateSounds */
	private updateSounds(entity: AudioEntity, t: Tracked, force: boolean): void {
		if (!force && entity.audible?.() === false) return;
		for (let k = 0; k < t.channels.length; k++) {
			const chan = t.channels[k];
			if (!chan) continue;
			if (this.isPlaying(chan.voice)) {
				const v = chan.voice!;
				v.pos = { ...entity.worldPosition() };
				v.vel = { ...this.velocityOf(entity, t) };
				// (gxChannel::set3d on a recycled slot reaches whatever sound it now
				// plays; FMOD ignores the attributes of 2D samples.)
			} else t.channels[k] = null;
		}
	}

	/** Listener::renderListener */
	private renderListener(): void {
		const p = this.listenerEntity?.parent;
		if (p) {
			this.listener = {
				pos: { ...p.worldPosition() },
				vel: { ...this.velocityOf(p, this.tracked.get(p)) },
				forward: { ...p.worldForward() },
				up: { ...p.worldUp() }
			};
		} else {
			this.listener = { pos: { ...ZERO }, vel: { ...ZERO }, forward: { x: 0, y: 0, z: 1 }, up: { x: 0, y: 1, z: 0 } };
		}
		this.fsoundUpdate();
	}

	/** FSOUND_Update: recompute volume, pan and doppler of every software 3D channel (0x100db3fe). */
	private fsoundUpdate(): void {
		this.backend.setListener(this.listener);
		for (const v of [...this.voices]) {
			if (!v.sound.is3d || !this.isPlaying(v)) continue;
			const d = dopplerRate(v.pos, v.vel, this.listener.pos, this.listener.vel, this.options);
			if (d !== v.doppler) {
				this.advance(v);
				v.doppler = d;
			}
			this.push(v);
		}
	}

	/* -------------------------------------------------------------- inspect */

	/** Read-only view of what a channel is doing (dev page, tests). */
	inspect(channel: ChannelHandle | null | undefined): (VoiceParams & {
		path: string;
		cursor: number;
		duration: number;
		paused: boolean;
		audible: boolean;
		volume: number;
		pan: number;
		frequency: number;
	}) | null {
		const v = this.voiceOf(channel);
		if (!v) return null;
		return {
			...this.params(v),
			path: v.sound.path,
			cursor: v.cursor,
			duration: v.sound.data.duration,
			paused: v.paused,
			audible: !!v.out,
			volume: v.volume,
			pan: v.pan,
			frequency: v.freq
		};
	}

	/** Number of FMOD channels currently playing (paused ones included). */
	get playingCount(): number {
		let n = 0;
		for (const v of [...this.voices]) if (this.isPlaying(v)) n++;
		return n;
	}

	/** Metadata of a loaded sound handle. */
	soundInfo(sound: SoundHandle | null | undefined): { path: string; duration: number; nativeRate: number; channels: number; is3d: boolean; loop: boolean } | null {
		const s = this.sound(sound);
		return s
			? { path: s.path, duration: s.data.duration, nativeRate: s.data.nativeRate, channels: s.data.channels, is3d: s.is3d, loop: s.loop }
			: null;
	}

	/** Current FMOD 3D state (dev page, tests). */
	get state3d(): { listener: Listener3d & { vel: Vec3 }; options: Options3d } {
		return { listener: this.listener, options: this.options };
	}
}
