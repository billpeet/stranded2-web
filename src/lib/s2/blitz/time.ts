/**
 * MilliSecs, CurrentDate, CurrentTime.
 *
 *  - bbruntime.cpp bbMilliSecs -> gxRuntime::getMilliSecs -> timeGetTime():
 *    milliseconds since Windows started, as a signed 32 bit Int that wraps
 *    after about 24.8 days of uptime. Only differences are meaningful.
 *  - bbstring.cpp bbCurrentDate: strftime "%d %b %Y" of local time, C locale
 *    ("05 Mar 2008"); bbCurrentTime: "%H:%M:%S" ("09:07:03").
 */

let clock: () => number = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** MilliSecs(): integer milliseconds from a monotonic clock, wrapped to 32 bits. */
export function MilliSecs(): number {
	return Math.floor(clock()) | 0;
}

/** Replaces the clock behind MilliSecs (tests, replays). */
export function setClock(fn: () => number): void {
	clock = fn;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number): string => (n < 10 ? '0' : '') + n;

/** CurrentDate$(): "DD Mon YYYY" in local time. */
export function CurrentDate(now: Date = new Date()): string {
	return `${two(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}`;
}

/** CurrentTime$(): "HH:MM:SS", 24 hour clock, local time. */
export function CurrentTime(now: Date = new Date()): string {
	return `${two(now.getHours())}:${two(now.getMinutes())}:${two(now.getSeconds())}`;
}
