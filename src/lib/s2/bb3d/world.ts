/**
 * The bb3d world: one object that owns everything Blitz3D's 3D runtime keeps
 * in globals - the entity lists and collision pairs (CollisionWorld), the
 * scene that is rendered (THREE.Scene + renderer), textures, brushes and the
 * preloaded files.
 *
 * `BBEntity` is THE entity handle. It owns
 *   - `ent`: the collision module's Entity, the authority for transforms,
 *     hierarchy, collision and picking (a line-by-line port of Blitz's
 *     Entity/Object), and
 *   - `obj`: the THREE.Object3D that is rendered, a mirror of `ent`'s local
 *     transform and parent.
 * Commands write through `ent` and mirror at once (BBEntity.sync); the two
 * places that move things on their own are handled by the world: the
 * collision pass (entities with a collision type are mirrored after
 * UpdateWorld) and animation (the animator writes THREE objects, which are
 * pulled back into their entities right away).
 */
import * as THREE from 'three';
import { Brush } from '../engine/anim/brush';
import {
	autoFadeEntity,
	copyEntity as copyThreeEntity,
	createAnimMesh,
	createMeshEntity,
	getAnimator,
	meshRep,
	refreshEntity,
	setMeshRep,
	type MeshRep
} from '../engine/anim/entity';
import type { Animator } from '../engine/anim/Animator';
import { BlitzCamera, LIGHT_SCALE, NO_FOG_FAR, NO_FOG_NEAR, installBlitzFog, toThreeWinding } from '../engine/blitzSpace';
import { Collision } from '../engine/collision/collision';
import { Entity } from '../engine/collision/entity';
import { HALFPI, Line, Matrix, Vector, rollMatrix, scaleMatrix, yawMatrix } from '../engine/collision/geom';
import { PlaneCollider, TerrainCollider } from '../engine/collision/terrainCollider';
import { syncEntity, syncObject3D } from '../engine/collision/three';
import { CollisionWorld } from '../engine/collision/world';
import type { Vfs } from '../io/Vfs';
import { makeBlitzTransparentSort, orderSequence } from './drawOrder';
import { MeshModel } from './mesh';
import { Resources, type ImageDecoder } from './resources';
import { TerrainState } from './terrain';
import { TextureManager } from './texture';

export type EntityKind = 'Pivot' | 'Mesh' | 'Camera' | 'Light' | 'Sprite' | 'Plane' | 'Terrain' | 'Listener' | 'Mirror';

/** Sprite state (blitz3d/sprite.cpp). */
export interface SpriteState {
	/** 1 free (faces the camera), 2 fixed, 3 upright, 4 upright 2 */
	viewMode: number;
	xhandle: number;
	yhandle: number;
	/** radians */
	rot: number;
	xscale: number;
	yscale: number;
}

/** Camera state beyond what picking needs (blitz3d/camera.cpp). */
export interface CameraExtra {
	/** 0..1 */
	clsColor: [number, number, number];
	clsArgb: boolean;
	clsZ: boolean;
	fogMode: number;
	fogNear: number;
	fogFar: number;
	/** 0..1 */
	fogColor: [number, number, number];
	/** What the THREE camera's projection was last built for. */
	projKey: string;
}

/** Light state (gxruntime/gxlight.cpp). */
export interface LightState {
	/** 1 directional, 2 point, 3 spot */
	type: number;
	range: number;
	/** radians: dvTheta, dvPhi */
	inner: number;
	outer: number;
}

/** Hooks of an entity that stands for something rendered elsewhere (see bb3d/environment.ts). */
export interface ProxyHooks {
	onVisible?(visible: boolean): void;
	onAlpha?(alpha: number): void;
	onFree?(): void;
}

const handles = new WeakMap<THREE.Object3D, BBEntity>();

/** A Blitz3D entity handle. `null` plays the role of handle 0. */
export class BBEntity {
	/** True after FreeEntity (of this entity or one of its parents). */
	freed = false;
	/** EntityOrder */
	order = 0;
	/** Mesh entities: the (possibly shared) mesh data. */
	mesh: MeshModel | null = null;
	sprite: SpriteState | null = null;
	terrain: TerrainState | null = null;
	camera: CameraExtra | null = null;
	light: LightState | null = null;
	proxy: ProxyHooks | null = null;
	/** Planes: CreatePlane segments (stored only). */
	planeSegments = 0;
	/** Cached Animator of `obj`, if any. */
	animator: Animator | null = null;
	/** Free slot for game code. */
	userData: unknown = undefined;
	private savedMatrix: THREE.Matrix4 | null = null;
	private savedDepth = 0;

	constructor(
		readonly world: World,
		readonly cls: EntityKind,
		readonly ent: Entity,
		readonly obj: THREE.Object3D
	) {
		ent.userData = this;
		handles.set(obj, this);
	}

	/** Model entities take a brush: meshes, sprites, planes and terrains. */
	get isModel(): boolean {
		return this.cls === 'Mesh' || this.cls === 'Sprite' || this.cls === 'Plane' || this.cls === 'Terrain';
	}

	/** Mirrors the entity's local transform onto the THREE object. */
	sync(): void {
		syncObject3D(this.ent, this.obj);
	}

	/**
	 * The reverse: takes the THREE object's local transform (after the animator
	 * moved it). The entity normalises the rotation (Entity::setLocalRotation),
	 * so the result is written back to keep both sides identical.
	 */
	pull(): void {
		syncEntity(this.obj, this.ent);
		syncObject3D(this.ent, this.obj);
	}

	get parent(): BBEntity | null {
		const p = this.ent.getParent();
		return p ? (p.userData as BBEntity) : null;
	}

	/** Children in Blitz order. */
	children(): BBEntity[] {
		const out: BBEntity[] = [];
		for (let e = this.ent.children(); e; e = e.successor()) out.push(e.userData as BBEntity);
		return out;
	}

	/** True when this entity and all its parents are shown (what World::enumVisible visits). */
	get effectivelyVisible(): boolean {
		for (let e: Entity | null = this.ent; e; e = e.getParent()) if (!e.visible()) return false;
		return true;
	}

	/** Installs or removes the per-draw hooks (sprite matrix, ordered entities without depth test). */
	updateRenderHooks(): void {
		const obj = this.obj;
		if (!this.sprite && this.order === 0) {
			obj.onBeforeRender = THREE.Object3D.prototype.onBeforeRender;
			obj.onAfterRender = THREE.Object3D.prototype.onAfterRender;
			return;
		}
		obj.onBeforeRender = (_r, _s, camera, _g, material) => {
			if (this.order !== 0 && material) {
				// World::render: gx_scene->setZMode( gxScene::ZMODE_DISABLE ) for ordered models.
				this.savedDepth = (material.depthTest ? 1 : 0) | (material.depthWrite ? 2 : 0);
				material.depthTest = false;
				material.depthWrite = false;
			}
			if (this.sprite) {
				this.savedMatrix ??= new THREE.Matrix4();
				this.savedMatrix.copy(obj.matrixWorld);
				spriteMatrix(this, camera, obj.matrixWorld);
			}
		};
		obj.onAfterRender = (_r, _s, _c, _g, material) => {
			if (this.order !== 0 && material) {
				material.depthTest = (this.savedDepth & 1) !== 0;
				material.depthWrite = (this.savedDepth & 2) !== 0;
			}
			if (this.sprite && this.savedMatrix) obj.matrixWorld.copy(this.savedMatrix);
		};
	}
}

/** The handle that owns a THREE object, if it is a bb3d entity. */
export function handleOf(obj: THREE.Object3D): BBEntity | null {
	return handles.get(obj) ?? null;
}

/**
 * Sprite::render: the matrix a sprite is drawn with for one camera.
 *   free:     the camera's orientation (entity rotation and scale ignored)
 *   fixed:    the entity's own
 *   upright:  entity matrix with its Z axis replaced by the camera's, orthogonalised
 *   upright2: yawMatrix( camera yaw ) * entity matrix
 * then * rollMatrix( rot ) * scaleMatrix( xscale,yscale,1 ), and the handle
 * offsets the quad.
 */
function spriteMatrix(h: BBEntity, camera: THREE.Camera, out: THREE.Matrix4): void {
	const s = h.sprite!;
	const t = h.ent.getWorldTform();
	const c = camera.matrixWorld.elements;
	const cam = new Matrix(new Vector(c[0], c[1], c[2]), new Vector(c[4], c[5], c[6]), new Vector(c[8], c[9], c[10]));
	let m: Matrix;
	if (s.viewMode === 1) m = cam;
	else if (s.viewMode === 3) {
		m = t.m.clone();
		m.k = cam.k.clone();
		m.orthogonalize();
	} else if (s.viewMode === 4) m = yawMatrix(cam.k.yaw()).mul(t.m);
	else m = t.m;
	m = m.mul(rollMatrix(s.rot)).mul(scaleMatrix(s.xscale, s.yscale, 1));
	const o = m.mulVec(new Vector(-s.xhandle, -s.yhandle, 0)).add(t.v);
	out.set(m.i.x, m.j.x, m.k.x, o.x, m.i.y, m.j.y, m.k.y, o.y, m.i.z, m.j.z, m.k.z, o.z, 0, 0, 0, 1);
}

let spriteRep: MeshRep | undefined;

/** The quad every sprite draws: corners (-1,1) (1,1) (1,-1) (-1,-1), u,v from the top left. */
function getSpriteRep(): MeshRep {
	if (!spriteRep) {
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, 1, 0, 1, 1, 0, 1, -1, 0, -1, -1, 0], 3));
		// Blitz gives sprite vertices a null normal; they are full-bright unless EntityFX removes that.
		geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 0, -1, 0, 0, -1, 0, 0, -1, 0, 0, -1], 3));
		const uv = new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2);
		geometry.setAttribute('uv', uv);
		geometry.setAttribute('uv1', uv);
		geometry.setIndex(toThreeWinding([0, 1, 2, 0, 2, 3]));
		geometry.addGroup(0, 6, 0);
		const box = new THREE.Box3(new THREE.Vector3(-1, -1, 0), new THREE.Vector3(1, 1, 0));
		geometry.boundingBox = box.clone();
		geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
		spriteRep = { geometry, surfaces: [new Brush()], box, hasColors: false };
	}
	return spriteRep;
}

function newPlaneRep(): MeshRep {
	const geometry = new THREE.BufferGeometry();
	geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(12), 3));
	geometry.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], 3));
	const uv = new THREE.BufferAttribute(new Float32Array(8), 2);
	geometry.setAttribute('uv', uv);
	geometry.setAttribute('uv1', uv);
	// Clockwise seen from above (the plane's front) in Blitz space.
	geometry.setIndex(toThreeWinding([0, 1, 2, 0, 2, 3]));
	geometry.addGroup(0, 6, 0);
	const box = new THREE.Box3(new THREE.Vector3(-1, 0, -1), new THREE.Vector3(1, 0, 1));
	geometry.boundingBox = box.clone();
	geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Infinity);
	return { geometry, surfaces: [new Brush()], box, hasColors: false };
}

const FLIP_Z = new THREE.Matrix4().makeScale(1, 1, -1);

/** BlitzCamera with CameraProjMode 2 (orthographic) support. */
export class BBCamera extends BlitzCamera {
	/** Orthographic frustum size at the near plane, or null for perspective. */
	ortho: { w: number; h: number } | null = null;

	override updateProjectionMatrix(): void {
		if (!this.ortho) {
			super.updateProjectionMatrix();
			return;
		}
		const { w, h } = this.ortho;
		this.projectionMatrix.makeOrthographic(-w / 2, w / 2, h / 2, -h / 2, this.near, this.far).multiply(FLIP_Z);
		this.projectionMatrixInverse.copy(this.projectionMatrix).invert();
	}
}

export interface WorldOptions {
	/** File source for LoadMesh / LoadTexture (after preload). */
	vfs?: Vfs | null;
	/** Omit (or null) to run headless: everything works except drawing. */
	renderer?: THREE.WebGLRenderer | null;
	/** Graphics3D width and height: the logical screen the camera viewports and CameraProject refer to. */
	width?: number;
	height?: number;
	imageDecoder?: ImageDecoder;
	/** Where `preload('all')` finds the file list when the Vfs cannot enumerate. */
	manifestUrl?: string;
}

export interface RenderViewOptions {
	/** False renders without fog whatever the scene fog says. */
	fog?: boolean;
}

export class World {
	/** The world the bb3d command functions act on. */
	static current: World;

	readonly collision = new CollisionWorld();
	readonly scene = new THREE.Scene();
	/** scene.fog: driven per camera by CameraFogMode/Range/Color. */
	readonly fog = new THREE.Fog(0x000000, NO_FOG_NEAR, NO_FOG_FAR);
	/** AmbientLight r,g,b */
	readonly ambient = new THREE.AmbientLight();
	renderer: THREE.WebGLRenderer | null = null;
	width: number;
	height: number;

	readonly resources: Resources;
	readonly textures: TextureManager;
	/** CreateBrush handles that have not been freed. */
	readonly brushes = new Set<Brush>();

	readonly cameras = new Set<BBEntity>();
	readonly lights = new Set<BBEntity>();
	readonly planes = new Set<BBEntity>();
	readonly terrains = new Set<BBEntity>();
	/** Entities with EntityAutoFade. */
	readonly autoFade = new Set<BBEntity>();
	/** Entities with a collision type: the ones UpdateWorld can move. */
	readonly collidable = new Set<BBEntity>();
	/** Every model entity (for material refreshes). */
	readonly models = new Set<BBEntity>();
	listener: BBEntity | null = null;

	private dirtyMeshes = new Set<MeshModel>();
	/** Set when a TextureBlend / TextureCoords change must reach existing materials. */
	materialsDirty = false;
	/** WireFrame */
	wireframe = false;
	private wireframeApplied = false;
	/** TrisRendered() */
	trisRendered = 0;
	/** When false the scene fog is left alone (something else drives it). */
	manageFog = true;

	private orderCounts = new Map<number, number>();
	private orderLayers = new Map<number, number>();
	private sortEye = new THREE.Vector3();
	private tmpV = new THREE.Vector3();
	private inRenderWorld = false;

	constructor(opts: WorldOptions = {}) {
		this.width = opts.width ?? 800;
		this.height = opts.height ?? 600;
		this.resources = new Resources(opts.vfs ?? null, opts.imageDecoder, opts.manifestUrl);
		this.textures = new TextureManager(
			(p) => this.resources.pixels(p),
			(p) => this.resources.hasImage(p)
		);
		// gxScene: ambient GRAY
		this.ambient.color.setRGB(0.5, 0.5, 0.5);
		this.ambient.intensity = LIGHT_SCALE;
		this.ambient.layers.enableAll();
		this.scene.add(this.ambient);
		this.scene.fog = this.fog;
		this.collision.onAnimate = (e, elapsed) => {
			const h = e.userData as BBEntity | undefined;
			if (h && h.animator) this.animateEntity(h, elapsed);
		};
		if (opts.renderer) this.setRenderer(opts.renderer);
		World.current = this;
	}

	/** Attaches (or detaches) the renderer. */
	setRenderer(renderer: THREE.WebGLRenderer | null): void {
		this.renderer = renderer;
		if (!renderer) return;
		installBlitzFog();
		renderer.setTransparentSort(makeBlitzTransparentSort(this.sortEye));
	}

	/** Graphics3D width,height: the logical screen size. */
	setGraphics(width: number, height: number): void {
		this.width = width;
		this.height = height;
	}

	// ------------------------------------------------------------------ resources

	/**
	 * Fetches and decodes models and images so that LoadMesh, LoadAnimMesh and
	 * LoadTexture are synchronous afterwards. 'all' takes every model and image
	 * of the mod.
	 */
	preload(paths: readonly string[] | 'all', onProgress?: (done: number, total: number) => void): Promise<void> {
		return this.resources.preload(paths, onProgress);
	}

	/** Makes one more file available (a model also brings its textures). */
	ensureLoaded(path: string): Promise<void> {
		return this.resources.ensureLoaded(path);
	}

	// ------------------------------------------------------------------ entity creation

	/** insertEntity( e,p ): links a new entity into both trees. */
	private insert(h: BBEntity, parent: BBEntity | null): BBEntity {
		(parent ? parent.obj : this.scene).add(h.obj);
		h.sync();
		h.ent.reset();
		return h;
	}

	private newEntity(parent: BBEntity | null): Entity {
		return new Entity(this.collision, parent ? parent.ent : null);
	}

	createPivot(parent: BBEntity | null, cls: EntityKind = 'Pivot'): BBEntity {
		return this.insert(new BBEntity(this, cls, this.newEntity(parent), new THREE.Object3D()), parent);
	}

	/** A mesh entity for mesh data (CreateMesh, LoadMesh, the primitives, CopyMesh). */
	createMesh(mesh: MeshModel, parent: BBEntity | null): BBEntity {
		const ent = this.newEntity(parent);
		ent.collider = mesh;
		const h = new BBEntity(this, 'Mesh', ent, createMeshEntity(mesh.getRep()));
		this.attachMesh(h, mesh);
		this.models.add(h);
		return this.insert(h, parent);
	}

	private attachMesh(h: BBEntity, mesh: MeshModel): void {
		h.mesh = mesh;
		mesh.users.add(h);
		mesh.onDirty = (m) => this.dirtyMeshes.add(m);
		if (mesh.dirty) this.dirtyMeshes.add(mesh);
	}

	/** LoadMesh( file$,parent ): null when the file is missing or not a preloaded .b3d. */
	loadMesh(file: string, parent: BBEntity | null): BBEntity | null {
		if (!file.toLowerCase().endsWith('.b3d')) return null;
		const rep = this.resources.collapsed(file, this.textures);
		if (!rep) return null;
		return this.createMesh(new MeshModel(rep), parent);
	}

	/** LoadAnimMesh( file$,parent ) */
	loadAnimMesh(file: string, parent: BBEntity | null): BBEntity | null {
		if (!file.toLowerCase().endsWith('.b3d')) return null;
		const model = this.resources.model(file);
		const brushes = this.resources.brushes(file, this.textures);
		if (!model || !brushes) return null;
		const root = createAnimMesh(model, brushes);
		(parent ? parent.obj : this.scene).add(root);
		const wrap = (obj: THREE.Object3D, p: BBEntity | null): BBEntity => {
			const ent = this.newEntity(p);
			const rep = meshRep(obj);
			const h = new BBEntity(this, rep ? 'Mesh' : 'Pivot', ent, obj);
			ent.name = obj.name;
			h.pull();
			if (rep) {
				const mesh = new MeshModel(rep);
				ent.collider = mesh;
				this.attachMesh(h, mesh);
				this.models.add(h);
			}
			for (const c of obj.children) wrap(c, h);
			h.animator = getAnimator(obj) ?? null;
			ent.reset();
			return h;
		};
		return wrap(root, parent);
	}

	createCamera(parent: BBEntity | null): BBEntity {
		const ent = this.newEntity(parent);
		// bbCreateCamera: the viewport is that of the current canvas.
		ent.camera = {
			zoom: 1,
			frustum_nr: 1,
			frustum_fr: 1000,
			vp_x: 0,
			vp_y: 0,
			vp_w: this.width,
			vp_h: this.height,
			proj_mode: 1
		};
		const h = new BBEntity(this, 'Camera', ent, new BBCamera(1, 1000));
		h.camera = newCameraExtra();
		this.cameras.add(h);
		return this.insert(h, parent);
	}

	createLight(type: number, parent: BBEntity | null): BBEntity {
		const t = type === 2 ? 2 : type === 3 ? 3 : 1;
		const state: LightState = { type: t, range: 1000, inner: 0, outer: HALFPI };
		const obj = makeThreeLight(state);
		const h = new BBEntity(this, 'Light', this.newEntity(parent), obj);
		h.light = state;
		this.lights.add(h);
		return this.insert(h, parent);
	}

	createSprite(parent: BBEntity | null): BBEntity {
		const brush = new Brush();
		brush.fx = 1; // s->setFX( gxScene::FX_FULLBRIGHT )
		const mesh = createMeshEntity(getSpriteRep(), brush);
		mesh.frustumCulled = false;
		const h = new BBEntity(this, 'Sprite', this.newEntity(parent), mesh);
		h.sprite = { viewMode: 1, xhandle: 0, yhandle: 0, rot: 0, xscale: 1, yscale: 1 };
		h.updateRenderHooks();
		this.models.add(h);
		return this.insert(h, parent);
	}

	createPlane(segments: number, parent: BBEntity | null): BBEntity {
		const ent = this.newEntity(parent);
		ent.collider = new PlaneCollider();
		const mesh = createMeshEntity(newPlaneRep());
		mesh.frustumCulled = false;
		const h = new BBEntity(this, 'Plane', ent, mesh);
		h.planeSegments = segments;
		this.planes.add(h);
		this.models.add(h);
		return this.insert(h, parent);
	}

	createTerrain(gridSize: number | TerrainCollider, parent: BBEntity | null): BBEntity {
		const collider = typeof gridSize === 'number' ? new TerrainCollider(gridSize) : gridSize;
		const ent = this.newEntity(parent);
		ent.collider = collider;
		const state = new TerrainState(collider);
		const mesh = createMeshEntity(state.rep);
		mesh.frustumCulled = false;
		const h = new BBEntity(this, 'Terrain', ent, mesh);
		h.terrain = state;
		this.terrains.add(h);
		this.models.add(h);
		return this.insert(h, parent);
	}

	/**
	 * An entity that takes part in hierarchy, picking and collision but draws
	 * nothing itself: it stands for something another module renders (the
	 * environment's sea and ground planes, an adopted engine Terrain).
	 */
	createProxy(cls: EntityKind, collider: Entity['collider'], hooks: ProxyHooks = {}, terrain?: TerrainState): BBEntity {
		const ent = this.newEntity(null);
		ent.collider = collider;
		const h = new BBEntity(this, cls, ent, new THREE.Object3D());
		h.proxy = hooks;
		if (terrain) h.terrain = terrain;
		return this.insert(h, null);
	}

	/** CopyEntity( entity,parent ): Object::copy for the entity and everything below it. */
	copyEntity(src: BBEntity, parent: BBEntity | null): BBEntity {
		const ent = src.ent.copy(parent ? parent.ent : null);
		const obj = copyThreeEntity(src.obj, parent ? parent.obj : this.scene);
		const pair = (s: BBEntity, e: Entity, o: THREE.Object3D): BBEntity => {
			const h = new BBEntity(this, s.cls, e, o);
			h.planeSegments = s.planeSegments;
			h.animator = getAnimator(o) ?? null;
			if (s.mesh) this.attachMesh(h, s.mesh);
			if (s.sprite) {
				h.sprite = { ...s.sprite };
				(o as THREE.Mesh).frustumCulled = false;
			}
			if (s.cls === 'Plane' && !s.proxy) {
				// Each plane has its own camera-following quad.
				setMeshRep(o, newPlaneRep());
				(o as THREE.Mesh).frustumCulled = false;
				this.planes.add(h);
			}
			if (s.terrain) {
				// The copy shares the height data, as it shares every other mesh.
				h.terrain = s.terrain;
				(o as THREE.Mesh).frustumCulled = false;
				this.terrains.add(h);
			}
			if (s.camera) {
				h.camera = { ...s.camera, clsColor: [...s.camera.clsColor], fogColor: [...s.camera.fogColor], projKey: '' };
				this.cameras.add(h);
			}
			if (s.light) {
				h.light = { ...s.light };
				this.lights.add(h);
			}
			if (s.proxy) h.proxy = s.proxy;
			if (s.isModel && !s.proxy) this.models.add(h);
			if (this.autoFade.has(s)) this.autoFade.add(h);
			if (e.coll_type) this.collidable.add(h);
			// Object( const Object &o ): order(o.order)
			if (s.order) this.setOrder(h, s.order);
			else h.updateRenderHooks();
			const sc = s.children();
			let ce = e.children();
			if (sc.length !== o.children.length) throw new Error('bb3d: entity trees out of sync in CopyEntity');
			for (let i = 0; i < sc.length; i++) {
				if (!ce) throw new Error('bb3d: entity trees out of sync in CopyEntity');
				pair(sc[i], ce, o.children[i]);
				ce = ce.successor();
			}
			return h;
		};
		return pair(src, ent, obj);
	}

	/** FreeEntity: the entity and all its children. */
	freeEntity(h: BBEntity): void {
		if (h.freed) return;
		const release = (e: BBEntity) => {
			for (const c of e.children()) release(c);
			e.freed = true;
			if (e.order) this.releaseOrder(e.order);
			this.cameras.delete(e);
			this.lights.delete(e);
			this.planes.delete(e);
			this.terrains.delete(e);
			this.autoFade.delete(e);
			this.collidable.delete(e);
			this.models.delete(e);
			if (this.listener === e) this.listener = null;
			if (e.mesh) {
				e.mesh.users.delete(e);
				if (e.mesh.users.size === 0) {
					this.dirtyMeshes.delete(e.mesh);
					e.mesh.dispose();
				}
			}
			if (e.cls === 'Plane' && !e.proxy) (e.obj as THREE.Mesh).geometry.dispose();
			if (e.cls === 'Terrain' && !e.proxy && e.terrain) {
				let shared = false;
				for (const t of this.terrains) if (t.terrain === e.terrain) shared = true;
				if (!shared) e.terrain.rep.geometry.dispose();
			}
			if (e.light) (e.obj as THREE.Light).dispose();
			e.proxy?.onFree?.();
		};
		release(h);
		h.obj.removeFromParent();
		h.ent.free();
	}

	// ------------------------------------------------------------------ draw order

	private layerOf(order: number): number {
		if (order === 0) return 0;
		let l = this.orderLayers.get(order);
		if (l === undefined) {
			const used = new Set(this.orderLayers.values());
			l = 1;
			while (l < 31 && used.has(l)) l++;
			// More than 31 distinct orders at once share the last layer.
			this.orderLayers.set(order, l);
		}
		return l;
	}

	private releaseOrder(order: number): void {
		const n = (this.orderCounts.get(order) ?? 1) - 1;
		if (n > 0) this.orderCounts.set(order, n);
		else {
			this.orderCounts.delete(order);
			this.orderLayers.delete(order);
		}
	}

	/** EntityOrder for a model: its own render pass (see drawOrder.ts). */
	setOrder(h: BBEntity, order: number): void {
		if (h.order === order) {
			h.updateRenderHooks();
			return;
		}
		if (h.cls !== 'Camera') {
			if (h.order) this.releaseOrder(h.order);
			if (order) this.orderCounts.set(order, (this.orderCounts.get(order) ?? 0) + 1);
			h.obj.layers.set(this.layerOf(order));
		}
		h.order = order;
		if (h.cls !== 'Camera') h.updateRenderHooks();
	}

	// ------------------------------------------------------------------ update

	/** Object::animate for one entity, with the entities of the moved objects brought up to date. */
	private animateEntity(h: BBEntity, elapsed: number): void {
		const a = h.animator!;
		if (!a.animating()) return;
		a.update(elapsed);
		this.pullAnimated(a);
	}

	/** Takes the transforms an animator wrote into the THREE objects back into their entities. */
	pullAnimated(a: Animator): void {
		for (const o of a.getObjects()) handles.get(o as unknown as THREE.Object3D)?.pull();
	}

	/**
	 * UpdateWorld elapsed#=1 (World::update): for every enabled entity, in
	 * hierarchy order: clear its collisions, advance its animation, run its
	 * collision test, record its velocity.
	 */
	updateWorld(elapsed = 1): void {
		this.collision.UpdateWorld(elapsed);
		for (const h of this.collidable) h.sync();
	}

	// ------------------------------------------------------------------ render

	/** Brings everything derived (mesh geometry, materials, terrain meshes, texture uploads, lights) up to date. */
	flush(): void {
		for (const m of this.dirtyMeshes) {
			const rep = m.getRep();
			for (const u of m.users) setMeshRep((u as BBEntity).obj, rep);
		}
		this.dirtyMeshes.clear();
		const done = new Set<TerrainState>();
		for (const t of this.terrains) {
			if (t.terrain && !done.has(t.terrain)) {
				done.add(t.terrain);
				t.terrain.update();
			}
		}
		if (this.materialsDirty) {
			this.materialsDirty = false;
			for (const h of this.models) refreshEntity(h.obj);
		}
		this.textures.upload();
		for (const h of this.lights) this.updateLight(h);
		if (this.wireframe || this.wireframeApplied) {
			const on = this.wireframe;
			this.scene.traverse((o) => {
				const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
				if (!m) return;
				for (const mat of Array.isArray(m) ? m : [m]) {
					if ('wireframe' in mat) (mat as THREE.MeshBasicMaterial).wireframe = on;
				}
			});
			this.wireframeApplied = on;
		}
	}

	/** Light::beginRender: position and direction (the entity's Z axis) of the THREE light. */
	private updateLight(h: BBEntity): void {
		const l = h.obj as THREE.DirectionalLight | THREE.SpotLight | THREE.PointLight;
		const s = h.light!;
		if (s.type === 2) return;
		const t = h.ent.getWorldTform();
		const target = (l as THREE.DirectionalLight).target;
		target.matrixWorld.makeTranslation(t.v.x + t.m.k.x, t.v.y + t.m.k.y, t.v.z + t.m.k.z);
	}

	/** Cameras that World::render would draw, highest EntityOrder first. */
	activeCameras(): BBEntity[] {
		const list: BBEntity[] = [];
		for (const c of this.cameras) if (c.effectivelyVisible && c.ent.camera!.proj_mode) list.push(c);
		// cam_que is a priority queue on getOrder(); creation order breaks ties here.
		return list.sort((a, b) => b.order - a.order);
	}

	/** RenderWorld tween#=1: every active camera, in order. Tweening (CaptureWorld) is not implemented. */
	renderWorld(): void {
		this.flush();
		const r = this.renderer;
		if (!r) return;
		this.scene.updateMatrixWorld();
		const autoReset = r.info.autoReset;
		r.info.autoReset = false;
		r.info.reset();
		this.inRenderWorld = true;
		try {
			for (const cam of this.activeCameras()) this.renderCamera(cam);
		} finally {
			this.inRenderWorld = false;
			this.trisRendered = r.info.render.triangles;
			r.info.autoReset = autoReset;
		}
	}

	/** Camera::beginRenderFrame + World::render( cam ): viewport, clear, projection, fog, then the scene. */
	renderCamera(cam: BBEntity): void {
		const r = this.renderer;
		if (!r) return;
		const cs = cam.ent.camera!;
		const cx = cam.camera!;
		const camera = cam.obj as BBCamera;
		syncProjection(cam);

		// The camera viewport is in logical (Graphics3D) pixels, origin top left.
		const target = r.getRenderTarget();
		const size = target ? this.tmpSize.set(target.width, target.height) : r.getSize(this.tmpSize);
		const sx = size.x / this.width;
		const sy = size.y / this.height;
		const vx = cs.vp_x * sx;
		const vy = (this.height - cs.vp_y - cs.vp_h) * sy;
		const vw = cs.vp_w * sx;
		const vh = cs.vp_h * sy;
		const full = cs.vp_x === 0 && cs.vp_y === 0 && cs.vp_w === this.width && cs.vp_h === this.height;
		const prev = {
			viewport: r.getViewport(new THREE.Vector4()),
			scissor: r.getScissor(new THREE.Vector4()),
			scissorTest: r.getScissorTest(),
			color: r.getClearColor(new THREE.Color()),
			alpha: r.getClearAlpha(),
			autoClear: r.autoClear
		};
		if (target) {
			target.viewport.set(vx, vy, vw, vh);
			target.scissor.set(vx, vy, vw, vh);
			target.scissorTest = !full;
			r.setRenderTarget(target, r.getActiveCubeFace(), r.getActiveMipmapLevel());
		} else {
			r.setViewport(vx, vy, vw, vh);
			r.setScissor(vx, vy, vw, vh);
			r.setScissorTest(!full);
		}
		r.autoClear = false;
		// gx_scene->clear( cls_color,1,1,cls_argb,cls_z )
		if (cx.clsArgb || cx.clsZ) {
			r.setClearColor(this.tmpColor.setRGB(cx.clsColor[0], cx.clsColor[1], cx.clsColor[2]), 1);
			r.clear(cx.clsArgb, cx.clsZ, false);
		}
		if (this.manageFog) {
			if (cx.fogMode === 1) {
				this.fog.near = cx.fogNear;
				this.fog.far = cx.fogFar;
				this.fog.color.setRGB(cx.fogColor[0], cx.fogColor[1], cx.fogColor[2]);
			} else {
				this.fog.near = NO_FOG_NEAR;
				this.fog.far = NO_FOG_FAR;
			}
		}
		try {
			this.renderView(camera);
		} finally {
			r.autoClear = prev.autoClear;
			r.setClearColor(prev.color, prev.alpha);
			if (target) {
				target.viewport.set(0, 0, target.width, target.height);
				target.scissor.set(0, 0, target.width, target.height);
				target.scissorTest = false;
				r.setRenderTarget(target, r.getActiveCubeFace(), r.getActiveMipmapLevel());
			} else {
				r.setViewport(prev.viewport);
				r.setScissor(prev.scissor);
				r.setScissorTest(prev.scissorTest);
			}
		}
	}

	private tmpSize = new THREE.Vector2();
	private tmpColor = new THREE.Color();

	/**
	 * World::render( Camera* ) for any BlitzCamera, into the current viewport
	 * and without clearing: auto fade, planes, then one pass per EntityOrder
	 * value (positive orders first, then the unordered scene, then negative
	 * orders). Other modules that render the scene with their own camera (the
	 * environment's water reflection) call this instead of renderer.render.
	 */
	renderView(camera: BlitzCamera, opts: RenderViewOptions = {}): void {
		const r = this.renderer;
		if (!r) return;
		if (!this.inRenderWorld) {
			this.flush();
			this.scene.updateMatrixWorld();
		}
		if (camera.parent === null) camera.updateMatrixWorld();
		const eye = this.sortEye.setFromMatrixPosition(camera.matrixWorld);

		// Model::doAutoFade against this camera
		for (const h of this.autoFade) {
			if (!h.obj.visible) continue;
			const p = h.ent.getWorldPosition();
			autoFadeEntity(h.obj, eye, this.tmpV.set(p.x, p.y, p.z));
		}
		for (const h of this.planes) this.updatePlane(h, eye, camera.far);

		let fogNear = 0;
		let fogFar = 0;
		const noFog = opts.fog === false && this.scene.fog === this.fog;
		if (noFog) {
			fogNear = this.fog.near;
			fogFar = this.fog.far;
			this.fog.near = NO_FOG_NEAR;
			this.fog.far = NO_FOG_FAR;
		}
		const autoClear = r.autoClear;
		const autoUpdate = this.scene.matrixWorldAutoUpdate;
		const mask = camera.layers.mask;
		r.autoClear = false;
		this.scene.matrixWorldAutoUpdate = false;
		try {
			for (const order of orderSequence(this.orderCounts.keys())) {
				camera.layers.set(this.layerOf(order));
				r.render(this.scene, camera);
			}
		} finally {
			camera.layers.mask = mask;
			this.scene.matrixWorldAutoUpdate = autoUpdate;
			r.autoClear = autoClear;
			if (noFog) {
				this.fog.near = fogNear;
				this.fog.far = fogFar;
			}
		}
	}

	/**
	 * PlaneModel::Rep::render: the visible part of the infinite plane y=0 of
	 * the entity, with texture coordinates equal to the plane-local x,z. Blitz
	 * clips the view frustum against the plane; here a quad around the eye
	 * that reaches past the far plane stands in. Nothing is drawn when the eye
	 * is not above the plane (eye.y<=0 in plane space), even for two-sided brushes.
	 */
	private updatePlane(h: BBEntity, eye: THREE.Vector3, far: number): void {
		const geo = (h.obj as THREE.Mesh).geometry;
		const tf = h.ent.getWorldTform();
		const e = tf.inverse().mulVec(new Vector(eye.x, eye.y, eye.z));
		if (!(e.y > 0)) {
			geo.setDrawRange(0, 0);
			return;
		}
		geo.setDrawRange(0, 6);
		const sx = tf.m.i.length() || 1;
		const sz = tf.m.k.length() || 1;
		// Far enough to cover the far plane for any field of view up to about 150 degrees.
		const rx = (far * 4) / sx;
		const rz = (far * 4) / sz;
		const pos = geo.getAttribute('position') as THREE.BufferAttribute;
		const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
		const xs = [e.x - rx, e.x - rx, e.x + rx, e.x + rx];
		const zs = [e.z - rz, e.z + rz, e.z + rz, e.z - rz];
		for (let i = 0; i < 4; i++) {
			pos.setXYZ(i, xs[i], 0, zs[i]);
			// float tex_coords[2][2]={ {v.x,v.z},{v.x,v.z} };
			uv.setXY(i, xs[i], zs[i]);
		}
		pos.needsUpdate = true;
		uv.needsUpdate = true;
	}

	/**
	 * The rendered frame as gfx2d native pixels (A<<24|B<<16|G<<8|R, top row
	 * first) at the logical resolution: `gfx2d.setSceneGrabber(() => world.grabScene())`
	 * makes CopyRect / GrabImage from the back buffer see the 3D scene.
	 */
	grabScene(): Uint32Array | null {
		const r = this.renderer;
		if (!r) return null;
		const gl = r.getContext();
		const w = gl.drawingBufferWidth;
		const h = gl.drawingBufferHeight;
		const raw = new Uint8Array(w * h * 4);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
		gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, raw);
		r.resetState();
		const src = new Uint32Array(raw.buffer);
		const out = new Uint32Array(this.width * this.height);
		for (let y = 0; y < this.height; y++) {
			const sy = h - 1 - Math.min(h - 1, Math.trunc((y * h) / this.height));
			for (let x = 0; x < this.width; x++) {
				out[y * this.width + x] = src[sy * w + Math.min(w - 1, Math.trunc((x * w) / this.width))] | 0xff000000;
			}
		}
		return out;
	}

	// ------------------------------------------------------------------ picking helpers

	/**
	 * World::checkLOS for two points: true when no pickable obscurer lies on
	 * the segment. `ignore` entities are skipped (EntityVisible skips its two
	 * entities).
	 */
	lineOfSight(from: Vector, to: Vector, ignore: readonly BBEntity[] = []): boolean {
		const line = new Line(from, to.sub(from));
		const coll = new Collision();
		const enabled: Entity[] = [];
		for (let e = this.collision._orphans; e; e = e.successor()) e.enumEnabled(enabled);
		for (const obj of enabled) {
			if (!obj.pick_geom || !obj.obscurer) continue;
			if (ignore.some((h) => h.ent === obj)) continue;
			if (this.collision.hitTest(line, 0, obj, obj.getWorldTform(), obj.pick_geom, coll)) return false;
		}
		return true;
	}

	/** ClearWorld entities=1,brushes=1,textures=1 */
	clear(entities = true, brushes = true, textures = true): void {
		if (entities) {
			while (this.collision._orphans) {
				const h = this.collision._orphans.userData as BBEntity | undefined;
				if (h) this.freeEntity(h);
				else this.collision._orphans.free();
			}
		}
		if (brushes) this.brushes.clear();
		void textures;
	}
}

function newCameraExtra(): CameraExtra {
	return {
		clsColor: [0, 0, 0],
		clsArgb: true,
		clsZ: true,
		fogMode: 0,
		fogNear: 1,
		fogFar: 1000,
		fogColor: [0, 0, 0],
		projKey: ''
	};
}

/** gxLight: white, range 1000 (attenuation1 = 1/range, so intensity = range/distance), cone 0..90 degrees. */
function makeThreeLight(s: LightState): THREE.Light {
	let l: THREE.Light;
	if (s.type === 2) {
		const p = new THREE.PointLight(0xffffff, 1, 0, 1);
		l = p;
	} else if (s.type === 3) {
		const sp = new THREE.SpotLight(0xffffff, 1, 0, Math.PI / 4, 1, 1);
		l = sp;
	} else {
		l = new THREE.DirectionalLight(0xffffff, 1);
	}
	l.layers.enableAll();
	applyLightState(l, s);
	return l;
}

/** Applies range and cone angles to the THREE light. */
export function applyLightState(l: THREE.Light, s: LightState): void {
	if (s.type === 1) {
		l.intensity = LIGHT_SCALE;
		return;
	}
	// Direct3D: attenuation = 1/(dvAttenuation1*d) = range/d, no cut-off distance.
	l.intensity = LIGHT_SCALE * s.range;
	if (s.type === 3) {
		const sp = l as THREE.SpotLight;
		// dvPhi is the full outer cone angle, dvTheta the full inner one; the
		// falloff between them is linear in Direct3D and a smoothstep here.
		sp.angle = Math.min(s.outer / 2, Math.PI / 2);
		sp.penumbra = s.outer > 0 ? 1 - s.inner / s.outer : 0;
	}
}

/** Brings the THREE camera's projection in line with CameraZoom/Range/Viewport/ProjMode. */
export function syncProjection(cam: BBEntity): void {
	const cs = cam.ent.camera!;
	const camera = cam.obj as BBCamera;
	const key = `${cs.zoom}|${cs.frustum_nr}|${cs.frustum_fr}|${cs.vp_w}|${cs.vp_h}|${cs.proj_mode}`;
	if (cam.camera!.projKey === key) return;
	cam.camera!.projKey = key;
	camera.near = cs.frustum_nr;
	camera.far = cs.frustum_fr;
	camera.blitzZoom = cs.zoom;
	camera.aspect = cs.vp_w / cs.vp_h || 1;
	// Camera::getFrustum: frustum_w=nr*2/zoom, frustum_h=frustum_w*vp_h/vp_w
	const fw = (cs.frustum_nr * 2) / cs.zoom;
	camera.ortho = cs.proj_mode === 2 ? { w: fw, h: fw * (cs.vp_h / cs.vp_w) } : null;
	camera.updateProjectionMatrix();
}
