/**
 * Decoders for the compressed WAV codecs that occur in the game's sfx folder
 * and that browsers' decodeAudioData rejects (FMOD plays them through the
 * Windows ACM codecs):
 *
 *   0x0002  Microsoft ADPCM   explode1.wav, swim.wav
 *   0x0011  IMA/DVI ADPCM     human_hit*.wav, human_die*.wav, thunder2.wav, wave*.wav,
 *                             vehicle_move.wav, watercraft_*.wav, fire.wav
 *   0x0031  GSM 6.10 (WAV49)  fish.wav, mat_wood2.wav
 *
 * Output is float PCM per channel at the file's own sample rate.
 */
export interface DecodedWav {
	sampleRate: number;
	channels: Float32Array[];
}

interface WavChunks {
	tag: number;
	channels: number;
	sampleRate: number;
	blockAlign: number;
	/** fmt chunk bytes after the 16 standard ones */
	extra: DataView;
	data: Uint8Array;
	/** fact chunk: number of samples per channel, 0 when absent */
	fact: number;
}

function readChunks(b: Uint8Array): WavChunks | null {
	const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
	const tag = (o: number) => String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3]);
	if (b.length < 12 || tag(0) !== 'RIFF' || tag(8) !== 'WAVE') return null;
	let fmt: Omit<WavChunks, 'data' | 'fact'> | null = null;
	let data: Uint8Array | null = null;
	let fact = 0;
	for (let o = 12; o + 8 <= b.length; ) {
		const id = tag(o);
		const size = Math.min(dv.getUint32(o + 4, true), b.length - o - 8);
		const p = o + 8;
		if (id === 'fmt ' && size >= 16) {
			fmt = {
				tag: dv.getUint16(p, true),
				channels: dv.getUint16(p + 2, true),
				sampleRate: dv.getUint32(p + 4, true),
				blockAlign: dv.getUint16(p + 12, true),
				extra: new DataView(b.buffer, b.byteOffset + p + 16, size - 16)
			};
		} else if (id === 'fact' && size >= 4) fact = dv.getUint32(p, true);
		else if (id === 'data') data = b.subarray(p, p + size);
		o = p + size + (size & 1);
	}
	return fmt && data ? { ...fmt, data, fact } : null;
}

/** WAVE format tag of a RIFF file, or 0. */
export function wavFormatTag(bytes: Uint8Array): number {
	return readChunks(bytes)?.tag ?? 0;
}

/** True for the format tags decodeWav handles. */
export function isCompressedWav(bytes: Uint8Array): boolean {
	const t = wavFormatTag(bytes);
	return t === 0x02 || t === 0x11 || t === 0x31;
}

/** Decodes an MS ADPCM, IMA ADPCM or GSM 6.10 WAV file. Returns null for anything else. */
export function decodeWav(bytes: Uint8Array): DecodedWav | null {
	const w = readChunks(bytes);
	if (!w || w.channels < 1 || w.channels > 2 || w.blockAlign === 0) return null;
	let pcm: Int16Array[] | null = null;
	if (w.tag === 0x11) pcm = decodeIma(w);
	else if (w.tag === 0x02) pcm = decodeMs(w);
	else if (w.tag === 0x31) pcm = decodeGsm(w);
	if (!pcm) return null;
	const n = w.fact > 0 ? Math.min(w.fact, pcm[0].length) : pcm[0].length;
	return {
		sampleRate: w.sampleRate,
		channels: pcm.map((c) => {
			const f = new Float32Array(n);
			for (let i = 0; i < n; i++) f[i] = c[i] / 32768;
			return f;
		})
	};
}

const clamp16 = (x: number) => (x > 32767 ? 32767 : x < -32768 ? -32768 : x);

/* ------------------------------------------------------------ IMA ADPCM */

const IMA_INDEX = [-1, -1, -1, -1, 2, 4, 6, 8];
// prettier-ignore
const IMA_STEP = [7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73, 80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494, 544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767];

function decodeIma(w: WavChunks): Int16Array[] {
	const ch = w.channels;
	const d = w.data;
	const perBlock = ((w.blockAlign - 4 * ch) * 8) / (4 * ch) + 1;
	const blocks = Math.floor(d.length / w.blockAlign);
	const out = Array.from({ length: ch }, () => new Int16Array(blocks * perBlock));
	const pred = [0, 0];
	const index = [0, 0];
	for (let b = 0; b < blocks; b++) {
		let p = b * w.blockAlign;
		const base = b * perBlock;
		for (let c = 0; c < ch; c++) {
			pred[c] = ((d[p] | (d[p + 1] << 8)) << 16) >> 16;
			index[c] = Math.min(88, d[p + 2]);
			out[c][base] = pred[c];
			p += 4;
		}
		// then groups of 4 bytes (8 samples) per channel, low nibble first
		for (let s = 1; s < perBlock; s += 8) {
			for (let c = 0; c < ch; c++) {
				for (let k = 0; k < 8; k++) {
					const n = (d[p + (k >> 1)] >> ((k & 1) * 4)) & 15;
					const step = IMA_STEP[index[c]];
					let diff = step >> 3;
					if (n & 1) diff += step >> 2;
					if (n & 2) diff += step >> 1;
					if (n & 4) diff += step;
					pred[c] = clamp16(n & 8 ? pred[c] - diff : pred[c] + diff);
					index[c] = Math.max(0, Math.min(88, index[c] + IMA_INDEX[n & 7]));
					out[c][base + s + k] = pred[c];
				}
				p += 4;
			}
		}
	}
	return out;
}

/* ------------------------------------------------------- Microsoft ADPCM */

const MS_ADAPT = [230, 230, 230, 230, 307, 409, 512, 614, 768, 614, 512, 409, 307, 230, 230, 230];
const MS_COEF = [
	[256, 0],
	[512, -256],
	[0, 0],
	[192, 64],
	[240, 0],
	[460, -208],
	[392, -232]
];

function decodeMs(w: WavChunks): Int16Array[] {
	const ch = w.channels;
	const d = w.data;
	let coefs = MS_COEF;
	if (w.extra.byteLength >= 6) {
		const n = w.extra.getUint16(4, true);
		if (n > 0 && w.extra.byteLength >= 6 + n * 4) {
			coefs = Array.from({ length: n }, (_, i) => [w.extra.getInt16(6 + i * 4, true), w.extra.getInt16(8 + i * 4, true)]);
		}
	}
	const perBlock = ((w.blockAlign - 7 * ch) * 2) / ch + 2;
	const blocks = Math.floor(d.length / w.blockAlign);
	const out = Array.from({ length: ch }, () => new Int16Array(blocks * perBlock));
	const i16 = (o: number) => ((d[o] | (d[o + 1] << 8)) << 16) >> 16;
	for (let b = 0; b < blocks; b++) {
		let p = b * w.blockAlign;
		const base = b * perBlock;
		const c1: number[] = [];
		const c2: number[] = [];
		const delta: number[] = [];
		const s1: number[] = [];
		const s2: number[] = [];
		for (let c = 0; c < ch; c++) {
			const k = coefs[Math.min(d[p++], coefs.length - 1)];
			c1[c] = k[0];
			c2[c] = k[1];
		}
		for (let c = 0; c < ch; c++, p += 2) delta[c] = i16(p);
		for (let c = 0; c < ch; c++, p += 2) s1[c] = i16(p);
		for (let c = 0; c < ch; c++, p += 2) s2[c] = i16(p);
		for (let c = 0; c < ch; c++) {
			out[c][base] = s2[c];
			out[c][base + 1] = s1[c];
		}
		const total = (perBlock - 2) * ch;
		for (let i = 0; i < total; i++) {
			const c = i % ch;
			const byte = d[p + (i >> 1)];
			const n = i & 1 ? byte & 15 : byte >> 4;
			const predict = Math.trunc((s1[c] * c1[c] + s2[c] * c2[c]) / 256);
			const sample = clamp16(predict + (n & 8 ? n - 16 : n) * delta[c]);
			s2[c] = s1[c];
			s1[c] = sample;
			delta[c] = Math.max(16, (MS_ADAPT[n] * delta[c]) >> 8);
			out[c][base + 2 + Math.floor(i / ch)] = sample;
		}
	}
	return out;
}

/* ------------------------------------------- GSM 06.10 full rate (WAV49) */

const GSM_FAC = [18431, 20479, 22527, 24575, 26623, 28671, 30719, 32767];
const GSM_QLB = [3277, 11469, 21299, 32767];
const GSM_MIC = [-32, -32, -16, -16, -8, -8, -4, -4];
const GSM_B = [0, 0, 2048, -2560, 94, -1792, -341, -1144];
const GSM_INVA = [13107, 13107, 13107, 13107, 19223, 17476, 31454, 29708];
const GSM_LAR_BITS = [6, 6, 5, 5, 4, 4, 3, 3];

const add = (a: number, b: number) => clamp16(a + b);
const multR = (a: number, b: number) => (a === -32768 && b === -32768 ? 32767 : (a * b + 16384) >> 15);
const asl = (a: number, n: number): number => (n >= 16 ? 0 : n <= -16 ? (a < 0 ? -1 : 0) : n < 0 ? a >> -n : ((a << n) << 16) >> 16);
const asr = (a: number, n: number): number => (n >= 16 ? (a < 0 ? -1 : 0) : n <= -16 ? 0 : n < 0 ? ((a << -n) << 16) >> 16 : a >> n);

class GsmState {
	/** dp0: 120 samples of long-term history followed by the current 40 */
	dp = new Int16Array(280);
	v = new Int16Array(9);
	larpp = [new Int16Array(8), new Int16Array(8)];
	j = 0;
	nrp = 40;
	msr = 0;

	/** Decodes one frame of 76 parameters into 160 samples. */
	decode(par: number[], out: Int16Array, at: number): void {
		const dp = this.dp;
		const wt = new Int16Array(160);
		const erp = new Int16Array(40);
		const xmp = new Int16Array(13);
		for (let j = 0; j < 4; j++) {
			const o = 8 + j * 17;
			const nc = par[o];
			const bc = par[o + 1];
			const mc = par[o + 2];
			const xmaxc = par[o + 3];

			// RPE decoding: APCM inverse quantisation and grid positioning
			let exp = 0;
			if (xmaxc > 15) exp = (xmaxc >> 3) - 1;
			let mant = xmaxc - (exp << 3);
			if (mant === 0) {
				exp = -4;
				mant = 7;
			} else {
				while (mant <= 7) {
					mant = (mant << 1) | 1;
					exp--;
				}
				mant -= 8;
			}
			const temp1 = GSM_FAC[mant];
			const temp2 = 6 - exp;
			const temp3 = asl(1, temp2 - 1);
			for (let i = 0; i < 13; i++) {
				let t = ((par[o + 4 + i] << 1) - 7) << 12;
				t = multR(temp1, t);
				t = add(t, temp3);
				xmp[i] = asr(t, temp2);
			}
			erp.fill(0);
			for (let i = 0; i < 13; i++) erp[mc + 3 * i] = xmp[i];

			// long term synthesis filtering
			const nr = nc < 40 || nc > 120 ? this.nrp : nc;
			this.nrp = nr;
			const brp = GSM_QLB[bc];
			for (let k = 0; k < 40; k++) {
				dp[120 + k] = add(erp[k], multR(brp, dp[120 + k - nr]));
			}
			for (let k = 0; k < 40; k++) wt[j * 40 + k] = dp[120 + k];
			dp.copyWithin(0, 40, 160);
		}

		// short term synthesis filtering
		const cur = this.larpp[this.j];
		const prev = this.larpp[(this.j ^= 1)];
		for (let i = 0; i < 8; i++) {
			let t = add(par[i], GSM_MIC[i]) << 10;
			t = clamp16(t - (GSM_B[i] << 1));
			t = multR(GSM_INVA[i], t);
			cur[i] = add(t, t);
		}
		const rp = new Int16Array(8);
		const segment = (mix: (p: number, c: number) => number, from: number, count: number) => {
			for (let i = 0; i < 8; i++) {
				const lar = mix(prev[i], cur[i]);
				const a = lar < 0 ? (lar === -32768 ? 32767 : -lar) : lar;
				const r = a < 11059 ? a << 1 : a < 20070 ? a + 11059 : add(a >> 2, 26112);
				rp[i] = lar < 0 ? -r : r;
			}
			const v = this.v;
			for (let k = 0; k < count; k++) {
				let sri = wt[from + k];
				for (let i = 7; i >= 0; i--) {
					sri = clamp16(sri - multR(rp[i], v[i]));
					v[i + 1] = add(v[i], multR(rp[i], sri));
				}
				v[0] = sri;
				wt[from + k] = sri;
			}
		};
		segment((p, c) => add(add(p >> 2, c >> 2), p >> 1), 0, 13);
		segment((p, c) => add(p >> 1, c >> 1), 13, 14);
		segment((p, c) => add(add(p >> 2, c >> 2), c >> 1), 27, 13);
		segment((_p, c) => c, 40, 120);

		// de-emphasis, upscaling, truncation
		let msr = this.msr;
		for (let k = 0; k < 160; k++) {
			msr = add(wt[k], multR(msr, 28180));
			out[at + k] = add(msr, msr) & ~7;
		}
		this.msr = msr;
	}
}

/** WAV49: each 65-byte block holds two 260-bit frames, fields packed LSB first. */
function decodeGsm(w: WavChunks): Int16Array[] | null {
	if (w.channels !== 1) return null;
	const d = w.data;
	const align = w.blockAlign || 65;
	const blocks = Math.floor(d.length / align);
	const out = new Int16Array(blocks * 320);
	const st = new GsmState();
	const par = new Array<number>(76);
	for (let b = 0; b < blocks; b++) {
		let bit = b * align * 8;
		const take = (n: number) => {
			let v = 0;
			for (let i = 0; i < n; i++, bit++) v |= ((d[bit >> 3] >> (bit & 7)) & 1) << i;
			return v;
		};
		for (let f = 0; f < 2; f++) {
			let k = 0;
			for (let i = 0; i < 8; i++) par[k++] = take(GSM_LAR_BITS[i]);
			for (let s = 0; s < 4; s++) {
				par[k++] = take(7);
				par[k++] = take(2);
				par[k++] = take(2);
				par[k++] = take(6);
				for (let i = 0; i < 13; i++) par[k++] = take(3);
			}
			st.decode(par, out, b * 320 + f * 160);
		}
	}
	return [out];
}
