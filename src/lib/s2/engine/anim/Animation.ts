/**
 * Keyframe tracks of one object for one sequence.
 * Port of blitz3d/animation.cpp. Keys are held in ascending frame order, one
 * per frame number, like the std::map<int,Quat> of the original.
 *
 * Values are plain tuples. Rotations are (x, y, z, w) and may be in any
 * consistent convention: slerp is unaffected by conjugation, so callers can
 * store Three.js quaternions converted with blitzQuat().
 */

export type Vec3 = readonly [number, number, number];
export type Quat = readonly [number, number, number, number];

/** geom.h EPSILON */
const EPSILON = 0.000001;

interface Track<T> {
	frames: number[];
	values: T[];
}

function setKey<T>(t: Track<T>, frame: number, value: T): void {
	// map[frame] = value
	let lo = 0;
	let hi = t.frames.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (t.frames[mid] < frame) lo = mid + 1;
		else hi = mid;
	}
	if (t.frames[lo] === frame) t.values[lo] = value;
	else {
		t.frames.splice(lo, 0, frame);
		t.values.splice(lo, 0, value);
	}
}

/** keys.upper_bound( (int)time ): index of the first key whose frame is greater. */
function upperBound(frames: number[], time: number): number {
	const t = Math.trunc(time);
	let lo = 0;
	let hi = frames.length;
	while (lo < hi) {
		const mid = (lo + hi) >> 1;
		if (frames[mid] <= t) lo = mid + 1;
		else hi = mid;
	}
	return lo;
}

/** Quat::slerpTo from blitz3d/geom.h, component order (x, y, z, w). */
export function slerpTo(p: Quat, q: Quat, a: number): [number, number, number, number] {
	let tx = q[0];
	let ty = q[1];
	let tz = q[2];
	let tw = q[3];
	let d = p[0] * tx + p[1] * ty + p[2] * tz + p[3] * tw;
	let b = 1 - a;
	if (d < 0) {
		tx = -tx;
		ty = -ty;
		tz = -tz;
		tw = -tw;
		d = -d;
	}
	if (d < 1 - EPSILON) {
		const om = Math.acos(d);
		const si = Math.sin(om);
		a = Math.sin(a * om) / si;
		b = Math.sin(b * om) / si;
	}
	return [p[0] * b + tx * a, p[1] * b + ty * a, p[2] * b + tz * a, p[3] * b + tw * a];
}

export class Animation {
	private pos: Track<Vec3> = { frames: [], values: [] };
	private scl: Track<Vec3> = { frames: [], values: [] };
	private rot: Track<Quat> = { frames: [], values: [] };

	/** Animation( const Animation &t,int first,int last ): the keys in first..last, moved to start at 0. */
	static extract(t: Animation, first: number, last: number): Animation {
		const a = new Animation();
		const cut = <T>(src: Track<T>, dst: Track<T>) => {
			for (let i = 0; i < src.frames.length; i++) {
				const f = src.frames[i];
				if (f < first || f > last) continue;
				dst.frames.push(f - first);
				dst.values.push(src.values[i]);
			}
		};
		cut(t.pos, a.pos);
		cut(t.scl, a.scl);
		cut(t.rot, a.rot);
		return a;
	}

	setPositionKey(frame: number, v: Vec3): void {
		setKey(this.pos, frame, v);
	}

	setScaleKey(frame: number, v: Vec3): void {
		setKey(this.scl, frame, v);
	}

	setRotationKey(frame: number, q: Quat): void {
		setKey(this.rot, frame, q);
	}

	numPositionKeys(): number {
		return this.pos.frames.length;
	}

	numScaleKeys(): number {
		return this.scl.frames.length;
	}

	numRotationKeys(): number {
		return this.rot.frames.length;
	}

	getPosition(time: number): Vec3 {
		if (!this.pos.frames.length) return [0, 0, 0];
		return linearValue(this.pos, time);
	}

	getScale(time: number): Vec3 {
		if (!this.scl.frames.length) return [1, 1, 1];
		return linearValue(this.scl, time);
	}

	getRotation(time: number): Quat {
		if (!this.rot.frames.length) return [0, 0, 0, 1];
		// Rep::getSlerpValue
		const t = this.rot;
		const next = upperBound(t.frames, time);
		if (next === 0) return t.values[0];
		const curr = next - 1;
		if (next === t.frames.length) return t.values[curr];
		const delta = (time - t.frames[curr]) / (t.frames[next] - t.frames[curr]);
		return slerpTo(t.values[curr], t.values[next], delta);
	}
}

/** Rep::getLinearValue */
function linearValue(t: Track<Vec3>, time: number): Vec3 {
	const next = upperBound(t.frames, time);
	if (next === 0) return t.values[0];
	const curr = next - 1;
	if (next === t.frames.length) return t.values[curr];
	const delta = (time - t.frames[curr]) / (t.frames[next] - t.frames[curr]);
	const a = t.values[curr];
	const b = t.values[next];
	return [(b[0] - a[0]) * delta + a[0], (b[1] - a[1]) * delta + a[1], (b[2] - a[2]) * delta + a[2]];
}
