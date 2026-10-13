<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import { CameraRange, CreateCamera, EntityOrder, WireFrame, World } from '../../../lib/s2/bb3d';
	import { WorldEnvironment } from '../../../lib/s2/bb3d/environment';
	import { MeshCache } from '../../../lib/s2/engine/b3dToThree';
	import { configureRenderer } from '../../../lib/s2/engine/blitzSpace';
	import { Terrain } from '../../../lib/s2/engine/terrain';
	import { TextureCache } from '../../../lib/s2/engine/textures';
	import { parseMap } from '../../../lib/s2/formats/map';
	import { HttpVfs } from '../../../lib/s2/io/Vfs';
	import { MEDIA, build, handles, loop, state as sceneState, type Input } from './scene';

	/**
	 * Inspection page for bb3d. The scene itself is scene.ts, a Blitz-style
	 * script that only uses bb3d commands; this file is the host: renderer,
	 * preloading, input and the read-outs. `window.bb3ddev` exposes the same
	 * for automated checks.
	 */

	const W = 800;
	const H = 600;

	let canvas: HTMLCanvasElement;
	let status = $state('Loading game data…');
	let error = $state('');
	let pick = $state('');
	let unit = $state('');
	let stats = $state('');
	let wire = $state(false);
	let minimap = $state(true);
	let label = $state({ x: 0, y: 0, show: false });

	const input: Input = {
		forward: 0,
		turn: 0,
		jump: false,
		mouseX: W / 2,
		mouseY: H / 2,
		orbitYaw: 30,
		orbitPitch: 25,
		orbitDist: 260
	};
	const keys = new Set<string>();

	function readKeys() {
		input.forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0);
		input.turn = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0);
		input.jump = keys.has('Space');
	}

	onMount(() => {
		let raf = 0;
		let disposed = false;
		let renderer: THREE.WebGLRenderer | undefined;
		let frames = 0;
		let lastError = '';

		(async () => {
			renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
			configureRenderer(renderer);
			renderer.setPixelRatio(1);
			renderer.setSize(W, H, false);

			const vfs = await HttpVfs.open();
			const world = new World({ vfs, renderer, width: W, height: H });
			status = 'Preloading models and textures…';
			await world.preload(MEDIA, (done, total) => {
				status = `Preloading ${done}/${total}`;
			});
			const map = parseMap(await vfs.readBytes('maps\\Survival Guide.s2'));
			if (disposed) return;
			let env: WorldEnvironment | undefined;
			if (new URLSearchParams(location.search).has('env')) {
				// ?env: terrain, sea, sky, light and fog from the environment module on this bb3d world
				status = 'Setting up the environment…';
				const cam = CreateCamera();
				CameraRange(cam, 1, 3000);
				const textures = new TextureCache(vfs);
				env = new WorldEnvironment({ world, cam, vfs, textures, meshes: new MeshCache(vfs, textures) });
				env.setScreenSize(W, H);
				const terrain = new Terrain(map.terrainSize, map.heights, new THREE.MeshBasicMaterial());
				world.scene.add(terrain.mesh);
				await env.setMap(map, terrain);
				if (disposed) return;
				const e = env;
				build(map, {
					cam,
					ter: e.entities.ter,
					env_sea2: e.entities.env_sea2,
					render: () => {
						e.update();
						e.render();
						e.updatePost();
					}
				});
			} else build(map);
			status = '';

			(window as unknown as Record<string, unknown>).bb3ddev = {
				world,
				input,
				state: sceneState,
				handles,
				key(code: string, down: boolean) {
					if (down) keys.add(code);
					else keys.delete(code);
				},
				frames: () => frames,
				error: () => lastError,
				env,
				missed: () => [...world.resources.missed]
			};

			let last = performance.now();
			const frame = (now: number) => {
				raf = requestAnimationFrame(frame);
				if (env && !env.frameBegin(now)) return;
				// f#: frame factor relative to the original's 50 FPS
				const f = Math.min(3, (now - last) / 20);
				last = now;
				readKeys();
				try {
					loop(input, f);
					frames++;
				} catch (e) {
					lastError = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
					error = lastError;
					cancelAnimationFrame(raf);
					return;
				}
				const p = sceneState.pick;
				pick = p.hit
					? `PickedEntity: ${p.cls} "${p.name}"  PickedX/Y/Z: ${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)}`
					: 'PickedEntity: 0';
				const u = sceneState.unit;
				unit = `unit ${u.x.toFixed(1)}, ${u.y.toFixed(1)}, ${u.z.toFixed(1)}  yaw ${u.yaw.toFixed(0)}  CountCollisions ${u.collisions}  ${u.onGround ? 'on ground' : 'falling'}`;
				stats = `TrisRendered ${sceneState.tris}  AnimTime ${sceneState.anim.time.toFixed(2)}  objects ${sceneState.objects}`;
				label = { x: sceneState.unitScreen.x, y: sceneState.unitScreen.y, show: sceneState.unitScreen.x !== 0 };
			};
			raf = requestAnimationFrame(frame);
		})().catch((e) => {
			error = e instanceof Error ? `${e.message}\n${e.stack}` : String(e);
		});

		const down = (e: KeyboardEvent) => {
			keys.add(e.code);
			if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
		};
		const up = (e: KeyboardEvent) => keys.delete(e.code);
		window.addEventListener('keydown', down);
		window.addEventListener('keyup', up);
		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			window.removeEventListener('keydown', down);
			window.removeEventListener('keyup', up);
			renderer?.dispose();
		};
	});

	function toLogical(e: MouseEvent): [number, number] {
		const r = canvas.getBoundingClientRect();
		return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
	}

	function onMove(e: MouseEvent) {
		[input.mouseX, input.mouseY] = toLogical(e);
		if (e.buttons & 1) {
			input.orbitYaw += e.movementX * 0.4;
			input.orbitPitch = Math.max(-10, Math.min(85, input.orbitPitch + e.movementY * 0.3));
		}
	}

	function onWheel(e: WheelEvent) {
		e.preventDefault();
		input.orbitDist = Math.max(60, Math.min(1500, input.orbitDist * (e.deltaY > 0 ? 1.1 : 0.9)));
	}

	function toggleWire() {
		wire = !wire;
		WireFrame(wire ? 1 : 0);
	}

	function toggleMinimap() {
		minimap = !minimap;
		const cam2 = handles().cam2;
		if (!cam2) return;
		// CameraProjMode cam2,0 would do the same; here the camera is hidden
		if (minimap) {
			cam2.ent.setVisible(true);
			EntityOrder(cam2, -1);
		} else cam2.ent.setVisible(false);
	}
</script>

<svelte:head><title>bb3d · Stranded II Web</title></svelte:head>

<div class="flex h-screen w-screen flex-col items-center gap-2 bg-neutral-900 p-3 text-sm text-neutral-100">
	<div class="flex w-[800px] items-center gap-3">
		<span class="font-semibold">bb3d</span>
		<span class="text-neutral-400">W/S walk · A/D turn · Space jump · drag to orbit · wheel to zoom</span>
		<span class="grow"></span>
		<a class="underline" href="?">script world</a>
		<a class="underline" href="?env">environment module</a>
		<button class="rounded bg-neutral-700 px-2 py-0.5" onclick={toggleWire}>WireFrame {wire ? 1 : 0}</button>
		<button class="rounded bg-neutral-700 px-2 py-0.5" onclick={toggleMinimap}>2nd camera {minimap ? 'on' : 'off'}</button>
	</div>
	<div class="relative" style="width:{W}px;height:{H}px">
		<canvas
			bind:this={canvas}
			width={W}
			height={H}
			class="block h-full w-full"
			onmousemove={onMove}
			onwheel={onWheel}
		></canvas>
		{#if label.show}
			<div
				class="pointer-events-none absolute -translate-x-1/2 -translate-y-full rounded bg-black/60 px-1 text-xs"
				style="left:{label.x}px;top:{label.y}px"
			>
				CameraProject
			</div>
		{/if}
		{#if status}
			<div class="absolute inset-0 flex items-center justify-center bg-black/60">{status}</div>
		{/if}
	</div>
	<div class="w-[800px] font-mono text-xs leading-5">
		<div id="pick">{pick}</div>
		<div id="unit">{unit}</div>
		<div id="stats">{stats}</div>
		{#if error}
			<pre class="whitespace-pre-wrap text-red-400">{error}</pre>
		{/if}
	</div>
</div>
