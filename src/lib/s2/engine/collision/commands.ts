/**
 * Entity commands with exact Blitz3D semantics, ported one-to-one from
 * bbruntime/bbblitz3d.cpp. Names, argument order, optional-argument defaults
 * (from the rtSym table) and units (degrees) are Blitz's, so game code can be
 * ported line by line. World-state commands (Collisions, UpdateWorld,
 * LinePick, Picked*, ...) are methods of CollisionWorld.
 */
import { Entity } from './entity';
import {
	Box,
	EPSILON,
	PI,
	Quat,
	TWOPI,
	Vector,
	dtor,
	quatPitch,
	quatRoll,
	quatYaw,
	rotationQuat,
	rtod
} from './geom';
import { MeshCollider } from './meshCollider';
import { TerrainCollider } from './terrainCollider';

// ---------------------------------------------------------------------------
// Hierarchy / state
// ---------------------------------------------------------------------------

/** HideEntity */
export function HideEntity(e: Entity): void {
	e.setEnabled(false);
	e.setVisible(false);
}

/** ShowEntity (also resets the entity's collision state, as Blitz does) */
export function ShowEntity(e: Entity): void {
	e.setVisible(true);
	e.setEnabled(true);
	e.reset();
}

/** EntityParent entity,parent,[global=1] */
export function EntityParent(e: Entity, p: Entity | null, global = 1): void {
	if (e.getParent() === p) return;

	if (global) {
		const t = e.getWorldTform();
		e.setParent(p);
		e.setWorldTform(t);
	} else {
		e.setParent(p);
		e.reset();
	}
}

/** GetParent */
export function GetParent(e: Entity): Entity | null {
	return e.getParent();
}

/** CountChildren */
export function CountChildren(e: Entity): number {
	let n = 0;
	for (let p = e.children(); p; p = p.successor()) ++n;
	return n;
}

/** GetChild( entity,index ) - index is 1-based */
export function GetChild(e: Entity, index: number): Entity | null {
	let p = e.children();
	while (--index && p) p = p.successor();
	return p;
}

/** FreeEntity (frees children too) */
export function FreeEntity(e: Entity | null): void {
	if (!e) return;
	e.free();
}

/** CopyEntity( entity,[parent] ) */
export function CopyEntity(e: Entity, parent: Entity | null = null): Entity {
	return e.copy(parent);
}

// ---------------------------------------------------------------------------
// Entity property commands
// ---------------------------------------------------------------------------

export function EntityX(e: Entity, global = 0): number {
	return global ? e.getWorldPosition().x : e.getLocalPosition().x;
}
export function EntityY(e: Entity, global = 0): number {
	return global ? e.getWorldPosition().y : e.getLocalPosition().y;
}
export function EntityZ(e: Entity, global = 0): number {
	return global ? e.getWorldPosition().z : e.getLocalPosition().z;
}
export function EntityPitch(e: Entity, global = 0): number {
	return quatPitch(global ? e.getWorldRotation() : e.getLocalRotation()) * rtod;
}
export function EntityYaw(e: Entity, global = 0): number {
	return quatYaw(global ? e.getWorldRotation() : e.getLocalRotation()) * rtod;
}
export function EntityRoll(e: Entity, global = 0): number {
	return quatRoll(global ? e.getWorldRotation() : e.getLocalRotation()) * rtod;
}

/** GetMatElement( entity,row,column ) */
export function GetMatElement(e: Entity, row: number, col: number): number {
	const t = e.getWorldTform();
	return row < 3 ? (row === 0 ? t.m.i : row === 1 ? t.m.j : t.m.k).get(col) : t.v.get(col);
}

/** static Vector tformed */
let tformed = new Vector();

/** TFormPoint x,y,z,source_entity,dest_entity (either may be null = world) */
export function TFormPoint(x: number, y: number, z: number, src: Entity | null, dest: Entity | null): void {
	tformed = new Vector(x, y, z);
	if (src) tformed = src.getWorldTform().mulVec(tformed);
	if (dest) tformed = dest.getWorldTform().inverse().mulVec(tformed);
}

/** TFormVector: like TFormPoint without translation (scale IS applied) */
export function TFormVector(x: number, y: number, z: number, src: Entity | null, dest: Entity | null): void {
	tformed = new Vector(x, y, z);
	if (src) tformed = src.getWorldTform().m.mulVec(tformed);
	if (dest) tformed = dest.getWorldTform().m.inverse().mulVec(tformed);
}

/** TFormNormal: cofactor-matrix transform, result normalized */
export function TFormNormal(x: number, y: number, z: number, src: Entity | null, dest: Entity | null): void {
	tformed = new Vector(x, y, z);
	if (src) tformed = src.getWorldTform().m.cofactor().mulVec(tformed);
	if (dest) tformed = dest.getWorldTform().m.inverse().cofactor().mulVec(tformed);
	tformed.normalize();
}

export function TFormedX(): number {
	return tformed.x;
}
export function TFormedY(): number {
	return tformed.y;
}
export function TFormedZ(): number {
	return tformed.z;
}

/** VectorYaw( x,y,z ): -atan2(x,z) in degrees */
export function VectorYaw(x: number, y: number, z: number): number {
	return new Vector(x, y, z).yaw() * rtod;
}

/** VectorPitch( x,y,z ): -atan2(y,sqrt(x*x+z*z)) in degrees */
export function VectorPitch(x: number, y: number, z: number): number {
	return new Vector(x, y, z).pitch() * rtod;
}

/** DeltaYaw( src,dest ): result in [-180,180) */
export function DeltaYaw(src: Entity, dest: Entity): number {
	const x = src.getWorldTform().m.k.yaw();
	const y = dest.getWorldTform().v.sub(src.getWorldTform().v).yaw();
	let d = y - x;
	if (d < -PI) d += TWOPI;
	else if (d >= PI) d -= TWOPI;
	return d * rtod;
}

/** DeltaPitch( src,dest ) */
export function DeltaPitch(src: Entity, dest: Entity): number {
	const x = src.getWorldTform().m.k.pitch();
	const y = dest.getWorldTform().v.sub(src.getWorldTform().v).pitch();
	let d = y - x;
	if (d < -PI) d += TWOPI;
	else if (d >= PI) d -= TWOPI;
	return d * rtod;
}

// ---------------------------------------------------------------------------
// Entity collision commands
// ---------------------------------------------------------------------------

/** ResetEntity */
export function ResetEntity(o: Entity): void {
	o.reset();
}

function entityType(e: Entity, type: number): void {
	e.coll_type = type;
	e.reset();
	for (let p = e.children(); p; p = p.successor()) {
		entityType(p, type);
	}
}

/** EntityType entity,collision_type,[recursive=0] */
export function EntityType(o: Entity, type: number, recurs = 0): void {
	if (type < 0 || type > 999) throw new Error('EntityType ID must be in the range 0...999');
	if (recurs) entityType(o, type);
	else {
		o.coll_type = type;
		o.reset();
	}
}

/** EntityPickMode entity,pick_geometry,[obscurer=1] */
export function EntityPickMode(o: Entity, mode: number, obs: number | boolean = 1): void {
	o.pick_geom = mode;
	o.obscurer = !!obs;
}

/** GetEntityType */
export function GetEntityType(o: Entity): number {
	return o.coll_type;
}

/** EntityRadius entity,x_radius,[y_radius=0] (y_radius 0 means "same as x") */
export function EntityRadius(o: Entity, x_radius: number, y_radius = 0): void {
	o.coll_radii = new Vector(x_radius, y_radius ? y_radius : x_radius, x_radius);
}

/** EntityBox entity,x,y,z,width,height,depth */
export function EntityBox(o: Entity, x: number, y: number, z: number, w: number, h: number, d: number): void {
	const b = new Box(new Vector(x, y, z));
	b.update(new Vector(x + w, y + h, z + d));
	o.coll_box = b;
}

/** EntityCollided( entity,type ): first entity of `type` collided with, or null */
export function EntityCollided(o: Entity, type: number): Entity | null {
	for (const c of o.colls) {
		if (c.with && c.with.coll_type === type) return c.with;
	}
	return null;
}

export function CountCollisions(o: Entity): number {
	return o.colls.length;
}

function coll(o: Entity, index: number) {
	const c = o.colls[index - 1];
	if (!c) throw new Error('Collision index out of range');
	return c;
}
/** Collision indices are 1-based, as in Blitz. */
export function CollisionX(o: Entity, index: number): number {
	return coll(o, index).coords.x;
}
export function CollisionY(o: Entity, index: number): number {
	return coll(o, index).coords.y;
}
export function CollisionZ(o: Entity, index: number): number {
	return coll(o, index).coords.z;
}
export function CollisionNX(o: Entity, index: number): number {
	return coll(o, index).collision.normal.x;
}
export function CollisionNY(o: Entity, index: number): number {
	return coll(o, index).collision.normal.y;
}
export function CollisionNZ(o: Entity, index: number): number {
	return coll(o, index).collision.normal.z;
}
export function CollisionTime(o: Entity, index: number): number {
	return coll(o, index).collision.time;
}
export function CollisionEntity(o: Entity, index: number): Entity | null {
	return coll(o, index).with;
}
export function CollisionSurface(o: Entity, index: number): unknown {
	return coll(o, index).collision.surface;
}
export function CollisionTriangle(o: Entity, index: number): number {
	return coll(o, index).collision.index;
}

/** EntityDistance( src,dest ): distance between world positions */
export function EntityDistance(src: Entity, dest: Entity): number {
	return src.getWorldPosition().distance(dest.getWorldPosition());
}

/**
 * MeshesIntersect( mesh_a,mesh_b ): triangle-triangle test of the two meshes
 * (MeshModel::intersects). Both entities must have MeshColliders.
 */
export function MeshesIntersect(a: Entity, b: Entity): boolean {
	if (!(a.collider instanceof MeshCollider) || !(b.collider instanceof MeshCollider)) {
		throw new Error('Entity is not a mesh');
	}
	return a.collider.intersects(b.collider, b.getWorldTform().inverse().mul(a.getWorldTform()));
}

// ---------------------------------------------------------------------------
// Entity transformation commands
// ---------------------------------------------------------------------------

/** MoveEntity: translate along the entity's own (local rotation) axes; not affected by scale */
export function MoveEntity(e: Entity, x: number, y: number, z: number): void {
	e.setLocalPosition(e.getLocalPosition().add(e.getLocalRotation().mulVec(new Vector(x, y, z))));
}

/** TurnEntity entity,pitch,yaw,roll,[global=0] */
export function TurnEntity(e: Entity, p: number, y: number, r: number, global = 0): void {
	if (global) e.setWorldRotation(rotationQuat(p * dtor, y * dtor, r * dtor).mul(e.getWorldRotation()));
	else e.setLocalRotation(e.getLocalRotation().mul(rotationQuat(p * dtor, y * dtor, r * dtor)));
}

/** TranslateEntity entity,x,y,z,[global=0] */
export function TranslateEntity(e: Entity, x: number, y: number, z: number, global = 0): void {
	if (global) e.setWorldPosition(e.getWorldPosition().add(new Vector(x, y, z)));
	else e.setLocalPosition(e.getLocalPosition().add(new Vector(x, y, z)));
}

/** PositionEntity entity,x,y,z,[global=0] */
export function PositionEntity(e: Entity, x: number, y: number, z: number, global = 0): void {
	if (global) e.setWorldPosition(new Vector(x, y, z));
	else e.setLocalPosition(new Vector(x, y, z));
}

/** ScaleEntity entity,x,y,z,[global=0] */
export function ScaleEntity(e: Entity, x: number, y: number, z: number, global = 0): void {
	if (global) e.setWorldScale(new Vector(x, y, z));
	else e.setLocalScale(new Vector(x, y, z));
}

/** RotateEntity entity,pitch,yaw,roll,[global=0] */
export function RotateEntity(e: Entity, p: number, y: number, r: number, global = 0): void {
	if (global) e.setWorldRotation(rotationQuat(p * dtor, y * dtor, r * dtor));
	else e.setLocalRotation(rotationQuat(p * dtor, y * dtor, r * dtor));
}

/**
 * PointEntity entity,target,[roll=0].
 * v = target world position - entity world position;
 * world rotation = rotationQuat( v.pitch(), v.yaw(), roll ) with
 * pitch = -atan2(v.y, sqrt(v.x^2+v.z^2)) and yaw = -atan2(v.x, v.z).
 */
export function PointEntity(e: Entity, t: Entity, roll = 0): void {
	const v = t.getWorldTform().v.sub(e.getWorldTform().v);
	e.setWorldRotation(rotationQuat(v.pitch(), v.yaw(), roll * dtor));
}

/** AlignToVector entity,vector_x,vector_y,vector_z,axis,[rate=1] */
export function AlignToVector(e: Entity, nx: number, ny: number, nz: number, axis: number, rate = 1): void {
	let ax = new Vector(nx, ny, nz);
	const l = ax.length();
	if (l <= EPSILON) return;
	ax = ax.div(l);

	const q = e.getWorldRotation();
	const tv = axis === 1 ? q.i() : axis === 2 ? q.j() : q.k();

	const dp = ax.dot(tv);

	if (dp >= 1 - EPSILON) return;

	if (dp <= -1 + EPSILON) {
		const an = (PI * rate) / 2;
		const cp = axis === 1 ? q.j() : axis === 2 ? q.k() : q.i();
		e.setWorldRotation(new Quat(Math.cos(an), cp.mul(Math.sin(an))).mul(q));
		return;
	}

	const an = (Math.acos(dp) * rate) / 2;
	const cp = ax.cross(tv).normalized();
	e.setWorldRotation(new Quat(Math.cos(an), cp.mul(Math.sin(an))).mul(q));
}

// ---------------------------------------------------------------------------
// Camera commands (state used by CameraPick / CameraProject / EntityInView)
// ---------------------------------------------------------------------------

function cam(c: Entity) {
	if (!c.camera) throw new Error('Entity is not a camera');
	return c.camera;
}
export function CameraZoom(c: Entity, zoom: number): void {
	cam(c).zoom = zoom;
}
export function CameraRange(c: Entity, near: number, far: number): void {
	cam(c).frustum_nr = near;
	cam(c).frustum_fr = far;
}
export function CameraViewport(c: Entity, x: number, y: number, w: number, h: number): void {
	Object.assign(cam(c), { vp_x: x, vp_y: y, vp_w: w, vp_h: h });
}
/** CameraProjMode camera,mode (0 none, 1 perspective, 2 orthographic) */
export function CameraProjMode(c: Entity, mode: number): void {
	cam(c).proj_mode = mode;
}

// ---------------------------------------------------------------------------
// Terrain commands
// ---------------------------------------------------------------------------

function ter(t: Entity): TerrainCollider {
	if (!(t.collider instanceof TerrainCollider)) throw new Error('Entity is not a terrain');
	return t.collider;
}
/** TerrainX( terrain,world_x,world_y,world_z ) */
export function TerrainX(t: Entity, x: number, y: number, z: number): number {
	return ter(t).terrainVector(t.getWorldTform(), x, y, z).x;
}
/** TerrainY( terrain,world_x,world_y,world_z ): bilinear terrain height in world space */
export function TerrainY(t: Entity, x: number, y: number, z: number): number {
	return ter(t).terrainVector(t.getWorldTform(), x, y, z).y;
}
/** TerrainZ( terrain,world_x,world_y,world_z ) */
export function TerrainZ(t: Entity, x: number, y: number, z: number): number {
	return ter(t).terrainVector(t.getWorldTform(), x, y, z).z;
}
/** TerrainSize( terrain ) */
export function TerrainSize(t: Entity): number {
	return ter(t).size;
}
/** TerrainHeight( terrain,terrain_x,terrain_z ): 0..1 (quantised to n/255) */
export function TerrainHeight(t: Entity, x: number, z: number): number {
	return ter(t).getHeight(x | 0, z | 0);
}
/** ModifyTerrain terrain,terrain_x,terrain_z,height,[realtime=0] */
export function ModifyTerrain(t: Entity, x: number, z: number, h: number, _realtime = 0): void {
	ter(t).setHeight(x | 0, z | 0, h);
}
