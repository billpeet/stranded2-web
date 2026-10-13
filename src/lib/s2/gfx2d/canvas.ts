/**
 * Software surface with the semantics of Blitz3D's gxCanvas (gxruntime/gxcanvas.cpp)
 * for a 32-bit display mode. No DOM dependency.
 *
 * Pixels are stored as RGBA bytes viewed through a little-endian Uint32Array,
 * i.e. value = A<<24 | B<<16 | G<<8 | R. Alpha is not part of Blitz's model:
 * every pixel a Blitz command writes is opaque (A=255). A=0 only ever appears
 * on the screen buffers, where it means "the 3D scene shows through here"
 * (see SceneRendered in index.ts).
 */

/** Blitz 0xRRGGBB (alpha ignored) to an opaque native pixel. */
export function argbToNative(argb: number): number {
	return (0xff000000 | ((argb & 0xff) << 16) | (argb & 0xff00) | ((argb >>> 16) & 0xff)) >>> 0;
}

/** Native pixel to Blitz ARGB as a signed 32-bit int with alpha 255 (what a 32-bit XRGB surface yields via toARGB). */
export function nativeToArgb(p: number): number {
	return (0xff000000 | ((p & 0xff) << 16) | (p & 0xff00) | ((p >>> 16) & 0xff)) | 0;
}

interface RectLTRB {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** static bool clip( const RECT &viewport,RECT *d ) */
function clip1(vp: RectLTRB, d: RectLTRB): boolean {
	if (
		d.right <= d.left ||
		d.bottom <= d.top ||
		d.left >= vp.right ||
		d.right <= vp.left ||
		d.top >= vp.bottom ||
		d.bottom <= vp.top
	)
		return false;
	if (d.left < vp.left) d.left = vp.left;
	if (d.right > vp.right) d.right = vp.right;
	if (d.top < vp.top) d.top = vp.top;
	if (d.bottom > vp.bottom) d.bottom = vp.bottom;
	return true;
}

/** static bool clip( const RECT &viewport,RECT *d,RECT *s ) */
function clip2(vp: RectLTRB, d: RectLTRB, s: RectLTRB): boolean {
	if (
		d.right <= d.left ||
		d.bottom <= d.top ||
		d.left >= vp.right ||
		d.right <= vp.left ||
		d.top >= vp.bottom ||
		d.bottom <= vp.top
	)
		return false;
	let dx: number, dy: number;
	if ((dx = vp.left - d.left) > 0) {
		d.left += dx;
		s.left += dx;
	}
	if ((dx = vp.right - d.right) < 0) {
		d.right += dx;
		s.right += dx;
	}
	if ((dy = vp.top - d.top) > 0) {
		d.top += dy;
		s.top += dy;
	}
	if ((dy = vp.bottom - d.bottom) < 0) {
		d.bottom += dy;
		s.bottom += dy;
	}
	return true;
}

const rect = (x: number, y: number, w: number, h: number): RectLTRB => ({
	left: x,
	top: y,
	right: x + w,
	bottom: y + h
});

/** C integer division (truncation toward zero). */
const cdiv = (a: number, b: number): number => Math.trunc(a / b);

/** Optional rasteriser for the Text command: returns a w*h coverage mask (non-zero = ink). */
export type TextRasterizer = (text: string) => { w: number; h: number; mask: Uint8Array } | null;

export class Canvas2D {
	px: Uint32Array;
	width: number;
	height: number;
	/** Colour key as native RGB (low 24 bits). setMask(0) on creation. */
	mask = 0;
	/** Native opaque pixel. setColor(~0) on creation. */
	color = 0xffffffff;
	clsColor = 0xff000000;
	origin_x = 0;
	origin_y = 0;
	handle_x = 0;
	handle_y = 0;
	viewport: RectLTRB;
	/** Bumped on every modification (gxCanvas::mod_cnt); lets a presenter skip unchanged frames. */
	modCount = 0;

	constructor(w: number, h: number, px?: Uint32Array) {
		this.width = w;
		this.height = h;
		this.px = px ?? new Uint32Array(w * h).fill(0xff000000);
		this.viewport = rect(0, 0, w, h);
	}

	/** Replace the surface storage (late-arriving decode of a lazily loaded image). */
	replace(w: number, h: number, px: Uint32Array): void {
		this.width = w;
		this.height = h;
		this.px = px;
		this.viewport = rect(0, 0, w, h);
		this.modCount++;
	}

	setMask(argb: number): void {
		this.mask = argbToNative(argb) & 0xffffff;
	}
	getMask(): number {
		return nativeToArgb(this.mask);
	}
	setColor(argb: number): void {
		this.color = argbToNative(argb);
	}
	getColor(): number {
		return nativeToArgb(this.color);
	}
	setClsColor(argb: number): void {
		this.clsColor = argbToNative(argb);
	}
	setOrigin(x: number, y: number): void {
		this.origin_x = x;
		this.origin_y = y;
	}
	setHandle(x: number, y: number): void {
		this.handle_x = x;
		this.handle_y = y;
	}
	setViewport(x: number, y: number, w: number, h: number): void {
		const r = rect(x, y, w, h);
		this.viewport = clip1(rect(0, 0, this.width, this.height), r) ? r : rect(0, 0, 0, 0);
	}

	private fill(r: RectLTRB, value: number): void {
		const { px, width } = this;
		for (let y = r.top; y < r.bottom; y++) px.fill(value, y * width + r.left, y * width + r.right);
		this.modCount++;
	}

	cls(): void {
		this.fill(this.viewport, this.clsColor);
	}

	plot(x: number, y: number): void {
		const vp = this.viewport;
		x += this.origin_x;
		if (x < vp.left || x >= vp.right) return;
		y += this.origin_y;
		if (y < vp.top || y >= vp.bottom) return;
		this.px[y * this.width + x] = this.color;
		this.modCount++;
	}

	line(x0: number, y0: number, x1: number, y1: number): void {
		const vp = this.viewport;
		x0 += this.origin_x;
		y0 += this.origin_y;
		x1 += this.origin_x;
		y1 += this.origin_y;
		const cx0 = vp.left,
			cx1 = vp.right - 1,
			cy0 = vp.top,
			cy1 = vp.bottom - 1;
		for (;;) {
			let clip0 = 0,
				clipB = 0;
			if (y0 > cy1) clip0 |= 1;
			else if (y0 < cy0) clip0 |= 2;
			if (x0 > cx1) clip0 |= 4;
			else if (x0 < cx0) clip0 |= 8;
			if (y1 > cy1) clipB |= 1;
			else if (y1 < cy0) clipB |= 2;
			if (x1 > cx1) clipB |= 4;
			else if (x1 < cx0) clipB |= 8;
			if ((clip0 | clipB) === 0) break;
			if ((clip0 & clipB) !== 0) return;
			if (clip0 & 1) {
				x0 = x0 + cdiv((x1 - x0) * (cy1 - y0), y1 - y0);
				y0 = cy1;
				continue;
			}
			if (clip0 & 2) {
				x0 = x0 + cdiv((x1 - x0) * (cy0 - y0), y1 - y0);
				y0 = cy0;
				continue;
			}
			if (clip0 & 4) {
				y0 = y0 + cdiv((y1 - y0) * (cx1 - x0), x1 - x0);
				x0 = cx1;
				continue;
			}
			if (clip0 & 8) {
				y0 = y0 + cdiv((y1 - y0) * (cx0 - x0), x1 - x0);
				x0 = cx0;
				continue;
			}
			if (clipB & 1) {
				x1 = x0 + cdiv((x1 - x0) * (cy1 - y0), y1 - y0);
				y1 = cy1;
				continue;
			}
			if (clipB & 2) {
				x1 = x0 + cdiv((x1 - x0) * (cy0 - y0), y1 - y0);
				y1 = cy0;
				continue;
			}
			if (clipB & 4) {
				y1 = y0 + cdiv((y1 - y0) * (cx1 - x0), x1 - x0);
				x1 = cx1;
				continue;
			}
			if (clipB & 8) {
				y1 = y0 + cdiv((y1 - y0) * (cx0 - x0), x1 - x0);
				x1 = cx0;
				continue;
			}
		}
		const dx = x1 - x0,
			dy = y1 - y0;
		const { px, width, color } = this;
		this.modCount++;
		if ((dx | dy) === 0) {
			// setPixel(): applies origin and viewport a second time, as the original does.
			const sx = x0 + this.origin_x,
				sy = y0 + this.origin_y;
			if (sx < vp.left || sx >= vp.right || sy < vp.top || sy >= vp.bottom) return;
			px[sy * width + sx] = color;
			return;
		}
		let sx: number, sy: number, ax: number, ay: number;
		if (dx >= 0) {
			sx = 1;
			ax = dx;
		} else {
			sx = -1;
			ax = -dx;
		}
		if (dy >= 0) {
			sy = 1;
			ay = dy;
		} else {
			sy = -1;
			ay = -dy;
		}
		if (ax > ay) {
			let ddf = -ax;
			const sadj = ax + ax,
				padj = ay + ay;
			while (ax-- >= 0) {
				px[y0 * width + x0] = color;
				x0 += sx;
				ddf += padj;
				if (ddf >= 0) {
					y0 += sy;
					ddf -= sadj;
				}
			}
		} else {
			let ddf = -ay;
			const sadj = ay + ay,
				padj = ax + ax;
			while (ay-- >= 0) {
				px[y0 * width + x0] = color;
				y0 += sy;
				ddf += padj;
				if (ddf >= 0) {
					x0 += sx;
					ddf -= sadj;
				}
			}
		}
	}

	rect(x: number, y: number, w: number, h: number, solid: boolean): void {
		x += this.origin_x;
		y += this.origin_y;
		const dest = rect(x, y, w, h);
		if (!clip1(this.viewport, dest)) return;
		if (solid) {
			this.fill(dest, this.color);
			return;
		}
		for (const r of [rect(x, y, w, 1), rect(x, y, 1, h), rect(x + w - 1, y, 1, h), rect(x, y + h - 1, w, 1)]) {
			if (clip1(this.viewport, r)) this.fill(r, this.color);
		}
	}

	oval(x1: number, y1: number, w: number, h: number, solid: boolean): void {
		const vp = this.viewport;
		const f = Math.fround;
		x1 += this.origin_x;
		y1 += this.origin_y;
		const dest = rect(x1, y1, w, h);
		if (!clip1(vp, dest)) return;
		const xr = f(w * 0.5),
			yr = f(h * 0.5),
			ar = f(w / h);
		const cx = f(x1 + xr + 0.5),
			cy = f(y1 + yr - 0.5),
			rsq = f(yr * yr);
		let y: number;
		const color = this.color;
		if (solid) {
			y = f(dest.top - cy);
			for (let t = dest.top; t < dest.bottom; ++y, ++t) {
				const x = f(Math.sqrt(f(rsq - y * y)) * ar);
				const xa = Math.floor(f(cx - x)),
					xb = Math.floor(f(cx + x));
				if (!(xb > xa) || xa >= vp.right || xb <= vp.left) continue;
				this.fill(
					{ top: t, bottom: t + 1, left: xa < vp.left ? vp.left : xa, right: xb > vp.right ? vp.right : xb },
					color
				);
			}
			return;
		}
		const hh = Math.floor(cy);
		const hline = (r: RectLTRB) => {
			if (clip1(vp, r)) this.fill(r, color);
		};
		let p_xa = Math.trunc(cx),
			p_xb = p_xa;
		let t = dest.top;
		y = f(t - cy);
		if (dest.top > y1) {
			--t;
			--y;
		}
		for (; t <= hh; ++y, ++t) {
			const x = f(Math.sqrt(f(rsq - y * y)) * ar);
			const xa = Math.floor(f(cx - x)),
				xb = Math.floor(f(cx + x));
			const r1 = rect(xa, t, p_xa - xa, 1);
			if (r1.right <= r1.left) r1.right = r1.left + 1;
			hline(r1);
			const r2 = rect(p_xb, t, xb - p_xb, 1);
			if (r2.left >= r2.right) r2.left = r2.right - 1;
			hline(r2);
			p_xa = xa;
			p_xb = xb;
		}
		p_xa = p_xb = Math.trunc(cx);
		t = dest.bottom - 1;
		y = f(t - cy);
		if (dest.bottom < y1 + h) {
			++t;
			++y;
		}
		for (; t > hh; --y, --t) {
			const x = f(Math.sqrt(f(rsq - y * y)) * ar);
			const xa = Math.floor(f(cx - x)),
				xb = Math.floor(f(cx + x));
			const r1 = rect(xa, t, p_xa - xa, 1);
			if (r1.right <= r1.left) r1.right = r1.left + 1;
			hline(r1);
			const r2 = rect(p_xb, t, xb - p_xb, 1);
			if (r2.left >= r2.right) r2.left = r2.right - 1;
			hline(r2);
			p_xa = xa;
			p_xb = xb;
		}
	}

	/**
	 * gxCanvas::blit. `solid` copies every pixel (DrawBlock); otherwise source
	 * pixels equal to the source's mask colour are skipped (DrawImage).
	 */
	blit(x: number, y: number, src: Canvas2D, src_x: number, src_y: number, src_w: number, src_h: number, solid: boolean): void {
		x += this.origin_x - src.handle_x;
		y += this.origin_y - src.handle_y;
		const d = rect(x, y, src_w, src_h),
			s = rect(src_x, src_y, src_w, src_h);
		if (!clip2(this.viewport, d, s)) return;
		if (!clip2(rect(0, 0, src.width, src.height), s, d)) return;
		const w = d.right - d.left,
			h = d.bottom - d.top;
		const dpx = this.px,
			spx = src.px,
			dw = this.width,
			sw = src.width;
		if (solid) {
			if (dpx === spx && d.top > s.top) {
				for (let row = h - 1; row >= 0; row--) {
					const so = (s.top + row) * sw + s.left;
					dpx.copyWithin((d.top + row) * dw + d.left, so, so + w);
				}
			} else {
				for (let row = 0; row < h; row++) {
					const so = (s.top + row) * sw + s.left;
					dpx.set(spx.subarray(so, so + w), (d.top + row) * dw + d.left);
				}
			}
		} else {
			const mask = src.mask;
			for (let row = 0; row < h; row++) {
				let so = (s.top + row) * sw + s.left;
				let dof = (d.top + row) * dw + d.left;
				for (let i = 0; i < w; i++, so++, dof++) {
					const p = spx[so];
					if ((p & 0xffffff) !== mask) dpx[dof] = p;
				}
			}
		}
		this.modCount++;
	}

	/** ReadPixel: Blitz ARGB; outside the viewport the mask colour is returned. */
	getPixel(x: number, y: number): number {
		const vp = this.viewport;
		x += this.origin_x;
		if (x < vp.left || x >= vp.right) return this.getMask();
		y += this.origin_y;
		if (y < vp.top || y >= vp.bottom) return this.getMask();
		return nativeToArgb(this.px[y * this.width + x]);
	}

	/** ReadPixelFast: no origin, no clipping. Out-of-range reads are undefined in Blitz; 0 here. */
	getPixelFast(x: number, y: number): number {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return 0;
		return nativeToArgb(this.px[y * this.width + x]);
	}

	setPixel(x: number, y: number, argb: number): void {
		const vp = this.viewport;
		x += this.origin_x;
		if (x < vp.left || x >= vp.right) return;
		y += this.origin_y;
		if (y < vp.top || y >= vp.bottom) return;
		this.px[y * this.width + x] = argbToNative(argb);
		this.modCount++;
	}

	/** WritePixelFast: no origin, no clipping. Out-of-range writes corrupt memory in Blitz; ignored here. */
	setPixelFast(x: number, y: number, argb: number): void {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		this.px[y * this.width + x] = argbToNative(argb);
		this.modCount++;
	}

	copyPixelFast(x: number, y: number, src: Canvas2D, src_x: number, src_y: number): void {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
		if (src_x < 0 || src_y < 0 || src_x >= src.width || src_y >= src.height) return;
		this.px[y * this.width + x] = src.px[src_y * src.width + src_x];
		this.modCount++;
	}

	/** Draw a rasterised string in the current colour (gxFont::render keeps only the glyph ink). */
	drawMask(x: number, y: number, w: number, h: number, mask: Uint8Array): void {
		const vp = this.viewport;
		x += this.origin_x;
		y += this.origin_y;
		for (let j = 0; j < h; j++) {
			const dy = y + j;
			if (dy < vp.top || dy >= vp.bottom) continue;
			for (let i = 0; i < w; i++) {
				const dx = x + i;
				if (dx < vp.left || dx >= vp.right) continue;
				if (mask[j * w + i]) this.px[dy * this.width + dx] = this.color;
			}
		}
		this.modCount++;
	}
}
