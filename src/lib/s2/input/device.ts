/**
 * gxDevice (gxruntime/gxdevice.cpp): the state behind KeyDown/KeyHit/GetKey
 * and MouseDown/MouseHit/GetMouse. No DOM.
 */
const QUE_SIZE = 32;
const QUE_MASK = QUE_SIZE - 1;

export class Device {
	readonly axis_states = new Float64Array(32);
	private hit_count = new Int32Array(256);
	private down_state = new Uint8Array(256);
	private que = new Int32Array(QUE_SIZE);
	/** Parallel to `que`: the character belonging to the queued key press. */
	private queAsc = new Int32Array(QUE_SIZE);
	private put = 0;
	private get = 0;

	reset(): void {
		this.down_state.fill(0);
		this.axis_states.fill(0);
		this.hit_count.fill(0);
		this.put = this.get = 0;
	}

	/** `asc` is only meaningful for the keyboard (see getKeyAscii). */
	downEvent(key: number, asc = 0): void {
		if (key < 0 || key > 255) return;
		this.down_state[key] = 1;
		++this.hit_count[key];
		if (this.put - this.get < QUE_SIZE) {
			this.que[this.put & QUE_MASK] = key;
			this.queAsc[this.put & QUE_MASK] = asc;
			this.put++;
		}
	}

	upEvent(key: number): void {
		if (key < 0 || key > 255) return;
		this.down_state[key] = 0;
	}

	setDownState(key: number, down: boolean): void {
		if (down === !!this.down_state[key]) return;
		if (down) this.downEvent(key);
		else this.upEvent(key);
	}

	/** Releases every key without counting hits (window lost focus). */
	releaseAll(): void {
		this.down_state.fill(0);
	}

	/** FlushKeys/FlushMouse: forgets hits and queued presses; keys that are held stay down. */
	flush(): void {
		this.hit_count.fill(0);
		this.put = this.get = 0;
	}

	keyDown(key: number): number {
		return key >= 0 && key <= 255 ? this.down_state[key] : 0;
	}

	/** Number of presses since the last call for this key; resets the count. */
	keyHit(key: number): number {
		if (key < 0 || key > 255) return 0;
		const n = this.hit_count[key];
		this.hit_count[key] = 0;
		return n;
	}

	/** Next queued key press (scancode / button number), 0 when the queue is empty. */
	getKey(): number {
		return this.get < this.put ? this.que[this.get++ & QUE_MASK] : 0;
	}

	/**
	 * GetKey(): pops one queued press and returns its character. A press with
	 * no character is consumed and yields 0, exactly as toAscii(getKey()) does.
	 */
	getKeyAscii(): number {
		return this.get < this.put ? this.queAsc[this.get++ & QUE_MASK] : 0;
	}
}
