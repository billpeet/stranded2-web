<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { loadObjects, type ObjectDefs } from '../../../lib/s2/defs/objects';
	import { MeshCache } from '../../../lib/s2/engine/b3dToThree';
	import { BlitzCamera, configureRenderer, rotateEntity } from '../../../lib/s2/engine/blitzSpace';
	import {
		Environment,
		initialWindsway,
		update_object,
		viewfacOnLoad,
		type ParticleRequest,
		type WindSwayState
	} from '../../../lib/s2/engine/environment';
	import { Terrain } from '../../../lib/s2/engine/terrain';
	import { TextureCache } from '../../../lib/s2/engine/textures';
	import { parseMap, type MapData } from '../../../lib/s2/formats/map';
	import { HttpVfs } from '../../../lib/s2/io/Vfs';

	/**
	 * Inspection page for the environment module: every quality setting,
	 * time of day, weather and the above/below water states.
	 * `window.envdev` exposes the same controls for automated screenshots.
	 */

	let canvas: HTMLCanvasElement;
	let maps = $state<string[]>([]);
	let current = $state('');
	let status = $state('Loading game data…');
	let error = $state('');
	let info = $state('');
	let log = $state<string[]>([]);

	let hour = $state(9);
	let minute = $state(0);
	let freeze = $state(true);
	let weather = $state(0);
	let set_water = $state(3);
	let set_terrain = $state(2);
	let set_grass = $state(1);
	let set_viewrange = $state(2);
	let set_effects = $state(2);
	let set_fog = $state(true);
	let set_lightfx = $state(true);
	let set_flarefx = $state(true);
	let set_windsway = $state(true);
	let set_2dfx = $state(true);
	let showObjects = $state(true);
	let skyOverride = $state(false);
	let skyColor = $state('#ff4040');
	let skyMix = $state(0);
	let waterAlpha = $state(1);

	let env: Environment | undefined;
	let camera: BlitzCamera;
	let terrain: Terrain | undefined;
	let objectsRoot = new THREE.Group();
	let pitch = 0;
	let yaw = 0;
	let fly = true;
	const keys = new Set<string>();
	const swaying: { h: THREE.Object3D; state: WindSwayState; yaw: number; speed: number; power: number }[] = [];
	const counts: Record<string, number> = {};

	function note(kind: string) {
		counts[kind] = (counts[kind] ?? 0) + 1;
	}

	/** Pushes the UI state into the environment (the options menu / script command paths). */
	function apply(reloadQuality = false) {
		if (!env) return;
		const c = env.core;
		const s = env.settings;
		c.map_hour = hour;
		c.map_minute = minute;
		c.map_freezetime = freeze ? 1 : 0;
		if (c.env_cweather !== weather) c.e_environment_setweather(weather);
		s.set_fog = set_fog ? 1 : 0;
		s.set_lightfx = set_lightfx ? 1 : 0;
		c.set_flarefx = set_flarefx ? 1 : 0;
		s.set_windsway = set_windsway ? 1 : 0;
		s.set_2dfx = set_2dfx ? 1 : 0;
		s.set_effects = set_effects;
		if (skyOverride) {
			const n = parseInt(skyColor.slice(1), 16);
			c.in_skyoverride = [1, (n >> 16) & 255, (n >> 8) & 255, n & 255, skyMix];
		} else {
			c.in_skyoverride = [0, 0, 0, 0, 0];
		}
		c.e_environment_update_light();
		env.wateralpha(waterAlpha);
		objectsRoot.visible = showObjects;
		if (reloadQuality) {
			s.set_water = set_water;
			s.set_terrain = set_terrain;
			s.set_grass = set_grass;
			s.set_viewrange = set_viewrange;
			s.set_viewfac = viewfacOnLoad(set_viewrange);
			env.save_settings_setup();
		}
	}

	function setView(x: number, y: number, z: number, p: number, yw: number) {
		camera.position.set(x, y, z);
		pitch = p;
		yaw = yw;
	}

	function ground(): number {
		return terrain ? terrain.tery(camera.position.x, camera.position.z) : 0;
	}

	onMount(() => {
		let disposed = false;
		let raf = 0;
		const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
		configureRenderer(renderer);
		renderer.setClearColor(0x000000);
		const scene = new THREE.Scene();
		camera = new BlitzCamera(1, 3000);
		scene.add(objectsRoot);

		const resize = () => {
			const w = canvas.clientWidth || 800;
			const h = canvas.clientHeight || 600;
			renderer.setPixelRatio(window.devicePixelRatio);
			renderer.setSize(w, h, false);
			camera.setViewport(w, h);
			env?.setScreenSize(w, h);
		};

		let vfs: HttpVfs;
		let textures: TextureCache;
		let meshes: MeshCache;
		let defs: ObjectDefs;

		async function loadMap(path: string) {
			if (!env) return;
			error = '';
			status = `Loading ${path}`;
			try {
				const map: MapData = parseMap(await vfs.readBytes(path));
				current = path;
				if (terrain) scene.remove(terrain.mesh);
				terrain = new Terrain(map.terrainSize, map.heights, new THREE.MeshBasicMaterial());
				scene.add(terrain.mesh);
				const s = env.settings;
				s.set_water = set_water;
				s.set_terrain = set_terrain;
				s.set_grass = set_grass;
				s.set_viewrange = set_viewrange;
				s.set_viewfac = viewfacOnLoad(set_viewrange);
				await env.setMap(map, terrain);
				hour = env.core.map_hour;
				minute = env.core.map_minute;
				weather = env.core.env_cweather;

				// Objects, as MapViewer places them (set_object, visual part).
				objectsRoot.clear();
				swaying.length = 0;
				const models = new Set<string>();
				for (const o of map.objects) {
					const d = defs.byId.get(o.typ);
					if (d?.model) models.add(d.model);
				}
				const failed = new Set<string>();
				await Promise.all(
					[...models].map((m) =>
						meshes.load(m).catch(() => {
							failed.add(m);
						})
					)
				);
				for (const o of map.objects) {
					const d = defs.byId.get(o.typ);
					if (!d?.model || failed.has(d.model)) continue;
					const h = (await meshes.load(d.model)).instantiate({ color: d.color, alpha: d.alpha, fx: d.fx });
					h.scale.set(d.size[0], d.size[1], d.size[2]);
					rotateEntity(h, 0, o.yaw, 0);
					let y = terrain.tery(o.x, o.z);
					if (d.align === 1 && y < 1) y = 1;
					h.position.set(o.x, y, o.z);
					objectsRoot.add(h);
					if (d.swayspeed !== 0) {
						swaying.push({
							h,
							state: { windsway: initialWindsway(env.core.rng) },
							yaw: o.yaw,
							speed: d.swayspeed,
							power: d.swaypower
						});
					}
				}
				setView(0, terrain.tery(0, 0) + 33, 0, 0, 0);
				info = `terrain ${map.terrainSize} · colormap ${map.colormapSize} · ${map.objects.length} objects · waves ${env.core.waves.length} · climate ${map.climate} · fog ${map.fog.join(',')}`;
				apply();
				status = '';
			} catch (e) {
				error = e instanceof Error ? (e.stack ?? e.message) : String(e);
				status = '';
			}
		}

		const frame = (now: number) => {
			raf = requestAnimationFrame(frame);
			if (!env || !terrain) return;
			if (!env.frameBegin(now)) return;
			try {
				const f = env.timer.f;
				// Viewer movement (not the original's unit physics).
				rotateEntity(camera, pitch, yaw, 0);
				const speed = (keys.has('ShiftLeft') ? 20 : 5) * f;
				const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
				const side = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
				if (fwd || side) {
					const dir = new THREE.Vector3(side, 0, fwd).normalize().multiplyScalar(speed);
					if (fly) dir.applyQuaternion(camera.quaternion);
					else dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (-yaw * Math.PI) / 180);
					camera.position.add(dir);
				}
				if (keys.has('Space')) camera.position.y += speed;
				if (keys.has('KeyC')) camera.position.y -= speed;
				if (!fly) camera.position.y = ground() + 33;

				// cull(): wind sway of objects in view
				for (const o of swaying) {
					update_object(o.h, o.state, o.speed, o.power, f, env.settings.set_windsway, 0, o.yaw);
				}

				env.update();
				env.render();
				env.updatePost();
				if (!freeze) {
					hour = env.core.map_hour;
					minute = env.core.map_minute;
				}
			} catch (e) {
				error = e instanceof Error ? (e.stack ?? e.message) : String(e);
				cancelAnimationFrame(raf);
			}
		};

		(async () => {
			try {
				vfs = await HttpVfs.open();
				if (disposed) return;
				textures = new TextureCache(vfs);
				meshes = new MeshCache(vfs, textures);
				defs = await loadObjects(vfs);
				env = new Environment({
					renderer,
					scene,
					camera,
					vfs,
					textures,
					meshes,
					hooks: {
						game_cd: () => note('game_cd'),
						p_add: (p: ParticleRequest) => note(`p_add ${p.typ}`),
						sfx: (s) => (note(`sfx ${s}`), 0),
						sfx_emit: (s) => (note(`sfx_emit ${s}`), 0),
						free_fire_states: () => note('free_fire_states')
					}
				});
				resize();
				await env.load();
				const found: string[] = [];
				for (const dir of ['maps', 'maps\\adventure', 'maps\\menu']) {
					for (const f of vfs.list(dir)) if (f.toLowerCase().endsWith('.s2')) found.push(`${dir}\\${f}`);
				}
				maps = found;
				Object.assign(window, {
					envdev: {
						get env() {
							return env;
						},
						camera,
						scene,
						renderer,
						setView,
						loadMap,
						counts,
						/** Sets UI state by name and applies it, e.g. set({hour: 20, set_water: 5}). */
						set(v: Record<string, number | boolean | string>) {
							const q = ['set_water', 'set_terrain', 'set_grass', 'set_viewrange'];
							let quality = false;
							for (const [k, val] of Object.entries(v)) {
								setters[k]?.(val);
								if (q.includes(k)) quality = true;
							}
							apply(quality);
						},
						ground
					}
				});
				raf = requestAnimationFrame(frame);
				const wanted = new URLSearchParams(location.search).get('map');
				await loadMap(wanted && found.includes(wanted) ? wanted : (found.find((m) => m.includes('menu')) ?? found[0]));
			} catch (e) {
				error = e instanceof Error ? (e.stack ?? e.message) : String(e);
				status = '';
			}
		})();

		const setters: Record<string, (v: number | boolean | string) => void> = {
			hour: (v) => (hour = Number(v)),
			minute: (v) => (minute = Number(v)),
			freeze: (v) => (freeze = !!v),
			weather: (v) => (weather = Number(v)),
			set_water: (v) => (set_water = Number(v)),
			set_terrain: (v) => (set_terrain = Number(v)),
			set_grass: (v) => (set_grass = Number(v)),
			set_viewrange: (v) => (set_viewrange = Number(v)),
			set_effects: (v) => (set_effects = Number(v)),
			set_fog: (v) => (set_fog = !!v),
			set_lightfx: (v) => (set_lightfx = !!v),
			set_flarefx: (v) => (set_flarefx = !!v),
			set_windsway: (v) => (set_windsway = !!v),
			set_2dfx: (v) => (set_2dfx = !!v),
			showObjects: (v) => (showObjects = !!v),
			skyOverride: (v) => (skyOverride = !!v),
			skyColor: (v) => (skyColor = String(v)),
			skyMix: (v) => (skyMix = Number(v)),
			waterAlpha: (v) => (waterAlpha = Number(v))
		};

		const onKeyDown = (e: KeyboardEvent) => {
			keys.add(e.code);
			if (e.code === 'KeyF') fly = !fly;
		};
		const onKeyUp = (e: KeyboardEvent) => keys.delete(e.code);
		const onMove = (e: MouseEvent) => {
			if (document.pointerLockElement !== canvas) return;
			// Blitz: positive yaw turns left, positive pitch looks down.
			yaw -= e.movementX * 0.2;
			pitch = Math.min(Math.max(pitch + e.movementY * 0.2, -89), 89);
		};
		const onClick = () => canvas.requestPointerLock();
		document.addEventListener('keydown', onKeyDown);
		document.addEventListener('keyup', onKeyUp);
		document.addEventListener('mousemove', onMove);
		canvas.addEventListener('click', onClick);
		window.addEventListener('resize', resize);
		const logTimer = setInterval(() => {
			log = Object.entries(counts).map(([k, v]) => `${k}: ${v}`);
		}, 500);
		pageLoad = loadMap;

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			clearInterval(logTimer);
			document.removeEventListener('keydown', onKeyDown);
			document.removeEventListener('keyup', onKeyUp);
			document.removeEventListener('mousemove', onMove);
			canvas.removeEventListener('click', onClick);
			window.removeEventListener('resize', resize);
			env?.dispose();
			renderer.dispose();
		};
	});

	let pageLoad: (path: string) => Promise<void> = async () => {};

	function above() {
		setView(camera.position.x, Math.max(ground(), 0) + 33, camera.position.z, pitch, yaw);
	}
	function below() {
		// Find water near the camera: walk outwards until the ground is under the sea.
		let { x, z } = camera.position;
		for (let r = 0; r < 4000 && terrain && terrain.tery(x, z) > -40; r += 32) x = camera.position.x + r;
		setView(x, -20, z, pitch, yaw);
	}
	const weatherNames = ['0 none', '1 rain', '2 snow', '3 thunder'];
</script>

<svelte:head><title>Environment · Stranded II Web</title></svelte:head>

<div class="relative h-screen w-screen overflow-hidden bg-black text-xs text-white">
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>

	<div class="absolute top-2 left-2 flex max-h-[96vh] w-64 flex-col gap-1 overflow-auto rounded bg-black/70 p-2">
		<select class="rounded bg-neutral-800 px-1 py-0.5" value={current} onchange={(e) => pageLoad(e.currentTarget.value)}>
			{#each maps as m (m)}
				<option value={m}>{m.replace(/^maps\\/, '')}</option>
			{/each}
		</select>
		<div class="text-neutral-400">{info}</div>

		<label class="flex items-center gap-2">hour {hour}
			<input class="flex-1" type="range" min="0" max="23" bind:value={hour} oninput={() => apply()} />
		</label>
		<label class="flex items-center gap-2">minute {minute}
			<input class="flex-1" type="range" min="0" max="59" bind:value={minute} oninput={() => apply()} />
		</label>
		<label><input type="checkbox" bind:checked={freeze} onchange={() => apply()} /> freeze time (map_freezetime)</label>
		<label>weather
			<select class="rounded bg-neutral-800" bind:value={weather} onchange={() => apply()}>
				{#each weatherNames as w, i (i)}<option value={i}>{w}</option>{/each}
			</select>
		</label>

		<label>set_water
			<select class="rounded bg-neutral-800" bind:value={set_water} onchange={() => apply(true)}>
				{#each [0, 1, 2, 3, 4, 5, 6] as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
		<label>set_terrain
			<select class="rounded bg-neutral-800" bind:value={set_terrain} onchange={() => apply(true)}>
				{#each [0, 1, 2] as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
		<label>set_grass
			<select class="rounded bg-neutral-800" bind:value={set_grass} onchange={() => apply(true)}>
				{#each [0, 1, 2, 3, 4] as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
		<label>set_viewrange
			<select class="rounded bg-neutral-800" bind:value={set_viewrange} onchange={() => apply(true)}>
				{#each [0, 1, 2, 3, 4] as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
		<label>set_effects
			<select class="rounded bg-neutral-800" bind:value={set_effects} onchange={() => apply()}>
				{#each [0, 1, 2] as v (v)}<option value={v}>{v}</option>{/each}
			</select>
		</label>
		<label><input type="checkbox" bind:checked={set_fog} onchange={() => apply()} /> set_fog</label>
		<label><input type="checkbox" bind:checked={set_lightfx} onchange={() => apply()} /> set_lightfx</label>
		<label><input type="checkbox" bind:checked={set_flarefx} onchange={() => apply()} /> set_flarefx (script)</label>
		<label><input type="checkbox" bind:checked={set_windsway} onchange={() => apply()} /> set_windsway</label>
		<label><input type="checkbox" bind:checked={set_2dfx} onchange={() => apply()} /> set_2dfx</label>
		<label><input type="checkbox" bind:checked={showObjects} onchange={() => apply()} /> objects</label>
		<label><input type="checkbox" bind:checked={skyOverride} onchange={() => apply()} /> skycolor
			<input type="color" bind:value={skyColor} oninput={() => apply()} />
			mix <input class="w-12 bg-neutral-800" type="number" min="0" max="100" bind:value={skyMix} oninput={() => apply()} />
		</label>
		<label class="flex items-center gap-2">wateralpha {waterAlpha}
			<input class="flex-1" type="range" min="0" max="1" step="0.05" bind:value={waterAlpha} oninput={() => apply()} />
		</label>
		<div class="flex gap-1">
			<button class="rounded bg-neutral-700 px-2 py-0.5" onclick={above}>above water</button>
			<button class="rounded bg-neutral-700 px-2 py-0.5" onclick={below}>below water</button>
		</div>
		<div class="text-neutral-400">Click to look · WASD · Shift · Space/C · F walk/fly</div>
		<div class="text-neutral-400">{log.join(' · ')}</div>
	</div>

	{#if status}
		<div class="absolute inset-0 flex items-center justify-center bg-black/70 text-lg">{status}</div>
	{/if}
	{#if error}
		<pre class="absolute right-2 bottom-2 max-w-2xl overflow-auto rounded bg-red-900/90 px-3 py-2 whitespace-pre-wrap">{error}</pre>
	{/if}
</div>
