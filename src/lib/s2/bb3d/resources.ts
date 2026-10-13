/**
 * Synchronous resources for bb3d.
 *
 * Blitz loads files synchronously; a browser cannot. `Resources.preload`
 * fetches and decodes models and images up front (asynchronously); afterwards
 * LoadMesh, LoadAnimMesh, LoadTexture and CopyEntity are synchronous and a
 * file that was not preloaded behaves like a missing file (the command
 * returns null, as Blitz returns 0).
 */
import { Brush } from '../engine/anim/brush';
import { buildCollapsedRep, modelBrushes, type MeshRep } from '../engine/anim/entity';
import { imageHasAlphaFormat } from '../engine/textures';
import { parseB3d, type B3dModel } from '../formats/b3d';
import { decodeBmp, isBmp } from '../gfx2d/bmp';
import { normalizePath, type Vfs } from '../io/Vfs';
import type { DecodedPixels, TextureManager } from './texture';

/** Decodes an image file. Return undefined for formats that cannot be decoded. */
export type ImageDecoder = (bytes: Uint8Array, path: string) => Promise<DecodedPixels | ImageBitmap | undefined>;

interface ImageEntry {
	width: number;
	height: number;
	alphaFormat: boolean;
	/** Either the decoded pixels or a bitmap they are read from on demand. */
	data?: Uint8Array;
	bitmap?: ImageBitmap;
}

interface LoadedModel {
	model: B3dModel;
	brushes?: Brush[];
	collapsed?: MeshRep;
}

const IMAGE_EXT = new Set(['bmp', 'jpg', 'jpeg', 'png', 'tga', 'gif']);
const MODEL_EXT = new Set(['b3d']);

function extOf(path: string): string {
	const n = path.lastIndexOf('.');
	return n < 0 ? '' : path.substring(n + 1).toLowerCase();
}

/** The default decoder: BMP in script, everything else through createImageBitmap when there is one. */
export const defaultImageDecoder: ImageDecoder = async (bytes) => {
	if (typeof createImageBitmap !== 'undefined') {
		try {
			return await createImageBitmap(new Blob([bytes as BlobPart]), {
				premultiplyAlpha: 'none',
				colorSpaceConversion: 'none'
			});
		} catch {
			// fall through to the BMP decoder
		}
	}
	if (isBmp(bytes)) {
		const d = decodeBmp(bytes);
		return {
			width: d.width,
			height: d.height,
			data: new Uint8Array(d.px.buffer, d.px.byteOffset, d.px.byteLength).slice(),
			alphaFormat: imageHasAlphaFormat(bytes)
		};
	}
	return undefined;
};

/**
 * Reads the pixels of an ImageBitmap without premultiplying them: a WebGL
 * framebuffer read-back (a 2D canvas stores premultiplied pixels and would
 * lose the colour of transparent texels, which texture filtering bleeds into
 * the edges). Falls back to a 2D canvas when there is no WebGL 2.
 */
class BitmapReader {
	private gl: WebGL2RenderingContext | null | undefined;
	private tex: WebGLTexture | null = null;
	private fb: WebGLFramebuffer | null = null;
	private c2d: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;

	read(bitmap: ImageBitmap): Uint8Array {
		const w = bitmap.width;
		const h = bitmap.height;
		const out = new Uint8Array(w * h * 4);
		if (this.gl === undefined) {
			try {
				const canvas =
					typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
				this.gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false, antialias: false }) as
					| WebGL2RenderingContext
					| null;
			} catch {
				this.gl = null;
			}
			if (this.gl) {
				this.tex = this.gl.createTexture();
				this.fb = this.gl.createFramebuffer();
			}
		}
		const gl = this.gl;
		if (gl && !gl.isContextLost() && w <= gl.getParameter(gl.MAX_TEXTURE_SIZE) && h <= gl.getParameter(gl.MAX_TEXTURE_SIZE)) {
			gl.bindTexture(gl.TEXTURE_2D, this.tex);
			gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
			gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
			gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
			gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bitmap);
			gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
			if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
				gl.pixelStorei(gl.PACK_ALIGNMENT, 1);
				gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, out);
				return out;
			}
		}
		if (!this.c2d) {
			const canvas =
				typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
			this.c2d = canvas.getContext('2d', { willReadFrequently: true }) as
				| OffscreenCanvasRenderingContext2D
				| CanvasRenderingContext2D
				| null;
		}
		const c = this.c2d;
		if (!c) return out;
		c.canvas.width = w;
		c.canvas.height = h;
		c.clearRect(0, 0, w, h);
		c.drawImage(bitmap, 0, 0);
		out.set(c.getImageData(0, 0, w, h).data);
		return out;
	}
}

export class Resources {
	private models = new Map<string, LoadedModel>();
	private images = new Map<string, ImageEntry>();
	private pending = new Map<string, Promise<void>>();
	private reader = new BitmapReader();
	/** Files that were asked for synchronously but had not been preloaded (for diagnostics). */
	readonly missed = new Set<string>();

	constructor(
		readonly vfs: Vfs | null,
		private decoder: ImageDecoder = defaultImageDecoder,
		private manifestUrl = '/game/manifest.json'
	) {}

	exists(path: string): boolean {
		return !!this.vfs && this.vfs.exists(path);
	}

	/** Every file of the mod: `vfs.all()` when the Vfs has it, else the asset manifest. */
	async allFiles(): Promise<string[]> {
		const v = this.vfs as (Vfs & { all?: () => string[] }) | null;
		if (v && typeof v.all === 'function') return v.all();
		const res = await fetch(this.manifestUrl);
		if (!res.ok) throw new Error(`bb3d preload: no file list (${res.status} for ${this.manifestUrl})`);
		const manifest = (await res.json()) as { files: Record<string, string> };
		return Object.values(manifest.files);
	}

	/**
	 * Fetches and decodes the given files (models and images; others are
	 * ignored), or every model and image of the mod for 'all'. Models also
	 * bring in the textures they name.
	 */
	async preload(
		paths: readonly string[] | 'all',
		onProgress?: (done: number, total: number) => void,
		concurrency = 12
	): Promise<void> {
		const all = paths === 'all' ? await this.allFiles() : paths;
		const list = all.filter((p) => IMAGE_EXT.has(extOf(p)) || MODEL_EXT.has(extOf(p)));
		let next = 0;
		let done = 0;
		const worker = async () => {
			while (next < list.length) {
				const p = list[next++];
				await this.ensureLoaded(p);
				onProgress?.(++done, list.length);
			}
		};
		await Promise.all(Array.from({ length: Math.min(concurrency, list.length) }, worker));
	}

	/** Makes one file (and, for a model, its textures) available to the synchronous loaders. */
	ensureLoaded(path: string): Promise<void> {
		const key = normalizePath(path);
		let p = this.pending.get(key);
		if (!p) {
			p = this.loadFile(path, key).catch((e) => {
				console.warn(`bb3d: unable to load ${path}:`, e);
			});
			this.pending.set(key, p);
		}
		return p;
	}

	private async loadFile(path: string, key: string): Promise<void> {
		if (!this.vfs || !this.vfs.exists(path)) return;
		const ext = extOf(key);
		if (MODEL_EXT.has(ext)) {
			const model = parseB3d(await this.vfs.readBytes(path));
			this.models.set(key, { model });
			const dir = key.split('/').slice(0, -1).join('/');
			await Promise.all(
				model.textures.map(async (t) => {
					for (const c of textureCandidates(t.file, dir)) await this.ensureLoaded(c);
				})
			);
		} else if (IMAGE_EXT.has(ext)) {
			const bytes = await this.vfs.readBytes(path);
			const d = await this.decoder(bytes, path);
			if (!d) return;
			if ('data' in d) {
				this.images.set(key, { width: d.width, height: d.height, alphaFormat: d.alphaFormat, data: d.data });
			} else {
				this.images.set(key, {
					width: d.width,
					height: d.height,
					alphaFormat: imageHasAlphaFormat(bytes),
					bitmap: d
				});
			}
		}
	}

	/** Registers decoded pixels under a path (tests, generated images, map attachments). */
	addImage(path: string, image: DecodedPixels): void {
		this.images.set(normalizePath(path), { ...image });
	}

	/** Registers a parsed model under a path. */
	addModel(path: string, model: B3dModel): void {
		this.models.set(normalizePath(path), { model });
	}

	/**
	 * True when the image can be loaded synchronously. A file that exists but
	 * was not preloaded counts as missing and is noted in `missed`.
	 */
	hasImage(path: string): boolean {
		const key = normalizePath(path);
		if (this.images.has(key)) return true;
		if (this.exists(path)) this.missed.add(key);
		return false;
	}

	/** The pixels of a preloaded image, straight RGBA (a fresh array on each call for bitmaps). */
	pixels(path: string): DecodedPixels | undefined {
		const key = normalizePath(path);
		const e = this.images.get(key);
		if (!e) {
			if (this.exists(path)) this.missed.add(key);
			return undefined;
		}
		const data = e.data ?? this.reader.read(e.bitmap!);
		return { width: e.width, height: e.height, data, alphaFormat: e.alphaFormat };
	}

	private entry(path: string): LoadedModel | undefined {
		const key = normalizePath(path);
		const m = this.models.get(key);
		if (!m && this.exists(path)) this.missed.add(key);
		return m;
	}

	/** The parsed .b3d file, or undefined when it does not exist / was not preloaded. */
	model(path: string): B3dModel | undefined {
		return this.entry(path)?.model;
	}

	/**
	 * The brushes of a model file with their textures resolved
	 * (loader_b3d.cpp readTextures / readBrushes), created once per file.
	 */
	brushes(path: string, textures: TextureManager): Brush[] | undefined {
		const e = this.entry(path);
		if (!e) return undefined;
		if (!e.brushes) {
			const dir = normalizePath(path).split('/').slice(0, -1).join('/');
			const images = e.model.textures.map((t) => {
				// Only the low 16 bits are texture flags (readTextures).
				const c = textures.loadCached(t.file, t.flags & 0xffff, 0, 0, 0, 1, dir);
				if (!c) return undefined;
				textures.retain(c);
				return c.frames[0];
			});
			e.brushes = modelBrushes(e.model, images);
		}
		return e.brushes;
	}

	/** LoadMesh geometry: the file collapsed into one mesh, shared by every LoadMesh of the file until edited. */
	collapsed(path: string, textures: TextureManager): MeshRep | undefined {
		const e = this.entry(path);
		if (!e) return undefined;
		if (!e.collapsed) e.collapsed = buildCollapsedRep(e.model, this.brushes(path, textures)!);
		return e.collapsed;
	}
}

/** Where CachedTexture looks for a model's texture: next to the model (file name only), then as stored. */
export function textureCandidates(file: string, dir: string): string[] {
	let f = file;
	if (f.startsWith('.\\') || f.startsWith('./')) f = f.substring(2);
	const base = f.replaceAll('\\', '/').split('/').pop() ?? f;
	const out: string[] = [];
	if (dir) out.push(`${dir}/${base}`);
	out.push(f);
	return out;
}
