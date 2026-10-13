import * as THREE from 'three';
import { toThreeWinding } from './blitzSpace';
import { TerrainCollider } from './collision/terrainCollider';

/** Constants from includes/load_const.bb */
export const Cworld_size = 64;
export const Cworld_height = 3200;

/**
 * The map terrain. Ported from e_terrain()/e_tery() in
 * includes/e_environment.bb, on top of the Blitz3D terrain port in
 * collision/terrainCollider.ts.
 *
 * `heights` are the 0..1 samples of a map file on a (size+1)^2 grid,
 * column-major (index = x*(size+1) + z). Blitz3D stores them as wrapped
 * size*size bytes, so what is rendered and queried is the quantised,
 * wrapped surface the collider holds, not the raw file values.
 */
export class Terrain {
	readonly mesh: THREE.Mesh;
	readonly collider: TerrainCollider;
	/** World-space offset of grid cell (0,0): -(Cworld_size*size/2) */
	readonly origin: number;
	/** ter_groundy: terrain height at the map corner, used as the floor for e_tery. */
	groundY = 0;

	constructor(
		readonly size: number,
		readonly heights: Float32Array,
		material: THREE.Material
	) {
		this.origin = -(Cworld_size * size) / 2;
		this.collider = TerrainCollider.fromMapHeights(size, heights);
		const geo = new THREE.BufferGeometry();
		this.mesh = new THREE.Mesh(geo, material);
		this.mesh.name = 'terrain';
		this.rebuild();
		// ter_groundy=TerrainY(ter,-((ter_size/2)*Cworld_size),0,-((ter_size/2)*Cworld_size))
		this.groundY = this.terrainY(this.origin, this.origin);
	}

	/** Rebuilds the render mesh from the collider's heights (after ModifyTerrain). */
	rebuild(): void {
		const size = this.size;
		const n = size + 1;
		const positions = new Float32Array(n * n * 3);
		const uvs = new Float32Array(n * n * 2);
		for (let x = 0; x < n; x++) {
			for (let z = 0; z < n; z++) {
				const i = x * n + z;
				positions[i * 3] = this.origin + x * Cworld_size;
				positions[i * 3 + 1] = this.collider.repHeight(x, z) * Cworld_height - Cworld_height / 2;
				positions[i * 3 + 2] = this.origin + z * Cworld_size;
				// Unscaled terrain texture coordinates are grid coordinates;
				// materials divide as ScaleTexture did.
				uvs[i * 2] = x;
				uvs[i * 2 + 1] = z;
			}
		}
		// Full-detail triangles of Blitz's binary triangle tree, in Blitz winding.
		const index = this.collider.leafTriangles().slice();
		const geo = this.mesh.geometry;
		geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
		geo.setIndex(new THREE.BufferAttribute(index, 1));
		geo.computeVertexNormals(); // TerrainShading; computed in Blitz winding, see b3dToThree
		toThreeWinding(index);
		geo.computeBoundingSphere();
		geo.computeBoundingBox();
	}

	/**
	 * TerrainY(ter, x, 0, z) in world units: bilinear over the wrapped 8-bit
	 * heights, with no clamping at the map edge (outside the map it falls to
	 * the terrain base at -Cworld_height/2), as bbblitz3d.cpp terrainVector does.
	 */
	terrainY(wx: number, wz: number): number {
		const lx = Math.fround((wx - this.origin) / Cworld_size);
		const lz = Math.fround((wz - this.origin) / Cworld_size);
		return Math.fround(this.collider.terrainHeight(lx, lz) * Cworld_height - Cworld_height / 2);
	}

	/** e_tery(): terrain height, never below the ground level. */
	tery(x: number, z: number): number {
		const y = this.terrainY(x, z);
		return y < this.groundY ? this.groundY : y;
	}
}

/**
 * Builds the terrain colour texture from a map's colormap
 * (column-major RGB; pixel x runs along world X and pixel y along world Z).
 */
export function colormapTexture(colormap: Uint8Array, size: number): THREE.DataTexture {
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
	const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
	tex.colorSpace = THREE.NoColorSpace;
	tex.magFilter = THREE.LinearFilter;
	tex.minFilter = THREE.LinearMipmapLinearFilter;
	tex.generateMipmaps = true;
	tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
	tex.needsUpdate = true;
	return tex;
}

/**
 * Terrain material for the "set_terrain=2" quality mode of e_terrain():
 * entity colour 120, colour map on layer 0, then the dirt and structure
 * detail textures on layers 1 and 2, both with TextureBlend 5 (multiply 2x).
 */
export function terrainMaterial(
	terSize: number,
	colormap: THREE.Texture,
	dirt?: THREE.Texture,
	structure?: THREE.Texture
): THREE.MeshLambertMaterial {
	const mat = new THREE.MeshLambertMaterial({ color: new THREE.Color(120 / 255, 120 / 255, 120 / 255) });
	mat.map = colormap;
	const uniforms = {
		uTerSize: { value: terSize },
		uDirt: { value: dirt ?? null },
		uStruc: { value: structure ?? null }
	};
	mat.defines = { USE_DIRT: dirt ? 1 : 0, USE_STRUC: structure ? 1 : 0 };
	mat.onBeforeCompile = (shader) => {
		Object.assign(shader.uniforms, uniforms);
		shader.vertexShader = shader.vertexShader
			.replace('#include <common>', '#include <common>\nvarying vec2 vGridUv;\nuniform float uTerSize;')
			.replace(
				'#include <uv_vertex>',
				'#include <uv_vertex>\nvGridUv = uv;\n#ifdef USE_MAP\nvMapUv = uv / uTerSize;\n#endif'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'#include <common>',
				'#include <common>\nvarying vec2 vGridUv;\nuniform sampler2D uDirt;\nuniform sampler2D uStruc;'
			)
			.replace(
				'#include <map_fragment>',
				`#include <map_fragment>
				#if USE_DIRT == 1
					diffuseColor.rgb *= texture2D(uDirt, vGridUv / 0.5).rgb * 2.0; // ScaleTexture 0.5
				#endif
				#if USE_STRUC == 1
					diffuseColor.rgb *= texture2D(uStruc, vGridUv / 2.0).rgb * 2.0; // ScaleTexture 2
				#endif`
			);
	};
	return mat;
}
