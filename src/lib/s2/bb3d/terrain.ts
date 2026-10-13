/**
 * The render side of a Blitz terrain (blitz3d/terrainrep.cpp), on top of the
 * exact height / collision port in engine/collision/terrainCollider.ts.
 *
 * The mesh is in terrain-local space, as Blitz's is: vertex (x, height, z)
 * with x,z in grid cells 0..S and height 0..1; the entity transform
 * (ScaleEntity ter,64,3200,64 : PositionEntity ...) does the rest.
 * Texture coordinates are (x, S - z) and the normals those of
 * TerrainRep::getNormal when TerrainShading is on, straight up otherwise.
 *
 * Not reproduced: Blitz renders a view dependent level-of-detail mesh
 * (TerrainDetail, vertex morphing). Here every cell is always drawn with the
 * two triangles of the finest level, which is also the surface picks and
 * collisions use.
 */
import * as THREE from 'three';
import { Brush } from '../engine/anim/brush';
import type { MeshRep } from '../engine/anim/entity';
import { toThreeWinding } from '../engine/blitzSpace';
import { TerrainCollider } from '../engine/collision/terrainCollider';

export class TerrainState {
	readonly rep: MeshRep;
	/** TerrainShading */
	shading = false;
	/** TerrainDetail detail_level, morph (stored only) */
	detail = 0;
	morph = true;
	private positions: Float32Array;
	private normals: Float32Array;
	/** Dirty grid rectangle (inclusive), or x0 > x1 when clean. */
	private x0 = 1;
	private x1 = 0;
	private z0 = 1;
	private z1 = 0;
	private all = true;
	/** Set by an owner that renders the terrain itself (adopted engine/terrain.ts Terrain). */
	onModified: (() => void) | null = null;

	constructor(readonly collider: TerrainCollider) {
		const S = collider.size;
		const n = S + 1;
		this.positions = new Float32Array(n * n * 3);
		this.normals = new Float32Array(n * n * 3);
		const uvs = new Float32Array(n * n * 2);
		for (let x = 0; x < n; x++) {
			for (let z = 0; z < n; z++) {
				const i = x * n + z;
				this.positions[i * 3] = x;
				this.positions[i * 3 + 2] = z;
				// float tex_coords[2][2]={ {v.x,cell_size-v.z},{v.x,cell_size-v.z} };
				uvs[i * 2] = x;
				uvs[i * 2 + 1] = S - z;
			}
		}
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
		geometry.setAttribute('normal', new THREE.BufferAttribute(this.normals, 3));
		const uv = new THREE.BufferAttribute(uvs, 2);
		geometry.setAttribute('uv', uv);
		geometry.setAttribute('uv1', uv);
		// Full-detail triangles of the binary triangle tree, in Blitz winding.
		const index = toThreeWinding(collider.leafTriangles().slice());
		geometry.setIndex(new THREE.BufferAttribute(index, 1));
		geometry.addGroup(0, index.length, 0);
		const box = new THREE.Box3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(S, 1, S));
		geometry.boundingBox = box.clone();
		geometry.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
		this.rep = { geometry, surfaces: [new Brush()], box, hasColors: false };
		this.update();
	}

	get size(): number {
		return this.collider.size;
	}

	/** Terrain::setHeight (ModifyTerrain): ignored outside 0..S; x==S / z==S alias 0. */
	setHeight(x: number, z: number, h: number): void {
		const S = this.collider.size;
		if (!(x >= 0 && z >= 0 && x <= S && z <= S)) return;
		this.collider.setHeight(x, z, h);
		this.markDirty(x, z);
		// The cell is shared by the opposite edge.
		if (x === 0 || x === S) this.markDirty(x === 0 ? S : 0, z);
		if (z === 0 || z === S) this.markDirty(x, z === 0 ? S : 0);
		if ((x === 0 || x === S) && (z === 0 || z === S)) this.markDirty(x === 0 ? S : 0, z === 0 ? S : 0);
		this.onModified?.();
	}

	private markDirty(x: number, z: number): void {
		if (this.x0 > this.x1) {
			this.x0 = this.x1 = x;
			this.z0 = this.z1 = z;
		} else if (!this.all) {
			if (x < this.x0 || x > this.x1 || z < this.z0 || z > this.z1) {
				// Edits far apart (the wrapped edge): give up on a rectangle.
				const grown = (Math.max(this.x1, x) - Math.min(this.x0, x) + 1) * (Math.max(this.z1, z) - Math.min(this.z0, z) + 1);
				if (grown > 4096) this.all = true;
				this.x0 = Math.min(this.x0, x);
				this.x1 = Math.max(this.x1, x);
				this.z0 = Math.min(this.z0, z);
				this.z1 = Math.max(this.z1, z);
			}
		}
	}

	setShading(enable: boolean): void {
		if (this.shading === enable) return;
		this.shading = enable;
		this.all = true;
		this.x0 = 0;
		this.x1 = 0;
	}

	get dirty(): boolean {
		return this.all || this.x0 <= this.x1;
	}

	/** Brings the render mesh up to date with the heights. Returns true when something changed. */
	update(): boolean {
		if (!this.dirty) return false;
		const c = this.collider;
		const S = c.size;
		const n = S + 1;
		let x0 = 0,
			x1 = S,
			z0 = 0,
			z1 = S;
		if (!this.all) {
			// One ring more: the normals of the neighbours depend on the changed heights.
			x0 = Math.max(0, this.x0 - 1);
			x1 = Math.min(S, this.x1 + 1);
			z0 = Math.max(0, this.z0 - 1);
			z1 = Math.min(S, this.z1 + 1);
		}
		const pos = this.positions;
		const nrm = this.normals;
		for (let x = x0; x <= x1; x++) {
			for (let z = z0; z <= z1; z++) {
				const i = (x * n + z) * 3;
				const ht = c.repHeight(x, z);
				pos[i + 1] = ht;
				if (!this.shading) {
					nrm[i] = 0;
					nrm[i + 1] = 1;
					nrm[i + 2] = 0;
					continue;
				}
				// TerrainRep::getNormal: the four triangles around the vertex,
				// Plane( vt,v1,v0 ).n + Plane( vt,v2,v1 ).n + Plane( vt,v3,v2 ).n + Plane( vt,v0,v3 ).n
				const a = c.repHeight(x, z - 1) - ht; // v0
				const b = c.repHeight(x + 1, z) - ht; // v1
				const d = c.repHeight(x, z + 1) - ht; // v2
				const e = c.repHeight(x - 1, z) - ht; // v3
				let nx = 0,
					ny = 0,
					nz = 0,
					l: number;
				// (1,b,0) x (0,a,-1)
				l = Math.sqrt(b * b + 1 + a * a);
				nx += -b / l;
				ny += 1 / l;
				nz += a / l;
				// (0,d,1) x (1,b,0)
				l = Math.sqrt(b * b + 1 + d * d);
				nx += -b / l;
				ny += 1 / l;
				nz += -d / l;
				// (-1,e,0) x (0,d,1)
				l = Math.sqrt(e * e + 1 + d * d);
				nx += e / l;
				ny += 1 / l;
				nz += -d / l;
				// (0,a,-1) x (-1,e,0)
				l = Math.sqrt(e * e + 1 + a * a);
				nx += e / l;
				ny += 1 / l;
				nz += a / l;
				l = Math.sqrt(nx * nx + ny * ny + nz * nz);
				nrm[i] = nx / l;
				nrm[i + 1] = ny / l;
				nrm[i + 2] = nz / l;
			}
		}
		const geo = this.rep.geometry;
		(geo.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
		(geo.getAttribute('normal') as THREE.BufferAttribute).needsUpdate = true;
		this.all = false;
		this.x0 = 1;
		this.x1 = 0;
		return true;
	}
}
