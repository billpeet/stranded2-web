/**
 * AudioBackend on the Web Audio API.
 *
 * ## Voice graph
 *
 * BlitzAudio hands over what FMOD's software mixer would use: one gain for
 * the left speaker, one for the right, and a playback rate (fmod.ts). The
 * default graph applies exactly those numbers:
 *
 *   AudioBufferSourceNode -> GainNode (up-mix mono to L=R, explicit 2 channels)
 *     -> ChannelSplitter -> GainNode left  -> ChannelMerger input 0 -> master
 *                        -> GainNode right -> ChannelMerger input 1
 *
 * 3D voices are re-evaluated by BlitzAudio.renderWorld() once per frame, the
 * moment Blitz calls FSOUND_Update, and FMOD ramps volume changes inside its
 * mix block; here each change is a short exponential glide (TAU).
 *
 * ## PannerNode mode (`spatializer: 'panner'`)
 *
 * The same 3D voices can instead be given to a PannerNode, configured so that
 * Web Audio's own formulas reproduce FMOD's (derivations in fmod.ts):
 *
 *   distanceModel  "inverse"     ref / (ref + rolloff * (max(d, ref) - ref))
 *   refDistance    1             FMOD sample min distance
 *   rolloffFactor  rolloff       CreateListener's rolloff_factor (0.02 in the game);
 *                                rolloff 0 -> "linear", rolloffFactor 1, maxDistance 1e6
 *   maxDistance    1e6           FMOD sample max distance
 *   panningModel   "equalpower"  same curve as FMOD's sqrt pan table
 *   cone           360/360/0     omnidirectional
 *   position       (x, y, -z)    Blitz/FMOD are left-handed, Web Audio right-handed;
 *   listener       forward/up with z negated as well, so +X stays "right"
 *
 * Known differences of that mode, which is why it is not the default: an
 * elevated source is panned by the azimuth of its horizontal projection
 * (FMOD uses the full direction, so sources above or below are more centred),
 * and gains are not quantised to FMOD's 1/255 steps. Doppler is not part of
 * Web Audio any more; in both modes it arrives through the playback rate.
 *
 * ## Autoplay
 *
 * The context starts suspended until a user gesture. `now()` is therefore
 * the performance clock, not AudioContext.currentTime, so BlitzAudio's
 * channel timing does not stall; see the "muted device" note in BlitzAudio.
 * `unlockOnGesture()` installs the listeners that resume the context.
 */
import type { AudioBackend, BackendVoice, ListenerState, SoundData, VoiceParams } from './backend';
import { MAX_DISTANCE, MIN_DISTANCE } from './fmod';
import { parseSoundFile } from './soundFile';
import { decodeWav, isCompressedWav } from './wavCodecs';

/** Time constant of parameter changes (seconds); about 3 of them make a 10 ms glide. */
const TAU = 0.003;

export interface WebAudioBackendOptions {
	context?: AudioContext;
	/** 'fmod' (default): exact FMOD gains; 'panner': PannerNode for 3D voices. */
	spatializer?: 'fmod' | 'panner';
}

class WebVoice implements BackendVoice {
	private stopped = false;

	constructor(
		private be: WebAudioBackend,
		private src: AudioBufferSourceNode,
		/** fmod mode: left and right gain. */
		private gains: [GainNode, GainNode] | null,
		/** panner mode: channel volume and the panner. */
		private spatial: { gain: GainNode; panner: PannerNode } | null,
		private nodes: AudioNode[]
	) {
		src.onended = () => this.dispose();
	}

	set(p: VoiceParams): void {
		if (this.stopped) return;
		const t = this.be.context.currentTime;
		const to = (param: AudioParam, v: number) => param.setTargetAtTime(v, t, TAU);
		to(this.src.playbackRate, p.rate);
		if (this.spatial && p.spatial) {
			to(this.spatial.gain.gain, p.spatial.volume);
			to(this.spatial.panner.positionX, p.spatial.position.x);
			to(this.spatial.panner.positionY, p.spatial.position.y);
			to(this.spatial.panner.positionZ, -p.spatial.position.z);
			this.be.configurePanner(this.spatial.panner, p.spatial.rolloff);
		} else if (this.gains) {
			to(this.gains[0].gain, p.left);
			to(this.gains[1].gain, p.right);
		}
	}

	stop(): void {
		if (this.stopped) return;
		try {
			this.src.stop();
		} catch {
			/* not started */
		}
		this.dispose();
	}

	private dispose(): void {
		if (this.stopped) return;
		this.stopped = true;
		this.src.onended = null;
		for (const n of this.nodes) n.disconnect();
		this.be.live.delete(this);
	}
}

export class WebAudioBackend implements AudioBackend {
	readonly context: AudioContext;
	/** Everything goes through this node; tap it for metering. */
	readonly master: GainNode;
	readonly spatializer: 'fmod' | 'panner';
	onRunning: (() => void) | null = null;
	/** Voices that currently have nodes (diagnostics). */
	readonly live = new Set<WebVoice>();
	/** Total number of voices started since creation (diagnostics). */
	started = 0;

	constructor(options: WebAudioBackendOptions = {}) {
		this.context = options.context ?? new AudioContext();
		this.spatializer = options.spatializer ?? 'fmod';
		this.master = this.context.createGain();
		this.master.connect(this.context.destination);
		this.context.addEventListener('statechange', () => {
			if (this.running) this.onRunning?.();
		});
	}

	now(): number {
		return performance.now() / 1000;
	}

	get running(): boolean {
		return this.context.state === 'running';
	}

	/** Tries to start the context now (only succeeds inside or after a user gesture). */
	async resume(): Promise<boolean> {
		try {
			await this.context.resume();
		} catch {
			/* still locked */
		}
		return this.running;
	}

	/**
	 * Resumes the context on the first pointer, key or touch event on `target`.
	 * Returns a function that removes the listeners.
	 */
	unlockOnGesture(target: EventTarget = window): () => void {
		const events = ['pointerdown', 'keydown', 'touchend', 'click'];
		const handler = () => {
			void this.resume().then((ok) => {
				if (ok) remove();
			});
		};
		const remove = () => events.forEach((e) => target.removeEventListener(e, handler, true));
		events.forEach((e) => target.addEventListener(e, handler, true));
		if (this.running) remove();
		return remove;
	}

	async decode(bytes: Uint8Array): Promise<SoundData> {
		const info = parseSoundFile(bytes);
		// MS ADPCM, IMA ADPCM and GSM 6.10 WAV files (20 in the shipped mod) are
		// not decodable by browsers; wavCodecs.ts does those.
		if (isCompressedWav(bytes)) {
			const pcm = decodeWav(bytes);
			if (!pcm || pcm.channels[0].length === 0) throw new Error('unsupported compressed WAV');
			const buffer = this.context.createBuffer(pcm.channels.length, pcm.channels[0].length, pcm.sampleRate);
			pcm.channels.forEach((c, i) => buffer.getChannelData(i).set(c));
			return { duration: buffer.duration, nativeRate: pcm.sampleRate, channels: pcm.channels.length, buffer };
		}
		// decodeAudioData detaches its argument: give it a private copy.
		const copy = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
		const buffer = await this.context.decodeAudioData(copy);
		return {
			duration: buffer.duration,
			nativeRate: info?.sampleRate || buffer.sampleRate,
			channels: buffer.numberOfChannels,
			buffer
		};
	}

	toMono(data: SoundData): SoundData {
		const src = data.buffer as AudioBuffer;
		if (src.numberOfChannels === 1) return data;
		const out = this.context.createBuffer(1, src.length, src.sampleRate);
		const o = out.getChannelData(0);
		const n = src.numberOfChannels;
		for (let c = 0; c < n; c++) {
			const ch = src.getChannelData(c);
			for (let i = 0; i < o.length; i++) o[i] += ch[i] / n;
		}
		return { ...data, channels: 1, buffer: out };
	}

	setListener(l: ListenerState): void {
		if (this.spatializer !== 'panner') return;
		const al = this.context.listener;
		const t = this.context.currentTime;
		if (al.positionX) {
			const to = (p: AudioParam, v: number) => p.setTargetAtTime(v, t, TAU);
			to(al.positionX, l.pos.x);
			to(al.positionY, l.pos.y);
			to(al.positionZ, -l.pos.z);
			to(al.forwardX, l.forward.x);
			to(al.forwardY, l.forward.y);
			to(al.forwardZ, -l.forward.z);
			to(al.upX, l.up.x);
			to(al.upY, l.up.y);
			to(al.upZ, -l.up.z);
		} else {
			// Firefox before 2024
			al.setPosition(l.pos.x, l.pos.y, -l.pos.z);
			al.setOrientation(l.forward.x, l.forward.y, -l.forward.z, l.up.x, l.up.y, -l.up.z);
		}
	}

	configurePanner(p: PannerNode, rolloff: number): void {
		const model: DistanceModelType = rolloff === 0 ? 'linear' : 'inverse';
		if (p.distanceModel !== model) p.distanceModel = model;
		const factor = rolloff === 0 ? 1 : rolloff;
		if (p.rolloffFactor !== factor) p.rolloffFactor = factor;
	}

	start(data: SoundData, p: VoiceParams, offset: number): BackendVoice {
		const ctx = this.context;
		const buffer = data.buffer as AudioBuffer;
		const src = ctx.createBufferSource();
		src.buffer = buffer;
		src.loop = p.loop;
		src.playbackRate.value = p.rate;

		const nodes: AudioNode[] = [src];
		let gains: [GainNode, GainNode] | null = null;
		let spatial: { gain: GainNode; panner: PannerNode } | null = null;

		if (p.spatial && this.spatializer === 'panner') {
			const gain = ctx.createGain();
			gain.gain.value = p.spatial.volume;
			const panner = ctx.createPanner();
			panner.panningModel = 'equalpower';
			panner.refDistance = MIN_DISTANCE;
			panner.maxDistance = MAX_DISTANCE;
			panner.coneInnerAngle = 360;
			panner.coneOuterAngle = 360;
			panner.coneOuterGain = 0;
			this.configurePanner(panner, p.spatial.rolloff);
			panner.positionX.value = p.spatial.position.x;
			panner.positionY.value = p.spatial.position.y;
			panner.positionZ.value = -p.spatial.position.z;
			src.connect(gain).connect(panner).connect(this.master);
			nodes.push(gain, panner);
			spatial = { gain, panner };
		} else {
			const up = ctx.createGain();
			up.channelCount = 2;
			up.channelCountMode = 'explicit';
			up.channelInterpretation = 'speakers';
			const split = ctx.createChannelSplitter(2);
			const merge = ctx.createChannelMerger(2);
			const gl = ctx.createGain();
			const gr = ctx.createGain();
			gl.gain.value = p.left;
			gr.gain.value = p.right;
			src.connect(up).connect(split);
			split.connect(gl, 0).connect(merge, 0, 0);
			split.connect(gr, 1).connect(merge, 0, 1);
			merge.connect(this.master);
			nodes.push(up, split, gl, gr, merge);
			gains = [gl, gr];
		}

		const voice = new WebVoice(this, src, gains, spatial, nodes);
		this.live.add(voice);
		this.started++;
		// `offset` is in seconds of the buffer, which is what start() expects;
		// for a loop it may be anywhere inside the buffer.
		src.start(0, Math.min(Math.max(0, offset), Math.max(0, buffer.duration - 1e-4)));
		return voice;
	}

	/**
	 * Stereo level meter on the master output: RMS of the most recent
	 * `fftSize` samples per side. Used by the dev page and for verification.
	 */
	createMeter(fftSize = 2048): { left(): number; right(): number; dispose(): void } {
		const split = this.context.createChannelSplitter(2);
		const a = [this.context.createAnalyser(), this.context.createAnalyser()];
		const tap = this.context.createGain();
		tap.channelCount = 2;
		tap.channelCountMode = 'explicit';
		this.master.connect(tap).connect(split);
		a.forEach((an, i) => {
			an.fftSize = fftSize;
			split.connect(an, i);
		});
		const buf = new Float32Array(fftSize);
		const rms = (an: AnalyserNode) => {
			an.getFloatTimeDomainData(buf);
			let s = 0;
			for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
			return Math.sqrt(s / buf.length);
		};
		return {
			left: () => rms(a[0]),
			right: () => rms(a[1]),
			dispose: () => {
				this.master.disconnect(tap);
				tap.disconnect();
				split.disconnect();
			}
		};
	}
}
