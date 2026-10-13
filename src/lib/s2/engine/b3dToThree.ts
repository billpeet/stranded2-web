import * as THREE from 'three';
import { parseB3d, type B3dModel } from '../formats/b3d';
import { normalizePath, type Vfs } from '../io/Vfs';
import { Brush } from './anim/brush';
import {
	buildCollapsedRep,
	createAnimMesh,
	createMeshEntity,
	modelBrushes,
	type MeshRep
} from './anim/entity';
import type { BlitzTexture } from './textures';

export {
	BLEND_ADD,
	BLEND_ALPHA,
	BLEND_MULTIPLY,
	BLEND_REPLACE,
	Brush,
	FX_FLATSHADED,
	FX_FULLBRIGHT,
	FX_NOFOG,
	FX_TWOSIDED,
	FX_VERTEXALPHA,
	FX_VERTEXCOLOR,
	brushMaterial
} from './anim/brush';
export * from './anim/entity';
export {
	ANIM_MODE_LOOP,
	ANIM_MODE_ONESHOT,
	ANIM_MODE_PINGPONG,
	ANIM_MODE_STOP,
	Animator
} from './anim/Animator';
export { Animation } from './anim/Animation';

/**
 * Entity-level render state given when a model is instantiated: what
 * EntityColor, EntityAlpha, EntityFX, EntityShininess and EntityBlend would
 * set on the new entity. Blitz combines it with each surface's brush:
 * colours and alpha multiply, FX flags are OR-ed, shininess adds, and a
 * non-zero blend replaces the surface's.
 */
export interface EntityBrush {
	color?: [number, number, number]; // 0..255
	alpha?: number;
	fx?: number;
	shininess?: number;
	blend?: number;
}

function toBrush(e: EntityBrush): Brush {
	const b = new Brush();
	if (e.color) {
		b.r = e.color[0] / 255;
		b.g = e.color[1] / 255;
		b.b = e.color[2] / 255;
	}
	if (e.alpha !== undefined) b.alpha = e.alpha;
	if (e.fx !== undefined) b.fx = e.fx;
	if (e.shininess !== undefined) b.shininess = e.shininess;
	if (e.blend !== undefined) b.blend = e.blend;
	return b;
}

/**
 * A model loaded with LoadMesh: the whole file collapsed into one mesh.
 * Instances (CopyEntity) share geometry and materials.
 */
export class MeshTemplate {
	constructor(
		readonly path: string,
		readonly rep: MeshRep,
		/** Bounding box of the whole model in model space (MeshWidth/Height/Depth). */
		readonly bounds: THREE.Box3
	) {}

	/**
	 * A new entity of this mesh. The entity commands of anim/entity.ts
	 * (entityColor, entityAlpha, entityTexture, entityAutoFade ...) work on it.
	 */
	instantiate(entity: EntityBrush = {}): THREE.Mesh {
		return createMeshEntity(this.rep, toBrush(entity));
	}
}

/** What the model loader needs from the texture cache (TextureCache fits). */
export interface TextureSource {
	load(path: string, flags?: number, filterName?: string): Promise<BlitzTexture | undefined>;
}

interface LoadedModel {
	model: B3dModel;
	brushes: Brush[];
}

/** LoadMesh / LoadAnimMesh for .b3d files, with caching of everything shareable. */
export class MeshCache {
	private files = new Map<string, Promise<LoadedModel>>();
	private cache = new Map<string, Promise<MeshTemplate>>();

	constructor(
		private vfs: Vfs,
		private textures: TextureSource
	) {}

	/** LoadMesh as a template; see MeshTemplate.instantiate. */
	load(path: string): Promise<MeshTemplate> {
		const key = normalizePath(path);
		let p = this.cache.get(key);
		if (!p) {
			p = this.loadFile(path).then(({ model, brushes }) => {
				const rep = buildCollapsedRep(model, brushes);
				return new MeshTemplate(path, rep, rep.box.clone());
			});
			this.cache.set(key, p);
		}
		return p;
	}

	/**
	 * LoadAnimMesh( file$ ): a new entity tree each call, with the hierarchy,
	 * bones and animation of the file. Use copyEntity for further instances
	 * and the functions of anim/entity.ts to animate it.
	 */
	async loadAnimMesh(path: string): Promise<THREE.Object3D> {
		const { model, brushes } = await this.loadFile(path);
		return createAnimMesh(model, brushes);
	}

	/** The parsed file behind load/loadAnimMesh (cached). */
	async loadModel(path: string): Promise<B3dModel> {
		return (await this.loadFile(path)).model;
	}

	private loadFile(path: string): Promise<LoadedModel> {
		const key = normalizePath(path);
		let p = this.files.get(key);
		if (!p) {
			p = this.loadFileUncached(path);
			this.files.set(key, p);
		}
		return p;
	}

	private async loadFileUncached(path: string): Promise<LoadedModel> {
		const model = parseB3d(await this.vfs.readBytes(path));
		const dir = normalizePath(path).split('/').slice(0, -1).join('/');

		// blitz3d/cachedtexture.cpp: a texture is looked for next to the model
		// first (file name only), then under its name as stored. The stored
		// name is what TextureFilter rules are matched against, and only the
		// low 16 flag bits are texture flags (loader_b3d.cpp readTextures).
		const images = await Promise.all(
			model.textures.map((t) => {
				const name = t.file.startsWith('.\\') ? t.file.substring(2) : t.file;
				const base = name.replaceAll('\\', '/').split('/').pop() ?? name;
				const local = dir ? `${dir}/${base}` : base;
				const file = this.vfs.exists(local) ? local : name;
				return this.textures.load(file, t.flags & 0xffff, t.file);
			})
		);
		return { model, brushes: modelBrushes(model, images) };
	}
}
