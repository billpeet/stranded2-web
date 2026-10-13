/**
 * Sequential reader matching Blitz3D's file stream commands
 * (ReadByte/ReadShort/ReadInt/ReadFloat/ReadString/ReadLine).
 * All multi-byte values are little-endian; text is Windows-1252/latin1.
 */
export class BinaryReader {
	readonly view: DataView;
	readonly bytes: Uint8Array;
	pos = 0;

	constructor(data: ArrayBuffer | Uint8Array) {
		this.bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
		this.view = new DataView(this.bytes.buffer, this.bytes.byteOffset, this.bytes.byteLength);
	}

	get length(): number {
		return this.bytes.length;
	}

	eof(): boolean {
		return this.pos >= this.bytes.length;
	}

	byte(): number {
		return this.view.getUint8(this.pos++);
	}

	/** Blitz ReadShort returns an unsigned 16-bit value. */
	short(): number {
		const v = this.view.getUint16(this.pos, true);
		this.pos += 2;
		return v;
	}

	int(): number {
		const v = this.view.getInt32(this.pos, true);
		this.pos += 4;
		return v;
	}

	float(): number {
		const v = this.view.getFloat32(this.pos, true);
		this.pos += 4;
		return v;
	}

	take(n: number): Uint8Array {
		const out = this.bytes.subarray(this.pos, this.pos + n);
		this.pos += n;
		return out;
	}

	/** ReadString: 32-bit length followed by that many bytes. */
	string(): string {
		const n = this.int();
		return latin1(this.take(n));
	}

	/** ReadLine: up to LF (or EOF), with CR characters dropped. */
	line(): string {
		const start = this.pos;
		let end = start;
		while (end < this.bytes.length && this.bytes[end] !== 10) end++;
		this.pos = Math.min(end + 1, this.bytes.length);
		let s = latin1(this.bytes.subarray(start, end));
		if (s.includes('\r')) s = s.replaceAll('\r', '');
		return s;
	}

	/** Null-terminated string (used by the B3D format, not by Blitz streams). */
	cstring(): string {
		const start = this.pos;
		while (this.bytes[this.pos] !== 0) this.pos++;
		const s = latin1(this.bytes.subarray(start, this.pos));
		this.pos++;
		return s;
	}
}

export function latin1(bytes: Uint8Array): string {
	let s = '';
	for (let i = 0; i < bytes.length; i += 8192) {
		s += String.fromCharCode(...bytes.subarray(i, i + 8192));
	}
	return s;
}
