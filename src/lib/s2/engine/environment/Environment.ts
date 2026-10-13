import * as THREE from 'three';
import { Int } from '../../blitz';
import type { MapData } from '../../formats/map';
import { readLines, type Vfs } from '../../io/Vfs';
import type { MeshCache } from '../b3dToThree';
import { BlitzCamera, LIGHT_SCALE, entityAngles, rgb255, rotateEntity, toThreeWinding } from '../blitzSpace';
import { colormapTexture, terrainMaterial, type Terrain } from '../terrain';
import { TEX_CLAMP_U, TEX_CLAMP_V, TEX_COLOR, type BlitzTexture, type TextureCache } from '../textures';
import {
	BlitzPlane,
	BlitzSprite,
	NO_FOG_FAR,
	NO_FOG_NEAR,
	boxInView,
	cameraProject,
	installBlitzFog,
	makeBlitzTransparentSort,
	pointInView,
	renderOrderFor,
	setBlitzTextureMatrix
} from './blitzEntities';
import { BlitzRandom } from './blitzMath';
import { EnvCore, defaultSettings, type EnvEngine, type EnvHooks, type EnvSettings, type Tlensf } from './envCore';
import { FrameTimer } from './fps';
import { GrassCore, GrassMesh } from './grass';
import {
	TerrainEditor,
	colormapToImage,
	e_terraincmscale_size,
	groundColor,
	imageToColormap,
	resizeImage,
	type PixelImage
} from './terrainEdit';
import { drawWaterTexture } from './waterTexture';
import type { WaveTerrain } from './waves';

/**
 * The game environment for a loaded map: sea, sky, weather box, moon, lens
 * flares, light and fog, ground plane, grass and the under-water effects.
 *
 * This class is the Three.js side; the update logic itself is the line by
 * line port in envCore.ts / grass.ts, which calls back into the `EnvEngine`
 * methods implemented here.
 *
 * Frame order, as in includes/game.bb:
 *   if (!env.frameBegin(now)) return   calcfpsfactor (previous frame) : getinput
 *   ...move the camera, cull()...
 *   env.update()        e_environment_update_water : e_environment_update
 *   env.render()        RenderWorld : e_environment_water2dfx
 *   env.updatePost()    grass_spread
 */

export interface EnvironmentOptions {
	renderer: THREE.WebGLRenderer;
	scene: THREE.Scene;
	camera: BlitzCamera;
	vfs: Vfs;
	textures: TextureCache;
	meshes: MeshCache;
	/** Light that receives AmbientLight r,g,b. Created and added to the scene when omitted. */
	ambient?: THREE.AmbientLight;
	/** env_light. Created (CreateLight(1), LightColor 50,50,50) when omitted. */
	sun?: THREE.DirectionalLight;
	settings?: EnvSettings;
	hooks?: EnvHooks;
	timer?: FrameTimer;
	rng?: BlitzRandom;
	/**
	 * Extra line-of-sight test for EntityVisible(cam, env_lenssun): return false
	 * when a pickable obscurer other than the terrain blocks the segment.
	 */
	entityVisible?: (from: THREE.Vector3, to: THREE.Vector3) => boolean;
	/**
	 * Called around the water cube map renders, where the original does
	 * HideEntity cam / ShowEntity cam: hide and re-show everything parented to the camera.
	 */
	onWaterCamera?: (rendering: boolean) => void;
	/** Install Blitz's far-to-near-by-origin transparent sort on the renderer (default true). */
	installTransparentSort?: boolean;
}

/** LoadImage for the browser: decodes any image file to RGBA pixels. */
export async function decodeImage(vfs: Vfs, path: string): Promise<PixelImage | undefined> {
	if (!vfs.exists(path)) return undefined;
	const blob = new Blob([(await vfs.readBytes(path)) as BlobPart]);
	const bitmap = await createImageBitmap(blob, { premultiplyAlpha: 'none', colorSpaceConversion: 'none' });
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(bitmap, 0, 0);
	bitmap.close();
	const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
	return { width: img.width, height: img.height, data: img.data };
}

/** CreateCube : ScaleEntity env_lenssun,30,30,30 */
const LENS_SUN_BOX = new THREE.Box3(new THREE.Vector3(-30, -30, -30), new THREE.Vector3(30, 30, 30));

/** Faces of e_skybox(): suffix and four vertices x,y,z,u,v. */
const SKY_FACES: [string, number[][]][] = [
	['fr', [[-1, 1, -1, 0, 0], [1, 1, -1, 1, 0], [1, -1, -1, 1, 1], [-1, -1, -1, 0, 1]]],
	['lf', [[1, 1, -1, 0, 0], [1, 1, 1, 1, 0], [1, -1, 1, 1, 1], [1, -1, -1, 0, 1]]],
	['bk', [[1, 1, 1, 0, 0], [-1, 1, 1, 1, 0], [-1, -1, 1, 1, 1], [1, -1, 1, 0, 1]]],
	['rt', [[-1, 1, 1, 0, 0], [-1, 1, -1, 1, 0], [-1, -1, -1, 1, 1], [-1, -1, 1, 0, 1]]],
	['up', [[-1, 1, 1, 0, 1], [1, 1, 1, 0, 0], [1, 1, -1, 1, 0], [-1, 1, -1, 1, 1]]],
	['dn', [[-1, -1, -1, 1, 0], [1, -1, -1, 1, 1], [1, -1, 1, 0, 1], [-1, -1, 1, 0, 0]]]
];

/**
 * The six water cube map renders of e_environment_update_water, in order:
 * SetCubeFace index, RotateEntity pitch/yaw, and the GL cube face that makes
 * a lookup with (x,-y,z) return the right texel (derivation in the report /
 * renderWaterCubemap).
 */
const CUBE_FACES: { pitch: number; yaw: number; gl: number }[] = [
	{ pitch: 0, yaw: 90, gl: 1 }, // 0 left   (-X)
	{ pitch: 0, yaw: 0, gl: 4 }, // 1 front  (+Z)
	{ pitch: 0, yaw: -90, gl: 0 }, // 2 right  (+X)
	{ pitch: 0, yaw: 180, gl: 5 }, // 3 back   (-Z)
	{ pitch: -90, yaw: 0, gl: 3 }, // 4 top    (looking up, stored in GL -Y)
	{ pitch: 90, yaw: 0, gl: 2 } // 5 bottom (looking down, stored in GL +Y)
];

/**
 * Terrain material for each set_terrain level of e_terrain():
 *   0: EntityColor 120 and TextureBlend ter_tex_color,1. Blend 1 is
 *      D3DTOP_BLENDTEXTUREALPHA; the colour texture has no alpha channel, so
 *      the stage outputs the texture colour alone: unlit, untinted.
 *   1: EntityColor 240, colour map, dirt (multiply 2x).
 *   2: EntityColor 120, colour map, dirt and structure (both multiply 2x).
 */
export function terrainMaterialForMode(
	set_terrain: number,
	ter_size: number,
	colormap: THREE.Texture,
	dirt?: THREE.Texture,
	structure?: THREE.Texture
): THREE.Material {
	if (set_terrain === 0) {
		const mat = new THREE.MeshBasicMaterial({ map: colormap });
		const uniforms = { uTerSize: { value: ter_size } };
		mat.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, uniforms);
			shader.vertexShader = shader.vertexShader
				.replace('#include <common>', '#include <common>\nuniform float uTerSize;')
				.replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = uv / uTerSize;\n#endif');
		};
		return mat;
	}
	if (set_terrain === 1) {
		const mat = terrainMaterial(ter_size, colormap, dirt, undefined);
		mat.color.setRGB(240 / 255, 240 / 255, 240 / 255);
		return mat;
	}
	return terrainMaterial(ter_size, colormap, dirt, structure);
}

export class Environment implements EnvEngine {
	readonly renderer: THREE.WebGLRenderer;
	readonly scene: THREE.Scene;
	readonly camera: BlitzCamera;
	readonly core: EnvCore;
	readonly grass = new GrassCore();
	/** Everything this class adds to the scene. */
	readonly root = new THREE.Group();
	readonly ambient: THREE.AmbientLight;
	readonly sun: THREE.DirectionalLight;
	readonly fog = new THREE.Fog(0x000000, NO_FOG_NEAR, NO_FOG_FAR);

	terrain?: Terrain;
	terrainEditor?: TerrainEditor;
	/** ter_tex_color pixels in map layout (RGB, index (x*size+y)*3) and its edge length. */
	colormap: Uint8Array = new Uint8Array(3);
	colormapSize = 1;
	colormapTex?: THREE.DataTexture;

	private vfs: Vfs;
	private textures: TextureCache;
	private meshes: MeshCache;
	private opts: EnvironmentOptions;
	private sortEye = new THREE.Vector3();

	// --- media (includes/load_media.bb)
	/** gfx_water: texture size and pixels, gfx_waterimg and gfx_waterimg_custom */
	private waterSize = 128;
	private waterPixels: Uint8Array = new Uint8Array(128 * 128 * 4);
	private gfx_waterimg: Uint8Array = new Uint8Array(128 * 128 * 4);
	private gfx_waterimg_custom?: Uint8Array;
	private gfx_water!: THREE.DataTexture;
	private gfx_moon?: BlitzTexture;
	private gfx_p_flare: (BlitzTexture | undefined)[] = [];
	private gfx_tergrounddirt?: THREE.Texture;
	private gfx_terraindirt?: BlitzTexture;
	private gfx_terstruc?: BlitzTexture;
	private gfx_grasspreadtex?: THREE.Texture;
	private grassMesh?: GrassMesh;
	private grassBounds = new THREE.Box3();
	private loaded = false;

	// --- entities
	protected env_sea?: BlitzPlane;
	protected env_sea2?: BlitzPlane;
	protected env_ground?: BlitzPlane;
	protected env_sky?: THREE.Mesh;
	protected env_wbox?: THREE.Mesh;
	protected env_moon?: BlitzSprite;
	private flareSprites: BlitzSprite[] = [];
	private flarePos: [number, number][] = [];
	private lensSun = new THREE.Vector3();
	private skyTextures: (BlitzTexture | undefined)[] = [];
	private skyFx = 1 + 8;
	private waterAlpha = 1;

	// --- water reflection (env_watertex, env_watercam)
	private env_watertex?: THREE.WebGLCubeRenderTarget;
	private env_watercam?: BlitzCamera;
	private seaUniforms = {
		uCube: { value: null as THREE.CubeTexture | null },
		uColor: { value: new THREE.Color(80 / 255, 255 / 255, 240 / 255) },
		uAmbient: { value: new THREE.Color(0, 0, 0) },
		uOpacity: { value: 0.25 }
	};

	// --- water 2D FX
	private fxTarget?: THREE.WebGLRenderTarget;
	private fxScene = new THREE.Scene();
	private fxCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
	private fxMaterial: THREE.ShaderMaterial;

	constructor(opts: EnvironmentOptions) {
		this.opts = opts;
		this.renderer = opts.renderer;
		this.scene = opts.scene;
		this.camera = opts.camera;
		this.vfs = opts.vfs;
		this.textures = opts.textures;
		this.meshes = opts.meshes;
		installBlitzFog();
		this.core = new EnvCore(
			this,
			opts.settings ?? defaultSettings(),
			opts.hooks ?? {},
			opts.timer ?? new FrameTimer(),
			opts.rng ?? new BlitzRandom()
		);

		if (opts.ambient) this.ambient = opts.ambient;
		else {
			this.ambient = new THREE.AmbientLight();
			this.scene.add(this.ambient);
		}
		this.ambient.intensity = LIGHT_SCALE;
		if (opts.sun) this.sun = opts.sun;
		else {
			// load_setup.bb: env_light=CreateLight(1) : LightColor env_light,50,50,50
			// A Blitz directional light shines along its +Z axis.
			this.sun = new THREE.DirectionalLight();
			this.sun.color = rgb255(50, 50, 50);
			this.sun.intensity = LIGHT_SCALE;
			this.sun.position.set(0, 0, -1);
			this.scene.add(this.sun, this.sun.target);
		}
		this.scene.fog = this.fog;
		this.scene.add(this.root);
		if (opts.installTransparentSort !== false) {
			this.renderer.setTransparentSort(makeBlitzTransparentSort(this.sortEye));
		}

		this.fxMaterial = new THREE.ShaderMaterial({
			depthTest: false,
			depthWrite: false,
			uniforms: {
				tFrame: { value: null },
				uScr: { value: new THREE.Vector2(800, 600) },
				uStep: { value: 10 },
				uOverlap: { value: 0 },
				uWs: { value: 0 },
				uInc: { value: 15 }
			},
			vertexShader: /* glsl */ `
				varying vec2 vUv;
				void main() { vUv = uv; gl_Position = vec4( position.xy, 0.0, 1.0 ); }`,
			fragmentShader: /* glsl */ `
				uniform sampler2D tFrame;
				uniform vec2 uScr;
				uniform float uStep;
				uniform float uOverlap;
				uniform float uWs;
				uniform float uInc;
				varying vec2 vUv;
				// CopyRect 0,y,set_scrx,h,Sin(ws#)*6.,y  (float to int: round half to even)
				float shiftOf( float k ) { return roundEven( sin( radians( uWs + k * uInc ) ) * 6.0 ); }
				// Source column for a strip shifted by d: pixels the copy does not reach keep their content.
				float src( float x, float d ) { float s = x - d; return ( s < 0.0 || s >= uScr.x ) ? x : s; }
				void main() {
					float px = floor( vUv.x * uScr.x );
					float py = floor( ( 1.0 - vUv.y ) * uScr.y );
					float k = floor( py / uStep );
					float x = src( px, shiftOf( k ) );
					// Strips 10 high placed every 5 rows: a row was already moved by the previous strip.
					if ( uOverlap > 0.5 && k >= 1.0 ) x = src( x, shiftOf( k - 1.0 ) );
					gl_FragColor = vec4( texture2D( tFrame, vec2( ( x + 0.5 ) / uScr.x, vUv.y ) ).rgb, 1.0 );
				}`
		});
		const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.fxMaterial);
		quad.frustumCulled = false;
		this.fxScene.add(quad);
	}

	get settings(): EnvSettings {
		return this.core.settings;
	}
	get timer(): FrameTimer {
		return this.core.timer;
	}

	// ------------------------------------------------------------------ loading

	/** The environment's share of includes/load_media.bb and load_lightcycle.bb. */
	async load(): Promise<void> {
		if (this.loaded) return;
		this.core.load_lightcycle(await readLines(this.vfs, 'sys\\lightcycle.inf'));

		// Global gfx_water=load_texture("gfx\water.jpg",256+512) : Global gfx_waterimg=load_image("gfx\water.jpg")
		const water = await decodeImage(this.vfs, 'gfx\\water.jpg');
		if (!water) throw new Error('Unable to load Texture gfx\\water.jpg');
		// LoadTexture scales to a power of two; the image is drawn unscaled at 0,0.
		const size = 2 ** Math.round(Math.log2(water.height));
		this.waterSize = size;
		this.gfx_waterimg = this.fitToWater(water);
		this.waterPixels = new Uint8Array(this.gfx_waterimg);
		const tex = new THREE.DataTexture(this.waterPixels, size, size, THREE.RGBAFormat);
		tex.colorSpace = THREE.NoColorSpace;
		tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
		tex.magFilter = THREE.LinearFilter;
		tex.minFilter = THREE.LinearMipmapLinearFilter; // TextureFilter "",8
		tex.generateMipmaps = true;
		tex.flipY = false;
		tex.needsUpdate = true;
		this.gfx_water = tex;

		const cloneTex = (t?: BlitzTexture) => {
			if (!t) return undefined;
			// Blitz texture handles carry their own scale/rotation; the image is shared.
			const c = t.texture.clone();
			c.needsUpdate = true;
			return c;
		};
		const [moon, f0, f1, f2, dirt, struc, grasstex] = await Promise.all([
			this.textures.load('sprites\\moon_a.png'),
			this.textures.load('sprites\\flare0_a.bmp'),
			this.textures.load('sprites\\flare1_a.bmp'),
			this.textures.load('sprites\\flare2_a.bmp'),
			this.textures.load('sys\\gfx\\terraindirt.bmp'),
			this.textures.load('sys\\gfx\\terrainstructure.bmp', 256 + 512),
			this.textures.load('gfx\\grasspread_a.png')
		]);
		this.gfx_moon = moon;
		this.gfx_p_flare = [f0, f1, f2];
		this.gfx_terraindirt = dirt;
		this.gfx_terstruc = struc;
		// Global gfx_tergrounddirt=load_texture("sys\gfx\terraindirt.bmp") : ScaleTexture ..,30,30 : TextureBlend ..,5
		this.gfx_tergrounddirt = cloneTex(dirt);
		this.gfx_grasspreadtex = cloneTex(grasstex);

		// Global gfx_grasspread=load_mesh("gfx\grasspread.b3d")
		try {
			const template = await this.meshes.load('gfx\\grasspread.b3d');
			// CopyEntity shares the mesh; the surface brush colour multiplies the entity colour.
			const surf = template.rep.surfaces[0];
			const brushColor = surf ? new THREE.Color(surf.r, surf.g, surf.b) : new THREE.Color(1, 1, 1);
			this.grassBounds.copy(template.bounds);
			this.grassMesh = new GrassMesh(template.rep.geometry, brushColor, this.gfx_grasspreadtex ?? null);
		} catch (e) {
			console.warn('Unable to load Model gfx\\grasspread.b3d', e);
		}
		this.loaded = true;
	}

	/** Image pixels laid out as the texture buffer after DrawBlock image,0,0. */
	private fitToWater(img: PixelImage): Uint8Array {
		const size = this.waterSize;
		const out = new Uint8Array(size * size * 4);
		for (let y = 0; y < size; y++) {
			for (let x = 0; x < size; x++) {
				const d = (y * size + x) * 4;
				if (x < img.width && y < img.height) {
					const s = (y * img.width + x) * 4;
					out[d] = img.data[s];
					out[d + 1] = img.data[s + 1];
					out[d + 2] = img.data[s + 2];
				}
				out[d + 3] = 255;
			}
		}
		return out;
	}

	/**
	 * Sets up the environment for a loaded map: the environment-related parts
	 * of e_clear() and load_map(), then e_environment().
	 */
	async setMap(map: MapData, terrain: Terrain): Promise<void> {
		await this.load();
		const c = this.core;
		c.e_clear();
		this.gfx_waterimg_custom = undefined;
		this.waterAlpha = 1;
		c.map_day = map.day;
		c.map_hour = map.hour;
		c.map_minute = map.minute;
		c.map_freezetime = map.freezeTime;
		c.map_skybox = map.skybox;
		c.map_climate = map.climate;
		c.map_fog = [...map.fog];
		c.map_timeupdate = 0;
		c.g_dive = 0;

		this.terrain = terrain;
		this.terrainEditor = new TerrainEditor(terrain, c.rng);
		this.setColormapData(map.colormap, map.colormapSize);

		//Grassmap
		this.grass.grass_map(this.settings.set_grass, this.colormap, this.colormapSize, terrain.size);
		this.grass.loadGrassFlags(map.grass);

		//Extensions: Case "env_cweather" env_cweather=Int(Tx\value$)
		for (const x of map.extensions) if (x.key === 'env_cweather') c.env_cweather = Int(x.value);

		//Environment
		await this.loadSkyTextures();
		c.e_environment();
		this.grass_spread();
	}

	/** Replaces ter_tex_color. */
	private setColormapData(colormap: Uint8Array, size: number): void {
		this.colormap = colormap;
		this.colormapSize = size;
		this.colormapTex?.dispose();
		this.colormapTex = colormapTexture(colormap, size);
		this.applyTerrainMaterial();
	}

	/** The "Texture Stuff" Select of e_terrain(): material for the current set_terrain. */
	applyTerrainMaterial(): void {
		if (!this.terrain || !this.colormapTex) return;
		const old = this.terrain.mesh.material as THREE.Material;
		this.terrain.mesh.material = terrainMaterialForMode(
			this.settings.set_terrain,
			this.terrain.size,
			this.colormapTex,
			this.gfx_terraindirt?.texture,
			this.gfx_terstruc?.texture
		);
		old?.dispose?.();
	}

	/** Texture loading part of e_skybox(file$) */
	private async loadSkyTextures(): Promise<void> {
		const name = this.core.map_skybox;
		const file = name === '' ? 'skies\\sky' : `skies\\${name}`;
		//Get Extension
		const ext = ['jpg', 'jpeg', 'bmp', 'tga', 'png'].find((e) => this.vfs.exists(`${file}_fr.${e}`)) ?? '';
		this.skyTextures = await Promise.all(
			SKY_FACES.map(([suffix]) =>
				this.textures.load(`${file}_${suffix}.${ext}`, TEX_COLOR | TEX_CLAMP_U | TEX_CLAMP_V)
			)
		);
	}

	// ------------------------------------------------------------------ entity construction

	private free(o?: THREE.Object3D): void {
		if (!o) return;
		o.parent?.remove(o);
		const m = o as THREE.Mesh;
		m.geometry?.dispose();
		for (const mat of Array.isArray(m.material) ? m.material : m.material ? [m.material] : []) mat.dispose();
	}

	/** Mesh part of e_skybox(): six quads, ScaleMesh 1000, FlipMesh. */
	private e_skybox(): THREE.Mesh {
		const pos: number[] = [];
		const uv: number[] = [];
		const idx: number[] = [];
		const mats: THREE.Material[] = [];
		const geo = new THREE.BufferGeometry();
		for (let f = 0; f < SKY_FACES.length; f++) {
			const verts = SKY_FACES[f][1];
			for (const v of verts) {
				pos.push(v[0] * 1000, v[1] * 1000, v[2] * 1000);
				uv.push(v[3], v[4]);
			}
			const o = f * 4;
			// AddTriangle 0,1,2 / 0,2,3 then FlipMesh reverses each triangle.
			idx.push(o, o + 2, o + 1, o, o + 3, o + 2);
			geo.addGroup(f * 6, 6, f);
			// EntityFX 1+8 (full-bright, no fog), EntityOrder 3 (drawn first, no depth).
			mats.push(
				new THREE.MeshBasicMaterial({
					map: this.skyTextures[f]?.texture ?? null,
					fog: (this.skyFx & 8) === 0,
					depthTest: false,
					depthWrite: false
				})
			);
		}
		geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
		geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
		geo.setIndex(toThreeWinding(idx));
		const sky = new THREE.Mesh(geo, mats);
		sky.name = 'env_sky';
		sky.renderOrder = renderOrderFor(3);
		sky.frustumCulled = false;
		//PositionEntity env_sky,0,500,0
		sky.position.set(0, 500, 0);
		return sky;
	}

	/** Script command "skytexture": replaces the skybox. */
	async skytexture(path: string): Promise<void> {
		this.core.map_skybox = path;
		await this.loadSkyTextures();
		this.free(this.env_sky);
		this.env_sky = this.e_skybox();
		this.root.add(this.env_sky);
		const [r, g, b] = this.core.env_col;
		this.skyColor(r, g, b);
	}

	buildEntities(flares: readonly Tlensf[]): void {
		//Sea 1: CreatePlane(10), EntityColor 80,255,240, EntityAlpha 0.25, PositionEntity 0,1,0
		this.free(this.env_sea?.mesh);
		const seaMat = new THREE.ShaderMaterial({
			uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {}]),
			transparent: true,
			depthWrite: false,
			fog: true,
			vertexShader: /* glsl */ `
				#include <common>
				#include <fog_pars_vertex>
				varying vec3 vWorldPos;
				void main() {
					vec4 wp = modelMatrix * vec4( position, 1.0 );
					vWorldPos = wp.xyz;
					vec4 mvPosition = viewMatrix * wp;
					gl_Position = projectionMatrix * mvPosition;
					#include <fog_vertex>
				}`,
			fragmentShader: /* glsl */ `
				uniform samplerCube uCube;
				uniform vec3 uColor;
				uniform vec3 uAmbient;
				uniform float uOpacity;
				#include <common>
				#include <fog_pars_fragment>
				varying vec3 vWorldPos;
				void main() {
					// D3DTSS_TCI_CAMERASPACEREFLECTIONVECTOR taken back to world space
					vec3 r = reflect( normalize( vWorldPos - cameraPosition ), vec3( 0.0, 1.0, 0.0 ) );
					vec3 texel = textureCube( uCube, vec3( r.x, - r.y, r.z ) ).rgb;
					// lit by ambient only (the sun is parallel to the plane), texture stage modulates
					gl_FragColor = vec4( min( uColor * uAmbient, vec3( 1.0 ) ) * texel, uOpacity );
					#include <fog_fragment>
				}`
		});
		Object.assign(seaMat.uniforms, this.seaUniforms);
		this.env_sea = new BlitzPlane(seaMat);
		this.env_sea.position.set(0, 1, 0);
		this.env_sea.mesh.name = 'env_sea';
		this.env_sea.mesh.visible = false;
		this.root.add(this.env_sea.mesh);

		//Sea 2: CreatePlane(), EntityTexture env_sea2,gfx_water : ScaleTexture gfx_water,200,200
		this.free(this.env_sea2?.mesh);
		this.env_sea2 = new BlitzPlane(new THREE.MeshLambertMaterial({ map: this.gfx_water }));
		this.env_sea2.mesh.name = 'env_sea2';
		this.root.add(this.env_sea2.mesh);
		this.wateralpha(this.waterAlpha);

		//Sky
		this.free(this.env_sky);
		this.env_sky = this.e_skybox();
		this.root.add(this.env_sky);

		//Lensflares: sprites on env_lenspivot (child of cam at -1,quot,1 scaled 2/set_scrx)
		for (const s of this.flareSprites) this.free(s.mesh);
		this.flareSprites = [];
		this.flarePos = [];
		for (const fl of flares) {
			// EntityBlend 3 (add: SRCALPHA, ONE), EntityOrder order, full-bright like every sprite
			const sp = new BlitzSprite(
				new THREE.MeshBasicMaterial({
					map: this.gfx_p_flare[fl.sprite]?.texture ?? null,
					transparent: true,
					blending: THREE.AdditiveBlending,
					depthTest: false,
					depthWrite: false,
					opacity: 0,
					fog: false
				})
			);
			sp.xscale = sp.yscale = fl.scale;
			sp.mesh.renderOrder = renderOrderFor(fl.order);
			sp.mesh.visible = false;
			sp.mesh.name = 'lensflare';
			this.flareSprites.push(sp);
			this.flarePos.push([0, 0]);
			this.root.add(sp.mesh);
		}

		//Moon: CreateSprite, ScaleSprite 200,200, EntityFX 1+8
		this.free(this.env_moon?.mesh);
		this.env_moon = new BlitzSprite(
			new THREE.MeshBasicMaterial({
				map: this.gfx_moon?.texture ?? null,
				transparent: true,
				depthWrite: false,
				fog: false
			})
		);
		this.env_moon.xscale = this.env_moon.yscale = 200;
		this.env_moon.mesh.name = 'env_moon';
		this.root.add(this.env_moon.mesh);

		//Weatherbox: CreateCube, ScaleMesh 1000, EntityColor 100, FlipMesh, EntityFX 1+8, EntityOrder 3
		this.free(this.env_wbox);
		this.env_wbox = new THREE.Mesh(
			new THREE.BoxGeometry(2000, 2000, 2000),
			new THREE.MeshBasicMaterial({
				color: rgb255(100, 100, 100),
				// Alpha blended but kept in the opaque pass so that it draws right after the sky.
				blending: THREE.CustomBlending,
				blendSrc: THREE.SrcAlphaFactor,
				blendDst: THREE.OneMinusSrcAlphaFactor,
				side: THREE.DoubleSide,
				depthTest: false,
				depthWrite: false,
				fog: (this.skyFx & 8) === 0
			})
		);
		this.env_wbox.name = 'env_wbox';
		this.env_wbox.renderOrder = renderOrderFor(3) + 0.5;
		this.env_wbox.frustumCulled = false;
		this.env_wbox.position.set(0, 500, 0);
		this.env_wbox.visible = false;
		this.root.add(this.env_wbox);

		//Ground: CreatePlane(1), EntityFX 16, EntityTexture env_ground,gfx_tergrounddirt
		this.free(this.env_ground?.mesh);
		const groundMat = new THREE.MeshLambertMaterial({ map: this.gfx_tergrounddirt ?? null });
		groundMat.onBeforeCompile = (shader) => {
			// TextureBlend gfx_tergrounddirt,5 (D3DTOP_MODULATE2X)
			shader.fragmentShader = shader.fragmentShader.replace(
				'#include <map_fragment>',
				'#include <map_fragment>\n\tdiffuseColor.rgb *= 2.0;'
			);
		};
		this.env_ground = new BlitzPlane(groundMat);
		this.env_ground.mesh.name = 'env_ground';
		this.root.add(this.env_ground.mesh);
	}

	/** e_terrainground(fx=1) */
	e_terrainground(fx = 1): void {
		const g = this.env_ground;
		if (!g || !this.terrain) return;
		const t = this.terrain;
		//Position
		t.groundY = t.terrainY(t.origin, t.origin);
		g.position.set(0, t.groundY, 0);
		//Color & Stuff
		if (fx === 1) {
			const [r, gr, b] = groundColor(this.colormap);
			const mat = g.mesh.material as THREE.MeshLambertMaterial;
			mat.color = rgb255(r, gr, b);
			if (t.groundY <= 0) {
				//EntityOrder env_ground,1
				g.mesh.renderOrder = renderOrderFor(1);
				mat.depthTest = false;
				mat.depthWrite = false;
			} else {
				//EntityOrder env_ground,0
				g.mesh.renderOrder = 0;
				mat.depthTest = true;
				mat.depthWrite = true;
			}
		}
	}

	// ------------------------------------------------------------------ EnvEngine

	camX(): number {
		return this.camera.position.x;
	}
	camY(): number {
		return this.camera.position.y;
	}
	camZ(): number {
		return this.camera.position.z;
	}
	positionCam(x: number, y: number, z: number): void {
		this.camera.position.set(x, y, z);
		this.camera.updateMatrixWorld();
	}

	positionSky(x: number, y: number, z: number): void {
		this.env_sky?.position.set(x, y, z);
		this.env_wbox?.position.set(x, y, z);
	}

	wbox(show: boolean, alpha: number): void {
		if (!this.env_wbox) return;
		this.env_wbox.visible = show;
		(this.env_wbox.material as THREE.MeshBasicMaterial).opacity = alpha;
	}

	moon(show: boolean, alpha: number, x: number, y: number, z: number): void {
		const m = this.env_moon;
		if (!m) return;
		// Model::beginRender skips entities whose alpha is not above 0.
		m.mesh.visible = show && alpha > 0;
		if (show) {
			(m.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
			m.position.set(x, y, z);
			m.sync();
		}
	}

	positionLensSun(x: number, y: number, z: number): void {
		this.lensSun.set(x, y, z);
	}

	/** EntityInView(env_lenssun,cam): CreateCube scaled 30 */
	lensSunInView(): boolean {
		const s = this.lensSun;
		return boxInView(this.camera, LENS_SUN_BOX, s.x, s.y, s.z);
	}

	/**
	 * EntityVisible(cam,env_lenssun): no pickable obscurer on the line. The
	 * terrain (EntityPickMode ter,2,1) is tested here by sampling its height
	 * along the segment; other obscurers go through options.entityVisible.
	 */
	lensSunVisible(): boolean {
		const from = this.camera.position;
		const to = this.lensSun;
		if (this.opts.entityVisible && !this.opts.entityVisible(from, to)) return false;
		const t = this.terrain;
		if (!t) return true;
		// env_ground (EntityPickMode env_ground,2,1)
		if ((from.y - t.groundY) * (to.y - t.groundY) < 0) return false;
		const half = -t.origin;
		const len = from.distanceTo(to);
		const steps = Math.ceil(len / 16);
		for (let i = 1; i < steps; i++) {
			const k = i / steps;
			const x = from.x + (to.x - from.x) * k;
			const z = from.z + (to.z - from.z) * k;
			if (x < -half || x > half || z < -half || z > half) continue;
			const y = from.y + (to.y - from.y) * k;
			if (y < t.terrainY(x, z)) return false;
		}
		return true;
	}

	cameraProject(x: number, y: number, z: number): [number, number] {
		return cameraProject(this.camera, x, y, z, this.settings.set_scrx, this.settings.set_scry);
	}

	flare(i: number, show: boolean, x: number, y: number, alpha: number): void {
		const sp = this.flareSprites[i];
		if (!sp) return;
		if (!Number.isNaN(x)) this.flarePos[i] = [x, y];
		sp.mesh.visible = show && alpha > 0;
		(sp.mesh.material as THREE.MeshBasicMaterial).opacity = alpha;
	}

	skyColor(r: number, g: number, b: number): void {
		if (!this.env_sky) return;
		for (const m of this.env_sky.material as THREE.MeshBasicMaterial[]) m.color = rgb255(r, g, b);
	}

	ambientLight(r: number, g: number, b: number): void {
		this.ambient.color = rgb255(r, g, b);
		this.ambient.intensity = LIGHT_SCALE;
		this.seaUniforms.uAmbient.value.setRGB(r / 255, g / 255, b / 255);
	}

	wboxColor(grey: number): void {
		if (this.env_wbox) (this.env_wbox.material as THREE.MeshBasicMaterial).color = rgb255(grey, grey, grey);
	}

	positionWaterTexture(_u: number, _v: number): void {
		// Applied in syncPlanes(), together with the offset of the camera-following quad.
	}

	drawWaterTexture(set_water: number, isin: number): void {
		drawWaterTexture(this.waterPixels, this.gfx_waterimg_custom ?? this.gfx_waterimg, this.waterSize, set_water, isin);
		this.gfx_water.needsUpdate = true;
	}

	rotateSea2(roll: number): void {
		if (this.env_sea2) this.env_sea2.roll = roll;
	}

	skyFX(fx: number): void {
		if (fx === this.skyFx) return;
		this.skyFx = fx;
		const fog = (fx & 8) === 0;
		const mats = [
			...((this.env_sky?.material as THREE.Material[] | undefined) ?? []),
			...(this.env_wbox ? [this.env_wbox.material as THREE.Material] : [])
		];
		for (const m of mats) {
			(m as THREE.MeshBasicMaterial).fog = fog;
			m.needsUpdate = true;
		}
	}

	cameraFog(mode: number, near: number, far: number, r: number, g: number, b: number): void {
		if (mode === 0) {
			this.fog.near = NO_FOG_NEAR;
			this.fog.far = NO_FOG_FAR;
		} else {
			this.fog.near = near;
			this.fog.far = far;
			this.fog.color = rgb255(r, g, b);
		}
	}

	setupWaterReflection(set_water_texsize: number): void {
		if (set_water_texsize > 0) {
			if (this.env_sea) this.env_sea.mesh.visible = true;
			//Texture: CreateTexture(size,size,1+128+256)
			if (!this.env_watertex || this.env_watertex.width !== set_water_texsize) {
				this.env_watertex?.dispose();
				this.env_watertex = new THREE.WebGLCubeRenderTarget(set_water_texsize, {
					generateMipmaps: false,
					minFilter: THREE.LinearFilter,
					magFilter: THREE.LinearFilter,
					colorSpace: THREE.NoColorSpace
				});
			}
			this.seaUniforms.uCube.value = this.env_watertex.texture;
			//Cam: CreateCamera() : CameraRange env_watercam,1,1500
			if (!this.env_watercam) {
				this.env_watercam = new BlitzCamera(1, 1500);
				this.env_watercam.setViewport(1, 1);
			}
		} else {
			if (this.env_sea) this.env_sea.mesh.visible = false;
			//Free Texture & Cam when unused
			this.env_watertex?.dispose();
			this.env_watertex = undefined;
			this.env_watercam = undefined;
			this.seaUniforms.uCube.value = null;
		}
	}

	/**
	 * Renders the world six times from the camera position mirrored below the
	 * water (PositionEntity env_watercam,EntityX(cam),-EntityY(cam),EntityZ(cam))
	 * into the cube map. The water camera is a fresh CreateCamera(): zoom 1,
	 * black background, no fog.
	 */
	renderWaterCubemap(): void {
		const rt = this.env_watertex;
		const wc = this.env_watercam;
		if (!rt || !wc || !this.env_sea || !this.env_sea2) return;
		const r = this.renderer;
		//Hide/Show
		this.env_sea.mesh.visible = false;
		this.env_sea2.mesh.visible = false;
		const flareVisible = this.flareSprites.map((s) => s.mesh.visible);
		for (const s of this.flareSprites) s.mesh.visible = false;
		this.opts.onWaterCamera?.(true);

		//Setup Cam
		wc.position.set(this.camX(), -this.camY(), this.camZ());
		const fogNear = this.fog.near;
		const fogFar = this.fog.far;
		this.fog.near = NO_FOG_NEAR;
		this.fog.far = NO_FOG_FAR;
		const prevTarget = r.getRenderTarget();
		const prevColor = r.getClearColor(new THREE.Color());
		const prevAlpha = r.getClearAlpha();
		const prevAuto = r.autoClear;
		r.setClearColor(0x000000, 1);
		r.autoClear = true;
		this.sortEye.copy(wc.position);
		for (const face of CUBE_FACES) {
			rotateEntity(wc, face.pitch, face.yaw, 0);
			wc.updateMatrixWorld();
			r.setRenderTarget(rt, face.gl);
			this.renderScene(wc, false);
		}
		r.setRenderTarget(prevTarget);
		r.setClearColor(prevColor, prevAlpha);
		r.autoClear = prevAuto;
		this.fog.near = fogNear;
		this.fog.far = fogFar;

		//Show/Hide
		this.env_sea.mesh.visible = true;
		this.env_sea2.mesh.visible = true;
		this.flareSprites.forEach((s, i) => (s.mesh.visible = flareVisible[i]));
		this.opts.onWaterCamera?.(false);
	}

	camDistance(x: number, y: number, z: number): number {
		const p = this.camera.position;
		return Math.sqrt((p.x - x) ** 2 + (p.y - y) ** 2 + (p.z - z) ** 2);
	}

	pointInView(x: number, y: number, z: number): boolean {
		return pointInView(this.camera, x, y, z);
	}

	water2dfx(step: number, height: number, ws: number, inc: number): void {
		const u = this.fxMaterial.uniforms;
		u.uStep.value = step;
		u.uOverlap.value = height > step ? 1 : 0;
		u.uWs.value = ws % 360;
		u.uInc.value = inc;
	}

	waveTerrain(): WaveTerrain | undefined {
		return this.terrain;
	}

	// ------------------------------------------------------------------ per frame

	/**
	 * Frame pacing for a requestAnimationFrame loop: returns false while the
	 * original would still be waiting in calcfpsfactor() (50 FPS cap). When it
	 * returns true the previous frame's f# has been computed and getinput() has
	 * run for the new frame. Game loops that own the FrameTimer do not need this.
	 */
	frameBegin(now: number = performance.now()): boolean {
		const t = this.core.timer;
		const ms = FrameTimer.millisecs(now);
		if (t.ms !== 0) {
			if (!t.frameDue(ms)) return false;
			t.calcfpsfactor(ms);
		}
		t.getinput(ms, this.core.g_unpaused);
		return true;
	}

	/** "Environment Stuff (Pre Render)": e_environment_update_water() : e_environment_update() */
	update(): void {
		this.camera.updateMatrixWorld();
		this.terrainEditor?.flush();
		this.syncPlanes();
		this.core.e_environment_update_water();
		this.core.e_environment_update();
		this.syncPlanes();
		this.syncFlares();
	}

	/** Planes follow the camera; texture matrices get the matching offset. */
	private syncPlanes(): void {
		const x = this.camX();
		const z = this.camZ();
		this.env_sea?.follow(x, z);
		if (this.env_sea2) {
			this.env_sea2.follow(x, z);
			//ScaleTexture gfx_water,200,200 : PositionTexture gfx_water,env_seascr#,env_seascr#
			setBlitzTextureMatrix(
				this.gfx_water,
				200,
				200,
				0,
				this.core.env_seascr,
				this.core.env_seascr,
				this.env_sea2.ou,
				this.env_sea2.ov
			);
		}
		if (this.env_ground) {
			this.env_ground.follow(x, z);
			//ScaleTexture gfx_tergrounddirt,30,30
			if (this.gfx_tergrounddirt) {
				setBlitzTextureMatrix(this.gfx_tergrounddirt, 30, 30, 0, 0, 0, this.env_ground.ou, this.env_ground.ov);
			}
		}
	}

	/**
	 * Flares sit at pixel coordinates fx,fy,1 under env_lenspivot, which is a
	 * child of cam at (-1, set_scry/set_scrx, 1) scaled (s,-s,s), s = 2/set_scrx.
	 */
	private syncFlares(): void {
		const s = this.settings;
		const quot = s.set_scry / s.set_scrx;
		const scale = 2.0 / s.set_scrx;
		for (let i = 0; i < this.flareSprites.length; i++) {
			const sp = this.flareSprites[i];
			const [fx, fy] = this.flarePos[i];
			sp.position.set(-1 + fx * scale, quot - fy * scale, 1 + scale).applyMatrix4(this.camera.matrixWorld);
			sp.sync();
		}
	}

	/**
	 * Draws the scene into the current render target: RenderWorld for the main
	 * camera (`main`), or one view of the water reflection camera. Overridden by
	 * bb3d's WorldEnvironment so that the bb3d world does the drawing (entity
	 * order passes, sprites, planes, auto fade, every game camera).
	 */
	protected renderScene(camera: BlitzCamera, main: boolean): void {
		void main;
		this.renderer.render(this.scene, camera);
	}

	/** RenderWorld followed by e_environment_water2dfx(). */
	render(): void {
		const r = this.renderer;
		this.camera.updateMatrixWorld();
		this.sortEye.copy(this.camera.position);
		const fx = this.core.e_environment_water2dfx();
		if (!fx) {
			this.renderScene(this.camera, true);
			return;
		}
		const size = r.getDrawingBufferSize(new THREE.Vector2());
		if (!this.fxTarget || this.fxTarget.width !== size.x || this.fxTarget.height !== size.y) {
			this.fxTarget?.dispose();
			this.fxTarget = new THREE.WebGLRenderTarget(size.x, size.y, {
				samples: r.capabilities.isWebGL2 ? 4 : 0,
				colorSpace: THREE.NoColorSpace,
				minFilter: THREE.LinearFilter,
				magFilter: THREE.LinearFilter
			});
		}
		const prev = r.getRenderTarget();
		r.setRenderTarget(this.fxTarget);
		this.renderScene(this.camera, true);
		r.setRenderTarget(prev);
		const u = this.fxMaterial.uniforms;
		u.tFrame.value = this.fxTarget.texture;
		u.uScr.value.set(this.settings.set_scrx, this.settings.set_scry);
		r.render(this.fxScene, this.fxCamera);
	}

	/** "Environment Stuff (Post Render)": grass_spread() */
	updatePost(): void {
		this.grass_spread();
	}

	/** grass_spread() with the engine queries filled in. */
	grass_spread(): number {
		const cam = this.camera;
		const ter = this.terrain;
		if (!ter) return 0;
		cam.updateMatrixWorld();
		const update = this.grass.grass_spread({
			set_grass: this.settings.set_grass,
			f: this.core.timer.f,
			in_t100go: this.core.timer.in_t100go,
			camX: cam.position.x,
			camZ: cam.position.z,
			camYaw: entityAngles(cam).yaw,
			ter_size: ter.size,
			terrainY: (x, z) => ter.terrainY(x, z),
			entityInView: (x, y, z) => boxInView(cam, this.grassBounds, x, y, z)
		});
		//RotateTexture gfx_grasspreadtex,0+Sin(grass_wind#)*1.5
		if (this.gfx_grasspreadtex) setBlitzTextureMatrix(this.gfx_grasspreadtex, 1, 1, this.grass.texRotation, 0, 0);
		this.grassMesh?.update(
			this.grass,
			this.root,
			cam.position.x,
			cam.position.y,
			cam.position.z,
			this.settings.set_grass > 0
		);
		return update;
	}

	// ------------------------------------------------------------------ settings and script commands

	/** The canvas size the lens flare and 2D effect maths use as set_scrx / set_scry. */
	setScreenSize(width: number, height: number): void {
		this.settings.set_scrx = width;
		this.settings.set_scry = height;
	}

	/**
	 * The "Setup" tail of save_settings(), run after the options menu changes
	 * quality settings: water setup, then grass_map / grass_heightmap /
	 * grass_spread. (As in the original, this replaces the map's stored grass
	 * flags with the height-derived ones.)
	 */
	save_settings_setup(): void {
		const ter = this.terrain;
		//Water
		this.core.e_environment_setup_water();
		this.applyTerrainMaterial();
		if (!ter) return;
		//Grass
		this.grass.grass_map(this.settings.set_grass, this.colormap, this.colormapSize, ter.size);
		this.grass.grass_heightmap(ter.size, (x, z) => ter.terrainY(x, z), this.core.rng);
		this.grass_spread();
	}

	/** grass_map() : grass_heightmap() as the editor and script commands call them. */
	regenerateGrass(): void {
		const ter = this.terrain;
		if (!ter) return;
		this.grass.grass_map(this.settings.set_grass, this.colormap, this.colormapSize, ter.size);
		this.grass.grass_heightmap(ter.size, (x, z) => ter.terrainY(x, z), this.core.rng);
	}

	/** Script command "wateralpha": EntityAlpha env_sea2,a */
	wateralpha(a: number): void {
		this.waterAlpha = a;
		const m = this.env_sea2?.mesh.material as THREE.MeshLambertMaterial | undefined;
		if (!m) return;
		m.opacity = a;
		m.transparent = a < 1;
		m.depthWrite = !(a < 1);
		m.needsUpdate = true;
	}

	/** Script command "watertexture": custom water image and under-water fog colour. */
	async watertexture(path: string): Promise<boolean> {
		this.gfx_waterimg_custom = undefined;
		let img = await decodeImage(this.vfs, path);
		if (!img) return false;
		const size = this.waterSize;
		if (img.width !== size) {
			if (img.height !== size) {
				img = resizeImage(img, size, size);
			}
		}
		this.gfx_waterimg_custom = this.fitToWater(img);
		//GetColor 0,0
		this.core.env_wcol[0] = 255 - this.gfx_waterimg_custom[0];
		this.core.env_wcol[1] = 255 - this.gfx_waterimg_custom[1];
		this.core.env_wcol[2] = 255 - this.gfx_waterimg_custom[2];
		return true;
	}

	/** e_terraincm(file$): load colormap. Returns 0 when the file does not exist. */
	async e_terraincm(path: string): Promise<number> {
		const img = await decodeImage(this.vfs, path);
		if (!img) return 0;
		// LoadTexture scales to power-of-two dimensions.
		const size = 2 ** Math.round(Math.log2(img.height));
		const fitted = img.width === size && img.height === size ? img : resizeImage(img, size, size);
		const cm = imageToColormap(fitted);
		this.setColormapData(cm.colormap, cm.size);
		return 1;
	}

	/** e_terraincmscale(newscale): scale colormap. Returns the size actually used. */
	e_terraincmscale(newscale: number): number {
		newscale = e_terraincmscale_size(newscale);
		//Perform scale
		const img = resizeImage(colormapToImage(this.colormap, this.colormapSize), newscale, newscale);
		const cm = imageToColormap(img);
		this.setColormapData(cm.colormap, cm.size);
		//Update
		this.regenerateGrass();
		return newscale;
	}

	/** Script command "grasscolor" */
	grass_colors(r: number, g: number, b: number): void {
		this.grass.grass_colors(r, g, b);
	}

	dispose(): void {
		this.grassMesh?.dispose(this.root);
		this.scene.remove(this.root);
		if (this.scene.fog === this.fog) this.scene.fog = null;
		this.env_watertex?.dispose();
		this.fxTarget?.dispose();
		this.fxMaterial.dispose();
		this.colormapTex?.dispose();
		this.gfx_water?.dispose();
	}
}
