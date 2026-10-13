/**
 * The entity handle used by the collision world. A direct port of
 * blitz3d/entity.cpp (Entity: hierarchy, local/world transforms with Blitz's
 * invalidation caching) merged with the collision-related state of
 * blitz3d/object.cpp (Object: collision type, radii, box, pick geometry,
 * obscurer flag, collision records, previous transform).
 *
 * All values are Blitz values: left-handed positions, Blitz quaternions.
 * Use the functions in commands.ts (PositionEntity, RotateEntity, ...) from
 * game code; use three.ts to mirror an entity onto a THREE.Object3D.
 */
import type { Collider, Collision } from './collision';
import { Box, Matrix, Quat, Transform, Vector, matrixQuat } from './geom';

const INVALID_LOCALTFORM = 1;
const INVALID_WORLDTFORM = 2;

/** struct ObjCollision */
export interface ObjCollision {
	with: Entity | null;
	coords: Vector;
	collision: Collision;
}

/** Camera state needed by CameraPick / CameraProject / EntityInView (blitz3d/camera.cpp). */
export interface CameraState {
	zoom: number;
	frustum_nr: number;
	frustum_fr: number;
	vp_x: number;
	vp_y: number;
	vp_w: number;
	vp_h: number;
	/** 0 none, 1 perspective, 2 orthographic */
	proj_mode: number;
}

/** Owner of the list of parentless entities (Entity::_orphans). Implemented by CollisionWorld. */
export interface EntityRoot {
	_orphans: Entity | null;
	_last_orphan: Entity | null;
}

export class Entity {
	_succ: Entity | null = null;
	_pred: Entity | null = null;
	_parent: Entity | null = null;
	_children: Entity | null = null;
	_last_child: Entity | null = null;

	private _visible = true;
	private _enabled = true;
	name = '';
	private invalid = 0;

	private local_rot = new Quat();
	private local_pos = new Vector();
	private local_scl = new Vector(1, 1, 1);
	private local_tform = new Transform();
	private world_tform = new Transform();

	// ---- Object ----
	coll_type = 0;
	coll_radii = new Vector(1, 1, 1);
	coll_box = new Box(new Vector(-1, -1, -1), new Vector(1, 1, 1));
	/** EntityPickMode geometry: 0 none, 1 sphere, 2 polygon, 3 box */
	pick_geom = 0;
	obscurer = false;
	colls: ObjCollision[] = [];
	velocity = new Vector();
	private prev_tform: Transform;
	private elapsed = 1;

	/**
	 * The entity's polygon geometry (the `Object::collide` override): a
	 * MeshCollider for meshes, TerrainCollider for terrains, PlaneCollider for
	 * planes; null for pivots, cameras, sprites, lights (which never register
	 * polygon hits, exactly like Blitz's default `Object::collide`).
	 */
	collider: Collider | null = null;
	/** Present when the entity is a camera. */
	camera: CameraState | null = null;
	/** Free slot for the game (e.g. back-reference to the unit/object record or the THREE object). */
	userData: unknown = undefined;
	/** True after FreeEntity. */
	freed = false;

	constructor(
		readonly root: EntityRoot,
		parent: Entity | null = null
	) {
		this.insert();
		// insertEntity( e,p ): setParent, setVisible, setEnabled, reset
		this.setParent(parent);
		this.prev_tform = this.getWorldTform();
	}

	// ---------------- Entity ----------------

	private remove(): void {
		if (this._parent) {
			if (this._parent._children === this) this._parent._children = this._succ;
			if (this._parent._last_child === this) this._parent._last_child = this._pred;
		} else {
			if (this.root._orphans === this) this.root._orphans = this._succ;
			if (this.root._last_orphan === this) this.root._last_orphan = this._pred;
		}
		if (this._succ) this._succ._pred = this._pred;
		if (this._pred) this._pred._succ = this._succ;
	}

	private insert(): void {
		this._succ = null;
		if (this._parent) {
			if ((this._pred = this._parent._last_child)) this._pred._succ = this;
			else this._parent._children = this;
			this._parent._last_child = this;
		} else {
			if ((this._pred = this.root._last_orphan)) this._pred._succ = this;
			else this.root._orphans = this;
			this.root._last_orphan = this;
		}
	}

	/** Entity::~Entity (FreeEntity): frees all children, unlinks. */
	free(): void {
		if (this.freed) return;
		while (this._children) this._children.free();
		this.remove();
		this._succ = this._pred = null;
		this.freed = true;
		this.colls = [];
	}

	private invalidateWorld(): void {
		if (this.invalid & INVALID_WORLDTFORM) return;
		this.invalid |= INVALID_WORLDTFORM;
		for (let e = this._children; e; e = e._succ) {
			e.invalidateWorld();
		}
	}

	private invalidateLocal(): void {
		this.invalid |= INVALID_LOCALTFORM;
		this.invalidateWorld();
	}

	/** Do not mutate the returned object. */
	getLocalTform(): Transform {
		if (this.invalid & INVALID_LOCALTFORM) {
			const m = Matrix.fromQuat(this.local_rot);
			m.i = m.i.mul(this.local_scl.x);
			m.j = m.j.mul(this.local_scl.y);
			m.k = m.k.mul(this.local_scl.z);
			this.local_tform = new Transform(m, this.local_pos.clone());
			this.invalid &= ~INVALID_LOCALTFORM;
		}
		return this.local_tform;
	}

	/** Do not mutate the returned object. */
	getWorldTform(): Transform {
		if (this.invalid & INVALID_WORLDTFORM) {
			this.world_tform = this._parent ? this._parent.getWorldTform().mul(this.getLocalTform()) : this.getLocalTform();
			this.invalid &= ~INVALID_WORLDTFORM;
		}
		return this.world_tform;
	}

	setParent(p: Entity | null): void {
		if (this._parent === p) return;
		this.remove();
		this._parent = p;
		this.insert();
		this.invalidateWorld();
	}

	getParent(): Entity | null {
		return this._parent;
	}
	children(): Entity | null {
		return this._children;
	}
	successor(): Entity | null {
		return this._succ;
	}

	setVisible(visible: boolean): void {
		this._visible = visible;
	}
	setEnabled(enabled: boolean): void {
		this._enabled = enabled;
	}
	visible(): boolean {
		return this._visible;
	}
	enabled(): boolean {
		return this._enabled;
	}

	enumEnabled(out: Entity[]): void {
		if (!this._enabled) return;
		out.push(this);
		for (let e = this._children; e; e = e._succ) {
			e.enumEnabled(out);
		}
	}

	setLocalPosition(v: Vector): void {
		this.local_pos = v.clone();
		this.invalidateLocal();
	}
	setLocalScale(v: Vector): void {
		this.local_scl = v.clone();
		this.invalidateLocal();
	}
	setLocalRotation(q: Quat): void {
		this.local_rot = q.normalized();
		this.invalidateLocal();
	}
	setLocalTform(t: Transform): void {
		this.local_pos = t.v.clone();
		this.local_scl = new Vector(t.m.i.length(), t.m.j.length(), t.m.k.length());
		this.local_rot = matrixQuat(t.m);
		this.invalidateLocal();
	}

	setWorldPosition(v: Vector): void {
		this.setLocalPosition(this._parent ? this._parent.getWorldTform().inverse().mulVec(v) : v);
	}
	setWorldScale(v: Vector): void {
		this.setLocalScale(this._parent ? v.divv(this._parent.getWorldScale()) : v);
	}
	setWorldRotation(q: Quat): void {
		this.setLocalRotation(this._parent ? this._parent.getWorldRotation().neg().mul(q) : q);
	}
	setWorldTform(t: Transform): void {
		this.setLocalTform(this._parent ? this._parent.getWorldTform().inverse().mul(t) : t);
	}

	/** Do not mutate the returned object. */
	getLocalPosition(): Vector {
		return this.local_pos;
	}
	getLocalScale(): Vector {
		return this.local_scl;
	}
	getLocalRotation(): Quat {
		return this.local_rot;
	}
	getWorldPosition(): Vector {
		return this.getWorldTform().v;
	}
	getWorldScale(): Vector {
		return this._parent ? this._parent.getWorldScale().mulv(this.local_scl) : this.local_scl;
	}
	getWorldRotation(): Quat {
		return this._parent ? this._parent.getWorldRotation().mul(this.local_rot) : this.local_rot;
	}

	// ---------------- Object ----------------

	/** Object::reset (ResetEntity) */
	reset(): void {
		this.colls = [];
		this.velocity = new Vector();
		this.prev_tform = this.getWorldTform();
	}

	getPrevWorldTform(): Transform {
		return this.prev_tform;
	}

	/** Object::beginUpdate (animation is not this module's concern) */
	beginUpdate(e: number): void {
		this.elapsed = e;
		this.colls = [];
	}

	addCollision(c: ObjCollision): void {
		this.colls.push(c);
	}

	/** Object::endUpdate */
	endUpdate(): void {
		this.velocity = this.getWorldTform().v.sub(this.prev_tform.v).div(this.elapsed);
		this.prev_tform = this.getWorldTform();
	}

	/**
	 * Object::copy (CopyEntity): deep copy of this entity and its children.
	 * Collision type, radii, box, pick mode, obscurer, name and local
	 * transform are copied; the collider is shared (as Blitz shares the mesh
	 * rep). Like bbCopyEntity/insertEntity the copies are shown and reset.
	 */
	copy(parent: Entity | null = null): Entity {
		const c = new Entity(this.root, parent);
		c.name = this.name;
		c.local_pos = this.local_pos.clone();
		c.local_scl = this.local_scl.clone();
		c.local_rot = this.local_rot.clone();
		c.invalidateLocal();
		c.coll_type = this.coll_type;
		c.coll_radii = this.coll_radii.clone();
		c.coll_box = this.coll_box.clone();
		c.pick_geom = this.pick_geom;
		c.obscurer = this.obscurer;
		c.collider = this.collider;
		c.camera = this.camera ? { ...this.camera } : null;
		c.userData = this.userData;
		for (let e = this._children; e; e = e._succ) e.copy(c);
		c.reset();
		return c;
	}
}
