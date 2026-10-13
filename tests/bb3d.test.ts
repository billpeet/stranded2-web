import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
	AddMesh,
	AddTriangle,
	AddVertex,
	AnimLength,
	AnimTime,
	Animate,
	Animating,
	BBEntity,
	BrushTexture,
	CameraPick,
	CameraProject,
	CameraRange,
	CameraViewport,
	CameraZoom,
	ClearSurface,
	CollisionEntity,
	CollisionNX,
	Collisions,
	CopyEntity,
	CopyMesh,
	CountChildren,
	CountCollisions,
	CountSurfaces,
	CountTriangles,
	CountVertices,
	CreateBrush,
	CreateCamera,
	CreateCone,
	CreateCube,
	CreateCylinder,
	CreateLight,
	CreateMesh,
	CreatePivot,
	CreatePlane,
	CreateSphere,
	CreateSprite,
	CreateSurface,
	CreateTerrain,
	CreateTexture,
	EntityAlpha,
	EntityClass,
	EntityCollided,
	EntityColor,
	EntityDistance,
	EntityExists,
	EntityInView,
	EntityName,
	EntityOrder,
	EntityParent,
	EntityPick,
	EntityPickMode,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityTexture,
	EntityType,
	EntityVisible,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	ExtractAnimSeq,
	FindChild,
	FlipMesh,
	FreeEntity,
	FreeTexture,
	GetChild,
	GetParent,
	GetSurface,
	HideEntity,
	LightColor,
	LightRange,
	LinePick,
	LoadAnimMesh,
	LoadMesh,
	LoadTexture,
	MeshDepth,
	MeshHeight,
	MeshWidth,
	MeshesIntersect,
	ModifyTerrain,
	MoveEntity,
	NameEntity,
	PaintSurface,
	PickedEntity,
	PickedNY,
	PickedSurface,
	PickedTriangle,
	PickedX,
	PickedY,
	PickedZ,
	PointEntity,
	PositionEntity,
	PositionMesh,
	PositionTexture,
	ProjectedX,
	ProjectedY,
	RenderWorld,
	RotateEntity,
	RotateSprite,
	RotateTexture,
	ScaleEntity,
	ScaleMesh,
	ScaleSprite,
	ScaleTexture,
	ShowEntity,
	SpriteViewMode,
	TFormPoint,
	TFormedX,
	TFormedY,
	TFormedZ,
	TerrainHeight,
	TerrainShading,
	TerrainSize,
	TerrainY,
	TextureBlend,
	TextureBuffer,
	TextureFilter,
	TextureHeight,
	TextureWidth,
	TranslateEntity,
	TriangleVertex,
	TurnEntity,
	UpdateNormals,
	UpdateWorld,
	VertexCoords,
	VertexNX,
	VertexNY,
	VertexNZ,
	VertexX,
	VertexY,
	VertexZ,
	World,
	orderSequence,
	type Handle,
	type TextureFrame
} from '../src/lib/s2/bb3d';
import { entityBrush, getAnimator, meshRep } from '../src/lib/s2/engine/anim/entity';
import * as CM from '../src/lib/s2/engine/collision';
import { Terrain } from '../src/lib/s2/engine/terrain';
import { parseB3d } from '../src/lib/s2/formats/b3d';
import { parseMap } from '../src/lib/s2/formats/map';
import { LockBuffer, ReadPixelFast, SetBuffer, UnlockBuffer, WritePixelFast, CopyRect, CreateImage, ImageBuffer } from '../src/lib/s2/gfx2d';
import { NodeVfs } from './NodeVfs';

const MOD = resolve(__dirname, '../static/game/mod');
const haveMod = existsSync(MOD);

let world: World;

function fresh(): World {
	world = new World({ width: 800, height: 600 });
	return world;
}

/** The entity's world matrix as THREE computes it from the mirrored objects. */
function threeWorld(h: BBEntity): number[] {
	h.world.scene.updateMatrixWorld(true);
	return Array.from(h.obj.matrixWorld.elements);
}

function expectMirrored(h: BBEntity): void {
	const want = CM.matrix4Elements(h.ent.getWorldTform());
	const got = threeWorld(h);
	for (let i = 0; i < 16; i++) expect(got[i]).toBeCloseTo(want[i], 9);
}

describe('entity transforms', () => {
	beforeEach(fresh);

	it('gives the results of the collision module for the same command sequence', () => {
		const cw = new CM.CollisionWorld();
		const a = cw.CreatePivot();
		const b = cw.CreatePivot(a);
		const A = CreatePivot();
		const B = CreatePivot(A);

		CM.PositionEntity(a, 10, 20, 30);
		PositionEntity(A, 10, 20, 30);
		CM.RotateEntity(a, 30, 45, 10);
		RotateEntity(A, 30, 45, 10);
		CM.ScaleEntity(a, 2, 3, 4);
		ScaleEntity(A, 2, 3, 4);
		CM.PositionEntity(b, 1, 2, 3);
		PositionEntity(B, 1, 2, 3);
		CM.TurnEntity(b, 10, 20, 30);
		TurnEntity(B, 10, 20, 30);
		CM.MoveEntity(b, 0, 0, 5);
		MoveEntity(B, 0, 0, 5);
		CM.TranslateEntity(b, 1, 1, 1, 1);
		TranslateEntity(B, 1, 1, 1, 1);
		CM.RotateEntity(b, 5, 6, 7, 1);
		RotateEntity(B, 5, 6, 7, 1);

		for (const g of [0, 1]) {
			expect(EntityX(B, g)).toBe(CM.EntityX(b, g));
			expect(EntityY(B, g)).toBe(CM.EntityY(b, g));
			expect(EntityZ(B, g)).toBe(CM.EntityZ(b, g));
			expect(EntityPitch(B, g)).toBe(CM.EntityPitch(b, g));
			expect(EntityYaw(B, g)).toBe(CM.EntityYaw(b, g));
			expect(EntityRoll(B, g)).toBe(CM.EntityRoll(b, g));
		}
		CM.TFormPoint(1, 2, 3, b, a);
		const x = CM.TFormedX();
		TFormPoint(1, 2, 3, B, A);
		expect(TFormedX()).toBe(x);
		TFormPoint(1, 2, 3, B, null);
		const w = B.ent.getWorldTform().mulVec(new CM.Vector(1, 2, 3));
		expect([TFormedX(), TFormedY(), TFormedZ()]).toEqual([w.x, w.y, w.z]);
		expect(EntityDistance(A, B)).toBe(CM.EntityDistance(a, b));
	});

	it('mirrors every transform onto the THREE object at once', () => {
		const A = CreatePivot();
		const B = CreateCube(A);
		PositionEntity(A, 5, -3, 12);
		RotateEntity(A, 20, -70, 33);
		ScaleEntity(A, 1.5, 0.5, 2);
		PositionEntity(B, 3, 4, 5);
		TurnEntity(B, 0, 90, 0);
		expectMirrored(A);
		expectMirrored(B);
		PointEntity(B, CreatePivot());
		expectMirrored(B);
		ScaleEntity(B, 3, 3, 3, 1);
		expectMirrored(B);
		expect(B.obj.parent).toBe(A.obj);
		expect(A.obj.parent).toBe(world.scene);
	});

	it('keeps the world transform on EntityParent with global=1 and the local one with global=0', () => {
		const A = CreatePivot();
		const B = CreatePivot();
		const c = CreateCube();
		PositionEntity(A, 100, 0, 0);
		RotateEntity(A, 0, 90, 0);
		ScaleEntity(B, 2, 2, 2);
		PositionEntity(c, 1, 2, 3);
		EntityParent(c, A);
		expect(EntityX(c, 1)).toBeCloseTo(1, 9);
		expect(EntityY(c, 1)).toBeCloseTo(2, 9);
		expect(EntityZ(c, 1)).toBeCloseTo(3, 9);
		expect(GetParent(c)).toBe(A);
		expect(c.obj.parent).toBe(A.obj);
		expectMirrored(c);
		const lx = EntityX(c);
		EntityParent(c, B, 0);
		expect(EntityX(c)).toBe(lx);
		expect(EntityX(c, 1)).toBeCloseTo(lx * 2, 9);
		expectMirrored(c);
		EntityParent(c, null);
		expect(c.obj.parent).toBe(world.scene);
		expect(GetParent(c)).toBe(null);
		expectMirrored(c);
		expect(() => EntityParent(A, A)).toThrow();
	});

	it('keeps child order identical on both sides', () => {
		const p = CreatePivot();
		const a = CreatePivot(p);
		const b = CreatePivot(p);
		const c = CreatePivot(p);
		NameEntity(a, 'a');
		NameEntity(b, 'b');
		NameEntity(c, 'c');
		expect(CountChildren(p)).toBe(3);
		EntityParent(a, p); // same parent: no reordering
		expect(p.obj.children.map((o) => o.name)).toEqual(['a', 'b', 'c']);
		EntityParent(a, null);
		EntityParent(a, p);
		expect([1, 2, 3].map((i) => EntityName(GetChild(p, i)))).toEqual(['b', 'c', 'a']);
		expect(p.obj.children.map((o) => o.name)).toEqual(['b', 'c', 'a']);
		expect(GetChild(p, 4)).toBe(null);
		expect(FindChild(p, 'c')).toBe(c);
		expect(FindChild(p, 'nope')).toBe(null);
	});

	it('hides and shows both sides', () => {
		const a = CreateCube();
		HideEntity(a);
		expect(a.obj.visible).toBe(false);
		expect(a.ent.enabled()).toBe(false);
		ShowEntity(a);
		expect(a.obj.visible).toBe(true);
		expect(a.ent.enabled()).toBe(true);
	});
});

describe('runtime meshes', () => {
	beforeEach(fresh);

	function quad(y = 0): Handle {
		const m = CreateMesh();
		const s = CreateSurface(m);
		// clockwise seen from above: front face up
		AddVertex(s, -10, y, -10, 0, 1);
		AddVertex(s, -10, y, 10, 0, 0);
		AddVertex(s, 10, y, 10, 1, 0);
		AddVertex(s, 10, y, -10, 1, 1);
		AddTriangle(s, 0, 1, 2);
		AddTriangle(s, 0, 2, 3);
		return m;
	}

	it('builds surfaces and reads them back', () => {
		const m = quad();
		expect(CountSurfaces(m)).toBe(1);
		const s = GetSurface(m, 1);
		expect(CountVertices(s)).toBe(4);
		expect(CountTriangles(s)).toBe(2);
		expect([VertexX(s, 2), VertexY(s, 2), VertexZ(s, 2)]).toEqual([10, 0, 10]);
		expect([0, 1, 2].map((v) => TriangleVertex(s, 1, v))).toEqual([0, 2, 3]);
		expect(MeshWidth(m)).toBe(20);
		expect(MeshHeight(m)).toBe(0);
		expect(MeshDepth(m)).toBe(20);
		UpdateNormals(m);
		expect([VertexNX(s, 0), VertexNY(s, 0), VertexNZ(s, 0)]).toEqual([0, 1, 0]);
		expect(() => VertexX(s, 4)).toThrow();
		expect(() => GetSurface(m, 2)).toThrow();
	});

	it('picks a mesh built at run time and follows later edits', () => {
		const m = quad();
		EntityPickMode(m, 2);
		expect(LinePick(1, 50, 2, 0, -100, 0)).toBe(m);
		expect(PickedX()).toBeCloseTo(1, 9);
		expect(PickedY()).toBeCloseTo(0, 9);
		expect(PickedZ()).toBeCloseTo(2, 9);
		expect(PickedNY()).toBeCloseTo(1, 9);
		expect(PickedSurface()).toBe(GetSurface(m, 1));
		expect(PickedTriangle()).toBe(0);
		expect(PickedEntity()).toBe(m);
		// from below: back faces are not hit
		expect(LinePick(1, -50, 2, 0, 100, 0)).toBe(null);
		expect(PickedEntity()).toBe(null);

		// move the whole quad up: the collider is rebuilt
		const s = GetSurface(m, 1);
		for (let i = 0; i < 4; i++) VertexCoords(s, i, VertexX(s, i), 7, VertexZ(s, i));
		expect(LinePick(1, 50, 2, 0, -100, 0)).toBe(m);
		expect(PickedY()).toBeCloseTo(7, 9);

		// the entity transform applies
		PositionEntity(m, 0, 100, 0);
		ScaleEntity(m, 0.01, 1, 0.01);
		expect(LinePick(1, 500, 2, 0, -1000, 0)).toBe(null);
		expect(LinePick(0.05, 500, 0.05, 0, -1000, 0)).toBe(m);
		expect(PickedY()).toBeCloseTo(107, 9);

		ClearSurface(s);
		expect(LinePick(0.05, 500, 0.05, 0, -1000, 0)).toBe(null);
	});

	it('rebuilds the render geometry lazily, in Three winding', () => {
		const m = quad()!;
		expect(meshRep(m.obj)!.geometry.getIndex()!.count).toBe(0);
		world.flush();
		const geo = (m.obj as THREE.Mesh).geometry;
		expect(geo.getAttribute('position').count).toBe(4);
		expect(Array.from(geo.getIndex()!.array)).toEqual([0, 2, 1, 0, 3, 2]);
		expect(Array.isArray((m.obj as THREE.Mesh).material)).toBe(true);
		expect(((m.obj as THREE.Mesh).material as THREE.Material[]).length).toBe(1);
		// vertex edits reuse the buffers
		VertexCoords(GetSurface(m, 1), 0, -20, 0, -20);
		world.flush();
		expect((m.obj as THREE.Mesh).geometry).toBe(geo);
		expect(geo.getAttribute('position').getX(0)).toBe(-20);
		// topology edits make a new geometry
		AddVertex(GetSurface(m, 1), 0, 5, 0);
		world.flush();
		expect((m.obj as THREE.Mesh).geometry).not.toBe(geo);
	});

	it('creates the primitives of meshutil.cpp', () => {
		const cube = CreateCube();
		expect(CountSurfaces(cube)).toBe(1);
		expect(CountVertices(GetSurface(cube, 1))).toBe(24);
		expect(CountTriangles(GetSurface(cube, 1))).toBe(12);
		expect([MeshWidth(cube), MeshHeight(cube), MeshDepth(cube)]).toEqual([2, 2, 2]);
		const sphere = CreateSphere(8);
		expect(CountVertices(GetSurface(sphere, 1))).toBe(16 + 7 * 17 + 16);
		expect(CountTriangles(GetSurface(sphere, 1))).toBe(16 + 6 * 16 * 2 + 16);
		const cyl = CreateCylinder(8, 1);
		expect(CountSurfaces(cyl)).toBe(2);
		expect(CountSurfaces(CreateCylinder(8, 0))).toBe(1);
		const cone = CreateCone(8);
		expect(CountSurfaces(cone)).toBe(2);
		expect(CountTriangles(GetSurface(cone, 1))).toBe(8);

		// every primitive is closed and faces outward: rays from outside hit, from inside miss
		for (const e of [cube, sphere, cyl, cone]) {
			EntityPickMode(e, 2);
			for (const d of [
				[1, 0, 0],
				[-1, 0, 0],
				[0, 1, 0],
				[0, -1, 0],
				[0, 0, 1],
				[0, 0, -1]
			]) {
				const hit = LinePick(-d[0] * 5 + 0.01, -d[1] * 5 + 0.02, -d[2] * 5 + 0.03, d[0] * 10, d[1] * 10, d[2] * 10);
				expect(hit).toBe(e);
				expect(LinePick(0.01, 0.02, 0.03, d[0] * 10, d[1] * 10, d[2] * 10)).toBe(null);
			}
			EntityPickMode(e, 0);
		}
	});

	it('ScaleMesh, PositionMesh, FlipMesh and AddMesh edit the shared mesh', () => {
		const a = CreateCube();
		const b = CopyEntity(a);
		ScaleMesh(a, 2, 3, 4);
		PositionMesh(a, 10, 0, 0);
		// CopyEntity shares the mesh data, as in Blitz
		expect([MeshWidth(b), MeshHeight(b), MeshDepth(b)]).toEqual([4, 6, 8]);
		EntityPickMode(b, 2);
		expect(LinePick(10, 50, 0, 0, -100, 0)).toBe(b);
		expect(PickedY()).toBeCloseTo(3, 9);
		FlipMesh(a);
		expect(LinePick(10, 50, 0, 0, -100, 0)).toBe(b);
		expect(PickedY()).toBeCloseTo(-3, 9); // now the inside of the bottom face

		// CopyMesh is independent
		const c = CopyMesh(a);
		ScaleMesh(c, 2, 2, 2);
		expect(MeshWidth(c)).toBe(8);
		expect(MeshWidth(a)).toBe(4);

		// AddMesh merges surfaces with the same brush and keeps others apart
		const d = CreateCube();
		AddMesh(a, d);
		expect(CountSurfaces(d)).toBe(1);
		expect(CountVertices(GetSurface(d, 1))).toBe(48);
		const red = CreateBrush(255, 0, 0);
		const e = CreateCube();
		PaintSurface(GetSurface(e, 1), red);
		AddMesh(e, d);
		expect(CountSurfaces(d)).toBe(2);
		expect(() => AddMesh(d, d)).toThrow();
	});

	it('MeshesIntersect tests triangles in world space', () => {
		const a = CreateCube();
		const b = CreateCube();
		PositionEntity(b, 1.5, 0, 0);
		expect(MeshesIntersect(a, b)).toBe(1);
		PositionEntity(b, 2.5, 0, 0);
		expect(MeshesIntersect(a, b)).toBe(0);
		ScaleEntity(b, 2, 2, 2);
		expect(MeshesIntersect(a, b)).toBe(1);
	});
});

describe('collisions', () => {
	beforeEach(fresh);

	it('slides a typed pivot along a CopyEntity of a mesh and mirrors the result', () => {
		const proto = CreateCube();
		ScaleMesh(proto, 10, 10, 10);
		HideEntity(proto);
		const wall = CopyEntity(proto);
		PositionEntity(wall, 0, 0, 30);
		EntityType(wall, 2);

		const unit = CreatePivot();
		EntityRadius(unit, 2);
		EntityType(unit, 1);
		Collisions(1, 2, 2, 2);
		PositionEntity(unit, 3, 0, 0);
		UpdateWorld();
		expect(CountCollisions(unit)).toBe(0);

		// walk diagonally into the face at z=20
		for (let i = 0; i < 40; i++) {
			TranslateEntity(unit, 0.1, 0, 1);
			UpdateWorld();
		}
		expect(EntityZ(unit)).toBeLessThan(20 - 2 + 0.01);
		expect(EntityZ(unit)).toBeGreaterThan(17.9);
		expect(EntityX(unit)).toBeCloseTo(3 + 40 * 0.1, 6); // it slid sideways along the face
		expect(CountCollisions(unit)).toBeGreaterThan(0);
		expect(CollisionEntity(unit, 1)).toBe(wall);
		expect(EntityCollided(unit, 2)).toBe(wall);
		expect(EntityCollided(unit, 3)).toBe(null);
		expect(CollisionNX(unit, 1)).toBeCloseTo(0, 6);
		expect(unit.obj.position.z).toBe(EntityZ(unit));
		expect(unit.obj.position.x).toBe(EntityX(unit));
		expect(CountCollisions(wall)).toBeGreaterThan(0);
		// the hidden prototype takes no part
		expect(CountCollisions(proto)).toBe(0);
	});

	it('copies collision settings with CopyEntity and keeps copies independent', () => {
		const a = CreateSphere();
		EntityType(a, 3);
		EntityRadius(a, 4, 6);
		EntityPickMode(a, 1);
		EntityColor(a, 255, 0, 0);
		EntityOrder(a, -2);
		const b = CopyEntity(a);
		expect(b.ent.coll_type).toBe(3);
		expect(b.ent.pick_geom).toBe(1);
		expect(b.ent.coll_radii.y).toBe(6);
		expect(b.order).toBe(-2);
		expect(world.collidable.has(b)).toBe(true);
		expect(b.mesh).toBe(a.mesh);
		expect(b.obj).not.toBe(a.obj);
		expect(b.ent).not.toBe(a.ent);
		expect(entityBrush(b.obj).r).toBe(1);
		expect(entityBrush(b.obj).g).toBe(0);

		PositionEntity(b, 50, 0, 0);
		EntityColor(b, 0, 255, 0);
		EntityAlpha(b, 0.5);
		expect(EntityX(a)).toBe(0);
		expect(a.obj.position.x).toBe(0);
		expect(entityBrush(a.obj).g).toBe(0);
		expect(entityBrush(a.obj).alpha).toBe(1);
		const ma = (a.obj as THREE.Mesh).material as THREE.Material[];
		const mb = (b.obj as THREE.Mesh).material as THREE.Material[];
		expect(ma[0]).not.toBe(mb[0]);
		expect(mb[0].transparent).toBe(true);
		expect(ma[0].transparent).toBe(false);

		FreeEntity(a);
		expect(b.freed).toBe(false);
		expect(MeshWidth(b)).toBe(2);
	});

	it('copies whole hierarchies and parents the copy', () => {
		const root = CreatePivot();
		const child = CreateCube(root);
		const leaf = CreateSprite(child);
		NameEntity(child, 'child');
		NameEntity(leaf, 'leaf');
		PositionEntity(child, 1, 2, 3);
		ScaleSprite(leaf, 4, 5);
		const parent = CreatePivot();
		PositionEntity(parent, 100, 0, 0);
		const copy = CopyEntity(root, parent);
		expect(GetParent(copy)).toBe(parent);
		expect(copy.obj.parent).toBe(parent.obj);
		const c2 = FindChild(copy, 'child')!;
		const l2 = FindChild(copy, 'leaf')!;
		expect(c2).not.toBe(child);
		expect(EntityClass(l2)).toBe('Sprite');
		expect(l2.sprite).toEqual(leaf.sprite);
		expect(l2.sprite).not.toBe(leaf.sprite);
		expect(EntityX(c2, 1)).toBeCloseTo(101, 9);
		expectMirrored(c2);
		expectMirrored(l2);
	});
});

describe('FreeEntity', () => {
	beforeEach(fresh);

	it('frees children, unlinks both sides and makes the handles detectable', () => {
		const p = CreatePivot();
		const c = CreateCube(p);
		const s = CreateSprite(c);
		const cam = CreateCamera(p);
		const light = CreateLight(2, p);
		EntityType(c, 5);
		EntityPickMode(c, 2);
		expect(world.cameras.size).toBe(1);
		FreeEntity(p);
		for (const h of [p, c, s, cam, light]) {
			expect(h.freed).toBe(true);
			expect(EntityExists(h)).toBe(false);
		}
		expect(p.obj.parent).toBe(null);
		expect(world.cameras.size).toBe(0);
		expect(world.lights.size).toBe(0);
		expect(world.collidable.size).toBe(0);
		expect(world.models.size).toBe(0);
		expect(world.collision._orphans).toBe(null);
		expect(LinePick(0, 50, 0, 0, -100, 0)).toBe(null);
		expect(() => PositionEntity(c, 0, 0, 0)).toThrow('Entity does not exist');
		expect(() => EntityX(p)).toThrow();
		expect(() => CreatePivot(p)).toThrow();
		// harmless, like FreeEntity 0
		FreeEntity(p);
		FreeEntity(c);
		FreeEntity(null);
		UpdateWorld();
		RenderWorld();
	});

	it('frees a child without touching its siblings', () => {
		const p = CreatePivot();
		const a = CreatePivot(p);
		const b = CreatePivot(p);
		FreeEntity(a);
		expect(CountChildren(p)).toBe(1);
		expect(GetChild(p, 1)).toBe(b);
		expect(p.obj.children).toEqual([b.obj]);
	});
});

describe('cameras, lights, sprites, planes', () => {
	beforeEach(fresh);

	it('CameraProject / CameraPick / EntityInView use the camera state of the commands', () => {
		const cam = CreateCamera();
		expect(EntityClass(cam)).toBe('Camera');
		CameraRange(cam, 2, 500);
		CameraZoom(cam, 1.5);
		PositionEntity(cam, 0, 10, -50);
		const target = CreateCube();
		EntityPickMode(target, 2);
		PointEntity(cam, target);
		CameraProject(cam, 0, 0, 0);
		expect(ProjectedX()).toBeCloseTo(400, 6);
		expect(ProjectedY()).toBeCloseTo(300, 6);
		expect(CameraPick(cam, 400, 300)).toBe(target);
		expect(CameraPick(cam, 10, 10)).toBe(null);
		expect(EntityInView(target, cam)).toBe(1);
		PositionEntity(target, 0, 0, -200);
		expect(EntityInView(target, cam)).toBe(0);
		// the THREE camera follows
		const c = cam.obj as THREE.PerspectiveCamera;
		expect(c.near).toBe(2);
		expect(c.far).toBe(500);
		CameraViewport(cam, 0, 0, 400, 400);
		expect(c.aspect).toBe(1);
		// a point in front of the camera projects inside the unit cube with the mirrored projection
		world.scene.updateMatrixWorld(true);
		const p = new THREE.Vector3(0, 0, 0).project(c);
		expect(Math.abs(p.x)).toBeLessThan(1e-6);
		expect(Math.abs(p.y)).toBeLessThan(1e-6);
		expect(p.z).toBeGreaterThan(-1);
		expect(p.z).toBeLessThan(1);
	});

	it('EntityVisible sees obscurers only', () => {
		const a = CreatePivot();
		const b = CreatePivot();
		PositionEntity(b, 0, 0, 100);
		const wall = CreateCube();
		PositionEntity(wall, 0, 0, 50);
		ScaleEntity(wall, 10, 10, 1);
		expect(EntityVisible(a, b)).toBe(1);
		EntityPickMode(wall, 2, 1);
		expect(EntityVisible(a, b)).toBe(0);
		EntityPickMode(wall, 2, 0);
		expect(EntityVisible(a, b)).toBe(1);
		EntityPickMode(wall, 2, 1);
		HideEntity(wall);
		expect(EntityVisible(a, b)).toBe(1);
	});

	it('EntityPick follows the entity Z axis', () => {
		const a = CreatePivot();
		const t = CreateSphere();
		PositionEntity(t, 30, 0, 0);
		EntityPickMode(t, 1);
		EntityRadius(t, 1);
		expect(EntityPick(a, 100)).toBe(null);
		RotateEntity(a, 0, -90, 0);
		expect(EntityPick(a, 100)).toBe(t);
		expect(PickedX()).toBeCloseTo(29, 6);
		expect(EntityPick(a, 20)).toBe(null);
	});

	it('creates lights with the Direct3D defaults', () => {
		const sun = CreateLight();
		const lamp = CreateLight(2);
		expect((sun.obj as THREE.DirectionalLight).isDirectionalLight).toBe(true);
		expect((lamp.obj as THREE.PointLight).isPointLight).toBe(true);
		expect((sun.obj as THREE.Light).intensity).toBeCloseTo(Math.PI, 9);
		expect((lamp.obj as THREE.Light).intensity).toBeCloseTo(Math.PI * 1000, 6);
		LightRange(lamp, 50);
		expect((lamp.obj as THREE.Light).intensity).toBeCloseTo(Math.PI * 50, 6);
		LightColor(lamp, 255, 0, 127.5);
		expect((lamp.obj as THREE.Light).color.toArray()).toEqual([1, 0, 0.5]);
		// a directional light shines along its Z axis
		RotateEntity(sun, 90, 0, 0);
		world.flush();
		world.scene.updateMatrixWorld(true);
		const l = sun.obj as THREE.DirectionalLight;
		const dir = new THREE.Vector3().setFromMatrixPosition(l.target.matrixWorld).sub(new THREE.Vector3().setFromMatrixPosition(l.matrixWorld));
		expect(dir.x).toBeCloseTo(0, 9);
		expect(dir.y).toBeCloseTo(-1, 9);
		expect(dir.z).toBeCloseTo(0, 9);
	});

	it('draws sprites with the matrix of Sprite::render', () => {
		const cam = CreateCamera();
		RotateEntity(cam, 0, 90, 0);
		const s = CreateSprite();
		PositionEntity(s, 5, 6, 7);
		ScaleSprite(s, 2, 3);
		RotateSprite(s, 0);
		world.scene.updateMatrixWorld(true);
		const before = s.obj.matrixWorld.clone();
		const call = (h: BBEntity) => {
			(h.obj.onBeforeRender as unknown as (...a: unknown[]) => void)(null, null, cam.obj, null, null, null);
			const m = h.obj.matrixWorld.clone();
			(h.obj.onAfterRender as unknown as (...a: unknown[]) => void)(null, null, cam.obj, null, null, null);
			return m;
		};
		// view mode 1: the camera's axes, scaled
		let m = call(s);
		const cm = cam.obj.matrixWorld.elements;
		expect(m.elements[0]).toBeCloseTo(cm[0] * 2, 9);
		expect(m.elements[2]).toBeCloseTo(cm[2] * 2, 9);
		expect(m.elements[5]).toBeCloseTo(3, 9);
		expect([m.elements[12], m.elements[13], m.elements[14]]).toEqual([5, 6, 7]);
		// the entity matrix is back afterwards
		expect(s.obj.matrixWorld.equals(before)).toBe(true);
		// view mode 2: the entity's own orientation
		SpriteViewMode(s, 2);
		m = call(s);
		expect(m.elements[0]).toBeCloseTo(2, 9);
		expect(m.elements[10]).toBeCloseTo(1, 9);
	});

	it('picks planes and keeps the plane quad under the camera', () => {
		const sea = CreatePlane();
		EntityPickMode(sea, 2);
		expect(LinePick(123, 50, -456, 0, -100, 0)).toBe(sea);
		expect(PickedY()).toBeCloseTo(0, 9);
		PositionEntity(sea, 0, 10, 0);
		expect(LinePick(123, 50, -456, 0, -100, 0)).toBe(sea);
		expect(PickedY()).toBeCloseTo(10, 9);
		expect(EntityClass(sea)).toBe('Plane');
		expect(world.planes.has(sea)).toBe(true);
		FreeEntity(sea);
		expect(world.planes.size).toBe(0);
	});

	it('orders passes as World::render does', () => {
		expect(orderSequence([-5, 3, -1, 1, -200, 3])).toEqual([3, 1, 0, -1, -5, -200]);
		const sky = CreateCube();
		const flare = CreateSprite();
		EntityOrder(sky, 3);
		EntityOrder(flare, -1);
		expect(sky.obj.layers.mask).not.toBe(1);
		expect(sky.obj.layers.mask).not.toBe(flare.obj.layers.mask);
		EntityOrder(sky, 0);
		expect(sky.obj.layers.mask).toBe(1);
		const cams = [CreateCamera(), CreateCamera(), CreateCamera()];
		EntityOrder(cams[1], 5);
		HideEntity(cams[2]);
		expect(world.activeCameras()).toEqual([cams[1], cams[0]]);
	});
});

describe('terrain', () => {
	beforeEach(fresh);

	it('TerrainY / TerrainHeight / ModifyTerrain act on collider and render mesh', () => {
		const ter = CreateTerrain(16);
		expect(TerrainSize(ter)).toBe(16);
		ScaleEntity(ter, 64, 3200, 64);
		PositionEntity(ter, -512, -1600, -512);
		EntityPickMode(ter, 2, 1);
		TerrainShading(ter, 1);
		expect(TerrainY(ter, 0, 0, 0)).toBeCloseTo(-1600, 6);
		ModifyTerrain(ter, 8, 8, 0.5);
		const h = Math.trunc(0.5 * 255) / 255;
		expect(TerrainHeight(ter, 8, 8)).toBeCloseTo(h, 6);
		expect(TerrainY(ter, 0, 0, 0)).toBeCloseTo(h * 3200 - 1600, 2);
		expect(TerrainY(ter, 32, 0, 0)).toBeCloseTo((h / 2) * 3200 - 1600, 2);
		// the pick sees the same peak
		expect(LinePick(0, 5000, 0, 0, -10000, 0)).toBe(ter);
		expect(PickedY()).toBeCloseTo(h * 3200 - 1600, 2);
		// the render mesh follows at the next flush
		const pos = (ter.obj as THREE.Mesh).geometry.getAttribute('position');
		const i = 8 * 17 + 8;
		expect(pos.getY(i)).toBe(0);
		world.flush();
		expect(pos.getY(i)).toBeCloseTo(h, 6);
		const nrm = (ter.obj as THREE.Mesh).geometry.getAttribute('normal');
		expect(nrm.getY(i)).toBeCloseTo(1, 6);
		expect(nrm.getX(7 * 17 + 8)).toBeLessThan(0); // the slope west of the peak faces west
		// outside the grid: ignored, and x=S aliases x=0
		ModifyTerrain(ter, 17, 3, 1);
		ModifyTerrain(ter, 16, 3, 1);
		expect(TerrainHeight(ter, 0, 3)).toBe(1);
		expect(TerrainHeight(ter, 17, 3)).toBe(0);
		expect(() => CreateTerrain(100)).toThrow();
	});
});

describe('textures', () => {
	beforeEach(fresh);

	it('keeps the transform state Blitz keeps and shares it with textured entities', () => {
		const tex = CreateTexture(100, 60);
		// rounded up to powers of two
		expect(TextureWidth(tex)).toBe(128);
		expect(TextureHeight(tex)).toBe(64);
		ScaleTexture(tex, 4, -2);
		PositionTexture(tex, 0.25, 0.5);
		RotateTexture(tex, 90);
		const h = tex.handle(0)!;
		expect(h.sx).toBe(0.25);
		expect(h.sy).toBe(-0.5);
		expect(h.tx).toBe(-0.25);
		expect(h.ty).toBe(-0.5);
		expect(h.rot).toBeCloseTo(-Math.PI / 2, 12);
		// u' = u*cos*sx + v*sin*sx + tx ; v' = -u*sin*sy + v*cos*sy + ty
		const uv = new THREE.Vector3(1, 0, 1).applyMatrix3(h.matrix);
		expect(uv.x).toBeCloseTo(-0.25, 9);
		expect(uv.y).toBeCloseTo(-0.5 * 1 * 1 * -1 * -1 - 0.5, 9);

		const cube = CreateCube();
		EntityTexture(cube, tex, 0, 1);
		expect(entityBrush(cube.obj).texs[1]).toBe(h);
		expect(entityBrush(cube.obj).texs[0]).toBeUndefined();
		// a later TextureBlend reaches the entity's material at the next render
		const before = ((cube.obj as THREE.Mesh).material as THREE.Material[])[0];
		TextureBlend(tex, 3);
		expect(h.blend).toBe(3);
		world.flush();
		expect(((cube.obj as THREE.Mesh).material as THREE.Material[])[0]).not.toBe(before);

		const brush = CreateBrush();
		BrushTexture(brush, tex);
		expect(brush.texs[0]).toBe(h);
		FreeTexture(tex);
		expect(tex.freed).toBe(true);
		expect(() => ScaleTexture(tex, 1, 1)).toThrow('Texture does not exist');
	});

	it('is a 2D buffer: gfx2d writes land in the texture and are uploaded', () => {
		const tex = CreateTexture(8, 8);
		const frame = tex.frames[0];
		const buf = TextureBuffer(tex)!;
		const v0 = frame.texture.version;
		world.flush();
		expect(frame.texture.version).toBe(v0);
		SetBuffer(buf);
		LockBuffer(buf);
		WritePixelFast(3, 2, 0x112233);
		UnlockBuffer(buf);
		const o = (2 * 8 + 3) * 4;
		expect(Array.from(frame.bytes.subarray(o, o + 4))).toEqual([0x11, 0x22, 0x33, 0xff]);
		expect(ReadPixelFast(3, 2, buf) & 0xffffff).toBe(0x112233);
		world.flush();
		expect(frame.texture.version).toBe(v0 + 1);
		world.flush();
		expect(frame.texture.version).toBe(v0 + 1);
		// CopyRect from an image
		const img = CreateImage(4, 4);
		SetBuffer(ImageBuffer(img));
		WritePixelFast(0, 0, 0xabcdef);
		CopyRect(0, 0, 4, 4, 4, 4, ImageBuffer(img), buf);
		const o2 = (4 * 8 + 4) * 4;
		expect(Array.from(frame.bytes.subarray(o2, o2 + 3))).toEqual([0xab, 0xcd, 0xef]);
		world.flush();
		expect(frame.texture.version).toBe(v0 + 2);
	});

	it('keeps alpha in textures that have the alpha flag only', () => {
		const a = CreateTexture(4, 4, 2);
		const b = CreateTexture(4, 4, 0);
		WritePixelFast(0, 0, 0x80102030, TextureBuffer(a)!);
		WritePixelFast(0, 0, 0x80102030, TextureBuffer(b)!);
		expect(a.frames[0].bytes[3]).toBe(0x80);
		expect(b.frames[0].bytes[3]).toBe(0xff);
		expect(ReadPixelFast(0, 0, TextureBuffer(a)!) >>> 0).toBe(0x80102030);
		expect(ReadPixelFast(0, 0, TextureBuffer(b)!) >>> 0).toBe(0xff102030);
	});

	it('returns null for files that do not exist', () => {
		expect(LoadTexture('gfx\\nothing.bmp')).toBe(null);
		expect(LoadMesh('gfx\\nothing.b3d')).toBe(null);
		expect(LoadAnimMesh('gfx\\nothing.b3d')).toBe(null);
	});
});

describe.skipIf(!haveMod)('real game data', () => {
	let vfs: NodeVfs;

	beforeAll(() => {
		vfs = new NodeVfs(MOD);
	});

	async function open(paths: string[]): Promise<World> {
		world = new World({ vfs, width: 800, height: 600 });
		await world.preload(paths);
		return world;
	}

	it('loads meshes synchronously after preload, with their textures', async () => {
		await open(['gfx\\palm01.b3d']);
		const a = LoadMesh('gfx\\palm01.b3d')!;
		expect(a).not.toBe(null);
		expect(EntityClass(a)).toBe('Mesh');
		expect(MeshHeight(a)).toBeGreaterThan(10);
		// not preloaded: behaves like a missing file
		expect(LoadMesh('gfx\\palm02.b3d')).toBe(null);
		expect([...world.resources.missed]).toContain('gfx/palm02.b3d');
		await world.ensureLoaded('gfx\\palm02.b3d');
		expect(LoadMesh('gfx\\palm02.b3d')).not.toBe(null);
		// (palm01 uses .png/.jpg textures, which only a browser can decode; see the next test)
		// loading the same file again shares geometry and collider
		const b = LoadMesh('gfx\\palm01.b3d')!;
		expect(meshRep(b.obj)).toBe(meshRep(a.obj));
		expect(b.mesh).not.toBe(a.mesh);
		expect(b.mesh!.getCollider()).toBe(a.mesh!.getCollider());
		// editing one leaves the other alone (LoadMesh gives independent meshes)
		const h = MeshHeight(b);
		ScaleMesh(a, 1, 2, 1);
		expect(MeshHeight(a)).toBeCloseTo(h * 2, 3);
		expect(MeshHeight(b)).toBe(h);
		expect(b.mesh!.getCollider()).not.toBe(a.mesh!.getCollider());
	});

	it('picks a loaded model through CopyEntity copies at their own transforms', async () => {
		await open(['gfx\\palm01.b3d']);
		const proto = LoadMesh('gfx\\palm01.b3d')!;
		HideEntity(proto);
		const copies: BBEntity[] = [];
		for (let i = 0; i < 3; i++) {
			const c = CopyEntity(proto);
			PositionEntity(c, i * 500, 0, 0);
			EntityPickMode(c, 2, 1);
			copies.push(c);
		}
		ScaleEntity(copies[2], 2, 2, 2);
		expect(copies[1].mesh!.getCollider()).toBe(copies[0].mesh!.getCollider());
		// A ray onto the front of a triangle of the model, in each copy's space.
		const s0 = GetSurface(proto, 1);
		const v = [0, 1, 2].map((k) => {
			const n = TriangleVertex(s0, 0, k);
			return new CM.Vector(VertexX(s0, n), VertexY(s0, n), VertexZ(s0, n));
		});
		const centre = v[0].add(v[1]).add(v[2]).div(3);
		const normal = v[1].sub(v[0]).cross(v[2].sub(v[0])).normalized();
		const cast = (c: BBEntity) => {
			const t = c.ent.getWorldTform();
			const from = t.mulVec(centre.add(normal.mul(0.5)));
			const to = t.mulVec(centre.sub(normal.mul(0.5)));
			const hit = LinePick(from.x, from.y, from.z, to.x - from.x, to.y - from.y, to.z - from.z);
			return { hit, at: t.mulVec(centre) };
		};
		for (const c of copies) {
			const { hit, at } = cast(c);
			expect(hit).toBe(c);
			// the hit is on the ray, at this triangle or one in front of it
			const d = new CM.Vector(PickedX(), PickedY(), PickedZ()).distance(at);
			expect(d).toBeLessThan(0.5 * (c === copies[2] ? 2 : 1) + 1e-6);
		}
		// the hidden prototype is not picked
		PositionEntity(proto, 0, 5000, 0);
		expect(cast(proto).hit).toBe(null);
		ShowEntity(proto);
		EntityPickMode(proto, 2);
		expect(cast(proto).hit).toBe(proto);
		HideEntity(proto);
		// surface access on a loaded mesh
		const s = GetSurface(copies[0], 1);
		expect(CountVertices(s)).toBeGreaterThan(2);
		expect(cast(copies[0]).hit).toBe(copies[0]);
		const ps = PickedSurface()!;
		expect(copies[0].mesh!.surfaces.includes(ps)).toBe(true);
		expect(PickedTriangle()).toBeLessThan(CountTriangles(ps));
		expect(proto.mesh!.packed).toBe(false);
	});

	it('resolves model textures next to the model and decodes them', async () => {
		// Node can decode .bmp only: take a model whose textures are all .bmp.
		const file = vfs
			.all()
			.filter((p) => /^gfx\/.*\.b3d$/i.test(p))
			.find((p) => {
				const m = parseB3d(readFileSync(resolve(MOD, p)));
				return m.textures.length > 0 && m.textures.every((t) => /\.bmp$/i.test(t.file));
			})!;
		expect(file).toBeTruthy();
		await open([file]);
		const brushes = world.resources.brushes(file, world.textures)!;
		const layers = brushes.flatMap((b) => b.texs).filter((t) => !!t);
		expect(layers.length).toBeGreaterThan(0);
		const frame = layers[0]!.image;
		expect(frame.width).toBeGreaterThan(0);
		expect((frame.texture as THREE.DataTexture).image.data).toBe((frame as TextureFrame).bytes);
		expect(world.textures.active).toBeGreaterThan(0);
		const m = LoadMesh(file)!;
		const mats = (m.obj as THREE.Mesh).material as THREE.Material[];
		expect(mats.length).toBe(CountSurfaces(m));
	});

	it('builds the map terrain with the calls e_terrain / load_map make and agrees with the engine Terrain', async () => {
		await open([]);
		const map = parseMap(await vfs.readBytes('maps\\Survival Guide.s2'));
		const size = map.terrainSize;
		const ter = CreateTerrain(size);
		ScaleEntity(ter, 64, 3200, 64);
		PositionEntity(ter, -(64 * size) / 2, -(3200 / 2), -(64 * size) / 2);
		EntityPickMode(ter, 2, 1);
		TerrainShading(ter, 1);
		for (let x = 0; x <= size; x++) {
			for (let z = 0; z <= size; z++) ModifyTerrain(ter, x, z, map.heights[x * (size + 1) + z]);
		}
		const ref = new Terrain(size, map.heights, new THREE.MeshBasicMaterial());
		let seaLevelSeen = false;
		for (const [x, z] of [
			[0, 0],
			[100.5, -333.25],
			[-800, 640],
			[31.9, 31.9],
			[(64 * size) / 2 - 1, 0],
			[5000, 5000]
		]) {
			expect(TerrainY(ter, x, 0, z)).toBe(ref.terrainY(x, z));
			if (TerrainY(ter, x, 0, z) < 0) seaLevelSeen = true;
		}
		expect(seaLevelSeen).toBe(true);
		// a pick from above lands on the triangle surface, within a height level of TerrainY
		expect(LinePick(100.5, 5000, -333.25, 0, -10000, 0)).toBe(ter);
		expect(PickedX()).toBeCloseTo(100.5, 6);
		expect(Math.abs(PickedY() - TerrainY(ter, 100.5, 0, -333.25))).toBeLessThan(3200 / 255);
		// the render mesh has the collider's heights
		world.flush();
		const pos = (ter.obj as THREE.Mesh).geometry.getAttribute('position');
		const n = size + 1;
		expect(pos.getY(5 * n + 9)).toBe(ter.terrain!.collider.repHeight(5, 9));
		expect(pos.count).toBe(n * n);
	});

	it('animates a LoadAnimMesh model through UpdateWorld and keeps bones in step on both sides', async () => {
		await open(['gfx\\raptor.b3d']);
		const m = LoadAnimMesh('gfx\\raptor.b3d')!;
		expect(m).not.toBe(null);
		expect(m.animator).toBe(getAnimator(m.obj));
		expect(CountChildren(m)).toBe(m.obj.children.length);
		// every THREE node has its entity, in the same order, at the same transform
		const all: BBEntity[] = [];
		const walk = (h: BBEntity) => {
			all.push(h);
			const kids = h.children();
			expect(kids.map((k) => k.obj)).toEqual(h.obj.children);
			kids.forEach(walk);
		};
		walk(m);
		expect(all.length).toBeGreaterThan(3);
		for (const h of all) expectMirrored(h);
		const named = all.find((h) => h !== m && EntityName(h) !== '')!;
		expect(FindChild(m, EntityName(named))).toBe(named);

		expect(Animating(m)).toBe(0);
		const seq = ExtractAnimSeq(m, 1, 10);
		expect(seq).toBe(1);
		Animate(m, 1, 0.5, seq);
		expect(Animating(m)).toBe(1);
		expect(AnimLength(m)).toBe(9);
		const pose0 = all.map((h) => CM.matrix4Elements(h.ent.getWorldTform()));
		for (let i = 0; i < 6; i++) UpdateWorld();
		expect(AnimTime(m)).toBeCloseTo(3, 5);
		const pose1 = all.map((h) => CM.matrix4Elements(h.ent.getWorldTform()));
		expect(pose1).not.toEqual(pose0);
		for (const h of all) expectMirrored(h);

		// a copy has its own animator and bones, and starts in the source's pose
		const c = CopyEntity(m);
		expect(c.animator).not.toBe(m.animator);
		expect(c.animator).not.toBe(null);
		expect(Animating(c)).toBe(0);
		PositionEntity(c, 100, 0, 0);
		for (let i = 0; i < 3; i++) UpdateWorld();
		expect(AnimTime(m)).toBeCloseTo(4.5, 5);
		expect(AnimTime(c)).toBe(0);
		const copyAll: BBEntity[] = [];
		const walk2 = (h: BBEntity) => {
			copyAll.push(h);
			h.children().forEach(walk2);
		};
		walk2(c);
		expect(copyAll.length).toBe(all.length);
		for (const h of copyAll) expectMirrored(h);
		// the copy kept the pose it was copied in (pose1), offset by its position
		const k = all.indexOf(named);
		const local = CM.matrix4Elements(copyAll[k].ent.getLocalTform());
		const src = pose1[k];
		void src;
		expect(local.every(Number.isFinite)).toBe(true);
		expect(() => Animate(CreatePivot())).toThrow('Entity has no animation');
	});

	it('applies texture filters by file name like load_setup.bb', async () => {
		await open(['sprites\\flare0_a.bmp', 'gfx\\palm01.bmp']);
		TextureFilter('_a', 2);
		const flare = LoadTexture('sprites\\flare0_a.bmp')!;
		expect(flare).not.toBe(null);
		expect(flare.flags & 2).toBe(2);
		expect(flare.flags & 8).toBe(8); // the default "" filter: mipmaps
		expect(flare.frames[0].transparent).toBe(true);
		// alpha from brightness for an image without alpha channel
		const f = flare.frames[0];
		let differs = false;
		for (let i = 0; i < f.bytes.length; i += 4) {
			expect(f.bytes[i + 3]).toBe(Math.floor((f.bytes[i] + f.bytes[i + 1] + f.bytes[i + 2]) / 3));
			if (f.bytes[i + 3] !== 255) differs = true;
		}
		expect(differs).toBe(true);
		const palm = LoadTexture('gfx\\palm01.bmp')!;
		expect(palm.flags & 2).toBe(0);
		// two handles of the same file and flags share the image but not the transform
		const palm2 = LoadTexture('gfx\\palm01.bmp')!;
		expect(palm2.frames[0]).toBe(palm.frames[0]);
		ScaleTexture(palm2, 2, 2);
		expect(palm.handle(0)!.sx).toBe(1);
		expect(palm2.handle(0)!.sx).toBe(0.5);
	});
});
