<script lang="ts">
	import { onMount } from 'svelte';
	import { MapViewer } from '../../../lib/s2/engine/MapViewer';
	import { HttpVfs } from '../../../lib/s2/io/Vfs';

	let canvas: HTMLCanvasElement;
	let viewer: MapViewer | undefined;
	let maps = $state<string[]>([]);
	let current = $state('');
	let status = $state('Loading game data…');
	let error = $state('');
	let info = $state('');

	async function load(path: string) {
		if (!viewer) return;
		current = path;
		error = '';
		try {
			const map = await viewer.loadMap(path, (s) => (status = `${s.stage} ${Math.round(s.percent)}%`));
			status = '';
			info = `${map.objects.length} objects · ${map.units.length} units · ${map.items.length} items · terrain ${map.terrainSize} · day ${map.day} ${map.hour}:${String(map.minute).padStart(2, '0')}`;
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
			status = '';
		}
	}

	onMount(() => {
		let disposed = false;
		(async () => {
			try {
				const vfs = await HttpVfs.open();
				if (disposed) return;
				viewer = new MapViewer(canvas, vfs);
				// Exposed for debugging and automated screenshots.
				(window as unknown as { viewer: MapViewer }).viewer = viewer;
				await viewer.init();
				const found: string[] = [];
				for (const dir of ['maps', 'maps\\adventure', 'maps\\menu']) {
					for (const f of vfs.list(dir)) if (f.toLowerCase().endsWith('.s2')) found.push(`${dir}\\${f}`);
				}
				maps = found;
				viewer.start();
				const wanted = new URLSearchParams(location.search).get('map');
				await load(wanted && found.includes(wanted) ? wanted : (found.find((m) => m.includes('map01')) ?? found[0]));
			} catch (e) {
				error = e instanceof Error ? e.message : String(e);
				status = '';
			}
		})();
		return () => {
			disposed = true;
			viewer?.dispose();
		};
	});
</script>

<svelte:head><title>Stranded II Web</title></svelte:head>

<div class="relative h-screen w-screen overflow-hidden bg-black text-sm text-white">
	<canvas bind:this={canvas} class="block h-full w-full"></canvas>

	<div class="absolute top-2 left-2 flex items-center gap-2 rounded bg-black/60 px-2 py-1">
		<select
			class="rounded bg-neutral-800 px-1 py-0.5"
			value={current}
			onchange={(e) => load(e.currentTarget.value)}
		>
			{#each maps as m (m)}
				<option value={m}>{m.replace(/^maps\\/, '')}</option>
			{/each}
		</select>
		<span class="text-neutral-300">{info}</span>
	</div>

	<div class="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-1 text-neutral-300">
		Click to look · WASD move · Shift run · F fly · Space/C up/down
	</div>

	{#if status}
		<div class="absolute inset-0 flex items-center justify-center bg-black/70 text-lg">{status}</div>
	{/if}
	{#if error}
		<div class="absolute right-2 bottom-2 max-w-md rounded bg-red-900/90 px-3 py-2">{error}</div>
	{/if}
</div>
