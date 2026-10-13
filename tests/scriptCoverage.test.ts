import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { commandIndex, commandTable, commandTableStats, isKnownCommand, keywordIndex } from '../src/lib/s2/script';

// core/scriptcommands.inf is the command reference the game's editor ships
// with: one "name ¦ categories ¦ syntax" line per command (0xA6 separated).
const candidates = [
	process.env.S2_SCRIPTCOMMANDS ?? '',
	resolve('../stranded2_en/core/scriptcommands.inf'),
	resolve('static/game/core/scriptcommands.inf')
].filter((p) => p !== '');
const path = candidates.find((p) => existsSync(p));

// The original source, when it sits next to the project (not shipped with it).
const sourcePath = [process.env.S2_PARSER_COMMANDS ?? '', resolve('../s2_re/source/source/includes/parser_commands.bb')].find(
	(p) => p !== '' && existsSync(p)
);

describe('command table', () => {
	it('has unique names and consistent entries', () => {
		const seen = new Set<string>();
		for (const def of commandTable) {
			expect(def.names.length, `line ${def.line}`).toBeGreaterThan(0);
			expect(typeof def.run).toBe('function');
			expect(['core', 'host']).toContain(def.kind);
			for (const n of def.names) {
				expect(n, n).toMatch(/^[a-z0-9_]+$/);
				expect(seen.has(n), `duplicate name ${n}`).toBe(false);
				seen.add(n);
			}
		}
		const stats = commandTableStats();
		console.log('command table: ' + JSON.stringify(stats));
		expect(stats.names).toBe(commandIndex.size);
		expect(stats.core + stats.host).toBe(stats.blocks);
	});

	it.skipIf(!sourcePath)('has exactly the Case labels of parse_commands()', () => {
		const labels = new Map<string, number>();
		readFileSync(sourcePath!, 'latin1')
			.split(/\r?\n/)
			.forEach((line, i) => {
				// Top-level cases of "Select p_com$" are indented with two tabs.
				const m = /^\t\tCase ((?:"[^"]*",?)+)/.exec(line);
				if (m) for (const n of m[1].matchAll(/"([^"]*)"/g)) labels.set(n[1], i + 1);
			});
		expect(labels.size).toBeGreaterThan(300);
		expect([...labels.keys()].filter((n) => !commandIndex.has(n))).toEqual([]);
		expect([...commandIndex.keys()].filter((n) => !labels.has(n))).toEqual([]);
		for (const [name, line] of labels) expect(commandIndex.get(name)!.line, name).toBe(line);
	});

	it.skipIf(!path)('contains every name of core/scriptcommands.inf', () => {
		const lines = readFileSync(path!, 'latin1').split(/\r?\n/);
		const listed = new Set<string>();
		for (const line of lines) {
			const fields = line.split('¦');
			if (fields.length < 3) continue;
			listed.add(fields[0].trim().toLowerCase());
		}
		expect(listed.size).toBeGreaterThan(300);

		const missing = [...listed].filter((n) => !isKnownCommand(n)).sort();
		const tableOnly = [...commandIndex.keys()].filter((n) => !listed.has(n)).sort();
		const keywordOnly = [...keywordIndex.keys()].filter((n) => !listed.has(n)).sort();
		console.log(
			`scriptcommands.inf lists ${listed.size} names; table has ${commandIndex.size} names + ${keywordIndex.size} keywords\n` +
				`only in scriptcommands.inf (${missing.length}): ${missing.join(', ')}\n` +
				`only in the table (${tableOnly.length}): ${tableOnly.join(', ')}\n` +
				`keywords not listed (${keywordOnly.length}): ${keywordOnly.join(', ')}`
		);
		// "hidebar" is documented, but the Case label is the typo "hidbar": in the
		// source and in the string table of the shipped exe ("...seqbar hidbar showbar...").
		// The documented name is therefore an unknown command in the game, and here.
		expect(missing).toEqual(['hidebar']);
		expect(isKnownCommand('hidbar')).toBe(true);
	});
});
