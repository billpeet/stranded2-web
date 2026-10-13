/**
 * ScriptHost, part "core": what the interpreter itself needs from the game
 * (script/host.ts CoreHost) plus the commands that only need the foundation.
 *
 * This file is also the pattern for the other parts. A part is a module in
 * this directory that exports `host`, a `Partial<ScriptHost>`:
 *
 *     export const host: Partial<ScriptHost> = {
 *         cmd_freeze(P, id, mode) { ... },      // parameters as parse_commands read them
 *         ...
 *     };
 *
 * runtime.ts merges all parts (assembleScriptHost); defining a method that
 * another part already defines is an error at startup. Each method is the
 * body of one Case block of parse_commands() after its parameters were read
 * (script/commands/*.ts document every method next to the handler that
 * calls it). Methods may only be synchronous: start blocking work with
 * defer() (flow.ts).
 */
import { CurrentDate, CurrentTime, Str } from '../../blitz';
import { FreeEntity, type BBEntity } from '../../bb3d';
import type { HostEntity, ScriptHost } from '../../script/host';
import { con_add } from '../con_add';
import { con_open } from '../console';
import { Cclass_info, Cclass_item, Cclass_object, Cclass_state, Cclass_unit, Cres_image, Cversion } from '../consts';
import { Dinfo_name, Ditem_iconh, Ditem_name, Dobject_name, Dstate_name, Dunit_name } from '../defs_arrays';
import { readFileBytes, readFileLines, writeFileBytes } from '../files';
import { parent_con } from '../parentchild';
import { load_res } from '../ressources';
import { RT } from '../rt';
import { G } from '../state';
import { After, First, Tinfo, Titem, Tobject, Tstate, Tunit, type BBType } from '../types';

/** The Type list of a class. Tstate has no id: scripts never address states by id. */
function typeOf(cls: number): BBType<object> | null {
	switch (cls) {
		case Cclass_object:
			return Tobject as unknown as BBType<object>;
		case Cclass_unit:
			return Tunit as unknown as BBType<object>;
		case Cclass_item:
			return Titem as unknown as BBType<object>;
		case Cclass_info:
			return Tinfo as unknown as BBType<object>;
		case Cclass_state:
			return Tstate as unknown as BBType<object>;
		default:
			return null;
	}
}

function listOf(cls: number): Iterable<{ id?: number; typ: number }> {
	switch (cls) {
		case Cclass_object:
			return Tobject.list;
		case Cclass_unit:
			return Tunit.list;
		case Cclass_item:
			return Titem.list;
		case Cclass_info:
			return Tinfo.list;
		case Cclass_state:
			return Tstate.list;
		default:
			return [];
	}
}

/** For T=Each T: If T\id=id: the con_<class>(id) lookup without the side effect on TC<class>. */
function find(cls: number, id: number): { id?: number; typ: number } | undefined {
	for (const e of listOf(cls)) if (e.id === id) return e;
	return undefined;
}

/** con_<class>(id): sets the "current" pointer TC<class> and returns 1, or 0. */
function con(cls: number, id: number): number {
	const e = find(cls, id);
	if (!e) return 0;
	switch (cls) {
		case Cclass_object:
			G.TCobject = e as Tobject;
			break;
		case Cclass_unit:
			G.TCunit = e as Tunit;
			break;
		case Cclass_item:
			G.TCitem = e as Titem;
			break;
		case Cclass_info:
			G.TCinfo = e as Tinfo;
			break;
	}
	return 1;
}

export const host: Partial<ScriptHost> = {
	con_add(txt = '', special = -1) {
		con_add(txt, special);
	},
	con_open() {
		con_open();
	},
	sfx_fail() {
		RT.audio.sfx(G.sfx_fail);
	},
	con_object: (id) => con(Cclass_object, id),
	con_unit: (id) => con(Cclass_unit, id),
	con_item: (id) => con(Cclass_item, id),
	con_info: (id) => con(Cclass_info, id),
	// parent_con (parentchild.bb:89): the TC globals are its loop variables, Null when the id is not found
	parent_con: (cls, id) => parent_con(cls, id),
	g_player: () => G.g_player,
	gt: () => G.gt,
	entities: (cls) => [...listOf(cls)] as HostEntity[],
	// p_loop_object=After p_loop_object (parser_loop.bb): on the live list
	entity_next(cls, e) {
		const t = typeOf(cls);
		if (t === null) return null;
		return (e === null ? First(t) : After(t, e as never)) as HostEntity | null;
	},
	entity_typ: (cls, id) => find(cls, id)?.typ ?? 0,
	def_name(cls, typ) {
		switch (cls) {
			case Cclass_object:
				return Dobject_name(typ);
			case Cclass_unit:
				return Dunit_name(typ);
			case Cclass_item:
				return Ditem_name(typ);
			case Cclass_info:
				return Dinfo_name(typ);
			case Cclass_state:
				return Dstate_name(typ);
			default:
				return '';
		}
	},
	ReadFileLines: (path) => readFileLines(path),
	ReadFileBytes: (path) => readFileBytes(path),
	WriteFileBytes: (path, data) => (writeFileBytes(path, data) ? 1 : 0),
	FreeEntity(h) {
		FreeEntity(h as BBEntity | null);
	},
	load_res: (file, typ, mode) => load_res(file, typ, mode) as unknown as number,
	Ditem_iconh: (typ) => Ditem_iconh(typ) as unknown as number,

	/** getsetting name */
	cmd_getsetting(_P, name) {
		switch (name) {
			case 'xres':
				return Str(G.set_scrx);
			case 'yres':
				return Str(G.set_scry);
			case 'depth':
				return Str(G.set_scrbit);
			case 'debug':
				return Str(G.set_debug);
			case 'viewrange':
				return Str(G.set_viewrange);
			case 'gore':
				return Str(G.set_gore);
			case 'commandline':
				return G.set_cmd;
			case 'chat':
				return G.in_chat;
			case 'lastchat':
				return G.in_lastchat;
			case 'time':
				return CurrentTime();
			case 'date':
				return CurrentDate();
			case 'version':
				return Cversion;
		}
	}
};

void Cres_image;
