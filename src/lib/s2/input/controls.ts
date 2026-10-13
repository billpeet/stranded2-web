/**
 * The key-binding half of load_settings.bb: sys\controls.cfg and
 * sys\scriptcontrols.cfg. Both are one text line followed by 21 shorts
 * (key codes: 0..255 DirectInput scancode, 256..260 mouse buttons 1..5,
 * 261/262 wheel up/down); controls.cfg continues with the mouse settings.
 */
import type { Vfs } from '../io/Vfs';
import { S } from './state';

export interface Controls {
	/** in_keys(0..20), indexed by the Ckey_* constants. */
	keys: number[];
	/** set_msens# */
	msens: number;
	/** set_minvert (stored as value+128) */
	minvert: number;
	/** set_msmooth */
	msmooth: number;
}

function skipLine(bytes: Uint8Array): number {
	let p = 0;
	while (p < bytes.length && bytes[p] !== 10) p++;
	return p + 1;
}

export function parse_controls(bytes: Uint8Array): Controls {
	const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	let p = skipLine(bytes);
	const keys: number[] = [];
	for (let i = 0; i <= 20; i++) {
		keys.push(p + 1 < bytes.length ? dv.getUint16(p, true) : 0);
		p += 2;
	}
	const msens = p + 3 < bytes.length ? dv.getFloat32(p, true) : 0;
	p += 4;
	const minvert = (p < bytes.length ? bytes[p] : 0) - 128;
	p += 1;
	const msmooth = p < bytes.length ? bytes[p] : 0;
	return { keys, msens, minvert, msmooth };
}

/** Defaults load_settings applies when controls.cfg cannot be opened. */
export const DEFAULT_CONTROLS: Controls = { keys: new Array<number>(21).fill(0), msens: 0.2, minvert: 1, msmooth: 0 };

/** Reads both files into S.in_keys / S.game_scriptkey and returns the mouse settings. */
export async function load_controls(vfs: Vfs): Promise<Controls> {
	let controls = DEFAULT_CONTROLS;
	if (vfs.exists('sys\\controls.cfg')) controls = parse_controls(await vfs.readBytes('sys\\controls.cfg'));
	for (let i = 0; i <= 20; i++) S.in_keys[i] = controls.keys[i];
	if (vfs.exists('sys\\scriptcontrols.cfg')) {
		const sc = parse_controls(await vfs.readBytes('sys\\scriptcontrols.cfg'));
		for (let i = 0; i <= 20; i++) S.game_scriptkey[i] = sc.keys[i];
	}
	return controls;
}
