import { blitzInt } from './blitzMath';

/**
 * Frame timing. Ported from includes/load_fps.bb (calcfpsfactor, the `f#`
 * frame factor) and the timer part of getinput() in includes/input.bb.
 *
 * The original main loop is
 *   getinput()  -> lastms=ms : ms=MilliSecs() : timers : gt
 *   ...frame...
 *   endinput()  -> calcfpsfactor()
 * and calcfpsfactor blocks until `looplimit` (20 ms) has passed, capping the
 * game at 50 frames per second; f# is 1.0 at exactly that rate.
 *
 * A browser cannot block, so the wait becomes `frameDue()`. In a
 * requestAnimationFrame loop the tail of one frame and the head of the next
 * run together:
 *   if (!timer.frameDue(ms)) return     the wait
 *   timer.calcfpsfactor(ms)             f# of the frame that just ended
 *   timer.getinput(ms, g_unpaused)      start of the new frame
 */
export class FrameTimer {
	/** Global looplimit=20 */
	looplimit = 20;
	/** f#: frame factor, 1.0 at 50 FPS. */
	f = 1;
	/** in_gtmod#: game time modifier (reset to 1 every frame by calcfpsfactor). */
	in_gtmod = 1;
	ms = 0;
	lastms = 0;
	/** gt: game time in ms; only advances while the game is unpaused. */
	gt = 0;

	in_t50 = 0;
	in_t50go = 0;
	in_t100 = 0;
	in_t100go = 0;
	in_t500 = 0;
	in_t500go = 0;
	in_t1000 = 0;
	in_t1000go = 0;
	in_t2000 = 0;
	in_t2000go = 0;
	in_t3000 = 0;
	in_t3000go = 0;
	in_t5000 = 0;
	in_t5000go = 0;
	in_t10000 = 0;
	in_t10000go = 0;

	in_gt20 = 0;
	in_gt20go = 0;
	in_gt50 = 0;
	in_gt50go = 0;
	in_gt100 = 0;
	in_gt100go = 0;
	in_gt500 = 0;
	in_gt500go = 0;
	in_gt1000 = 0;
	in_gt1000go = 0;
	in_gt5000 = 0;
	in_gt5000go = 0;

	/** MilliSecs() is an integer. */
	static millisecs(now: number = performance.now()): number {
		return Math.floor(now);
	}

	/** The "<<< WAIT >>>" loop of calcfpsfactor: While MilliSecs()-ms<(looplimit) : Delay 1 : Wend */
	frameDue(millisecs: number): boolean {
		return millisecs - this.ms >= this.looplimit;
	}

	/** getinput(gametimer): millisecond, real-time and game-time timers. */
	getinput(millisecs: number, gametimer = 1): void {
		//Millisecs
		this.lastms = this.ms;
		this.ms = millisecs;
		const ms = this.ms;

		//Timers
		this.in_t50go = 0;
		if (ms - this.in_t50 >= 50) (this.in_t50 = ms), (this.in_t50go = 1);
		this.in_t100go = 0;
		if (ms - this.in_t100 >= 100) (this.in_t100 = ms), (this.in_t100go = 1);
		this.in_t500go = 0;
		if (ms - this.in_t500 >= 500) (this.in_t500 = ms), (this.in_t500go = 1);
		this.in_t1000go = 0;
		this.in_t2000go = 0;
		this.in_t3000go = 0;
		this.in_t5000go = 0;
		this.in_t10000go = 0;
		if (ms - this.in_t1000 >= 1000) {
			this.in_t1000 = ms;
			this.in_t1000go = 1;
			this.in_t2000 = this.in_t2000 + 1;
			if (this.in_t2000 === 2) (this.in_t2000 = 0), (this.in_t2000go = 1);
			this.in_t3000 = this.in_t3000 + 1;
			if (this.in_t3000 === 3) (this.in_t3000 = 0), (this.in_t3000go = 1);
			this.in_t5000 = this.in_t5000 + 1;
			if (this.in_t5000 === 5) (this.in_t5000 = 0), (this.in_t5000go = 1);
			this.in_t10000 = this.in_t10000 + 1;
			if (this.in_t10000 === 10) (this.in_t10000 = 0), (this.in_t10000go = 1);
		}

		//Game Timer (gt is an Int in the original: the float sum is rounded back)
		if (gametimer === 1) {
			if (this.lastms !== 0) {
				this.gt = blitzInt(Math.fround(this.gt + Math.fround(this.in_gtmod * (ms - this.lastms))));
			}
		}
		const gt = this.gt;

		//Game Time Timer
		this.in_gt20go = 0;
		if (gt - this.in_gt20 >= 20) (this.in_gt20 = gt), (this.in_gt20go = 1);
		this.in_gt50go = 0;
		if (gt - this.in_gt50 >= 50) (this.in_gt50 = gt), (this.in_gt50go = 1);
		this.in_gt100go = 0;
		if (gt - this.in_gt100 >= 100) (this.in_gt100 = gt), (this.in_gt100go = 1);
		this.in_gt500go = 0;
		if (gt - this.in_gt500 >= 500) (this.in_gt500 = gt), (this.in_gt500go = 1);
		this.in_gt1000go = 0;
		if (gt - this.in_gt1000 >= 1000) (this.in_gt1000 = gt), (this.in_gt1000go = 1);
		this.in_gt5000go = 0;
		if (gt - this.in_gt5000 >= 5000) (this.in_gt5000 = gt), (this.in_gt5000go = 1);
	}

	/**
	 * calcfpsfactor(), after the wait:
	 *   looptime=MilliSecs()-ms : f#=looptime : f#=f#*in_gtmod# : f#=f#/20.0 : in_gtmod#=1.
	 */
	calcfpsfactor(millisecs: number): number {
		//Looptime
		const looptime = millisecs - this.ms;
		//FPS Factor
		let f = Math.fround(looptime);
		f = Math.fround(f * this.in_gtmod);
		f = Math.fround(f / 20.0);
		this.f = f;
		this.in_gtmod = 1;
		return f;
	}
}
