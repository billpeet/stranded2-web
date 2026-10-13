/**
 * Port of the collision/picking half of blitz3d/world.cpp (World::update,
 * World::collide "NEW VERSION", collided(), hitTest, traceRay, checkLOS,
 * addCollision/clearCollisions) plus the world-state commands of
 * bbruntime/bbblitz3d.cpp (LinePick, EntityPick, CameraPick, EntityVisible,
 * Picked*, CameraProject/Projected*, EntityInView).
 *
 * Methods are named after the Blitz commands so game code ports line by line:
 *   Collisions Cworld_unitcol,Cworld_col,2,3   ->  world.Collisions(Cworld_unitcol, Cworld_col, 2, 3)
 *   UpdateWorld                                 ->  world.UpdateWorld()
 *   in_pe=LinePick(x,y,z,dx,dy,dz,r)            ->  in_pe = world.LinePick(x, y, z, dx, dy, dz, r)
 */
import { Collision, COLLISION_EPSILON } from './collision';
import { Entity, type CameraState, type EntityRoot, type ObjCollision } from './entity';
import { Box, EPSILON, Line, Plane, Transform, Vector } from './geom';
import { MeshCollider, stats3d } from './meshCollider';
import { PlaneCollider, TerrainCollider } from './terrainCollider';

export const COLLISION_METHOD_SPHERE = 1;
export const COLLISION_METHOD_POLYGON = 2;
export const COLLISION_METHOD_BOX = 3;

export const COLLISION_RESPONSE_NONE = 0;
export const COLLISION_RESPONSE_STOP = 1;
export const COLLISION_RESPONSE_SLIDE = 2;
export const COLLISION_RESPONSE_SLIDEXZ = 3;

const MAX_HITS = 10;

interface CollInfo {
	dst_type: number;
	method: number;
	response: number;
}

/** blitz3d/frustum.cpp, local (camera space) frustum only. */
export class Frustum {
	static readonly VERT_TLNEAR = 0;
	static readonly VERT_EYE = 8;
	readonly verts: Vector[] = [];
	readonly planes: Plane[] = [];

	constructor(nr: number, fr: number, w: number, h: number) {
		const v = this.verts;
		v[0] = new Vector(w * -0.5, h * +0.5, nr); // TLNEAR
		v[1] = new Vector(w * +0.5, h * +0.5, nr); // TRNEAR
		v[2] = new Vector(w * +0.5, h * -0.5, nr); // BRNEAR
		v[3] = new Vector(w * -0.5, h * -0.5, nr); // BLNEAR
		const t = fr / nr;
		v[4] = v[0].mul(t); // TLFAR
		v[5] = v[1].mul(t); // TRFAR
		v[6] = v[2].mul(t); // BRFAR
		v[7] = v[3].mul(t); // BLFAR
		v[8] = new Vector(); // EYE
		const p = this.planes;
		p[0] = Plane.fromTri(v[8], v[5], v[4]); // TOP
		p[1] = Plane.fromTri(v[8], v[4], v[7]); // LEFT
		p[2] = Plane.fromTri(v[8], v[7], v[6]); // BOTTOM
		p[3] = Plane.fromTri(v[8], v[6], v[5]); // RIGHT
		p[4] = Plane.fromTri(v[1], v[0], v[3]); // NEAR
		p[5] = Plane.fromTri(v[4], v[5], v[6]); // FAR
		if (p[4].distance(v[8]) > 0) {
			for (let k = 0; k < 6; ++k) p[k] = p[k].neg();
		}
	}

	/** Frustum::cull( v,cnt ): true if NOT entirely outside any one plane */
	cull(v: Vector[]): boolean {
		const cnt = v.length;
		for (let n = 0; n < 6; ++n) {
			let k: number;
			for (k = 0; k < cnt && this.planes[n].distance(v[k]) < 0; ++k) {
				/* */
			}
			if (k === cnt) return false;
		}
		return true;
	}
}

function newPicked(): ObjCollision {
	return { with: null, coords: new Vector(), collision: new Collision() };
}

export class CollisionWorld implements EntityRoot {
	_orphans: Entity | null = null;
	_last_orphan: Entity | null = null;

	private _collInfo = new Map<number, CollInfo[]>();
	private _objsByType = new Map<number, Entity[]>();
	private _enabled: Entity[] = [];
	private static readonly noInfo: CollInfo[] = [];

	/** static ObjCollision picked */
	picked: ObjCollision = newPicked();
	/** static Vector projected */
	projected = new Vector();

	/**
	 * Object::animate( e ), which Object::beginUpdate runs for every enabled
	 * object right before its collision test. Set by the owner of the
	 * animators (bb3d); it must leave the entity transforms up to date.
	 */
	onAnimate: ((o: Entity, elapsed: number) => void) | null = null;

	// ------------------------------------------------------------------
	// Entity creation
	// ------------------------------------------------------------------

	/** CreatePivot( [parent] ) - also the base for any entity without polygon geometry. */
	CreatePivot(parent: Entity | null = null): Entity {
		return new Entity(this, parent);
	}

	/**
	 * An entity with mesh geometry (CreateMesh/LoadMesh/CopyMesh result).
	 * Several entities may share one MeshCollider (CopyEntity semantics).
	 */
	CreateMesh(collider: MeshCollider | null, parent: Entity | null = null): Entity {
		const e = new Entity(this, parent);
		e.collider = collider;
		return e;
	}

	/** CreateTerrain( grid_size,[parent] ) or wrap an existing TerrainCollider. */
	CreateTerrain(grid_size: number | TerrainCollider, parent: Entity | null = null): Entity {
		const e = new Entity(this, parent);
		e.collider = typeof grid_size === 'number' ? new TerrainCollider(grid_size) : grid_size;
		return e;
	}

	/** CreatePlane( [segments],[parent] ) */
	CreatePlane(_segments = 1, parent: Entity | null = null): Entity {
		const e = new Entity(this, parent);
		e.collider = new PlaneCollider();
		return e;
	}

	/** CreateCamera( [parent] ). Blitz sets the viewport to the current canvas size: pass it here. */
	CreateCamera(parent: Entity | null = null, viewportWidth = 0, viewportHeight = 0): Entity {
		const e = new Entity(this, parent);
		e.camera = {
			zoom: 1,
			frustum_nr: 1,
			frustum_fr: 1000,
			vp_x: 0,
			vp_y: 0,
			vp_w: viewportWidth,
			vp_h: viewportHeight,
			proj_mode: 1
		};
		return e;
	}

	/** ClearWorld's entity part: frees every entity. */
	ClearWorldEntities(): void {
		while (this._orphans) this._orphans.free();
	}

	private enumEnabled(): Entity[] {
		const out = this._enabled;
		out.length = 0;
		for (let e = this._orphans; e; e = e.successor()) {
			e.enumEnabled(out);
		}
		return out;
	}

	// ------------------------------------------------------------------
	// Collisions / UpdateWorld
	// ------------------------------------------------------------------

	/** ClearCollisions */
	ClearCollisions(): void {
		this._collInfo.clear();
	}

	/** Collisions src_type,dest_type,method,response (World::addCollision) */
	Collisions(src_type: number, dst_type: number, method: number, response: number): void {
		let info = this._collInfo.get(src_type);
		if (!info) this._collInfo.set(src_type, (info = []));
		for (let k = 0; k < info.length; ++k) {
			if (dst_type === info[k].dst_type) return;
		}
		info.push({ dst_type, method, response });
	}

	/** World::hitTest */
	hitTest(line: Line, radius: number, obj: Entity, tf: Transform, method: number, curr_coll: Collision): boolean {
		switch (method) {
			case COLLISION_METHOD_SPHERE:
				return curr_coll.sphereCollide(line, radius, tf.v, obj.coll_radii.x);
			case COLLISION_METHOD_POLYGON:
				return obj.collider ? obj.collider.collide(line, radius, curr_coll, tf) : false;
			case COLLISION_METHOD_BOX: {
				const t = tf.clone();
				t.m.i.normalize();
				t.m.j.normalize();
				t.m.k.normalize();
				if (curr_coll.boxCollide(t.transposedInverse().mulLine(line), radius, obj.coll_box)) {
					curr_coll.normal = t.m.mulVec(curr_coll.normal);
					return true;
				}
			}
		}
		return false;
	}

	/** static void collided( src,dest,line,coll,y_scale ) */
	private collided(src: Entity, dest: Entity, line: Line, coll: Collision, y_scale: number): void {
		const coords = line.at(coll.time).sub(coll.normal.mul(src.coll_radii.x));

		let c: ObjCollision = { with: dest, coords: coords.clone(), collision: coll.clone() };
		c.coords.y *= y_scale;
		src.addCollision(c);

		c = { with: src, coords: coords.clone(), collision: coll.clone() };
		c.coords.y *= y_scale;
		dest.addCollision(c);
	}

	/** World::collide( Object *src ) - NEW VERSION */
	private collide(src: Entity): void {
		let dv = src.getWorldTform().v.clone();
		let sv = src.getPrevWorldTform().v.clone();

		if (sv.equals(dv)) {
			if (dv.x !== sv.x || dv.y !== sv.y || dv.z !== sv.z) {
				src.setWorldPosition(sv);
			}
			return;
		}

		const panic = sv.clone();

		const y_tform = new Transform();

		const radii = src.coll_radii;

		const radius = radii.x;
		let inv_y_scale = 1;
		let y_scale = 1;

		if (radii.x !== radii.y) {
			y_scale = y_tform.m.j.y = radius / radii.y;
			inv_y_scale = 1 / y_scale;
			sv.y *= y_scale;
			dv.y *= y_scale;
		}

		let n_hit = 0;
		const planes: Plane[] = [new Plane(), new Plane()];
		const coll_line = new Line(sv, dv.sub(sv));
		const dir = coll_line.d;

		let td = coll_line.d.length();
		let td_xz = new Vector(coll_line.d.x, 0, coll_line.d.z).length();

		const collinfos = this._collInfo.get(src.coll_type) ?? CollisionWorld.noInfo;

		let hits = 0;
		for (;;) {
			const coll = new Collision();
			let coll_obj: Entity | null = null;
			let coll_info: CollInfo | null = null;

			for (let ci = 0; ci < collinfos.length; ++ci) {
				const coll_it = collinfos[ci];
				const dst_objs = this._objsByType.get(coll_it.dst_type);
				if (!dst_objs) continue;

				for (let di = 0; di < dst_objs.length; ++di) {
					const dst = dst_objs[di];

					if (src === dst) continue;

					const dst_tform = dst.getPrevWorldTform();

					if (y_scale === 1) {
						if (this.hitTest(coll_line, radius, dst, dst_tform, coll_it.method, coll)) {
							coll_obj = dst;
							coll_info = coll_it;
						}
					} else {
						if (this.hitTest(coll_line, radius, dst, y_tform.mul(dst_tform), coll_it.method, coll)) {
							coll_obj = dst;
							coll_info = coll_it;
						}
					}
				}
			}
			if (!coll_obj || !coll_info) break;

			//register collision
			if (++hits === MAX_HITS) {
				break;
			}

			this.collided(src, coll_obj, coll_line, coll, inv_y_scale);

			const coll_plane = Plane.pointNormal(coll_line.at(coll.time), coll.normal);

			coll_plane.d -= COLLISION_EPSILON;
			coll.time = coll_plane.t_intersect(coll_line);

			if (coll.time > 0) {
				//update source position - ONLY IF AHEAD!
				sv = coll_line.at(coll.time);
				td *= 1 - coll.time;
				td_xz *= 1 - coll.time;
			}

			if (coll_info.response === COLLISION_RESPONSE_STOP) {
				dv = sv;
				break;
			}

			//find nearest point on plane to dest
			const nv = coll_plane.nearest(dv);

			if (n_hit === 0) {
				dv = nv;
			} else if (n_hit === 1) {
				if (planes[0].distance(nv) >= 0) {
					dv = nv;
					n_hit = 0;
				} else if (Math.abs(planes[0].n.dot(coll_plane.n)) < 1 - EPSILON) {
					dv = coll_plane.intersectPlane(planes[0]).nearest(dv);
				} else {
					//SQUISHED!
					hits = MAX_HITS;
					break;
				}
			} else if (planes[0].distance(nv) >= 0 && planes[1].distance(nv) >= 0) {
				dv = nv;
				n_hit = 0;
			} else {
				dv = sv;
				break;
			}

			let dd = dv.sub(sv);

			//going behind initial direction? really necessary?
			if (dd.dot(dir) <= 0) {
				dv = sv;
				break;
			}

			if (coll_info.response === COLLISION_RESPONSE_SLIDE) {
				const d = dd.length();
				if (d <= EPSILON) {
					dv = sv;
					break;
				}
				if (d > td) dd = dd.mul(td / d);
			} else if (coll_info.response === COLLISION_RESPONSE_SLIDEXZ) {
				const d = new Vector(dd.x, 0, dd.z).length();
				if (d <= EPSILON) {
					dv = sv;
					break;
				}
				if (d > td_xz) dd = dd.mul(td_xz / d);
			}

			coll_line.o = sv;
			coll_line.d = dd;
			dv = sv.add(dd);
			planes[n_hit++] = coll_plane;
		}

		if (hits) {
			if (hits < MAX_HITS) {
				dv = dv.clone();
				dv.y *= inv_y_scale;
				src.setWorldPosition(dv);
			} else {
				src.setWorldPosition(panic);
			}
		}
	}

	/**
	 * UpdateWorld [elapsed=1] (World::update): runs the collision pass over all
	 * enabled entities in hierarchy order and records previous transforms.
	 * (Animation, which Blitz also advances here per object, is done by the
	 * `onAnimate` hook when one is installed.)
	 */
	UpdateWorld(elapsed = 1): void {
		stats3d.trisCompared = 0;

		const enabled = this.enumEnabled().slice();

		for (const o of enabled) {
			const n = o.coll_type;
			if (n) {
				let l = this._objsByType.get(n);
				if (!l) this._objsByType.set(n, (l = []));
				l.push(o);
			}
		}

		for (const o of enabled) {
			o.beginUpdate(elapsed);
			if (this.onAnimate) this.onAnimate(o, elapsed);

			if (o.coll_type) this.collide(o);

			o.endUpdate();
		}

		this._objsByType.clear();
	}

	// ------------------------------------------------------------------
	// Picking
	// ------------------------------------------------------------------

	/** World::checkLOS */
	checkLOS(src: Entity, dest: Entity): boolean {
		const enabled = this.enumEnabled();

		const curr_coll = new Collision();

		const line = new Line(src.getWorldPosition(), dest.getWorldPosition().sub(src.getWorldPosition()));

		for (const obj of enabled) {
			if (obj === src || obj === dest || !obj.pick_geom || !obj.obscurer) continue;

			if (this.hitTest(line, 0, obj, obj.getWorldTform(), obj.pick_geom, curr_coll)) {
				return false;
			}
		}
		return true;
	}

	/** World::traceRay */
	traceRay(line: Line, radius: number, curr_coll: ObjCollision): Entity | null {
		const enabled = this.enumEnabled();

		let coll_obj: Entity | null = null;

		for (const obj of enabled) {
			if (!obj.pick_geom) continue;

			if (this.hitTest(line, radius, obj, obj.getWorldTform(), obj.pick_geom, curr_coll.collision)) {
				coll_obj = obj;
			}
		}
		if ((curr_coll.with = coll_obj)) {
			curr_coll.coords = line.at(curr_coll.collision.time).sub(curr_coll.collision.normal.mul(radius));
		}
		return coll_obj;
	}

	/**
	 * static Object *doPick( l,radius ). Note that, as in Blitz, only `time` is
	 * reset: after a miss PickedX/Y/Z/NX/NY/NZ/Surface/Triangle keep the values
	 * of the previous successful pick, while PickedEntity becomes 0.
	 */
	private doPick(l: Line, radius: number): Entity | null {
		this.picked.collision.time = 1;
		return this.traceRay(l, radius, this.picked);
	}

	/** LinePick( x,y,z,dx,dy,dz,[radius=0] ) */
	LinePick(x: number, y: number, z: number, dx: number, dy: number, dz: number, radius = 0): Entity | null {
		return this.doPick(new Line(new Vector(x, y, z), new Vector(dx, dy, dz)), radius);
	}

	/** EntityPick( entity,range ) */
	EntityPick(src: Entity, range: number): Entity | null {
		const l = new Line(src.getWorldPosition().clone(), src.getWorldTform().m.k.mul(range));
		return this.doPick(l, 0);
	}

	/** CameraPick( camera,viewport_x,viewport_y ) */
	CameraPick(c: Entity, x: number, y: number): Entity | null {
		const cam = cameraOf(c);
		const nr = cam.frustum_nr;
		const fr = cam.frustum_fr;
		const nr_w = frustumWidth(cam);
		const nr_h = frustumHeight(cam);

		x = (x / cam.vp_w - 0.5) * nr_w;
		y = (0.5 - y / cam.vp_h) * nr_h;

		let l: Line;
		if (cam.proj_mode === 2) {
			l = c.getWorldTform().mulLine(new Line(new Vector(x, y, 0), new Vector(0, 0, fr)));
		} else {
			x /= nr;
			y /= nr;
			l = c.getWorldTform().mulLine(new Line(new Vector(), new Vector(x * fr, y * fr, fr)));
		}

		return this.doPick(l, 0);
	}

	/** EntityVisible( src_entity,dest_entity ) */
	EntityVisible(src: Entity, dest: Entity): boolean {
		return this.checkLOS(src, dest);
	}

	PickedX(): number {
		return this.picked.coords.x;
	}
	PickedY(): number {
		return this.picked.coords.y;
	}
	PickedZ(): number {
		return this.picked.coords.z;
	}
	PickedNX(): number {
		return this.picked.collision.normal.x;
	}
	PickedNY(): number {
		return this.picked.collision.normal.y;
	}
	PickedNZ(): number {
		return this.picked.collision.normal.z;
	}
	PickedTime(): number {
		return this.picked.collision.time;
	}
	PickedEntity(): Entity | null {
		return this.picked.with;
	}
	PickedSurface(): unknown {
		return this.picked.collision.surface;
	}
	PickedTriangle(): number {
		return this.picked.collision.index;
	}

	// ------------------------------------------------------------------
	// Camera helpers
	// ------------------------------------------------------------------

	/** CameraProject camera,x,y,z ; returns 1/0 as Blitz does (0 = behind camera / beyond far plane) */
	CameraProject(c: Entity, x: number, y: number, z: number): number {
		const cam = cameraOf(c);
		const v = c.getWorldTform().inverse().mulVec(new Vector(x, y, z));
		const nr = cam.frustum_nr;
		const nr_w = frustumWidth(cam);
		const nr_h = frustumHeight(cam);
		if (cam.proj_mode === 2) {
			this.projected = new Vector((v.x / nr_w + 0.5) * cam.vp_w, (0.5 - v.y / nr_h) * cam.vp_h, nr);
			return 1;
		}
		if (v.z > 0) {
			// float fr=+f.getPlane( Frustum::PLANE_FAR ).d;
			const fr = getFrustum(cam).planes[5].d;
			if (v.z <= fr) {
				this.projected = new Vector(
					((v.x * nr) / v.z / nr_w + 0.5) * cam.vp_w,
					(0.5 - (v.y * nr) / v.z / nr_h) * cam.vp_h,
					nr
				);
				return 1;
			}
		}
		this.projected = new Vector();
		return 0;
	}
	ProjectedX(): number {
		return this.projected.x;
	}
	ProjectedY(): number {
		return this.projected.y;
	}
	ProjectedZ(): number {
		return this.projected.z;
	}
}

function cameraOf(c: Entity): CameraState {
	if (!c.camera) throw new Error('Entity is not a camera');
	return c.camera;
}

/** Camera::getFrustum: frustum_w=nr*2/zoom, frustum_h=frustum_w*(vp_h/vp_w) */
export function frustumWidth(cam: CameraState): number {
	return (cam.frustum_nr * 2) / cam.zoom;
}
export function frustumHeight(cam: CameraState): number {
	const ar = cam.vp_h / cam.vp_w;
	return ((cam.frustum_nr * 2) / cam.zoom) * ar;
}
export function getFrustum(cam: CameraState): Frustum {
	return new Frustum(cam.frustum_nr, cam.frustum_fr, frustumWidth(cam), frustumHeight(cam));
}

/**
 * EntityInView( entity,camera ): mesh entities test the 8 corners of their
 * mesh bounding box, everything else its position, against the frustum.
 */
export function EntityInView(e: Entity, c: Entity): boolean {
	const cam = cameraOf(c);
	const inv = c.getWorldTform().inverse();
	if (e.collider instanceof MeshCollider) {
		const b: Box = e.collider.box;
		const t = inv.mul(e.getWorldTform());
		const p: Vector[] = [];
		for (let k = 0; k < 8; ++k) p.push(t.mulVec(b.corner(k)));
		return getFrustum(cam).cull(p);
	}
	return getFrustum(cam).cull([inv.mulVec(e.getWorldPosition())]);
}
