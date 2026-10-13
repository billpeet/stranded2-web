import * as THREE from 'three';
import { Int, split } from '../blitz';
import { loadObjects, type ObjectDefs } from '../defs/objects';
import { parseMap, type MapData } from '../formats/map';
import { readLines, type Vfs } from '../io/Vfs';
import { MeshCache } from './b3dToThree';
import {
	BlitzCamera,
	LIGHT_SCALE,
	configureRenderer,
	rgb255,
	rotateEntity,
	toThreeWinding
} from './blitzSpace';
import { Terrain, colormapTexture, terrainMaterial } from './terrain';
import { TEX_CLAMP_U, TEX_CLAMP_V, TEX_COLOR, TextureCache } from './textures';

/**
 * Milestone 1: loads an original map and renders terrain, sky, sea and
 * objects with a walk/fly camera. This is a viewer, not the game loop;
 * it exists to validate the format loaders and the Blitz3D-to-Three bridge.
 *
 * Faithful to the original: terrain build (e_terrain), object placement
 * (set_object), skybox mesh (e_skybox), light colours and fog range
 * (e_environment_update_light / _water), settings.cfg defaults.
 * Approximated for now: sea rendering, player movement and collision.
 */

/** Settings as shipped in sys/settings.cfg (view range 2, terrain detail 2). */
const SET_VIEWFAC = 1.5;
/** Dunit_eyes for unit 1 (sys/units.inf: eyes=16) plus its collision y radius (colyr=17). */
const PLAYER_EYES = 16;
const PLAYER_COLYR = 17;

export interface ViewerStatus {
	stage: string;
	percent: number;
}

export class MapViewer {
	readonly renderer: THREE.WebGLRenderer;
	readonly scene = new THREE.Scene();
	readonly camera = new BlitzCamera(1, 3000);
	private textures: TextureCache;
	private meshes: MeshCache;
	private objectDefs?: ObjectDefs;
	private lightcycle: [number, number, number][] = [];
	private mapRoot = new THREE.Group();
	private sky?: THREE.Mesh;
	private sea?: THREE.Mesh;
	private ambient = new THREE.AmbientLight();
	private sun = new THREE.DirectionalLight();
	private raf = 0;
	private last = 0;
	private keys = new Set<string>();
	private pitch = 0;
	private yaw = 0;
	private disposers: (() => void)[] = [];

	terrain?: Terrain;
	map?: MapData;
	fly = false;
	/** Objects whose model failed to load, by path. */
	readonly failedModels = new Set<string>();

	constructor(
		private canvas: HTMLCanvasElement,
		private vfs: Vfs
	) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
		configureRenderer(this.renderer);
		this.textures = new TextureCache(vfs);
		this.meshes = new MeshCache(vfs, this.textures);

		// load_setup.bb: env_light=CreateLight(1) : LightColor env_light,50,50,50
		// A Blitz directional light shines along its +Z axis.
		this.sun.color = rgb255(50, 50, 50);
		this.sun.intensity = LIGHT_SCALE;
		this.sun.position.set(0, 0, -1);
		this.scene.add(this.ambient, this.sun, this.sun.target, this.mapRoot);

		this.bindInput();
		this.resize();
	}

	async init(): Promise<void> {
		this.objectDefs = await loadObjects(this.vfs);
		// sys/lightcycle.inf: "hour=r,g,b" (load_lightcycle.bb)
		for (const line of await readLines(this.vfs, 'sys\\lightcycle.inf')) {
			const eq = line.indexOf('=');
			if (eq < 0 || line.startsWith('#')) continue;
			const s = split(line.substring(eq + 1), ',', 2);
			this.lightcycle[Int(line.substring(0, eq))] = [Int(s[0]), Int(s[1]), Int(s[2])];
		}
	}

	async loadMap(path: string, onStatus?: (s: ViewerStatus) => void): Promise<MapData> {
		const status = (stage: string, percent: number) => onStatus?.({ stage, percent });
		status('Reading map', 10);
		const map = parseMap(await this.vfs.readBytes(path));
		this.map = map;
		this.mapRoot.clear();

		status('Terrain', 30);
		const [dirt, struc] = await Promise.all([
			this.textures.load('sys\\gfx\\terraindirt.bmp'),
			this.textures.load('sys\\gfx\\terrainstructure.bmp', 256 + 512)
		]);
		const colormap = colormapTexture(map.colormap, map.colormapSize);
		const terrain = new Terrain(
			map.terrainSize,
			map.heights,
			terrainMaterial(map.terrainSize, colormap, dirt?.texture, struc?.texture)
		);
		this.terrain = terrain;
		this.mapRoot.add(terrain.mesh);

		status('Environment', 40);
		await this.buildEnvironment(map);

		status('Objects', 50);
		const defs = this.objectDefs!;
		const models = new Set<string>();
		for (const o of map.objects) {
			const d = defs.byId.get(o.typ);
			if (d?.model) models.add(d.model);
		}
		let done = 0;
		await Promise.all(
			[...models].map(async (m) => {
				try {
					await this.meshes.load(m);
				} catch (e) {
					console.warn(`Unable to load ${m}`, e);
					this.failedModels.add(m);
				}
				status('Objects', 50 + (45 * ++done) / models.size);
			})
		);

		// set_object() from includes/handle_objects.bb (visual part).
		for (const o of map.objects) {
			const d = defs.byId.get(o.typ);
			if (!d) throw new Error(`Object of type ${o.typ} is undefined!`);
			if (!d.model || this.failedModels.has(d.model)) continue;
			const template = await this.meshes.load(d.model);
			const h = template.instantiate({ color: d.color, alpha: d.alpha, fx: d.fx });
			h.scale.set(d.size[0], d.size[1], d.size[2]);
			rotateEntity(h, 0, o.yaw, 0);
			let y = terrain.tery(o.x, o.z);
			if (d.align === 1 && y < 1) y = 1;
			h.position.set(o.x, y, o.z);
			h.userData.objectId = o.id;
			this.mapRoot.add(h);
		}

		// Start at the first player spawn info (type 1 in the original's info list
		// is not resolved yet), otherwise the map centre.
		this.camera.position.set(0, terrain.tery(0, 0) + PLAYER_COLYR + PLAYER_EYES, 0);
		this.pitch = 0;
		this.yaw = 0;
		status('Done', 100);
		return map;
	}

	private envColor(map: MapData): [number, number, number] {
		// e_environment_update_light(): blend between this hour and the next.
		const h1 = map.hour % 24;
		const h2 = (h1 + 1) % 24;
		const p = map.minute / 59;
		const a = this.lightcycle[h1] ?? [255, 255, 255];
		const b = this.lightcycle[h2] ?? [255, 255, 255];
		return [0, 1, 2].map((i) => Math.trunc(a[i] * (1 - p) + b[i] * p)) as [number, number, number];
	}

	private async buildEnvironment(map: MapData): Promise<void> {
		const [rf, gf, bf] = this.envColor(map);
		this.ambient.color = rgb255(Math.max(rf - 55, 0), Math.max(gf - 55, 0), Math.max(bf - 55, 0));
		this.ambient.intensity = LIGHT_SCALE;

		// Fog (e_environment_update_water, camera above water, set_fog=1).
		const fr = Math.max(rf - (255 - map.fog[0]), 0);
		const fg = Math.max(gf - (255 - map.fog[1]), 0);
		const fb = Math.max(bf - (255 - map.fog[2]), 0);
		const near = 500 * SET_VIEWFAC - 250;
		this.scene.fog = new THREE.Fog(rgb255(fr, fg, fb), near, near + 600);
		this.renderer.setClearColor(rgb255(fr, fg, fb));

		// Skybox (e_skybox): six textured faces, scaled by 1000 and flipped inward.
		const base = `skies\\${map.skybox === '' ? 'sky' : map.skybox}`;
		const ext = ['jpg', 'jpeg', 'bmp', 'tga', 'png'].find((e) => this.vfs.exists(`${base}_fr.${e}`));
		const faces: [string, number[][]][] = [
			['fr', [[-1, 1, -1, 0, 0], [1, 1, -1, 1, 0], [1, -1, -1, 1, 1], [-1, -1, -1, 0, 1]]],
			['lf', [[1, 1, -1, 0, 0], [1, 1, 1, 1, 0], [1, -1, 1, 1, 1], [1, -1, -1, 0, 1]]],
			['bk', [[1, 1, 1, 0, 0], [-1, 1, 1, 1, 0], [-1, -1, 1, 1, 1], [1, -1, 1, 0, 1]]],
			['rt', [[-1, 1, 1, 0, 0], [-1, 1, -1, 1, 0], [-1, -1, -1, 1, 1], [-1, -1, 1, 0, 1]]],
			['up', [[-1, 1, 1, 0, 1], [1, 1, 1, 0, 0], [1, 1, -1, 1, 0], [-1, 1, -1, 1, 1]]],
			['dn', [[-1, -1, -1, 1, 0], [1, -1, -1, 1, 1], [1, -1, 1, 0, 1], [-1, -1, 1, 0, 0]]]
		];
		const pos: number[] = [];
		const uv: number[] = [];
		const idx: number[] = [];
		const mats: THREE.Material[] = [];
		const geo = new THREE.BufferGeometry();
		for (let f = 0; f < faces.length; f++) {
			const [suffix, verts] = faces[f];
			for (const v of verts) {
				pos.push(v[0] * 1000, v[1] * 1000, v[2] * 1000);
				uv.push(v[3], v[4]);
			}
			const o = f * 4;
			// AddTriangle 0,1,2 / 0,2,3 then FlipMesh reverses each triangle.
			idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
			geo.addGroup(f * 6, 6, f);
			const tex = ext
				? await this.textures.load(`${base}_${suffix}.${ext}`, TEX_COLOR | TEX_CLAMP_U | TEX_CLAMP_V)
				: undefined;
			// EntityFX 1+8 (full-bright, no fog), EntityOrder 3 (drawn first, no depth).
			mats.push(
				new THREE.MeshBasicMaterial({
					map: tex?.texture ?? null,
					color: rgb255(rf, gf, bf),
					fog: false,
					depthTest: false,
					depthWrite: false
				})
			);
		}
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		geo.setIndex(toThreeWinding(idx));
		this.sky = new THREE.Mesh(geo, mats);
		this.sky.renderOrder = -1000;
		this.sky.frustumCulled = false;
		this.mapRoot.add(this.sky);

		// Sea. APPROXIMATION: the original animates gfx\water.jpg per frame and has
		// several quality modes (e_environment_update_water); this is a static
		// textured plane at the same height with the same texture scale (200).
		const water = await this.textures.load('gfx\\water.jpg', 256 + 512);
		const size = 60000;
		const sg = new THREE.BufferGeometry();
		sg.setAttribute(
			'position',
			new THREE.Float32BufferAttribute([-size, 0, -size, -size, 0, size, size, 0, size, size, 0, -size], 3)
		);
		const r = size / 200;
		sg.setAttribute('uv', new THREE.Float32BufferAttribute([-r, -r, -r, r, r, r, r, -r], 2));
		sg.setIndex(toThreeWinding([0, 1, 2, 0, 2, 3]));
		this.sea = new THREE.Mesh(
			sg,
			new THREE.MeshBasicMaterial({
				map: water?.texture ?? null,
				color: rgb255(rf, gf, bf),
				transparent: true,
				opacity: 0.6,
				depthWrite: false
			})
		);
		this.sea.frustumCulled = false;
		this.mapRoot.add(this.sea);
	}

	start(): void {
		this.last = performance.now();
		const loop = (t: number) => {
			this.raf = requestAnimationFrame(loop);
			const dt = Math.min((t - this.last) / 1000, 0.1);
			this.last = t;
			this.update(dt);
			this.renderer.render(this.scene, this.camera);
		};
		this.raf = requestAnimationFrame(loop);
	}

	private update(dt: number): void {
		const cam = this.camera;
		rotateEntity(cam, this.pitch, this.yaw, 0);

		// Viewer movement (not the original's unit physics).
		const run = this.keys.has('ShiftLeft') ? 4 : 1;
		const speed = (this.fly ? 400 : 100) * run * dt;
		const fwd = (this.keys.has('KeyW') ? 1 : 0) - (this.keys.has('KeyS') ? 1 : 0);
		const side = (this.keys.has('KeyD') ? 1 : 0) - (this.keys.has('KeyA') ? 1 : 0);
		if (fwd || side) {
			const dir = new THREE.Vector3(side, 0, fwd).normalize().multiplyScalar(speed);
			if (this.fly) dir.applyQuaternion(cam.quaternion);
			else dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (-this.yaw * Math.PI) / 180);
			cam.position.add(dir);
		}
		if (this.fly) {
			if (this.keys.has('Space')) cam.position.y += speed;
			if (this.keys.has('KeyC')) cam.position.y -= speed;
		} else if (this.terrain) {
			cam.position.y = this.terrain.tery(cam.position.x, cam.position.z) + PLAYER_COLYR + PLAYER_EYES;
		}

		// e_environment_update(): sky follows the camera.
		this.sky?.position.copy(cam.position);
		if (this.sea) this.sea.position.set(cam.position.x, 0, cam.position.z);
		if (this.sea) {
			const m = (this.sea.material as THREE.MeshBasicMaterial).map;
			m?.offset.set(cam.position.x / 200, cam.position.z / 200);
		}
	}

	/** Renders one frame immediately (used for screenshots and tests). */
	renderOnce(): void {
		this.update(0);
		this.renderer.render(this.scene, this.camera);
	}

	setView(x: number, y: number, z: number, pitch: number, yaw: number): void {
		this.camera.position.set(x, y, z);
		this.pitch = pitch;
		this.yaw = yaw;
	}

	resize(): void {
		const w = this.canvas.clientWidth || 800;
		const h = this.canvas.clientHeight || 600;
		this.renderer.setPixelRatio(window.devicePixelRatio);
		this.renderer.setSize(w, h, false);
		this.camera.setViewport(w, h);
	}

	private bindInput(): void {
		const on = <K extends keyof DocumentEventMap>(
			target: Document | HTMLElement | Window,
			type: K | 'resize',
			fn: (e: never) => void
		) => {
			target.addEventListener(type, fn as EventListener);
			this.disposers.push(() => target.removeEventListener(type, fn as EventListener));
		};
		on(document, 'keydown', (e: KeyboardEvent) => {
			this.keys.add(e.code);
			if (e.code === 'KeyF') this.fly = !this.fly;
		});
		on(document, 'keyup', (e: KeyboardEvent) => this.keys.delete(e.code));
		on(this.canvas, 'click', () => this.canvas.requestPointerLock());
		on(document, 'mousemove', (e: MouseEvent) => {
			if (document.pointerLockElement !== this.canvas) return;
			// Blitz: positive yaw turns left, positive pitch looks down.
			this.yaw -= e.movementX * 0.2;
			this.pitch = Math.min(Math.max(this.pitch + e.movementY * 0.2, -89), 89);
		});
		on(window, 'resize', () => this.resize());
	}

	dispose(): void {
		cancelAnimationFrame(this.raf);
		for (const d of this.disposers) d();
		this.renderer.dispose();
	}
}
