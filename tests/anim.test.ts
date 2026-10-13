import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Animation, slerpTo } from '../src/lib/s2/engine/anim/Animation';
import { Animator, type AnimObject } from '../src/lib/s2/engine/anim/Animator';
import { BLEND_ADD, BLEND_ALPHA, BLEND_REPLACE, Brush, brushMaterial } from '../src/lib/s2/engine/anim/brush';
import {
	animate,
	animating,
	animLength,
	animSeq,
	animTime,
	buildCollapsedRep,
	copyEntity,
	countChildren,
	createAnimMesh,
	createMeshEntity,
	entityAlpha,
	entityAutoFade,
	entityColor,
	extractAnimSeq,
	findChild,
	getAnimator,
	getChild,
	meshHeight,
	meshRep,
	meshWidth,
	modelBrushes,
	setAnimTime,
	updateAutoFade,
	updateWorld
} from '../src/lib/s2/engine/anim/entity';
import { blitzQuat } from '../src/lib/s2/engine/blitzSpace';
import {
	applyTextureAlpha,
	imageHasAlphaFormat,
	TEX_ALPHA,
	TEX_COLOR,
	TEX_MASKED,
	TextureHandle,
	type BlitzTexture
} from '../src/lib/s2/engine/textures';
import { parseB3d, type B3dModel, type B3dNode } from '../src/lib/s2/formats/b3d';
import { NodeVfs } from './NodeVfs';

const f = Math.fround;

function fakeObject(name = 'o'): AnimObject & { position: THREE.Vector3; quaternion: THREE.Quaternion } {
	return {
		name,
		position: new THREE.Vector3(),
		scale: new THREE.Vector3(1, 1, 1),
		quaternion: new THREE.Quaternion()
	};
}

/** One object whose x position equals the frame number over frames 0..n. */
function ramp(n = 10) {
	const keys = new Animation();
	for (let i = 0; i <= n; i++) keys.setPositionKey(i, [i, 0, 0]);
	const obj = fakeObject();
	return { obj, anim: new Animator([obj], n, [keys]) };
}

function run(a: Animator, steps: number, elapsed = 1): number[] {
	const out: number[] = [];
	for (let i = 0; i < steps; i++) {
		a.update(elapsed);
		out.push(a.animTime());
	}
	return out;
}

describe('Animation keys (animation.cpp)', () => {
	it('interpolates between the keys around the time and clamps outside', () => {
		const a = new Animation();
		a.setPositionKey(3, [30, 0, 0]);
		a.setPositionKey(1, [10, 0, 0]);
		expect(a.numPositionKeys()).toBe(2);
		expect(a.getPosition(0.5)[0]).toBe(10); // before the first key
		expect(a.getPosition(1)[0]).toBe(10);
		expect(a.getPosition(2)[0]).toBe(20);
		expect(a.getPosition(2.5)[0]).toBe(25);
		expect(a.getPosition(3)[0]).toBe(30); // upper_bound(3) is end: last key
		expect(a.getPosition(9)[0]).toBe(30);
	});
	it('gives defaults without keys', () => {
		const a = new Animation();
		expect(a.getPosition(1)).toEqual([0, 0, 0]);
		expect(a.getScale(1)).toEqual([1, 1, 1]);
		expect(a.getRotation(1)).toEqual([0, 0, 0, 1]);
	});
	it('replaces a key set twice on the same frame', () => {
		const a = new Animation();
		a.setScaleKey(2, [1, 1, 1]);
		a.setScaleKey(2, [2, 2, 2]);
		expect(a.numScaleKeys()).toBe(1);
		expect(a.getScale(2)).toEqual([2, 2, 2]);
	});
	it('extract keeps keys in first..last and moves them to 0', () => {
		const a = new Animation();
		for (let i = 1; i <= 8; i++) a.setPositionKey(i, [i * 10, 0, 0]);
		const e = Animation.extract(a, 3, 5);
		expect(e.numPositionKeys()).toBe(3);
		expect(e.getPosition(0)[0]).toBe(30);
		expect(e.getPosition(1.5)[0]).toBe(45);
		expect(e.getPosition(2)[0]).toBe(50);
	});
	it('slerps rotations by the shorter way', () => {
		const s = Math.SQRT1_2;
		// 90 degrees about z, and the same rotation with all signs flipped
		const q = slerpTo([0, 0, 0, 1], [0, 0, s, s], 0.5);
		expect(q[2]).toBeCloseTo(Math.sin(Math.PI / 8), 6);
		expect(q[3]).toBeCloseTo(Math.cos(Math.PI / 8), 6);
		const r = slerpTo([0, 0, 0, 1], [0, 0, -s, -s], 0.5);
		expect(r[2]).toBeCloseTo(Math.sin(Math.PI / 8), 6);
		expect(r[3]).toBeCloseTo(Math.cos(Math.PI / 8), 6);
		// nearly equal quaternions blend linearly (d >= 1-EPSILON)
		expect(slerpTo([0, 0, 0, 1], [0, 0, 0, 1], 0.3)).toEqual([0, 0, 0, 1]);
	});
});

describe('Animator (animator.cpp)', () => {
	it('starts reset', () => {
		const { anim } = ramp();
		expect(anim.animSeq()).toBe(0);
		expect(anim.animLen()).toBe(0);
		expect(anim.animTime()).toBe(0);
		expect(anim.animating()).toBe(false);
		// update without a mode does nothing
		anim.update(5);
		expect(anim.animTime()).toBe(0);
	});

	it('mode 1 loops: time = fmod(time, length)', () => {
		const { obj, anim } = ramp(10);
		anim.animate(1, 3);
		expect(anim.animLen()).toBe(10);
		expect(anim.animTime()).toBe(0);
		expect(run(anim, 5)).toEqual([3, 6, 9, 2, 5]);
		expect(obj.position.x).toBe(5);
		expect(anim.animating()).toBe(true);
	});

	it('mode 1 backwards starts at the end and wraps below 0', () => {
		const { anim } = ramp(10);
		anim.animate(1, -3);
		expect(anim.animTime()).toBe(10);
		expect(run(anim, 5)).toEqual([7, 4, 1, 8, 5]);
	});

	it('mode 1 honours elapsed time and 32-bit float rounding', () => {
		const { anim } = ramp(10);
		anim.animate(1, 0.1);
		anim.update(1);
		anim.update(1);
		anim.update(0.5);
		const step = f(f(0.1) * 1);
		const expected = f(f(f(0 + step) + step) + f(f(0.1) * 0.5));
		expect(anim.animTime()).toBe(expected);
	});

	it('mode 2 ping-pongs: reflects at the end and flips the speed', () => {
		const { anim } = ramp(10);
		anim.animate(2, 4);
		// 4, 8, 12 -> 10-(12-10)=8 with speed -4, 4, 0, -4 -> +20=16 -> 10-(16-10)=4 with speed +4, 8, 12 -> 8
		expect(run(anim, 8)).toEqual([4, 8, 8, 4, 0, 4, 8, 8]);
		expect(anim.animating()).toBe(true);
	});

	it('mode 2 reaching the end exactly turns round there', () => {
		const { anim } = ramp(10);
		anim.animate(2, 5);
		// 5, 10 -> 10-(10-10)=10 with speed -5, 5, 0, -5 -> 15 -> 5 with speed +5
		expect(run(anim, 5)).toEqual([5, 10, 5, 0, 5]);
	});

	it('mode 3 plays once and stops on the last frame', () => {
		const { obj, anim } = ramp(10);
		anim.animate(3, 4);
		expect(run(anim, 2)).toEqual([4, 8]);
		expect(anim.animating()).toBe(true);
		anim.update();
		expect(anim.animTime()).toBe(10);
		expect(anim.animating()).toBe(false);
		expect(obj.position.x).toBe(10);
		anim.update();
		expect(anim.animTime()).toBe(10);
	});

	it('mode 3 backwards stops at 0', () => {
		const { anim } = ramp(10);
		anim.animate(3, -4);
		expect(anim.animTime()).toBe(10);
		expect(run(anim, 3)).toEqual([6, 2, 0]);
		expect(anim.animating()).toBe(false);
	});

	it('mode 3 stops when the time equals the length', () => {
		const { anim } = ramp(10);
		anim.animate(3, 5);
		expect(run(anim, 2)).toEqual([5, 10]);
		expect(anim.animating()).toBe(false);
	});

	it('Animate entity,0 poses frame 0 of sequence 0 and does not animate', () => {
		const { obj, anim } = ramp(10);
		anim.animate(1, 3);
		run(anim, 2);
		expect(obj.position.x).toBe(6);
		anim.animate(0); // speed defaults to 1
		expect(anim.animating()).toBe(false);
		expect(anim.animTime()).toBe(0);
		expect(obj.position.x).toBe(0);
		anim.update();
		expect(anim.animTime()).toBe(0);
	});

	it('Animate entity,0,0 only stops', () => {
		const { obj, anim } = ramp(10);
		anim.animate(1, 3);
		run(anim, 2);
		anim.animate(0, 0);
		expect(anim.animating()).toBe(false);
		expect(anim.animTime()).toBe(6);
		expect(obj.position.x).toBe(6);
	});

	it('speed 0 without transition poses and stops', () => {
		const { anim } = ramp(10);
		anim.animate(1, 0);
		expect(anim.animating()).toBe(false);
		expect(anim.animLen()).toBe(10);
	});

	it('ignores an invalid sequence', () => {
		const { anim } = ramp(10);
		anim.animate(1, 3);
		run(anim, 1);
		anim.animate(1, 1, 5);
		anim.animate(1, 1, -1);
		expect(anim.animSeq()).toBe(0);
		expect(anim.animTime()).toBe(3);
		expect(anim.animating()).toBe(true);
	});

	it('transition blends from the current pose to the start pose, then plays', () => {
		const { obj, anim } = ramp(10);
		obj.position.set(100, 0, 0);
		anim.animate(1, 2, 0, 4);
		expect(anim.animating()).toBe(true);
		expect(anim.animTime()).toBe(0);
		expect(obj.position.x).toBe(100); // nothing moves before the first update
		anim.update();
		expect(obj.position.x).toBe(75); // trans_time .25: (0-100)*.25+100
		expect(anim.animTime()).toBe(0);
		anim.update();
		anim.update();
		expect(obj.position.x).toBe(25);
		// The update that completes the transition also advances the animation.
		anim.update();
		expect(anim.animTime()).toBe(2);
		expect(obj.position.x).toBe(2);
		anim.update();
		expect(anim.animTime()).toBe(4);
	});

	it('transition towards the end pose when the speed is negative', () => {
		const { obj, anim } = ramp(10);
		obj.position.set(0, 0, 0);
		anim.animate(3, -1, 0, 2);
		anim.update();
		expect(obj.position.x).toBe(5); // halfway to frame 10
		anim.update();
		expect(anim.animTime()).toBe(9);
	});

	it('transition with speed 0 ends in the pose and stops', () => {
		const { obj, anim } = ramp(10);
		obj.position.set(8, 0, 0);
		anim.animate(1, 0, 0, 2);
		expect(anim.animating()).toBe(true);
		anim.update();
		expect(obj.position.x).toBe(4);
		expect(anim.animating()).toBe(true);
		anim.update();
		expect(obj.position.x).toBe(0);
		expect(anim.animating()).toBe(false);
	});

	it('transition time scales with elapsed', () => {
		const { obj, anim } = ramp(10);
		obj.position.set(100, 0, 0);
		anim.animate(1, 1, 0, 4);
		anim.update(2);
		expect(obj.position.x).toBe(50);
	});

	it('SetAnimTime wraps the time, selects the sequence and stops', () => {
		const { obj, anim } = ramp(10);
		anim.animate(1, 3);
		anim.setAnimTime(13);
		expect(anim.animTime()).toBe(3);
		expect(obj.position.x).toBe(3);
		expect(anim.animating()).toBe(false);
		anim.setAnimTime(-3);
		expect(anim.animTime()).toBe(7);
		anim.setAnimTime(10);
		expect(anim.animTime()).toBe(0);
		anim.setAnimTime(2.5);
		expect(obj.position.x).toBe(2.5);
		anim.setAnimTime(1, 7); // no such sequence
		expect(anim.animTime()).toBe(2.5);
	});

	it('ExtractAnimSeq makes a sequence of length last-first', () => {
		const { obj, anim } = ramp(10);
		expect(anim.extractSeq(2, 5)).toBe(1);
		expect(anim.extractSeq(7, 8)).toBe(2);
		expect(anim.numSeqs()).toBe(3);
		expect(anim.seqFrames(1)).toBe(3);
		anim.animate(1, 1, 1);
		expect(anim.animSeq()).toBe(1);
		expect(anim.animLen()).toBe(3);
		expect(obj.position.x).toBe(2); // frame 2 of the source is frame 0
		// positions 3, 4, then the time wraps at 3 -> 0
		anim.update();
		expect(obj.position.x).toBe(3);
		anim.update();
		expect(obj.position.x).toBe(4);
		anim.update();
		expect(anim.animTime()).toBe(0);
		expect(obj.position.x).toBe(2);
		// one-frame sequence, like ani_move=2,3 of the unit definitions
		anim.animate(2, 0.25, 2);
		expect(anim.animLen()).toBe(1);
		expect(run(anim, 6)).toEqual([0.25, 0.5, 0.75, 1, 0.75, 0.5]);
		expect(obj.position.x).toBe(7.5);
	});

	it('a copy has the sequences of that moment and its own state', () => {
		const { obj, anim } = ramp(10);
		anim.extractSeq(2, 5);
		anim.animate(1, 3);
		run(anim, 2);
		const obj2 = fakeObject();
		const c = Animator.copy(anim, [obj2]);
		expect(c.numSeqs()).toBe(2);
		expect(c.animLen()).toBe(0);
		expect(c.animTime()).toBe(0);
		expect(c.animating()).toBe(false);
		// a sequence extracted later on the source is unknown to the copy
		const late = anim.extractSeq(6, 9);
		expect(late).toBe(2);
		c.animate(1, 1, late);
		expect(c.animating()).toBe(false);
		c.animate(3, 1, 1);
		c.update();
		expect(obj2.position.x).toBe(3);
		expect(obj.position.x).toBe(6);
		expect(anim.animTime()).toBe(6);
	});

	it('only writes the components that have keys', () => {
		const keys = new Animation();
		keys.setRotationKey(0, [0, 0, 0, 1]);
		keys.setRotationKey(2, [0, 0, Math.SQRT1_2, Math.SQRT1_2]);
		const obj = fakeObject();
		obj.position.set(1, 2, 3);
		obj.scale.set(2, 2, 2);
		const a = new Animator([obj], 2, [keys]);
		a.setAnimTime(1);
		expect(obj.position.toArray()).toEqual([1, 2, 3]);
		expect(obj.scale.toArray()).toEqual([2, 2, 2]);
		expect(obj.quaternion.z).toBeCloseTo(Math.sin(Math.PI / 8), 6);
	});
});

describe('brushes (brush.cpp)', () => {
	const image = (transparent: boolean, masked = false): BlitzTexture => ({
		texture: new THREE.Texture(),
		flags: 1,
		transparent,
		masked,
		width: 1,
		height: 1
	});
	it('combines a surface brush with an entity brush', () => {
		const a = new Brush();
		a.r = 0.5;
		a.alpha = 0.5;
		a.shininess = 0.25;
		a.blend = 1;
		a.fx = 2;
		const t0 = new TextureHandle(image(false));
		const t1 = new TextureHandle(image(false));
		a.setTexture(0, t0);
		const b = new Brush();
		b.r = 0.5;
		b.alpha = 0.5;
		b.shininess = 0.5;
		b.fx = 16;
		b.setTexture(2, t1);
		const c = Brush.combine(a, b);
		expect([c.r, c.g, c.alpha, c.shininess, c.blend, c.fx]).toEqual([0.25, 1, 0.25, 0.75, 1, 18]);
		expect(c.texs[0]).toBe(t0);
		expect(c.texs[2]).toBe(t1);
		expect(c.maxTex()).toBe(3);
		b.blend = 3;
		expect(Brush.combine(a, b).blend).toBe(3);
		// the sources are untouched
		expect(a.r).toBe(0.5);
		expect(a.maxTex()).toBe(1);
	});
	it('resolves the blend like Brush::getBlend', () => {
		const opaque = new TextureHandle(image(false));
		const alpha = new TextureHandle(image(true));
		const masked = new TextureHandle(image(true, true));
		const b = new Brush();
		expect(b.getBlend()).toBe(BLEND_REPLACE);
		b.setTexture(0, alpha);
		expect(b.getBlend()).toBe(BLEND_ALPHA); // single transparent texture
		b.setTexture(1, opaque);
		expect(b.getBlend()).toBe(BLEND_REPLACE); // two textures, blend not set
		b.blend = 1;
		expect(b.getBlend()).toBe(BLEND_ALPHA);
		b.blend = 3;
		expect(b.getBlend()).toBe(BLEND_ADD);
		const m = new Brush();
		m.setTexture(0, masked);
		m.blend = 1;
		expect(m.getBlend()).toBe(BLEND_REPLACE); // masked is alpha-tested, not blended
		expect(m.alphaTest()).toBe(true);
		m.alpha = 0.5;
		expect(m.getBlend()).toBe(BLEND_ALPHA);
		const v = new Brush();
		v.fx = 32;
		expect(v.getBlend()).toBe(BLEND_ALPHA);
	});
	it('shares materials between equal render states', () => {
		const t = new TextureHandle(image(true));
		const a = new Brush();
		a.setTexture(0, t);
		const b = a.clone();
		expect(brushMaterial(a, false)).toBe(brushMaterial(b, false));
		const m = brushMaterial(a, false) as THREE.MeshLambertMaterial;
		expect(m.transparent).toBe(true);
		expect(m.depthWrite).toBe(false);
		b.alpha = 0.5;
		expect(brushMaterial(b, false)).not.toBe(m);
		b.alpha = 1;
		b.fx = 1;
		expect((brushMaterial(b, false) as THREE.MeshBasicMaterial).isMeshBasicMaterial).toBe(true);
	});
});

describe('texture loading rules (ddutil.cpp)', () => {
	it('forces alpha to 255 without the alpha flag', () => {
		const d = new Uint8Array([10, 20, 30, 40, 0, 0, 0, 0]);
		applyTextureAlpha(d, TEX_COLOR);
		expect([...d]).toEqual([10, 20, 30, 255, 0, 0, 0, 255]);
	});
	it('masks pure black', () => {
		const d = new Uint8Array([0, 0, 0, 255, 0, 0, 1, 0]);
		applyTextureAlpha(d, TEX_COLOR | TEX_ALPHA | TEX_MASKED);
		expect([...d]).toEqual([0, 0, 0, 0, 0, 0, 1, 255]);
	});
	it('alpha flag without alpha channel: integer mean of r, g, b', () => {
		const d = new Uint8Array([255, 255, 254, 255, 10, 20, 31, 255]);
		applyTextureAlpha(d, TEX_COLOR | TEX_ALPHA);
		expect([...d]).toEqual([255, 255, 254, 254, 10, 20, 31, 20]);
		const w = new Uint8Array([10, 20, 31, 255]);
		applyTextureAlpha(w, TEX_ALPHA);
		expect([...w]).toEqual([255, 255, 255, 20]);
	});
	it('recognises formats with an alpha channel from the header', () => {
		const png = (colorType: number) => {
			const b = new Uint8Array(64);
			b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
			b[24] = 8;
			b[25] = colorType;
			b.set([0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54], 33);
			return b;
		};
		expect(imageHasAlphaFormat(png(6))).toBe(true);
		expect(imageHasAlphaFormat(png(2))).toBe(false);
		const bmp = new Uint8Array(54);
		bmp.set([0x42, 0x4d]);
		bmp[28] = 24;
		expect(imageHasAlphaFormat(bmp)).toBe(false);
		bmp[28] = 32;
		expect(imageHasAlphaFormat(bmp)).toBe(true);
	});
	it('texture transform matches Texture::getMatrix', () => {
		const img: BlitzTexture = {
			texture: new THREE.Texture(),
			flags: 1,
			transparent: false,
			masked: false,
			width: 1,
			height: 1
		};
		const h = new TextureHandle(img);
		expect(h.blend).toBe(2);
		h.scale(2, 4).position(0.25, 0.5);
		const uv = new THREE.Vector3(1, 1, 1).applyMatrix3(h.matrix);
		// u' = u/2 - .25, v' = v/4 - .5
		expect(uv.x).toBeCloseTo(0.25);
		expect(uv.y).toBeCloseTo(-0.25);
		const r = new TextureHandle(img).rotate(90);
		// rot = -90 degrees: u' = u*cos + v*sin = -v, v' = -u*sin + v*cos = u
		const p = new THREE.Vector3(1, 0, 1).applyMatrix3(r.matrix);
		expect(p.x).toBeCloseTo(0);
		expect(p.y).toBeCloseTo(1);
	});
});

// Tests below run against the original game data copied by `pnpm sync-assets`.
const root = resolve('static/game/mod');
const have = existsSync(root);
const vfs = have ? new NodeVfs(root) : (undefined as unknown as NodeVfs);

function allNodes(n: B3dNode, out: B3dNode[] = []): B3dNode[] {
	out.push(n);
	for (const c of n.children) allNodes(c, out);
	return out;
}

async function loadModel(path: string): Promise<B3dModel> {
	return parseB3d(await vfs.readBytes(path));
}

/** Stand-in images, so that the brushes have their texture layers. */
function fakeImages(model: B3dModel): BlitzTexture[] {
	return model.textures.map((t) => ({
		texture: new THREE.Texture(),
		flags: t.flags | (/_a/i.test(t.file) ? TEX_ALPHA : 0),
		transparent: /_a/i.test(t.file),
		masked: false,
		width: 1,
		height: 1
	}));
}

describe.skipIf(!have)('models of the original game', () => {
	it('builds every model as LoadMesh and as LoadAnimMesh', async () => {
		const files = vfs.all().filter((p) => /\.b3d$/i.test(p));
		expect(files.length).toBeGreaterThan(300);
		let skinned = 0;
		for (const path of files) {
			const model = await loadModel(path);
			const brushes = modelBrushes(model, fakeImages(model));
			try {
				// LoadMesh
				const rep = buildCollapsedRep(model, brushes);
				const pos = rep.geometry.getAttribute('position');
				const index = rep.geometry.getIndex()!;
				expect(index.count % 3).toBe(0);
				for (let i = 0; i < index.count; i++) expect(index.getX(i)).toBeLessThan(pos.count);
				for (let i = 0; i < pos.count * 3; i++) expect(Number.isFinite(pos.array[i])).toBe(true);
				expect(rep.surfaces.length).toBe(rep.geometry.groups.length);
				const mesh = createMeshEntity(rep);
				expect((mesh.material as THREE.Material[]).length).toBe(rep.surfaces.length);

				// LoadAnimMesh
				const e = createAnimMesh(model, brushes);
				const nodes = allNodes(model.root!);
				let count = 0;
				e.traverse(() => count++);
				expect(count).toBe(nodes.length);
				expect(e.name).toBe(model.root!.name);
				expect(countChildren(e)).toBe(model.root!.children.length);
				for (const n of nodes) expect(findChild(e, n.name)).toBeDefined();

				const anim = getAnimator(e);
				if (model.root!.anim?.frames) {
					expect(anim).toBeDefined();
					expect(animLength(e)).toBe(model.root!.anim.frames);
					expect(animating(e)).toBe(false);
					expect(animTime(e)).toBe(0);
				}

				e.traverse((o) => {
					const sm = o as THREE.SkinnedMesh;
					if (!sm.isSkinnedMesh) return;
					skinned++;
					const r = meshRep(sm)!;
					const bones = sm.skeleton.bones;
					expect(bones[0]).toBe(sm);
					expect(bones.length).toBe(r.boneInverses!.length);
					expect(getAnimator(sm)!.getObjects().length).toBe(bones.length);
					expect(bones.length).toBeLessThan(255);
					const si = r.geometry.getAttribute('skinIndex');
					const sw = r.geometry.getAttribute('skinWeight');
					expect(si.count).toBe(r.geometry.getAttribute('position').count);
					for (let v = 0; v < si.count; v++) {
						let sum = 0;
						for (let k = 0; k < 4; k++) {
							const w = sw.getComponent(v, k);
							expect(si.getComponent(v, k)).toBeLessThan(bones.length);
							expect(w).toBeGreaterThanOrEqual(0);
							// weights are in descending order (MeshLoader::addBone)
							if (k) expect(w).toBeLessThanOrEqual(sw.getComponent(v, k - 1) + 1e-6);
							sum += w;
						}
						expect(sum).toBeCloseTo(1, 4);
					}
				});
			} catch (err) {
				throw new Error(`${path}: ${err instanceof Error ? err.message : err}`, { cause: err });
			}
		}
		expect(skinned).toBeGreaterThan(30);
	});

	it('bone and vertex indices of the files are valid', async () => {
		for (const path of vfs.all().filter((p) => /\.b3d$/i.test(p))) {
			const model = await loadModel(path);
			const walk = (n: B3dNode, mesh: B3dNode | undefined) => {
				if (n.mesh) {
					mesh = n;
					for (const s of n.mesh.surfaces) {
						expect(s.indices.length % 3, path).toBe(0);
						expect(s.brush, path).toBeLessThan(model.brushes.length);
						for (const i of s.indices) expect(i, path).toBeLessThan(n.mesh.vertexCount);
					}
				}
				if (n.bone) {
					expect(mesh, `${path}: bone ${n.name} outside a mesh`).toBeDefined();
					for (const v of n.bone.vertices) expect(v, path).toBeLessThan(mesh!.mesh!.vertexCount);
				}
				for (const k of n.keys) expect(Number.isInteger(k.frame), path).toBe(true);
				for (const c of n.children) walk(c, mesh);
			};
			walk(model.root!, undefined);
			for (const b of model.brushes) {
				for (const t of b.textures) expect(t, path).toBeLessThan(model.textures.length);
			}
		}
	});

	it('the bind pose leaves the vertices where the file has them', async () => {
		const model = await loadModel('gfx\\monkey.b3d');
		const e = createAnimMesh(model, modelBrushes(model, []));
		// Undo the frame-0 pose LoadAnimMesh applies: put the file transforms back.
		const restore = (o: THREE.Object3D, n: B3dNode) => {
			o.position.set(...n.position);
			o.scale.set(...n.scale);
			o.quaternion.copy(blitzQuat(n.rotation));
			n.children.forEach((c, i) => restore(o.children[i], c));
		};
		restore(e, model.root!);
		e.updateMatrixWorld(true);
		const sm = e as THREE.SkinnedMesh;
		expect(sm.isSkinnedMesh).toBe(true);
		const inv = meshRep(sm)!.boneInverses!;
		const m = new THREE.Matrix4();
		const ident = new THREE.Matrix4().elements;
		sm.skeleton.bones.forEach((b, k) => {
			m.multiplyMatrices(b.matrixWorld, inv[k]);
			m.elements.forEach((x, i) => expect(x).toBeCloseTo(ident[i], 4));
		});
	});

	it('skins like Surface::getMesh( bones ): sum of weight * boneWorld * inverseBind * vertex', async () => {
		const model = await loadModel('gfx\\raptor.b3d');
		const e = createAnimMesh(model, modelBrushes(model, [])) as THREE.SkinnedMesh;
		const scene = new THREE.Group();
		scene.position.set(100, 20, -50);
		scene.add(e);
		e.position.set(5, 6, 7);
		e.scale.set(2, 2, 2);
		e.rotation.set(0.1, 0.7, 0);
		setAnimTime(e, 6.5);
		scene.updateMatrixWorld(true);
		e.skeleton.update();

		const rep = meshRep(e)!;
		const pos = rep.geometry.getAttribute('position');
		const si = rep.geometry.getAttribute('skinIndex');
		const sw = rep.geometry.getAttribute('skinWeight');
		const bones = e.skeleton.bones;
		const v = new THREE.Vector3();
		const expected = new THREE.Vector3();
		const got = new THREE.Vector3();
		const m = new THREE.Matrix4();
		let moved = 0;
		for (let i = 0; i < pos.count; i += 7) {
			expected.set(0, 0, 0);
			for (let k = 0; k < 4; k++) {
				const w = sw.getComponent(i, k);
				if (!w) continue;
				const b = si.getComponent(i, k);
				m.multiplyMatrices(bones[b].matrixWorld, rep.boneInverses![b]);
				expected.addScaledVector(v.fromBufferAttribute(pos, i).applyMatrix4(m), w);
			}
			// What Three's skinning shader computes, in world space.
			e.getVertexPosition(i, got).applyMatrix4(e.matrixWorld);
			expect(got.distanceTo(expected)).toBeLessThan(1e-2);
			if (expected.distanceTo(v.fromBufferAttribute(pos, i)) > 1) moved++;
		}
		expect(moved).toBeGreaterThan(0);
	});

	it('plays the animation of a unit and moves its bones', async () => {
		const model = await loadModel('gfx\\raptor.b3d');
		const e = createAnimMesh(model, modelBrushes(model, []));
		expect(animLength(e)).toBe(16);
		// units.inf: ani_move=2,3,0.06 for the raptor
		const move = extractAnimSeq(e, 2, 3);
		expect(move).toBe(1);
		const bone = findChild(e, 'neck')!;
		expect(bone).toBeDefined();
		animate(e, 2, 0.06, move);
		expect(animSeq(e)).toBe(move);
		expect(animLength(e)).toBe(1);
		const q0 = bone.quaternion.clone();
		const root = new THREE.Group();
		root.add(e);
		for (let i = 0; i < 10; i++) updateWorld(root, 1);
		expect(animTime(e)).toBeCloseTo(0.6, 5);
		expect(animating(e)).toBe(true);
		const anyMoved = (() => {
			let moved = false;
			e.traverse((o) => {
				if (o !== e && (o as THREE.Bone).isBone && o.quaternion.angleTo(o === bone ? q0 : o.quaternion) > 1e-4) moved = true;
			});
			return moved;
		})();
		// The neck may be still in this sequence; some bone must differ between the two frames.
		const pose = () => {
			const out: number[] = [];
			e.traverse((o) => out.push(...o.quaternion.toArray(), ...o.position.toArray()));
			return out;
		};
		setAnimTime(e, 0, move);
		const p0 = pose();
		setAnimTime(e, 0.999, move);
		const p1 = pose();
		expect(anyMoved || p0.some((x, i) => Math.abs(x - p1[i]) > 1e-4)).toBe(true);

		// hidden entities are not updated
		animate(e, 1, 0.5, 0);
		e.visible = false;
		updateWorld(root, 1);
		expect(animTime(e)).toBe(0);
		e.visible = true;
		updateWorld(root, 1);
		expect(animTime(e)).toBe(0.5);
	});

	it('CopyEntity gives independent animation over shared geometry', async () => {
		const model = await loadModel('gfx\\lion.b3d');
		const src = createAnimMesh(model, modelBrushes(model, fakeImages(model))) as THREE.SkinnedMesh;
		const seq = extractAnimSeq(src, 8, 10);
		src.visible = false; // HideEntity on the definition's model, as load_units.bb does
		const a = copyEntity(src);
		const b = copyEntity(src);
		expect(a.visible).toBe(true);
		expect(a).not.toBe(src);
		expect(a.isSkinnedMesh).toBe(true);
		expect(a.geometry).toBe(src.geometry);
		expect(a.skeleton).not.toBe(src.skeleton);
		expect(a.skeleton.bones[0]).toBe(a);
		expect(a.skeleton.bones.length).toBe(src.skeleton.bones.length);
		// every bone of the copy is inside the copy
		for (const bone of a.skeleton.bones) {
			let p: THREE.Object3D | null = bone;
			while (p && p !== a) p = p.parent;
			expect(p).toBe(a);
		}
		expect(getChild(a, 1)!.name).toBe(getChild(src, 1)!.name);
		expect(getChild(a, 1)).not.toBe(getChild(src, 1));
		// the copy knows the sequences and is reset
		expect(getAnimator(a)!.numSeqs()).toBe(2);
		expect(animLength(a)).toBe(0);
		expect(animLength(src)).toBe(15);

		animate(a, 1, 0.5, seq);
		const before = b.children[0].quaternion.clone();
		for (let i = 0; i < 3; i++) updateWorld(a);
		expect(animTime(a)).toBe(1.5);
		expect(animTime(b)).toBe(0);
		expect(b.children[0].quaternion.equals(before)).toBe(true);

		// entity brushes are per copy
		entityColor(a, 255, 0, 0);
		entityAlpha(a, 0.5);
		const ma = (a.material as THREE.MeshLambertMaterial[])[0];
		const mb = (b.material as THREE.MeshLambertMaterial[])[0];
		expect(ma).not.toBe(mb);
		expect(ma.color.g).toBe(0);
		expect(ma.transparent).toBe(true);
		expect(mb.color.g).toBeGreaterThan(0);
		expect(mb).toBe((src.material as THREE.Material[])[0]);
		expect(meshWidth(a)).toBe(meshWidth(src));
		expect(meshHeight(a)).toBeGreaterThan(0);
	});

	it('EntityAutoFade fades between near and far and hides beyond', async () => {
		const model = await loadModel('gfx\\palm01.b3d');
		const rep = buildCollapsedRep(model, modelBrushes(model, []));
		const e = createMeshEntity(rep);
		const scene = new THREE.Group();
		scene.add(e);
		entityAutoFade(e, 100, 200);
		const mat = () => (e.material as THREE.MeshLambertMaterial[])[0];
		const full = mat().opacity; // the alpha of the brush in the file
		updateAutoFade(scene, new THREE.Vector3(0, 0, 50));
		expect(mat().opacity).toBe(full);
		expect(mat().visible).toBe(true);
		updateAutoFade(scene, new THREE.Vector3(0, 0, 150));
		expect(mat().opacity).toBeCloseTo(full * 0.5, 2);
		expect(mat().transparent).toBe(true);
		updateAutoFade(scene, new THREE.Vector3(0, 0, 200));
		expect(mat().visible).toBe(false);
		updateAutoFade(scene, new THREE.Vector3(0, 0, 10));
		expect(mat().opacity).toBe(full);
		expect(mat().visible).toBe(true);
		// MeshWidth of a collapsed model is the box of all its vertices
		expect(meshWidth(e)).toBeCloseTo(rep.box.max.x - rep.box.min.x);
	});
});
