import * as THREE from 'three';
import { Sin, blitzInt, fmod, idiv, type BlitzRandom } from './blitzMath';

/**
 * Grass spread, ported from includes/grasspread.bb.
 *
 * `GrassCore` is the original logic (grass_map, grass_heightmap,
 * grass_spread, grass_free, grass_colors) on plain arrays; `GrassMesh`
 * draws the tufts.
 */

const Cworld_size = 64;
const Cworld_height = 3200;
const INT_MIN = -2147483648;

/** "Setup Properties by Settings (set_grass)" in grass_map(). */
export function grassProperties(
	set_grass: number
): { grass_c: number; grass_dist?: number; fade_start: number; alpha: number } {
	switch (set_grass) {
		case 1:
			return { grass_c: 10, grass_dist: 23, fade_start: 23 * 1, alpha: 0.45 };
		case 2:
			return { grass_c: 20, grass_dist: 22, fade_start: 22 * 2, alpha: 0.43 };
		case 3:
			return { grass_c: 40, grass_dist: 21, fade_start: 21 * 3, alpha: 0.41 };
		case 4:
			return { grass_c: 80, grass_dist: 20, fade_start: 20 * 5, alpha: 0.39 };
		default:
			return { grass_c: 0, fade_start: 0, alpha: 0 };
	}
}

/** What grass_spread needs from the rest of the engine each frame. */
export interface GrassContext {
	set_grass: number;
	/** f# */
	f: number;
	/** in_t100go */
	in_t100go: number;
	/** EntityX(cam), EntityZ(cam), EntityYaw(cam) */
	camX: number;
	camZ: number;
	camYaw: number;
	ter_size: number;
	/** TerrainY(ter,x,0,z) */
	terrainY(x: number, z: number): number;
	/** EntityInView(grass_h(x,y),cam) for a tuft at this position */
	entityInView(x: number, y: number, z: number): boolean;
}

export class GrassCore {
	/** Global grass_c=19 : Global grass_dist=15 (initial values from load_vars.bb) */
	grass_c = 19;
	grass_dist = 15;
	grass_mapsize = 0;
	grass_f = 0;
	grass_x = INT_MIN;
	grass_y = INT_MIN;
	grass_yaw = INT_MIN;
	grass_wind = 0;
	/** Dim grass_rgb(grass_mapsize,grass_mapsize,3): index ((x*(mapsize+1))+y)*4, channel 3 = grass on/off */
	grass_rgb = new Uint8Array(4);

	/** EntityAutoFade near/far and EntityAlpha of every tuft. */
	fade_start = 0;
	fade_end = 0;
	alpha = 0;

	/** grass_h(x,y): per tuft position, colour and Show/Hide state; index x*(grass_c+1)+y */
	pos = new Float32Array(3);
	col = new Uint8Array(3);
	shown = new Uint8Array(1);
	/** False after grass_free() until the next grass_map(). */
	allocated = false;
	/** Bumped whenever tuft state changed, so a renderer knows to re-upload. */
	version = 0;

	/** RotateTexture gfx_grasspreadtex,angle as last set by grass_spread. */
	texRotation = 0;

	/** grass_map(): creates the tufts and reads the colour map into grass_rgb. */
	grass_map(set_grass: number, colormap: Uint8Array, colormapSize: number, ter_size: number): void {
		//Delete old Grass
		this.grass_free();
		//Setup Properties by Settings (set_grass)
		const p = grassProperties(set_grass);
		this.grass_c = p.grass_c;
		if (p.grass_dist !== undefined) this.grass_dist = p.grass_dist;
		//Fill Array with Meshes
		const n = this.grass_c + 1;
		this.pos = new Float32Array(n * n * 3);
		this.col = new Uint8Array(n * n * 3);
		this.shown = new Uint8Array(n * n);
		for (let i = 0; i < n * n; i++) {
			//EntityColor grass_h(x,y),0,200,0
			this.col[i * 3 + 1] = 200;
		}
		//EntityAutoFade grass_h(x,y),fade_start,grass_dist*(grass_c/2) : EntityAlpha grass_h(x,y),alpha
		this.fade_start = p.fade_start;
		this.fade_end = this.grass_dist * idiv(this.grass_c, 2);
		this.alpha = p.alpha;
		this.allocated = true;
		//Generate Colormap Array (grass_rgb) out of the Terrain Color Texture (ter_tex_color)
		this.grass_mapsize = colormapSize;
		const m = this.grass_mapsize + 1;
		this.grass_rgb = new Uint8Array(m * m * 4);
		for (let x = 0; x <= this.grass_mapsize - 1; x++) {
			for (let y = 0; y <= this.grass_mapsize - 1; y++) {
				const s = (x * colormapSize + y) * 3;
				const d = (x * m + y) * 4;
				this.grass_rgb[d] = colormap[s];
				this.grass_rgb[d + 1] = colormap[s + 1];
				this.grass_rgb[d + 2] = colormap[s + 2];
				this.grass_rgb[d + 3] = 1;
			}
		}
		//Calculate Value needed to get the Colormap Position
		this.grass_f = Math.fround(Math.fround(ter_size / this.grass_mapsize) * Cworld_size);
		//Perform spread
		this.grass_x = INT_MIN;
		this.grass_y = INT_MIN;
		this.grass_yaw = INT_MIN;
		this.version++;
	}

	/**
	 * The grass map read in load_map(): grass_rgb(x,y,3)=ReadByte for
	 * x,y = 0..colormapSize, stored column-major in the map file.
	 */
	loadGrassFlags(grass: Uint8Array): void {
		const m = this.grass_mapsize + 1;
		for (let i = 0; i < m * m && i < grass.length; i++) this.grass_rgb[i * 4 + 3] = grass[i];
	}

	/** grass_heightmap(): deactivate grass by height (deep water and mountains). */
	grass_heightmap(ter_size: number, terrainY: (x: number, z: number) => number, rng: BlitzRandom): void {
		const size = ter_size;
		const ctexsize = this.grass_mapsize;
		const texsize = ctexsize - 1;
		const rx = -(idiv(size, 2) * Cworld_size);
		const ry = -(idiv(size, 2) * Cworld_size);
		const fac = Math.fround((size * Cworld_size) / ctexsize);
		const m = this.grass_mapsize + 1;
		for (let x = 0; x <= texsize; x++) {
			for (let y = 0; y <= texsize; y++) {
				const i = (x * m + y) * 4 + 3;
				//Reset
				this.grass_rgb[i] = 1;

				//Get Height
				const h = Math.fround(Math.fround(terrainY(rx + x * fac, ry + y * fac) / Cworld_height) + 0.5);

				//Deep Disable
				if (h < 0.54) {
					if (h < 0.52) {
						this.grass_rgb[i] = 0;
					} else {
						if (rng.Rand(3) !== 1) this.grass_rgb[i] = 0;
					}
					//Mountain Disable
				} else if (h > 0.57) {
					if (rng.Rand(10) !== 1) this.grass_rgb[i] = 0;
				}
			}
		}
	}

	/**
	 * grass_spread(): places and paints grass tufts around the camera.
	 * Returns the update kind performed: 0 none, 1 position update, 2 visibility update.
	 */
	grass_spread(c: GrassContext): number {
		//Grass Wind Tex. Rotation
		this.grass_wind = Math.fround(fmod(Math.fround(this.grass_wind + 2 * c.f), 360));
		this.texRotation = 0 + Sin(this.grass_wind) * 1.5;
		//Grass Activated?
		if (c.set_grass > 0 && this.allocated) {
			const grass_c = this.grass_c;
			const grass_dist = this.grass_dist;
			const n = grass_c + 1;
			const m = this.grass_mapsize + 1;
			const half = -idiv(grass_c, 2);
			const camx = blitzInt(c.camX);
			const camz = blitzInt(c.camZ);
			const terhalf = idiv(c.ter_size, 2) * Cworld_size;
			//Update necessary? (position changed)
			//1 - Gras Position Update (caused by cam movement)
			//2 - Gras Visibility Update (caused by cam rotation)
			let update = 0;
			//X Change?
			if (this.grass_x !== (idiv(camx, grass_dist) + half) * grass_dist) {
				update = 1;
				//Y Change?
			} else if (this.grass_y !== (idiv(camz, grass_dist) + half) * grass_dist) {
				update = 1;
				//Yaw Change? (grass_yaw is never assigned after grass_map, so this is always true)
			} else if (Math.abs(c.camYaw - this.grass_yaw) > 0) {
				update = 2;
			}
			//Instant Update
			if (update === 1) {
				this.grass_x = (idiv(camx, grass_dist) + half) * grass_dist;
				this.grass_y = (idiv(camz, grass_dist) + half) * grass_dist;
				for (let x = 0; x <= grass_c; x++) {
					for (let y = 0; y <= grass_c; y++) {
						const i = x * n + y;
						//Position
						let gx = (idiv(camx, grass_dist) + half + x) * grass_dist;
						let gz = (idiv(camz, grass_dist) + half + y) * grass_dist;
						if (blitzInt(gx) % 2 === 0) gx = gx + idiv(grass_dist, 2);
						if (blitzInt(gz) % 2 === 0) gz = gz + idiv(grass_dist, 2);
						const gy = c.terrainY(gx, gz);
						this.pos[i * 3] = gx;
						this.pos[i * 3 + 1] = gy;
						this.pos[i * 3 + 2] = gz;
						const gcx = blitzInt(Math.fround(Math.fround(gx + terhalf) / this.grass_f));
						const gcy = blitzInt(Math.fround(Math.fround(gz + terhalf) / this.grass_f));
						//In Map?
						if (gcx >= 0 && gcx <= this.grass_mapsize && gcy >= 0 && gcy <= this.grass_mapsize) {
							const g = (gcx * m + gcy) * 4;
							//Show?
							if (this.grass_rgb[g + 3] === 1) {
								//Assign Color
								this.col[i * 3] = this.grass_rgb[g];
								this.col[i * 3 + 1] = this.grass_rgb[g + 1];
								this.col[i * 3 + 2] = this.grass_rgb[g + 2];
								//In View?
								this.shown[i] = c.entityInView(gx, gy, gz) ? 1 : 0;
							} else {
								this.shown[i] = 0;
							}
						} else {
							this.shown[i] = 0;
						}
					}
				}
				this.version++;
				//Timed Update
			} else if (update === 2) {
				if (c.in_t100go) {
					this.grass_x = (idiv(camx, grass_dist) + half) * grass_dist;
					this.grass_y = (idiv(camz, grass_dist) + half) * grass_dist;
					for (let x = 0; x <= grass_c; x++) {
						for (let y = 0; y <= grass_c; y++) {
							const i = x * n + y;
							//Position
							let gx = (idiv(camx, grass_dist) + half + x) * grass_dist;
							let gz = (idiv(camz, grass_dist) + half + y) * grass_dist;
							if (blitzInt(gx) % 2 === 0) gx = gx + idiv(grass_dist, 2);
							if (blitzInt(gz) % 2 === 0) gz = gz + idiv(grass_dist, 2);
							const gcx = blitzInt(Math.fround(Math.fround(gx + terhalf) / this.grass_f));
							const gcy = blitzInt(Math.fround(Math.fround(gz + terhalf) / this.grass_f));
							//In Map?
							if (gcx >= 0 && gcx <= this.grass_mapsize && gcy >= 0 && gcy <= this.grass_mapsize) {
								//Show?
								if (this.grass_rgb[(gcx * m + gcy) * 4 + 3] === 1) {
									//In View? (tested at the tuft's current position)
									this.shown[i] = c.entityInView(this.pos[i * 3], this.pos[i * 3 + 1], this.pos[i * 3 + 2])
										? 1
										: 0;
								} else {
									this.shown[i] = 0;
								}
							} else {
								this.shown[i] = 0;
							}
						}
					}
					this.version++;
				}
			}
			return update;
		}
		return 0;
	}

	/** grass_free(): deletes the grass meshes. */
	grass_free(): void {
		this.allocated = false;
		this.shown.fill(0);
		this.grass_x = INT_MIN;
		this.grass_y = INT_MIN;
		this.version++;
	}

	/** grass_colors(r,g,b): set complete grass to one colour. */
	grass_colors(r: number, g: number, b: number): void {
		const m = this.grass_mapsize + 1;
		for (let x = 0; x <= this.grass_mapsize - 1; x++) {
			for (let y = 0; y <= this.grass_mapsize - 1; y++) {
				const d = (x * m + y) * 4;
				this.grass_rgb[d] = r;
				this.grass_rgb[d + 1] = g;
				this.grass_rgb[d + 2] = b;
			}
		}
	}
}

/**
 * Draws the tufts of a GrassCore as one InstancedMesh.
 *
 * Per tuft the original has: CopyEntity(gfx_grasspread), EntityFX 16
 * (two-sided, lit), EntityColor from the colour map, EntityAlpha, the
 * alpha-blended gfx_grasspreadtex and EntityAutoFade. Auto fade
 * (Model::doAutoFade: alpha *= 1-(d-near)/(far-near), nothing drawn at
 * d >= far, d measured from the eye to the entity origin) is evaluated in the
 * vertex shader per instance.
 */
export class GrassMesh {
	mesh?: THREE.InstancedMesh;
	private material: THREE.MeshLambertMaterial;
	private uniforms = { uFadeNear: { value: 0 }, uFadeFar: { value: 1 } };
	private seen = -1;
	private order: number[] = [];
	private readonly dummy = new THREE.Matrix4();
	private readonly color = new THREE.Color();

	constructor(
		private geometry: THREE.BufferGeometry,
		/** Brush colour of the mesh surface (multiplied with the entity colour). */
		private brushColor: THREE.Color,
		texture: THREE.Texture | null
	) {
		const mat = new THREE.MeshLambertMaterial({
			map: texture,
			transparent: true,
			depthWrite: false,
			side: THREE.DoubleSide
		});
		mat.onBeforeCompile = (shader) => {
			Object.assign(shader.uniforms, this.uniforms);
			shader.vertexShader = shader.vertexShader
				.replace(
					'#include <common>',
					'#include <common>\nuniform float uFadeNear;\nuniform float uFadeFar;\nvarying float vBlitzFade;'
				)
				.replace(
					'#include <begin_vertex>',
					`#include <begin_vertex>
					{
						vec3 org = ( modelMatrix * instanceMatrix * vec4( 0.0, 0.0, 0.0, 1.0 ) ).xyz;
						float d = distance( cameraPosition, org );
						vBlitzFade = d >= uFadeFar ? 0.0 : ( d >= uFadeNear ? 1.0 - ( d - uFadeNear ) / ( uFadeFar - uFadeNear ) : 1.0 );
					}`
				);
			shader.fragmentShader = shader.fragmentShader
				.replace('#include <common>', '#include <common>\nvarying float vBlitzFade;')
				.replace(
					'#include <map_fragment>',
					'#include <map_fragment>\n\tif ( vBlitzFade <= 0.0 ) discard;\n\tdiffuseColor.a *= vBlitzFade;'
				)
				// Direct3D lights two-sided faces with the stored normal; no back-face flip.
				.replace(
					'#include <normal_fragment_begin>',
					THREE.ShaderChunk.normal_fragment_begin.replace('gl_FrontFacing ? 1.0 : - 1.0', '1.0')
				);
		};
		this.material = mat;
	}

	get texture(): THREE.Texture | null {
		return this.material.map;
	}

	/** Uploads tuft state if it changed and sorts far-to-near around the camera. */
	update(core: GrassCore, parent: THREE.Object3D, camX: number, camY: number, camZ: number, show: boolean): void {
		const n = (core.grass_c + 1) * (core.grass_c + 1);
		if (!this.mesh || this.mesh.instanceMatrix.count < n) {
			if (this.mesh) {
				parent.remove(this.mesh);
				this.mesh.dispose();
			}
			this.mesh = new THREE.InstancedMesh(this.geometry, this.material, n);
			this.mesh.frustumCulled = false;
			this.mesh.name = 'grass';
			parent.add(this.mesh);
			this.seen = -1;
		}
		const mesh = this.mesh;
		mesh.visible = show && core.allocated;
		if (!mesh.visible) return;
		this.material.opacity = core.alpha;
		this.uniforms.uFadeNear.value = core.fade_start;
		this.uniforms.uFadeFar.value = core.fade_end;

		if (this.seen !== core.version) {
			this.seen = core.version;
			this.order.length = 0;
			for (let i = 0; i < n; i++) if (core.shown[i]) this.order.push(i);
		}
		// Blitz draws transparent entities far to near, every frame.
		const p = core.pos;
		const d2 = (i: number) =>
			(p[i * 3] - camX) ** 2 + (p[i * 3 + 1] - camY) ** 2 + (p[i * 3 + 2] - camZ) ** 2;
		this.order.sort((a, b) => d2(b) - d2(a));
		const bc = this.brushColor;
		for (let k = 0; k < this.order.length; k++) {
			const i = this.order[k];
			this.dummy.makeTranslation(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]);
			mesh.setMatrixAt(k, this.dummy);
			this.color.setRGB(
				(core.col[i * 3] / 255) * bc.r,
				(core.col[i * 3 + 1] / 255) * bc.g,
				(core.col[i * 3 + 2] / 255) * bc.b
			);
			mesh.setColorAt(k, this.color);
		}
		mesh.count = this.order.length;
		mesh.instanceMatrix.needsUpdate = true;
		if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
	}

	dispose(parent: THREE.Object3D): void {
		if (this.mesh) {
			parent.remove(this.mesh);
			this.mesh.dispose();
			this.mesh = undefined;
		}
		this.material.dispose();
	}
}
