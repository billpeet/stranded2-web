<script lang="ts">
	import { onMount } from 'svelte';
	import * as THREE from 'three';
	import {
		MeshCache,
		animate,
		animating,
		animLength,
		animSeq,
		animTime,
		copyEntity,
		countChildren,
		entityAlpha,
		entityAutoFade,
		entityColor,
		entityFX,
		entityShininess,
		extractAnimSeq,
		findChild,
		getAnimator,
		meshDepth,
		meshHeight,
		meshWidth,
		setAnimTime,
		updateAutoFade,
		updateWorld
	} from '../../../lib/s2/engine/b3dToThree';
	import {
		BlitzCamera,
		LIGHT_SCALE,
		configureRenderer,
		rgb255,
		rotateEntity
	} from '../../../lib/s2/engine/blitzSpace';
	import * as textureApi from '../../../lib/s2/engine/textures';
	import * as modelApi from '../../../lib/s2/engine/b3dToThree';
	import { TextureCache } from '../../../lib/s2/engine/textures';
	import { HttpVfs, readLines } from '../../../lib/s2/io/Vfs';

	interface Preset {
		name: string;
		first: number;
		last: number;
		speed: number;
	}

	let canvas: HTMLCanvasElement;
	let models = $state<string[]>([]);
	let filter = $state('');
	let current = $state('');
	let loadMode = $state<'anim' | 'static'>('anim');
	let error = $state('');
	let info = $state('');
	let nodeNames = $state<string[]>([]);
	let presets = $state<Preset[]>([]);

	let mode = $state(1);
	let speed = $state(0.1);
	let transition = $state(0);
	let first = $state(0);
	let last = $state(0);
	let seqs = $state<{ index: number; label: string }[]>([]);
	let seq = $state(0);
	let playing = $state(true);
	let copies = $state(false);
	let light = $state(true);
	let bones = $state(false);

	let time = $state(0);
	let length = $state(0);
	let frames = $state(0);
	let isAnimating = $state(false);
	let curSeq = $state(0);

	const shown = $derived(models.filter((m) => m.toLowerCase().includes(filter.toLowerCase())));

	const scene = new THREE.Scene();
	const holder = new THREE.Group();
	const camera = new BlitzCamera(1, 20000);
	const ambient = new THREE.AmbientLight();
	const sun = new THREE.DirectionalLight();
	let renderer: THREE.WebGLRenderer | undefined;
	let meshes: MeshCache | undefined;
	let entity: THREE.Object3D | undefined;
	let extra: THREE.Object3D[] = [];
	let helper: THREE.SkeletonHelper | undefined;
	let unitAnims = new Map<string, Preset[]>();

	const target = new THREE.Vector3();
	let yaw = 150;
	let pitch = 15;
	let dist = 100;
	let renderError = '';

	function placeCamera() {
		rotateEntity(camera, pitch, yaw, 0);
		const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(camera.quaternion);
		camera.position.copy(target).addScaledVector(forward, -dist);
	}

	function frameModel(box: THREE.Box3) {
		if (box.isEmpty()) {
			target.set(0, 0, 0);
			dist = 100;
		} else {
			box.getCenter(target);
			dist = Math.max(box.getSize(new THREE.Vector3()).length() * 0.75, 5);
		}
		camera.near = Math.max(dist / 200, 0.05);
		camera.far = dist * 50;
		camera.updateProjectionMatrix();
		placeCamera();
	}

	async function load(path: string) {
		if (!meshes) return;
		current = path;
		error = '';
		try {
			holder.clear();
			helper = undefined;
			extra = [];
			let e: THREE.Object3D;
			if (loadMode === 'anim') e = await meshes.loadAnimMesh(path);
			else e = (await meshes.load(path)).instantiate();
			if (current !== path) return;
			entity = e;
			holder.add(e);
			holder.updateMatrixWorld(true);

			const names: string[] = [];
			let boneCount = 0;
			let meshCount = 0;
			e.traverse((o) => {
				names.push(o.name);
				if ((o as THREE.Bone).isBone) boneCount++;
				if ((o as THREE.Mesh).isMesh) meshCount++;
			});
			nodeNames = names;
			const anim = getAnimator(e);
			frames = anim ? anim.seqFrames(0) : 0;
			seqs = anim ? [{ index: 0, label: `0: whole file (${frames})` }] : [];
			seq = 0;
			first = 0;
			last = frames;
			presets = unitAnims.get(path.toLowerCase().replaceAll('/', '\\')) ?? [];
			info = `${names.length} nodes · ${meshCount} meshes · ${boneCount} bones · children ${countChildren(e)} · mesh ${meshWidth(e).toFixed(1)} x ${meshHeight(e).toFixed(1)} x ${meshDepth(e).toFixed(1)}`;

			// Frame the camera on the bind-pose box of all meshes.
			const box = new THREE.Box3();
			e.traverse((o) => {
				const m = o as THREE.Mesh;
				if (!m.isMesh) return;
				const b = m.geometry.boundingBox;
				if (b && !b.isEmpty()) box.union(b.clone().applyMatrix4((m as THREE.SkinnedMesh).isSkinnedMesh ? holder.matrixWorld : m.matrixWorld));
			});
			frameModel(box);
			applyCopies();
			applyBones();
			if (anim && playing) play();
			readState();
		} catch (err) {
			error = err instanceof Error ? `${err.message}` : String(err);
			console.error(err);
		}
	}

	function applyCopies() {
		for (const c of extra) holder.remove(c);
		extra = [];
		if (!copies || !entity) return;
		// CopyEntity: independent animation over shared geometry, with entity overrides.
		const w = Math.max(meshWidth(entity), 10) * 1.5;
		const a = copyEntity(entity, holder);
		a.position.x = w;
		entityColor(a, 255, 120, 120);
		if (getAnimator(a)) animate(a, 2, speed * 0.5, 0);
		const b = copyEntity(entity, holder);
		b.position.x = -w;
		entityAlpha(b, 0.5);
		if (getAnimator(b)) setAnimTime(b, time, seq);
		const c = copyEntity(entity, holder);
		c.position.x = w * 2;
		entityFX(c, 1);
		const d = copyEntity(entity, holder);
		d.position.x = -w * 2;
		entityShininess(d, 1);
		entityAutoFade(d, dist * 1.2, dist * 2.5);
		extra = [a, b, c, d];
	}

	function applyBones() {
		if (helper) scene.remove(helper);
		helper = undefined;
		if (bones && entity) {
			helper = new THREE.SkeletonHelper(entity);
			scene.add(helper);
		}
	}

	function applyLight() {
		// Blitz light colours; the sun shines along +Z of the light entity.
		ambient.color = light ? rgb255(145, 145, 145) : rgb255(255, 255, 255);
		ambient.intensity = LIGHT_SCALE;
		sun.color = rgb255(50, 50, 50);
		sun.intensity = light ? LIGHT_SCALE : 0;
	}

	function play() {
		if (!entity) return;
		playing = true;
		animate(entity, mode, speed, seq, transition);
		readState();
	}

	function stop() {
		if (!entity) return;
		playing = false;
		// Animate entity,0,0 stops without changing the pose
		animate(entity, 0, 0);
		readState();
	}

	function scrub(t: number) {
		if (!entity) return;
		playing = false;
		setAnimTime(entity, t, seq);
		readState();
	}

	function extract(f1 = first, f2 = last, label = '') {
		if (!entity) return;
		const index = extractAnimSeq(entity, f1, f2);
		if (index < 0) return;
		seqs = [...seqs, { index, label: `${index}: ${label ? label + ' ' : ''}${f1}-${f2}` }];
		seq = index;
		return index;
	}

	function usePreset(p: Preset) {
		speed = p.speed;
		extract(p.first, p.last, p.name);
		play();
	}

	function readState() {
		if (!entity) return;
		time = animTime(entity);
		length = animLength(entity);
		isAnimating = animating(entity);
		curSeq = animSeq(entity);
	}

	/** sys/units.inf: model and ani_* lines per unit (load_units.bb). */
	async function loadUnitAnims(vfs: HttpVfs) {
		if (!vfs.exists('sys\\units.inf')) return;
		let model = '';
		for (const raw of await readLines(vfs, 'sys\\units.inf')) {
			const line = raw.trim();
			const eq = line.indexOf('=');
			if (eq < 0 || line.startsWith('#')) continue;
			const key = line.substring(0, eq).trim();
			const val = line.substring(eq + 1).trim();
			if (key === 'id') model = '';
			else if (key === 'model') model = val.toLowerCase().replaceAll('/', '\\');
			else if (key.startsWith('ani_') && model) {
				const s = val.split(',');
				const list = unitAnims.get(model) ?? [];
				list.push({
					name: key.substring(4),
					first: parseInt(s[0]),
					last: parseInt(s[1]),
					speed: parseFloat(s[2])
				});
				unitAnims.set(model, list);
			}
		}
	}

	onMount(() => {
		let disposed = false;
		let raf = 0;
		renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
		configureRenderer(renderer);
		renderer.setClearColor(rgb255(70, 90, 110));
		sun.position.set(0, 0, 0);
		sun.target.position.set(0.4, -0.6, 0.7);
		scene.add(ambient, sun, sun.target, holder);
		applyLight();

		const resize = () => {
			const w = canvas.clientWidth;
			const h = canvas.clientHeight;
			renderer!.setPixelRatio(window.devicePixelRatio);
			renderer!.setSize(w, h, false);
			camera.setViewport(w, h);
		};
		resize();
		window.addEventListener('resize', resize);

		let drag = false;
		let pan = false;
		const down = (ev: PointerEvent) => {
			drag = true;
			pan = ev.button !== 0 || ev.shiftKey;
			canvas.setPointerCapture(ev.pointerId);
		};
		const move = (ev: PointerEvent) => {
			if (!drag) return;
			if (pan) {
				const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
				const up = new THREE.Vector3(0, 1, 0).applyQuaternion(camera.quaternion);
				target.addScaledVector(right, (-ev.movementX * dist) / 600);
				target.addScaledVector(up, (ev.movementY * dist) / 600);
			} else {
				yaw += ev.movementX * 0.4;
				pitch = Math.max(-89, Math.min(89, pitch + ev.movementY * 0.4));
			}
			placeCamera();
		};
		const up = () => (drag = false);
		const wheel = (ev: WheelEvent) => {
			ev.preventDefault();
			dist *= Math.exp(ev.deltaY * 0.001);
			placeCamera();
		};
		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('wheel', wheel, { passive: false });
		canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());

		const tick = () => {
			raf = requestAnimationFrame(tick);
			try {
				// UpdateWorld once per frame, as the game does at its nominal frame rate.
				updateWorld(holder, 1);
				updateAutoFade(holder, camera.position);
				renderer!.render(scene, camera);
				readState();
				renderError = '';
			} catch (err) {
				const msg = err instanceof Error ? err.message : String(err);
				if (msg !== renderError) {
					renderError = msg;
					error = `render: ${msg}`;
					console.error(err);
				}
			}
		};

		(async () => {
			try {
				const vfs = await HttpVfs.open();
				if (disposed) return;
				const textures = new TextureCache(vfs);
				meshes = new MeshCache(vfs, textures);
				const manifest = (await (await fetch('/game/manifest.json')).json()) as {
					files: Record<string, string>;
				};
				models = Object.values(manifest.files)
					.filter((f) => f.toLowerCase().endsWith('.b3d'))
					.map((f) => f.replaceAll('/', '\\'))
					.sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
				await loadUnitAnims(vfs);
				const q = new URLSearchParams(location.search);
				if (q.get('static')) loadMode = 'static';
				if (q.get('copies')) copies = true;
				if (q.get('bones')) bones = true;
				const wanted = q.get('model');
				tick();
				await load(
					(wanted && models.find((m) => m.toLowerCase() === wanted.toLowerCase())) ||
						models.find((m) => m.toLowerCase().endsWith('raptor.b3d')) ||
						models[0]
				);
				if (q.get('time') !== null) scrub(parseFloat(q.get('time')!));
				// For automated checks.
				(window as unknown as { dev: unknown }).dev = {
					load,
					scrub,
					play,
					stop,
					extract,
					findChild: (name: string) => entity && findChild(entity, name)?.name,
					entity: () => entity,
					// The engine modules, to try entity and texture commands from the console.
					api: { ...modelApi, ...textureApi, textures, meshes, renderer },
					state: () => ({ time, length, frames, isAnimating, curSeq, error, info, current }),
					view: (y: number, p: number, d?: number) => {
						yaw = y;
						pitch = p;
						if (d) dist = d;
						placeCamera();
					},
					set: (o: { mode?: number; speed?: number; seq?: number; transition?: number; copies?: boolean; bones?: boolean; loadMode?: 'anim' | 'static' }) => {
						if (o.mode !== undefined) mode = o.mode;
						if (o.speed !== undefined) speed = o.speed;
						if (o.seq !== undefined) seq = o.seq;
						if (o.transition !== undefined) transition = o.transition;
						if (o.loadMode !== undefined) loadMode = o.loadMode;
						if (o.copies !== undefined) {
							copies = o.copies;
							applyCopies();
						}
						if (o.bones !== undefined) {
							bones = o.bones;
							applyBones();
						}
					}
				};
			} catch (err) {
				error = err instanceof Error ? err.message : String(err);
			}
		})();

		return () => {
			disposed = true;
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', resize);
			renderer?.dispose();
		};
	});
</script>

<svelte:head><title>Models · Stranded II Web</title></svelte:head>

<div class="flex h-screen w-screen bg-neutral-900 text-sm text-neutral-100">
	<aside class="flex w-72 shrink-0 flex-col gap-2 overflow-y-auto border-r border-neutral-700 p-2">
		<input
			class="rounded bg-neutral-800 px-2 py-1"
			placeholder="filter models"
			bind:value={filter}
		/>
		<select
			class="h-48 shrink-0 rounded bg-neutral-800 px-1"
			size="10"
			value={current}
			onchange={(e) => load(e.currentTarget.value)}
		>
			{#each shown as m (m)}
				<option value={m}>{m}</option>
			{/each}
		</select>
		<label class="flex items-center gap-2">
			Load as
			<select
				class="rounded bg-neutral-800 px-1 py-0.5"
				bind:value={loadMode}
				onchange={() => load(current)}
			>
				<option value="anim">LoadAnimMesh</option>
				<option value="static">LoadMesh</option>
			</select>
		</label>
		<div class="text-neutral-400">{info}</div>

		<div class="rounded border border-neutral-700 p-2">
			<div class="mb-1 font-semibold">Animate</div>
			<div class="grid grid-cols-2 items-center gap-1">
				<span>Mode</span>
				<select class="rounded bg-neutral-800 px-1 py-0.5" bind:value={mode}>
					<option value={0}>0 stop</option>
					<option value={1}>1 loop</option>
					<option value={2}>2 ping-pong</option>
					<option value={3}>3 one-shot</option>
				</select>
				<span>Speed</span>
				<input class="rounded bg-neutral-800 px-1 py-0.5" type="number" step="0.01" bind:value={speed} />
				<span>Sequence</span>
				<select class="rounded bg-neutral-800 px-1 py-0.5" bind:value={seq}>
					{#each seqs as s (s.index)}
						<option value={s.index}>{s.label}</option>
					{/each}
				</select>
				<span>Transition</span>
				<input class="rounded bg-neutral-800 px-1 py-0.5" type="number" step="1" bind:value={transition} />
			</div>
			<div class="mt-2 flex gap-2">
				<button class="rounded bg-emerald-700 px-2 py-0.5" onclick={play}>Animate</button>
				<button class="rounded bg-neutral-700 px-2 py-0.5" onclick={stop}>Stop</button>
			</div>
			<div class="mt-2">
				<input
					class="w-full"
					type="range"
					min="0"
					max={Math.max(length, 0.001)}
					step="0.01"
					value={time}
					oninput={(e) => scrub(parseFloat(e.currentTarget.value))}
				/>
				<div class="text-neutral-300">
					AnimTime {time.toFixed(2)} / AnimLength {length} · AnimSeq {curSeq} ·
					{isAnimating ? 'animating' : 'stopped'}
				</div>
				<div class="text-neutral-400">File frames: {frames}</div>
			</div>
		</div>

		<div class="rounded border border-neutral-700 p-2">
			<div class="mb-1 font-semibold">ExtractAnimSeq</div>
			<div class="flex items-center gap-1">
				<input class="w-16 rounded bg-neutral-800 px-1 py-0.5" type="number" bind:value={first} />
				<span>to</span>
				<input class="w-16 rounded bg-neutral-800 px-1 py-0.5" type="number" bind:value={last} />
				<button class="rounded bg-neutral-700 px-2 py-0.5" onclick={() => extract()}>Extract</button>
			</div>
			{#if presets.length}
				<div class="mt-2 text-neutral-400">units.inf</div>
				<div class="flex flex-wrap gap-1">
					{#each presets as p (p.name)}
						<button class="rounded bg-sky-800 px-2 py-0.5" onclick={() => usePreset(p)}>
							{p.name} {p.first}-{p.last}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={copies} onchange={applyCopies} />
			CopyEntity x4 (colour, alpha, full-bright, shiny + auto fade)
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={bones} onchange={applyBones} />
			Show bones
		</label>
		<label class="flex items-center gap-2">
			<input type="checkbox" bind:checked={light} onchange={applyLight} />
			Sun light
		</label>

		<details>
			<summary class="cursor-pointer text-neutral-400">Nodes ({nodeNames.length})</summary>
			<div class="text-neutral-400">{nodeNames.join(', ')}</div>
		</details>
		{#if error}
			<div class="rounded bg-red-900 p-2">{error}</div>
		{/if}
		<div class="text-neutral-500">Drag to orbit · Shift-drag to pan · Wheel to zoom</div>
	</aside>
	<canvas bind:this={canvas} class="block h-full min-w-0 flex-1"></canvas>
</div>
