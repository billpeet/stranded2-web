/**
 * Blitz3D textures for bb3d: blitz3d/texture.cpp (Texture, texture filters),
 * blitz3d/cachedtexture.cpp (images shared between handles of the same file
 * and flags) and the texture half of gxruntime/ddutil.cpp (loadSurface: alpha
 * and mask generation, power-of-two scaling).
 *
 * Pixels live in CPU memory as RGBA bytes. Every frame is at the same time
 *  - a THREE.DataTexture over those bytes, and
 *  - a gfx2d `Canvas2D` over the same bytes (TextureCanvas), which is what
 *    TextureBuffer() returns. SetBuffer/LockBuffer/WritePixelFast/CopyRect/
 *    DrawBlock of the 2D layer therefore write straight into the texture;
 *    World.render uploads the frames whose `modCount` moved.
 */
import * as THREE from 'three';
import {
	TEX_ALPHA,
	TEX_CLAMP_U,
	TEX_CLAMP_V,
	TEX_COLOR,
	TEX_CUBE,
	TEX_MASKED,
	TEX_MIPMAP,
	TextureHandle,
	applyTextureAlpha,
	type BlitzTexture
} from '../engine/textures';
import { Canvas2D, argbToNative, nativeToArgb } from '../gfx2d/canvas';
import { normalizePath } from '../io/Vfs';

/** A decoded image file: straight (not premultiplied) RGBA, top row first. */
export interface DecodedPixels {
	width: number;
	height: number;
	data: Uint8Array;
	/** ddUtil::loadSurface `trans`: the file format carries alpha (32 bit, or a transparent palette entry). */
	alphaFormat: boolean;
}

/**
 * The 2D buffer of a texture frame (TextureBuffer). A plain Canvas2D except
 * for alpha: gxCanvas writes pixels through the surface's pixel format, so a
 * texture with the alpha or mask flag keeps the alpha byte of the ARGB value
 * it is given and returns it on reads, while any other texture is opaque.
 */
export class TextureCanvas extends Canvas2D {
	constructor(
		w: number,
		h: number,
		readonly bytes: Uint8Array,
		readonly hasAlpha: boolean
	) {
		super(w, h, new Uint32Array(bytes.buffer, bytes.byteOffset, w * h));
	}

	private native(argb: number): number {
		if (!this.hasAlpha) return argbToNative(argb);
		return ((argb & 0xff000000) | ((argb & 0xff) << 16) | (argb & 0xff00) | ((argb >>> 16) & 0xff)) >>> 0;
	}

	private argb(p: number): number {
		if (!this.hasAlpha) return nativeToArgb(p);
		return (p & 0xff000000) | ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff) | 0;
	}

	override setPixel(x: number, y: number, argb: number): void {
		const vp = this.viewport;
		x += this.origin_x;
		if (x < vp.left || x >= vp.right) return;
		y += this.origin_y;
		if (y < vp.top || y >= vp.bottom) return;
		this.px[y * this.width + x] = this.native(argb);
		this.modCount++;
	}

	override setPixelFast(x: number, y: number, argb: number): void {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		this.px[y * this.width + x] = this.native(argb);
		this.modCount++;
	}

	override getPixel(x: number, y: number): number {
		const vp = this.viewport;
		x += this.origin_x;
		if (x < vp.left || x >= vp.right) return this.getMask();
		y += this.origin_y;
		if (y < vp.top || y >= vp.bottom) return this.getMask();
		return this.argb(this.px[y * this.width + x]);
	}

	override getPixelFast(x: number, y: number): number {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
		return this.argb(this.px[y * this.width + x]);
	}
}

/** One frame of a texture: the image a brush layer samples, with its pixels. */
export interface TextureFrame extends BlitzTexture {
	bytes: Uint8Array;
	canvas: TextureCanvas;
	/** canvas.modCount at the last upload. */
	uploaded: number;
	/** Cube maps: the six face canvases (SetCubeFace); `canvas` is the selected one. */
	faces?: TextureCanvas[];
}

/** adjustTexSize of ddutil.cpp: texture dimensions are rounded up to a power of two. */
export function adjustTexSize(n: number): number {
	let w = 1;
	while (w < n) w <<= 1;
	return w;
}

/** Texture::Texture: a masked texture is always colour + alpha. */
export function normalizeTextureFlags(flags: number): number {
	if (flags & TEX_MASKED) flags |= TEX_COLOR | TEX_ALPHA;
	return flags;
}

function makeFrame(w: number, h: number, flags: number, bytes?: Uint8Array): TextureFrame {
	if (!bytes) {
		bytes = new Uint8Array(w * h * 4);
		for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
	}
	const masked = (flags & TEX_MASKED) !== 0;
	const alpha = (flags & TEX_ALPHA) !== 0;
	const texture = new THREE.DataTexture(bytes, w, h, THREE.RGBAFormat, THREE.UnsignedByteType);
	texture.flipY = false; // Blitz UV origin is top-left
	texture.colorSpace = THREE.NoColorSpace;
	texture.wrapS = flags & TEX_CLAMP_U ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
	texture.wrapT = flags & TEX_CLAMP_V ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
	texture.premultiplyAlpha = false;
	texture.magFilter = THREE.LinearFilter;
	if (flags & TEX_MIPMAP) {
		texture.generateMipmaps = true;
		texture.minFilter = THREE.LinearMipmapLinearFilter;
	} else {
		texture.generateMipmaps = false;
		texture.minFilter = THREE.LinearFilter;
	}
	texture.needsUpdate = true;
	const canvas = new TextureCanvas(w, h, bytes, alpha || masked);
	return { texture, flags, transparent: masked || alpha, masked, width: w, height: h, bytes, canvas, uploaded: 0 };
}

/** ddUtil::copy: nearest-neighbour stretch with integer source steps (x*sw/dw). */
function stretch(
	src: Uint8Array,
	srcW: number,
	sx: number,
	sy: number,
	sw: number,
	sh: number,
	dw: number,
	dh: number
): Uint8Array {
	const out = new Uint8Array(dw * dh * 4);
	const s32 = new Uint32Array(src.buffer, src.byteOffset, src.byteLength >> 2);
	const d32 = new Uint32Array(out.buffer);
	for (let y = 0; y < dh; y++) {
		const row = (sy + Math.trunc((y * sh) / dh)) * srcW + sx;
		for (let x = 0; x < dw; x++) d32[y * dw + x] = s32[row + Math.trunc((x * sw) / dw)];
	}
	return out;
}

/** The pixel conversion of ddUtil::loadSurface for the given texture flags (returns a new array). */
function loadSurfacePixels(img: DecodedPixels, flags: number): Uint8Array {
	const data = img.data.slice();
	const masked = (flags & TEX_MASKED) !== 0;
	const alpha = (flags & TEX_ALPHA) !== 0;
	// An alpha-flagged image whose file has an alpha channel is used unchanged.
	if (!(alpha && !masked && img.alphaFormat)) applyTextureAlpha(data, flags);
	return data;
}

/** CachedTexture::Rep: the frames shared by every handle of one (file, flags, w, h, first, count). */
export class CachedTexture {
	refs = 0;
	constructor(
		readonly key: string,
		readonly file: string,
		readonly flags: number,
		readonly frames: TextureFrame[]
	) {}
}

/**
 * Texture::Rep: the state a Blitz texture handle refers to. Handles are
 * reference counted values in Blitz: a brush keeps the Rep, so ScaleTexture,
 * TextureBlend ... on the handle show on every entity already textured.
 */
export class TextureRep {
	/** One TextureHandle per frame; blend, coords and transform are kept identical on all of them. */
	readonly handles: TextureHandle[];
	constructor(
		readonly cached: CachedTexture,
		handles?: TextureHandle[]
	) {
		this.handles = handles ?? cached.frames.map((f) => new TextureHandle(f));
		for (const h of this.handles) repOfHandle.set(h, this);
	}
}

const repOfHandle = new WeakMap<TextureHandle, TextureRep>();

/** A Blitz texture handle (what LoadTexture and CreateTexture return). */
export class Texture {
	freed = false;
	constructor(readonly rep: TextureRep) {
		rep.cached.refs++;
	}
	get frames(): TextureFrame[] {
		return this.rep.cached.frames;
	}
	get flags(): number {
		return this.rep.cached.flags;
	}
	/** The per-frame object a Brush layer stores. */
	handle(frame: number): TextureHandle | undefined {
		return this.rep.handles[frame];
	}
}

interface Filter {
	t: string;
	flags: number;
}

/** Looks an image file up; undefined when it does not exist or could not be decoded. */
export type PixelSource = (path: string) => DecodedPixels | undefined;

/** The texture state of a World: filters, the CachedTexture set, the frames with live 2D buffers. */
export class TextureManager {
	private filters: Filter[] = [];
	private cache = new Map<string, CachedTexture>();
	private anon = 0;
	/** Frames whose canvas was handed out by TextureBuffer: checked for changes before each render. */
	readonly buffered = new Set<TextureFrame>();

	constructor(
		private pixels: PixelSource,
		private exists: (path: string) => boolean
	) {
		this.clearFilters();
		// blitz3d_open: Texture::addFilter( "",CANVAS_TEX_RGB|CANVAS_TEX_MIPMAP )
		this.addFilter('', TEX_COLOR | TEX_MIPMAP);
	}

	/** ClearTextureFilters */
	clearFilters(): void {
		this.filters = [];
	}

	/** TextureFilter match_text$,flags */
	addFilter(t: string, flags: number): void {
		this.filters.push({ t: t.toLowerCase(), flags });
	}

	/** static int filterFile( const string &t,int flags ) */
	filterFile(t: string, flags: number): number {
		const l = t.toLowerCase();
		for (const f of this.filters) if (l.includes(f.t)) flags |= f.flags;
		return flags;
	}

	/** active_texs */
	get active(): number {
		return this.cache.size;
	}

	/** Texture( w,h,flags,cnt ): CreateTexture. Dimensions are rounded up to powers of two. */
	create(w: number, h: number, flags: number, cnt: number): Texture {
		flags = normalizeTextureFlags(flags);
		const tw = adjustTexSize(w);
		const th = adjustTexSize(h);
		const frames: TextureFrame[] = [];
		for (let k = 0; k < cnt; k++) {
			const f = makeFrame(tw, th, flags);
			if (flags & TEX_CUBE) {
				// Six faces; SetCubeFace selects the one TextureBuffer returns. Face 1 is the initial one.
				f.faces = [];
				for (let n = 0; n < 6; n++) {
					f.faces.push(n === 1 ? f.canvas : new TextureCanvas(tw, th, new Uint8Array(tw * th * 4).fill(255), f.canvas.hasAlpha));
				}
			}
			frames.push(f);
		}
		const key = `#${++this.anon}`;
		const cached = new CachedTexture(key, '', flags, frames);
		this.cache.set(key, cached);
		return new Texture(new TextureRep(cached));
	}

	/**
	 * Texture( file,flags ) / Texture( file,flags,w,h,first,cnt ): LoadTexture and
	 * LoadAnimTexture. `dir` is CachedTexture::setPath, the directory of the
	 * model being loaded: the file name alone is looked for there first.
	 * Returns null when there is no such image (Blitz returns 0).
	 */
	load(file: string, flags: number, w = 0, h = 0, first = 0, cnt = 1, dir = ''): Texture | null {
		const cached = this.loadCached(file, flags, w, h, first, cnt, dir);
		return cached ? new Texture(new TextureRep(cached)) : null;
	}

	/** The shared frames for a file, as the model loader needs them (frame 0 is the image of a TEXS entry). */
	loadCached(file: string, flags: number, w = 0, h = 0, first = 0, cnt = 1, dir = ''): CachedTexture | null {
		flags = normalizeTextureFlags(this.filterFile(file, flags));
		let f = file;
		if (f.startsWith('.\\') || f.startsWith('./')) f = f.substring(2);
		if (dir) {
			const base = f.replaceAll('\\', '/').split('/').pop() ?? f;
			const t = `${normalizePath(dir).replace(/\/$/, '')}/${base.toLowerCase()}`;
			const c = this.findOrLoad(t, flags, w, h, first, cnt);
			if (c) return c;
		}
		return this.findOrLoad(normalizePath(f), flags, w, h, first, cnt);
	}

	private findOrLoad(path: string, flags: number, w: number, h: number, first: number, cnt: number): CachedTexture | null {
		const cube = (flags & TEX_CUBE) !== 0;
		if (!cube && (w <= 0 || h <= 0 || first < 0 || cnt <= 0)) {
			w = h = first = 0;
			cnt = 1;
		}
		const key = `${path}|${flags}|${w}|${h}|${first}|${cnt}`;
		const hit = this.cache.get(key);
		if (hit) return hit;
		if (!this.exists(path)) return null;
		const img = this.pixels(path);
		if (!img) return null;
		const data = loadSurfacePixels(img, flags);
		const frames: TextureFrame[] = [];
		if (cube) {
			// A cube map file holds six faces side by side.
			const fw = Math.trunc(img.width / 6);
			if (fw * 6 !== img.width) return null;
			const tw = adjustTexSize(fw);
			const th = adjustTexSize(img.height);
			const hasAlpha = (flags & (TEX_ALPHA | TEX_MASKED)) !== 0;
			const faces = [0, 1, 2, 3, 4, 5].map((n) => stretch(data, img.width, n * fw, 0, fw, img.height, tw, th));
			const f = makeFrame(tw, th, flags, faces[1]);
			f.faces = faces.map((b, n) => (n === 1 ? f.canvas : new TextureCanvas(tw, th, b, hasAlpha)));
			frames.push(f);
		} else if (w === 0) {
			const tw = adjustTexSize(img.width);
			const th = adjustTexSize(img.height);
			const bytes = tw === img.width && th === img.height ? data : stretch(data, img.width, 0, 0, img.width, img.height, tw, th);
			frames.push(makeFrame(tw, th, flags, bytes));
		} else {
			const xTiles = Math.trunc(img.width / w);
			const yTiles = Math.trunc(img.height / h);
			if (first + cnt > xTiles * yTiles) return null;
			let x = (first % xTiles) * w;
			let y = Math.trunc(first / xTiles) * h;
			const tw = adjustTexSize(w);
			const th = adjustTexSize(h);
			for (let k = 0; k < cnt; k++) {
				frames.push(makeFrame(tw, th, flags, stretch(data, img.width, x, y, w, h, tw, th)));
				x += w;
				if (x + w > img.width) {
					x = 0;
					y += h;
				}
			}
		}
		const cached = new CachedTexture(key, path, flags, frames);
		this.cache.set(key, cached);
		return cached;
	}

	/** FreeTexture: drops the handle; the image goes when its last handle does. */
	free(t: Texture): void {
		if (t.freed) return;
		t.freed = true;
		this.release(t.rep.cached);
	}

	/** Takes a reference for something that is not a handle (the model cache). */
	retain(c: CachedTexture): void {
		c.refs++;
	}

	release(c: CachedTexture): void {
		if (--c.refs > 0) return;
		this.cache.delete(c.key);
		for (const f of c.frames) {
			this.buffered.delete(f);
			// Safe even while a brush still uses the image: Three uploads it again on the next use.
			f.texture.dispose();
		}
	}

	/** TextureBuffer( texture,frame ) */
	buffer(t: Texture, frame: number): TextureCanvas | null {
		const f = t.frames[frame];
		if (!f) return null;
		this.buffered.add(f);
		return f.canvas;
	}

	/** SetCubeFace texture,face */
	setCubeFace(t: Texture, face: number): void {
		const f = t.frames[0];
		if (!f?.faces || !f.faces[face]) return;
		f.canvas = f.faces[face];
	}

	/** Marks frames whose 2D buffer changed for upload. Called by World.render. */
	upload(): void {
		for (const f of this.buffered) {
			// Only face 1 of a cube map is what the (approximate) cube sampling shows.
			const c = f.faces ? f.faces[1] : f.canvas;
			if (c.modCount !== f.uploaded) {
				f.uploaded = c.modCount;
				f.texture.needsUpdate = true;
			}
		}
	}

	/** The Rep behind a brush layer (GetBrushTexture); model textures get one on demand. */
	repOf(h: TextureHandle): TextureRep {
		let rep = repOfHandle.get(h);
		if (!rep) {
			const image = h.image as TextureFrame;
			let cached: CachedTexture | undefined;
			for (const c of this.cache.values()) if (c.frames.includes(image)) cached = c;
			cached ??= new CachedTexture(`#${++this.anon}`, '', image.flags, [image]);
			rep = new TextureRep(cached, [h]);
		}
		return rep;
	}
}
