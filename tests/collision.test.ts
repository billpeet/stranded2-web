import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { rotateEntity } from '../src/lib/s2/engine/blitzSpace';
import {
	AlignToVector,
	CameraViewport,
	Collision,
	CollisionEntity,
	CollisionNX,
	CollisionNY,
	CollisionTime,
	CollisionWorld,
	CollisionX,
	CollisionY,
	CollisionZ,
	CopyEntity,
	CountCollisions,
	DeltaPitch,
	DeltaYaw,
	EntityBox,
	EntityCollided,
	EntityDistance,
	EntityInView,
	EntityParent,
	EntityPickMode,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	Line,
	Matrix,
	MeshCollider,
	MeshesIntersect,
	ModifyTerrain,
	MoveEntity,
	PointEntity,
	PositionEntity,
	ResetEntity,
	RotateEntity,
	ScaleEntity,
	ShowEntity,
	TFormedX,
	TFormedY,
	TFormedZ,
	TFormNormal,
	TFormPoint,
	TFormVector,
	TerrainCollider,
	TerrainHeight,
	TerrainY,
	Transform,
	TranslateEntity,
	TurnEntity,
	Vector,
	dtor,
	matrix4Elements,
	meshColliderFromB3d,
	meshColliderFromGeometry,
	rotationMatrix,
	rotationQuat,
	syncObject3D,
	type Entity
} from '../src/lib/s2/engine/collision';
import { parseB3d } from '../src/lib/s2/formats/b3d';
import { NodeVfs } from './NodeVfs';

// ---------------------------------------------------------------------------
// Fixtures. Blitz winding: front faces are clockwise, normal = (v1-v0)x(v2-v0).
// ---------------------------------------------------------------------------

function quad(p: number[][]): MeshCollider {
	return MeshCollider.fromSurfaces([{ positions: p.flat(), indices: [0, 1, 2, 0, 2, 3] }]);
}
/** 20x20 floor at y=0 facing +Y */
const floorMesh = () =>
	quad([
		[-10, 0, -10],
		[-10, 0, 10],
		[10, 0, 10],
		[10, 0, -10]
	]);
/** wall in the plane x=5 facing -X */
const wallMesh = () =>
	quad([
		[5, -10, -20],
		[5, -10, 20],
		[5, 10, 20],
		[5, 10, -20]
	]);
/** wall in the plane z=10 facing -Z */
const frontWallMesh = () =>
	quad([
		[-20, -20, 10],
		[-20, 20, 10],
		[20, 20, 10],
		[20, -20, 10]
	]);
/** 45 degree slope through the origin, normal (1,1,0)/sqrt2 (descends towards +X) */
const slopeMesh = () =>
	quad([
		[-10, 10, -10],
		[-10, 10, 10],
		[10, -10, 10],
		[10, -10, -10]
	]);

const WORLD = 2,
	UNIT = 1;

function mover(world: CollisionWorld, x: number, y: number, z: number, rx = 1, ry = 0): Entity {
	const p = world.CreatePivot();
	PositionEntity(p, x, y, z);
	EntityRadius(p, rx, ry);
	EntityType(p, UNIT);
	return p;
}

describe('geom / entity maths', () => {
	it('Matrix(rotationQuat) equals rotationMatrix and the Three convention of blitzSpace.rotateEntity', () => {
		const o = new THREE.Object3D();
		for (const [p, y, r] of [
			[30, 0, 0],
			[0, 40, 0],
			[0, 0, 50],
			[10, -70, 25],
			[-80, 190, -33]
		]) {
			const a = Matrix.fromQuat(rotationQuat(p * dtor, y * dtor, r * dtor));
			const b = rotationMatrix(p * dtor, y * dtor, r * dtor);
			rotateEntity(o, p, y, r);
			o.updateMatrix();
			const e = o.matrix.elements;
			const cols = [a.i, a.j, a.k],
				colsB = [b.i, b.j, b.k];
			for (let c = 0; c < 3; c++) {
				for (let k = 0; k < 3; k++) {
					expect(cols[c].get(k)).toBeCloseTo(colsB[c].get(k), 10);
					expect(cols[c].get(k)).toBeCloseTo(e[c * 4 + k], 10);
				}
			}
		}
	});

	it('RotateEntity / EntityPitch,Yaw,Roll round trip; yaw turns +Z towards -X', () => {
		const w = new CollisionWorld();
		const e = w.CreatePivot();
		RotateEntity(e, 20, 30, 40);
		expect(EntityPitch(e)).toBeCloseTo(20, 8);
		expect(EntityYaw(e)).toBeCloseTo(30, 8);
		expect(EntityRoll(e)).toBeCloseTo(40, 8);
		RotateEntity(e, 0, 90, 0);
		MoveEntity(e, 0, 0, 1);
		expect(EntityX(e)).toBeCloseTo(-1, 10);
		expect(EntityZ(e)).toBeCloseTo(0, 10);
		// positive pitch looks down
		PositionEntity(e, 0, 0, 0);
		RotateEntity(e, 90, 0, 0);
		MoveEntity(e, 0, 0, 1);
		expect(EntityY(e)).toBeCloseTo(-1, 10);
	});

	it('TurnEntity, TranslateEntity and parenting', () => {
		const w = new CollisionWorld();
		const parent = w.CreatePivot();
		PositionEntity(parent, 10, 0, 0);
		ScaleEntity(parent, 2, 2, 2);
		const child = w.CreatePivot(parent);
		PositionEntity(child, 1, 2, 3);
		expect(EntityX(child, 1)).toBeCloseTo(12);
		expect(EntityY(child, 1)).toBeCloseTo(4);
		expect(EntityZ(child, 1)).toBeCloseTo(6);
		PositionEntity(child, 0, 0, 0, 1);
		expect(EntityX(child)).toBeCloseTo(-5);
		TranslateEntity(child, 2, 0, 0, 1);
		expect(EntityX(child, 1)).toBeCloseTo(2);
		// EntityParent global keeps the world transform
		EntityParent(child, null);
		expect(EntityX(child)).toBeCloseTo(2);
		expect(child.getLocalScale().x).toBeCloseTo(2);
		RotateEntity(child, 0, 10, 0);
		TurnEntity(child, 0, 25, 0);
		expect(EntityYaw(child)).toBeCloseTo(35, 8);
	});

	it('EntityDistance, DeltaYaw, DeltaPitch, PointEntity', () => {
		const w = new CollisionWorld();
		const a = w.CreatePivot(),
			b = w.CreatePivot();
		PositionEntity(b, 3, 4, 0);
		expect(EntityDistance(a, b)).toBeCloseTo(5, 12);

		PositionEntity(b, 1, 0, 0);
		// yaw of a vector is -atan2(x,z): +X is at yaw -90
		expect(DeltaYaw(a, b)).toBeCloseTo(-90, 8);
		PositionEntity(b, -1, 0, 1);
		expect(DeltaYaw(a, b)).toBeCloseTo(45, 8);
		RotateEntity(a, 0, 170, 0);
		PositionEntity(b, 1, 0, -1); // vector yaw -135 -> delta -305 -> wraps to 55
		expect(DeltaYaw(a, b)).toBeCloseTo(55, 8);

		RotateEntity(a, 0, 0, 0);
		PositionEntity(b, 0, 1, 1);
		// pitch of a vector is -atan2(y,|xz|): up is negative pitch
		expect(DeltaPitch(a, b)).toBeCloseTo(-45, 8);
		PointEntity(a, b);
		expect(EntityPitch(a)).toBeCloseTo(-45, 8);
		expect(EntityYaw(a)).toBeCloseTo(0, 8);
		expect(DeltaPitch(a, b)).toBeCloseTo(0, 8);

		PositionEntity(b, 5, -2, 3);
		PointEntity(a, b);
		expect(DeltaYaw(a, b)).toBeCloseTo(0, 8);
		expect(DeltaPitch(a, b)).toBeCloseTo(0, 8);
		// the entity's Z axis now points at the target
		const k = a.getWorldTform().m.k;
		const d = new Vector(5, -2, 3).normalized();
		expect(k.x).toBeCloseTo(d.x, 10);
		expect(k.y).toBeCloseTo(d.y, 10);
		expect(k.z).toBeCloseTo(d.z, 10);
	});

	it('AlignToVector aligns the chosen axis', () => {
		const w = new CollisionWorld();
		const a = w.CreatePivot();
		RotateEntity(a, 10, 20, 30);
		AlignToVector(a, 1, 1, 0, 2);
		const j = a.getWorldTform().m.j;
		expect(j.x).toBeCloseTo(Math.SQRT1_2, 8);
		expect(j.y).toBeCloseTo(Math.SQRT1_2, 8);
		expect(j.z).toBeCloseTo(0, 8);
	});

	it('TFormPoint / TFormVector / TFormNormal', () => {
		const w = new CollisionWorld();
		const e = w.CreatePivot();
		PositionEntity(e, 10, 20, 30);
		ScaleEntity(e, 2, 4, 2);
		RotateEntity(e, 0, 90, 0); // local +Z -> world -X, local +X -> world +Z
		TFormPoint(0, 1, 1, e, null);
		expect([TFormedX(), TFormedY(), TFormedZ()].map((v) => +v.toFixed(9))).toEqual([8, 24, 30]);
		TFormPoint(8, 24, 30, null, e);
		expect([TFormedX(), TFormedY(), TFormedZ()].map((v) => +v.toFixed(9) + 0)).toEqual([0, 1, 1]);
		TFormVector(1, 0, 0, e, null); // scaled, not translated
		expect([TFormedX(), TFormedY(), TFormedZ()].map((v) => +v.toFixed(9) + 0)).toEqual([0, 0, 2]);
		TFormVector(0, 0, 2, null, e);
		expect([TFormedX(), TFormedY(), TFormedZ()].map((v) => +v.toFixed(9) + 0)).toEqual([1, 0, 0]);
		// normals use the cofactor matrix and come back normalized
		TFormNormal(1, 1, 0, e, null);
		// local normal (1,1,0): x scale 2, y scale 4 -> inverse-transpose gives (1/2,1/4) -> world (0, .25, .5)/len
		const len = Math.hypot(0.25, 0.5);
		expect(TFormedX()).toBeCloseTo(0, 9);
		expect(TFormedY()).toBeCloseTo(0.25 / len, 9);
		expect(TFormedZ()).toBeCloseTo(0.5 / len, 9);
	});

	it('three.js bridge mirrors transforms', () => {
		const w = new CollisionWorld();
		const e = w.CreatePivot();
		PositionEntity(e, 1, 2, 3);
		ScaleEntity(e, 2, 3, 4);
		RotateEntity(e, 15, 25, 35);
		const o = new THREE.Object3D();
		syncObject3D(e, o);
		o.updateMatrix();
		const m = matrix4Elements(e.getWorldTform());
		for (let i = 0; i < 16; i++) expect(o.matrix.elements[i]).toBeCloseTo(m[i], 10);
	});
});

describe('picking', () => {
	it('LinePick on a known triangle: point, normal, time, entity, triangle', () => {
		const w = new CollisionWorld();
		const floor = w.CreateMesh(floorMesh());
		// no pick mode yet: not pickable
		expect(w.LinePick(1, 5, 1, 0, -10, 0)).toBeNull();
		EntityPickMode(floor, 2);
		expect(w.LinePick(1, 5, 1, 0, -10, 0)).toBe(floor);
		expect(w.PickedTime()).toBeCloseTo(0.5, 12);
		expect([w.PickedX(), w.PickedY(), w.PickedZ()]).toEqual([1, 0, 1]);
		expect([w.PickedNX(), w.PickedNY(), w.PickedNZ()]).toEqual([0, 1, 0]);
		expect(w.PickedEntity()).toBe(floor);
		expect(w.PickedSurface()).toBe(0);
		// (1,1) lies in the second triangle (0,2,3)? x>z side -> triangle 1; x==z is on the shared edge,
		// both accept; the later one wins only if strictly... t equal passes 't>time' so the last tested wins.
		expect(w.PickedTriangle()).toBe(1);
		expect(w.LinePick(-5, 5, 5, 0, -10, 0)).toBe(floor);
		expect(w.PickedTriangle()).toBe(0);

		// back faces are not hit
		expect(w.LinePick(1, -5, 1, 0, 10, 0)).toBeNull();
		// too short
		expect(w.LinePick(1, 5, 1, 0, -4.9, 0)).toBeNull();
		// a miss keeps the old coordinates but clears the entity and resets time to 1
		expect(w.PickedEntity()).toBeNull();
		expect(w.PickedTime()).toBe(1);
		// outside the quad
		expect(w.LinePick(11, 5, 1, 0, -10, 0)).toBeNull();
	});

	it('pick radius: face hit is offset by the radius, edges are rounded', () => {
		const w = new CollisionWorld();
		const floor = w.CreateMesh(floorMesh());
		EntityPickMode(floor, 2);
		expect(w.LinePick(1, 5, 1, 0, -10, 0, 1)).toBe(floor);
		expect(w.PickedTime()).toBeCloseTo(0.4, 12);
		// Picked position = sphere centre at impact - normal*radius = the contact point
		expect(w.PickedX()).toBeCloseTo(1, 12);
		expect(w.PickedY()).toBeCloseTo(0, 12);
		expect(w.PickedZ()).toBeCloseTo(1, 12);

		// half a unit outside the x=10 edge: a ray misses, a radius-1 sphere touches the edge
		expect(w.LinePick(10.5, 5, 0, 0, -10, 0)).toBeNull();
		expect(w.LinePick(10.5, 5, 0, 0, -10, 0, 1)).toBe(floor);
		const h = Math.sqrt(1 - 0.25);
		expect(w.PickedTime()).toBeCloseTo((5 - h) / 10, 10);
		expect(w.PickedNX()).toBeCloseTo(0.5, 10);
		expect(w.PickedNY()).toBeCloseTo(h, 10);
		expect(w.PickedX()).toBeCloseTo(10, 10);
		expect(w.PickedY()).toBeCloseTo(0, 10);
		// 1.5 outside: nothing
		expect(w.LinePick(11.5, 5, 0, 0, -10, 0, 1)).toBeNull();
	});

	it('nearest of several entities wins; hidden entities are ignored', () => {
		const w = new CollisionWorld();
		const low = w.CreateMesh(floorMesh());
		const high = w.CreateMesh(floorMesh());
		PositionEntity(high, 0, 2, 0);
		EntityPickMode(low, 2);
		EntityPickMode(high, 2);
		expect(w.LinePick(0, 5, 1, 0, -10, 0)).toBe(high);
		expect(w.PickedY()).toBeCloseTo(2, 12);
		HideEntity(high);
		expect(w.LinePick(0, 5, 1, 0, -10, 0)).toBe(low);
		ShowEntity(high);
		expect(w.LinePick(0, 5, 1, 0, -10, 0)).toBe(high);
		EntityPickMode(high, 0);
		expect(w.LinePick(0, 5, 1, 0, -10, 0)).toBe(low);
		FreeEntity(low);
		expect(w.LinePick(0, 5, 1, 0, -10, 0)).toBeNull();
	});

	it('scaled, moved and rotated colliders', () => {
		const w = new CollisionWorld();
		const floor = w.CreateMesh(floorMesh());
		EntityPickMode(floor, 2);
		PositionEntity(floor, 0, 3, 0);
		ScaleEntity(floor, 2, 1, 2);
		// x=15 is outside the unscaled quad but inside the scaled one
		expect(w.LinePick(15, 5, 1, 0, -10, 0)).toBe(floor);
		expect(w.PickedY()).toBeCloseTo(3, 12);
		expect(w.PickedTime()).toBeCloseTo(0.2, 12);
		expect(w.LinePick(21, 5, 1, 0, -10, 0)).toBeNull();

		// roll +90: local +Y -> world -X (rollMatrix j = (-sin,cos,0)); the floor becomes a wall facing -X
		ScaleEntity(floor, 1, 1, 1);
		PositionEntity(floor, 2, 0, 0);
		RotateEntity(floor, 0, 0, 90);
		expect(w.LinePick(-5, 1, 1, 10, 0, 0)).toBe(floor);
		expect(w.PickedX()).toBeCloseTo(2, 10);
		expect(w.PickedNX()).toBeCloseTo(-1, 10);
		expect(w.PickedNY()).toBeCloseTo(0, 10);
		expect(w.PickedTime()).toBeCloseTo(0.7, 10);
		// from behind: nothing
		expect(w.LinePick(5, 1, 1, -10, 0, 0)).toBeNull();

		// child of a scaled, rotated parent
		const parent = w.CreatePivot();
		const child = w.CreateMesh(floorMesh(), parent);
		EntityPickMode(floor, 0);
		EntityPickMode(child, 2);
		PositionEntity(child, 0, 1, 0);
		ScaleEntity(parent, 3, 3, 3);
		RotateEntity(parent, 0, 45, 0);
		PositionEntity(parent, 100, 0, 0);
		expect(w.LinePick(100, 50, 0, 0, -100, 0)).toBe(child);
		expect(w.PickedY()).toBeCloseTo(3, 10);
		// corner of the quad now reaches 30*sqrt2 along the world axes
		expect(w.LinePick(100 + 41, 50, 0, 0, -100, 0)).toBe(child);
		expect(w.LinePick(100 + 43, 50, 0, 0, -100, 0)).toBeNull();
	});

	it('pick mode 1 (sphere) uses EntityRadius x and the entity position', () => {
		const w = new CollisionWorld();
		const s = w.CreatePivot();
		PositionEntity(s, 0, 0, 10);
		EntityRadius(s, 2);
		EntityPickMode(s, 1);
		expect(w.LinePick(0, 0, 0, 0, 0, 20)).toBe(s);
		expect(w.PickedTime()).toBeCloseTo(0.4, 12);
		expect(w.PickedZ()).toBeCloseTo(8, 12);
		expect(w.PickedNZ()).toBeCloseTo(-1, 12);
		// with a pick radius the radii add
		expect(w.LinePick(0, 0, 0, 0, 0, 20, 1)).toBe(s);
		expect(w.PickedTime()).toBeCloseTo(0.35, 12);
		expect(w.PickedZ()).toBeCloseTo(8, 12);
		expect(w.LinePick(2.5, 0, 0, 0, 0, 20)).toBeNull();
	});

	it('pick mode 3 (box) uses EntityBox in the entity frame without scale', () => {
		const w = new CollisionWorld();
		const b = w.CreatePivot();
		EntityBox(b, -1, -1, -1, 2, 2, 2);
		EntityPickMode(b, 3);
		PositionEntity(b, 0, 0, 0);
		expect(w.LinePick(0.5, 5, 0.5, 0, -10, 0)).toBe(b);
		expect(w.PickedTime()).toBeCloseTo(0.4, 12);
		expect(w.PickedY()).toBeCloseTo(1, 12);
		expect(w.PickedNY()).toBeCloseTo(1, 12);
		// hitTest normalises the matrix axes: entity scale does not scale the box
		ScaleEntity(b, 5, 5, 5);
		expect(w.LinePick(0.5, 5, 0.5, 0, -10, 0)).toBe(b);
		expect(w.PickedY()).toBeCloseTo(1, 12);
		expect(w.LinePick(1.5, 5, 0.5, 0, -10, 0)).toBeNull();
		// rotation does apply
		RotateEntity(b, 0, 45, 0);
		expect(w.LinePick(1.3, 5, 0, 0, -10, 0)).toBe(b);
	});

	it('EntityPick follows the entity Z axis (scaled) for `range`', () => {
		const w = new CollisionWorld();
		const wall = w.CreateMesh(frontWallMesh());
		EntityPickMode(wall, 2);
		const p = w.CreatePivot();
		expect(w.EntityPick(p, 9)).toBeNull();
		expect(w.EntityPick(p, 20)).toBe(wall);
		expect(w.PickedZ()).toBeCloseTo(10, 12);
		expect(w.PickedTime()).toBeCloseTo(0.5, 12);
		ScaleEntity(p, 1, 1, 3); // m.k includes scale: range 9 now reaches 27
		expect(w.EntityPick(p, 9)).toBe(wall);
		RotateEntity(p, 0, 180, 0);
		expect(w.EntityPick(p, 100)).toBeNull();
	});

	it('CameraPick maps viewport coordinates through zoom and aspect', () => {
		const w = new CollisionWorld();
		const wall = w.CreateMesh(frontWallMesh());
		EntityPickMode(wall, 2);
		const cam = w.CreateCamera(null, 800, 600);
		expect(w.CameraPick(cam, 400, 300)).toBe(wall);
		expect([w.PickedX(), w.PickedY(), w.PickedZ()].map((v) => +v.toFixed(9) + 0)).toEqual([0, 0, 10]);
		// zoom 1: the half width of the view at distance d is d
		expect(w.CameraPick(cam, 600, 300)).toBe(wall);
		expect(w.PickedX()).toBeCloseTo(5, 9);
		expect(w.PickedY()).toBeCloseTo(0, 9);
		// vertical extent is scaled by height/width; screen y grows downwards
		expect(w.CameraPick(cam, 400, 150)).toBe(wall);
		expect(w.PickedY()).toBeCloseTo(3.75, 9);
		// CameraProject is the inverse mapping
		expect(w.CameraProject(cam, 5, 3.75, 10)).toBe(1);
		expect(w.ProjectedX()).toBeCloseTo(600, 9);
		expect(w.ProjectedY()).toBeCloseTo(150, 9);
		expect(w.CameraProject(cam, 0, 0, -1)).toBe(0);

		// looking down (positive pitch) from above a floor
		const floor = w.CreateMesh(floorMesh());
		EntityPickMode(floor, 2);
		PositionEntity(cam, 0, 5, 0);
		RotateEntity(cam, 90, 0, 0);
		expect(w.CameraPick(cam, 400, 300)).toBe(floor);
		expect(w.PickedY()).toBeCloseTo(0, 9);
		expect(w.PickedX()).toBeCloseTo(0, 9);
		// cameras default to range 1..1000: time is distance/far
		expect(w.PickedTime()).toBeCloseTo(0.005, 9);
	});

	it('EntityVisible honours the obscurer flag and ignores src/dest', () => {
		const w = new CollisionWorld();
		const a = w.CreatePivot(),
			b = w.CreatePivot();
		PositionEntity(a, 0, 0, 0);
		PositionEntity(b, 0, 0, 20);
		expect(w.EntityVisible(a, b)).toBe(true);
		const wall = w.CreateMesh(frontWallMesh());
		EntityPickMode(wall, 2, 1);
		expect(w.EntityVisible(a, b)).toBe(false);
		// the wall is one-sided: looking back through it from behind is not obscured
		expect(w.EntityVisible(b, a)).toBe(true);
		// not an obscurer: still pickable, no longer blocks line of sight
		EntityPickMode(wall, 2, 0);
		expect(w.EntityVisible(a, b)).toBe(true);
		expect(w.LinePick(0, 0, 0, 0, 0, 20)).toBe(wall);
		// default obscurer argument is 1
		EntityPickMode(wall, 2);
		expect(w.EntityVisible(a, b)).toBe(false);
		// pick mode 0 never obscures
		EntityPickMode(wall, 0, 1);
		expect(w.EntityVisible(a, b)).toBe(true);
		// src and dest themselves are skipped even if pickable obscurers
		EntityRadius(b, 3);
		EntityPickMode(b, 1, 1);
		expect(w.EntityVisible(a, b)).toBe(true);
		// a sphere obscurer in between
		const s = w.CreatePivot();
		PositionEntity(s, 0, 0, 10);
		EntityPickMode(s, 1, 1);
		expect(w.EntityVisible(a, b)).toBe(false);
		PositionEntity(s, 5, 0, 10);
		expect(w.EntityVisible(a, b)).toBe(true);
	});

	it('EntityInView: position for pivots, bounding box corners for meshes', () => {
		const w = new CollisionWorld();
		const cam = w.CreateCamera(null, 800, 600);
		const p = w.CreatePivot();
		PositionEntity(p, 0, 0, 10);
		expect(EntityInView(p, cam)).toBe(true);
		PositionEntity(p, 0, 0, -10);
		expect(EntityInView(p, cam)).toBe(false);
		PositionEntity(p, 11, 0, 10); // half width at z=10 is 10
		expect(EntityInView(p, cam)).toBe(false);
		PositionEntity(p, 0, 7.4, 10); // half height is 7.5
		expect(EntityInView(p, cam)).toBe(true);
		PositionEntity(p, 0, 7.6, 10);
		expect(EntityInView(p, cam)).toBe(false);
		PositionEntity(p, 0, 0, 1001); // beyond the far plane
		expect(EntityInView(p, cam)).toBe(false);
		// a mesh whose origin is off screen but whose box reaches in
		const m = w.CreateMesh(floorMesh());
		PositionEntity(m, 19, 0, 10);
		expect(EntityInView(m, cam)).toBe(true);
		PositionEntity(m, 40, 0, 10);
		expect(EntityInView(m, cam)).toBe(false);
	});
});

describe('collisions (UpdateWorld)', () => {
	it('sphere-sphere (method 1), stop response, collision records on both entities', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 1, 1);
		const dst = w.CreatePivot();
		PositionEntity(dst, 5, 0, 0);
		EntityRadius(dst, 2);
		EntityType(dst, WORLD);
		const p = mover(w, 0, 0, 0);
		w.UpdateWorld();
		expect(CountCollisions(p)).toBe(0);

		PositionEntity(p, 10, 0, 0);
		w.UpdateWorld();
		// centres 3 apart at contact; stopped COLLISION_EPSILON (0.001) short of the contact plane
		expect(EntityX(p)).toBeCloseTo(1.999, 9);
		expect(EntityY(p)).toBe(0);
		expect(CountCollisions(p)).toBe(1);
		expect(CollisionEntity(p, 1)).toBe(dst);
		expect(EntityCollided(p, WORLD)).toBe(dst);
		expect(EntityCollided(p, 7)).toBeNull();
		expect(CollisionTime(p, 1)).toBeCloseTo(0.2, 12);
		expect(CollisionNX(p, 1)).toBeCloseTo(-1, 12);
		// contact point = centre at impact - normal*radius
		expect(CollisionX(p, 1)).toBeCloseTo(3, 12);
		expect(CollisionY(p, 1)).toBeCloseTo(0, 12);
		expect(CollisionZ(p, 1)).toBeCloseTo(0, 12);
		// the destination was updated before the source this frame, so it keeps the record
		expect(CountCollisions(dst)).toBe(1);
		expect(CollisionEntity(dst, 1)).toBe(p);

		// next UpdateWorld without movement clears the records
		w.UpdateWorld();
		expect(CountCollisions(p)).toBe(0);
		expect(CountCollisions(dst)).toBe(0);
	});

	it('duplicate Collisions for the same pair are ignored; ClearCollisions removes them', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 1);
		w.Collisions(UNIT, WORLD, 2, 2); // ignored: stays "stop"
		const wall = w.CreateMesh(wallMesh());
		EntityType(wall, WORLD);
		const p = mover(w, 0, 0, 0);
		PositionEntity(p, 10, 0, 10);
		w.UpdateWorld();
		expect(EntityX(p)).toBeCloseTo(3.999, 9);
		expect(EntityZ(p)).toBeCloseTo(3.999, 9);
		w.ClearCollisions();
		PositionEntity(p, 10, 0, 10);
		w.UpdateWorld();
		expect(EntityX(p)).toBe(10);
	});

	it('sphere-polygon slide along a wall (response 2)', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 2);
		const wall = w.CreateMesh(wallMesh());
		EntityType(wall, WORLD);
		const p = mover(w, 0, 0, 0);
		PositionEntity(p, 10, 0, 10);
		w.UpdateWorld();
		// radius 1 in front of x=5, pushed out by COLLISION_EPSILON; the full z motion is kept
		expect(EntityX(p)).toBeCloseTo(3.999, 9);
		expect(EntityY(p)).toBeCloseTo(0, 12);
		expect(EntityZ(p)).toBeCloseTo(10, 9);
		expect(CountCollisions(p)).toBe(1);
		expect(CollisionEntity(p, 1)).toBe(wall);
		expect(CollisionNX(p, 1)).toBeCloseTo(-1, 12);
		expect(CollisionX(p, 1)).toBeCloseTo(5, 12);
		expect(CollisionZ(p, 1)).toBeCloseTo(4, 12);
		expect(CollisionTime(p, 1)).toBeCloseTo(0.4, 12);

		// moving away from the wall afterwards is free
		PositionEntity(p, 0, 0, 10);
		w.UpdateWorld();
		expect(EntityX(p)).toBe(0);
		expect(CountCollisions(p)).toBe(0);

		// approaching from behind passes through (single sided polygons)
		PositionEntity(p, 20, 0, 0);
		ResetEntity(p);
		PositionEntity(p, 0, 0, 0);
		w.UpdateWorld();
		expect(EntityX(p)).toBe(0);
	});

	it('stop response (1) and ResetEntity teleporting', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 1);
		const wall = w.CreateMesh(wallMesh());
		EntityType(wall, WORLD);
		const p = mover(w, 0, 0, 0);
		PositionEntity(p, 10, 0, 10);
		w.UpdateWorld();
		expect(EntityX(p)).toBeCloseTo(3.999, 9);
		expect(EntityZ(p)).toBeCloseTo(3.999, 9);

		// ResetEntity forgets the previous position: no sweep, no collision
		PositionEntity(p, 10, 0, 10);
		ResetEntity(p);
		w.UpdateWorld();
		expect(EntityX(p)).toBe(10);
		expect(CountCollisions(p)).toBe(0);
	});

	it('falling onto and resting on a floor', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 2);
		const floor = w.CreateMesh(floorMesh());
		EntityType(floor, WORLD);
		const p = mover(w, 0, 5, 0);
		PositionEntity(p, 0, 0, 0);
		w.UpdateWorld();
		expect(EntityY(p)).toBeCloseTo(1.001, 9);
		expect(CollisionY(p, 1)).toBeCloseTo(0, 12);
		expect(CollisionNY(p, 1)).toBe(1);
		// gravity keeps pushing every frame: it stays put and reports the floor each time
		for (let i = 0; i < 5; i++) {
			TranslateEntity(p, 0, -0.5, 0);
			w.UpdateWorld();
			expect(EntityY(p)).toBeCloseTo(1.001, 9);
			expect(EntityX(p)).toBe(0);
			expect(CountCollisions(p)).toBe(1);
		}
		// walking while pushed down slides along the floor at full horizontal speed
		TranslateEntity(p, 2, -0.5, 1);
		w.UpdateWorld();
		expect(EntityX(p)).toBeCloseTo(2, 9);
		expect(EntityZ(p)).toBeCloseTo(1, 9);
		expect(EntityY(p)).toBeCloseTo(1.001, 6);
	});

	it('slope: response 2 slides down, response 3 does not', () => {
		const run = (response: number) => {
			const w = new CollisionWorld();
			w.Collisions(UNIT, WORLD, 2, response);
			const slope = w.CreateMesh(slopeMesh());
			EntityType(slope, WORLD);
			const p = mover(w, 0, 5, 0);
			PositionEntity(p, 0, -5, 0); // straight down
			w.UpdateWorld();
			return p;
		};
		// the sphere touches the slope when its centre is sqrt2 above it; the plane is pushed out by 0.001
		const yHit = (1 + 0.001) * Math.SQRT2;

		const slide = run(2);
		// dest projected onto the offset plane: (0,-5,0) + n*(5/sqrt2 + 1.001)
		const k = (5 / Math.SQRT2 + 1.001) / Math.SQRT2;
		expect(EntityX(slide)).toBeCloseTo(k, 9);
		expect(EntityY(slide)).toBeCloseTo(-5 + k, 9);
		expect(EntityZ(slide)).toBeCloseTo(0, 12);
		expect(CountCollisions(slide)).toBe(1);

		const stay = run(3);
		// response 3 limits the slide to the remaining HORIZONTAL travel, which is zero for a vertical move
		expect(EntityX(stay)).toBeCloseTo(0, 12);
		expect(EntityY(stay)).toBeCloseTo(yHit, 9);
		expect(CountCollisions(stay)).toBe(1);
	});

	it('response 3 still lets horizontal movement climb the slope, limited to the horizontal distance', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 3);
		const slope = w.CreateMesh(slopeMesh());
		EntityType(slope, WORLD);
		// resting point on the slope surface offset: centre at distance 1.001 from the plane
		const d = 1.001 * Math.SQRT2;
		const p = mover(w, 2, -2 + d, 0);
		PositionEntity(p, 0, -2 + d, 0); // walk 2 units towards -X, into the slope
		w.UpdateWorld();
		// slides up the slope: x and y change by the same amount, horizontal travel is half... the
		// projection of (-2,0,0) on the slope is (-1,1,0), within the horizontal budget of 2
		expect(EntityX(p)).toBeCloseTo(1, 6);
		expect(EntityY(p)).toBeCloseTo(-2 + d + 1, 6);
	});

	it('ellipsoid radius (EntityRadius x,y) rests at the y radius and reports unscaled coordinates', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 2);
		const floor = w.CreateMesh(floorMesh());
		EntityType(floor, WORLD);
		const p = mover(w, 3, 10, 0, 1, 2);
		PositionEntity(p, 3, 0, 0);
		w.UpdateWorld();
		// the world is squashed by x_radius/y_radius = .5 in Y; epsilon 0.001 becomes 0.002 after unscaling
		expect(EntityY(p)).toBeCloseTo(2.002, 9);
		expect(CollisionX(p, 1)).toBeCloseTo(3, 12);
		expect(CollisionY(p, 1)).toBeCloseTo(0, 12);
		expect(CollisionNY(p, 1)).toBe(1);
		expect(CollisionTime(p, 1)).toBeCloseTo(0.8, 12);

		// horizontally the x radius applies
		const w2 = new CollisionWorld();
		w2.Collisions(UNIT, WORLD, 2, 1);
		const wall = w2.CreateMesh(wallMesh());
		EntityType(wall, WORLD);
		const q = mover(w2, 0, 0, 0, 1.5, 4);
		PositionEntity(q, 10, 0, 0);
		w2.UpdateWorld();
		expect(EntityX(q)).toBeCloseTo(3.499, 9);
	});

	it('sphere-box (method 3) uses EntityBox', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 3, 2);
		const box = w.CreatePivot();
		EntityBox(box, -2, -1, -2, 4, 2, 4);
		PositionEntity(box, 0, 0, 0);
		EntityType(box, WORLD);
		const p = mover(w, 0.5, 5, 0.5);
		PositionEntity(p, 0.5, 0, 0.5);
		w.UpdateWorld();
		expect(EntityY(p)).toBeCloseTo(2.001, 9);
		expect(CollisionEntity(p, 1)).toBe(box);
		expect(CollisionY(p, 1)).toBeCloseTo(1, 12);
	});

	it('scaled and rotated destination colliders, parented source', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 2);
		const floor = w.CreateMesh(floorMesh());
		// roll 90 turns the floor into a wall facing -X; scale 3 makes it span +-30; placed at x=8
		RotateEntity(floor, 0, 0, 90);
		ScaleEntity(floor, 3, 3, 3);
		PositionEntity(floor, 8, 0, 0);
		EntityType(floor, WORLD);
		const parent = w.CreatePivot();
		PositionEntity(parent, 0, 0, 25); // beyond the unscaled extent of 10
		const p = w.CreatePivot(parent);
		EntityRadius(p, 1);
		EntityType(p, UNIT);
		PositionEntity(p, 20, 0, 0); // local coordinates
		w.UpdateWorld();
		expect(EntityX(p, 1)).toBeCloseTo(6.999, 9);
		expect(EntityZ(p, 1)).toBeCloseTo(25, 9);
		expect(EntityX(p)).toBeCloseTo(6.999, 9); // written back in parent space
		expect(EntityZ(p)).toBeCloseTo(0, 9);
	});

	it('hidden entities neither collide nor are collided with; CopyEntity copies collision setup', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 1);
		const wall = w.CreateMesh(wallMesh());
		EntityType(wall, WORLD);
		const p = mover(w, 0, 0, 0);
		HideEntity(wall);
		PositionEntity(p, 10, 0, 0);
		w.UpdateWorld();
		expect(EntityX(p)).toBe(10);
		ShowEntity(wall);
		const q = CopyEntity(p);
		PositionEntity(q, 0, 0, 0);
		ResetEntity(q);
		PositionEntity(q, 10, 0, 0);
		w.UpdateWorld();
		expect(EntityX(q)).toBeCloseTo(3.999, 9);
	});

	it('corner: two walls stop the slide', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 2);
		const a = w.CreateMesh(wallMesh()); // x=5 facing -X
		EntityType(a, WORLD);
		const b = w.CreateMesh(frontWallMesh()); // z=10 facing -Z
		EntityType(b, WORLD);
		const p = mover(w, 0, 0, 0);
		PositionEntity(p, 20, 0, 30);
		w.UpdateWorld();
		expect(EntityX(p)).toBeCloseTo(3.999, 6);
		expect(EntityZ(p)).toBeCloseTo(8.999, 6);
		expect(CountCollisions(p)).toBe(2);
	});
});

describe('Collision primitives', () => {
	it('triangleCollide reports a vertex hit with the rounded normal', () => {
		const c = new Collision();
		const v0 = new Vector(0, 0, 0),
			v1 = new Vector(0, 0, 1),
			v2 = new Vector(1, 0, 0);
		// sphere of radius 1 dropping onto the corner v0 from a point diagonally outside it
		const o = new Vector(-0.6, 5, -0.6);
		expect(c.triangleCollide(new Line(o, new Vector(0, -10, 0)), 1, v0, v1, v2)).toBe(true);
		const h = Math.sqrt(1 - 0.72);
		expect(c.time).toBeCloseTo((5 - h) / 10, 10);
		expect(c.normal.x).toBeCloseTo(-0.6, 10);
		expect(c.normal.y).toBeCloseTo(h, 10);
		expect(c.normal.z).toBeCloseTo(-0.6, 10);
	});
});

describe('MeshesIntersect', () => {
	it('detects crossing and separated meshes through entity transforms', () => {
		const w = new CollisionWorld();
		const a = w.CreateMesh(floorMesh());
		const b = w.CreateMesh(floorMesh());
		// coplanar / parallel: no edge crosses a face
		PositionEntity(b, 0, 1, 0);
		expect(MeshesIntersect(a, b)).toBe(false);
		// b turned into a vertical wall through the floor
		PositionEntity(b, 0, 0, 0);
		RotateEntity(b, 0, 0, 90);
		expect(MeshesIntersect(a, b)).toBe(true);
		expect(MeshesIntersect(b, a)).toBe(true);
		PositionEntity(b, 30, 0, 0);
		expect(MeshesIntersect(a, b)).toBe(false);
		// scale brings it back into contact
		ScaleEntity(a, 4, 1, 4);
		expect(MeshesIntersect(a, b)).toBe(true);
		PositionEntity(b, 30, 11, 0);
		expect(MeshesIntersect(a, b)).toBe(false);
	});
});

describe('terrain', () => {
	const S = 4;
	function makeTerrain(w: CollisionWorld, fill = 0.5): Entity {
		// e_terrain(): ScaleEntity ter,64,3200,64 / PositionEntity ter,-(64*size/2),-1600,-(64*size/2)
		const ter = w.CreateTerrain(S);
		ScaleEntity(ter, 64, 3200, 64);
		PositionEntity(ter, -(64 * S) / 2, -1600, -(64 * S) / 2);
		EntityPickMode(ter, 2, 1);
		for (let x = 0; x <= S; x++) for (let z = 0; z <= S; z++) ModifyTerrain(ter, x, z, fill);
		return ter;
	}
	const wy = (byte: number) => Math.fround(Math.fround(Math.fround(byte / 255) * 3200) - 1600);
	const gx = (x: number) => -128 + x * 64;

	it('heights are bytes: h*255 truncated, read back as n/255', () => {
		const w = new CollisionWorld();
		const ter = makeTerrain(w);
		expect(TerrainHeight(ter, 1, 1)).toBeCloseTo(127 / 255, 7);
		ModifyTerrain(ter, 1, 1, 1);
		expect(TerrainHeight(ter, 1, 1)).toBe(1);
		ModifyTerrain(ter, 1, 1, 0.999);
		expect(TerrainHeight(ter, 1, 1)).toBeCloseTo(254 / 255, 7);
		ModifyTerrain(ter, 1, 1, 0.0039); // < 1/255
		expect(TerrainHeight(ter, 1, 1)).toBe(0);
	});

	it('x==size and z==size alias 0; out of range is ignored / reads 0', () => {
		const w = new CollisionWorld();
		const ter = makeTerrain(w);
		ModifyTerrain(ter, S, 2, 1);
		expect(TerrainHeight(ter, 0, 2)).toBe(1);
		expect(TerrainHeight(ter, S, 2)).toBe(1);
		ModifyTerrain(ter, 0, 2, 0);
		expect(TerrainHeight(ter, S, 2)).toBe(0);
		ModifyTerrain(ter, S + 1, 2, 1);
		ModifyTerrain(ter, -1, 2, 1);
		expect(TerrainHeight(ter, 1, 2)).toBeCloseTo(127 / 255, 7);
		expect(TerrainHeight(ter, S + 1, 2)).toBe(0);
		expect(TerrainHeight(ter, -1, 2)).toBe(0);

		// the map loader's loop order makes the x==S / z==S file values win
		const n = S + 1;
		const file = new Float32Array(n * n);
		for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) file[x * n + z] = (x * 10 + z) / 255;
		const t = TerrainCollider.fromMapHeights(S, file);
		const b = (x: number, z: number) => Math.round(t.getHeight(x, z) * 255);
		expect(b(1, 2)).toBe(12);
		expect(b(0, 2)).toBe(42); // file(S,2)
		expect(b(S, 2)).toBe(42);
		expect(b(2, 0)).toBe(24); // file(2,S)
		expect(b(2, S)).toBe(24);
		expect(b(0, 0)).toBe(44); // file(S,S)
	});

	it('TerrainY at grid points and bilinear inside cells', () => {
		const w = new CollisionWorld();
		const ter = makeTerrain(w);
		ModifyTerrain(ter, 1, 1, 1);
		ModifyTerrain(ter, 2, 2, 0.2); // byte 51
		expect(TerrainY(ter, gx(1), 0, gx(1))).toBe(1600);
		expect(TerrainY(ter, gx(2), 0, gx(2))).toBeCloseTo(wy(51), 3);
		expect(TerrainY(ter, gx(3), 0, gx(1))).toBeCloseTo(wy(127), 3);
		// the y argument is irrelevant
		expect(TerrainY(ter, gx(1), 999, gx(1))).toBe(1600);

		// along a cell edge: linear
		expect(TerrainY(ter, gx(1.5), 0, gx(1))).toBeCloseTo((wy(255) + wy(127)) / 2, 3);
		// cell centre: mean of the four corners (a triangulated surface would give the mean of
		// the two diagonal corners instead: either (255+51)/2 or 127)
		const centre = (wy(255) + wy(127) + wy(127) + wy(51)) / 4;
		expect(TerrainY(ter, gx(1.5), 0, gx(1.5))).toBeCloseTo(centre, 3);
		// general point
		const tx = 0.25,
			tz = 0.75;
		const ha = wy(255) + (wy(127) - wy(255)) * tx;
		const hb = wy(127) + (wy(51) - wy(127)) * tx;
		expect(TerrainY(ter, gx(1 + tx), 0, gx(1 + tz))).toBeCloseTo(ha + (hb - ha) * tz, 3);
	});

	it('TerrainY outside the terrain ramps to the base within one cell (no clamping)', () => {
		const w = new CollisionWorld();
		const ter = makeTerrain(w);
		expect(TerrainY(ter, gx(-1), 0, gx(1))).toBe(-1600);
		expect(TerrainY(ter, gx(-5), 0, gx(1))).toBe(-1600);
		expect(TerrainY(ter, gx(S + 1), 0, gx(1))).toBe(-1600);
		expect(TerrainY(ter, gx(-0.5), 0, gx(1))).toBeCloseTo((wy(127) + -1600) / 2, 3);
		expect(TerrainY(ter, gx(S + 0.5), 0, gx(1))).toBeCloseTo((wy(127) + -1600) / 2, 3);
		expect(TerrainY(ter, gx(S), 0, gx(1))).toBeCloseTo(wy(127), 3);
	});

	it('picking a flat terrain, with and without radius', () => {
		const w = new CollisionWorld();
		const ter = makeTerrain(w);
		const y = wy(127);
		expect(w.LinePick(10, 1000, 20, 0, -2000, 0)).toBe(ter);
		expect(w.PickedY()).toBeCloseTo(y, 3);
		expect(w.PickedNY()).toBeCloseTo(1, 9);
		expect(w.PickedTime()).toBeCloseTo((1000 - y) / 2000, 6);
		expect(w.LinePick(10, 1000, 20, 0, -2000, 0, 5)).toBe(ter);
		expect(w.PickedY()).toBeCloseTo(y, 3);
		expect(w.PickedTime()).toBeCloseTo((1000 - y - 5) / 2000, 6);
		// outside the terrain: nothing (unlike TerrainY, which returns -1600)
		expect(w.LinePick(gx(S) + 10, 1000, 20, 0, -2000, 0)).toBeNull();
		// from below: back face
		expect(w.LinePick(10, -1000, 20, 0, 2000, 0)).toBeNull();
		// pick mode 0 disables it (ai_units.bb toggles this)
		EntityPickMode(ter, 0);
		expect(w.LinePick(10, 1000, 20, 0, -2000, 0)).toBeNull();
	});

	it('leafTriangles: 2 per cell, alternating diagonals, clockwise seen from above', () => {
		const t = new TerrainCollider(S);
		const tris = t.leafTriangles();
		expect(tris.length).toBe(S * S * 6);
		const n = S + 1;
		const cells = new Map<string, string>();
		for (let i = 0; i < tris.length; i += 3) {
			const p = [0, 1, 2].map((k) => [Math.floor(tris[i + k] / n), tris[i + k] % n]);
			// Blitz winding seen from +Y: (v1-v0)x(v2-v0) must point up => its y component (dz1*dx2-dx1*dz2) > 0
			const dx1 = p[1][0] - p[0][0],
				dz1 = p[1][1] - p[0][1],
				dx2 = p[2][0] - p[0][0],
				dz2 = p[2][1] - p[0][1];
			expect(dz1 * dx2 - dx1 * dz2).toBe(1);
			const cx = Math.min(...p.map((q) => q[0])),
				cz = Math.min(...p.map((q) => q[1]));
			// the hypotenuse is the pair of vertices differing in both coordinates
			let diag = '';
			for (let a = 0; a < 3; a++) {
				const b = (a + 1) % 3;
				if (p[a][0] !== p[b][0] && p[a][1] !== p[b][1]) {
					diag = (p[a][0] - p[b][0]) * (p[a][1] - p[b][1]) > 0 ? '/' : '\\';
				}
			}
			const key = `${cx},${cz}`;
			if (cells.has(key)) expect(cells.get(key)).toBe(diag);
			cells.set(key, diag);
		}
		expect(cells.size).toBe(S * S);
		// '/' = diagonal from (x,z) to (x+1,z+1). The bintree alternates like a checkerboard.
		for (let x = 0; x < S; x++) {
			for (let z = 0; z < S; z++) {
				expect(cells.get(`${x},${z}`)).toBe((x + z) % 2 === 0 ? cells.get('0,0') : cells.get('1,0'));
			}
		}
		expect(cells.get('0,0')).not.toBe(cells.get('1,0'));
	});

	it('picks hit the bintree triangles (not the bilinear TerrainY surface)', () => {
		const w = new CollisionWorld();
		const ter = makeTerrain(w);
		const col = ter.collider as TerrainCollider;
		// deterministic bumpy heights
		let seed = 12345;
		const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
		for (let x = 0; x < S; x++) for (let z = 0; z < S; z++) ModifyTerrain(ter, x, z, 0.3 + rnd() * 0.4);
		const tris = col.leafTriangles();
		const n = S + 1;
		const expectY = (fx: number, fz: number): number | null => {
			for (let i = 0; i < tris.length; i += 3) {
				const p = [0, 1, 2].map((k) => {
					const x = Math.floor(tris[i + k] / n),
						z = tris[i + k] % n;
					return [x, col.repHeight(x, z), z];
				});
				const d = (p[1][2] - p[2][2]) * (p[0][0] - p[2][0]) + (p[2][0] - p[1][0]) * (p[0][2] - p[2][2]);
				const a = ((p[1][2] - p[2][2]) * (fx - p[2][0]) + (p[2][0] - p[1][0]) * (fz - p[2][2])) / d;
				const b = ((p[2][2] - p[0][2]) * (fx - p[2][0]) + (p[0][0] - p[2][0]) * (fz - p[2][2])) / d;
				const c = 1 - a - b;
				if (a > 0.02 && b > 0.02 && c > 0.02) return (a * p[0][1] + b * p[1][1] + c * p[2][1]) * 3200 - 1600;
			}
			return null;
		};
		let checked = 0,
			differsFromBilinear = 0;
		for (let i = 0; i < 300; i++) {
			const fx = rnd() * S,
				fz = rnd() * S;
			const y = expectY(fx, fz);
			if (y === null) continue; // too close to an edge for an unambiguous expectation
			expect(w.LinePick(gx(fx), 5000, gx(fz), 0, -10000, 0)).toBe(ter);
			expect(w.PickedY()).toBeCloseTo(y, 2);
			expect(w.PickedX()).toBeCloseTo(gx(fx), 6);
			if (Math.abs(TerrainY(ter, gx(fx), 0, gx(fz)) - y) > 1) differsFromBilinear++;
			checked++;
		}
		expect(checked).toBeGreaterThan(150);
		expect(differsFromBilinear).toBeGreaterThan(20);
		// at grid points both agree
		expect(w.LinePick(gx(2), 5000, gx(1), 0, -10000, 0)).toBe(ter);
		expect(w.PickedY()).toBeCloseTo(TerrainY(ter, gx(2), 0, gx(1)), 2);
	});

	it('a sphere collides with terrain when it is given an entity type', () => {
		const w = new CollisionWorld();
		w.Collisions(UNIT, WORLD, 2, 2);
		const ter = makeTerrain(w);
		EntityType(ter, WORLD);
		const y = wy(127);
		const p = mover(w, 10, y + 100, 20, 8, 16);
		PositionEntity(p, 10, y - 100, 20);
		w.UpdateWorld();
		expect(EntityY(p)).toBeCloseTo(y + 16 + 0.002, 3);
		expect(CollisionEntity(p, 1)).toBe(ter);
		expect(CollisionY(p, 1)).toBeCloseTo(y, 3);
	});

	it('CreatePlane: infinite pickable plane through the entity origin', () => {
		const w = new CollisionWorld();
		const sea = w.CreatePlane();
		PositionEntity(sea, 0, -3, 0);
		EntityPickMode(sea, 2, 1);
		expect(w.LinePick(12345, 7, -999, 0, -20, 0)).toBe(sea);
		expect(w.PickedY()).toBeCloseTo(-3, 9);
		expect(w.PickedTime()).toBeCloseTo(0.5, 12);
		expect(w.PickedNY()).toBe(1);
		expect(w.LinePick(0, -7, 0, 0, 20, 0)).toBeNull(); // from below
	});
});

describe('three.js geometry bridge', () => {
	it('meshColliderFromGeometry undoes the Three winding', () => {
		const geo = new THREE.BufferGeometry();
		geo.setAttribute(
			'position',
			new THREE.BufferAttribute(new Float32Array([-10, 0, -10, -10, 0, 10, 10, 0, 10, 10, 0, -10]), 3)
		);
		// Blitz order (0,1,2),(0,2,3) stored reversed as toThreeWinding does
		geo.setIndex([0, 2, 1, 0, 3, 2]);
		const w = new CollisionWorld();
		const e = w.CreateMesh(meshColliderFromGeometry(geo));
		EntityPickMode(e, 2);
		expect(w.LinePick(1, 5, 2, 0, -10, 0)).toBe(e);
		expect(w.PickedNY()).toBe(1);
	});
});

// ---------------------------------------------------------------------------
// Real models from the original game data (copied by `pnpm sync-assets`).
// ---------------------------------------------------------------------------
const root = resolve('static/game/mod');
const have = existsSync(root);

describe.skipIf(!have)('colliders from original models', () => {
	it('builds triangle trees and agrees with a brute-force sweep', async () => {
		const vfs = new NodeVfs(root);
		const all = vfs.list('gfx').filter((f) => /\.b3d$/i.test(f));
		expect(all.length).toBeGreaterThan(10);
		const wanted = ['palm01.b3d', 'bamboohut01.b3d', 'axe.b3d', 'aerie.b3d', 'bag.b3d'];
		const names = [...new Set([...wanted.filter((n) => all.includes(n)), ...all.slice(0, 6)])];
		let totalTris = 0;
		let rays = 0;
		for (const name of names) {
			const model = parseB3d(await vfs.readBytes('gfx/' + name));
			const col = meshColliderFromB3d(model);
			const nt = col.triangleCount;
			if (!nt) continue;
			totalTris += nt;
			expect(col.leafCount).toBeGreaterThanOrEqual(Math.ceil(nt / 16));
			expect(col.box.empty()).toBe(false);

			const w = new CollisionWorld();
			const e = w.CreateMesh(col);
			EntityPickMode(e, 2);
			// an arbitrary placement to exercise the transform path
			PositionEntity(e, 100, -20, 35);
			RotateEntity(e, 10, 75, -5);
			ScaleEntity(e, 1.5, 0.75, 2);
			const tf: Transform = e.getWorldTform();

			const vert = (i: number) =>
				tf.mulVec(new Vector(col.vertices[i * 3], col.vertices[i * 3 + 1], col.vertices[i * 3 + 2]));
			const step = Math.max(1, Math.floor(nt / 25));
			for (let t = 0; t < nt; t += step) {
				const v0 = vert(col.triVerts[t * 3]),
					v1 = vert(col.triVerts[t * 3 + 1]),
					v2 = vert(col.triVerts[t * 3 + 2]);
				const nrm = v1.sub(v0).cross(v2.sub(v0));
				const area = nrm.length();
				if (!(area > 1e-6)) continue; // degenerate triangle
				const n = nrm.div(area);
				const c = v0.add(v1).add(v2).div(3);
				for (const radius of [0, 0.5]) {
					const o = c.add(n.mul(2));
					const d = n.mul(-4);
					const line = new Line(o, d);
					// brute force over every triangle with the same primitive
					const brute = new Collision();
					for (let k = 0; k < nt; k++) {
						brute.triangleCollide(
							line,
							radius,
							vert(col.triVerts[k * 3]),
							vert(col.triVerts[k * 3 + 1]),
							vert(col.triVerts[k * 3 + 2])
						);
					}
					const got = w.LinePick(o.x, o.y, o.z, d.x, d.y, d.z, radius);
					// the ray is aimed at the centre of a front face, so something must be hit at or before it
					expect(got).toBe(e);
					expect(w.PickedTime()).toBeLessThanOrEqual((2 - radius) / 4 + 1e-6);
					expect(w.PickedTime()).toBeCloseTo(brute.time, 9);
					rays++;
				}
			}
		}
		expect(totalTris).toBeGreaterThan(100);
		expect(rays).toBeGreaterThan(50);
	});
});
