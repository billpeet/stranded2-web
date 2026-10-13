/**
 * FMOD 3.75 software-mixer maths as Blitz3D drives it. Pure functions, no
 * audio API; BlitzAudio turns their results into backend voice parameters.
 *
 * Two sources:
 *
 * [B] Blitz3D source (github.com/blitz-research/blitz3d)
 *     gxruntime/gxaudio.cpp  SoundChannel::setVolume  FSOUND_SetVolume(ch, volume*255.0f)
 *                            SoundChannel::setPan     FSOUND_SetPan(ch, (pan+1)*127.5f)
 *                            SoundChannel::setPitch   FSOUND_SetFrequency(ch, pitch)
 *                            gxAudio::loadSound       FSOUND_NORMAL | (use3d ? FSOUND_FORCEMONO : FSOUND_2D)
 *                            gxAudio::set3dOptions    FSOUND_3D_SetRolloffFactor/DopplerFactor/DistanceFactor
 *                            gxAudio::set3dListener   FSOUND_3D_Listener_SetAttributes + FSOUND_Update
 *     gxruntime/gxruntime.cpp openAudio               FSOUND_Init(44100, 1024, ...), default output and
 *                                                     mixer, no FSOUND_HW3D: 3D is mixed in software
 *
 * [F] The FMOD 3.75 code statically linked into StrandedII.exe (image base
 *     0x10000000), read from the disassembly. Addresses:
 *     0x100db3fe  per-channel software 3D update, run by FSOUND_Update
 *                 (0x100c77a8) and once when a channel starts
 *     0x100c845c  channel start (FSOUND_PlaySound and FSOUND_PlaySoundEx)
 *     0x100d4307 / 0x100d4378 / 0x100d421a  software SetVolume / SetPan / SetFrequency
 *     0x100c956a  FSOUND_3D_Listener_SetAttributes
 *     0x100c9956  sample allocation (min/max distance defaults)
 *     0x10124124  256-byte pan table
 *
 * The world is Blitz's: left-handed, +X right, +Y up, +Z forward. FMOD 3 uses
 * the same handedness, so vectors go in unchanged.
 */
import type { Vec3 } from './backend';

/** FSOUND_STEREOPAN: default pan of a stereo sample, both sides at full volume. */
export const FSOUND_STEREOPAN = -1;

/** Sample defaults set at 0x100c9956 [F]: min distance 1.0, max distance 1,000,000.0. */
export const MIN_DISTANCE = 1;
export const MAX_DISTANCE = 1000000;

/** Speed of sound per distance unit, constant at 0x1010896c [F]. */
export const SPEED_OF_SOUND = 340;

/** FSOUND_SetFrequency clamps |hertz| to this range (0x100d421a [F]). */
export const MIN_FREQUENCY = 100;
export const MAX_FREQUENCY = 705600;

export interface Options3d {
	/** FSOUND_3D_SetRolloffFactor. The setter clamps to 0..10; 0 selects linear rolloff. */
	rolloff: number;
	/** FSOUND_3D_SetDopplerFactor */
	doppler: number;
	/** FSOUND_3D_SetDistanceFactor: units per metre. Only scales the speed of sound. */
	distance: number;
}

/** FMOD's values before CreateListener is called (all 1.0 in the image). */
export const DEFAULT_3D: Options3d = { rolloff: 1, doppler: 1, distance: 1 };

export interface Listener3d {
	pos: Vec3;
	forward: Vec3;
	up: Vec3;
}

/** C float -> int conversion (_ftol): truncate toward zero. */
function ftol(x: number): number {
	return Number.isFinite(x) ? Math.trunc(x) : 0;
}

function clamp(x: number, lo: number, hi: number): number {
	return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Pan table at 0x10124124 [F]: entry i is trunc(16*sqrt(i)) capped at 255,
 * i.e. a square-root (constant power) law: 128 -> 181, 64 -> 128, 255 -> 255.
 * tests/audio.test.ts holds a copy of the 256 bytes from the executable.
 */
export const PAN_TABLE: readonly number[] = Array.from({ length: 256 }, (_, i) =>
	Math.min(255, Math.trunc(16 * Math.sqrt(i) + 1e-9))
);

/**
 * Blitz volume (0..1 float) to FMOD channel volume (0..255 int).
 * [B] FSOUND_SetVolume(channel, volume*255.0f): single-precision product,
 * truncated by the int conversion. [F] FSOUND_SetVolume (0x100c8d9e) clamps
 * to 0..255; the master SFX volume is 255, so nothing else scales it.
 */
export function fmodVolume(volume: number): number {
	return clamp(ftol(Math.fround(Math.fround(volume) * 255)), 0, 255);
}

/**
 * Blitz pan (-1 left .. 1 right) to FMOD pan (0..255).
 * [B] FSOUND_SetPan(channel, (pan+1)*127.5f). Note pan 0 gives 127, not 128.
 * [F] values outside 0..255 are clamped (pan separation is 1.0).
 */
export function fmodPan(pan: number): number {
	return clamp(ftol(Math.fround((Math.fround(pan) + 1) * 127.5)), 0, 255);
}

/**
 * Playback rate for a frequency in hertz. [F] 0x100d421a clamps the absolute
 * value to 100..705600 Hz. Negative frequencies play backwards in FMOD; that
 * is not supported here and the magnitude is used (the game never does it).
 */
export function pitchRate(hertz: number, nativeRate: number, doppler = 1): number {
	const f = clamp(Math.abs(ftol(hertz * doppler)), MIN_FREQUENCY, MAX_FREQUENCY);
	return f / nativeRate;
}

export interface Mix {
	/** Left / right speaker gain, linear amplitude 0..1. */
	left: number;
	right: number;
}

/**
 * Speaker gains from channel volume, pan and the 3D volume.
 * [F] 0x100d4307 / 0x100d4378, integer maths with truncating division:
 *
 *   if (pan == STEREOPAN) L = R = vol                (3D volume not applied)
 *   else  v = vol3d*vol/255;  L = tbl[255-pan]*v/255;  R = tbl[pan]*v/255
 *
 * and the FPU mixer (0x100f8750) multiplies samples by L/255 and R/255:
 * volume is linear amplitude. A centred mono sound is therefore at
 * 180/255 and 181/255 (about -3 dB) per speaker, never at full scale.
 */
export function speakerGains(volume: number, pan: number, vol3d = 255): Mix {
	if (pan === FSOUND_STEREOPAN) return { left: volume / 255, right: volume / 255 };
	const v = Math.trunc((vol3d * volume) / 255);
	return {
		left: Math.trunc((PAN_TABLE[255 - pan] * v) / 255) / 255,
		right: Math.trunc((PAN_TABLE[pan] * v) / 255) / 255
	};
}

/**
 * A sample loaded with LoadSound (FSOUND_2D). The 3D update skips these
 * entirely. `left` applies to the left input channel of stereo data and
 * `right` to the right one; an explicit pan on a stereo sample replaces
 * STEREOPAN and so also costs 3 dB at centre (ChannelPan 0 -> 181/180).
 */
export function mix2d(volume: number, pan: number, _channels: number): Mix {
	return speakerGains(volume, pan);
}

/**
 * Distance attenuation of a software 3D channel, as the 0..255 "3D volume".
 * [F] 0x100db3fe:
 *
 *   d = clamp(|source - listener|, min, max)
 *   rolloff == 0:  vol = (max - d) / (max - min)            (linear)
 *   otherwise:     vol = min / (min + rolloff * (d - min))   (inverse)
 *   vol3d = ftol(clamp(vol, 0, 1) * 255)
 *
 * The distance factor does not enter. Beyond max the gain freezes, it never
 * reaches zero. With the game's CreateListener(cam, 0.02, 1, 1) the gain is
 * 1/(1 + 0.02*(d-1)): half volume at 51 units, a tenth at 451.
 *
 * Web Audio equivalent: PannerNode distanceModel "inverse" computes
 * refDistance / (refDistance + rolloffFactor * (max(d, refDistance) - refDistance)),
 * the same expression with refDistance = min and rolloffFactor = rolloff
 * ("linear" with rolloffFactor 1 and maxDistance = max matches the rolloff 0
 * case). What it lacks is the max clamp (irrelevant at 1e6 units) and the
 * quantisation to 1/255 steps.
 */
export function attenuation(d: number, rolloff: number, min = MIN_DISTANCE, max = MAX_DISTANCE): number {
	if (d >= max) d = max;
	if (d < min) d = min;
	let vol: number;
	if (rolloff === 0) {
		vol = max - min <= 0 ? 1 : (max - d) / (max - min);
	} else {
		if (d > min && rolloff !== 1) d = (d - min) * rolloff + min;
		if (d < 1e-5) d = 1e-5;
		vol = min / d;
	}
	return ftol(clamp(vol, 0, 1) * 255);
}

/**
 * Pan of a software 3D channel (0..255). [F] 0x100db3fe:
 *
 *   dir   = (source - listener) / distance      ((0,0,0) at distance 0)
 *   right = up x forward                        (0x100c956a, not normalised)
 *   pan   = clamp(128 - ftol(-128 * dot(right, dir)), 0, 255)
 *
 * Only the sideways component counts: front and back are the same, and a
 * source straight above or below is centred.
 *
 * Web Audio equivalent: PannerNode panningModel "equalpower" uses
 * gainL = cos(x*pi/2), gainR = sin(x*pi/2), x = (azimuth + 90) / 180, with
 * the azimuth folded front/back. Through the square-root table FMOD's gains
 * are sqrt((1 -/+ sin(azimuth))/2), which is the same curve, so the two agree
 * for sources at the listener's ear height. They differ for elevated
 * sources: Web Audio takes the azimuth of the direction projected onto the
 * horizontal plane (a bird almost overhead and slightly left is hard left),
 * FMOD keeps the full direction (the bird is nearly centred).
 */
export function pan3d(source: Vec3, listener: Listener3d): number {
	const dx = source.x - listener.pos.x;
	const dy = source.y - listener.pos.y;
	const dz = source.z - listener.pos.z;
	const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
	if (!(d > 0)) return 128;
	const { forward: f, up: u } = listener;
	const rx = u.y * f.z - u.z * f.y;
	const ry = u.z * f.x - u.x * f.z;
	const rz = u.x * f.y - u.y * f.x;
	const dot = (rx * dx + ry * dy + rz * dz) / d;
	return clamp(128 - ftol(-128 * dot), 0, 255);
}

/**
 * A sample loaded with Load3DSound (mono, positional).
 *
 * `source` is the channel's 3D position. [F] the channel start routine
 * (0x100c845c) puts every new channel at the listener's current position
 * with zero velocity and runs the 3D update, so a 3D sample played with
 * plain PlaySound starts at full volume and centre pan, and is from then on
 * a fixed point in the world: if the listener walks away from where the
 * sound started (rain, the diving loop) it fades and pans like any other
 * source. EmitSound overrides the position with the entity's.
 *
 * FSOUND_SetPan on such a channel is overwritten at the next FSOUND_Update,
 * so ChannelPan has no lasting effect; BlitzAudio ignores it for 3D samples.
 */
export function mix3d(volume: number, source: Vec3, listener: Listener3d, options: Options3d): Mix & { vol3d: number; pan: number } {
	const dx = source.x - listener.pos.x;
	const dy = source.y - listener.pos.y;
	const dz = source.z - listener.pos.z;
	const vol3d = attenuation(Math.sqrt(dx * dx + dy * dy + dz * dz), options.rolloff);
	const pan = pan3d(source, listener);
	return { ...speakerGains(volume, pan, vol3d), vol3d, pan };
}

/**
 * Doppler frequency scale of a software 3D channel. [F] 0x100db3fe, applied
 * only when the doppler factor is > 0:
 *
 *   S     = 340 * distanceFactor
 *   d     = |source - listener|
 *   dPrev = |(source - sourceVel) - (listener - listenerVel)|
 *   scale = max(1e-5, (S - (d - dPrev) * dopplerFactor) / S)
 *
 * FMOD reads velocities as units per second. Blitz passes Object::velocity,
 * which is units per UpdateWorld tick ((pos - prevPos) / elapsed), so in the
 * game the shift is tiny for walking speeds and extreme for one frame when
 * an emitter is teleported; both are the original's behaviour. Web Audio's
 * PannerNode has no doppler, so the scale is folded into the playback rate.
 */
export function dopplerRate(source: Vec3, sourceVel: Vec3, listener: Vec3, listenerVel: Vec3, options: Options3d): number {
	if (!(options.doppler > 0)) return 1;
	const s = SPEED_OF_SOUND * options.distance;
	const d = Math.hypot(source.x - listener.x, source.y - listener.y, source.z - listener.z);
	const dPrev = Math.hypot(
		source.x - sourceVel.x - (listener.x - listenerVel.x),
		source.y - sourceVel.y - (listener.y - listenerVel.y),
		source.z - sourceVel.z - (listener.z - listenerVel.z)
	);
	const scale = (s - (d - dPrev) * options.doppler) / s;
	return scale < 1e-5 ? 1e-5 : scale;
}
