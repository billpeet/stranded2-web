/**
 * Optional glue between the collision module (pure Blitz maths) and Three.js
 * objects that hold Blitz coordinates verbatim (see engine/blitzSpace.ts).
 * A Blitz world matrix and the THREE.Matrix4 of the mirrored object are
 * numerically identical; only the quaternion convention differs (conjugate).
 */
import type * as THREE from 'three';
import type { Entity } from './entity';
import { Matrix, Quat, Transform, Vector } from './geom';
import { MeshCollider, type ColliderSurface } from './meshCollider';

/** THREE.Matrix4 (column-major elements) -> Blitz Transform. */
export function transformFromMatrix4(m: { elements: ArrayLike<number> }): Transform {
	const e = m.elements;
	return new Transform(
		new Matrix(new Vector(e[0], e[1], e[2]), new Vector(e[4], e[5], e[6]), new Vector(e[8], e[9], e[10])),
		new Vector(e[12], e[13], e[14])
	);
}

/** Blitz Transform -> 16 column-major elements (THREE.Matrix4.fromArray). */
export function matrix4Elements(t: Transform): number[] {
	const { i, j, k } = t.m;
	return [i.x, i.y, i.z, 0, j.x, j.y, j.z, 0, k.x, k.y, k.z, 0, t.v.x, t.v.y, t.v.z, 1];
}

/**
 * Copies the entity's LOCAL position/rotation/scale onto a THREE.Object3D
 * (whose parent must mirror the entity's parent). Call after UpdateWorld for
 * entities that have a collision type.
 */
export function syncObject3D(e: Entity, o: THREE.Object3D): void {
	const p = e.getLocalPosition(),
		s = e.getLocalScale(),
		q = e.getLocalRotation();
	o.position.set(p.x, p.y, p.z);
	o.scale.set(s.x, s.y, s.z);
	o.quaternion.set(-q.v.x, -q.v.y, -q.v.z, q.w);
}

/** The reverse of syncObject3D. */
export function syncEntity(o: THREE.Object3D, e: Entity): void {
	e.setLocalPosition(new Vector(o.position.x, o.position.y, o.position.z));
	e.setLocalScale(new Vector(o.scale.x, o.scale.y, o.scale.z));
	e.setLocalRotation(new Quat(o.quaternion.w, new Vector(-o.quaternion.x, -o.quaternion.y, -o.quaternion.z)));
}

/**
 * MeshCollider from a BufferGeometry created by b3dToThree / terrain.ts, i.e.
 * positions in Blitz coordinates and an index in THREE winding (reversed by
 * toThreeWinding). The winding is reversed back here. Geometry groups become
 * surfaces (CollisionSurface/PickedSurface report the group index).
 */
export function meshColliderFromGeometry(geo: THREE.BufferGeometry): MeshCollider {
	const pos = geo.getAttribute('position');
	const positions = new Float32Array(pos.count * 3);
	for (let i = 0; i < pos.count; i++) {
		positions[i * 3] = pos.getX(i);
		positions[i * 3 + 1] = pos.getY(i);
		positions[i * 3 + 2] = pos.getZ(i);
	}
	const index = geo.getIndex();
	const count = index ? index.count : pos.count;
	const at = (i: number) => (index ? index.getX(i) : i);
	const groups = geo.groups.length ? geo.groups : [{ start: 0, count, materialIndex: 0 }];
	const surfaces: ColliderSurface[] = groups.map((g, gi) => {
		const n = Math.floor(Math.min(g.count, count - g.start) / 3);
		const indices = new Uint32Array(n * 3);
		for (let t = 0; t < n; t++) {
			const o = g.start + t * 3;
			indices[t * 3] = at(o);
			indices[t * 3 + 1] = at(o + 2);
			indices[t * 3 + 2] = at(o + 1);
		}
		return { positions, indices, surface: gi };
	});
	return MeshCollider.fromSurfaces(surfaces);
}
