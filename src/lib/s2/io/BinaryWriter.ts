/**
 * Sequential writer matching Blitz3D's file stream commands
 * (bbruntime/bbstream.cpp); the companion of BinaryReader.
 *
 *     WriteByte   low 8 bits of the Int
 *     WriteShort  low 16 bits, little-endian
 *     WriteInt    4 bytes, little-endian
 *     WriteFloat  IEEE single, little-endian
 *     WriteString 32 bit length, then the bytes (no terminator)
 *     WriteLine   the bytes, then CR LF
 *
 * Text is Windows-1252/latin1: one byte per char, the low 8 bits of each
 * char code. Writing at a position before the end overwrites (SeekFile).
 */
export class BinaryWriter {
	private buf: Uint8Array;
	private view: DataView;
	private len = 0;
	pos = 0;

	constructor(capacity = 256) {
		this.buf = new Uint8Array(capacity);
		this.view = new DataView(this.buf.buffer);
	}

	/** Bytes written so far (FileSize of the result). */
	get length(): number {
		return this.len;
	}

	/** Reserves n bytes at pos and returns their offset. May replace buf/view: call before touching them. */
	private need(n: number): number {
		const p = this.pos;
		const end = p + n;
		if (end > this.buf.length) {
			let cap = this.buf.length * 2;
			if (cap < end) cap = end;
			const nb = new Uint8Array(cap);
			nb.set(this.buf.subarray(0, this.len));
			this.buf = nb;
			this.view = new DataView(nb.buffer);
		}
		this.pos = end;
		if (end > this.len) this.len = end;
		return p;
	}

	/** WriteByte */
	byte(n: number): this {
		const p = this.need(1);
		this.view.setUint8(p, n & 255);
		return this;
	}

	/** WriteShort */
	short(n: number): this {
		const p = this.need(2);
		this.view.setUint16(p, n & 65535, true);
		return this;
	}

	/** WriteInt */
	int(n: number): this {
		const p = this.need(4);
		this.view.setInt32(p, n | 0, true);
		return this;
	}

	/** WriteFloat */
	float(x: number): this {
		const p = this.need(4);
		this.view.setFloat32(p, x, true);
		return this;
	}

	/** Raw bytes (WriteBytes from a bank). */
	bytes(data: Uint8Array): this {
		const p = this.need(data.length);
		this.buf.set(data, p);
		return this;
	}

	private text(s: string): void {
		const p = this.need(s.length);
		for (let i = 0; i < s.length; i++) this.buf[p + i] = s.charCodeAt(i) & 255;
	}

	/** WriteString */
	string(s: string): this {
		this.int(s.length);
		this.text(s);
		return this;
	}

	/** WriteLine */
	line(s: string): this {
		this.text(s);
		this.text('\r\n');
		return this;
	}

	/** Null-terminated string (B3D chunks; not a Blitz stream command). */
	cstring(s: string): this {
		this.text(s);
		return this.byte(0);
	}

	/** SeekFile: positions past the end are zero-filled when written to. */
	seek(pos: number): this {
		this.pos = pos < 0 ? 0 : pos;
		return this;
	}

	/** A copy of everything written. */
	toUint8Array(): Uint8Array {
		return this.buf.slice(0, this.len);
	}
}
