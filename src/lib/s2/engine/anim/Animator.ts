import { Animation, slerpTo, type Quat, type Vec3 } from './Animation';

/**
 * Port of blitz3d/animator.cpp: the animation state of one entity
 * (LoadAnimMesh root, or a mesh with bones) and the objects it drives.
 *
 * Times are in frames. Blitz keeps them in 32-bit floats; the same rounding
 * is applied here so that AnimTime and the end-of-sequence tests agree.
 */

export const ANIM_MODE_STOP = 0;
export const ANIM_MODE_LOOP = 1;
export const ANIM_MODE_PINGPONG = 2;
export const ANIM_MODE_ONESHOT = 3;

/** What the animator needs from an object. THREE.Object3D fits. */
export interface AnimObject {
	name: string;
	position: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown };
	scale: { x: number; y: number; z: number; set(x: number, y: number, z: number): unknown };
	quaternion: {
		x: number;
		y: number;
		z: number;
		w: number;
		set(x: number, y: number, z: number, w: number): unknown;
	};
}

interface Anim {
	/** One Animation per sequence. */
	keys: Animation[];
	// for transitions
	pos: boolean;
	scl: boolean;
	rot: boolean;
	srcPos: Vec3;
	destPos: Vec3;
	srcScl: Vec3;
	destScl: Vec3;
	srcRot: Quat;
	destRot: Quat;
}

const ZERO: Vec3 = [0, 0, 0];
const IDENT: Quat = [0, 0, 0, 1];

function newAnim(keys: Animation[]): Anim {
	return {
		keys,
		pos: false,
		scl: false,
		rot: false,
		srcPos: ZERO,
		destPos: ZERO,
		srcScl: ZERO,
		destScl: ZERO,
		srcRot: IDENT,
		destRot: IDENT
	};
}

const f = Math.fround;

export class Animator {
	/** Length in frames of each sequence. */
	private seqs: number[] = [];
	private anims: Anim[] = [];
	private objs: AnimObject[];

	private seq = 0;
	private mode = 0;
	private seqLen = 0;
	private time = 0;
	private speed = 0;
	private transTime = 0;
	private transSpeed = 0;

	/**
	 * Animator( const vector<Object*> &objs,int frames ): sequence 0 is built
	 * from the keys each object was loaded with (`keys[k]` belongs to `objs[k]`).
	 */
	constructor(objs: AnimObject[], frames: number, keys: Animation[]) {
		this.objs = objs;
		this.seqs.push(frames);
		this.anims = objs.map((_, k) => newAnim([keys[k] ?? new Animation()]));
	}

	/**
	 * Animator( Animator *t ), used by CopyEntity: the copy drives `objs` (the
	 * copies of t's objects, in the same order), has the sequences t has at this
	 * moment, and starts in the reset state (sequence 0, stopped, AnimLength 0).
	 */
	static copy(t: Animator, objs: AnimObject[]): Animator {
		const a = new Animator(objs, 0, []);
		a.seqs = t.seqs.slice();
		a.anims = t.anims.map((an) => newAnim(an.keys.slice()));
		return a;
	}

	getObjects(): readonly AnimObject[] {
		return this.objs;
	}

	/** Keys of object k in a sequence (for inspection and tests). */
	getKeys(k: number, seq: number): Animation {
		return this.anims[k].keys[seq];
	}

	numSeqs(): number {
		return this.seqs.length;
	}

	/** Length in frames of a sequence. */
	seqFrames(seq: number): number {
		return this.seqs[seq];
	}

	/** AddAnimSeq entity,length: a new sequence without keys. Returns its index. */
	addSeq(frames: number): number {
		this.seqs.push(frames);
		for (const an of this.anims) an.keys.push(new Animation());
		return this.seqs.length - 1;
	}

	/** Animator::addSeqs (LoadAnimSeq): appends t's sequences, matching objects by name. */
	addSeqs(t: Animator): number {
		for (let n = 0; n < t.seqs.length; n++) {
			this.seqs.push(t.seqs[n]);
			for (let k = 0; k < this.objs.length; k++) {
				const j = t.objs.findIndex((o) => o.name === this.objs[k].name);
				this.anims[k].keys.push(j < 0 ? new Animation() : t.anims[j].keys[n]);
			}
		}
		return this.seqs.length - 1;
	}

	/**
	 * ExtractAnimSeq( entity,first_frame,last_frame,anim_seq=0 ). Returns the
	 * index of the new sequence, whose length is last-first.
	 */
	extractSeq(first: number, last: number, seq = 0): number {
		this.seqs.push(last - first);
		for (const an of this.anims) an.keys.push(Animation.extract(an.keys[seq], first, last));
		return this.seqs.length - 1;
	}

	/** AnimSeq( entity ) */
	animSeq(): number {
		return this.seq;
	}

	/** AnimLength( entity ): length of the current sequence, 0 before the first Animate. */
	animLen(): number {
		return this.seqLen;
	}

	/** AnimTime#( entity ) */
	animTime(): number {
		return this.time;
	}

	/** Animating( entity ) */
	animating(): boolean {
		return this.mode !== 0;
	}

	/** SetAnimTime entity,time#,anim_seq=0 */
	setAnimTime(time: number, seq = 0): void {
		// The original tests seq>size, letting seq==size through to read past
		// the end of the vector; that case is treated as out of range here.
		if (seq < 0 || seq >= this.seqs.length) return;

		this.mode = 0;
		this.speed = 0;
		this.seq = seq;
		this.seqLen = this.seqs[seq];

		this.time = f(f(time) % this.seqLen);
		if (this.time < 0) this.time = f(this.time + this.seqLen);

		this.updateAnim();
	}

	/** Animate entity,mode=1,speed#=1,sequence=0,transition#=0 */
	animate(mode = 1, speed = 1, seq = 0, trans = 0): void {
		if (!mode && !speed) {
			this.mode = 0;
			return;
		}

		if (seq < 0 || seq >= this.seqs.length) return;

		this.seq = seq;
		this.mode = mode;
		this.seqLen = this.seqs[seq];
		this.speed = f(speed);
		this.time = this.speed >= 0 ? 0 : this.seqLen;

		if (trans <= 0) {
			this.updateAnim();
			if (!this.speed) this.mode = 0;
			return;
		}

		this.mode |= 0x8000;
		this.transTime = 0;
		this.transSpeed = f(1 / f(trans));
		this.beginTrans();
	}

	/** Animator::update, called for each enabled object by UpdateWorld elapsed#=1. */
	update(elapsed = 1): void {
		if (!this.mode) return;

		if (this.mode & 0x8000) {
			this.transTime = f(this.transTime + f(this.transSpeed * elapsed));
			if (this.transTime < 1) {
				this.updateTrans();
				return;
			}
			this.mode &= 0x7fff;
			if (!this.mode || !this.speed) {
				this.updateAnim();
				this.mode = 0;
				return;
			}
		}

		// do anim...
		this.time = f(this.time + f(this.speed * elapsed));

		switch (this.mode) {
			case ANIM_MODE_LOOP:
				this.time = f(this.time % this.seqLen);
				if (this.time < 0) this.time = f(this.time + this.seqLen);
				break;
			case ANIM_MODE_PINGPONG:
				this.time = f(this.time % (this.seqLen * 2));
				if (this.time < 0) this.time = f(this.time + this.seqLen * 2);
				if (this.time >= this.seqLen) {
					this.time = f(this.seqLen - f(this.time - this.seqLen));
					this.speed = -this.speed;
				}
				break;
			case ANIM_MODE_ONESHOT:
				if (this.time < 0) {
					this.time = 0;
					this.mode = 0;
				} else if (this.time >= this.seqLen) {
					this.time = this.seqLen;
					this.mode = 0;
				}
				break;
		}

		this.updateAnim();
	}

	private updateAnim(): void {
		for (let k = 0; k < this.objs.length; k++) {
			const obj = this.objs[k];
			const keys = this.anims[k].keys[this.seq];
			if (keys.numPositionKeys()) {
				const p = keys.getPosition(this.time);
				obj.position.set(p[0], p[1], p[2]);
			}
			if (keys.numScaleKeys()) {
				const s = keys.getScale(this.time);
				obj.scale.set(s[0], s[1], s[2]);
			}
			if (keys.numRotationKeys()) {
				const q = keys.getRotation(this.time);
				obj.quaternion.set(q[0], q[1], q[2], q[3]);
			}
		}
	}

	private updateTrans(): void {
		const t = this.transTime;
		for (let k = 0; k < this.objs.length; k++) {
			const obj = this.objs[k];
			const an = this.anims[k];
			if (an.pos) {
				obj.position.set(
					(an.destPos[0] - an.srcPos[0]) * t + an.srcPos[0],
					(an.destPos[1] - an.srcPos[1]) * t + an.srcPos[1],
					(an.destPos[2] - an.srcPos[2]) * t + an.srcPos[2]
				);
			}
			if (an.scl) {
				obj.scale.set(
					(an.destScl[0] - an.srcScl[0]) * t + an.srcScl[0],
					(an.destScl[1] - an.srcScl[1]) * t + an.srcScl[1],
					(an.destScl[2] - an.srcScl[2]) * t + an.srcScl[2]
				);
			}
			if (an.rot) {
				const q = slerpTo(an.srcRot, an.destRot, t);
				obj.quaternion.set(q[0], q[1], q[2], q[3]);
			}
		}
	}

	private beginTrans(): void {
		for (let k = 0; k < this.objs.length; k++) {
			const obj = this.objs[k];
			const an = this.anims[k];
			const keys = an.keys[this.seq];
			if ((an.pos = keys.numPositionKeys() !== 0)) {
				an.srcPos = [obj.position.x, obj.position.y, obj.position.z];
				an.destPos = keys.getPosition(this.time);
			}
			if ((an.scl = keys.numScaleKeys() !== 0)) {
				an.srcScl = [obj.scale.x, obj.scale.y, obj.scale.z];
				an.destScl = keys.getScale(this.time);
			}
			if ((an.rot = keys.numRotationKeys() !== 0)) {
				an.srcRot = [obj.quaternion.x, obj.quaternion.y, obj.quaternion.z, obj.quaternion.w];
				an.destRot = keys.getRotation(this.time);
			}
		}
	}
}
