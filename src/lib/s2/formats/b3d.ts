import { BinaryReader } from '../io/BinaryReader';

/**
 * Parser for Blitz3D .b3d model files (chunked binary format).
 * Produces plain data in Blitz conventions: left-handed coordinates,
 * clockwise front faces, quaternions as (w, x, y, z) in Blitz's
 * conjugate convention. Conversion to Three.js happens in the engine layer.
 */

export interface B3dTexture {
	file: string;
	/** 1 color, 2 alpha, 4 masked, 8 mipmap, 16 clamp U, 32 clamp V, 64 sphere map, 128 cube map */
	flags: number;
	/** 1 alpha, 2 multiply, 3 add */
	blend: number;
	x: number;
	y: number;
	scaleX: number;
	scaleY: number;
	rotation: number;
}

export interface B3dBrush {
	name: string;
	r: number;
	g: number;
	b: number;
	a: number;
	shininess: number;
	blend: number;
	/** 1 full-bright, 2 vertex colors, 4 flat shaded, 8 no fog, 16 two-sided, 32 vertex alpha */
	fx: number;
	textures: number[];
}

export interface B3dSurface {
	brush: number;
	indices: Uint32Array;
}

export interface B3dMesh {
	brush: number;
	vertexCount: number;
	positions: Float32Array;
	normals?: Float32Array;
	colors?: Float32Array;
	/** One array per texture coordinate set, each with `texCoordSize` components per vertex. */
	texCoords: Float32Array[];
	texCoordSize: number;
	surfaces: B3dSurface[];
}

export interface B3dKey {
	frame: number;
	position?: [number, number, number];
	scale?: [number, number, number];
	/** w, x, y, z */
	rotation?: [number, number, number, number];
}

export interface B3dAnim {
	flags: number;
	frames: number;
	fps: number;
}

export interface B3dNode {
	name: string;
	position: [number, number, number];
	scale: [number, number, number];
	/** w, x, y, z */
	rotation: [number, number, number, number];
	mesh?: B3dMesh;
	/** Present when the node is a bone: flat pairs of (vertex index, weight). */
	bone?: { vertices: Uint32Array; weights: Float32Array };
	keys: B3dKey[];
	anim?: B3dAnim;
	children: B3dNode[];
}

export interface B3dModel {
	version: number;
	textures: B3dTexture[];
	brushes: B3dBrush[];
	root?: B3dNode;
}

export class B3dFormatError extends Error {}

export function parseB3d(data: Uint8Array): B3dModel {
	const r = new BinaryReader(data);
	const tag = chunkTag(r);
	const size = r.int();
	if (tag !== 'BB3D') throw new B3dFormatError(`Not a B3D file (tag "${tag}")`);
	const end = Math.min(r.pos + size, r.length);
	const model: B3dModel = { version: r.int(), textures: [], brushes: [] };

	while (r.pos + 8 <= end) {
		const t = chunkTag(r);
		const len = r.int();
		const chunkEnd = r.pos + len;
		if (t === 'TEXS') {
			while (r.pos < chunkEnd) {
				model.textures.push({
					file: r.cstring(),
					flags: r.int(),
					blend: r.int(),
					x: r.float(),
					y: r.float(),
					scaleX: r.float(),
					scaleY: r.float(),
					rotation: r.float()
				});
			}
		} else if (t === 'BRUS') {
			const nTexs = r.int();
			while (r.pos < chunkEnd) {
				const brush: B3dBrush = {
					name: r.cstring(),
					r: r.float(),
					g: r.float(),
					b: r.float(),
					a: r.float(),
					shininess: r.float(),
					blend: r.int(),
					fx: r.int(),
					textures: []
				};
				for (let i = 0; i < nTexs; i++) brush.textures.push(r.int());
				model.brushes.push(brush);
			}
		} else if (t === 'NODE') {
			model.root = readNode(r, chunkEnd);
		}
		r.pos = chunkEnd;
	}
	return model;
}

function chunkTag(r: BinaryReader): string {
	return String.fromCharCode(...r.take(4));
}

function readNode(r: BinaryReader, end: number): B3dNode {
	const node: B3dNode = {
		name: r.cstring(),
		position: [r.float(), r.float(), r.float()],
		scale: [r.float(), r.float(), r.float()],
		rotation: [r.float(), r.float(), r.float(), r.float()],
		keys: [],
		children: []
	};
	while (r.pos + 8 <= end) {
		const t = chunkTag(r);
		const len = r.int();
		const chunkEnd = r.pos + len;
		switch (t) {
			case 'MESH':
				node.mesh = readMesh(r, chunkEnd);
				break;
			case 'BONE': {
				const n = Math.floor(len / 8);
				const vertices = new Uint32Array(n);
				const weights = new Float32Array(n);
				for (let i = 0; i < n; i++) {
					vertices[i] = r.int();
					weights[i] = r.float();
				}
				node.bone = { vertices, weights };
				break;
			}
			case 'KEYS': {
				const flags = r.int();
				while (r.pos < chunkEnd) {
					const key: B3dKey = { frame: r.int() };
					if (flags & 1) key.position = [r.float(), r.float(), r.float()];
					if (flags & 2) key.scale = [r.float(), r.float(), r.float()];
					if (flags & 4) key.rotation = [r.float(), r.float(), r.float(), r.float()];
					node.keys.push(key);
				}
				break;
			}
			case 'ANIM':
				node.anim = { flags: r.int(), frames: r.int(), fps: r.float() };
				break;
			case 'NODE':
				node.children.push(readNode(r, chunkEnd));
				break;
		}
		r.pos = chunkEnd;
	}
	return node;
}

function readMesh(r: BinaryReader, end: number): B3dMesh {
	const mesh: B3dMesh = {
		brush: r.int(),
		vertexCount: 0,
		positions: new Float32Array(0),
		texCoords: [],
		texCoordSize: 0,
		surfaces: []
	};
	while (r.pos + 8 <= end) {
		const t = chunkTag(r);
		const len = r.int();
		const chunkEnd = r.pos + len;
		if (t === 'VRTS') {
			const flags = r.int();
			const sets = r.int();
			const size = r.int();
			const stride = 3 + (flags & 1 ? 3 : 0) + (flags & 2 ? 4 : 0) + sets * size;
			const count = Math.floor((len - 12) / (stride * 4));
			mesh.vertexCount = count;
			mesh.texCoordSize = size;
			mesh.positions = new Float32Array(count * 3);
			if (flags & 1) mesh.normals = new Float32Array(count * 3);
			if (flags & 2) mesh.colors = new Float32Array(count * 4);
			for (let s = 0; s < sets; s++) mesh.texCoords.push(new Float32Array(count * size));
			for (let v = 0; v < count; v++) {
				for (let k = 0; k < 3; k++) mesh.positions[v * 3 + k] = r.float();
				if (mesh.normals) for (let k = 0; k < 3; k++) mesh.normals[v * 3 + k] = r.float();
				if (mesh.colors) for (let k = 0; k < 4; k++) mesh.colors[v * 4 + k] = r.float();
				for (let s = 0; s < sets; s++) {
					for (let k = 0; k < size; k++) mesh.texCoords[s][v * size + k] = r.float();
				}
			}
		} else if (t === 'TRIS') {
			const brush = r.int();
			const n = Math.floor((len - 4) / 4);
			const indices = new Uint32Array(n);
			for (let i = 0; i < n; i++) indices[i] = r.int();
			mesh.surfaces.push({ brush, indices });
		}
		r.pos = chunkEnd;
	}
	return mesh;
}
