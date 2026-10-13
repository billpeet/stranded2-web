import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	BlitzAudio,
	Cres_music,
	Cres_sound,
	FSOUND_STEREOPAN,
	FakeBackend,
	PAN_TABLE,
	S2Audio,
	attenuation,
	decodeWav,
	isCompressedWav,
	bbInt,
	dopplerRate,
	fmodPan,
	fmodVolume,
	mix3d,
	pan3d,
	parseSoundFile,
	path$,
	pitchRate,
	snd_attack,
	snd_die,
	snd_idle1,
	snd_move,
	snd_spot,
	speakerGains,
	wavDuration,
	type AudioFiles,
	type ListenerEntity,
	type SoundData,
	type Vec3
} from '../src/lib/s2/audio';
import { NodeVfs } from './NodeVfs';

/** The 256 bytes at 0x10124124 of StrandedII.exe (FMOD 3.75 pan table). */
// prettier-ignore
const EXE_PAN_TABLE = [0, 16, 22, 27, 32, 35, 39, 42, 45, 48, 50, 53, 55, 57, 59, 61, 64, 65, 67, 69, 71, 73, 75, 76, 78, 80, 81, 83, 84, 86, 87, 89, 90, 91, 93, 94, 96, 97, 98, 99, 101, 102, 103, 104, 106, 107, 108, 109, 110, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125, 126, 128, 128, 129, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139, 140, 141, 142, 143, 144, 144, 145, 146, 147, 148, 149, 150, 150, 151, 152, 153, 154, 155, 155, 156, 157, 158, 159, 160, 160, 161, 162, 163, 163, 164, 165, 166, 167, 167, 168, 169, 170, 170, 171, 172, 173, 173, 174, 175, 176, 176, 177, 178, 178, 179, 180, 181, 181, 182, 183, 183, 184, 185, 185, 186, 187, 187, 188, 189, 189, 190, 191, 192, 192, 193, 193, 194, 195, 195, 196, 197, 197, 198, 199, 199, 200, 201, 201, 202, 203, 203, 204, 204, 205, 206, 206, 207, 208, 208, 209, 209, 210, 211, 211, 212, 212, 213, 214, 214, 215, 215, 216, 217, 217, 218, 218, 219, 219, 220, 221, 221, 222, 222, 223, 224, 224, 225, 225, 226, 226, 227, 227, 228, 229, 229, 230, 230, 231, 231, 232, 232, 233, 234, 234, 235, 235, 236, 236, 237, 237, 238, 238, 239, 240, 240, 241, 241, 242, 242, 243, 243, 244, 244, 245, 245, 246, 246, 247, 247, 248, 248, 249, 249, 250, 250, 251, 251, 252, 252, 253, 253, 254, 254, 255];

const V = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const AHEAD = { pos: V(0, 0, 0), forward: V(0, 0, 1), up: V(0, 1, 0) };
const GAME = { rolloff: 0.02, doppler: 1, distance: 1 };

class MemFiles implements AudioFiles {
	files = new Map<string, Uint8Array>();
	add(path: string, text = ''): void {
		this.files.set(path.toLowerCase(), new TextEncoder().encode(text));
	}
	exists(path: string): boolean {
		return this.files.has(path.replaceAll('/', '\\').toLowerCase());
	}
	list(dir: string): string[] {
		const prefix = dir.replaceAll('/', '\\').toLowerCase() + '\\';
		return [...this.files.keys()]
			.filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes('\\'))
			.map((k) => k.slice(prefix.length));
	}
	async readBytes(path: string): Promise<Uint8Array> {
		const b = this.files.get(path.replaceAll('/', '\\').toLowerCase());
		if (!b) throw new Error('missing ' + path);
		return b;
	}
}

const snd = (duration: number, channels = 1, nativeRate = 44100): SoundData => ({
	duration,
	channels,
	nativeRate,
	buffer: null
});

class Ent implements ListenerEntity {
	pos = V(0, 0, 0);
	forward = V(0, 0, 1);
	up = V(0, 1, 0);
	hidden = false;
	worldPosition = () => this.pos;
	worldForward = () => this.forward;
	worldUp = () => this.up;
	audible = () => !this.hidden;
}

function rig(sounds: Record<string, SoundData> = {}) {
	const be = new FakeBackend();
	const files = new MemFiles();
	const bb = new BlitzAudio(be, files);
	for (const [p, d] of Object.entries(sounds)) {
		files.add(p);
		bb.provide(p, d);
	}
	return { be, files, bb };
}

/** A minimal PCM WAV file. */
function wav(rate: number, channels: number, dataBytes: number): Uint8Array {
	const b = new Uint8Array(44 + dataBytes);
	const dv = new DataView(b.buffer);
	const txt = (s: string, o: number) => b.set(new TextEncoder().encode(s), o);
	txt('RIFF', 0);
	txt('WAVEfmt ', 8);
	dv.setUint32(16, 16, true);
	dv.setUint16(20, 1, true);
	dv.setUint16(22, channels, true);
	dv.setUint32(24, rate, true);
	dv.setUint32(28, rate * channels * 2, true);
	txt('data', 36);
	dv.setUint32(40, dataBytes, true);
	return b;
}

describe('FMOD 3.75 mapping (fmod.ts)', () => {
	it('pan table formula equals the bytes in the executable', () => {
		expect([...PAN_TABLE]).toEqual(EXE_PAN_TABLE);
	});

	it('volume: FSOUND_SetVolume(volume*255.0f), truncated and clamped', () => {
		expect(fmodVolume(1)).toBe(255);
		expect(fmodVolume(0.5)).toBe(127);
		expect(fmodVolume(0.7)).toBe(178);
		expect(fmodVolume(0.1)).toBe(25);
		expect(fmodVolume(0)).toBe(0);
		expect(fmodVolume(3)).toBe(255);
		expect(fmodVolume(-1)).toBe(0);
	});

	it('pan: FSOUND_SetPan((pan+1)*127.5f); Blitz centre is 127, not 128', () => {
		expect(fmodPan(-1)).toBe(0);
		expect(fmodPan(0)).toBe(127);
		expect(fmodPan(1)).toBe(255);
		expect(fmodPan(0.5)).toBe(191);
		expect(fmodPan(9)).toBe(255);
	});

	it('speaker gains: square-root table, integer maths, STEREOPAN bypass', () => {
		expect(speakerGains(255, 128)).toEqual({ left: 180 / 255, right: 181 / 255 });
		expect(speakerGains(255, 127)).toEqual({ left: 181 / 255, right: 180 / 255 });
		expect(speakerGains(255, 0)).toEqual({ left: 1, right: 0 });
		expect(speakerGains(255, 255)).toEqual({ left: 0, right: 1 });
		expect(speakerGains(255, FSOUND_STEREOPAN)).toEqual({ left: 1, right: 1 });
		expect(speakerGains(127, FSOUND_STEREOPAN)).toEqual({ left: 127 / 255, right: 127 / 255 });
		// v = 127*255/255 = 127; L = 180*127/255 = 89 (truncated)
		expect(speakerGains(127, 128)).toEqual({ left: 89 / 255, right: 90 / 255 });
		// 3D volume multiplies the channel volume first: v = 127*200/255 = 99
		expect(speakerGains(200, 255, 127)).toEqual({ left: 0, right: 99 / 255 });
		// constant power: L^2 + R^2 stays near 1 across the pan range
		for (let p = 0; p <= 255; p += 5) {
			const g = speakerGains(255, p);
			expect(g.left ** 2 + g.right ** 2).toBeGreaterThan(0.97);
			expect(g.left ** 2 + g.right ** 2).toBeLessThan(1.01);
		}
	});

	it('pitch: hertz over native rate, clamped to 100..705600 Hz', () => {
		expect(pitchRate(44100, 44100)).toBe(1);
		expect(pitchRate(22050, 44100)).toBe(0.5);
		expect(pitchRate(44100, 22050)).toBe(2);
		expect(pitchRate(10, 44100)).toBe(100 / 44100);
		expect(pitchRate(9e9, 44100)).toBe(705600 / 44100);
		expect(pitchRate(22050, 22050, 0.5)).toBe(0.5);
	});

	it('attenuation with the game rolloff 0.02: min / (min + rolloff*(d-min))', () => {
		// [distance, expected 0..255 3D volume]
		const cases: [number, number][] = [
			[0, 255],
			[0.5, 255],
			[1, 255],
			[2, 250], // 1/1.02
			[11, 212], // 1/1.2 -> 212.5
			[26, 170], // 1/1.5
			[51, 127], // 1/2
			[101, 85], // 1/3
			[201, 51], // 1/5
			[451, 25], // 1/10
			[1001, 12], // 1/21
			[5001, 2] // 1/101
		];
		for (const [d, want] of cases) expect(attenuation(d, 0.02), `d=${d}`).toBe(want);
	});

	it('attenuation with default rolloff 1 is min/d; rolloff 0 is linear; max distance freezes', () => {
		expect(attenuation(2, 1)).toBe(127);
		expect(attenuation(10, 1)).toBe(25);
		expect(attenuation(100, 1)).toBe(2);
		expect(attenuation(500000.5, 0)).toBe(127);
		expect(attenuation(1, 0)).toBe(255);
		expect(attenuation(2e6, 0)).toBe(0);
		expect(attenuation(1e6, 0.02)).toBe(attenuation(5e6, 0.02));
		expect(attenuation(1e6, 1)).toBe(0);
		expect(attenuation(1000, 0.02)).toBe(Math.trunc(255 / (1 + 0.02 * 999)));
	});

	it('attenuation equals the Web Audio "inverse" distance model within one 1/255 step', () => {
		const webAudioInverse = (d: number, ref: number, rolloff: number) =>
			ref / (ref + rolloff * (Math.max(d, ref) - ref));
		for (const rolloff of [0.02, 0.5, 1, 3]) {
			for (const d of [0, 0.3, 1, 1.5, 7, 51, 300, 2500, 90000]) {
				const web = webAudioInverse(d, 1, rolloff);
				expect(Math.abs(attenuation(d, rolloff) / 255 - web)).toBeLessThan(1 / 255);
			}
		}
	});

	it('3D pan: 128 + 128*dot(right, direction), right = up x forward', () => {
		expect(pan3d(V(10, 0, 0), AHEAD)).toBe(255); // right, 256 clamped
		expect(pan3d(V(-10, 0, 0), AHEAD)).toBe(0); // left
		expect(pan3d(V(0, 0, 10), AHEAD)).toBe(128); // ahead
		expect(pan3d(V(0, 0, -10), AHEAD)).toBe(128); // behind: same as ahead
		expect(pan3d(V(0, 10, 0), AHEAD)).toBe(128); // above
		expect(pan3d(V(0, 0, 0), AHEAD)).toBe(128); // at the listener
		expect(pan3d(V(5, 0, 5), AHEAD)).toBe(128 + 90); // 45 degrees right: ftol(128*0.7071)=90
		expect(pan3d(V(-5, 0, -5), AHEAD)).toBe(128 - 90);
		// almost overhead, slightly right: nearly centred (Web Audio would say hard right)
		expect(pan3d(V(1, 20, 0), AHEAD)).toBe(128 + 6);
		// listener turned 90 degrees to the right (forward = +X): a source at +Z is now on the left
		expect(pan3d(V(0, 0, 10), { pos: V(0, 0, 0), forward: V(1, 0, 0), up: V(0, 1, 0) })).toBe(0);
	});

	it('3D pan through the table equals Web Audio equal-power panning in the horizontal plane', () => {
		for (let az = -180; az <= 180; az += 15) {
			const a = (az * Math.PI) / 180;
			const g = mix3d(255, V(Math.sin(a), 0, Math.cos(a)), AHEAD, { rolloff: 1, doppler: 1, distance: 1 });
			// Web Audio: fold behind to front, x = (az+90)/180, L = cos(x*pi/2), R = sin(x*pi/2)
			let f = az;
			if (f < -90) f = -180 - f;
			else if (f > 90) f = 180 - f;
			const x = (f + 90) / 180;
			expect(Math.abs(g.left - Math.cos((x * Math.PI) / 2)), `L az=${az}`).toBeLessThan(0.03);
			expect(Math.abs(g.right - Math.sin((x * Math.PI) / 2)), `R az=${az}`).toBeLessThan(0.03);
		}
	});

	it('mix3d combines attenuation, pan and channel volume', () => {
		// 51 units to the right, full volume: vol3d 127, pan 255
		expect(mix3d(255, V(51, 0, 0), AHEAD, GAME)).toMatchObject({ vol3d: 127, pan: 255, left: 0, right: 127 / 255 });
		// same distance ahead: both speakers, 180*127/255 = 89, 181*127/255 = 90
		expect(mix3d(255, V(0, 0, 51), AHEAD, GAME)).toMatchObject({
			vol3d: 127,
			pan: 128,
			left: 89 / 255,
			right: 90 / 255
		});
		// at the listener
		expect(mix3d(255, V(0, 0, 0), AHEAD, GAME)).toMatchObject({
			vol3d: 255,
			pan: 128,
			left: 180 / 255,
			right: 181 / 255
		});
	});

	it('doppler: (S - (d - dPrev)*factor) / S with S = 340*distanceFactor', () => {
		const o = { rolloff: 1, doppler: 1, distance: 1 };
		const Z = V(0, 0, 0);
		expect(dopplerRate(V(0, 0, 100), Z, Z, Z, o)).toBe(1);
		// source receding at 34 units per tick: d=100, dPrev=66
		expect(dopplerRate(V(0, 0, 100), V(0, 0, 34), Z, Z, o)).toBeCloseTo(0.9, 10);
		// approaching
		expect(dopplerRate(V(0, 0, 100), V(0, 0, -34), Z, Z, o)).toBeCloseTo(1.1, 10);
		// listener moving along with the source: no shift
		expect(dopplerRate(V(0, 0, 100), V(0, 0, 34), Z, V(0, 0, 34), o)).toBeCloseTo(1, 10);
		// distance factor scales the speed of sound, doppler factor the shift
		expect(dopplerRate(V(0, 0, 100), V(0, 0, 34), Z, Z, { ...o, distance: 2 })).toBeCloseTo(0.95, 10);
		expect(dopplerRate(V(0, 0, 100), V(0, 0, 34), Z, Z, { ...o, doppler: 2 })).toBeCloseTo(0.8, 10);
		expect(dopplerRate(V(0, 0, 100), V(0, 0, 34), Z, Z, { ...o, doppler: 0 })).toBe(1);
		// a teleport faster than sound bottoms out
		expect(dopplerRate(V(0, 0, 1000), V(0, 0, 1000), Z, Z, o)).toBe(1e-5);
	});
});

describe('sound file headers', () => {
	it('reads rate, channels and length from a WAV header', () => {
		const b = wav(22050, 1, 44100);
		expect(parseSoundFile(b)).toEqual({ format: 'wav', sampleRate: 22050, channels: 1 });
		expect(wavDuration(b)).toBe(1);
		expect(parseSoundFile(new Uint8Array(64))).toBeNull();
	});

	it.skipIf(!existsSync(resolve('static/game/mod/sfx')))('reads the shipped wav, ogg and mp3 files', async () => {
		const vfs = new NodeVfs(resolve('static/game/mod'));
		expect(parseSoundFile(await vfs.readBytes('sfx\\dive.wav'))).toMatchObject({ format: 'wav' });
		// some ".wav" files are MP3 data; FMOD and the browser both go by content
		expect(parseSoundFile(await vfs.readBytes('sfx\\click.wav'))).toMatchObject({ format: 'mp3' });
		expect(parseSoundFile(await vfs.readBytes('sfx\\speech\\negative1.ogg'))).toMatchObject({ format: 'ogg' });
		expect(parseSoundFile(await vfs.readBytes('sfx\\music_menu.mp3'))).toMatchObject({ format: 'mp3' });
		for (const dir of ['sfx', 'sfx\\speech']) {
			for (const name of vfs.list(dir).filter((n) => /\.(wav|ogg|mp3)$/i.test(n))) {
				const info = parseSoundFile(await vfs.readBytes(`${dir}\\${name}`));
				expect(info, name).not.toBeNull();
				expect(info!.sampleRate >= 4000 && info!.sampleRate <= 48000, name).toBe(true);
				expect([1, 2], name).toContain(info!.channels);
			}
		}
	});
});

describe('BlitzAudio: loading and channels', () => {
	it('Load* return 0 for missing files and non-zero handles otherwise', () => {
		const { bb, files } = rig({ 'sfx\\a.wav': snd(1) });
		expect(bb.LoadSound('sfx\\nope.wav')).toBe(0);
		files.add('sfx\\exists_but_not_preloaded.wav');
		expect(bb.LoadSound('sfx\\exists_but_not_preloaded.wav')).toBe(0);
		const a = bb.LoadSound('sfx\\a.wav');
		const b = bb.LoadSound('SFX/A.WAV');
		expect(a).not.toBe(0);
		expect(b).not.toBe(0);
		expect(b).not.toBe(a); // every load is its own sample, as in Blitz
		expect(bb.PlaySound(0)).toBe(0);
		expect(bb.ChannelPlaying(0)).toBe(0);
	});

	it('preload decodes through the backend; undecodable files load as 0', async () => {
		const { bb, files } = rig();
		files.files.set('sfx\\ok.wav', wav(11025, 2, 44100));
		files.add('sfx\\bad.wav', 'not a sound');
		files.add('sfx\\readme.inf', 'x');
		const bad = await bb.preload('all');
		expect(bad).toEqual(['sfx\\bad.wav']);
		expect(bb.LoadSound('sfx\\bad.wav')).toBe(0);
		const s2d = bb.LoadSound('sfx\\ok.wav');
		const s3d = bb.Load3DSound('sfx\\ok.wav');
		expect(bb.soundInfo(s2d)).toMatchObject({ channels: 2, nativeRate: 11025, duration: 1, is3d: false });
		// Load3DSound: FSOUND_FORCEMONO
		expect(bb.soundInfo(s3d)).toMatchObject({ channels: 1, is3d: true });
		expect(await bb.ensureLoaded('sfx\\missing.wav')).toBe(false);
	});

	it('ChannelPlaying lifecycle; the handle stays valid after the sound ends', () => {
		const { bb, be } = rig({ 'a.wav': snd(1) });
		const s = bb.LoadSound('a.wav');
		const c = bb.PlaySound(s);
		expect(c).toBe(1);
		expect(bb.ChannelPlaying(c)).toBe(1);
		be.advance(0.99);
		expect(bb.ChannelPlaying(c)).toBe(1);
		be.advance(0.02);
		expect(bb.ChannelPlaying(c)).toBe(0);
		// all of these are no-ops on a finished channel
		bb.ChannelVolume(c, 0.5);
		bb.ChannelPan(c, 1);
		bb.ChannelPitch(c, 8000);
		bb.PauseChannel(c);
		bb.ResumeChannel(c);
		bb.StopChannel(c);
		expect(bb.ChannelPlaying(c)).toBe(0);
		expect(be.voices.length).toBe(1);
		expect(be.voices[0].history.length).toBe(1);
		// a finished voice is left to end by itself, not cut
		expect(be.voices[0].stopped).toBe(false);
	});

	it('StopChannel, PauseChannel (still "playing") and ResumeChannel at the same offset', () => {
		const { bb, be } = rig({ 'a.wav': snd(2) });
		const s = bb.LoadSound('a.wav');
		const c = bb.PlaySound(s);
		be.advance(0.5);
		bb.PauseChannel(c);
		expect(be.voices[0].stopped).toBe(true);
		be.advance(60);
		expect(bb.ChannelPlaying(c)).toBe(1);
		bb.ResumeChannel(c);
		expect(be.voices.length).toBe(2);
		expect(be.voices[1].offset).toBeCloseTo(0.5, 9);
		be.advance(1.4);
		expect(bb.ChannelPlaying(c)).toBe(1);
		be.advance(0.2);
		expect(bb.ChannelPlaying(c)).toBe(0);

		const c2 = bb.PlaySound(s);
		bb.StopChannel(c2);
		expect(bb.ChannelPlaying(c2)).toBe(0);
		expect(be.voices[2].stopped).toBe(true);
	});

	it('volume, pan and pitch reach the voice with the FMOD mapping', () => {
		const { bb, be } = rig({ 'mono.wav': snd(1, 1, 22050), 'stereo.wav': snd(1, 2) });
		const mono = bb.LoadSound('mono.wav');
		const stereo = bb.LoadSound('stereo.wav');

		const c = bb.PlaySound(mono);
		// mono default: volume 255, pan 128
		expect(be.voices[0].params).toMatchObject({
			left: 180 / 255,
			right: 181 / 255,
			rate: 1,
			loop: false,
			spatial: null
		});
		bb.ChannelVolume(c, 0.5);
		expect(be.voices[0].params).toMatchObject({ left: 89 / 255, right: 90 / 255 });
		bb.ChannelPan(c, -1);
		expect(be.voices[0].params).toMatchObject({ left: 127 / 255, right: 0 });
		bb.ChannelPan(c, 1);
		expect(be.voices[0].params).toMatchObject({ left: 0, right: 127 / 255 });
		bb.ChannelPitch(c, 44100);
		expect(be.voices[0].params.rate).toBe(2);

		// stereo default: FSOUND_STEREOPAN, both sides full
		const d = bb.PlaySound(stereo);
		expect(be.voices[1].params).toMatchObject({ left: 1, right: 1 });
		bb.ChannelVolume(d, 0.2);
		expect(be.voices[1].params).toMatchObject({ left: 51 / 255, right: 51 / 255 });
		// an explicit pan replaces STEREOPAN: centre now costs 3 dB
		bb.ChannelVolume(d, 1);
		bb.ChannelPan(d, 0);
		expect(be.voices[1].params).toMatchObject({ left: 181 / 255, right: 180 / 255 });
	});

	it('ChannelPitch changes how long the channel plays', () => {
		const { bb, be } = rig({ 'a.wav': snd(1, 1, 22050) });
		const c = bb.PlaySound(bb.LoadSound('a.wav'));
		be.advance(0.5);
		bb.ChannelPitch(c, 44100); // twice as fast: 0.25 s left
		be.advance(0.24);
		expect(bb.ChannelPlaying(c)).toBe(1);
		be.advance(0.02);
		expect(bb.ChannelPlaying(c)).toBe(0);
	});

	it('SoundVolume/SoundPan/SoundPitch are defaults for later plays only', () => {
		const { bb, be } = rig({ 'a.wav': snd(1, 1, 22050) });
		const s = bb.LoadSound('a.wav');
		bb.PlaySound(s);
		bb.SoundVolume(s, 0.5);
		bb.SoundPan(s, 1);
		bb.SoundPitch(s, 11025);
		expect(be.voices[0].params).toMatchObject({ left: 180 / 255, right: 181 / 255, rate: 1 });
		bb.PlaySound(s);
		expect(be.voices[1].params).toMatchObject({ left: 0, right: 127 / 255, rate: 0.5 });
	});

	it('LoopSound: later plays loop until stopped', () => {
		const { bb, be } = rig({ 'a.wav': snd(1) });
		const s = bb.LoadSound('a.wav');
		const once = bb.PlaySound(s);
		bb.LoopSound(s);
		const loop = bb.PlaySound(s);
		expect(be.voices[0].params.loop).toBe(false);
		expect(be.voices[1].params.loop).toBe(true);
		be.advance(10.25);
		expect(bb.ChannelPlaying(once)).toBe(0);
		expect(bb.ChannelPlaying(loop)).toBe(1);
		expect(bb.inspect(loop)!.cursor).toBeCloseTo(0.25, 9);
		bb.StopChannel(loop);
		expect(bb.ChannelPlaying(loop)).toBe(0);
	});

	it('FreeSound silences the channels playing the sample and invalidates the handle', () => {
		const { bb, be } = rig({ 'a.wav': snd(5) });
		const s = bb.LoadSound('a.wav');
		const other = bb.LoadSound('a.wav');
		const c1 = bb.PlaySound(s);
		const c2 = bb.PlaySound(other);
		bb.FreeSound(s);
		expect(bb.ChannelPlaying(c1)).toBe(0);
		expect(bb.ChannelPlaying(c2)).toBe(1);
		expect(be.voices[0].stopped).toBe(true);
		expect(bb.PlaySound(s)).toBe(0);
		bb.FreeSound(s);
		bb.FreeSound(0);
	});

	it('channel handles come from a ring of 4096 slots and are recycled when not playing', () => {
		const { bb, be } = rig({ 'short.wav': snd(0.1), 'long.wav': snd(1000) });
		const short = bb.LoadSound('short.wav');
		const long = bb.LoadSound('long.wav');
		const first = bb.PlaySound(short); // slot 1, finishes
		const second = bb.PlaySound(long); // slot 2, keeps playing
		expect([first, second]).toEqual([1, 2]);
		for (let i = 3; i <= 4096; i++) expect(bb.PlaySound(short)).toBe(i);
		be.advance(0.2);
		expect(bb.ChannelPlaying(first)).toBe(0);
		// the ring wraps: slot 1 is free and now carries the new sound
		const again = bb.PlaySound(long);
		expect(again).toBe(first);
		expect(bb.ChannelPlaying(first)).toBe(1);
		// slot 2 is still playing and is skipped
		expect(bb.PlaySound(short)).toBe(3);
		bb.StopChannel(first);
		expect(bb.ChannelPlaying(again)).toBe(0);
	});

	it('the ring doubles when every slot is playing', () => {
		const { bb } = rig({ 'long.wav': snd(1000) });
		const long = bb.LoadSound('long.wav');
		for (let i = 1; i <= 4096; i++) bb.PlaySound(long);
		expect(bb.PlaySound(long)).toBe(4097);
		expect(bb.PlaySound(long)).toBe(4098);
		expect(bb.playingCount).toBe(4098);
	});

	it('PlayMusic: one channel per file, replay restarts it, never loops', () => {
		const { bb, be } = rig({ 'music.mp3': snd(3, 2) });
		const m = bb.PlayMusic('music.mp3');
		expect(m).not.toBe(0);
		expect(be.voices[0].params).toMatchObject({ left: 1, right: 1, loop: false });
		bb.ChannelVolume(m, 0.5);
		expect(be.voices[0].params.left).toBe(127 / 255);
		be.advance(1);
		expect(bb.PlayMusic('MUSIC.MP3')).toBe(m);
		expect(be.voices[0].stopped).toBe(true);
		expect(be.voices[1].offset).toBe(0);
		be.advance(3.1);
		expect(bb.ChannelPlaying(m)).toBe(0);
		expect(bb.PlayMusic('nope.mp3')).toBe(0);
		expect(bb.PlayMusic('song.mod')).toBe(0);
	});
});

describe('BlitzAudio: suspended output behaves like a muted device', () => {
	it('channels run on the clock; survivors become audible at their offset on resume', () => {
		const { bb, be } = rig({ 'short.wav': snd(0.3), 'long.wav': snd(2), 'loop.wav': snd(1) });
		be.setRunning(false);
		const loopSnd = bb.LoadSound('loop.wav');
		bb.LoopSound(loopSnd);
		const short = bb.PlaySound(bb.LoadSound('short.wav'));
		const long = bb.PlaySound(bb.LoadSound('long.wav'));
		const loop = bb.PlaySound(loopSnd);
		expect(be.voices.length).toBe(0);
		expect([bb.ChannelPlaying(short), bb.ChannelPlaying(long), bb.ChannelPlaying(loop)]).toEqual([1, 1, 1]);
		bb.ChannelVolume(long, 0.5);
		be.advance(1.25);
		expect(bb.ChannelPlaying(short)).toBe(0);
		expect(bb.ChannelPlaying(long)).toBe(1);

		be.setRunning(true); // user gesture
		expect(be.voices.length).toBe(2); // the short one is never heard
		const [vLong, vLoop] = be.voices;
		expect(vLong.offset).toBeCloseTo(1.25, 9);
		expect(vLong.params.left).toBe(89 / 255);
		expect(vLoop.offset).toBeCloseTo(0.25, 9);
		expect(vLoop.params.loop).toBe(true);
		be.advance(0.8);
		expect(bb.ChannelPlaying(long)).toBe(0);
		expect(bb.ChannelPlaying(loop)).toBe(1);
	});
});

describe('BlitzAudio: 3D', () => {
	function rig3d() {
		const r = rig({ 'sfx\\roar.wav': snd(100, 2), 'sfx\\flat.wav': snd(100, 2) });
		const cam = new Ent();
		r.bb.CreateListener(cam, 0.02, 1, 1);
		const roar = r.bb.Load3DSound('sfx\\roar.wav');
		return { ...r, cam, roar };
	}

	it('CreateListener defaults are 1,1,1 and the rolloff factor is clamped to 0..10', () => {
		const { bb } = rig();
		bb.CreateListener(null);
		expect(bb.state3d.options).toEqual({ rolloff: 1, doppler: 1, distance: 1 });
		bb.CreateListener(null, 50, 2, 3);
		expect(bb.state3d.options).toEqual({ rolloff: 10, doppler: 2, distance: 3 });
	});

	it('EmitSound attenuates by distance and pans by side', () => {
		const { bb, be, roar } = rig3d();
		const at = (x: number, y: number, z: number) => {
			const e = new Ent();
			e.pos = V(x, y, z);
			bb.EmitSound(roar, e);
			return be.voices[be.voices.length - 1].params;
		};
		expect(at(0, 0, 0)).toMatchObject({ left: 180 / 255, right: 181 / 255 });
		expect(at(0, 0, 51)).toMatchObject({ left: 89 / 255, right: 90 / 255 });
		expect(at(0, 0, 451)).toMatchObject({ left: 17 / 255, right: 17 / 255 });
		expect(at(51, 0, 0)).toMatchObject({ left: 0, right: 127 / 255 });
		expect(at(-51, 0, 0)).toMatchObject({ left: 127 / 255, right: 0 });
		const p = at(-51, 0, 0);
		expect(p.spatial).toEqual({ position: V(-51, 0, 0), volume: 1, rolloff: 0.02 });
	});

	it('update() follows a moving emitter and the listener', () => {
		const { bb, be, cam, roar } = rig3d();
		const e = new Ent();
		e.pos = V(0, 0, 51);
		const c = bb.EmitSound(roar, e);
		const v = be.voices[0];
		expect(v.params).toMatchObject({ left: 89 / 255, right: 90 / 255 });

		e.pos = V(51, 0, 0);
		expect(v.params.right).toBe(90 / 255); // nothing changes until the frame update
		bb.update();
		bb.update(); // second frame: emitter at rest again, no doppler
		expect(v.params).toMatchObject({ left: 0, right: 127 / 255, rate: 1 });

		// the listener turns to face the emitter (+X): centred
		cam.forward = V(1, 0, 0);
		bb.update();
		expect(v.params).toMatchObject({ left: 89 / 255, right: 90 / 255 });
		// facing -Z, the emitter at +X is on the left
		cam.forward = V(0, 0, -1);
		bb.update();
		expect(v.params).toMatchObject({ left: 127 / 255, right: 0 });

		// the listener walks up to the emitter
		cam.forward = V(0, 0, 1);
		cam.pos = V(51, 0, 0);
		bb.update();
		bb.update();
		expect(v.params).toMatchObject({ left: 180 / 255, right: 181 / 255 });
		// ChannelVolume still applies, ChannelPan does not stick on a 3D sample
		bb.ChannelVolume(c, 0.5);
		bb.ChannelPan(c, 1);
		expect(v.params).toMatchObject({ left: 89 / 255, right: 90 / 255 });
	});

	it('doppler comes from per-tick velocities and is folded into the rate', () => {
		const { bb, be, roar } = rig3d();
		const e = new Ent();
		e.pos = V(0, 0, 100);
		bb.EmitSound(roar, e);
		const v = be.voices[0];
		expect(v.params.rate).toBe(1);
		e.pos = V(0, 0, 134); // 34 units in one tick, away from the listener
		bb.update();
		expect(v.params.rate).toBeCloseTo(0.9, 3);
		e.pos = V(0, 0, 151); // 17 units in a tick of elapsed 0.5: same velocity
		bb.update(0.5);
		expect(v.params.rate).toBeCloseTo(0.9, 3);
		bb.update();
		expect(v.params.rate).toBe(1);
	});

	it('an entity may supply its own velocity', () => {
		const { bb, be, roar } = rig3d();
		const e = Object.assign(new Ent(), { worldVelocity: () => V(0, 0, -34) });
		e.pos = V(0, 0, 100);
		bb.EmitSound(roar, e);
		bb.update();
		expect(be.voices[0].params.rate).toBeCloseTo(1.1, 3);
	});

	it('hidden emitters are not updated; FreeEntity leaves the sound where it was', () => {
		const { bb, be, roar } = rig3d();
		const e = new Ent();
		e.pos = V(0, 0, 51);
		const c = bb.EmitSound(roar, e);
		const v = be.voices[0];
		e.hidden = true;
		e.pos = V(0, 0, 0);
		bb.update();
		expect(v.params.left).toBe(89 / 255);
		e.hidden = false;
		bb.update();
		bb.update();
		expect(v.params.left).toBe(180 / 255);

		e.pos = V(0, 0, 51);
		bb.FreeEntity(e); // final updateSounds with zero velocity
		bb.update();
		expect(v.params).toMatchObject({ left: 89 / 255, rate: 1 });
		e.pos = V(0, 0, 0);
		bb.update();
		expect(v.params.left).toBe(89 / 255);
		expect(bb.ChannelPlaying(c)).toBe(1);
	});

	it('PlaySound on a Load3DSound sample pins it where the listener was', () => {
		const { bb, be, cam, roar } = rig3d();
		cam.pos = V(1000, 20, -300);
		bb.update();
		bb.update();
		bb.PlaySound(roar);
		const v = be.voices[0];
		// starts at full volume, centred, wherever the listener is
		expect(v.params).toMatchObject({ left: 180 / 255, right: 181 / 255, rate: 1 });
		// walking 50 units forward leaves it behind at about half volume (1/1.98)
		cam.pos = V(1000, 20, -250);
		bb.update();
		bb.update();
		expect(v.params).toMatchObject({ left: 90 / 255, right: 90 / 255 });
		// stepping 51 units to the right of the spot puts it hard left
		cam.pos = V(1051, 20, -300);
		bb.update();
		bb.update();
		expect(v.params).toMatchObject({ left: 127 / 255, right: 0 });
	});

	it('a LoadSound sample ignores EmitSound positions', () => {
		const { bb, be } = rig3d();
		const flat = bb.LoadSound('sfx\\flat.wav');
		const e = new Ent();
		e.pos = V(5000, 0, 0);
		bb.EmitSound(flat, e);
		bb.update();
		expect(be.voices[0].params).toMatchObject({ left: 1, right: 1, spatial: null });
	});

	it('FreeListener resets the listener to the origin', () => {
		const { bb, be, cam, roar } = rig3d();
		cam.pos = V(0, 0, 51);
		bb.update();
		const e = new Ent();
		e.pos = V(0, 0, 51);
		bb.EmitSound(roar, e);
		expect(be.voices[0].params.left).toBe(180 / 255);
		bb.FreeListener();
		expect(be.voices[0].params.left).toBe(89 / 255);
	});
});

describe('S2Audio (sfx.bb, ressources.bb, speech.bb)', () => {
	function game(extra: Record<string, SoundData> = {}) {
		const r = rig({
			'sfx\\dive.wav': snd(2),
			'sfx\\click.wav': snd(0.1),
			'sfx\\amb.mp3': snd(10, 2),
			'sfx\\music.mp3': snd(5, 2),
			'sfx\\beep.wav': snd(0.5),
			'sfx\\lion_spot.wav': snd(1),
			'sfx\\lion_attack.wav': snd(1),
			'sfx\\lion_die.wav': snd(1),
			'sfx\\speech\\negative1.ogg': snd(1),
			'sfx\\speech\\negative2.ogg': snd(1),
			'sfx\\speech\\negative3.ogg': snd(1),
			'sfx\\speech\\intro_a.ogg': snd(1),
			...extra
		});
		r.files.add('sfx\\lion_idle1.inf', 'lion_die.wav\r\nignored');
		r.files.add('sfx\\lion_move.inf', '  missing_target.wav ');
		const cam = new Ent();
		cam.pos = V(0, 10, 0);
		let gt = 0;
		const log: string[] = [];
		const rand: number[] = [];
		const s2 = new S2Audio(r.bb, {
			cam,
			gt: () => gt,
			Rand: (lo) => (rand.length ? rand.shift()! : lo),
			con_add: (t) => log.push(t)
		});
		s2.load_setup_listener();
		return {
			...r,
			s2,
			cam,
			log,
			rand,
			tick: (ms: number) => {
				gt += ms;
				r.be.advance(ms / 1000);
			}
		};
	}

	it('helpers: Blitz Int rounding and path$', () => {
		expect([0.4, 0.6, 1.5, 2.5, 3.5, -1.5, 2.6].map(bbInt)).toEqual([0, 1, 2, 2, 4, -2, 3]);
		expect(path$('sfx\\lion_idle1.inf')).toBe('sfx\\');
		expect(path$('sfx/speech/a.ogg')).toBe('sfx\\speech\\');
		expect(path$('plain')).toBe('plain');
	});

	it('load_res: caches per type, 3D for Cres_sound, 2D for Cres_music, follows .inf links', async () => {
		const { s2, bb, log } = game();
		await s2.preload();
		const a = s2.load_res('sfx\\click.wav', Cres_sound);
		expect(a).not.toBe(0);
		expect(s2.load_res('sfx\\click.wav', Cres_sound)).toBe(a);
		expect(bb.soundInfo(a)!.is3d).toBe(true);
		const m = s2.load_res('sfx\\click.wav', Cres_music);
		expect(m).not.toBe(a);
		expect(bb.soundInfo(m)!.is3d).toBe(false);
		// the cache compares paths case-sensitively, like Blitz strings
		expect(s2.load_res('sfx\\CLICK.wav', Cres_sound)).not.toBe(a);

		// lion_idle1.wav does not exist, lion_idle1.inf links to lion_die.wav
		const die = s2.load_res('sfx\\lion_die.wav', Cres_sound);
		expect(s2.load_res('sfx\\lion_idle1.wav', Cres_sound)).toBe(die);
		expect(log).toEqual([]);
		// link to a file that is not there
		expect(s2.load_res('sfx\\lion_move.wav', Cres_sound)).toBe(0);
		expect(log).toEqual(['ERROR: Unable to load sfx\\missing_target.wav']);
		// no file, no link: silently 0
		expect(s2.load_res('sfx\\lion_flee.wav', Cres_sound)).toBe(0);
		expect(s2.load_res('sfx\\nodot', Cres_sound)).toBe(0);
		expect(log.length).toBe(1);
	});

	it('load_soundset / play_soundset pick the right sound and emit it from the entity', async () => {
		const { s2, bb, be } = game();
		await s2.preload();
		expect(s2.load_soundset('lion')).toBe(1);
		expect(s2.load_soundset('lion')).toBe(1);
		expect(s2.Tsoundset.length).toBe(1);
		const set = s2.Tsoundset[0];
		expect(bb.soundInfo(set.spot)!.path).toBe('sfx\\lion_spot.wav');
		expect(bb.soundInfo(set.attack)!.path).toBe('sfx\\lion_attack.wav');
		expect(bb.soundInfo(set.idle1)!.path).toBe('sfx\\lion_die.wav'); // via link
		expect(set.idle1).toBe(set.die);
		expect([set.idle2, set.idle3, set.flee, set.move]).toEqual([0, 0, 0, 0]);

		const lion = new Ent();
		lion.pos = V(0, 10, 51);
		s2.set_fxvolume = 0.5;
		const c = s2.play_soundset('lion', snd_attack, lion);
		expect(c).not.toBe(0);
		expect(bb.inspect(c)!.path).toBe('sfx\\lion_attack.wav');
		// vol3d 127, channel volume 127: v = 63, L = 180*63/255 = 44
		expect(be.voices[0].params).toMatchObject({ left: 44 / 255, right: 44 / 255 });
		expect(bb.inspect(s2.play_soundset('lion', snd_spot, lion))!.path).toBe('sfx\\lion_spot.wav');
		expect(bb.inspect(s2.play_soundset('lion', snd_die, lion))!.path).toBe('sfx\\lion_die.wav');
		expect(bb.inspect(s2.play_soundset('lion', snd_idle1, lion))!.path).toBe('sfx\\lion_die.wav');
		expect(s2.play_soundset('lion', snd_move, lion)).toBe(0); // sound missing in the set
		expect(s2.play_soundset('lion', 99, lion)).toBe(0);
		expect(s2.play_soundset('tiger', snd_spot, lion)).toBe(0); // set never loaded
	});

	it('sfx / sfx_emit / play / sfx_3d apply set_fxvolume', () => {
		const { s2, bb, be } = game();
		const click = bb.Load3DSound('sfx\\click.wav');
		s2.set_fxvolume = 0.5;
		expect(s2.sfx(0)).toBe(0);
		const c = s2.sfx(click, 0.5);
		expect(bb.inspect(c)!.volume).toBe(63);
		s2.play(click);
		expect(be.voices[1].params.left).toBe(89 / 255);
		s2.play(0);
		// sfx_3d takes Int coordinates: 50.6 -> 51, and frees its pivot at once
		s2.sfx_3d(50.6, 10.4, 0.2, click);
		expect(be.voices[2].params.spatial!.position).toEqual(V(51, 10, 0));
		expect(be.voices[2].params).toMatchObject({ left: 0, right: 63 / 255 });
		s2.sfx_3d(0, 0, 0, 0);
		expect(be.voices.length).toBe(3);
	});

	it('sfx_play: own sample per call, default pan hard right, freed by sfx_update when done', () => {
		const { s2, bb, be, tick } = game();
		s2.set_fxvolume = 0.5;
		expect(s2.sfx_play('beep.wav')).toBe(0);
		expect(be.voices[0].params).toMatchObject({ left: 0, right: 127 / 255, rate: 1 });
		s2.sfx_play('beep.wav', 1, 0, 22050); // as the script command "play" calls it
		expect(be.voices[1].params).toMatchObject({ left: 90 / 255, right: 89 / 255, rate: 0.5 });
		expect(s2.sfx_play('nope.wav')).toBe(0);
		expect(s2.Tsfx.length).toBe(2);
		const [a, b] = s2.Tsfx;
		expect(a.file).not.toBe(b.file);

		tick(600);
		s2.sfx_update();
		expect(s2.Tsfx).toEqual([b]); // the half-speed one is still playing
		expect(bb.soundInfo(a.file)).toBeNull();
		tick(600);
		s2.sfx_update();
		expect(s2.Tsfx).toEqual([]);
	});

	it('stopsounds frees every sfx_play sound, which cuts it off', () => {
		const { s2, bb, be } = game();
		s2.sfx_play('beep.wav');
		s2.sfx_play('beep.wav');
		const chans = s2.Tsfx.map((t) => t.chan);
		s2.stopsounds();
		expect(s2.Tsfx).toEqual([]);
		expect(chans.map((c) => bb.ChannelPlaying(c))).toEqual([0, 0]);
		expect(be.live.length).toBe(0);
	});

	it('music: starts at peak*musicvolume, sfx_update applies musicvolume twice and repeats the track', () => {
		const { s2, bb, be, tick } = game();
		s2.set_musicvolume = 0.5;
		s2.sfx_music('music.mp3', 0.8);
		expect(s2.mfx_filename).toBe('music.mp3');
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(102); // 0.8*0.5*255
		s2.sfx_update();
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(51); // 0.8*0.5*0.5*255 (sic)
		tick(5100);
		expect(bb.ChannelPlaying(s2.mfx_chan)).toBe(0);
		s2.sfx_update();
		expect(bb.ChannelPlaying(s2.mfx_chan)).toBe(1);
		expect(be.voices.length).toBe(2);
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(51);
		// a new track frees the old one
		const old = be.voices[1];
		s2.sfx_music('amb.mp3');
		expect(old.stopped).toBe(true);
		expect(bb.inspect(s2.mfx_chan)!.path).toBe('sfx\\amb.mp3');
		// a missing file leaves no music
		s2.sfx_music('nope.mp3');
		expect(s2.mfx_file).toBe(0);
		expect(be.voices[2].stopped).toBe(true);
	});

	it('music fade in, fade out and the script commands', () => {
		const { s2, bb, be, tick } = game();
		s2.cmd_music('music.mp3', 1, -1000); // Abs(fade)
		expect(s2.mfx_fade).toBe(1);
		expect(s2.mfx_fadeend).toBe(1000);
		tick(250);
		s2.sfx_update();
		expect(s2.mfx_vol).toBeCloseTo(0.25, 9);
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(63);
		tick(750);
		s2.sfx_update();
		expect(s2.mfx_fade).toBe(0);
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(255);

		s2.cmd_musicvolume(0.5);
		s2.sfx_update();
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(127);

		s2.cmd_fademusic(1000);
		tick(500);
		s2.sfx_update();
		expect(bb.inspect(s2.mfx_chan)!.volume).toBe(63);
		tick(500);
		s2.sfx_update();
		expect([s2.mfx_fade, s2.mfx_file, s2.mfx_chan, s2.mfx_filename]).toEqual([0, 0, 0, '']);
		expect(be.voices[0].stopped).toBe(true);

		s2.cmd_music('music.mp3');
		expect(be.voices[1].stopped).toBe(false);
		s2.cmd_stopmusic(); // only FreeSound: the channel dies with the sample
		expect(be.voices[1].stopped).toBe(true);
		expect([s2.mfx_file, s2.mfx_chan]).toEqual([0, 0]);
		s2.sfx_update();
	});

	it('ambient: map loop above water (restarted by hand), diving loop below', () => {
		const { s2, bb, be, cam, tick } = game();
		s2.sfx_dive = s2.load_res('sfx\\dive.wav', Cres_sound);
		bb.LoopSound(s2.sfx_dive);
		s2.set_fxvolume = 0.5;
		s2.sfx_update();
		expect(s2.amb_mode).toBe(1);
		expect(s2.amb_chan).toBe(0); // no map ambient yet

		s2.load_map_music('amb.mp3');
		s2.sfx_update();
		expect(bb.inspect(s2.amb_chan)).toMatchObject({ path: 'sfx\\amb.mp3', volume: 127, loop: false });
		tick(10100);
		expect(bb.ChannelPlaying(s2.amb_chan)).toBe(0);
		s2.sfx_update(); // not a looping sample: sfx_update replays it
		expect(bb.ChannelPlaying(s2.amb_chan)).toBe(1);
		expect(be.voices.length).toBe(2);

		cam.pos = V(0, -1, 0);
		s2.sfx_update();
		expect(s2.amb_mode).toBe(-1);
		expect(be.voices[1].stopped).toBe(true);
		expect(bb.inspect(s2.amb_chan)).toMatchObject({ path: 'sfx\\dive.wav', loop: true, volume: 127 });
		tick(60000);
		s2.sfx_update();
		expect(be.voices.length).toBe(3); // looping, not restarted

		cam.pos = V(0, 0, 0); // EntityY(cam)>0 is false at exactly 0
		s2.sfx_update();
		expect(s2.amb_mode).toBe(-1);
		cam.pos = V(0, 1, 0);
		s2.sfx_update();
		expect(s2.amb_mode).toBe(1);
		expect(be.voices[2].stopped).toBe(true);
		expect(bb.inspect(s2.amb_chan)!.path).toBe('sfx\\amb.mp3');

		s2.menu_set_sfx(100, 20);
		expect(bb.inspect(s2.amb_chan)!.volume).toBe(51);
		s2.cmd_ambientsfx('');
		expect(be.voices[be.voices.length - 1].stopped).toBe(true);
		s2.e_clear_audio();
		expect([s2.amb_chan, s2.amb_file, s2.amb_mode]).toEqual([0, 0, 0]);
	});

	it('speech: counts variants, never repeats the last one, respects override and forceid', async () => {
		const { s2, bb, be, rand, tick, log } = game();
		await s2.preload();
		rand.push(2);
		s2.speech('negative');
		expect(s2.Tspeech).toEqual([{ file: 'negative', limit: 3, lastplayed: 2 }]);
		expect(bb.inspect(s2.speech_chan)!.path).toBe('sfx\\speech\\negative2.ogg');
		// emitted from the camera: full volume, centred
		expect(bb.inspect(s2.speech_chan)).toMatchObject({ left: 180 / 255, right: 181 / 255 });

		// still talking: ignored without override
		rand.push(3);
		s2.speech('negative');
		expect(be.voices.length).toBe(1);
		expect(rand).toEqual([3]);

		// override: stops the old line; Rand is redrawn until it differs from lastplayed
		rand.length = 0;
		rand.push(2, 2, 1);
		s2.speech('negative', 1);
		expect(be.voices[0].stopped).toBe(true);
		expect(bb.inspect(s2.speech_chan)!.path).toBe('sfx\\speech\\negative1.ogg');
		expect(s2.Tspeech[0].lastplayed).toBe(1);
		expect(rand).toEqual([]);

		tick(1100);
		rand.push(2); // drawn, then replaced by forceid
		s2.speech('negative', 0, 3);
		expect(bb.inspect(s2.speech_chan)!.path).toBe('sfx\\speech\\negative3.ogg');

		// a file without numbered variants
		tick(1100);
		s2.speech('intro_a');
		expect(bb.inspect(s2.speech_chan)!.path).toBe('sfx\\speech\\intro_a.ogg');
		expect(s2.Tspeech[1]).toEqual({ file: 'intro_a', limit: 0, lastplayed: 0 });

		// unknown speech: nothing plays, nothing is logged for sfx\speech\
		tick(1100);
		s2.speech('unknown');
		expect(be.voices.length).toBe(4);
		expect(bb.ChannelPlaying(s2.speech_chan)).toBe(0);
		expect(log).toEqual([]);
	});
});

const MOD = resolve('static/game/mod');
/** sfx_* globals whose file the shipped mod does not contain (0 in the original as well). */
const MISSING: string[] = ['sfx_menu'];

describe.skipIf(!existsSync(MOD))('S2Audio against the shipped sfx folder', () => {
	it('every sfx_* global of load_media.bb resolves, loops are set, links work', async () => {
		const vfs = new NodeVfs(MOD);
		const be = new FakeBackend();
		const bb = new BlitzAudio(be, vfs);
		const log: string[] = [];
		const cam = new Ent();
		const s2 = new S2Audio(bb, { cam, gt: () => 0, con_add: (t) => log.push(t) });
		const bad = await s2.preload();
		expect(bad).toEqual([]);
		s2.load_setup_listener();
		s2.load_media_sfx();
		expect(log).toEqual([]);

		let count = 0;
		const missing: string[] = [];
		for (const [k, v] of Object.entries(s2)) {
			if (!k.startsWith('sfx_')) continue;
			(Array.isArray(v) ? v : [v]).forEach((h, i) => {
				count++;
				if (h === 0) missing.push(Array.isArray(v) ? `${k}(${i})` : k);
			});
		}
		expect(count).toBe(85);
		expect(missing).toEqual(MISSING);
		expect(bb.soundInfo(s2.sfx_dive)).toMatchObject({ loop: true, is3d: true, channels: 1 });
		expect(bb.soundInfo(s2.sfx_rain)).toMatchObject({ loop: true, is3d: true });
		expect(bb.soundInfo(s2.sfx_click)).toMatchObject({ loop: false, is3d: true });
		expect(bb.soundInfo(s2.sfx_diary)).toMatchObject({ is3d: false, path: 'sfx\\diary.wav' });
		expect(bb.soundInfo(s2.sfx_humanhit[4])!.path).toBe('sfx\\human_hit5.wav');

		s2.load_soundset('lion');
		const lion = s2.Tsoundset[0];
		expect(bb.soundInfo(lion.spot)!.path).toBe('sfx\\lion_spot.wav');
		expect(bb.soundInfo(lion.idle1)!.path).toBe('sfx\\lion_die.wav'); // lion_idle1.inf
		expect(lion.flee).toBe(0);

		s2.speech('negative');
		expect(s2.Tspeech[0].limit).toBe(8);
		expect(bb.ChannelPlaying(s2.speech_chan)).toBe(1);
	});
});

const HAVE_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

describe.skipIf(!existsSync(MOD))('compressed WAV codecs (wavCodecs.ts)', () => {
	const vfs = existsSync(MOD) ? new NodeVfs(MOD) : null;
	const names = vfs ? vfs.list('sfx').filter((n) => /\.wav$/i.test(n)) : [];

	it('finds and decodes the ADPCM and GSM files of the mod', async () => {
		const done: string[] = [];
		for (const n of names) {
			const bytes = await vfs!.readBytes('sfx\\' + n);
			if (!isCompressedWav(bytes)) continue;
			const pcm = decodeWav(bytes);
			expect(pcm, n).not.toBeNull();
			const c = pcm!.channels[0];
			expect(c.length, n).toBeGreaterThan(1000);
			let sum = 0;
			let peak = 0;
			for (const v of c) {
				sum += v * v;
				peak = Math.max(peak, Math.abs(v));
			}
			// real signal, not silence and not full-scale garbage
			expect(Math.sqrt(sum / c.length), n).toBeGreaterThan(0.005);
			expect(Math.sqrt(sum / c.length), n).toBeLessThan(0.5);
			expect(peak, n).toBeLessThanOrEqual(1);
			done.push(n);
		}
		expect(done.length).toBe(20);
	});

	it.skipIf(!HAVE_FFMPEG)('matches ffmpeg sample for sample', async () => {
		for (const n of names) {
			const bytes = await vfs!.readBytes('sfx\\' + n);
			if (!isCompressedWav(bytes)) continue;
			const pcm = decodeWav(bytes)!;
			const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', resolve(MOD, 'sfx', n), '-f', 's16le', '-c:a', 'pcm_s16le', '-'], {
				maxBuffer: 1 << 28
			});
			const ref = new Int16Array(raw.buffer, raw.byteOffset, raw.length >> 1);
			const ch = pcm.channels.length;
			const frames = Math.min(pcm.channels[0].length, Math.floor(ref.length / ch));
			expect(Math.abs(pcm.channels[0].length - ref.length / ch), n + ' length').toBeLessThanOrEqual(2048);
			let worst = 0;
			for (let i = 0; i < frames; i++) {
				for (let c = 0; c < ch; c++) {
					worst = Math.max(worst, Math.abs(Math.round(pcm.channels[c][i] * 32768) - ref[i * ch + c]));
				}
			}
			expect(worst, n + ' max sample difference').toBeLessThanOrEqual(8);
		}
	});
});
