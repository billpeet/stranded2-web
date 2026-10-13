<script lang="ts">
	/**
	 * Dev page for the audio port: every sound of the mod played flat or from
	 * an emitter on a top-down map, sound sets, speech, music and the two
	 * volume settings. Everything goes through S2Audio / BlitzAudio, nothing
	 * talks to Web Audio directly.
	 *
	 * ?spatializer=panner uses the PannerNode mapping for 3D voices instead of
	 * the exact FMOD gains (see WebAudioBackend.ts).
	 *
	 * window.__audio exposes { bb, s2, be, meter, listener, emitter } for
	 * inspection from the console.
	 */
	import { onMount } from 'svelte';
	import { HttpVfs } from '../../../lib/s2/io/Vfs';
	import {
		BlitzAudio,
		Cres_sound,
		S2Audio,
		WebAudioBackend,
		attenuation,
		mix3d,
		type ListenerEntity,
		type Vec3
	} from '../../../lib/s2/audio';

	const SET_PARTS = ['spot', 'attack', 'idle1', 'idle2', 'idle3', 'die', 'flee', 'move'];
	/** World units shown from the centre of the map to its edge. */
	const RANGE = 300;
	const SIZE = 520;

	let canvas = $state<HTMLCanvasElement>();
	let spatializer = $state('fmod');
	let error = $state('');
	let ready = $state(false);
	let progress = $state('');
	let ctxState = $state('suspended');
	let playing = $state(0);
	let level = $state({ left: 0, right: 0 });
	let expected = $state({ left: 0, right: 0, vol3d: 255, pan: 128, distance: 0 });
	let failed = $state<string[]>([]);

	let files = $state<string[]>([]);
	let filter = $state('');
	let vol = $state(1);
	let pan = $state(0);
	let pitch = $state(0);
	let loop3d = $state(false);
	let last = $state('');

	let soundsets = $state<string[]>([]);
	let soundset = $state('');
	let setParts = $state<Record<string, boolean>>({});
	let speeches = $state<string[]>([]);

	let music = $state('');
	let musicPeak = $state(1);
	let musicVolume = $state(100);
	let fxVolume = $state(100);
	let musicInfo = $state('');

	let yaw = $state(0);
	const listenerPos: Vec3 = { x: 0, y: 10, z: 0 };
	const emitterPos: Vec3 = { x: 60, y: 10, z: 80 };

	const listener: ListenerEntity = {
		worldPosition: () => listenerPos,
		// Blitz yaw: positive turns left (towards -X)
		worldForward: () => ({ x: -Math.sin((yaw * Math.PI) / 180), y: 0, z: Math.cos((yaw * Math.PI) / 180) }),
		worldUp: () => ({ x: 0, y: 1, z: 0 })
	};
	const emitter = { worldPosition: () => emitterPos };

	let be: WebAudioBackend;
	let bb: BlitzAudio;
	let s2: S2Audio;
	let emitChan = 0;
	const loops = new Map<string, number>();

	const shown = $derived(files.filter((f) => f.toLowerCase().includes(filter.toLowerCase())));

	function play2d(file: string) {
		s2.sfx_play(file, vol, pan, pitch);
		last = `sfx_play("${file}", ${vol}, ${pan}, ${pitch})`;
	}

	function emit(file: string) {
		let h: number;
		if (loop3d) {
			h = loops.get(file) ?? bb.Load3DSound('sfx\\' + file);
			loops.set(file, h);
			bb.LoopSound(h);
		} else {
			h = s2.load_res('sfx\\' + file, Cres_sound);
		}
		emitChan = s2.sfx_emit(h, emitter, vol);
		last = `sfx_emit(${loop3d ? 'looping ' : ''}"${file}", emitter, ${vol}) -> channel ${emitChan}`;
	}

	function stopAll() {
		s2.stopsounds();
		for (let c = 1; c <= 4096; c++) bb.StopChannel(c);
		last = 'stopped everything';
	}

	function pickSoundset(name: string) {
		soundset = name;
		s2.load_soundset(name);
		const set = s2.Tsoundset.find((t) => t.name === name) as unknown as Record<string, number> | undefined;
		setParts = Object.fromEntries(SET_PARTS.map((p) => [p, !!set && set[p] !== 0]));
	}

	function playSet(index: number) {
		emitChan = s2.play_soundset(soundset, index + 1, emitter);
		last = `play_soundset("${soundset}", snd_${SET_PARTS[index]}, emitter) -> channel ${emitChan}`;
	}

	function applyVolumes() {
		s2.menu_set_sfx(musicVolume, fxVolume);
	}

	onMount(() => {
		let raf = 0;
		let dispose = () => {};
		(async () => {
			const vfs = await HttpVfs.open();
			const mode = new URL(location.href).searchParams.get('spatializer') === 'panner' ? 'panner' : 'fmod';
			be = new WebAudioBackend({ spatializer: mode });
			spatializer = mode;
			const unlock = be.unlockOnGesture();
			bb = new BlitzAudio(be, vfs);
			s2 = new S2Audio(bb, { cam: listener, gt: () => performance.now() });
			failed = await s2.preload((done, total) => (progress = `decoding ${done}/${total}`));
			s2.load_setup_listener();
			s2.load_media_sfx();

			const names = vfs.list('sfx');
			files = [
				...names.filter((n) => /\.(wav|ogg|mp3)$/i.test(n)),
				...vfs
					.list('sfx/speech')
					.filter((n) => /\.ogg$/i.test(n))
					.map((n) => 'speech\\' + n)
			];
			const sets = new Set<string>();
			for (const n of names) {
				const m = /^(.+)_(spot|attack|idle[123]|die|flee|move)\.(wav|inf)$/i.exec(n);
				if (m) sets.add(m[1]);
			}
			soundsets = [...sets];
			speeches = [...new Set(vfs.list('sfx/speech').map((n) => n.replace(/\d*\.ogg$/i, '')))];
			music = names.find((n) => /^music_/i.test(n)) ?? '';
			if (soundsets.length) pickSoundset(soundsets[0]);

			const meter = be.createMeter();
			(window as unknown as Record<string, unknown>).__audio = { bb, s2, be, meter, listener, emitter, listenerPos, emitterPos };
			ready = true;

			const frame = () => {
				bb.update();
				s2.sfx_update();
				ctxState = be.context.state;
				playing = bb.playingCount;
				level = { left: meter.left(), right: meter.right() };
				const st = bb.state3d;
				const m = mix3d(Math.trunc(vol * (fxVolume / 100) * 255), emitterPos, st.listener, st.options);
				const d = Math.hypot(emitterPos.x - listenerPos.x, emitterPos.z - listenerPos.z);
				expected = { left: m.left, right: m.right, vol3d: m.vol3d, pan: m.pan, distance: d };
				const mi = bb.inspect(s2.mfx_chan);
				musicInfo = mi
					? `${s2.mfx_filename} ${mi.cursor.toFixed(1)}/${mi.duration.toFixed(1)} s, FMOD volume ${mi.volume}${s2.mfx_fade ? ', fading' : ''}`
					: 'no music';
				draw();
				raf = requestAnimationFrame(frame);
			};
			raf = requestAnimationFrame(frame);
			dispose = () => {
				unlock();
				meter.dispose();
				stopAll();
				void be.context.close();
			};
		})().catch((e) => (error = String(e?.message ?? e)));
		return () => {
			cancelAnimationFrame(raf);
			dispose();
		};
	});

	/* ---------------------------------------------------------------- map */

	const toPx = (p: Vec3) => ({ x: SIZE / 2 + (p.x / RANGE) * (SIZE / 2), y: SIZE / 2 - (p.z / RANGE) * (SIZE / 2) });

	function draw() {
		const g = canvas?.getContext('2d');
		if (!g) return;
		g.fillStyle = '#10161c';
		g.fillRect(0, 0, SIZE, SIZE);
		const l = toPx(listenerPos);
		const e = toPx(emitterPos);
		// distance rings around the listener, labelled with FMOD's gain at rolloff 0.02
		g.font = '11px sans-serif';
		for (const r of [26, 51, 101, 201]) {
			g.strokeStyle = '#2b3946';
			g.beginPath();
			g.arc(l.x, l.y, (r / RANGE) * (SIZE / 2), 0, Math.PI * 2);
			g.stroke();
			g.fillStyle = '#5f7486';
			g.fillText(`${r}: ${(attenuation(r, 0.02) / 255).toFixed(2)}`, l.x + 4, l.y - (r / RANGE) * (SIZE / 2) - 3);
		}
		g.strokeStyle = '#3f5568';
		g.beginPath();
		g.moveTo(l.x, l.y);
		g.lineTo(e.x, e.y);
		g.stroke();
		// listener with its facing direction
		const f = listener.worldForward();
		g.fillStyle = '#6cc4ff';
		g.beginPath();
		g.arc(l.x, l.y, 9, 0, Math.PI * 2);
		g.fill();
		g.strokeStyle = '#6cc4ff';
		g.lineWidth = 3;
		g.beginPath();
		g.moveTo(l.x, l.y);
		g.lineTo(l.x + f.x * 26, l.y - f.z * 26);
		g.stroke();
		g.lineWidth = 1;
		g.fillStyle = '#ffb454';
		g.beginPath();
		g.arc(e.x, e.y, 8, 0, Math.PI * 2);
		g.fill();
		g.fillStyle = '#c8d4de';
		g.fillText('listener', l.x + 12, l.y + 4);
		g.fillText('emitter', e.x + 12, e.y + 4);
		g.fillStyle = '#5f7486';
		g.fillText('+Z (forward)', SIZE / 2 + 4, 12);
		g.fillText('+X', SIZE - 22, SIZE / 2 - 4);
	}

	let dragging: Vec3 | null = null;

	function pointer(ev: PointerEvent, start: boolean) {
		if (!canvas) return;
		const r = canvas.getBoundingClientRect();
		const x = ((ev.clientX - r.left) / r.width) * SIZE;
		const y = ((ev.clientY - r.top) / r.height) * SIZE;
		if (start) {
			const near = (p: Vec3) => Math.hypot(toPx(p).x - x, toPx(p).y - y);
			dragging = near(emitterPos) <= near(listenerPos) ? emitterPos : listenerPos;
			canvas.setPointerCapture(ev.pointerId);
		}
		if (!dragging) return;
		dragging.x = Math.round(((x - SIZE / 2) / (SIZE / 2)) * RANGE);
		dragging.z = Math.round(((SIZE / 2 - y) / (SIZE / 2)) * RANGE);
	}

	const db = (v: number) => (v > 0 ? `${(20 * Math.log10(v)).toFixed(1)} dB` : '-inf');
</script>

<svelte:head><title>Audio dev</title></svelte:head>

<div class="min-h-screen bg-slate-900 p-4 text-sm text-slate-200">
	<h1 class="mb-2 text-lg font-semibold">Audio</h1>
	{#if error}
		<p class="text-red-400">{error}</p>
	{:else if !ready}
		<p>Loading sounds... {progress}</p>
	{:else}
		<div class="mb-3 flex flex-wrap items-center gap-x-6 gap-y-1 rounded bg-slate-800 px-3 py-2">
			<span>
				AudioContext: <b class={ctxState === 'running' ? 'text-emerald-400' : 'text-amber-400'}>{ctxState}</b>
				{#if ctxState !== 'running'}(click anywhere; sounds started before that run silently){/if}
			</span>
			<span>playing channels: <b>{playing}</b></span>
			<span>output RMS L <b>{level.left.toFixed(3)}</b> R <b>{level.right.toFixed(3)}</b></span>
			<span>3D mapping: <b>{spatializer}</b></span>
			<button class="rounded bg-slate-600 px-2 py-0.5 hover:bg-slate-500" onclick={stopAll}>Stop all</button>
			{#if failed.length}<span class="text-red-400">failed to decode: {failed.join(', ')}</span>{/if}
		</div>
		<p class="mb-3 text-slate-400">{last || 'Nothing played yet.'}</p>

		<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]">
			<section>
				<h2 class="mb-1 font-semibold">Sounds ({shown.length} of {files.length})</h2>
				<div class="mb-2 flex flex-wrap items-center gap-3">
					<input class="rounded bg-slate-800 px-2 py-1" placeholder="filter" bind:value={filter} />
					<label>volume <input type="range" min="0" max="1" step="0.05" bind:value={vol} /> {vol}</label>
					<label>pan <input type="range" min="-1" max="1" step="0.1" bind:value={pan} /> {pan}</label>
					<label>
						pitch (Hz, 0 = file rate)
						<input class="w-20 rounded bg-slate-800 px-1" type="number" step="1000" bind:value={pitch} />
					</label>
					<label><input type="checkbox" bind:checked={loop3d} /> loop when emitted</label>
				</div>
				<ul class="h-[30rem] overflow-y-auto rounded bg-slate-800 p-1">
					{#each shown as f (f)}
						<li class="flex items-center gap-2 px-1 py-0.5 hover:bg-slate-700">
							<button class="rounded bg-sky-700 px-2 hover:bg-sky-600" onclick={() => play2d(f)}>2D</button>
							<button class="rounded bg-amber-700 px-2 hover:bg-amber-600" onclick={() => emit(f)}>emit</button>
							<span>{f}</span>
						</li>
					{/each}
				</ul>
			</section>

			<section>
				<h2 class="mb-1 font-semibold">Top-down map (drag listener or emitter)</h2>
				<canvas
					bind:this={canvas}
					width={SIZE}
					height={SIZE}
					class="touch-none rounded"
					style="width:{SIZE}px;height:{SIZE}px"
					onpointerdown={(e) => pointer(e, true)}
					onpointermove={(e) => pointer(e, false)}
					onpointerup={() => (dragging = null)}
				></canvas>
				<label class="mt-2 block">
					listener yaw <input type="range" min="-180" max="180" step="5" bind:value={yaw} />
					{yaw}&deg;
				</label>
				<p class="mt-1 text-slate-400">
					distance {expected.distance.toFixed(0)}, FMOD 3D volume {expected.vol3d}/255, pan {expected.pan}/255<br />
					speaker gain for an emitted sound: L {expected.left.toFixed(3)} ({db(expected.left)}), R {expected.right.toFixed(3)}
					({db(expected.right)})
				</p>
			</section>

			<section class="space-y-4">
				<div>
					<h2 class="mb-1 font-semibold">Sound sets (play_soundset, from the emitter)</h2>
					<select class="rounded bg-slate-800 px-2 py-1" value={soundset} onchange={(e) => pickSoundset(e.currentTarget.value)}>
						{#each soundsets as s (s)}<option>{s}</option>{/each}
					</select>
					<div class="mt-2 flex flex-wrap gap-2">
						{#each SET_PARTS as p, i (p)}
							<button
								class="rounded bg-amber-700 px-2 py-0.5 hover:bg-amber-600 disabled:bg-slate-700 disabled:text-slate-500"
								disabled={!setParts[p]}
								onclick={() => playSet(i)}>{p}</button
							>
						{/each}
					</div>
				</div>

				<div>
					<h2 class="mb-1 font-semibold">Speech</h2>
					<div class="flex flex-wrap gap-2">
						{#each speeches as sp (sp)}
							<button class="rounded bg-sky-700 px-2 py-0.5 hover:bg-sky-600" onclick={() => (s2.speech(sp), (last = `speech("${sp}")`))}>{sp}</button>
							<button class="rounded bg-slate-600 px-2 py-0.5 hover:bg-slate-500" onclick={() => (s2.speech(sp, 1), (last = `speech("${sp}", 1)`))}
								>{sp} (override)</button
							>
						{/each}
					</div>
				</div>

				<div>
					<h2 class="mb-1 font-semibold">Music (sfx_music)</h2>
					<div class="flex flex-wrap items-center gap-2">
						<select class="rounded bg-slate-800 px-2 py-1" bind:value={music}>
							{#each files.filter((f) => /^(music|amb)_/i.test(f)) as f (f)}<option>{f}</option>{/each}
						</select>
						<label>track volume <input type="range" min="0" max="1" step="0.05" bind:value={musicPeak} oninput={() => s2.cmd_musicvolume(musicPeak)} /> {musicPeak}</label>
					</div>
					<div class="mt-2 flex flex-wrap gap-2">
						<button class="rounded bg-sky-700 px-2 py-0.5 hover:bg-sky-600" onclick={() => s2.cmd_music(music, musicPeak)}>Play</button>
						<button class="rounded bg-sky-700 px-2 py-0.5 hover:bg-sky-600" onclick={() => s2.cmd_music(music, musicPeak, 3000)}>Play, fade in 3 s</button>
						<button class="rounded bg-slate-600 px-2 py-0.5 hover:bg-slate-500" onclick={() => s2.cmd_fademusic(3000)}>Fade out 3 s</button>
						<button class="rounded bg-slate-600 px-2 py-0.5 hover:bg-slate-500" onclick={() => s2.cmd_stopmusic()}>Stop</button>
						<button class="rounded bg-slate-600 px-2 py-0.5 hover:bg-slate-500" onclick={() => s2.load_map_music(music)}>Use as map ambient</button>
						<button class="rounded bg-slate-600 px-2 py-0.5 hover:bg-slate-500" onclick={() => s2.cmd_ambientsfx('')}>No ambient</button>
					</div>
					<p class="mt-1 text-slate-400">{musicInfo}</p>
				</div>

				<div>
					<h2 class="mb-1 font-semibold">Settings (menu sliders)</h2>
					<label class="block">
						music volume <input type="range" min="0" max="100" bind:value={musicVolume} oninput={applyVolumes} />
						{musicVolume}%
					</label>
					<label class="block">
						sound volume <input type="range" min="0" max="100" bind:value={fxVolume} oninput={applyVolumes} />
						{fxVolume}%
					</label>
					<label class="mt-1 block">
						<input type="checkbox" onchange={(e) => (listenerPos.y = e.currentTarget.checked ? -5 : 10)} /> camera under water (diving loop replaces
						the ambient)
					</label>
				</div>
			</section>
		</div>
	{/if}
</div>
