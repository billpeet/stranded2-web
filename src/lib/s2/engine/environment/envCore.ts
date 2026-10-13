import { Int, Trim, split } from '../../blitz';
import { BlitzRandom, Sin, blitzInt, fmod, idiv } from './blitzMath';
import { FrameTimer } from './fps';
import { setupWaveMatrix, type Twave, type WaveTerrain } from './waves';

/**
 * Environment state and update logic, ported line by line from
 * includes/e_environment.bb. Everything that touches the 3D engine or the
 * sound system goes through `EnvEngine` / `EnvHooks`, so this file has no
 * rendering dependency and can be unit-tested; `Environment.ts` supplies the
 * Three.js implementation.
 *
 * Original global names are kept as field names.
 */

/** Particle type constants (includes/load_const.bb). */
export const Cp_bubbles = 10;
export const Cp_wave = 15;
export const Cp_hover = 19;
export const Cp_rain = 70;
export const Cp_snow = 71;
export const Cp_flash = 100;

/** Const Cworld_minute_ms=500: game minute / real milliseconds ratio. */
export const Cworld_minute_ms = 500;

/** Quality settings (sys\settings.cfg, includes/load_settings.bb). */
export interface EnvSettings {
	set_scrx: number;
	set_scry: number;
	set_viewrange: number;
	set_viewfac: number;
	/** Terrain details 0..2 */
	set_terrain: number;
	/** Water details 0..6 */
	set_water: number;
	/** Sky details. Read from settings.cfg but never used by the original. */
	set_sky: number;
	/** Effects 0..2 (wave and underwater particle density) */
	set_effects: number;
	/** Grass 0..4 */
	set_grass: number;
	set_2dfx: number;
	set_lightfx: number;
	set_windsway: number;
	set_fog: number;
	set_debug: number;
}

/**
 * set_viewfac as load_settings() derives it from set_viewrange.
 * (save_settings() uses a different table, see viewfacOnSave.)
 */
export function viewfacOnLoad(set_viewrange: number): number {
	switch (set_viewrange) {
		case 0:
			return 0.5;
		case 1:
			return 1.0;
		case 2:
			return 1.5;
		case 3:
			return 2.5;
		case 4:
			return 4.0;
		default:
			return 1.5;
	}
}

/** set_viewfac as save_settings() sets it after the options menu is confirmed. */
export function viewfacOnSave(set_viewrange: number): number {
	switch (set_viewrange) {
		case 0:
			return 0.5;
		case 1:
			return 1;
		case 2:
			return 1.5;
		case 3:
			return 2;
		case 4:
			return 2.5;
		default:
			return 1.5;
	}
}

/** The values in the shipped sys\settings.cfg. */
export function defaultSettings(): EnvSettings {
	return {
		set_scrx: 800,
		set_scry: 600,
		set_viewrange: 2,
		set_viewfac: 1.5,
		set_terrain: 2,
		set_water: 3,
		set_sky: 2,
		set_effects: 2,
		set_grass: 1,
		set_2dfx: 1,
		set_lightfx: 1,
		set_windsway: 1,
		set_fog: 1,
		set_debug: 0
	};
}

/** A p_add() call the environment makes; the particle system is not part of this module. */
export interface ParticleRequest {
	x: number;
	y: number;
	z: number;
	typ: number;
	size: number;
	a: number;
	/** EntityColor TCp\h,... applied to the new particle right after p_add. */
	color?: [number, number, number];
	/** EntityBlend TCp\h,... applied to the new particle right after p_add. */
	blend?: number;
}

/** Sounds the environment plays, by the name of the original sfx_ handle. */
export type EnvSound =
	| 'rain'
	| 'thunder0'
	| 'thunder1'
	| 'thunder2'
	| 'splash2'
	| 'gasp'
	| 'startdive'
	| 'wave0'
	| 'wave1'
	| 'wave2';

/** Callbacks into game systems this module does not implement. */
export interface EnvHooks {
	/** game_cd(): change-of-day update, called when the hour rolls over to 0. */
	game_cd?(): void;
	/** p_add(x,y,z,typ,size,a) */
	p_add?(p: ParticleRequest): void;
	/** sfx(handle, volume): returns a channel (anything truthy) or 0. */
	sfx?(sound: EnvSound, volume?: number): unknown;
	/** sfx_emit(handle, cam): positional sound at the camera, returns a channel. */
	sfx_emit?(sound: EnvSound): unknown;
	ChannelPlaying?(channel: unknown): boolean;
	StopChannel?(channel: unknown): void;
	/** e_environment_setweather: free_state() for every Cstate_fire state. */
	free_fire_states?(): void;
	/** con_add(text) debug console output. */
	con_add?(text: string): void;
}

/** A lens flare (Type Tlensf). */
export interface Tlensf {
	/** Index into gfx_p_flare() */
	sprite: number;
	scale: number;
	/** EntityOrder */
	order: number;
	/** Real (target) alpha */
	ra: number;
	/** Current alpha */
	ca: number;
	offset: number;
}

/**
 * Engine calls made by the environment code. Method names follow the Blitz
 * commands they stand for; each is applied to the entity named in the comment.
 */
export interface EnvEngine {
	/** EntityX/Y/Z(cam) */
	camX(): number;
	camY(): number;
	camZ(): number;
	/** PositionEntity cam,x,y,z */
	positionCam(x: number, y: number, z: number): void;

	/** Creates env_sea, env_sea2, env_sky, lens pivot, env_moon, env_wbox, env_ground. */
	buildEntities(flares: readonly Tlensf[]): void;
	/** e_terrainground(fx) */
	e_terrainground(fx: number): void;

	/** PositionEntity env_sky,... and env_wbox,... */
	positionSky(x: number, y: number, z: number): void;
	/** ShowEntity/HideEntity env_wbox and EntityAlpha env_wbox */
	wbox(show: boolean, alpha: number): void;
	/** PositionEntity/ShowEntity/HideEntity/EntityAlpha env_moon */
	moon(show: boolean, alpha: number, x: number, y: number, z: number): void;
	/** PositionEntity env_lenssun,... */
	positionLensSun(x: number, y: number, z: number): void;
	/** EntityInView(env_lenssun,cam) */
	lensSunInView(): boolean;
	/** EntityVisible(cam,env_lenssun) */
	lensSunVisible(): boolean;
	/** CameraProject cam,x,y,z : returns ProjectedX(), ProjectedY() */
	cameraProject(x: number, y: number, z: number): [number, number];
	/** PositionEntity fl\h,x,y,1 / EntityAlpha / ShowEntity / HideEntity for flare i */
	flare(i: number, show: boolean, x: number, y: number, alpha: number): void;

	/** EntityColor env_sky,r,g,b */
	skyColor(r: number, g: number, b: number): void;
	/** AmbientLight r,g,b */
	ambientLight(r: number, g: number, b: number): void;
	/** EntityColor env_wbox,g,g,g */
	wboxColor(grey: number): void;

	/** PositionTexture gfx_water,u,v */
	positionWaterTexture(u: number, v: number): void;
	/** The DrawBlock / CopyRect block that redraws gfx_water. */
	drawWaterTexture(set_water: number, isin: number): void;
	/** RotateEntity env_sea2,0,0,roll */
	rotateSea2(roll: number): void;
	/** EntityFX env_sky,fx : EntityFX env_wbox,fx */
	skyFX(fx: number): void;
	/** CameraFogMode / CameraFogRange / CameraFogColor */
	cameraFog(mode: number, near: number, far: number, r: number, g: number, b: number): void;
	/** The six RenderWorld calls into env_watertex and EntityTexture env_sea,env_watertex. */
	renderWaterCubemap(): void;
	/** Texture/camera setup at the top of e_environment_setup_water. */
	setupWaterReflection(set_water_texsize: number): void;
	/** EntityDistance(cam, point) for a wave pivot */
	camDistance(x: number, y: number, z: number): number;
	/** EntityInView(pivot,cam) */
	pointInView(x: number, y: number, z: number): boolean;
	/** The CopyRect loop of e_environment_water2dfx. */
	water2dfx(step: number, height: number, ws: number, inc: number): void;

	/** Terrain queries used by the wave matrix. */
	waveTerrain(): WaveTerrain | undefined;
}

export class EnvCore {
	readonly timer: FrameTimer;
	readonly rng: BlitzRandom;
	hooks: EnvHooks;
	settings: EnvSettings;

	/** Dim Dlightcycle(24,2) */
	Dlightcycle: number[][] = Array.from({ length: 25 }, () => [0, 0, 0]);

	// --- map vars
	map_day = 1;
	map_hour = 8;
	map_minute = 0;
	map_freezetime = 0;
	map_skybox = '';
	map_climate = 0;
	/** Dim map_fog(3): R,G,B,Mode */
	map_fog: number[] = [0, 0, 0, 0];
	map_timeupdate = 0;
	map_lday = 0;
	map_lhour = 0;
	map_lminute = 0;

	// --- game state the environment reads or writes
	/** m_section=Csection_editor */
	editor = false;
	g_unpaused = 1;
	g_dive = 0;
	g_airtimer = 0;
	in_tgametime = 0;
	in_waverate = 0;
	/** Dim in_skyoverride(4): on, R, G, B, mix percent */
	in_skyoverride: number[] = [0, 0, 0, 0, 0];
	/** Dim in_tercol(2,2): terrain colours for the map generator, in_tercol[channel][id] */
	in_tercol: number[][] = [
		[0, 0, 0],
		[0, 0, 0],
		[0, 0, 0]
	];
	/** set_flarefx: sun lens flares, script controlled ("lensflares" command). */
	set_flarefx = 1;
	/** game_waverate / game_minwavespace (sys\game.inf, defaults from load_game.bb) */
	game_waverate = 5000;
	game_minwavespace = 300;

	// --- env_ vars
	env_seascr = 0;
	env_seasinus = 0;
	env_watersin = 0;
	env_cweather = 0;
	env_weatherchan: unknown = 0;
	env_wa = 0;
	env_col: number[] = [0, 0, 0];
	/** Water colour reduction (e_clear: 220,110,90) */
	env_wcol: number[] = [220, 110, 90];
	set_water_texsize = 0;
	set_water_updaterate = 0;
	set_water_updatet = 0;
	set_water_updatestep = 0;

	lensf: Tlensf[] = [];
	waves: Twave[] = [];

	constructor(
		public engine: EnvEngine,
		settings: EnvSettings = defaultSettings(),
		hooks: EnvHooks = {},
		timer: FrameTimer = new FrameTimer(),
		rng: BlitzRandom = new BlitzRandom()
	) {
		this.settings = settings;
		this.hooks = hooks;
		this.timer = timer;
		this.rng = rng;
	}

	/** load_lightcycle(): parses sys\lightcycle.inf. */
	load_lightcycle(lines: readonly string[]): void {
		this.Dlightcycle = Array.from({ length: 25 }, () => [0, 0, 0]);
		for (const line of lines) {
			let equal = line.indexOf('=') + 1;
			if (line.substring(0, 1) === '#') equal = 0;
			if (equal > 0) {
				const vr = Trim(line.substring(0, equal - 1));
				const val = Trim(line.substring(equal));
				const varint = Int(vr);
				if (varint >= 0 && varint <= 23) {
					const splits = split(val, ',', 2);
					this.Dlightcycle[varint][0] = Int(Trim(splits[0]));
					this.Dlightcycle[varint][1] = Int(Trim(splits[1]));
					this.Dlightcycle[varint][2] = Int(Trim(splits[2]));
				} else {
					throw new Error(`Invalid lighcycle Property '${vr}' - Use a number between 0 and 23`);
				}
			}
		}
	}

	/** The environment part of e_clear(). */
	e_clear(): void {
		this.env_wcol = [220, 110, 90];
		this.env_cweather = 0;
		if (this.env_weatherchan) {
			if (this.hooks.ChannelPlaying?.(this.env_weatherchan)) {
				this.hooks.StopChannel?.(this.env_weatherchan);
				this.env_weatherchan = 0;
			}
		}
		this.env_wa = 0;
		this.in_skyoverride = [0, 0, 0, 0, 0];
		this.set_flarefx = 1;
		this.timer.in_gtmod = 1;
	}

	/** e_environment(update=1): build environment objects. */
	e_environment(update = 1): void {
		//Lensflares
		this.lensf = [];
		//e_addflare(sprite,scale#,alpha#,order,offset#)
		this.e_addflare(1, 0.125, 0.4, -1, 1);
		this.e_addflare(0, 0.3, 0.1, -2, 2);
		this.e_addflare(1, 0.25, 0.3, -3, 3);
		this.e_addflare(1, 0.125, 0.3, -4, 8);
		this.e_addflare(0, 0.4, 0.2, -4, -3);
		this.e_addflare(1, 0.2, 0.2, -5, -2);

		//Sea 1, Sea 2, Sky, Lensflares, Moon, Weatherbox, Ground
		this.engine.buildEntities(this.lensf);
		this.engine.e_terrainground(1);

		//Set Gametime Timer Cache Var
		this.in_tgametime = this.timer.gt;

		//Weather
		switch (this.map_climate) {
			case 0:
			case 1:
				break;
			case 2:
				this.env_cweather = 0;
				break;
			case 3:
				this.env_cweather = 1;
				break;
			case 4:
				this.env_cweather = 2;
				break;
			case 5:
				this.env_cweather = 3;
				break;
		}
		if (this.env_cweather !== 0) {
			this.env_wa = 0.75;
		} else {
			this.env_wa = 0;
		}

		//Update
		if (update) {
			this.e_environment_update();
			this.e_environment_update_light();
			this.e_environment_setup_water();
		}
	}

	/** e_addflare(sprite,scale#,alpha#,order,offset#) */
	e_addflare(sprite: number, scale: number, alpha: number, order: number, offset: number): void {
		this.lensf.push({ sprite, scale, order, ra: alpha, ca: 0, offset });
	}

	/** StopChannel block repeated throughout e_environment_update. */
	private stopWeatherChannel(): void {
		if (this.env_weatherchan) {
			if (this.hooks.ChannelPlaying?.(this.env_weatherchan)) {
				this.hooks.StopChannel?.(this.env_weatherchan);
				this.env_weatherchan = 0;
			}
		}
	}

	/** The "Time" block of e_environment_update(). Returns true when a minute passed. */
	e_environment_update_time(): boolean {
		const gt = this.timer.gt;
		if (!this.editor) {
			if (!this.map_freezetime) {
				//Inc. Minute?
				if (gt - this.in_tgametime >= Cworld_minute_ms) {
					//Set Last Time Update
					if (this.map_timeupdate === 0) {
						this.map_lday = this.map_day; //Map Time Update last Day
						this.map_lhour = this.map_hour; //Map Time Update last Hour
						this.map_lminute = this.map_minute; //Map Time Update last Minute
						this.map_lminute = this.map_lminute + 1;
						//Inc. Hour
						if (this.map_lminute >= 60) {
							this.map_lminute = 0;
							this.map_lhour = this.map_lhour + 1;
							//Inc. Day
							if (this.map_lhour >= 24) {
								this.map_lhour = 0;
								this.map_lday = this.map_lday + 1;
							}
						}
						this.map_timeupdate = 1;
					}
					this.in_tgametime = gt;
					this.map_minute = this.map_minute + 1;
					//Inc. Hour
					if (this.map_minute >= 60) {
						this.map_minute = 0;
						this.map_hour = this.map_hour + 1;
						//Inc. Day
						if (this.map_hour >= 24) {
							this.map_hour = 0;
							this.map_day = this.map_day + 1;
							//Change Day Update Stuff
							this.hooks.game_cd?.();
						}
					}
					this.e_environment_update_light();
					return true;
				}
			}
		}
		return false;
	}

	/**
	 * Moon alpha schedule from e_environment_update(): fades in during hour 19,
	 * out during hour 7, hidden from 8 to 18. Returns -1 when hidden.
	 */
	moonAlpha(): number {
		if (this.map_hour >= 19) {
			if (this.map_hour === 19) return Math.fround(this.map_minute / 60.0);
			return 1.0;
		} else if (this.map_hour <= 7) {
			if (this.map_hour === 7) return Math.fround((60 - this.map_minute) / 60.0);
			return 1.0;
		}
		return -1;
	}

	/** "Disable Lensflares at night": lensaf# after the time-of-day factors. */
	lensNightFactor(lensaf: number): number {
		if (this.map_hour >= 18) {
			if (this.map_hour === 18) {
				const a = Math.fround((60 - this.map_minute) / 60.0);
				lensaf = Math.fround(lensaf * a);
			} else {
				lensaf = 0.0;
			}
		}
		if (this.map_hour <= 7) {
			if (this.map_hour === 7) {
				const a = Math.fround(this.map_minute / 60.0);
				lensaf = Math.fround(lensaf * a);
			} else {
				lensaf = 0.0;
			}
		}
		return lensaf;
	}

	/** e_environment_update(): time, sky, weather, moon, lens flares. */
	e_environment_update(): void {
		const e = this.engine;
		const h = this.hooks;
		const t = this.timer;
		const rng = this.rng;
		const f = t.f;
		const s = this.settings;

		//Time
		this.e_environment_update_time();

		//Sky
		//Greybox
		e.positionSky(e.camX(), e.camY(), e.camZ());
		if (this.env_cweather !== 0) {
			this.env_wa = Math.fround(this.env_wa + 0.002 * f);
			if (this.env_wa > 0.75) this.env_wa = 0.75;
		} else {
			this.env_wa = Math.fround(this.env_wa - 0.002 * f);
			if (this.env_wa < 0.0) this.env_wa = 0.0;
		}
		if (this.env_wa <= 0) {
			e.wbox(false, 0);
		} else {
			e.wbox(true, this.env_wa);
		}

		//Weather
		//Over Water
		let lensaf = 1.0;
		if (this.g_dive === 0) {
			switch (this.env_cweather) {
				//0 - None
				case 0:
					this.stopWeatherChannel();
					break;
				//1 - Rain
				case 1:
					lensaf = 0.35;

					//SFX
					if (!this.env_weatherchan) {
						this.env_weatherchan = h.sfx_emit?.('rain') ?? 0;
					} else {
						if (!h.ChannelPlaying?.(this.env_weatherchan)) {
							this.env_weatherchan = h.sfx?.('rain') ?? 0;
						}
					}
					//Thunder
					if (this.g_unpaused === 1) {
						if (t.in_t2000go === 1) {
							if (rng.Rand(10) === 1) {
								h.sfx?.(`thunder${rng.Rand(0, 2)}` as EnvSound);
								if (rng.Rand(5) !== 1) {
									h.p_add?.({
										x: 0,
										y: 0,
										z: 0,
										typ: Cp_flash,
										size: rng.Rnd(0.1, 0.3),
										a: rng.Rnd(0.5, 1),
										color: [255, 255, 255],
										blend: 3
									});
								}
							}
						}
					}

					//Particles
					if (this.g_unpaused === 1) {
						if (t.in_gt20go) {
							for (let i = 1; i <= 3; i++) {
								h.p_add?.({
									x: e.camX() + rng.Rand(-150, 150),
									y: 0,
									z: e.camZ() + rng.Rand(-100, 100),
									typ: Cp_rain,
									size: rng.Rnd(20, 30),
									a: 1
								});
							}
						}
					}
					break;

				//2 - Snow
				case 2:
					lensaf = 0.35;

					this.stopWeatherChannel();

					//Particles
					if (this.g_unpaused === 1) {
						if (t.in_gt20go) {
							for (let i = 1; i <= 2; i++) {
								h.p_add?.({
									x: e.camX() + rng.Rand(-200, 200),
									y: 0,
									z: e.camZ() + rng.Rand(-100, 100),
									typ: Cp_snow,
									size: rng.Rnd(30, 50),
									a: 1
								});
							}
						}
					}
					break;

				//3 - Thunder
				case 3:
					lensaf = 0.4;

					this.stopWeatherChannel();

					//Thunderclap
					if (this.g_unpaused === 1) {
						if (t.in_t1000go === 1) {
							if (rng.Rand(5) === 1) {
								h.sfx?.(`thunder${rng.Rand(0, 2)}` as EnvSound);
								if (rng.Rand(5) !== 1) {
									h.p_add?.({
										x: 0,
										y: 0,
										z: 0,
										typ: Cp_flash,
										size: rng.Rnd(0.08, 0.3),
										a: rng.Rnd(0.6, 1.3),
										color: [255, 255, 255],
										blend: 3
									});
								}
							}
						}
					}
					break;
			}
			//Under Water
		} else {
			lensaf = 0.3;

			this.stopWeatherChannel();
		}

		//Moon
		{
			const a = this.moonAlpha();
			if (a >= 0) {
				e.moon(true, a, e.camX() - 2000, e.camY() + 1000, e.camZ() - 1500);
			} else {
				e.moon(false, 0, 0, 0, 0);
			}
		}

		//Lensflares
		if (s.set_lightfx === 1 && this.set_flarefx === 1) {
			//Disable Lensflares at night
			lensaf = this.lensNightFactor(lensaf);

			//Show?
			let showf = 0;

			//Setup Virtual Sun
			const sx = e.camX() - 2000;
			const sy = e.camY() + 1000;
			const sz = e.camZ() - 1500;
			e.positionLensSun(sx, sy, sz);

			//Check
			if (e.lensSunInView()) {
				if (e.lensSunVisible()) {
					//Show!
					showf = 1;

					//determine sun visible x/y coords using camera 3d to 2d conversion
					const [px, py] = e.cameraProject(sx, sy, sz);
					const lx = blitzInt(px);
					const ly = blitzInt(py);
					//determine center of screen
					const cx = idiv(s.set_scrx, 2);
					const cy = idiv(s.set_scry, 2);

					//determine vector from center to sun's x/y screen position
					const vx = cx - lx;
					const vy = cy - ly;
					let distance: number;
					if (vx === 0 && vy === 0) {
						distance = 1.0; //to fix sqr(0) fail
					} else {
						distance = Math.fround(Math.sqrt(vx * vx + vy * vy)); //determine length of vector (pythagoras)
					}
					//normalise vector (determine 1 unit size in x and y coordinates)
					const nx = Math.fround(vx / distance);
					const ny = Math.fround(vy / distance);

					//Setup each Flare
					for (let i = 0; i < this.lensf.length; i++) {
						const fl = this.lensf[i];
						//Calc Position
						const fx = blitzInt(Math.fround(cx - Math.fround(nx * Math.fround(distance / fl.offset))));
						const fy = blitzInt(Math.fround(cy - Math.fround(ny * Math.fround(distance / fl.offset))));
						//Alpha Fadein
						if (fl.ca < fl.ra) {
							fl.ca = Math.fround(fl.ca + 0.02 * f);
							if (fl.ca > fl.ra) fl.ca = fl.ra;
						}
						//Set Position, Alpha, Show
						e.flare(i, true, fx, fy, Math.fround(fl.ca * lensaf));
					}
				}
			}
			//Do not Show
			if (showf === 0) {
				//Alpha Fadeout
				for (let i = 0; i < this.lensf.length; i++) {
					const fl = this.lensf[i];
					if (fl.ca > 0.0) {
						fl.ca = Math.fround(fl.ca - 0.03 * f);
						if (fl.ca < 0.0) fl.ca = 0;
						e.flare(i, true, NaN, NaN, Math.fround(fl.ca * lensaf));
					} else {
						e.flare(i, false, NaN, NaN, 0);
					}
				}
			}
		} else {
			//Hide when disabled
			for (let i = 0; i < this.lensf.length; i++) e.flare(i, false, NaN, NaN, 0);
		}
	}

	/**
	 * The colour computation of e_environment_update_light(), without side
	 * effects: final sky colour, ambient light and weather box grey.
	 */
	lightColors(): { rgb: [number, number, number]; ambient: [number, number, number]; grey: number } {
		const fr = Math.fround;
		const L = this.Dlightcycle;
		//Determine Hours
		const h1 = this.map_hour;
		let h2 = this.map_hour + 1;
		if (h2 >= 24) h2 = 0;
		//Determine Final Color by Mixing the Colors of both Hours in Relation to Minutes
		const percent = fr(fr(this.map_minute) / 59);
		const inv = fr(1 - percent);
		let rf = blitzInt(fr(fr(L[h1][0] * inv) + fr(L[h2][0] * percent)));
		let gf = blitzInt(fr(fr(L[h1][1] * inv) + fr(L[h2][1] * percent)));
		let bf = blitzInt(fr(fr(L[h1][2] * inv) + fr(L[h2][2] * percent)));
		//Sky Override?
		const o = this.in_skyoverride;
		if (o[0] === 1) {
			//Unmixed
			if (o[4] === 0) {
				rf = o[1];
				gf = o[2];
				bf = o[3];
				//Mixed
			} else {
				let p1 = fr(o[4] / 100.0);
				if (p1 < 0.0) p1 = 0.0;
				if (p1 > 1.0) p1 = 1.0;
				const p2 = fr(1 - p1);
				rf = blitzInt(fr(fr(o[1] * p2) + fr(rf * p1)));
				gf = blitzInt(fr(fr(o[2] * p2) + fr(gf * p1)));
				bf = blitzInt(fr(fr(o[3] * p2) + fr(bf * p1)));
			}
		}
		let ra = rf - 55;
		if (ra < 0) ra = 0;
		let ga = gf - 55;
		if (ga < 0) ga = 0;
		let ba = bf - 55;
		if (ba < 0) ba = 0;
		//Greybox
		let grey = idiv(rf + gf + bf, 3);
		grey = grey - 85;
		if (grey < 0) grey = 0;
		return { rgb: [rf, gf, bf], ambient: [ra, ga, ba], grey };
	}

	/** e_environment_update_light() */
	e_environment_update_light(): void {
		const { rgb, ambient, grey } = this.lightColors();
		//Cache Colors in global env_col Array
		this.env_col[0] = rgb[0];
		this.env_col[1] = rgb[1];
		this.env_col[2] = rgb[2];
		//Use Colors!
		this.engine.skyColor(rgb[0], rgb[1], rgb[2]);
		this.engine.ambientLight(ambient[0], ambient[1], ambient[2]);
		//Greybox
		this.engine.wboxColor(grey);
	}

	/** Fog state above water, as e_environment_update_water sets it. */
	fogAboveWater(): { mode: number; near: number; far: number; rgb: [number, number, number] } {
		const s = this.settings;
		if (s.set_fog === 1 || this.map_fog[3] > 0) {
			let wr = this.env_col[0] - (255 - this.map_fog[0]);
			if (wr < 0) wr = 0;
			let wg = this.env_col[1] - (255 - this.map_fog[1]);
			if (wg < 0) wg = 0;
			let wb = this.env_col[2] - (255 - this.map_fog[2]);
			if (wb < 0) wb = 0;
			return {
				mode: 1,
				near: 500 * s.set_viewfac - 250,
				far: 500 * s.set_viewfac + 600 - 250,
				rgb: [wr, wg, wb]
			};
		}
		return { mode: 0, near: 0, far: 0, rgb: [0, 0, 0] };
	}

	/** Fog state under water: range 1..500, sky colour minus env_wcol. */
	fogUnderWater(): { mode: number; near: number; far: number; rgb: [number, number, number] } {
		let wr = this.env_col[0] - this.env_wcol[0];
		if (wr < 0) wr = 0;
		let wg = this.env_col[1] - this.env_wcol[1];
		if (wg < 0) wg = 0;
		let wb = this.env_col[2] - this.env_wcol[2];
		if (wb < 0) wb = 0;
		return { mode: 1, near: 1, far: 500, rgb: [wr, wg, wb] };
	}

	/** e_environment_update_water(forced=0) */
	e_environment_update_water(forced = 0): void {
		const e = this.engine;
		const h = this.hooks;
		const t = this.timer;
		const rng = this.rng;
		const f = t.f;
		const s = this.settings;
		const gt = t.gt;
		const ms = t.ms;

		//Scroll Water Textures
		this.env_seascr = Math.fround(fmod(Math.fround(this.env_seascr + 0.0003 * f), 128));
		e.positionWaterTexture(this.env_seascr, this.env_seascr);

		//Water Sinus
		this.env_seasinus = Math.fround(fmod(Math.fround(this.env_seasinus + 2 * f), 360));

		//Water Textur
		const isin = blitzInt(this.env_seasinus);
		e.drawWaterTexture(s.set_water, isin);

		//Over Water
		if (e.camY() > 0) {
			//Surface + Sky
			e.rotateSea2(0);
			e.skyFX(1 + 8);

			//Dive
			if (this.g_dive === 1) {
				this.g_dive = 0;
				h.sfx?.('splash2');
				if (gt - this.g_airtimer > 1500) {
					h.sfx?.('gasp');
				}
			}

			//Air Timer
			this.g_airtimer = gt;

			//Fog
			const fog = this.fogAboveWater();
			e.cameraFog(fog.mode, fog.near, fog.far, fog.rgb[0], fog.rgb[1], fog.rgb[2]);

			//Waves
			if (!this.editor) {
				if (gt - this.in_waverate > this.game_waverate) {
					this.in_waverate = gt;
					if (this.g_unpaused) {
						let closewave = 0;
						//Waves?
						if (s.set_effects > 0) {
							//Smome
							if (s.set_effects === 1) {
								for (const w of this.waves) {
									if (rng.Rand(2) === 1) {
										const dist = blitzInt(e.camDistance(w.hx, 0, w.hz));
										if (dist < 1000) {
											if (dist < 300) {
												closewave = 1;
												h.p_add?.({ x: w.x, y: 0, z: w.z, typ: Cp_wave, size: rng.Rand(20, 30), a: w.dir });
											} else if (e.pointInView(w.hx, 0, w.hz)) {
												h.p_add?.({ x: w.x, y: 0, z: w.z, typ: Cp_wave, size: rng.Rand(20, 30), a: w.dir });
											}
										}
									}
								}
								//Many
							} else {
								for (const w of this.waves) {
									const dist = blitzInt(e.camDistance(w.hx, 0, w.hz));
									if (dist < 1500) {
										if (dist < 300) {
											closewave = 1;
											h.p_add?.({ x: w.x, y: 0, z: w.z, typ: Cp_wave, size: rng.Rand(20, 30), a: w.dir });
										} else if (e.pointInView(w.hx, 0, w.hz)) {
											h.p_add?.({ x: w.x, y: 0, z: w.z, typ: Cp_wave, size: rng.Rand(20, 30), a: w.dir });
										}
									}
								}
							}
						}
						//Wave SFX
						if (closewave === 1) {
							h.sfx?.(`wave${rng.Rand(0, 2)}` as EnvSound, rng.Rnd(0.3, 0.6));
						}
					}
				}
			}

			//Cubemap Stuff?
			if (this.set_water_texsize > 0) {
				//Update Time?
				if (ms - this.set_water_updatet >= this.set_water_updaterate || forced === 1) {
					this.set_water_updatet = ms;
					//Update 2 Sites (the original's Select on set_water_updatestep is commented
					//out, so all six faces are rendered every time)
					e.renderWaterCubemap();
					this.set_water_updatestep = this.set_water_updatestep + 1;
					if (this.set_water_updatestep > 2) this.set_water_updatestep = 0;
				}
			}

			//Under Water
		} else {
			//Surface + Sky
			e.rotateSea2(-180);
			e.skyFX(1);

			//Dive
			if (this.g_dive === 0) {
				h.sfx?.('startdive');
				this.g_dive = 1;
			}

			//Fog
			const fog = this.fogUnderWater();
			e.cameraFog(fog.mode, fog.near, fog.far, fog.rgb[0], fog.rgb[1], fog.rgb[2]);

			//Bubbles + Stuff
			if (this.g_unpaused) {
				//Bubbles
				if (rng.Rand(10) === 1) {
					h.p_add?.({
						x: e.camX() + rng.Rnd(-5, 5),
						y: e.camY() - 10,
						z: e.camZ() + rng.Rnd(-5, 5),
						typ: Cp_bubbles,
						size: rng.Rnd(1, 3),
						a: 1
					});
				}
				//Hover
				if (s.set_effects > 0) {
					if (rng.Rand(s.set_effects === 1 ? 4 : 2) === 1) {
						let y = blitzInt(e.camY() + rng.Rand(-100, 100));
						if (y > -20) y = -rng.Rand(20, 70);
						h.p_add?.({
							x: e.camX() + rng.Rand(-200, 200),
							y,
							z: e.camZ() + rng.Rnd(-200, 200),
							typ: Cp_hover,
							size: rng.Rnd(0.3, 5),
							a: 1
						});
					}
				}
			}
		}

		//Cam Pos
		if (Math.abs(e.camY()) < 1.3) {
			if (e.camY() > 0) {
				e.positionCam(e.camX(), 1.3, e.camZ());
			} else {
				e.positionCam(e.camX(), -1.3, e.camZ());
			}
		}
	}

	/** e_environment_setup_water() */
	e_environment_setup_water(): void {
		//Setup Values
		switch (this.settings.set_water) {
			case 0:
			case 1:
			case 2:
			case 3:
				this.set_water_texsize = 0;
				break;
			case 4:
				this.set_water_texsize = 64;
				this.set_water_updaterate = 2;
				break;
			case 5:
				this.set_water_texsize = 128;
				this.set_water_updaterate = 1;
				break;
			case 6:
				this.set_water_texsize = 256;
				this.set_water_updaterate = 0;
				break;
		}
		//Setup Texture / Cam
		this.engine.setupWaterReflection(this.set_water_texsize);

		//The Wavematrix
		const ter = this.engine.waveTerrain();
		if (!ter) {
			this.waves = [];
			return;
		}
		const r = setupWaveMatrix(ter, this.game_minwavespace);
		this.waves = r.waves;
		if (this.settings.set_debug === 1) {
			this.hooks.con_add?.('Wave Spawns (PreCleanup): ' + r.preCleanup);
			this.hooks.con_add?.('Wave Spawns: ' + r.created);
		}
	}

	/**
	 * e_environment_water2dfx(): 2D sine wave effect while diving. Returns the
	 * strip parameters when the effect is active this frame.
	 */
	e_environment_water2dfx(): { step: number; height: number; ws: number; inc: number } | undefined {
		const s = this.settings;
		if (s.set_2dfx) {
			if (this.engine.camY() < 0) {
				this.env_watersin = Math.fround(this.env_watersin + 6 * this.timer.f);
				const ws = this.env_watersin;
				let p: { step: number; height: number; ws: number; inc: number } | undefined;
				switch (s.set_water) {
					//Low Steprate
					case 0:
					case 1:
						p = { step: 20, height: 20, ws, inc: 20 };
						break;
					//Normal Steprate
					case 2:
					case 3:
					case 4:
						p = { step: 10, height: 10, ws, inc: 15 };
						break;
					//High Steprate (strips are 10 high but only 5 apart, so they overlap)
					case 5:
					case 6:
						p = { step: 5, height: 10, ws, inc: 7 };
						break;
				}
				if (p) this.engine.water2dfx(p.step, p.height, p.ws, p.inc);
				return p;
			}
		}
		return undefined;
	}

	/** e_environment_setweather(weather) */
	e_environment_setweather(weather: number): void {
		this.env_cweather = weather;
		//Deplete Fire on Rain / Snow
		if (weather === 1 || weather === 2) {
			this.hooks.free_fire_states?.();
		}
	}

	/** e_tercol(r,g,b,id): set terrain colour (map generator) */
	e_tercol(r: number, g: number, b: number, id: number): void {
		this.in_tercol[0][id] = r;
		this.in_tercol[1][id] = g;
		this.in_tercol[2][id] = b;
	}

	/** Script command "skycolor": mode[,r,g,b[,mix]] */
	skycolor(mode: number, r?: number, g?: number, b?: number, mix?: number): void {
		this.in_skyoverride[4] = 0;
		this.in_skyoverride[0] = mode;
		if (r !== undefined) {
			this.in_skyoverride[1] = r;
			this.in_skyoverride[2] = g ?? 0;
			this.in_skyoverride[3] = b ?? 0;
			if (mix !== undefined) this.in_skyoverride[4] = mix;
		}
		this.e_environment_update_light();
	}
}

/**
 * Per-strip horizontal shifts of e_environment_water2dfx:
 *   For y=0 To set_scry Step step : CopyRect 0,y,set_scrx,height,Sin(ws#)*6.,y : ws#=ws#+inc
 */
export function water2dfxShifts(set_scry: number, step: number, ws: number, inc: number): number[] {
	const out: number[] = [];
	for (let y = 0; y <= set_scry; y += step) {
		out.push(blitzInt(Sin(ws) * 6));
		ws = Math.fround(ws + inc);
	}
	return out;
}
