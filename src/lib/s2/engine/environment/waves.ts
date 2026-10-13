import { Cos, Sin, blitzInt, idiv } from './blitzMath';

/** Const Cworld_size=64 (includes/load_const.bb) */
const Cworld_size = 64;

/** What the wave matrix needs from the terrain. */
export interface WaveTerrain {
	/** ter_size */
	readonly size: number;
	/** TerrainY(ter,x,0,z) */
	terrainY(x: number, z: number): number;
	/** e_tery(x,z) */
	tery(x: number, z: number): number;
}

/** A shore wave spawn point (Type Twave). */
export interface Twave {
	/** Twave\x#, Twave\z#: where the wave particle is spawned */
	x: number;
	z: number;
	/** Twave\dir: yaw the wave travels along */
	dir: number;
	/**
	 * Position of the pivot Twave\h. The original restores it from integer
	 * variables after the "small waters" scan, so it is the rounded x/z.
	 */
	hx: number;
	hz: number;
}

/**
 * "The Wavematrix" part of e_environment_setup_water(): finds shore cells
 * (|height| < 5), thins them out, detects the slope direction and drops spawn
 * points that have land within game_minwavespace behind them.
 */
export function setupWaveMatrix(
	ter: WaveTerrain,
	game_minwavespace: number
): { waves: Twave[]; preCleanup: number; created: number } {
	const ter_size = ter.size;
	const sizef = 16;
	const size = idiv(ter_size * Cworld_size, sizef);
	const n = size + 1;
	// Dim env_wavematrix(size,size) : Dim env_wavematrixy#(size,size)
	const env_wavematrix = new Uint8Array(n * n);
	const env_wavematrixy = new Float32Array(n * n);
	const os = idiv(ter_size, 2) * Cworld_size;
	let cnt = 0;
	//Basic Scan
	const half = idiv(ter_size, 2) * Cworld_size;
	for (let x = -half; x <= half; x += 8) {
		for (let z = -half; z <= half; z += 8) {
			//Scan Height
			const h = ter.terrainY(x, z);
			const i = idiv(x + os, sizef) * n + idiv(z + os, sizef);
			env_wavematrixy[i] = h;
			//Shore?
			if (Math.abs(h) < 5) {
				env_wavematrix[i] = 1;
				cnt = cnt + 1;
			}
		}
	}
	const preCleanup = cnt;
	//Matrix Cleanup
	for (let x = 1; x <= size - 1; x++) {
		for (let z = 1; z <= size - 1; z++) {
			if (env_wavematrix[x * n + z] === 1) {
				const rabs = env_wavematrixy[x * n + z]; //Root Abs (not actually Abs in the original)
				//X-1,Z / X+1,Z / X,Z-1 / X,Z+1 / X-1,Z-1 / X+1,Z+1 / X+1,Z-1 / X-1,Z+1
				const nb = [
					(x - 1) * n + z,
					(x + 1) * n + z,
					x * n + z - 1,
					x * n + z + 1,
					(x - 1) * n + z - 1,
					(x + 1) * n + z + 1,
					(x + 1) * n + z - 1,
					(x - 1) * n + z + 1
				];
				for (const k of nb) {
					if (Math.abs(env_wavematrixy[k]) > rabs) env_wavematrix[k] = 0;
				}
			}
		}
	}
	//Create + Direction Detection
	const waves: Twave[] = [];
	cnt = 0;
	for (let x = 0; x <= size; x++) {
		for (let z = 0; z <= size; z++) {
			if (env_wavematrix[x * n + z] === 1) {
				//Create
				const wx = -os + x * sizef + idiv(sizef, 2);
				const wz = -os + z * sizef + idiv(sizef, 2);

				//Direction
				let hdifa = 0;
				let hdifv = 0;
				for (let a = 0; a <= 360; a += 30) {
					// RotateEntity c,0,a,0 : MoveEntity c,0,0,8 moves along (-Sin(a),0,Cos(a))
					const fx = -Sin(a);
					const fz = Cos(a);
					const h1 = ter.terrainY(Math.fround(wx + fx * 8), Math.fround(wz + fz * 8));
					//MoveEntity c,0,0,-(8*2)
					const h2 = ter.terrainY(Math.fround(wx - fx * 8), Math.fround(wz - fz * 8));
					if (Math.abs(h1 - h2) > Math.abs(hdifv)) {
						hdifa = a;
						hdifv = h1 - h2;
					}
				}
				if (hdifv < 0) {
					hdifa = hdifa + 180;
				}
				waves.push({ x: wx, z: wz, dir: hdifa, hx: wx, hz: wz });
				cnt = cnt + 1;
			}
		}
	}
	//Remove Waves in small Waters
	const kept: Twave[] = [];
	for (const w of waves) {
		// x=EntityX(Twave\h) : z=EntityZ(Twave\h) -- integer variables
		const x = blitzInt(w.hx);
		const z = blitzInt(w.hz);
		let free = 0;
		//Scan
		const fx = -Sin(w.dir);
		const fz = Cos(w.dir);
		let px = w.hx;
		let pz = w.hz;
		for (let i = 0; i <= game_minwavespace; i += 10) {
			//MoveEntity Twave\h,0,0,-10
			px = Math.fround(px - fx * 10);
			pz = Math.fround(pz - fz * 10);
			if (ter.tery(px, pz) > 0.0) {
				free = 1;
				break;
			}
		}
		//Evaluate
		if (free === 1) {
			//Free
		} else {
			//Keep
			w.hx = x;
			w.hz = z;
			kept.push(w);
		}
	}
	return { waves: kept, preCleanup, created: cnt };
}
