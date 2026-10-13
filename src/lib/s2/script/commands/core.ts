/**
 * parse_commands(): the commands that belong to the interpreter itself.
 * Script control (event, skipevent, exit, addscript, extendscript, def_*),
 * timers, BUFFER (2159-2184), script removal and variables from FREE,
 * the world-free functions of RETURN, VARS (5175-5307) and Strings
 * (5437-5492). Line numbers refer to includes/parser_commands.bb.
 */
import { SEP_LINE, split } from '../../blitz';
import { Cos, Float, Int, Left, Mid, Replace, Sin, Tan, f32, fstr, istr, trimtext } from '../_helpers';
import type { CommandDef, ParseCtx } from '../api';
import type { ScriptEngine } from '../engine';
import { Cclass_info, Cclass_item, Cclass_object, Cclass_unit } from '../host';

/** Host methods used by the commands in this file. */
export interface Host {
	/**
	 * getsetting name: the text for p_return$. name is one of xres, yres,
	 * depth, debug, viewrange, gore, commandline, chat, lastchat, time, date,
	 * version (set_scrx, set_scry, set_scrbit, set_debug, set_viewrange,
	 * set_gore, set_cmd$, in_chat$, in_lastchat$, CurrentTime(),
	 * CurrentDate(), Cversion$).
	 */
	cmd_getsetting(P: ParseCtx, name: string): string | void;
}

const SETTINGS = ['xres', 'yres', 'depth', 'debug', 'viewrange', 'gore', 'commandline', 'chat', 'lastchat', 'time', 'date', 'version'];

/** class [, id] with "self": the prologue shared by many commands. */
function classId(P: ParseCtx): [number, number] {
	const cls = P.param(); // Class
	let classint = P.parse_getclass(cls);
	let id = 0;
	if (classint === -1) {
		classint = P.p_env_class;
		id = P.p_env_id;
	} else {
		P.parse_comma(1);
		id = Int(P.param()); // ID
	}
	return [classint, id];
}

/**
 * Text source: an info id (script text of that info in the Tx list) or a
 * file. txt$=0 makes "0" the "nothing found" value.
 */
function txtsource(P: ParseCtx, source: string, scriptOnly: boolean): string {
	let txt = '0';
	if (Int(source) !== 0) {
		for (const tx of P.tx.items) {
			if (tx.parent_class === Cclass_info && tx.parent_id === Int(source)) {
				if (!scriptOnly || tx.mode === 0) {
					txt = tx.value;
					break;
				}
			}
		}
	} else {
		txt = P.parse_loadscript(source);
	}
	return txt;
}

const CLASSES = [Cclass_object, Cclass_unit, Cclass_item, Cclass_info];

/** def_extend / def_override / def_free: change the script of a definition. */
function defScript(P: ParseCtx, classint: number, typ: number, change: (old: string) => string): void {
	const E = P as ScriptEngine;
	if (CLASSES.includes(classint)) {
		if (typ < 1 || typ > E.Dcount[classint]) P.parse_error('typerange', typ);
		// quirk: the error does not stop the write; an out-of-range type would
		// write outside the array in the original, here it is ignored.
		if (typ >= 0 && typ <= E.Dcount[classint]) {
			const script = change(E.Dscript[classint][typ] ?? '');
			E.Dscript[classint][typ] = script;
			E.Dscriptk[classint][typ] = script === '' ? '' : P.preparse_string(script);
		}
	} else {
		P.parse_error('wrongclass', P.parse_getclasstxt(classint));
	}
}

function stripDollar(v: string): string {
	return Left(v, 1) === '$' ? Mid(v, 2, -1) : v;
}

function trig(name: string, line: number, f: (deg: number) => number): CommandDef {
	return {
		names: [name],
		section: 'RETURN',
		line,
		kind: 'core',
		returns: true,
		usage: 'x:f [, mode:i=1]',
		run(P) {
			const x = Float(P.param());
			let classint = 1;
			if (P.parse_comma(0)) classint = Int(P.param());
			// mode > 0 returns the value times 100; the result is always float text.
			if (classint > 0) P.p_return = fstr(f32(f(x) * 100.0));
			else P.p_return = fstr(f(x));
		}
	};
}

export const commands: CommandDef[] = [
	// ################################################# BASIC
	{
		names: ['def_extend'],
		section: 'BASIC',
		line: 170,
		kind: 'core',
		returns: false,
		usage: 'class:s, typ:i, source:S',
		run(P) {
			const classint = P.parse_getclass(P.param());
			P.parse_comma(1);
			const typ = Int(P.param());
			P.parse_comma(1);
			const source = P.params();
			const txt = txtsource(P, source, false);
			if (txt === '0' || txt === '') P.parse_error('txtsource', source);
			else defScript(P, classint, typ, (old) => old + SEP_LINE + txt);
		}
	},
	{
		names: ['def_override'],
		section: 'BASIC',
		line: 216,
		kind: 'core',
		returns: false,
		usage: 'class:s, typ:i, source:S',
		run(P) {
			const classint = P.parse_getclass(P.param());
			P.parse_comma(1);
			const typ = Int(P.param());
			P.parse_comma(1);
			const source = P.params();
			const txt = txtsource(P, source, false);
			if (txt === '0' || txt === '') P.parse_error('txtsource', source);
			else defScript(P, classint, typ, () => txt);
		}
	},
	{
		names: ['def_free'],
		section: 'BASIC',
		line: 262,
		kind: 'core',
		returns: false,
		usage: 'class:s, typ:i',
		run(P) {
			const classint = P.parse_getclass(P.param());
			P.parse_comma(1);
			const typ = Int(P.param());
			defScript(P, classint, typ, () => '');
		}
	},
	{
		names: ['skipevent'],
		section: 'BASIC',
		line: 356,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			P.p_skipevent = 1;
			P.tmp_skipevent = 1;
		}
	},
	{
		names: ['event'],
		section: 'BASIC',
		line: 361,
		kind: 'core',
		returns: false,
		usage: 'event:S [, {"global" | class:s, id:i}]',
		run(P) {
			const event = P.params();
			if (P.parse_comma(0)) {
				const cls = P.param();
				if (cls === 'global') {
					P.parse_globalevent(event, 'triggered by event command');
				} else {
					// quirk: "self" is not resolved here (class -1).
					const classint = P.parse_getclass(cls);
					P.parse_comma(1);
					const id = Int(P.param());
					P.parse_emuevent(classint, id, event, 'triggered by event command');
				}
			} else {
				P.parse_emuevent(P.p_env_class, P.p_env_id, event, 'triggered by event command');
			}
		}
	},
	{
		names: ['addscript'],
		section: 'BASIC',
		line: 646,
		kind: 'core',
		returns: false,
		usage: 'class:s {self | , id:i}, source:S',
		run(P) {
			const [classint, id] = classId(P);
			P.parse_comma(1);
			const source = P.params();
			const txt = txtsource(P, source, false);
			if (txt === '0' || txt === '') {
				P.parse_error('txtsource', source);
			} else {
				// Global. quirk: despite its name the command REPLACES the script.
				if (classint === 0) {
					P.map_briefing = txt;
					P.map_briefing_key = P.preparse_string(P.map_briefing);
				}
				// Local
				P.tx.remove((tx) => tx.parent_class === classint && tx.parent_id === id && tx.mode === 0);
				// quirk: also for class 0, which leaves a second copy of the map script in the Tx list.
				P.tx.add({ parent_class: classint, parent_id: id, value: txt, key: P.preparse_string(txt) });
			}
		}
	},
	{
		names: ['extendscript'],
		section: 'BASIC',
		line: 712,
		kind: 'core',
		returns: false,
		usage: 'class:s {self | , id:i}, source:S',
		run(P) {
			const [classint, id] = classId(P);
			P.parse_comma(1);
			const source = P.params();
			const txt = txtsource(P, source, true);
			if (txt === '0' || txt === '') {
				P.parse_error('txtsource', source);
			} else {
				let scriptsaved = 0;
				// Global
				if (classint === 0) {
					P.map_briefing = P.map_briefing + SEP_LINE + txt;
					P.map_briefing_key = P.preparse_string(P.map_briefing);
					scriptsaved = 1;
				}
				// Local
				const tx = P.tx.find((t) => t.parent_class === classint && t.parent_id === id && t.mode === 0);
				if (tx) {
					scriptsaved = 1;
					tx.value = tx.value + SEP_LINE + txt;
					tx.key = P.preparse_string(tx.value);
				}
				if (scriptsaved === 0) {
					P.tx.add({ parent_class: classint, parent_id: id, value: txt, key: P.preparse_string(txt), mode: 0 });
				}
			}
		}
	},
	{
		names: ['timer'],
		section: 'BASIC',
		line: 1146,
		kind: 'core',
		returns: false,
		usage: 'class:s {self | 0 | , id:i}, duration:i [, mode:i=1] [, source:S="timer"]',
		run(P) {
			P.timer_add();
		}
	},
	{
		names: ['freetimers'],
		section: 'BASIC',
		line: 1150,
		kind: 'core',
		returns: false,
		usage: 'class:s {0 | self | , id:i} [, source:s]',
		run(P) {
			let cls = P.param();
			if (cls === '0') {
				cls = '';
				if (P.parse_comma(0)) cls = P.param();
				P.timer_free(0, 0, cls);
			} else {
				const classint0 = P.parse_getclass(cls);
				let classint = classint0;
				let id = 0;
				if (classint0 === -1) {
					classint = P.p_env_class;
					id = P.p_env_id;
				} else {
					P.parse_comma(1);
					id = Int(P.param());
				}
				cls = '';
				if (P.parse_comma(0)) cls = P.param();
				P.timer_free(classint, id, cls);
			}
		}
	},
	{
		names: ['timercount'],
		section: 'BASIC',
		line: 1175,
		kind: 'core',
		returns: true,
		usage: 'class:s {0 | self | , id:i}',
		run(P) {
			const cls = P.param();
			if (cls === '0') {
				P.p_return = istr(P.timer_count(0, 0));
			} else {
				let classint = P.parse_getclass(cls);
				let id = 0;
				if (classint === -1) {
					classint = P.p_env_class;
					id = P.p_env_id;
				} else {
					P.parse_comma(1);
					id = Int(P.param());
				}
				P.p_return = istr(P.timer_count(classint, id));
			}
		}
	},
	{
		names: ['exit'],
		section: 'BASIC',
		line: 1407,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			// Leaves the running loop; outside of a loop it does nothing.
			if (P.p_loopmode > 0) {
				P.p_loopi = 0;
				P.p_loopmode = 0;
				while (P.p_bracelevel > P.p_looplevel) {
					P.parse_closebrace(0);
					P.p_bracelevel = P.p_bracelevel - 1;
					P.p_p = P.p_p + 1;
				}
				P.jumptosemi = 0;
			}
		}
	},

	// ################################################# BUFFER
	{
		names: ['add'],
		section: 'BUFFER',
		line: 2162,
		kind: 'core',
		returns: false,
		usage: 'line:S',
		run(P) {
			if (P.pv.buffer === '') P.pv.buffer = P.params();
			else P.pv.buffer = P.pv.buffer + SEP_LINE + P.params();
		}
	},
	{
		names: ['clear'],
		section: 'BUFFER',
		line: 2170,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			P.pv.buffer = '';
		}
	},
	{
		names: ['loadfile'],
		section: 'BUFFER',
		line: 2174,
		kind: 'core',
		returns: true,
		usage: 'file:S [, start:S]',
		run(P) {
			const filename = P.params();
			P.pv.buffer = '';
			P.pv.buffer = P.parse_loadscript(filename);
			P.p_return = P.pv.buffer;
		}
	},
	{
		names: ['buffer'],
		section: 'BUFFER',
		line: 2181,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = P.pv.buffer;
		}
	},

	// ################################################# FREE
	{
		names: ['freescripts'],
		section: 'FREE',
		line: 4141,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			P.tx.remove((tx) => tx.mode === 0);
		}
	},
	{
		names: ['freescript'],
		section: 'FREE',
		line: 4147,
		kind: 'core',
		returns: false,
		usage: 'class:s {self | , id:i}',
		run(P) {
			const [classint, id] = classId(P);
			// quirk: no mode check, so the entity's local variables and other extensions go too.
			P.tx.remove((tx) => tx.parent_class === classint && tx.parent_id === id);
		}
	},
	{
		names: ['freevars'],
		section: 'FREE',
		line: 4166,
		kind: 'core',
		returns: false,
		usage: '[locals:i=1]',
		run(P) {
			P.tx.remove((tx) => tx.mode === 1);
			let freelocals = 1;
			if (P.parse_param()) freelocals = Int(P.param());
			if (freelocals === 1) P.tx.remove((tx) => tx.mode === 4);
		}
	},
	{
		names: ['freevar', 'unset'],
		section: 'FREE',
		line: 4181,
		kind: 'core',
		returns: false,
		usage: 'var:v [, var:v]...',
		run(P) {
			P.var_free(stripDollar(P.param(1)));
			while (P.parse_comma(0)) P.var_free(stripDollar(P.param(1)));
		}
	},

	// ################################################# RETURN
	{
		names: ['loop_id'],
		section: 'RETURN',
		line: 4338,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.p_loopi);
		}
	},
	{
		names: ['return'],
		section: 'RETURN',
		line: 4343,
		kind: 'core',
		returns: true,
		usage: 'value:s',
		run(P) {
			P.p_return = P.param();
		}
	},
	{
		names: ['int'],
		section: 'RETURN',
		line: 4347,
		kind: 'core',
		returns: true,
		usage: 'value:i',
		run(P) {
			// quirk: text -> integer is atoi, so int(3.9) is 3 and int(-3.9) is -3.
			P.p_return = istr(Int(P.param()));
		}
	},
	{
		names: ['random'],
		section: 'RETURN',
		line: 4370,
		kind: 'core',
		returns: true,
		usage: 'peak:i [, bottom:i]',
		run(P) {
			const peak = Int(P.param());
			if (P.parse_comma(0)) {
				// The second parameter is the lower bound; Rand() swaps the two if they are reversed.
				const bottom = Int(P.param());
				P.p_return = istr(P.Rand(bottom, peak));
			} else {
				P.p_return = istr(P.Rand(peak));
			}
		}
	},
	{
		names: ['gt'],
		section: 'RETURN',
		line: 4767,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.host.gt() ?? 0);
		}
	},
	{
		names: ['currentclass', 'cclass', 'current_class'],
		section: 'RETURN',
		line: 4771,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.p_env_class);
		}
	},
	{
		names: ['currentid', 'cid', 'current_id'],
		section: 'RETURN',
		line: 4775,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.p_env_id);
		}
	},
	trig('sin', 5059, Sin),
	trig('cos', 5070, Cos),
	trig('tan', 5081, Tan),

	// ################################################# VARS
	{
		names: ['abs'],
		section: 'VARS',
		line: 5178,
		kind: 'core',
		returns: true,
		usage: 'value:f',
		run(P) {
			// quirk: always a float, abs(-5) is "5.0".
			P.p_return = fstr(Math.abs(Float(P.param())));
		}
	},
	{
		names: ['savevars'],
		section: 'VARS',
		line: 5182,
		kind: 'core',
		returns: true,
		usage: '[file:v="varcache" [, varlist:v="-"]]',
		run(P) {
			let file = 'varcache';
			let varlist = '-';
			if (P.parse_param()) {
				file = P.param(1);
				if (P.parse_comma(0)) varlist = P.param(1);
			}
			P.p_return = istr(P.var_cache_save(file, varlist));
		}
	},
	{
		names: ['loadvars'],
		section: 'VARS',
		line: 5194,
		kind: 'core',
		returns: true,
		usage: '[file:v="varcache"]',
		run(P) {
			let file = 'varcache';
			if (P.parse_param()) file = P.param(1);
			P.p_return = istr(P.var_cache_load(file));
		}
	},
	{
		names: ['varexists'],
		section: 'VARS',
		line: 5202,
		kind: 'core',
		returns: true,
		usage: 'var:v',
		run(P) {
			P.p_return = istr(P.var_exists(stripDollar(P.param(1))));
		}
	},
	{
		names: ['rename'],
		section: 'VARS',
		line: 5210,
		kind: 'core',
		returns: false,
		usage: 'var:v, name:s',
		run(P) {
			const v = stripDollar(P.param(1));
			P.parse_comma(1);
			const name = P.param();
			// quirk: globals only, the new name is not checked and may collide.
			const tx = P.tx.find((t) => t.mode === 1 && t.key === v);
			if (tx) tx.key = name;
		}
	},
	{
		names: ['temp'],
		section: 'VARS',
		line: 5227,
		kind: 'core',
		returns: false,
		usage: 'var:v [, var:v]...',
		run(P) {
			P.var_temp(P.param(1));
			while (P.parse_comma(0)) P.var_temp(P.param(1));
		}
	},
	{
		names: ['tempall'],
		section: 'VARS',
		line: 5236,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			for (const tx of P.tx.items) {
				if (tx.mode === 1) tx.stuff = 'temp';
			}
		}
	},
	{
		names: ['local'],
		section: 'VARS',
		line: 5244,
		kind: 'core',
		returns: false,
		usage: 'var:v [, var:v]...',
		run(P) {
			P.var_local(P.param(1));
			while (P.parse_comma(0)) P.var_local(P.param(1));
		}
	},
	{
		names: ['getlocal'],
		section: 'VARS',
		line: 5253,
		kind: 'core',
		returns: true,
		usage: 'class:s, id:i, var:v',
		run(P) {
			// quirk: "self" is not resolved here (class -1).
			const classint = P.parse_getclass(P.param());
			P.parse_comma(1);
			const id = Int(P.param());
			P.parse_comma(1);
			const v = stripDollar(P.param(1));
			P.p_return = P.var_get_local(classint, id, v);
		}
	},
	{
		names: ['setlocal'],
		section: 'VARS',
		line: 5266,
		kind: 'core',
		returns: false,
		usage: 'class:s, id:i, var:v [, value:s=0]',
		run(P) {
			const classint = P.parse_getclass(P.param());
			P.parse_comma(1);
			const id = Int(P.param());
			P.parse_comma(1);
			const v = stripDollar(P.param(1));
			let strvalue = '0';
			if (P.parse_comma(0)) strvalue = P.param();
			P.var_set_local(classint, id, v, strvalue);
		}
	},
	{
		names: ['getsetting'],
		section: 'VARS',
		line: 5284,
		kind: 'host',
		returns: true,
		usage: 'setting:s',
		run(P) {
			P.p_return = '0';
			const name = P.param();
			if (SETTINGS.includes(name)) {
				const r = P.host.cmd_getsetting(P, name);
				if (typeof r === 'string') P.p_return = r;
			} else {
				P.parse_error("Settings '" + name + "' does not exist!");
			}
		}
	},
	{
		names: ['state'],
		section: 'VARS',
		line: 5304,
		kind: 'core',
		returns: true,
		usage: '',
		run(P) {
			P.p_return = istr(P.pv.state);
		}
	},

	// ##################################### Strings
	{
		names: ['length'],
		section: 'Strings',
		line: 5440,
		kind: 'core',
		returns: true,
		usage: 'string:s',
		run(P) {
			P.p_return = istr(P.param().length);
		}
	},
	{
		names: ['trim'],
		section: 'Strings',
		line: 5445,
		kind: 'core',
		returns: true,
		usage: 'string:s',
		run(P) {
			// quirk: trimtext() only removes one quote at each end, no whitespace.
			P.p_return = trimtext(P.param());
		}
	},
	{
		names: ['replace'],
		section: 'Strings',
		line: 5450,
		kind: 'core',
		returns: true,
		usage: 'string:s, search:s, replace:s',
		run(P) {
			const str = P.param();
			P.parse_comma(1);
			const search = P.param();
			P.parse_comma(1);
			const repl = P.param();
			P.p_return = Replace(str, search, repl);
		}
	},
	{
		names: ['split'],
		section: 'Strings',
		line: 5459,
		kind: 'core',
		returns: true,
		usage: 'string:s, sign:s, index:s',
		run(P) {
			const str = P.param();
			P.parse_comma(1);
			const search = P.param();
			P.parse_comma(1);
			const repl = P.param();
			const splits = split(str, search, Int(repl) + 1);
			// A negative index reads outside the array in the original; "" here.
			P.p_return = splits[Int(repl)] ?? '';
		}
	},
	{
		names: ['extract'],
		section: 'Strings',
		line: 5469,
		kind: 'core',
		returns: true,
		usage: 'string:s, start:s [, length:s=-1]',
		run(P) {
			const str = P.param();
			P.parse_comma(1);
			let search = P.param();
			let repl = '-1';
			if (P.parse_comma(0)) repl = P.param();
			if (Int(search) <= 0) search = '1';
			if (Int(repl) === -1 || Int(repl) > 0) {
				P.p_return = Mid(str, Int(search), Int(repl));
			} else {
				P.parse_error('extract length has to be either -1 or >0');
			}
		}
	},
	{
		names: ['join'],
		section: 'Strings',
		line: 5483,
		kind: 'core',
		returns: true,
		usage: 'string:S [, string:S]...',
		run(P) {
			P.p_return = '';
			P.p_return = P.params();
			while (P.parse_comma(0)) {
				const v = P.params();
				P.p_return = P.p_return + v;
			}
		}
	}
];
