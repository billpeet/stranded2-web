<script lang="ts">
	import { onMount } from 'svelte';
	import { G } from '../lib/s2/game/state';
	import { PROGRAM, main } from '../lib/s2/game/main';
	import { RT } from '../lib/s2/game/rt';
	import { createRuntime, disposeRuntime } from '../lib/s2/game/runtime';

	/**
	 * The game. The page only provides the two canvases (WebGL scene below,
	 * Blitz 2D layer above) and shows what happens before the game can draw
	 * its own load screen, and the text of a RuntimeError.
	 *
	 * ?pacing=timer  50 FPS independent of the display (see game/main.ts)
	 * ?cmd=-debug    command line (game/sys.ts CommandLine)
	 * ?nohmr         development: do not reload when a source file changes
	 */

	let stage: HTMLDivElement;
	let canvas3d: HTMLCanvasElement;
	let canvas2d: HTMLCanvasElement;
	let status = $state('Loading…');
	let error = $state('');
	let w = $state(800);
	let h = $state(600);
	let scale = $state(1);

	function fit() {
		scale = Math.min(window.innerWidth / w, window.innerHeight / h);
	}

	// Development: the game is one long-running program with module-level state; a hot module
	// update would start a second one inside the same page. Reload instead.
	// (?nohmr: ignore updates instead, for automated sessions while files are being edited.)
	if (import.meta.hot) {
		import.meta.hot.on('vite:beforeUpdate', (payload) => {
			if (new URLSearchParams(location.search).has('nohmr')) payload.updates.length = 0;
			else location.reload();
		});
		import.meta.hot.on('vite:beforeFullReload', () => {
			// a throwing listener keeps the client from reloading
			if (new URLSearchParams(location.search).has('nohmr')) throw new Error('nohmr: full reload ignored');
		});
	}

	onMount(() => {
		let stopped = false;
		fit();
		window.addEventListener('resize', fit);
		(async () => {
			try {
				await createRuntime({ canvas3d, canvas2d, stage, onStatus: (t) => (status = t) });
				if (stopped) return;
				status = '';
				// Exposed for debugging and automated checks.
				// s2.mod('game/console') loads a module of src/lib/s2 as the running game sees it.
				const loaders = import.meta.env.DEV ? import.meta.glob('../lib/s2/**/*.ts') : {};
				const mod = (path: string) => loaders['../lib/s2/' + path + '.ts']?.();
				(window as unknown as Record<string, unknown>).s2 = { G, RT, PROGRAM, mod };
				const pacing = new URLSearchParams(location.search).get('pacing') === 'timer' ? 'timer' : 'vsync';
				// the game sets the resolution in load_setup; follow it
				const watch = setInterval(() => {
					if (G.set_scrx !== w || G.set_scry !== h) {
						w = G.set_scrx || 800;
						h = G.set_scry || 600;
						fit();
					}
				}, 250);
				await main({
					pacing,
					stopped: () => stopped,
					onError: (m) => (error = m)
				});
				clearInterval(watch);
				if (!error && PROGRAM.phase === 'ended') status = 'The game has ended. Reload the page to start again.';
			} catch (e) {
				console.error(e);
				error ||= e instanceof Error ? `${e.name}: ${e.message}` : String(e);
			}
		})();
		return () => {
			stopped = true;
			window.removeEventListener('resize', fit);
			disposeRuntime();
		};
	});
</script>

<svelte:head><title>Stranded II</title></svelte:head>

<div class="flex h-screen w-screen items-center justify-center overflow-hidden bg-black">
	<div
		bind:this={stage}
		id="stage"
		class="relative shrink-0 cursor-none"
		style="width:{w}px;height:{h}px;transform:scale({scale});transform-origin:center"
	>
		<canvas bind:this={canvas3d} class="absolute inset-0 block" style="width:{w}px;height:{h}px"></canvas>
		<canvas bind:this={canvas2d} class="absolute inset-0 block" style="width:{w}px;height:{h}px;image-rendering:pixelated"></canvas>
	</div>

	{#if status}
		<div class="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-neutral-400">{status}</div>
	{/if}
	{#if error}
		<div class="absolute inset-0 flex items-center justify-center bg-black/70">
			<div class="max-w-xl rounded border border-neutral-500 bg-neutral-200 text-sm text-black shadow-xl">
				<div class="bg-blue-900 px-3 py-1 font-bold text-white">Error!</div>
				<pre class="px-4 py-3 whitespace-pre-wrap">{error}</pre>
			</div>
		</div>
	{/if}
</div>
