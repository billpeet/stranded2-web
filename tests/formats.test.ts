import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { split, Int, Float, trimspace } from '../src/lib/s2/blitz';
import { loadObjects } from '../src/lib/s2/defs/objects';
import { parseB3d, type B3dNode } from '../src/lib/s2/formats/b3d';
import { parseMap } from '../src/lib/s2/formats/map';
import { NodeVfs } from './NodeVfs';

// Tests run against the original game data copied by `pnpm sync-assets`.
const root = resolve('static/game/mod');
const have = existsSync(root);
const vfs = have ? new NodeVfs(root) : (undefined as unknown as NodeVfs);

describe('blitz helpers', () => {
	it('split matches the original, including its truncation', () => {
		expect(split('1,2,3', ',', 2)).toEqual(['1', '2', '3']);
		expect(split('a,b', ',', 4)).toEqual(['a', 'b', '', '', '']);
		expect(split('a,b,c,d', ',', 1)).toEqual(['a', 'b']);
		expect(split('', ',', 1)).toEqual(['', '']);
	});
	it('Int/Float parse leading numbers like atoi/atof', () => {
		expect(Int(' 12abc')).toBe(12);
		expect(Int('abc')).toBe(0);
		expect(Int('3.9')).toBe(3);
		expect(Float('2.5x')).toBe(2.5);
		expect(Float('.5')).toBe(0.5);
		expect(Float('')).toBe(0);
	});
	it('trimspace leaves tabs alone', () => {
		expect(trimspace('  \ta ')).toBe('\ta');
	});
});

describe.skipIf(!have)('original game data', () => {
	it('parses every map completely', async () => {
		const maps = vfs.all().filter((f) => /^maps\/.*\.s2$/i.test(f));
		expect(maps.length).toBeGreaterThan(0);
		for (const path of maps) {
			const data = await vfs.readBytes(path);
			const map = parseMap(data);
			expect(map.complete, path).toBe(true);
			expect(Math.log2(map.terrainSize) % 1, path).toBe(0);
			expect(map.heights.length).toBe((map.terrainSize + 1) ** 2);
			for (const h of map.heights) expect(h >= 0 && h <= 1, `${path} height ${h}`).toBe(true);
		}
	});

	it('parses every B3D model to the end of the file', async () => {
		const models = vfs.all().filter((f) => /\.b3d$/i.test(f));
		expect(models.length).toBeGreaterThan(100);
		for (const path of models) {
			const model = parseB3d(await vfs.readBytes(path));
			expect(model.root, path).toBeDefined();
			const check = (n: B3dNode) => {
				if (n.mesh) {
					for (const s of n.mesh.surfaces) {
						expect(s.indices.length % 3, path).toBe(0);
						for (const i of s.indices) expect(i < n.mesh.vertexCount, path).toBe(true);
						expect(s.brush < model.brushes.length, path).toBe(true);
					}
				}
				n.children.forEach(check);
			};
			check(model.root!);
			for (const b of model.brushes) {
				for (const t of b.textures) expect(t < model.textures.length, path).toBe(true);
			}
		}
	});

	it('loads object definitions and every map object refers to one', async () => {
		const defs = await loadObjects(vfs);
		expect(defs.count).toBeGreaterThan(50);
		const palm = defs.byId.get(1)!;
		expect(palm.name).toBe('Palm');
		expect(palm.model).toBe('gfx\\palm01.b3d');
		expect(palm.size).toEqual([Math.fround(2.3), Math.fround(2.3), Math.fround(2.3)]);
		expect(palm.fx).toBe(16);
		expect(palm.mat).toBe(1);
		expect(palm.healthchange).toBe(15);
		expect(palm.script).toContain('on:kill {');
		expect(defs.buildplaceId).toBeGreaterThan(0);

		for (const path of vfs.all().filter((f) => /^maps\/.*\.s2$/i.test(f))) {
			const map = parseMap(await vfs.readBytes(path));
			for (const o of map.objects) expect(defs.byId.has(o.typ), `${path} object typ ${o.typ}`).toBe(true);
		}
		for (const d of defs.byId.values()) {
			if (d.model) expect(vfs.exists(d.model), `model ${d.model}`).toBe(true);
		}
	});
});
