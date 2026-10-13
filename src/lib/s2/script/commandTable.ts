/**
 * The command table: every Case label of parse_commands()
 * (includes/parser_commands.bb) plus the keywords parse() handles itself.
 * Each entry carries its parameter-reading pattern (`usage`) and the handler
 * that reads the parameters the way the original does.
 */
import type { CommandDef } from './api';
import { commands as core } from './commands/core';
import { commands as basic1 } from './commands/basic1';
import { commands as basic2 } from './commands/basic2';
import { commands as iface } from './commands/interface';
import { commands as world } from './commands/world';
import { commands as returns } from './commands/returns';

/** Every command and function of parse_commands(), ordered by source line. */
export const commandTable: readonly CommandDef[] = [...core, ...basic1, ...basic2, ...iface, ...world, ...returns].sort(
	(a, b) => a.line - b.line
);

/** A statement form handled by parse() before parse_commands() is reached. */
export interface KeywordDef {
	name: string;
	/** Line of its Case in parser.bb. */
	line: number;
	usage: string;
}

export const keywordTable: readonly KeywordDef[] = [
	{ name: '$', line: 143, usage: '$name {= value:s | += value:s | -= value:s | ++ | --} ;' },
	{ name: '@', line: 159, usage: '@command  (suppress the error message of the next command)' },
	{ name: 'on', line: 170, usage: 'on:event { ... }' },
	{ name: 'if', line: 192, usage: 'if (condition:s) { ... }' },
	{ name: 'elseif', line: 204, usage: 'elseif (condition:s) { ... }' },
	{ name: 'else', line: 227, usage: 'else { ... }' },
	{ name: 'skip', line: 238, usage: 'skip' },
	{ name: 'loop', line: 243, usage: 'loop("count", n:i | class:s [, typ:i]) { ... }' }
];

/** name -> definition, for every name and alias. */
export const commandIndex: ReadonlyMap<string, CommandDef> = new Map(
	commandTable.flatMap((def) => def.names.map((n) => [n, def] as const))
);

export const keywordIndex: ReadonlyMap<string, KeywordDef> = new Map(keywordTable.map((k) => [k.name, k] as const));

/** True if parse() / parse_commands() know this name. */
export function isKnownCommand(name: string): boolean {
	return commandIndex.has(name) || keywordIndex.has(name);
}

/** Counts for reports and tests. */
export function commandTableStats() {
	const names = commandTable.reduce((n, d) => n + d.names.length, 0);
	const coreDefs = commandTable.filter((d) => d.kind === 'core');
	const hostDefs = commandTable.filter((d) => d.kind === 'host');
	return {
		blocks: commandTable.length,
		names,
		functions: commandTable.filter((d) => d.returns).length,
		core: coreDefs.length,
		coreNames: coreDefs.reduce((n, d) => n + d.names.length, 0),
		host: hostDefs.length,
		hostNames: hostDefs.reduce((n, d) => n + d.names.length, 0),
		keywords: keywordTable.length
	};
}
