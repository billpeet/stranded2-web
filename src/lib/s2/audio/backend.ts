/**
 * The seam between the Blitz audio runtime (BlitzAudio.ts: handles, channel
 * bookkeeping, FMOD parameter maths) and whatever produces sound. Everything
 * the runtime decides is expressed in VoiceParams; a backend only has to
 * realise those numbers. WebAudioBackend does it with Web Audio nodes,
 * FakeBackend (tests) just records them.
 */
import { wavDuration, parseSoundFile } from './soundFile';

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/** A decoded sample. `native*` describe the file, not the decoded buffer. */
export interface SoundData {
	/** Seconds at the native rate. */
	duration: number;
	/** Rate stored in the file header = FMOD's default frequency for the sample. */
	nativeRate: number;
	/** Channel count of this data (1 after an FSOUND_FORCEMONO downmix). */
	channels: number;
	/** Backend private (an AudioBuffer in the browser). */
	buffer: unknown;
}

/**
 * Final per-voice mix values, already in FMOD software-mixer terms:
 * the left and right speaker gains (linear amplitude) and the playback rate.
 * For stereo data `left` scales the left input channel into the left speaker
 * and `right` the right input channel into the right speaker; for mono data
 * the single channel goes to both speakers with these gains.
 */
export interface VoiceParams {
	left: number;
	right: number;
	/** Playback rate relative to the native rate (frequency / nativeRate, doppler included). */
	rate: number;
	loop: boolean;
	/**
	 * Set for positional (Load3DSound) voices: the raw inputs from which
	 * left/right were derived, for backends that spatialise themselves
	 * (WebAudioBackend's PannerNode mode). Blitz world coordinates.
	 */
	spatial: { position: Vec3; volume: number; rolloff: number } | null;
}

export interface ListenerState {
	pos: Vec3;
	forward: Vec3;
	up: Vec3;
}

export interface BackendVoice {
	set(params: VoiceParams): void;
	/** Cuts the voice immediately. Idempotent. */
	stop(): void;
}

export interface AudioBackend {
	/**
	 * Seconds on a monotonic clock that keeps running even while the output
	 * device is unavailable (suspended AudioContext). The runtime times every
	 * channel on this clock, see BlitzAudio's "muted device" note.
	 */
	now(): number;
	/** True when voices can actually be started. */
	readonly running: boolean;
	/** Called by the backend when `running` turns true. */
	onRunning: (() => void) | null;
	decode(bytes: Uint8Array): Promise<SoundData>;
	/** FSOUND_FORCEMONO: a mono version of the data ((L+R)/2). */
	toMono(data: SoundData): SoundData;
	/** Listener as of the last FSOUND_Update (only needed by self-spatialising backends). */
	setListener(listener: ListenerState): void;
	/** Starts playing `data` at `offset` seconds (native time). */
	start(data: SoundData, params: VoiceParams, offset: number): BackendVoice;
}

/* ------------------------------------------------------------------ */

export class FakeVoice implements BackendVoice {
	stopped = false;
	history: VoiceParams[] = [];
	constructor(
		readonly data: SoundData,
		public params: VoiceParams,
		readonly offset: number,
		readonly startedAt: number
	) {
		this.history.push({ ...params });
	}
	set(params: VoiceParams): void {
		this.params = { ...params };
		this.history.push(this.params);
	}
	stop(): void {
		this.stopped = true;
	}
}

/** Backend with a hand-driven clock and no output, for tests. */
export class FakeBackend implements AudioBackend {
	time = 0;
	onRunning: (() => void) | null = null;
	voices: FakeVoice[] = [];
	private _running = true;

	now(): number {
		return this.time;
	}

	advance(seconds: number): void {
		this.time += seconds;
	}

	get running(): boolean {
		return this._running;
	}

	/** Simulates the AudioContext being suspended (false) or resumed by a user gesture (true). */
	setRunning(running: boolean): void {
		const was = this._running;
		this._running = running;
		if (running && !was) this.onRunning?.();
	}

	/** Voices that have not been stopped by the runtime. */
	get live(): FakeVoice[] {
		return this.voices.filter((v) => !v.stopped);
	}

	async decode(bytes: Uint8Array): Promise<SoundData> {
		const info = parseSoundFile(bytes);
		if (!info) throw new Error('unknown sound format');
		return { duration: wavDuration(bytes) ?? 1, nativeRate: info.sampleRate, channels: info.channels, buffer: null };
	}

	listener: ListenerState | null = null;
	setListener(listener: ListenerState): void {
		this.listener = listener;
	}

	toMono(data: SoundData): SoundData {
		return data.channels === 1 ? data : { ...data, channels: 1 };
	}

	start(data: SoundData, params: VoiceParams, offset: number): BackendVoice {
		if (!this._running) throw new Error('FakeBackend.start while not running');
		const v = new FakeVoice(data, { ...params }, offset, this.time);
		this.voices.push(v);
		return v;
	}
}
