/**
 * Blitz3D 2D command set (bbruntime/bbgraphics.cpp) over software surfaces,
 * limited to the commands Stranded II uses. Like Blitz, the state is global:
 * one current buffer, one current colour, one cls colour.
 *
 * The screen is two Canvas2D surfaces at the game's logical resolution
 * (set_scrx x set_scry). Flip() copies the back buffer to the front buffer and
 * presents it on an attached <canvas> that the page layers over the WebGL
 * canvas. Pixels the 3D scene should show through have alpha 0; see
 * SceneRendered().
 *
 * Nothing here needs a DOM except attachCanvas(), the PNG/JPG decoder and
 * the Text rasteriser, all of which are optional.
 */

import { floatToInt as bbInt } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { decodeBmp, encodeBmp, isBmp, type DecodedImage } from './bmp';
import { Canvas2D, argbToNative, nativeToArgb, type TextRasterizer } from './canvas';

export { Canvas2D, argbToNative, nativeToArgb } from './canvas';
export { decodeBmp, encodeBmp } from './bmp';
export type { DecodedImage } from './bmp';

/** Float arguments are converted to Int by rounding to nearest, ties to even (blitz/num.ts floatToInt). */
export { bbInt };
const ri = bbInt;

export class BBImage {
	frames: Canvas2D[];
	/** Resolves when the pixels of a loaded image have arrived (immediately for CreateImage). */
	ready: Promise<void> = Promise.resolve();
	loaded = true;
	/** Set when loading failed (missing file, bad format, not enough frames). Blitz would have returned 0. */
	error: string | undefined;
	freed = false;
	/** MidHandle was requested before the pixels arrived; re-applied on arrival. */
	midHandle = false;
	path = '';
	constructor(frames: Canvas2D[]) {
		this.frames = frames;
	}
}

/** A Blitz image handle: 0 is "no image". */
export type ImageHandle = BBImage | 0;
export type Buffer = Canvas2D;

// ---------------------------------------------------------------- state

let front = new Canvas2D(1, 1);
let back = new Canvas2D(1, 1);
let gx_canvas: Canvas2D = front;
let curr_color = 0xffffffff;
let curr_clsColor = 0;
let gfxWidth = 0;
let gfxHeight = 0;

let vfs: Vfs | undefined;
const decodedCache = new Map<string, Promise<DecodedImage>>();

let ctx: CanvasRenderingContext2D | null = null;
let imageData: ImageData | null = null;
let presentedMod = -1;

let sceneSerial = 0;
let sceneGrabber: (() => Uint32Array | null) | null = null;
let sceneCache: { serial: number; px: Uint32Array | null } = { serial: -1, px: null };

let textRasterizer: TextRasterizer | null = null;
let saveHandler: ((path: string, bmp: Uint8Array) => void) | null = null;

/** Default Blitz font is GDI "courier" at height 12, which resolves to the 8x13 raster face. Assumed, not measured. */
export const DEFAULT_FONT_WIDTH = 8;
export const DEFAULT_FONT_HEIGHT = 13;

// ---------------------------------------------------------------- setup

/** Graphics3D w,h: creates the screen buffers. The front buffer becomes current, as in Blitz. */
export function Graphics(w: number, h: number): void {
	gfxWidth = w;
	gfxHeight = h;
	front = new Canvas2D(w, h);
	back = new Canvas2D(w, h);
	curr_color = 0xffffffff;
	curr_clsColor = 0;
	imageData = null;
	presentedMod = -1;
	if (ctx) sizeCanvas();
	SetBuffer(front);
}

export function GraphicsWidth(): number {
	return gfxWidth;
}
export function GraphicsHeight(): number {
	return gfxHeight;
}
let gfxDepth = 32;
/** The colour depth the program asked for (Graphics3D w,h,depth,mode; 0 = the desktop's, 32 here). */
export function GraphicsDepth(): number {
	return gfxDepth;
}
export function setGraphicsDepth(depth: number): void {
	gfxDepth = depth === 0 ? 32 : depth;
}

/** File source for LoadImage/LoadAnimImage. */
export function setVfs(v: Vfs): void {
	vfs = v;
	decodedCache.clear();
}

function sizeCanvas(): void {
	if (!ctx) return;
	if (ctx.canvas.width !== gfxWidth) ctx.canvas.width = gfxWidth;
	if (ctx.canvas.height !== gfxHeight) ctx.canvas.height = gfxHeight;
}

/**
 * Present the front buffer on this canvas. The page positions it over the
 * WebGL canvas and scales it with CSS; its bitmap is always the logical size.
 */
export function attachCanvas(canvas: HTMLCanvasElement | null): void {
	ctx = canvas ? canvas.getContext('2d') : null;
	imageData = null;
	presentedMod = -1;
	sizeCanvas();
}

/** Copy the front buffer to the attached canvas (no-op without one or when unchanged). */
export function present(): void {
	if (!ctx) return;
	if (presentedMod === front.modCount && imageData) return;
	if (!imageData || imageData.width !== front.width || imageData.height !== front.height) {
		imageData = new ImageData(front.width, front.height);
	}
	imageData.data.set(new Uint8ClampedArray(front.px.buffer, front.px.byteOffset, front.px.byteLength));
	ctx.putImageData(imageData, 0, 0);
	presentedMod = front.modCount;
}

/**
 * Flip: the back buffer becomes visible. The back buffer keeps its contents
 * (Blitz's windowed-mode behaviour: a copy, not a page swap). This does not
 * wait for vertical sync; callers yield to the browser themselves.
 */
export function Flip(): void {
	front.px.set(back.px);
	front.modCount++;
	present();
}

/**
 * Call after rendering the 3D scene (RenderWorld): the whole back buffer now
 * "contains" the scene, i.e. becomes transparent so the WebGL canvas shows.
 */
export function SceneRendered(): void {
	back.px.fill(0);
	back.modCount++;
	sceneSerial++;
}

/**
 * Optional: lets GrabImage/CopyRect/ReadPixel see the 3D scene where the
 * screen buffer is transparent. The callback returns the rendered scene as
 * native pixels at the logical resolution, or null.
 */
export function setSceneGrabber(fn: (() => Uint32Array | null) | null): void {
	sceneGrabber = fn;
}

function scenePixels(): Uint32Array | null {
	if (!sceneGrabber) return null;
	if (sceneCache.serial !== sceneSerial) sceneCache = { serial: sceneSerial, px: sceneGrabber() };
	return sceneCache.px;
}

const isScreen = (c: Canvas2D): boolean => c === front || c === back;

export function setTextRasterizer(fn: TextRasterizer | null): void {
	textRasterizer = fn;
}

/** Receives the BMP files written by SaveImage/SaveBuffer. */
export function setSaveHandler(fn: ((path: string, bmp: Uint8Array) => void) | null): void {
	saveHandler = fn;
}

// ---------------------------------------------------------------- buffers

export function FrontBuffer(): Buffer {
	return front;
}
export function BackBuffer(): Buffer {
	return back;
}
export function GraphicsBuffer(): Buffer {
	return gx_canvas;
}
export function ImageBuffer(image: ImageHandle, frame = 0): Buffer {
	if (!image) throw new Error('Image does not exist');
	return image.frames[frame];
}

/** bbSetBuffer: resets origin and viewport of the buffer and applies the current colours. */
export function SetBuffer(buff: Buffer): void {
	gx_canvas = buff;
	buff.setOrigin(0, 0);
	buff.setViewport(0, 0, buff.width, buff.height);
	buff.color = argbToNative(curr_color);
	buff.clsColor = argbToNative(curr_clsColor);
}

export function LockBuffer(_buff?: Buffer): void {}
export function UnlockBuffer(_buff?: Buffer): void {}

export function ReadPixel(x: number, y: number, buff?: Buffer): number {
	const c = buff ?? gx_canvas;
	x = ri(x);
	y = ri(y);
	if (isScreen(c)) {
		const ax = x + c.origin_x,
			ay = y + c.origin_y;
		if (ax >= 0 && ay >= 0 && ax < c.width && ay < c.height && c.px[ay * c.width + ax] >>> 24 === 0) {
			const s = scenePixels();
			if (s) return nativeToArgb(s[ay * c.width + ax]);
		}
	}
	return c.getPixel(x, y);
}
export function ReadPixelFast(x: number, y: number, buff?: Buffer): number {
	const c = buff ?? gx_canvas;
	x = ri(x);
	y = ri(y);
	if (isScreen(c) && x >= 0 && y >= 0 && x < c.width && y < c.height && c.px[y * c.width + x] >>> 24 === 0) {
		const s = scenePixels();
		if (s) return nativeToArgb(s[y * c.width + x]);
	}
	return c.getPixelFast(x, y);
}
export function WritePixel(x: number, y: number, argb: number, buff?: Buffer): void {
	(buff ?? gx_canvas).setPixel(ri(x), ri(y), argb);
}
export function WritePixelFast(x: number, y: number, argb: number, buff?: Buffer): void {
	(buff ?? gx_canvas).setPixelFast(ri(x), ri(y), argb);
}
export function CopyPixelFast(src_x: number, src_y: number, src: Buffer | undefined, dest_x: number, dest_y: number, buff?: Buffer): void {
	(buff ?? gx_canvas).copyPixelFast(ri(dest_x), ri(dest_y), src ?? gx_canvas, ri(src_x), ri(src_y));
}

/** After copying out of a screen buffer, replace "scene shows through" pixels with the scene itself when available. */
function resolveScene(dest: Canvas2D, src: Canvas2D, dx: number, dy: number, sx: number, sy: number, w: number, h: number): void {
	if (!isScreen(src) || isScreen(dest)) return;
	const s = scenePixels();
	if (!s) return;
	for (let j = 0; j < h; j++) {
		const yy = dy + j,
			syy = sy + j;
		if (yy < 0 || yy >= dest.height || syy < 0 || syy >= src.height) continue;
		for (let i = 0; i < w; i++) {
			const xx = dx + i,
				sxx = sx + i;
			if (xx < 0 || xx >= dest.width || sxx < 0 || sxx >= src.width) continue;
			if (dest.px[yy * dest.width + xx] >>> 24 === 0) dest.px[yy * dest.width + xx] = s[syy * src.width + sxx] | 0xff000000;
		}
	}
}

/** CopyRect sx,sy,w,h,dx,dy[,src,dest] */
export function CopyRect(sx: number, sy: number, w: number, h: number, dx: number, dy: number, src?: Buffer, dest?: Buffer): void {
	const s = src ?? gx_canvas,
		d = dest ?? gx_canvas;
	sx = ri(sx);
	sy = ri(sy);
	w = ri(w);
	h = ri(h);
	dx = ri(dx);
	dy = ri(dy);
	d.blit(dx, dy, s, sx, sy, w, h, true);
	resolveScene(d, s, dx + d.origin_x - s.handle_x, dy + d.origin_y - s.handle_y, sx, sy, w, h);
}

// ---------------------------------------------------------------- state commands

export function Origin(x: number, y: number): void {
	gx_canvas.setOrigin(ri(x), ri(y));
}
export function Viewport(x: number, y: number, w: number, h: number): void {
	gx_canvas.setViewport(ri(x), ri(y), ri(w), ri(h));
}
export function Color(r: number, g: number, b: number): void {
	curr_color = ((ri(r) << 16) | (ri(g) << 8) | ri(b)) >>> 0;
	gx_canvas.setColor(curr_color);
}
/** GetColor x,y: the current colour becomes the pixel's colour. */
export function GetColor(x: number, y: number): void {
	curr_color = ReadPixel(x, y) >>> 0;
	gx_canvas.setColor(curr_color);
}
export function ColorRed(): number {
	return (gx_canvas.getColor() >> 16) & 0xff;
}
export function ColorGreen(): number {
	return (gx_canvas.getColor() >> 8) & 0xff;
}
export function ColorBlue(): number {
	return gx_canvas.getColor() & 0xff;
}
export function ClsColor(r: number, g: number, b: number): void {
	curr_clsColor = ((ri(r) << 16) | (ri(g) << 8) | ri(b)) >>> 0;
	gx_canvas.setClsColor(curr_clsColor);
}

// ---------------------------------------------------------------- primitives

export function Cls(): void {
	gx_canvas.cls();
}
export function Plot(x: number, y: number): void {
	gx_canvas.plot(ri(x), ri(y));
}
export function Line(x1: number, y1: number, x2: number, y2: number): void {
	gx_canvas.line(ri(x1), ri(y1), ri(x2), ri(y2));
}
export function Rect(x: number, y: number, w: number, h: number, solid: number | boolean = 1): void {
	gx_canvas.rect(ri(x), ri(y), ri(w), ri(h), !!solid);
}
export function Oval(x: number, y: number, w: number, h: number, solid: number | boolean = 1): void {
	gx_canvas.oval(ri(x), ri(y), ri(w), ri(h), !!solid);
}

export function FontWidth(): number {
	return DEFAULT_FONT_WIDTH;
}
export function FontHeight(): number {
	return DEFAULT_FONT_HEIGHT;
}
export function StringWidth(s: string): number {
	return s.length * DEFAULT_FONT_WIDTH;
}

/** Text x,y,string[,centre_x,centre_y] in the default font. Glyph shapes depend on the installed rasteriser. */
export function Text(x: number, y: number, str: string | number, centre_x: number | boolean = 0, centre_y: number | boolean = 0): void {
	const s = String(str);
	x = ri(x);
	y = ri(y);
	if (centre_x) x -= Math.trunc(StringWidth(s) / 2);
	if (centre_y) y -= Math.trunc(DEFAULT_FONT_HEIGHT / 2);
	const rast = textRasterizer ?? defaultTextRasterizer();
	if (!rast) return;
	const r = rast(s);
	if (r) gx_canvas.drawMask(x, y, r.w, r.h, r.mask);
}

let cachedDefaultRasterizer: TextRasterizer | null | undefined;
function defaultTextRasterizer(): TextRasterizer | null {
	if (cachedDefaultRasterizer !== undefined) return cachedDefaultRasterizer;
	if (typeof OffscreenCanvas === 'undefined') return (cachedDefaultRasterizer = null);
	const oc = new OffscreenCanvas(8, DEFAULT_FONT_HEIGHT);
	const c = oc.getContext('2d', { willReadFrequently: true });
	if (!c) return (cachedDefaultRasterizer = null);
	return (cachedDefaultRasterizer = (text: string) => {
		const w = text.length * DEFAULT_FONT_WIDTH,
			h = DEFAULT_FONT_HEIGHT;
		if (w === 0) return null;
		if (oc.width < w) oc.width = w;
		c.clearRect(0, 0, oc.width, h);
		c.font = '13px "Courier New", Courier, monospace';
		c.textBaseline = 'alphabetic';
		c.fillStyle = '#fff';
		for (let i = 0; i < text.length; i++) c.fillText(text[i], i * DEFAULT_FONT_WIDTH, 10);
		const data = c.getImageData(0, 0, w, h).data;
		const mask = new Uint8Array(w * h);
		for (let i = 0; i < w * h; i++) mask[i] = data[i * 4 + 3] > 127 ? 1 : 0;
		return { w, h, mask };
	});
}

// ---------------------------------------------------------------- image files

/** Decodes PNG/JPG (anything that is not BMP). Replaceable for non-browser hosts. */
export type ImageDecoder = (bytes: Uint8Array, path: string) => Promise<DecodedImage>;

async function browserDecode(bytes: Uint8Array, path: string): Promise<DecodedImage> {
	if (typeof createImageBitmap === 'undefined' || typeof OffscreenCanvas === 'undefined') {
		throw new Error(`No decoder for ${path}`);
	}
	const bmp = await createImageBitmap(new Blob([bytes as BlobPart]), {
		premultiplyAlpha: 'none',
		colorSpaceConversion: 'none'
	});
	const oc = new OffscreenCanvas(bmp.width, bmp.height);
	const c = oc.getContext('2d', { willReadFrequently: true })!;
	c.drawImage(bmp, 0, 0);
	const data = c.getImageData(0, 0, bmp.width, bmp.height).data;
	const px = new Uint32Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
	// Blitz loads into a surface without alpha: every pixel is opaque.
	for (let i = 0; i < px.length; i++) px[i] |= 0xff000000;
	bmp.close();
	return { width: oc.width, height: oc.height, px };
}

let otherDecoder: ImageDecoder = browserDecode;
export function setImageDecoder(fn: ImageDecoder): void {
	otherDecoder = fn;
}

const cacheKey = (path: string): string => path.replaceAll('\\', '/').toLowerCase();

function decodeFile(path: string): Promise<DecodedImage> {
	const key = cacheKey(path);
	let p = decodedCache.get(key);
	if (!p) {
		if (!vfs) return Promise.reject(new Error('gfx2d: setVfs() has not been called'));
		p = vfs.readBytes(path).then((bytes) => (isBmp(bytes) ? decodeBmp(bytes) : otherDecoder(bytes, path)));
		decodedCache.set(key, p);
		// Decoded pixels are only needed until every image made from them is filled.
		p.then(
			() => queueMicrotask(() => decodedCache.delete(key)),
			() => decodedCache.delete(key)
		);
	}
	return p;
}

/**
 * LoadImage(file): 0 when the file does not exist. Reading and decoding is
 * asynchronous in the browser, so the image is returned at once with a 0x0
 * frame and filled in later; await `image.ready` (or use LoadImageAsync)
 * before relying on its size or pixels.
 */
export function LoadImage(path: string): ImageHandle {
	if (!vfs || !vfs.exists(path)) return 0;
	const frame = new Canvas2D(0, 0);
	const image = new BBImage([frame]);
	image.path = path;
	image.loaded = false;
	image.ready = decodeFile(path).then(
		(d) => {
			if (image.freed) return;
			image.frames[0].replace(d.width, d.height, d.px.slice());
			image.loaded = true;
			if (image.midHandle) MidHandle(image);
		},
		(e) => {
			image.error = String(e instanceof Error ? e.message : e);
			console.error(`LoadImage ${path}: ${image.error}`);
		}
	);
	return image;
}

/**
 * LoadAnimImage(file,w,h,first,count): frames are cut left to right, top to
 * bottom. The frames exist (black) immediately and are filled on arrival.
 * Blitz raises "Not enough frames in bitmap"; here that sets image.error.
 */
export function LoadAnimImage(path: string, w: number, h: number, first: number, cnt: number): ImageHandle {
	if (cnt < 1) throw new Error('Illegal frame count');
	if (first < 0) throw new Error('Illegal first frame');
	if (!vfs || !vfs.exists(path)) return 0;
	const frames: Canvas2D[] = [];
	for (let k = 0; k < cnt; k++) frames.push(new Canvas2D(w, h));
	const image = new BBImage(frames);
	image.path = path;
	image.loaded = false;
	image.ready = decodeFile(path).then(
		(d) => {
			if (image.freed) return;
			const pic = new Canvas2D(d.width, d.height, d.px);
			const fpr = Math.trunc(pic.width / w);
			const fpp = Math.trunc(pic.height / h) * fpr;
			if (first + cnt > fpp) {
				image.error = 'Not enough frames in bitmap';
				console.error(`LoadAnimImage ${path}: ${image.error}`);
				return;
			}
			let src_x = (first % fpr) * w,
				src_y = Math.trunc(first / fpr) * h;
			for (let k = 0; k < cnt; k++) {
				const c = image.frames[k];
				const hx = c.handle_x,
					hy = c.handle_y;
				const vp = c.viewport;
				c.setHandle(0, 0);
				c.viewport = { left: 0, top: 0, right: w, bottom: h };
				const ox = c.origin_x,
					oy = c.origin_y;
				c.setOrigin(0, 0);
				c.blit(0, 0, pic, src_x, src_y, w, h, true);
				c.setOrigin(ox, oy);
				c.viewport = vp;
				c.setHandle(hx, hy);
				src_x += w;
				if (src_x + w > pic.width) {
					src_x = 0;
					src_y += h;
				}
			}
			image.loaded = true;
		},
		(e) => {
			image.error = String(e instanceof Error ? e.message : e);
			console.error(`LoadAnimImage ${path}: ${image.error}`);
		}
	);
	return image;
}

/** LoadImage that resolves once the pixels are in place; 0 when missing or undecodable. */
export async function LoadImageAsync(path: string): Promise<ImageHandle> {
	const image = LoadImage(path);
	if (!image) return 0;
	await image.ready;
	return image.error ? 0 : image;
}

export async function LoadAnimImageAsync(path: string, w: number, h: number, first: number, cnt: number): Promise<ImageHandle> {
	const image = LoadAnimImage(path, w, h, first, cnt);
	if (!image) return 0;
	await image.ready;
	return image.error ? 0 : image;
}

// ---------------------------------------------------------------- images

export function CreateImage(w: number, h: number, frames = 1): BBImage {
	const list: Canvas2D[] = [];
	for (let k = 0; k < frames; k++) list.push(new Canvas2D(ri(w), ri(h)));
	return new BBImage(list);
}

export function FreeImage(image: ImageHandle): void {
	if (!image || image.freed) return;
	image.freed = true;
	if (image.frames.includes(gx_canvas)) SetBuffer(front);
}

export function MaskImage(image: ImageHandle, r: number, g: number, b: number): void {
	if (!image) return;
	const argb = (ri(r) << 16) | (ri(g) << 8) | ri(b);
	for (const f of image.frames) f.setMask(argb);
}

export function HandleImage(image: ImageHandle, x: number, y: number): void {
	if (!image) return;
	image.midHandle = false;
	for (const f of image.frames) f.setHandle(ri(x), ri(y));
}

export function MidHandle(image: ImageHandle): void {
	if (!image) return;
	image.midHandle = !image.loaded;
	for (const f of image.frames) f.setHandle(Math.trunc(f.width / 2), Math.trunc(f.height / 2));
}

export function ImageWidth(image: ImageHandle): number {
	return image ? image.frames[0].width : 0;
}
export function ImageHeight(image: ImageHandle): number {
	return image ? image.frames[0].height : 0;
}
export function ImageXHandle(image: ImageHandle): number {
	return image ? image.frames[0].handle_x : 0;
}
export function ImageYHandle(image: ImageHandle): number {
	return image ? image.frames[0].handle_y : 0;
}

export function DrawImage(image: ImageHandle, x: number, y: number, frame = 0): void {
	if (!image) return;
	const c = image.frames[ri(frame)];
	if (!c) throw new Error('Image frame out of range');
	gx_canvas.blit(ri(x), ri(y), c, 0, 0, c.width, c.height, false);
}

export function DrawBlock(image: ImageHandle, x: number, y: number, frame = 0): void {
	if (!image) return;
	const c = image.frames[ri(frame)];
	if (!c) throw new Error('Image frame out of range');
	gx_canvas.blit(ri(x), ri(y), c, 0, 0, c.width, c.height, true);
}

export function DrawImageRect(image: ImageHandle, x: number, y: number, rx: number, ry: number, rw: number, rh: number, frame = 0): void {
	if (!image) return;
	const c = image.frames[ri(frame)];
	if (!c) throw new Error('Image frame out of range');
	gx_canvas.blit(ri(x), ri(y), c, ri(rx), ri(ry), ri(rw), ri(rh), false);
}

export function DrawBlockRect(image: ImageHandle, x: number, y: number, rx: number, ry: number, rw: number, rh: number, frame = 0): void {
	if (!image) return;
	const c = image.frames[ri(frame)];
	if (!c) throw new Error('Image frame out of range');
	gx_canvas.blit(ri(x), ri(y), c, ri(rx), ri(ry), ri(rw), ri(rh), true);
}

/** static void tile(...) in bbgraphics.cpp */
function tile(image: BBImage, x: number, y: number, frame: number, solid: boolean): void {
	const c = image.frames[frame];
	const w = c.width,
		h = c.height;
	if (w <= 0 || h <= 0) return;
	const vp = gx_canvas.viewport;
	const vp_w = vp.right - vp.left,
		vp_h = vp.bottom - vp.top;
	let dx = vp.left - gx_canvas.origin_x + c.handle_x;
	let dy = vp.top - gx_canvas.origin_y + c.handle_y;
	x -= dx;
	y -= dy;
	dx += x >= 0 ? x % w : w - (-x % w);
	dy += y >= 0 ? y % h : h - (-y % h);
	for (y = -h; y < vp_h; y += h) {
		for (x = -w; x < vp_w; x += w) gx_canvas.blit(x + dx, y + dy, c, 0, 0, w, h, solid);
	}
}

export function TileBlock(image: ImageHandle, x = 0, y = 0, frame = 0): void {
	if (image) tile(image, ri(x), ri(y), ri(frame), true);
}
export function TileImage(image: ImageHandle, x = 0, y = 0, frame = 0): void {
	if (image) tile(image, ri(x), ri(y), ri(frame), false);
}

/** GrabImage image,x,y[,frame]: copies from the current buffer; the image's handle offsets the source. */
export function GrabImage(image: ImageHandle, x: number, y: number, frame = 0): void {
	if (!image) return;
	const c = image.frames[ri(frame)];
	x = ri(x) + gx_canvas.origin_x - c.handle_x;
	y = ri(y) + gx_canvas.origin_y - c.handle_y;
	c.setViewport(0, 0, c.width, c.height);
	// c->blit( 0,0,gx_canvas,x,y,... ) applies c's origin and the source's handle, both normally 0.
	c.blit(0, 0, gx_canvas, x, y, c.width, c.height, true);
	resolveScene(c, gx_canvas, c.origin_x - gx_canvas.handle_x, c.origin_y - gx_canvas.handle_y, x, y, c.width, c.height);
}

/** ReadPixel with bilinear filtering, as used by TFormImage when TFormFilter is on (the default). */
function getPixelFiltered(c: Canvas2D, x: number, y: number): number {
	const f = Math.fround;
	x = f(x - 0.5);
	y = f(y - 0.5);
	let fx = Math.floor(x),
		fy = Math.floor(y);
	const ix = fx,
		iy = fy;
	fx = f(x - fx);
	fy = f(y - fy);
	const tl = c.getPixel(ix, iy),
		tr = c.getPixel(ix + 1, iy),
		br = c.getPixel(ix + 1, iy + 1),
		bl = c.getPixel(ix, iy + 1);
	const w1 = f((1 - fx) * (1 - fy)),
		w2 = f(fx * (1 - fy)),
		w3 = f((1 - fx) * fy),
		w4 = f(fx * fy);
	const ch = (s: number) =>
		Math.trunc(f(f(((tl >> s) & 0xff) * w1 + ((tr >> s) & 0xff) * w2 + ((bl >> s) & 0xff) * w3 + ((br >> s) & 0xff) * w4) + 0.5));
	return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

let tformFilter = true;
export function TFormFilter(enable: number | boolean): void {
	tformFilter = !!enable;
}

/** static gxCanvas *tformCanvas(...) in bbgraphics.cpp */
function tformCanvas(c: Canvas2D, m: number[][], x_handle: number, y_handle: number): Canvas2D {
	const f = Math.fround;
	const dt = f(1 / f(m[0][0] * m[1][1] - m[1][0] * m[0][1]));
	const i = [
		[f(dt * m[1][1]), f(-dt * m[0][1])],
		[f(-dt * m[1][0]), f(dt * m[0][0])]
	];
	const vrot = (mm: number[][], vx: number, vy: number): [number, number] => [
		f(mm[0][0] * vx + mm[0][1] * vy),
		f(mm[1][0] * vx + mm[1][1] * vy)
	];
	const ox = x_handle,
		oy = y_handle;
	const corners = [
		vrot(m, -ox, -oy),
		vrot(m, c.width - ox, -oy),
		vrot(m, c.width - ox, c.height - oy),
		vrot(m, -ox, c.height - oy)
	];
	const minx = Math.floor(Math.min(...corners.map((v) => v[0])));
	const miny = Math.floor(Math.min(...corners.map((v) => v[1])));
	const maxx = Math.ceil(Math.max(...corners.map((v) => v[0])));
	const maxy = Math.ceil(Math.max(...corners.map((v) => v[1])));
	const iw = maxx - minx,
		ih = maxy - miny;
	const t = new Canvas2D(iw, ih);
	t.setHandle(-minx, -miny);
	t.mask = c.mask;
	let vy = miny + 0.5;
	for (let y = 0; y < ih; ++vy, ++y) {
		let vx = minx + 0.5;
		for (let x = 0; x < iw; ++vx, ++x) {
			const q = vrot(i, vx, vy);
			const rgb = tformFilter
				? getPixelFiltered(c, q[0] + ox, q[1] + oy)
				: c.getPixel(Math.floor(q[0] + ox), Math.floor(q[1] + oy));
			t.setPixel(x, y, rgb);
		}
	}
	return t;
}

/** TFormImage image,a,b,c,d */
export function TFormImage(image: ImageHandle, a: number, b: number, c: number, d: number): void {
	if (!image) return;
	if (image.frames.includes(gx_canvas)) SetBuffer(front);
	const m = [
		[Math.fround(a), Math.fround(c)],
		[Math.fround(b), Math.fround(d)]
	];
	for (let k = 0; k < image.frames.length; k++) {
		const fr = image.frames[k];
		image.frames[k] = tformCanvas(fr, m, fr.handle_x, fr.handle_y);
	}
}

export function ScaleImage(image: ImageHandle, w: number, h: number): void {
	TFormImage(image, w, 0, 0, h);
}

/** ResizeImage image,w,h (pixels). Replaces the frames, so earlier ImageBuffer() results go stale, as in Blitz. */
export function ResizeImage(image: ImageHandle, w: number, h: number): void {
	if (!image) return;
	const c = image.frames[0];
	TFormImage(image, Math.fround(w / c.width), 0, 0, Math.fround(h / c.height));
}

export function SaveImage(image: ImageHandle, path: string, frame = 0): number {
	if (!image) return 0;
	return SaveBuffer(image.frames[frame], path);
}

export function SaveBuffer(buff: Buffer, path: string): number {
	if (!saveHandler) return 0;
	saveHandler(path, encodeBmp(buff.width, buff.height, buff.px));
	return 1;
}
