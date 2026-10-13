import type * as THREE from 'three';
import { rotateEntity } from '../blitzSpace';
import type { Terrain } from '../terrain';
import { BlitzRandom } from './blitzMath';

/**
 * Terrain functions of includes/e_environment.bb: the runtime queries
 * (e_terpitch, e_terroll, e_teralign, e_gc) and the editing functions the
 * editor, the random map generator and the "terrain" script command use.
 *
 * Blitz3D stores terrain heights as one unsigned byte per cell in a
 * size*size array indexed with (x & mask, z & mask) (blitz3d/terrainrep.cpp:
 * `cells[..].height=h*255.0f`, `getHeight` returns `height/255.0f`). So
 *  - ModifyTerrain quantises to 1/255 steps, truncating (and wrapping when
 *    the value is outside 0..1);
 *  - x = ter_size addresses the same cell as x = 0, likewise for z.
 * Both come from the Blitz terrain port in collision/terrainCollider.ts,
 * which `TerrainEditor` edits through `Terrain.collider`.
 */

/** A decoded image: RGBA, row-major. */
export interface PixelImage {
	width: number;
	height: number;
	data: Uint8Array | Uint8ClampedArray;
}

/** TerrainRep::setHeight's `height=h*255.0f` (float to unsigned char). */
export function quantizeHeight(h: number): number {
	return (Math.trunc(Math.fround(Math.fround(h) * 255)) & 255) / 255;
}

export class TerrainEditor {
	/** Set by ModifyTerrain; cleared by flush(). */
	dirty = false;

	constructor(
		readonly terrain: Terrain,
		readonly rng: BlitzRandom = new BlitzRandom()
	) {}

	get ter_size(): number {
		return this.terrain.size;
	}

	/** TerrainHeight(ter,x,z): byte/255, 0 outside 0..ter_size, wrapping at ter_size. */
	TerrainHeight(x: number, z: number): number {
		return this.terrain.collider.getHeight(x, z);
	}

	/** ModifyTerrain(ter,x,z,h) */
	ModifyTerrain(x: number, z: number, h: number): void {
		this.terrain.collider.setHeight(x, z, h);
		this.dirty = true;
	}

	/**
	 * Pushes edited heights into the render mesh and refreshes nothing else:
	 * ter_groundy is only updated by e_terrainground(), as in the original.
	 * Blitz rebuilds its terrain mesh every frame, so the original needs no such call.
	 */
	flush(): void {
		if (!this.dirty) return;
		this.dirty = false;
		this.terrain.rebuild();
	}

	/** e_terrainsmooth(): smooth terrain */
	e_terrainsmooth(): void {
		const ter_size = this.ter_size;
		for (let x = 1; x <= ter_size - 1; x++) {
			for (let z = 1; z <= ter_size - 1; z++) {
				this.ModifyTerrain(x, z, this.smoothAt(x, z));
			}
		}
	}

	private smoothAt(x: number, z: number): number {
		const fr = Math.fround;
		let h = fr(this.TerrainHeight(x, z) * 8);
		h = fr(h + this.TerrainHeight(x - 1, z - 1));
		h = fr(h + this.TerrainHeight(x - 1, z) * 2);
		h = fr(h + this.TerrainHeight(x - 1, z + 1));
		h = fr(h + this.TerrainHeight(x + 1, z - 1));
		h = fr(h + this.TerrainHeight(x + 1, z) * 2);
		h = fr(h + this.TerrainHeight(x + 1, z + 1));
		h = fr(h + this.TerrainHeight(x, z - 1) * 2);
		h = fr(h + this.TerrainHeight(x, z + 1) * 2);
		h = fr(h / 20);
		return h;
	}

	/** e_terraindistort(power#): distort terrain */
	e_terraindistort(power: number): void {
		const ter_size = this.ter_size;
		for (let x = 1; x <= ter_size - 1; x++) {
			for (let z = 1; z <= ter_size - 1; z++) {
				if (this.rng.Rand(3) === 1) {
					let h = this.TerrainHeight(x, z);
					h = h + this.rng.Rnd(-power, power);
					this.ModifyTerrain(x, z, h);
				}
			}
		}
	}

	/** e_terrainrandom(x,z,max#=0.3,mode=0): change height randomly */
	e_terrainrandom(x: number, z: number, max = 0.3, mode = 0): void {
		const h = this.TerrainHeight(x, z);
		switch (mode) {
			case -1:
				this.ModifyTerrain(x, z, h - this.rng.Rnd(0, max));
				break;
			case 0:
				this.ModifyTerrain(x, z, h + this.rng.Rnd(-max, max));
				break;
			case 1:
				this.ModifyTerrain(x, z, h + this.rng.Rnd(0, max));
				break;
		}
	}

	/**
	 * e_terrainhm(file$,scale#): load heightmap. The caller decodes the image
	 * (LoadImage); returns 0 when there is none, like the original.
	 */
	e_terrainhm(image: PixelImage | undefined, scale: number): number {
		if (scale < -1) scale = -1;
		if (scale > 1) scale = 1;
		if (!image) return 0;
		const ter_size = this.ter_size;
		//ResizeImage temp,ter_size,ter_size
		const temp = resizeImage(image, ter_size, ter_size);
		for (let x = 0; x <= ter_size - 1; x++) {
			for (let y = 0; y <= ter_size - 1; y++) {
				const r = temp.data[(y * temp.width + x) * 4];
				this.ModifyTerrain(x, y, Math.fround(scale * Math.fround(r / 255)));
			}
		}
		return 1;
	}

	/** e_terraincompleteh(change#): terrain complete height change */
	e_terraincompleteh(change: number): void {
		const ter_size = this.ter_size;
		for (let x = 1; x <= ter_size - 1; x++) {
			for (let z = 1; z <= ter_size - 1; z++) {
				let h = this.TerrainHeight(x, z);
				h = Math.fround(h + change);
				if (h > 1) h = 1;
				if (h < 0) h = 0;
				this.ModifyTerrain(x, z, h);
			}
		}
	}

	/** e_terrainborder(absh#,change#=0) */
	e_terrainborder(absh: number, change = 0): void {
		const ter_size = this.ter_size;
		let h: number;
		//Set Absolute
		if (absh !== -1) {
			h = absh;
			//Change
		} else {
			h = this.TerrainHeight(0, 0);
			h = Math.fround(h + change);
			if (h > 1) h = 1;
			if (h < 0) h = 0;
		}
		for (let x = 0; x <= ter_size; x++) {
			this.ModifyTerrain(x, 0, h);
			this.ModifyTerrain(x, ter_size, h);
			this.ModifyTerrain(0, x, h);
			this.ModifyTerrain(ter_size, x, h);
		}
	}

	/** e_terraintrans(rx,rz,change#,r=1): terrain transform with round brush */
	e_terraintrans(rx: number, rz: number, change: number, r = 1): void {
		const ter_size = this.ter_size;
		for (let x = rx - r; x <= rx + r; x++) {
			for (let z = rz - r; z <= rz + r; z++) {
				const dist = Math.fround(Math.sqrt((x - rx) ** 2 + (z - rz) ** 2));
				if (dist < r) {
					if (x > 0 && x < ter_size) {
						if (z > 0 && z < ter_size) {
							let perc = Math.fround(dist / r);
							perc = Math.fround(1 - perc);
							let h = this.TerrainHeight(x, z);
							h = Math.fround(h + Math.fround(change * perc));
							if (h > 1) h = 1;
							if (h < 0) h = 0;
							this.ModifyTerrain(x, z, h);
						}
					}
				}
			}
		}
	}

	/** e_terrainflatten(rx,rz,r=1): terrain flatten with round brush */
	e_terrainflatten(rx: number, rz: number, r = 1): void {
		const ter_size = this.ter_size;
		const c = this.TerrainHeight(rx, rz);
		for (let x = rx - r; x <= rx + r; x++) {
			for (let z = rz - r; z <= rz + r; z++) {
				const dist = Math.fround(Math.sqrt((x - rx) ** 2 + (z - rz) ** 2));
				if (dist < r) {
					if (x > 0 && x < ter_size) {
						if (z > 0 && z < ter_size) {
							let perc = Math.fround(dist / r);
							if (perc > 1.0) perc = 1.0;
							let h = Math.fround(this.TerrainHeight(x, z) * perc);
							h = Math.fround(h + Math.fround(c * Math.fround(1 - perc)));
							if (h > 1) h = 1;
							if (h < 0) h = 0;
							if (Math.abs(h - c) < 0.002) {
								h = c;
							}
							this.ModifyTerrain(x, z, h);
						}
					}
				}
			}
		}
	}

	/** e_terrainsmoothp(rx,rz,r=1): terrain smooth with round brush */
	e_terrainsmoothp(rx: number, rz: number, r = 1): void {
		const ter_size = this.ter_size;
		for (let x = rx - r; x <= rx + r; x++) {
			for (let z = rz - r; z <= rz + r; z++) {
				const dist = Math.fround(Math.sqrt((x - rx) ** 2 + (z - rz) ** 2));
				if (dist < r) {
					if (x > 1 && x < ter_size - 1) {
						if (z > 1 && z < ter_size - 1) {
							this.ModifyTerrain(x, z, this.smoothAt(x, z));
						}
					}
				}
			}
		}
	}

	/** e_terraindistortp(rx,rz,change#,r=1): terrain distort with round brush */
	e_terraindistortp(rx: number, rz: number, change: number, r = 1): void {
		const ter_size = this.ter_size;
		for (let x = rx - r; x <= rx + r; x++) {
			for (let z = rz - r; z <= rz + r; z++) {
				const dist = Math.fround(Math.sqrt((x - rx) ** 2 + (z - rz) ** 2));
				if (dist < r) {
					if (x > 0 && x < ter_size) {
						if (z > 0 && z < ter_size) {
							let perc = Math.fround(dist / r);
							perc = Math.fround(1 - perc);
							let h = this.TerrainHeight(x, z);
							h = Math.fround(h + this.rng.Rnd(0, 1) * Math.fround(change * perc));
							if (h > 1) h = 1;
							if (h < 0) h = 0;
							this.ModifyTerrain(x, z, h);
						}
					}
				}
			}
		}
	}
}

/**
 * ResizeImage (bbTFormImage with TFormFilter on, the default): bilinear
 * sampling at pixel centres; samples outside the source read as black.
 */
export function resizeImage(src: PixelImage, w: number, h: number): PixelImage {
	const out = new Uint8Array(w * h * 4);
	const sx = w / src.width;
	const sy = h / src.height;
	const px = (x: number, y: number, c: number) =>
		x < 0 || y < 0 || x >= src.width || y >= src.height ? 0 : src.data[(y * src.width + x) * 4 + c];
	for (let y = 0; y < h; y++) {
		for (let x = 0; x < w; x++) {
			const qx = (x + 0.5) / sx - 0.5;
			const qy = (y + 0.5) / sy - 0.5;
			const ix = Math.floor(qx);
			const iy = Math.floor(qy);
			const fx = qx - ix;
			const fy = qy - iy;
			const w1 = (1 - fx) * (1 - fy);
			const w2 = fx * (1 - fy);
			const w3 = (1 - fx) * fy;
			const w4 = fx * fy;
			const o = (y * w + x) * 4;
			for (let c = 0; c < 3; c++) {
				const v = px(ix, iy, c) * w1 + px(ix + 1, iy, c) * w2 + px(ix, iy + 1, c) * w3 + px(ix + 1, iy + 1, c) * w4;
				out[o + c] = Math.trunc(v + 0.5);
			}
			out[o + 3] = 255;
		}
	}
	return { width: w, height: h, data: out };
}

/**
 * The size computation of e_terraincmscale(newscale): nearest power of two,
 * limited to 8..4096.
 */
export function e_terraincmscale_size(newscale: number): number {
	//Change new scale to a power of 2 value
	let p2_num = newscale;
	let p2_c = 0;
	while (p2_num > 1) {
		p2_num = Math.trunc(p2_num / 2);
		p2_c = p2_c + 1;
	}
	if (Math.abs(newscale - 2 ** p2_c) < Math.abs(newscale - 2 ** (p2_c + 1))) {
		newscale = 2 ** p2_c;
	} else {
		newscale = 2 ** (p2_c + 1);
	}
	//Keep value in bounds
	if (newscale < 8) newscale = 8;
	if (newscale > 4096) newscale = 4096;
	return newscale;
}

/** Converts a decoded image to the map colormap layout (RGB, index (x*size+y)*3). */
export function imageToColormap(img: PixelImage): { colormap: Uint8Array; size: number } {
	const size = img.height;
	const colormap = new Uint8Array(size * size * 3);
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const s = (y * img.width + Math.min(x, img.width - 1)) * 4;
			const d = (x * size + y) * 3;
			colormap[d] = img.data[s];
			colormap[d + 1] = img.data[s + 1];
			colormap[d + 2] = img.data[s + 2];
		}
	}
	return { colormap, size };
}

/** Inverse of imageToColormap. */
export function colormapToImage(colormap: Uint8Array, size: number): PixelImage {
	const data = new Uint8Array(size * size * 4);
	for (let x = 0; x < size; x++) {
		for (let y = 0; y < size; y++) {
			const s = (x * size + y) * 3;
			const d = (y * size + x) * 4;
			data[d] = colormap[s];
			data[d + 1] = colormap[s + 1];
			data[d + 2] = colormap[s + 2];
			data[d + 3] = 255;
		}
	}
	return { width: size, height: size, data };
}

const RTOD = 180 / Math.PI;

/**
 * e_terpitch#(x#,z#,s#=1.): pitch of the ground along Z.
 * PointEntity p1,p2 followed by EntityPitch(p1) is -ATan2(dy, horizontal distance)
 * (blitz3d/geom.h Vector::pitch).
 */
export function e_terpitch(ter: Pick<Terrain, 'tery'>, x: number, z: number, s = 1): number {
	const y1 = ter.tery(x, z - s);
	const y2 = ter.tery(x, z + s);
	return -Math.atan2(y2 - y1, Math.abs(2 * s)) * RTOD;
}

/** e_terroll#(x#,z#,s#=1.): pitch of the ground along -X (p1 at x+s, p2 at x-s). */
export function e_terroll(ter: Pick<Terrain, 'tery'>, x: number, z: number, s = 1): number {
	const y1 = ter.tery(x + s, z);
	const y2 = ter.tery(x - s, z);
	return -Math.atan2(y2 - y1, Math.abs(2 * s)) * RTOD;
}

/** e_teralign(h,s#=1.): RotateEntity h,pitch#,0,roll# */
export function e_teralign(ter: Pick<Terrain, 'tery'>, h: THREE.Object3D, s = 1): void {
	const x = h.position.x;
	const z = h.position.z;
	const pitch = e_terpitch(ter, x, z, s);
	const roll = e_terroll(ter, x, z, s);
	rotateEntity(h, pitch, 0, roll);
}

/**
 * e_gc(h,add#): ground collision. The original returns on its first line
 * ("DEBUG / Return / DEBUG"), so it does nothing; the unreachable body was:
 *   y#=TerrainY(ter,EntityX(h),0,EntityZ(h))
 *   If y#<ter_groundy#+add# Then y#=ter_groundy#
 *   If EntityY(h)<y#+add# Then PositionEntity h,EntityX(h),y#+add#,EntityZ(h)
 */
export function e_gc(_h: THREE.Object3D, _add: number): void {
	return;
}

/**
 * The colour e_terrainground gives env_ground: ReadPixelFast(0,0) of the
 * colormap, each channel times 0.85 (EntityColor takes floats).
 */
export function groundColor(colormap: Uint8Array): [number, number, number] {
	return [
		Math.fround(colormap[0] * 0.85),
		Math.fround(colormap[1] * 0.85),
		Math.fround(colormap[2] * 0.85)
	];
}
