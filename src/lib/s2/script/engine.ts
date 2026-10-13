/**
 * The Stranded II script interpreter core: a function-by-function port of
 * includes/parser.bb, parser_pre.bb, parser_functions.bb, parser_brace.bb,
 * parser_vars.bb, parser_math.bb, parser_loop.bb, parser_dialogue.bb and
 * timer.bb. Original function and global names are kept.
 *
 * The interpreter is a cursor over text lines, not an AST: behaviour that
 * looks wrong here (lost operands, operators found inside words, commas
 * found anywhere on the line) is how the shipped game behaves and is
 * reproduced on purpose. Such places carry a "quirk:" comment.
 */
import { SEP_LINE, Trim, blitzRnd, split, trimspace } from '../blitz';
import {
	type BlitzRnd,
	Float,
	Instr,
	Int,
	Left,
	Mid,
	Replace,
	Right,
	code,
	f32,
	fstr,
	istr,
	trimexquote,
	trimtext
} from './_helpers';
import type { CommandDef, ParseCtx, ParseVars, Ttimer, Tx, TxList } from './api';
import {
	Cbmpf_red,
	Cbmpf_yellow,
	Cclass_global,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_state,
	Cclass_unit,
	createRecordingHost,
	type HostEntity,
	type ScriptHost
} from './host';

/** RuntimeError() of Blitz: the original program ends here. */
export class BlitzRuntimeError extends Error {}

/** Type Tpt: a queued parse task. */
export interface Tpt {
	class: number;
	id: number;
	event: string;
	info: string;
	script: string;
}

/** Type Tpj: jump point set at every opening brace. */
interface Tpj {
	l: number;
	pos: number;
	level: number;
	typ: string;
	name: string;
}

/** Type Tpm: one "operator value" part of a simple term. */
interface Tpm {
	typ: number;
	pos: number;
	txt: string;
	value: string;
	dead: boolean;
}

/** Type Tpkill */
export interface Tpkill {
	class: number;
	id: number;
	h: unknown;
	spawntimer: number;
}

/** Type Tdefvar */
export interface Tdefvar {
	class: number;
	typ: number;
	key: string;
	descr: string;
	defaultval: string;
	isglobal: number;
}

/** A parse_error() call, as shown in the console (p_erd$(0..10)). */
export interface ScriptError {
	id: string;
	param: string;
	/** p_erd$(0): the message. */
	message: string;
	/** All non-empty p_erd$ lines. */
	details: string[];
	row: number;
	col: number;
	line: string;
	/** True when an '@' prefix kept it out of the console. */
	suppressed: boolean;
}

/** Type Ttrade (dialogue trades). */
export interface Ttrade {
	id: number;
	/** 0 header, 1 sell, 2 buy */
	mode: number;
	typ: number;
	count: number;
}

/** in_sb*(0..9): dialogue / message box buttons. */
export interface DialogueButton {
	/** in_sb */
	active: number;
	/** in_sb_icon */
	icon: number;
	/** in_sb_txt$ */
	txt: string;
	/** in_sb_scr$ */
	scr: string;
	/** in_sb_handle */
	handle: number;
}

/** Interface state written by parse_dialogue() (no UI here). */
export interface DialogueState {
	/** in_dlg$: dialogue source, lines joined with the 0xA6 separator. */
	in_dlg: string;
	in_dlg_page: string;
	in_msgtitle: string;
	in_msgtext: string;
	in_scr_scr: number;
	buttons: DialogueButton[];
	trades: Ttrade[];
	/** Set when a button did "action:close" (the original sets m_menu=0). */
	m_menu_closed: boolean;
}

const Cicon_ok = 17;

class TxStore implements TxList {
	items: Tx[] = [];
	add(fields: Partial<Tx>): Tx {
		const tx: Tx = {
			typ: 0,
			parent_class: 0,
			parent_id: 0,
			mode: 0,
			key: '',
			value: '',
			stuff: '',
			...fields
		};
		this.items.push(tx);
		return tx;
	}
	remove(pred: (tx: Tx) => boolean): number {
		const before = this.items.length;
		const keep = this.items.filter((t) => !pred(t));
		this.items.length = 0;
		this.items.push(...keep);
		return before - keep.length;
	}
	delete(tx: Tx): void {
		const i = this.items.indexOf(tx);
		if (i >= 0) this.items.splice(i, 1);
	}
	find(pred: (tx: Tx) => boolean): Tx | undefined {
		return this.items.find(pred);
	}
}

function newParseVars(): ParseVars {
	return {
		x: 0,
		y: 0,
		z: 0,
		buffer: '',
		attack_damage: 0,
		attack_weapon: 0,
		attack_ammo: 0,
		impact_class: 0,
		impact_id: 0,
		impact_kill: 0,
		impact_num: 0,
		impact_amount: 0,
		impact_x: 0,
		impact_y: 0,
		impact_z: 0,
		impact_ground: 0,
		ai_eater: 0,
		state: 0,
		lastbuilding: 0,
		loadmaploaded: 0
	};
}

export class ScriptEngine implements ParseCtx {
	host: ScriptHost;
	/** Command name -> handler (the Select p_com$ of parse_commands). */
	readonly commands = new Map<string, CommandDef>();
	readonly tx: TxList = new TxStore();
	readonly pv: ParseVars = newParseVars();
	readonly timers: Ttimer[] = [];
	/**
	 * Rand/Rnd of the script commands draw from the one generator of the
	 * program (blitz/math.ts blitzRnd), as in the original where scripts and
	 * game code share SeedRnd. Assign a private BlitzRnd for isolated tests.
	 */
	rnd: BlitzRnd = blitzRnd;

	/** set_debug: 1 shows full script errors and logs every parse. */
	set_debug = 0;
	/** m_section=Csection_editor: parse() does nothing unless noskip is set. */
	m_section_editor = false;
	/** ed_setscript$ */
	ed_setscript = '';
	/**
	 * Not in the original (an endless script loop simply hangs the game): when
	 * above 0, parse() throws a BlitzRuntimeError after this many steps.
	 */
	stepLimit = 0;

	// --- script sources -----------------------------------------------------
	map_briefing = '';
	map_briefing_key = '';
	/** game_script$ / game_scriptk$ (game.inf) */
	game_script = '';
	game_scriptk = '';
	/** Dobject_script$/Dunit_script$/Ditem_script$/Dinfo_script$(typ) by class, and their keys. */
	readonly Dscript: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] };
	readonly Dscriptk: Record<number, string[]> = { 1: [], 2: [], 3: [], 4: [] };
	/** Cobject_count / Cunit_count / Citem_count / Cinfo_count by class. */
	readonly Dcount: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };

	// --- parser globals (load_vars.bb) -------------------------------------
	p_l = '';
	p_len = 0;
	p_lines = 0;
	p_pl = 0;
	p_p = 0;
	p_gotparam = 0;
	p_com = '';
	p_bracelevel = 0;
	p_bracemode = 0;
	p_bracetype = '';
	p_bracepar = '';
	p_elseif = 0;
	p_varname = '';
	p_loopmode = 0;
	p_looprow = 0;
	p_loopcol = 0;
	p_looptype = '';
	p_loopargs = '';
	p_looplevel = 0;
	p_loopi = 0;
	/** p_loop_object/unit/item/info/state: the entity the running loop stands on. */
	private p_loop_entity: HostEntity | null = null;
	p_parseinprogress = 0;
	p_env_class = 0;
	p_env_id = 0;
	p_env_event = '';
	p_env_info = '';
	p_skipevent = 0;
	p_m_ol = 0;
	p_m_or = 0;
	p_m_base = '';
	p_m_value = '';
	p_m_basec = 0;
	p_m_o = '';
	p_error = 0;
	p_erd: string[] = new Array(11).fill('');
	p_noerror = 0;
	p_return = '';
	p_internal = 0;
	p_internaltxt = '';
	tmp_skipevent = 0;
	tmp_dumpvars = 0;
	tmp_gclass = 0;
	tmp_gid = 0;
	tmp_constv = 0;
	jumptosemi = 1;

	/** Dpc$(): the lines of the script being parsed. */
	private Dpc: string[] = [];
	/** Tpc: lines waiting for the next parse(). */
	private Tpc: string[] = [];
	/** Tpt: queued parse tasks. */
	readonly tasks: Tpt[] = [];
	private Tpj: Tpj[] = [];
	private Tpm: Tpm[] = [];
	readonly Tpkill: Tpkill[] = [];
	readonly Tconst = new Map<string, number>();
	readonly Tdefvar: Tdefvar[] = [];

	/** Every parse_error() since the last clearErrors(). */
	readonly errors: ScriptError[] = [];

	readonly dialogue: DialogueState = {
		in_dlg: '',
		in_dlg_page: '',
		in_msgtitle: '',
		in_msgtext: '',
		in_scr_scr: 0,
		buttons: Array.from({ length: 10 }, () => ({ active: 0, icon: 0, txt: '', scr: '', handle: 0 })),
		trades: [],
		m_menu_closed: false
	};

	constructor(host?: ScriptHost, commands: readonly CommandDef[] = []) {
		this.host = host ?? createRecordingHost().host;
		for (const def of commands) this.register(def);
	}

	/** Add or replace the handler of every name of a command. */
	register(def: CommandDef): void {
		for (const name of def.names) this.commands.set(name, def);
	}

	clearErrors(): void {
		this.errors.length = 0;
	}

	Rand(a: number, b = 1): number {
		return this.rnd.Rand(a, b);
	}

	Rnd(a: number, b = 0): number {
		return this.rnd.Rnd(a, b);
	}

	// ====================================================================
	// parser.bb
	// ====================================================================

	/** parse(noskip=0): run the lines in the parse cache. Returns 1 when it ran to the end or hit "skip". */
	parse(noskip = 0): number {
		// Skip Parser in Editor
		if (this.m_section_editor) {
			if (noskip === 0) {
				this.clear_parsecache();
				return 0;
			}
		}

		// Error at Crossparsing!
		if (this.p_parseinprogress === 1) {
			let m = 'Crossparsing Error\r';
			m += 'Crossparsing Event Data (triggerd by a Script)\r';
			m += 'Event: ' + this.p_env_event + ' ' + this.p_env_info + '\r';
			m += 'Class: ' + this.p_env_class + '\r';
			m += 'ID: ' + this.p_env_id + '\r';
			m += 'Avoid scripts which trigger events which need\r';
			m += 'to be parsed instantly.';
			throw new BlitzRuntimeError(m);
		}
		this.p_parseinprogress = 1;

		let comment = 0;
		let steps = 0;
		// p_rootif is not a declared global: it is a local of parse().
		let p_rootif = 0;

		this.p_error = 0;
		this.p_noerror = 0;
		this.p_bracelevel = 0;
		this.p_bracemode = 0;
		this.p_bracetype = '';
		this.p_bracepar = '';
		this.p_loopmode = 0;
		this.p_looprow = 0;
		this.p_loopcol = 0;
		this.p_looptype = '';
		this.p_loopargs = '';
		this.p_looplevel = 0;
		this.p_loopi = 0;
		this.p_m_ol = 0;
		this.p_m_or = 0;
		this.p_m_base = '0';
		this.p_m_value = '0';
		this.p_m_basec = 0;
		this.p_m_o = '';
		this.p_elseif = 0;
		this.p_varname = '';

		// Free Jump Points
		this.Tpj = [];

		// Cache Lines in Parse-Cache-Type (Tpc) to Array (Dpc)
		this.Dpc = this.Tpc;
		this.Tpc = [];
		this.p_lines = this.Dpc.length;

		// Check all lines in Parse Cache
		this.p_pl = 0;
		while (this.p_pl < this.p_lines) {
			this.p_l = this.Dpc[this.p_pl];
			this.p_len = this.p_l.length;
			this.p_p = 1;

			while (this.p_p <= this.p_len) {
				if (this.stepLimit > 0 && ++steps > this.stepLimit) {
					this.p_parseinprogress = 0;
					throw new BlitzRuntimeError('Script does not terminate (stepLimit ' + this.stepLimit + ')');
				}
				if (this.parse_skipspace()) {
					// ### Comment?
					const twof = Mid(this.p_l, this.p_p, 2);
					if (comment === 1) {
						if (twof === '*/') {
							comment = 0;
							this.p_p += 2;
							this.parse_skipspace();
						} else if (Instr(this.p_l, '*/')) {
							this.p_p += 1;
						} else {
							this.p_p = this.p_len + 1;
						}
					} else {
						if (twof === '//') this.p_p = this.p_len + 1;
						if (twof === '/*') comment = 1;
					}

					// ### PARSE
					if (comment === 0) {
						if (this.p_p <= this.p_len) {
							if (this.parse_com()) {
								if (this.p_bracemode === 0) {
									switch (this.p_com) {
										// Variable Assignment
										case '$':
											switch (this.var_parse()) {
												case '=':
													this.var_set(this.p_varname, this.param());
													break;
												case '+=':
													this.var_modify(this.p_varname, this.param());
													break;
												case '++':
													this.var_modify(this.p_varname, '1');
													break;
												case '-=': {
													// exe: arguments evaluated value, name ("-"+param$() runs before p_varname$ is read; "=" and "+=" read the name first)
													const argvalue = '-' + this.param();
													this.var_modify(this.p_varname, argvalue);
													break;
												}
												case '--':
													this.var_modify(this.p_varname, '-1');
													break;
											}
											this.parse_semi();
											break;

										// Error Oppression
										case '@':
											if (this.p_noerror > 0) {
												this.p_noerror = 0;
												this.parse_error("'@' sequences are not allowed. Max. one '@' per command");
											} else {
												this.p_noerror = 2;
												this.p_p += 1;
											}
											break;

										// ON Events
										case 'on':
											if (Mid(this.p_l, this.p_p, 1) !== ':') {
												this.parse_error('expect', "':'");
											} else {
												const ps = this.p_p + 1;
												const pe = this.parse_end(this.p_l, ps);
												this.p_bracepar = Mid(this.p_l, ps, pe - ps);
												this.p_bracemode = 1;
												this.p_bracetype = 'on';
												this.p_p = pe;
												this.parse_openbrace();
											}
											if (this.p_bracelevel !== 0) {
												this.parse_error("'on' must not be subordinated to conditions");
											}
											break;

										// IF Conditions
										case 'if':
											this.p_bracepar = this.param();
											this.p_bracemode = 1;
											this.p_bracetype = 'if';
											this.parse_openbrace();
											break;

										// ELSEIF Conditions
										case 'elseif':
											p_rootif = this.parse_getjpbool(this.p_bracelevel + 1);
											if (p_rootif === 1) {
												// quirk: the skipped condition is still evaluated (functions in it run).
												this.param();
												this.p_bracepar = '0';
											} else {
												this.p_bracepar = this.param();
											}
											this.p_bracemode = 1;
											this.p_bracetype = 'elseif';
											this.parse_openbrace();
											break;

										// ELSE
										case 'else':
											this.p_bracepar = istr(this.parse_getjpbool(this.p_bracelevel + 1));
											this.p_bracemode = 1;
											this.p_bracetype = 'else';
											this.parse_openbrace();
											break;

										// SKIP
										case 'skip':
											this.p_parseinprogress = 0;
											return 1;

										// LOOP
										case 'loop':
											this.parse_loop();
											this.p_bracemode = 1;
											this.p_bracetype = 'loop';
											this.parse_openbrace();
											this.p_looprow = this.p_pl;
											this.p_loopcol = this.p_p;
											this.p_looplevel = this.p_bracelevel;
											this.p_loopi = 0;
											break;

										// Command
										default:
											this.parse_commands();
									}
								} else {
									this.parse_error('expect', "'{'");
								}

								// Oppress Errors Countdown
								this.p_noerror = this.p_noerror - 1;
							} else {
								// ### Stuff?
								const sign = this.p_l.charCodeAt(this.p_p - 1);

								if (sign === 123) {
									// ### Opening Brace {
									if (this.p_bracemode === 1) {
										this.p_bracemode = 0;
										this.p_bracelevel += 1;
										this.parse_setjp(this.p_pl, this.p_p, this.p_bracelevel, this.p_bracetype, this.p_bracepar);
										this.p_p += 1;
										// Skip brace content?
										switch (this.p_bracetype) {
											case 'on':
												if (this.p_env_event !== this.p_bracepar) this.parse_closebrace();
												break;
											case 'if':
												if (Int(this.p_bracepar) === 0) this.parse_closebrace();
												break;
											case 'elseif':
												if (Int(this.p_bracepar) === 0) this.parse_closebrace();
												if (p_rootif === 1) this.parse_freelastjp();
												break;
											case 'else':
												if (Int(this.p_bracepar) === 1) this.parse_closebrace();
												break;
											case 'loop':
												this.parse_loop_check();
												break;
											default:
												this.parse_error('internal parsing error. unknwon brace type.');
										}
									} else {
										this.parse_error('wrongbrace');
									}
								} else if (sign === 125) {
									// ### Closing Brace }
									this.p_bracelevel -= 1;
									if (this.p_bracelevel < 0) this.parse_error('brackets');
									this.p_p += 1;
									// Loop - Jump to Start
									if (this.p_loopmode === 1) {
										if (this.p_looplevel === this.p_bracelevel) {
											this.parse_setl(this.p_looprow);
											this.p_p = this.p_loopcol;
											this.p_bracemode = 1;
											this.p_bracetype = 'loop';
										}
									}
								} else {
									// ### Other Stuff -> Error
									this.parse_error('unexpected', String.fromCharCode(sign));
									if (this.p_bracemode === 1) {
										this.parse_error("Expecting '{' for " + this.p_bracetype);
									}
								}
							}

							// Cancel on Error
							if (this.p_error === 1) {
								this.p_parseinprogress = 0;
								return 0;
							}
						}
					}
				}
			}

			// Next Line
			this.p_pl += 1;
		}

		// Finish
		this.p_parseinprogress = 0;
		return 1;
	}

	// ====================================================================
	// parser_commands.bb: the dispatcher
	// ====================================================================

	/** parse_commands(jumptosemi=1, internal=0): run the command named by p_com$. */
	parse_commands(jumptosemi = 1, internal = 0): void {
		this.p_return = '';
		this.p_internal = internal;
		// jumptosemi is a parameter of the original function: one per call.
		const outer = this.jumptosemi;
		this.jumptosemi = jumptosemi;

		const def = this.commands.get(this.p_com);
		if (def) def.run(this);
		else this.parse_error('uk'); // DEFAULT ERROR

		// Find and jump to Semi (;)
		if (this.jumptosemi === 1) this.parse_semi();
		this.jumptosemi = outer;

		// Disable Internal Parsing
		// quirk: also for the caller, so after a nested function the outer
		// function goes on reading its parameters from the script line.
		this.p_internal = 0;
	}

	// ====================================================================
	// parser_pre.bb
	// ====================================================================

	/** preparse(): build the event key of the map script and of every script in the Tx list. */
	preparse(): void {
		this.map_briefing_key = this.preparse_string(this.map_briefing);
		for (const tx of this.tx.items) {
			if (tx.mode === 0) tx.key = this.preparse_string(tx.value);
		}
		// Kill Keys of Text Container Infos to avoid that their Scripts are parsed
		for (const info of this.host.entities(Cclass_info) ?? []) {
			if (info.typ === 37) {
				for (const tx of this.tx.items) {
					if (tx.mode === 0 && tx.parent_class === Cclass_info && tx.parent_id === info.id) tx.key = '';
				}
			}
		}
	}

	/** preparse_string$(txt$): the names after every "on:" in txt, each prefixed with the 0xA6 separator. */
	preparse_string(txt: string): string {
		let key = '';
		if (Instr(txt, 'on:') > 0) {
			const l = txt.length;
			// quirk: plain text search, so "on:" inside comments, strings and words ("button:") counts too.
			for (let i = 1; i <= l; i++) {
				if (Mid(txt, i, 3) === 'on:') {
					i = i + 3;
					const onend = this.parse_end(txt, i);
					key = key + SEP_LINE + Mid(txt, i, onend - i);
				}
			}
		}
		return key;
	}

	// ====================================================================
	// parser_functions.bb: parse cache
	// ====================================================================

	clear_parsecache(): void {
		this.Tpc = [];
	}

	add_parsecache(txt: string): number {
		txt = Trim(txt);
		if (txt === '') return 0;
		// quirk: written Left(txt$="//",2), which is only true for a line that is exactly "//".
		if (txt === '//') return 0;
		this.Tpc.push(txt);
		return 1;
	}

	loadstring_parsecache(txt: string, sep = SEP_LINE, clear = 1): void {
		if (clear) this.clear_parsecache();
		let substr = txt;
		while (Instr(substr, sep)) {
			const pos = Instr(substr, sep);
			const temp = Trim(Left(substr, pos - 1));
			if (temp !== '') this.Tpc.push(temp);
			substr = Mid(substr, pos + 1, -1);
		}
		// quirk: the last line is added untrimmed.
		if (substr !== '') this.Tpc.push(substr);
	}

	parse_env(cls = 0, id = 0, event = '', info = ''): void {
		this.p_env_class = cls;
		this.p_env_id = id;
		this.p_env_event = event;
		this.p_env_info = info;
	}

	/** set_parsecache(class, id, event$="", info$=""): queue the script attached to an entity. */
	set_parsecache(cls: number, id: number, event = '', info = ''): number {
		for (const tx of this.tx.items) {
			if (tx.mode === 0 && tx.parent_class === cls && tx.parent_id === id) {
				if (event !== '') {
					if (Instr(tx.key, SEP_LINE + event) === 0) return 0;
				}
				this.tasks.push({ class: cls, id, event, info, script: tx.value });
				return 1;
			}
		}
		// Global Script
		if (cls === 0) {
			if (id === 0) {
				if (Instr(this.map_briefing_key, SEP_LINE + event)) {
					// quirk: queues the task but still returns 0.
					this.tasks.push({ class: 0, id: 0, event, info, script: this.map_briefing });
				}
			}
		}
		return 0;
	}

	/** parse_globalevent(event$, info$=""): queue the event for every script that has it. */
	parse_globalevent(event: string, info = ''): void {
		const k = SEP_LINE + event;
		// Game Script
		if (Instr(this.game_scriptk, k)) {
			this.tasks.push({ class: -1, id: 0, event, info, script: this.game_script });
		}
		// Global Script
		if (Instr(this.map_briefing_key, k)) {
			this.tasks.push({ class: 0, id: 0, event, info, script: this.map_briefing });
		}
		// Scripts
		for (const tx of this.tx.items) {
			if (tx.mode === 0) {
				if (Instr(tx.key, k)) {
					this.tasks.push({ class: tx.parent_class, id: tx.parent_id, event, info, script: tx.value });
				}
			}
		}
		// Object, Unit, Item, Info Definitions
		for (const cls of [Cclass_object, Cclass_unit, Cclass_item, Cclass_info]) {
			const keys = this.Dscriptk[cls];
			let ents: readonly HostEntity[] | undefined;
			for (let i = 1; i <= this.Dcount[cls]; i++) {
				const key = keys[i];
				if (key && Instr(key, k)) {
					ents ??= this.host.entities(cls) ?? [];
					for (const e of ents) {
						if (e.typ === i) {
							this.tasks.push({ class: cls, id: e.id, event, info, script: this.Dscript[cls][i] ?? '' });
						}
					}
				}
			}
		}
	}

	/** parse_task(class, id, event$, info$, script$) */
	parse_task(cls: number, id: number, event: string, info: string, script: string): void {
		this.tasks.push({ class: cls, id, event, info, script });
	}

	/** parse_all(): run every queued task, including the ones queued meanwhile. */
	parse_all(): void {
		while (this.tasks.length > 0) {
			const t = this.tasks[0];
			// quirk: the debug line is printed before the environment is switched, so it shows the previous task.
			if (this.set_debug === 1) {
				this.host.con_add(
					'PARSE: ' + this.p_env_event + ' @ ' + this.p_env_class + ',' + this.p_env_id + ' ' + this.p_env_info,
					Cbmpf_yellow
				);
			}
			this.p_env_class = t.class;
			this.p_env_id = t.id;
			this.p_env_event = t.event;
			this.p_env_info = t.info;
			this.loadstring_parsecache(t.script, SEP_LINE);
			this.parse();
			const i = this.tasks.indexOf(t);
			if (i >= 0) this.tasks.splice(i, 1);
		}
		// Dump Vars (Locals for Kill Events)
		if (this.tmp_dumpvars === 1) {
			this.tx.remove((tx) => tx.mode === 4 && tx.typ === 1);
			this.tmp_dumpvars = 0;
		}
		// Dump Kill Cache
		for (const k of this.Tpkill) this.host.FreeEntity(k.h);
		this.Tpkill.length = 0;
	}

	/** parse_sel(class, id, event$): run the queued tasks of one entity and event now. Returns how many. */
	parse_sel(cls: number, id: number, event: string): number {
		let n = 0;
		for (let i = 0; i < this.tasks.length; ) {
			const t = this.tasks[i];
			if (t.class === cls && t.id === id && t.event === event) {
				this.p_env_class = t.class;
				this.p_env_id = t.id;
				this.p_env_event = t.event;
				this.p_env_info = t.info;
				this.loadstring_parsecache(t.script, SEP_LINE);
				if (this.set_debug === 1) {
					this.host.con_add(
						'PARSE (OBJECT,EVENT): ' + this.p_env_event + ' @ ' + this.p_env_class + ',' + this.p_env_id + ' ' + this.p_env_info,
						Cbmpf_yellow
					);
				}
				this.parse();
				this.tasks.splice(this.tasks.indexOf(t), 1);
				n++;
			} else {
				i++;
			}
		}
		return n;
	}

	/** parse_sel_event(event$, noskip=0): run every queued task of one event now. */
	parse_sel_event(event: string, noskip = 0): void {
		for (let i = 0; i < this.tasks.length; ) {
			const t = this.tasks[i];
			if (t.event === event) {
				this.p_env_class = t.class;
				this.p_env_id = t.id;
				this.p_env_event = t.event;
				this.p_env_info = t.info;
				this.loadstring_parsecache(t.script, SEP_LINE);
				if (this.set_debug === 1) {
					this.host.con_add(
						'PARSE (EVENT): ' + this.p_env_event + ' @ ' + this.p_env_class + ',' + this.p_env_id + ' ' + this.p_env_info,
						Cbmpf_yellow
					);
				}
				this.parse(noskip);
				this.tasks.splice(this.tasks.indexOf(t), 1);
			} else {
				i++;
			}
		}
	}

	/** parse_emuevent(class, id, event$, info$=""): queue an event for one entity (definition script, then its own script). */
	parse_emuevent(cls: number, id: number, event: string, info = ''): void {
		const k = SEP_LINE + event;
		let exists = 0;
		switch (cls) {
			case Cclass_object:
				exists = this.host.con_object(id);
				break;
			case Cclass_unit:
				exists = this.host.con_unit(id);
				break;
			case Cclass_item:
				exists = this.host.con_item(id);
				break;
			case Cclass_info:
				exists = this.host.con_info(id);
				break;
		}
		if (exists) {
			const typ = this.host.entity_typ(cls, id) ?? 0;
			if (Instr(this.Dscriptk[cls][typ] ?? '', k)) {
				this.parse_task(cls, id, event, info, this.Dscript[cls][typ] ?? '');
			}
		}
		// Normal Scripts
		this.set_parsecache(cls, id, event, info);
	}

	// ====================================================================
	// parser_functions.bb: parameters
	// ====================================================================

	/** param$(rawvar=0) */
	param(rawvar = 0): string {
		let i: number;
		let s: number;
		let start = 0;
		let brace = 0;
		let quote = 0;
		let con_numerics = 0;
		let con_strings = 0;
		let con_dot = 0;
		let con_braces = 0;
		let got = 0;
		let txt: string;

		if (this.p_internal === 0) {
			this.p_gotparam = 0;

			// Scan
			for (i = this.p_p; i <= this.p_len; i++) {
				s = this.p_l.charCodeAt(i - 1);
				if (start === 0) {
					if (s !== 32) start = i;
				}
				if (s > 47 && s < 58) {
					con_numerics++;
				} else if (s === 46) {
					con_dot = 1;
				} else if (s === 34) {
					quote = 1 - quote;
					con_strings++;
					if (quote === 0) {
						if (brace === 0) {
							got = 1;
							break;
						}
					}
				} else if (s === 40) {
					brace++;
				} else if (s === 41) {
					con_braces++;
					brace--;
					if (brace <= 0) {
						if (quote === 0) {
							got = brace < 0 ? 2 : 1;
							break;
						}
					}
				} else if (s === 59 || s === 44) {
					if (quote === 0) {
						if (brace === 0) {
							got = 2;
							break;
						}
					}
				}
			}

			const pend = got === 1 ? 1 : 0;

			// Extract
			txt = Mid(this.p_l, start, i - start + pend);
			this.p_p = i + pend;
		} else {
			// Internal: read from p_internaltxt$ (the text after a function's opening bracket)
			const l = this.p_internaltxt.length;
			for (i = 1; i <= l; i++) {
				s = this.p_internaltxt.charCodeAt(i - 1);
				if (start === 0) {
					if (s !== 32) start = i;
				}
				if (s > 47 && s < 58) {
					con_numerics++;
				} else if (s === 46) {
					con_dot = 1;
				} else if (s === 34) {
					quote = 1 - quote;
					con_strings++;
					if (quote === 0) {
						if (brace === 0) {
							got = 1;
							break;
						}
					}
				} else if (s === 40) {
					brace++;
				} else if (s === 41) {
					con_braces++;
					brace--;
					if (brace <= 0) {
						if (quote === 0) {
							// quirk: the closing bracket is never included here, so a
							// function call nested in a function parameter loses its ')'
							// and ends in "Mismatched brackets".
							got = 2;
							break;
						}
					}
				} else if (s === 59 || s === 44) {
					if (quote === 0) {
						if (brace === 0) {
							got = 2;
							break;
						}
					}
				}
			}

			const pend = got === 1 ? 1 : 0;

			if (this.p_internaltxt === '') txt = '';
			else txt = Mid(this.p_internaltxt, start, i - start + pend);

			// Remove @
			if (Left(txt, 1) === '@') txt = Mid(txt, 2, -1);

			// quirk: rawvar=2 returns before the text is cut away, so nothing is consumed.
			if (rawvar === 2) return txt;

			if (rawvar === 0) {
				if (Instr(txt, '$')) txt = this.var_rep(txt);
			} else {
				con_strings = 1;
			}

			if (con_strings === 0) {
				if (con_dot === 0) {
					txt = this.parse_math(txt);
				} else if (txt.length > con_numerics + 1) {
					txt = this.parse_math(txt);
				}
			} else if (con_braces > 0) {
				txt = this.parse_math(txt);
			} else {
				txt = trimtext(txt);
			}

			// Cut away
			this.p_internaltxt = Mid(this.p_internaltxt, i + pend, -1);
			return txt;
		}

		// Remove @
		if (Left(txt, 1) === '@') txt = Mid(txt, 2, -1);

		// Skip
		if (rawvar === 2) return txt;

		// Vars
		if (rawvar === 0) {
			if (Instr(txt, '$')) txt = this.var_rep(txt);
		} else {
			con_strings = 1;
		}

		// Math
		if (con_strings === 0) {
			if (con_dot === 0) {
				txt = this.parse_math(txt);
			} else if (txt.length > con_numerics + 1) {
				txt = this.parse_math(txt);
			}
		} else if (con_braces > 0) {
			// Text with brackets goes through the maths as well.
			txt = this.parse_math(txt);
		} else {
			txt = trimtext(txt);
		}

		this.p_gotparam = 1;
		return txt;
	}

	/** params$(): string parameter: no maths, ends at space ) , ; outside quotes. */
	params(): string {
		let i: number;
		let s: number;
		let start = 0;
		let quote = 0;
		let got = 0;
		let txt: string;

		if (this.p_internal === 0) {
			this.p_gotparam = 0;
			for (i = this.p_p; i <= this.p_len; i++) {
				s = this.p_l.charCodeAt(i - 1);
				if (start === 0) {
					if (s !== 32) start = i;
				}
				if (s === 34) {
					quote = 1 - quote;
					if (quote === 0) {
						got = 1;
						break;
					}
				}
				if (start > 0) {
					if (quote === 0) {
						if (s === 32 || s === 41 || s === 44 || s === 59) {
							got = 2;
							break;
						}
					}
				}
			}
			const pend = got === 1 ? 1 : 0;
			txt = Mid(this.p_l, start, i - start + pend);
			this.p_p = i + pend;
			if (Instr(txt, '$')) txt = this.var_rep(txt);
			txt = trimtext(txt);
			this.p_gotparam = 1;
			return txt;
		}

		const l = this.p_internaltxt.length;
		for (i = 1; i <= l; i++) {
			s = this.p_internaltxt.charCodeAt(i - 1);
			if (start === 0) {
				if (s !== 32) start = i;
			}
			if (s === 34) {
				quote = 1 - quote;
				if (quote === 0) {
					got = 1;
					break;
				}
			}
			if (start > 0) {
				if (quote === 0) {
					if (s === 32 || s === 41 || s === 44 || s === 59) {
						got = 2;
						break;
					}
				}
			}
		}
		const pend = got === 1 ? 1 : 0;
		txt = Mid(this.p_internaltxt, start, i - start + pend);
		if (Instr(txt, '$')) txt = this.var_rep(txt);
		txt = trimtext(txt);
		this.p_internaltxt = Mid(this.p_internaltxt, i + pend, -1);
		return txt;
	}

	// ====================================================================
	// parser_functions.bb: cursor functions
	// ====================================================================

	/** parse_brace(mode=0, direct=1, matching=1): unused by the original parser, kept for completeness. */
	parse_brace(mode = 0, direct = 1, matching = 1): number {
		// quirk: the column never resets to 1 on following lines ("ppt=1" assigns an unused variable).
		const temp_p_p = this.p_p;
		let comment = 0;
		let instring = 0;
		let level = 1;
		for (let tl = this.p_pl; tl <= this.p_lines - 1; tl++) {
			const line = this.Dpc[tl];
			for (let tp = temp_p_p; tp <= line.length; tp++) {
				const s = line.charCodeAt(tp - 1);
				if (s === 34 && comment === 0) instring = 1 - instring;
				let skipline = false;
				if (instring === 0) {
					if (Mid(line, tp, 2) === '//') skipline = true;
					else if (comment === 0) {
						if (Mid(line, tp, 2) === '/*') comment = 1;
					} else if (Mid(line, tp, 2) === '*/') comment = 0;
				}
				if (skipline) break;
				if (instring === 0 && comment === 0) {
					if (matching) {
						if (s === 123) level++;
						if (s === 125) level--;
					}
					if (s === 123) {
						if (mode < 2) {
							this.parse_setl(tl);
							this.p_p = tp;
							return 1;
						}
					} else if (s === 125) {
						if (mode === 0 || mode === 2) {
							if ((matching === 1 && level === 0) || matching === 0) {
								this.parse_setl(tl);
								this.p_p = tp;
								return 2;
							}
						}
					}
				}
				if (direct === 1) {
					if (s !== 32 && s !== 9 && comment === 0) {
						if (mode === 0) this.parse_error('expect', "'{' or '}'");
						else if (mode === 1) this.parse_error('expect', "'{'");
						else if (mode === 2) this.parse_error('expect', "'}'");
					}
				}
			}
		}
		return 0;
	}

	/** parse_skipspace(): move to the next char that is not space or tab; 0 at end of line. */
	parse_skipspace(): number {
		for (; this.p_p <= this.p_len; this.p_p++) {
			const s = this.p_l.charCodeAt(this.p_p - 1);
			if (s !== 32 && s !== 9) return 1;
		}
		return 0;
	}

	/** parse_com(): extract the command word at the cursor into p_com$ (lower case). */
	parse_com(): number {
		const start = this.p_p;
		let endc = 0;
		this.p_com = '';
		for (; this.p_p <= this.p_len; this.p_p++) {
			const s = this.p_l.charCodeAt(this.p_p - 1);
			// End at Position that is not A-Z,a-z,0-9,_
			if (s < 48) endc = this.p_p;
			if (s > 57 && s < 65) endc = this.p_p;
			if (s > 90 && s < 95) endc = this.p_p;
			if (s === 96) endc = this.p_p;
			if (s > 122) endc = this.p_p;
			if (endc !== 0) {
				// quirk: also when letters precede the sign ("abc$x=1" assigns to x).
				if (s === 36) {
					this.p_com = '$';
					return 1;
				}
				if (s === 64) {
					this.p_com = '@';
					return 1;
				}
				break;
			}
		}
		if (endc === 0) endc = this.p_p;
		if (endc - start > 0) {
			this.p_com = Mid(this.p_l, start, endc - start).toLowerCase();
			return 1;
		}
		return 0;
	}

	/** parse_end(txt$, pos): first position from pos that is not A-Z, a-z, 0-9 or _. */
	parse_end(txt: string, pos: number): number {
		const l = txt.length;
		let i: number;
		for (i = pos; i <= l; i++) {
			const s = txt.charCodeAt(i - 1);
			if (s < 48) return i;
			if (s > 57 && s < 65) return i;
			if (s > 90 && s < 95) return i;
			if (s === 96) return i;
			if (s > 122) return i;
		}
		return i;
	}

	/** parse_param(): 0 when the next non-space char is a semicolon. */
	parse_param(): number {
		for (let i = this.p_p; i <= this.p_len; i++) {
			const s = this.p_l.charCodeAt(i - 1);
			if (s !== 32) {
				if (s === 59) return 0;
				break;
			}
		}
		return 1;
	}

	/** parse_semi(error=1) */
	parse_semi(error = 1): number {
		for (let i = this.p_p; i <= this.p_len; i++) {
			const s = this.p_l.charCodeAt(i - 1);
			if (s !== 32) {
				if (s === 59) {
					this.p_p = i + 1;
					return 1;
				}
				break;
			}
		}
		if (error === 1) this.parse_error('expect', 'semicolon');
		return 0;
	}

	/** parse_comma(error=1) */
	parse_comma(error = 1): number {
		if (this.p_internal === 0) {
			for (let i = this.p_p; i <= this.p_len; i++) {
				const s = this.p_l.charCodeAt(i - 1);
				if (s !== 32) {
					if (s === 44) {
						this.p_p = i + 1;
						return 1;
					}
					// quirk: with error=0 the scan does not stop at other chars: an
					// optional parameter is found at ANY later comma on the line.
					if (error === 1) break;
				}
			}
			if (error === 1) this.parse_error('expect', "parameter resp. ','");
			return 0;
		}
		const l = this.p_internaltxt.length;
		for (let i = 1; i <= l; i++) {
			const s = this.p_internaltxt.charCodeAt(i - 1);
			if (s !== 32) {
				if (s === 44) {
					this.p_internaltxt = Mid(this.p_internaltxt, i + 1, -1);
					return 1;
				}
				if (error === 1) break;
				// Do not try to get more Optional Params after )
				else if (s === 41) break;
			}
		}
		if (error === 1) this.parse_error('expect', "parameter resp. ','");
		return 0;
	}

	/** parse_comsemi(error=1): jump behind the next comma (1) or semicolon (2). */
	parse_comsemi(error = 1): number {
		for (; this.p_p <= this.p_len; this.p_p++) {
			const s = this.p_l.charCodeAt(this.p_p - 1);
			if (s === 44) {
				this.p_p++;
				return 1;
			}
			if (s === 59) {
				this.p_p++;
				return 2;
			}
		}
		if (error) this.parse_error('expect', 'parameter or semicolon');
		return 0;
	}

	parse_setjp(l: number, pos: number, level: number, typ: string, name: string): void {
		this.Tpj.push({ l, pos, level, typ, name });
	}

	parse_freelastjp(): void {
		this.Tpj.pop();
	}

	parse_setl(l: number): void {
		this.p_pl = l;
		this.p_l = this.Dpc[this.p_pl];
		this.p_len = this.p_l.length;
	}

	/** parse_getjpbool(level): the condition result of the last if/elseif at this brace level. */
	parse_getjpbool(level: number): number {
		let bool = -1;
		for (const jp of this.Tpj) {
			if (jp.level === level) {
				if (jp.typ === 'if' || jp.typ === 'elseif') bool = Int(jp.name);
			}
		}
		if (bool === -1) this.parse_error('else');
		return bool;
	}

	/** parse_getclass(txt$, mode=1) */
	parse_getclass(txt: string, mode = 1): number {
		switch (txt) {
			case 'object':
			case '1':
				return Cclass_object;
			case 'unit':
			case '2':
				return Cclass_unit;
			case 'item':
			case '3':
				return Cclass_item;
			case 'info':
			case '4':
				return Cclass_info;
			case 'state':
			case '5':
				return Cclass_state;
		}
		if (mode === 1) {
			if (txt === 'self' || txt === '-1') return -1;
		}
		if (mode === 0) this.parse_error('class', txt);
		return 0;
	}

	parse_getclasstxt(cls: number): string {
		switch (cls) {
			case Cclass_object:
				return 'object';
			case Cclass_unit:
				return 'unit';
			case Cclass_item:
				return 'item';
			case Cclass_info:
				return 'info';
			case Cclass_state:
				return 'state';
			case -1:
				return 'self';
			default:
				return 'unknown class';
		}
	}

	/** parse_getstate(txt$): state name or number -> Cstate_* */
	parse_getstate(txt: string): number {
		const v = STATES.get(txt);
		if (v !== undefined) return v;
		this.parse_error('state', txt);
		return 0;
	}

	/** parse_getaisignal(txt$) */
	parse_getaisignal(txt: string): number {
		switch (txt) {
			case 'food':
			case 'eat':
			case '2':
				return 2;
			case 'attract':
			case 'goto':
			case '1':
				return 1;
			case 'distract':
			case 'flee':
			case '-1':
				return -1;
		}
		this.parse_error('signal', txt);
		return 0;
	}

	/** parse_getaimode(txt$) */
	parse_getaimode(txt: string): number {
		switch (txt) {
			case 'food':
			case 'eat':
				return 151; // ai_getfood
			case 'attract':
			case 'goto':
				return 150; // ai_movetarget
			case 'distract':
			case 'flee':
				return 152; // ai_flee
			case 'idle':
			case '50':
				return 50;
			case 'move':
			case '51':
				return 51;
			case 'movel':
			case '52':
				return 52;
			case 'mover':
			case '53':
				return 53;
			case 'turnl':
			case '54':
				return 54;
			case 'turnr':
			case '55':
				return 55;
			case 'return':
			case '101':
				return 101;
			case 'sreturn':
				// quirk: the numeric alternative of this Case is ai_return (101), which the Case above already took.
				return 102;
			case 'hunt':
			case '104':
				return 104;
		}
		this.parse_error('aimode', txt);
		return 0;
	}

	parse_isint(txt: string): number {
		for (let i = 0; i < txt.length; i++) {
			const s = txt.charCodeAt(i);
			if (s > 57) return 0;
			if (s < 48) return 0;
		}
		return 1;
	}

	parse_kill_add(cls: number, id: number, model: unknown, spawntimer = 0): void {
		this.Tpkill.push({ class: cls, id, h: model, spawntimer });
	}

	/** parse_kill_get(class, id, value=0): 0 = model handle, 1 = spawn timer. */
	parse_kill_get(cls: number, id: number, value = 0): unknown {
		for (const k of this.Tpkill) {
			if (k.class === cls && k.id === id) {
				if (value === 0) return k.h;
				if (value === 1) return k.spawntimer;
				return 0;
			}
		}
		return 0;
	}

	/** parse_loadscript$(file$, getstartl=1, startl$="") */
	parse_loadscript(file: string, getstartl = 1, startl = ''): string {
		// quirk: a "file name" without a dot is returned as the script text itself.
		if (Instr(file, '.') === 0) return file;
		const lines = this.host.ReadFileLines(file) ?? null;
		if (lines === null) {
			if (this.set_debug === 1) {
				this.host.con_add("ERROR: Unable to load external script '" + file + "'", Cbmpf_red);
			}
			return '';
		}
		let txt = '';
		if (getstartl === 1) {
			if (this.parse_comma(0)) startl = this.params();
		}
		if (startl === '') {
			for (const line of lines) txt = txt + line + SEP_LINE;
		} else {
			let cacheit = 0;
			for (const line of lines) {
				if (cacheit === 1) {
					if (Left(line, 3) === '//~') break;
					txt = txt + line + SEP_LINE;
				} else if (line === '//~' + startl) {
					cacheit = 1;
				}
			}
		}
		if (Right(txt, 1) === SEP_LINE) txt = Left(txt, txt.length - 1);
		return txt;
	}

	/** parse_error(id$, param$="") */
	parse_error(id: string, param: string | number = ''): void {
		const par = typeof param === 'number' ? istr(param) : param;
		this.p_error = 1;

		const erd: string[] = new Array(11).fill('');
		switch (id) {
			case 'uk':
				erd[0] = "'" + this.p_com + "' is an unknown script command";
				break;
			case 'brackets':
				erd[0] = 'Mismatched brackets';
				break;
			case 'wrongbrace':
				erd[0] = "Opening brace '{' is not expected";
				break;
			case 'expect':
				erd[0] = 'Expecting ' + par;
				break;
			case 'var_name':
				erd[0] = "'" + par + "' is an invalid name for a variable!";
				erd[1] = "You can use 'A-Z','a-z','0-9' And '_'";
				break;
			case 'zerodiv':
				erd[0] = 'Division by zero is not allowed ' + par;
				break;
			case 'operators':
				erd[0] = "Invalid term syntax: too many operators in '" + par + "'";
				break;
			case 'else':
				erd[0] = "'else' or 'elseif' without matching 'if'";
				break;
			case 'class':
				erd[0] = "'" + par + "' is no valid class (object,unit,item,info,state[,self])";
				break;
			case 'wrongclass':
				erd[0] = "Class '" + par + "' is not expected";
				break;
			case 'model':
				erd[0] = "'" + par + "' command needs to be executed at a model (object,unit,item)";
				break;
			case 'object':
				erd[0] = "Object/Unit/Item/Info with ID '" + par + "' does not exist";
				break;
			case 'infotype':
				erd[0] = "Info of type '" + (this.host.def_name(Cclass_info, Int(par)) ?? '') + "' expected";
				break;
			case 'txtsource':
				erd[0] = "'" + par + "' is no valid text source";
				erd[1] = 'Use either an info id or a text file';
				break;
			case 'typerange':
				erd[0] = "Type '" + par + "' is out of range";
				break;
			case 'state':
				erd[0] = "'" + par + "' is no valid state";
				break;
			case 'signal':
				erd[0] = "'" + par + "' is no valid AI signal";
				break;
			case 'aimode':
				erd[0] = "'" + par + "' is no valid AI mode";
				break;
			case 'bwo':
				erd[0] = "Expression '" + par + "' begins with an unexpected operator!";
				erd[1] = 'Probably it is a part of a longer expression. Please set additional';
				erd[2] = 'brackets and/or use variables instead of functions.';
				break;
			case 'alreadylooping':
				erd[0] = "'loop' can not be used within a loop";
				break;
			case 'looptype':
				erd[0] = "'" + par + "' is no valid loop type";
				break;
			case 'unexpected':
				erd[0] = "Unexpected '" + par + "'";
				break;
			default:
				erd[0] = id;
		}

		// Oppress? (the original returns before building the message)
		if (this.p_noerror > 0) {
			this.errors.push({
				id,
				param: par,
				message: erd[0],
				details: [erd[0]],
				row: this.p_pl + 1,
				col: this.p_p,
				line: this.p_l,
				suppressed: true
			});
			return;
		}

		// Error Script & Location Details
		erd[5] = 'Script: ';
		const cls = this.p_env_class;
		const eid = this.p_env_id;
		const described = (label: string, c: number, exists: number): string => {
			if (exists) {
				const typ = this.host.entity_typ(c, eid) ?? 0;
				return label + ' ' + eid + ' (' + (this.host.def_name(c, typ) ?? '') + ' type ' + typ + ')';
			}
			return label + ' ' + eid + ' (DOES NOT EXIST!)';
		};
		switch (cls) {
			case -2:
				erd[5] += 'Virtual Script (for object which has already been deleted)';
				break;
			case -1:
				erd[5] += 'Game Script (game.inf)';
				break;
			case Cclass_global:
				erd[5] += 'Global Map Script';
				break;
			case Cclass_object:
				erd[5] += described('Object', Cclass_object, this.host.con_object(eid));
				break;
			case Cclass_unit:
				erd[5] += described('Unit', Cclass_unit, this.host.con_unit(eid));
				break;
			case Cclass_item:
				erd[5] += described('Item', Cclass_item, this.host.con_item(eid));
				break;
			case Cclass_info:
				erd[5] += described('Info', Cclass_info, this.host.con_info(eid));
				break;
			case Cclass_state:
				// quirk: asks con_object() and then reads the current state handle.
				erd[5] += described('State', Cclass_state, this.host.con_object(eid));
				break;
			default:
				erd[5] += 'UNKNOWN SCRIPT (' + cls + ', ' + eid + ')';
		}
		if (this.p_env_info !== '') erd[6] = 'Info: ' + this.p_env_info;
		if (this.p_env_event !== '') erd[7] = 'Event: ' + this.p_env_event;
		erd[8] = 'Row: ' + (this.p_pl + 1);
		erd[9] = 'Col: ' + this.p_p;
		erd[10] = 'Script: ' + this.p_l;
		this.p_erd = erd;

		this.errors.push({
			id,
			param: par,
			message: erd[0],
			details: erd.filter((e) => e !== ''),
			row: this.p_pl + 1,
			col: this.p_p,
			line: this.p_l,
			suppressed: false
		});

		// Output
		if (this.set_debug === 1) {
			this.host.sfx_fail();
			this.host.con_open();
			this.host.con_add();
			this.host.con_add('SCRIPT ERROR:', Cbmpf_red);
			for (let i = 0; i <= 10; i++) {
				if (erd[i] !== '') this.host.con_add(erd[i], Cbmpf_red);
			}
		} else {
			this.host.con_add(
				'SCRIPT ERROR: ' + erd[5] + ' Row:' + (this.p_pl + 1) + ' Col:' + this.p_p + " ('debug' for details)",
				Cbmpf_red
			);
		}
	}

	parse_isevent(txt: string): number {
		return Instr(txt, ';') ? 0 : 1;
	}

	/** parse_classid(): "class, id" | "self" | "player" -> tmp_gclass / tmp_gid */
	parse_classid(): void {
		this.tmp_gclass = 0;
		this.tmp_gid = 0;
		const cls = this.param();
		switch (cls) {
			case 'object':
			case '1':
				this.tmp_gclass = Cclass_object;
				break;
			case 'unit':
			case '2':
				this.tmp_gclass = Cclass_unit;
				break;
			case 'item':
			case '3':
				this.tmp_gclass = Cclass_item;
				break;
			case 'info':
			case '4':
				this.tmp_gclass = Cclass_info;
				break;
			case 'state':
			case '5':
				this.tmp_gclass = Cclass_state;
				break;
			case 'self':
				this.tmp_gclass = this.p_env_class;
				this.tmp_gid = this.p_env_id;
				return;
			case 'player':
				this.tmp_gclass = Cclass_unit;
				this.tmp_gid = this.host.g_player() ?? 0;
				return;
		}
		this.parse_comma(1);
		this.tmp_gid = Int(this.param());
	}

	/** parse_editorsetscript(class, id) */
	parse_editorsetscript(cls: number, id: number): void {
		this.clear_parsecache();
		if (this.ed_setscript !== '') {
			this.p_env_class = cls;
			this.p_env_id = id;
			this.p_env_event = 'edset';
			this.p_env_info = 'editor setscript';
			this.loadstring_parsecache(this.ed_setscript, SEP_LINE);
			this.parse(1);
		}
		this.parse_emuevent(cls, id, 'edset', 'editor setscript');
		this.parse_sel_event('edset', 1);
	}

	// ====================================================================
	// parser_brace.bb
	// ====================================================================

	/** parse_openbrace(): move to the next '{' if only spaces are in between. */
	parse_openbrace(): number {
		let ps = this.p_p;
		for (let row = this.p_pl; row <= this.p_lines - 1; row++) {
			const line = this.Dpc[row];
			for (let col = ps; col <= line.length; col++) {
				const c = line[col - 1];
				if (c !== ' ') {
					if (c === '{') {
						this.parse_setl(row);
						this.p_p = col;
						return 1;
					}
					return 0;
				}
			}
			ps = 1;
		}
		this.parse_error('expect', "opening brace '{'");
		return 0;
	}

	/** parse_closebrace(equalcount=1): move onto the '}' that closes the current block. */
	parse_closebrace(equalcount = 1): number {
		let instring = 0;
		let comment = 0;
		let brace = 1;
		let ps = this.p_p;
		for (let row = this.p_pl; row <= this.p_lines - 1; row++) {
			const line = this.Dpc[row];
			for (let col = ps; col <= line.length; col++) {
				const c = line[col - 1];
				if (c === '/' || c === '*') {
					// quirk: "//" ends the line even inside a string ("http://...").
					if (Mid(line, col, 2) === '//') break;
					if (comment === 1) {
						if (Mid(line, col, 2) === '*/') comment = 0;
					} else if (Mid(line, col, 2) === '/*') comment = 1;
				} else if (c === '"') {
					instring = 1 - instring;
				}
				if (comment === 0) {
					if (instring === 0) {
						if (c === '{') {
							brace++;
						} else if (c === '}') {
							brace--;
							if (brace <= 0) {
								if (equalcount === 1 && brace < 0) return 0;
								this.parse_setl(row);
								this.p_p = col;
								return 1;
							}
						}
					}
				}
			}
			ps = 1;
		}
		// quirk: no error when the brace is missing; the block is then executed.
		return 0;
	}

	// ====================================================================
	// parser_math.bb
	// ====================================================================

	/** parse_math$(txt$): evaluate an expression with brackets and function calls. */
	parse_math(txt: string): string {
		// Kill Whitespaces
		if (Instr(txt, '"') === 0) txt = Replace(txt, ' ', '');
		else txt = trimexquote(txt);
		// Scan (scans brackets and presence of math operators)
		let bro = 0;
		let brc = 0;
		let req = 0;
		let l = txt.length;
		let i: number;
		let s: number;
		for (i = 1; i <= l; i++) {
			s = txt.charCodeAt(i - 1);
			if (s < 48 || s > 57) {
				if (s !== 46) {
					req = 1;
					if (s === 40) bro++;
					else if (s === 41) brc++;
				}
			}
		}
		if (req === 0) return txt;
		if (bro !== brc) {
			this.parse_error('brackets');
			return '0';
		}
		// No Brackets -> Simple Term Function
		if (bro === 0) return this.parse_math_st(txt);

		// Extract, Parse and Replace Return Commands with their Return Values
		let combracket = 0;
		let comstart = 0;
		for (i = 1; i <= l; i++) {
			s = txt.charCodeAt(i - 1);
			if (s === 40) {
				if (i > 1) {
					// quirk: a name ending in "or"/"and"/"xor" counts as an operator, not a function.
					if (this.parse_math_op(Mid(txt, 1, i - 1), 2) === 0) {
						combracket = 1;
						this.parse_math_getcom(Mid(txt, 1, i - 1));
						if (this.p_com !== '') {
							comstart = i - this.p_com.length;
							this.p_internaltxt = Mid(txt, i + 1, -1);
							this.parse_commands(0, 1);
						} else {
							combracket = 0;
						}
					}
				}
			} else if (s === 41) {
				// Replace at End of Command Bracket
				if (combracket === 1) {
					combracket = 0;
					const txtleft = comstart > 1 ? Left(txt, comstart - 1) : '';
					const txtright = i < l ? Mid(txt, i + 1, -1) : '';
					txt = txtleft + this.p_return + txtright;
					l = txt.length;
					i = 0;
				}
			}
		}
		// Dissolve all brackets
		let brs = 0;
		let bre = 0;
		let guard = 0;
		while (Instr(txt, '(') > 0) {
			// The original hangs when a function result leaves unbalanced brackets behind.
			if (++guard > 100000) throw new BlitzRuntimeError('parse_math: endless bracket loop in "' + txt + '"');
			l = txt.length;
			let depth = 0;
			let maxdepth = 0;
			for (i = 1; i <= l; i++) {
				s = txt.charCodeAt(i - 1);
				if (s === 40) {
					depth++;
					if (depth > maxdepth) maxdepth = depth;
				} else if (s === 41) {
					depth--;
				}
			}
			// Extract deepest bracket
			depth = 0;
			for (i = 1; i <= l; i++) {
				s = txt.charCodeAt(i - 1);
				if (s === 40) {
					depth++;
					if (depth === maxdepth) brs = i + 1;
				} else if (s === 41) {
					if (depth === maxdepth) {
						bre = i - 1;
						break;
					}
					depth--;
				}
			}
			const deepc = Mid(txt, brs, bre + 1 - brs);
			const deepv = this.parse_math_st(deepc);
			if (brs - 1 === 1) {
				// Beginning - just replace
				txt = Mid(txt, deepc.length + 3, -1);
				txt = deepv + txt;
			} else {
				// quirk: replaces every identical bracket term at once.
				const c = Mid(txt, brs - 2, 1);
				txt = Replace(txt, c + '(' + deepc + ')', c + deepv);
			}
		}
		return this.parse_math_st(txt);
	}

	/** parse_math_st$(txt$): "simple term" without brackets. */
	parse_math_st(txt: string): string {
		const l = txt.length;
		let i: number;

		// Get Base (Number before Operator)
		for (i = 1; i <= l; i++) {
			// Ignore starting minus for negative numbers
			if (i === 1) {
				if (Mid(txt, 1, 1) === '-') i = 2;
			}
			const isop = this.parse_math_op(Mid(txt, i, 3)) > 0;
			if (isop || i === l) {
				if (i === l) {
					this.p_m_base = Mid(txt, 1, i);
					return this.p_m_base;
				}
				this.p_m_base = Mid(txt, 1, i - 1);
				break;
			}
		}

		// unable to find base
		if (i === 1) {
			if (txt !== '') {
				this.parse_error('bwo', txt);
				return '0';
			}
			return '0'; // Empty Term = 0
		}
		// quirk: a lone "-" falls through here and returns the base of the previous term.

		// Extract Stuff
		this.Tpm = [];
		let pos = 0;
		let ns = 0;
		let ne = 0;
		for (i = i - 1; i <= l; i++) {
			const op = this.parse_math_op(Mid(txt, i, 3));
			if (op > 0 || i === l) {
				if (ns === 0) {
					// Determine Start
					ns = i;
					if (i + this.p_m_o.length < l) {
						// Following Operator? Has to be a minus, otherwise -> Error!
						const mot = this.p_m_o;
						if (this.parse_math_op(Mid(txt, i + this.p_m_o.length, 3)) > 0) {
							i = i + mot.length;
							if (this.p_m_o !== '-') this.parse_error('operators', txt);
						}
					}
				} else {
					// Determine End
					ne = i - 1;
					if (i === l) ne = l;
					this.parse_math_op(Mid(txt, ns, 3));
					ns = ns + this.p_m_o.length;
					const number = Mid(txt, ns, ne + 1 - ns);
					pos++;
					this.Tpm.push({ typ: this.var_type(number), pos, txt: this.p_m_o, value: number, dead: false });
					ns = 0;
					if (i === l) break;
					// quirk: the operator that ended this part is not taken as the start of
					// the next one (";i=i-1" is commented out, also in the shipped exe), so
					// every second "operator operand" pair of a term is dropped: 1+2+3 is 3.
				}
			}
		}

		// Calc
		this.p_m_value = this.p_m_base;
		const parts = this.Tpm;
		let valuetype: number;
		let ovaluetype: number;
		let prevtype: number;
		let prev: string;

		// Calc for * and / Operators
		for (const t of parts) {
			if (t.dead) continue;
			if (t.txt === '*') {
				prev = this.parse_math_prev(t.pos);
				prevtype = this.var_type(prev);
				valuetype = this.var_type(t.value);
				ovaluetype = this.var_type(this.p_m_value);
				if (this.p_m_basec === 0) {
					if (prevtype + valuetype + ovaluetype === 0) {
						this.p_m_value = istr(Int(this.p_m_value) + Math.imul(Int(prev), Int(t.value)));
					} else {
						this.p_m_value = fstr(f32(Float(this.p_m_value) + f32(Float(prev) * Float(t.value))));
					}
				} else if (prevtype + valuetype + ovaluetype === 0) {
					this.p_m_value = istr(Math.imul(Int(prev), Int(t.value)));
				} else {
					this.p_m_value = fstr(f32(Float(prev) * Float(t.value)));
				}
				t.dead = true;
			} else if (t.txt === '/') {
				prev = this.parse_math_prev(t.pos);
				prevtype = this.var_type(prev);
				valuetype = this.var_type(t.value);
				ovaluetype = this.var_type(this.p_m_value);
				// quirk: a text compare, so only the literal "0" is caught ("0.0" divides).
				if (t.value === '0') this.parse_error('zerodiv', "'" + prev + '/' + t.value + "'");
				if (this.p_m_basec === 0) {
					if (prevtype + valuetype + ovaluetype === 0) {
						this.p_m_value = istr(Int(this.p_m_value) + this.idiv(Int(prev), Int(t.value)));
					} else {
						this.p_m_value = fstr(f32(Float(this.p_m_value) + f32(Float(prev) / Float(t.value))));
					}
				} else if (prevtype + valuetype + ovaluetype === 0) {
					this.p_m_value = istr(this.idiv(Int(prev), Int(t.value)));
				} else {
					this.p_m_value = fstr(f32(Float(prev) / Float(t.value)));
				}
				t.dead = true;
			}
		}

		// Calc for + and - Operators
		for (const t of parts) {
			if (t.dead) continue;
			if (t.txt === '+') {
				valuetype = this.var_type(t.value);
				ovaluetype = this.var_type(this.p_m_value);
				if (valuetype + ovaluetype === 0) {
					this.p_m_value = istr(Int(this.p_m_value) + Int(t.value));
				} else if (valuetype === 2 || ovaluetype === 2) {
					this.p_m_value = this.p_m_value + t.value;
				} else {
					this.p_m_value = fstr(f32(Float(this.p_m_value) + Float(t.value)));
				}
				t.dead = true;
			} else if (t.txt === '-') {
				valuetype = this.var_type(t.value);
				ovaluetype = this.var_type(this.p_m_value);
				if (valuetype + ovaluetype === 0) {
					this.p_m_value = istr(Int(this.p_m_value) - Int(t.value));
				} else {
					this.p_m_value = fstr(f32(Float(this.p_m_value) - Float(t.value)));
				}
				t.dead = true;
			}
		}

		// Calc for logical Operators
		const bool = (b: boolean): string => (b ? '1' : '0');
		for (const t of parts) {
			if (t.dead) continue;
			const a = this.p_m_value;
			const b = t.value;
			switch (t.txt) {
				case '==':
					if (a === b) {
						this.p_m_value = '1';
					} else {
						valuetype = this.var_type(b);
						ovaluetype = this.var_type(a);
						// quirk: two integers are compared as text ("1"=="01" is 0).
						if (valuetype === 1 || ovaluetype === 1) this.p_m_value = bool(Float(a) === Float(b));
						else this.p_m_value = '0';
					}
					t.dead = true;
					break;
				case '!=':
					valuetype = this.var_type(b);
					ovaluetype = this.var_type(a);
					if (valuetype + ovaluetype === 0) this.p_m_value = bool(Int(a) !== Int(b));
					else if (valuetype === 1 || ovaluetype === 1) this.p_m_value = bool(Float(a) !== Float(b));
					else this.p_m_value = bool(a !== b);
					t.dead = true;
					break;
				case '>':
					valuetype = this.var_type(b);
					ovaluetype = this.var_type(a);
					if (valuetype + ovaluetype === 0) this.p_m_value = bool(Int(a) > Int(b));
					else this.p_m_value = bool(Float(a) > Float(b));
					t.dead = true;
					break;
				case '<':
					valuetype = this.var_type(b);
					ovaluetype = this.var_type(a);
					if (valuetype + ovaluetype === 0) this.p_m_value = bool(Int(a) < Int(b));
					else this.p_m_value = bool(Float(a) < Float(b));
					t.dead = true;
					break;
				case '>=':
				case '=>':
					valuetype = this.var_type(b);
					ovaluetype = this.var_type(a);
					if (valuetype + ovaluetype === 0) this.p_m_value = bool(Int(a) >= Int(b));
					else this.p_m_value = bool(Float(a) >= Float(b));
					t.dead = true;
					break;
				case '<=':
				case '=<':
					valuetype = this.var_type(b);
					ovaluetype = this.var_type(a);
					if (valuetype + ovaluetype === 0) this.p_m_value = bool(Int(a) <= Int(b));
					else this.p_m_value = bool(Float(a) <= Float(b));
					t.dead = true;
					break;
				case '&&':
				case 'and':
					this.p_m_value = bool(Int(a) !== 0 && Int(b) !== 0);
					t.dead = true;
					break;
				case '||':
				case 'or':
					this.p_m_value = bool(Int(a) !== 0 || Int(b) !== 0);
					t.dead = true;
					break;
				case 'xor':
					this.p_m_value = bool((Int(a) !== 0) !== (Int(b) !== 0));
					t.dead = true;
					break;
				default:
					this.parse_error("'" + t.txt + "' is no allowed mathematical or logical operator of SII script");
			}
		}

		return this.p_m_value;
	}

	/** Blitz integer division; dividing by zero ends the original program. */
	private idiv(a: number, b: number): number {
		if (b === 0) throw new BlitzRuntimeError('Integer divide by zero');
		return Math.trunc(a / b) | 0;
	}

	/** parse_math_op(txt$, dir=1): operator at the start (dir=1) or end of txt; leaves it in p_m_o$. */
	parse_math_op(txt: string, dir = 1): number {
		let sub = dir === 1 ? Left(txt, 2) : Right(txt, 2);
		this.p_m_o = sub;
		switch (sub) {
			case '==':
			case '>=':
			case '<=':
			case '=>':
			case '=<':
			case '!=':
			case '&&':
			case '||':
			case 'or':
				return 5;
		}
		sub = dir === 1 ? Left(txt, 1) : Right(txt, 1);
		this.p_m_o = sub;
		switch (sub) {
			case '+':
				return 1;
			case '-':
				return 2;
			case '*':
				return 3;
			case '/':
				return 4;
			case '>':
			case '<':
				return 5;
		}
		sub = dir === 1 ? Left(txt, 3) : Right(txt, 3);
		this.p_m_o = sub;
		switch (sub) {
			case 'and':
			case 'xor':
				return 5;
		}
		this.p_m_o = '';
		return 0;
	}

	/** parse_math_prev$(pos): operand in front of a * or /, removed from the list when it is an integer part. */
	parse_math_prev(pos: number): string {
		const tpos = pos - 1;
		for (const t of this.Tpm) {
			if (t.dead) continue;
			// quirk: only integer parts are taken (and their own operator is forgotten);
			// otherwise the running value is used as the left operand.
			if (t.typ === 0) {
				if (t.pos === tpos) {
					this.p_m_basec = 0;
					t.dead = true;
					return t.value;
				}
			}
		}
		this.p_m_basec = 1;
		return this.p_m_value;
	}

	/** parse_math_getcom(txt$): the trailing run of a-z and _ becomes p_com$. */
	parse_math_getcom(txt: string): number {
		if (txt === '(') {
			this.p_com = '';
			return 0;
		}
		this.p_com = '';
		for (let i = txt.length; i >= 1; i--) {
			const s = txt.charCodeAt(i - 1);
			// quirk: digits and capitals end the name ("text3d(" gives "d").
			if ((s < 97 || s > 122) && s !== 95) {
				this.p_com = Mid(txt, i + 1, -1);
				return 1;
			}
		}
		this.p_com = txt;
		return 0;
	}

	// ====================================================================
	// parser_loop.bb
	// ====================================================================

	/** parse_loop(): read "(type [, arg])" after the loop keyword. */
	parse_loop(): number {
		if (this.p_loopmode === 1) {
			this.parse_error('alreadylooping');
			return 0;
		}
		this.p_looptype = '';
		this.p_loopargs = '';
		this.parse_skipspace();
		if (Mid(this.p_l, this.p_p, 1) !== '(') {
			this.parse_error('expect', "'('");
			return 0;
		}
		this.p_p += 1;
		this.p_looptype = this.param();
		switch (this.p_looptype) {
			case 'count':
				this.parse_comma(1);
				this.p_loopargs = istr(Math.abs(Int(this.param())));
				break;
			case 'objects':
			case 'object':
			case '1':
				this.p_looptype = 'objects';
				if (this.parse_comma(0)) this.p_loopargs = istr(Int(this.param()));
				break;
			case 'units':
			case 'unit':
			// quirk: written "Class_unit", an undeclared variable (0), so "0" selects units and "2" does not.
			case '0':
				this.p_looptype = 'units';
				if (this.parse_comma(0)) this.p_loopargs = istr(Int(this.param()));
				break;
			case 'items':
			case 'item':
			case '3':
				this.p_looptype = 'items';
				if (this.parse_comma(0)) this.p_loopargs = istr(Int(this.param()));
				break;
			case 'infos':
			case 'info':
			case '4':
				this.p_looptype = 'infos';
				if (this.parse_comma(0)) this.p_loopargs = istr(Int(this.param()));
				break;
			case 'states':
			case 'state':
			case '5':
				this.p_looptype = 'states';
				break;
			default:
				this.parse_error('looptype', this.p_looptype);
				return 0;
		}
		this.parse_skipspace();
		if (Mid(this.p_l, this.p_p, 1) === ')') {
			this.p_p += 1;
		} else {
			// quirk: "expecting" is no error id, so the message is just "expecting".
			this.parse_error('expecting', "')'");
			return 0;
		}
		this.p_loopmode = 1;
		return 1;
	}

	/** parse_loop_check(): advance the loop at its opening brace, or leave it. */
	parse_loop_check(): void {
		switch (this.p_looptype) {
			case 'count':
				this.p_loopi += 1;
				if (this.p_loopi > Int(this.p_loopargs)) {
					this.p_loopmode = 0;
					this.parse_closebrace();
				}
				break;
			case 'objects':
				this.parse_loop_entities(Cclass_object);
				break;
			case 'units':
				this.parse_loop_entities(Cclass_unit);
				break;
			case 'items':
				this.parse_loop_entities(Cclass_item);
				break;
			case 'infos':
				this.parse_loop_entities(Cclass_info);
				break;
			case 'states': {
				const list = this.host.entities(Cclass_state) ?? [];
				const next = this.loop_step(list, Cclass_state);
				if (next === null) {
					this.p_loopi = 0;
					this.p_loopmode = 0;
					this.parse_closebrace();
				} else {
					// quirk: loop_id() of a state loop is the state TYPE.
					this.p_loopi = next.typ;
				}
				break;
			}
			default:
				this.parse_error("Internal error. Unknown loop type '" + this.p_looptype + "'");
		}
	}

	/**
	 * First / After on the entity list (p_loopi=0 means "start"): p_loop_object=After p_loop_object
	 * (parser_loop.bb). With a game host this is After on the live list, which also works on an
	 * entity the loop body has freed.
	 */
	private loop_step(list: readonly HostEntity[], cls: number): HostEntity | null {
		let next: HostEntity | null;
		const step = this.host.entity_next?.(cls, this.p_loopi === 0 ? null : this.p_loop_entity);
		if (step !== undefined) {
			next = step;
		} else if (this.p_loopi === 0) {
			next = list[0] ?? null;
		} else {
			const at = this.p_loop_entity ? list.indexOf(this.p_loop_entity) : -1;
			next = at >= 0 ? (list[at + 1] ?? null) : null;
		}
		this.p_loop_entity = next;
		return next;
	}

	/** parse_loop_objects / _units / _items / _infos */
	private parse_loop_entities(cls: number): void {
		const args = Int(this.p_loopargs);
		const list = this.host.entities(cls) ?? [];
		if (args === 0) {
			// All
			const next = this.loop_step(list, cls);
			if (next === null) {
				this.p_loopi = 0;
				this.p_loopmode = 0;
				this.parse_closebrace();
			} else {
				// quirk: an entity with id 0 restarts the loop from the first entity.
				this.p_loopi = next.id;
			}
		} else {
			// By Type: next entity in list order with a higher id
			let f = 0;
			for (const x of list) {
				if (x.typ === args) {
					if (x.id > this.p_loopi) {
						this.p_loopi = x.id;
						f = 1;
						break;
					}
				}
			}
			if (f === 0) {
				this.p_loopi = 0;
				this.p_loopmode = 0;
				this.parse_closebrace();
			}
		}
	}

	// ====================================================================
	// parser_vars.bb
	// ====================================================================

	private findLocal(name: string, cls = this.p_env_class, id = this.p_env_id): Tx | undefined {
		for (const tx of this.tx.items) {
			if (tx.mode === 4 && tx.parent_class === cls && tx.parent_id === id && tx.key === name) return tx;
		}
		return undefined;
	}

	private findGlobal(name: string): Tx | undefined {
		for (const tx of this.tx.items) {
			if (tx.mode === 1 && tx.key === name) return tx;
		}
		return undefined;
	}

	/** var_get$(name$): local of the current script's entity, then global, else "0". */
	var_get(name: string): string {
		const tx = this.findLocal(name) ?? this.findGlobal(name);
		return tx ? tx.value : '0';
	}

	var_set(name: string, value: string): number {
		const tx = this.findLocal(name) ?? this.findGlobal(name);
		if (tx) {
			tx.value = value;
			return 1;
		}
		// quirk: the error names no variable, and the variable is created anyway.
		if (!this.var_name(name)) this.parse_error('var_name');
		this.tx.add({ mode: 1, key: name, value });
		return 1;
	}

	var_free(name: string): number {
		const tx = this.findLocal(name) ?? this.findGlobal(name);
		if (tx) {
			this.tx.delete(tx);
			return 1;
		}
		return 0;
	}

	var_exists(name: string): number {
		return (this.findLocal(name) ?? this.findGlobal(name)) ? 1 : 0;
	}

	var_bool(name: string): number {
		return Int(this.var_get(name)) === 0 ? 0 : 1;
	}

	/** var_name(name$): 1 if only A-Z, a-z, 0-9 and _ are used. */
	var_name(name: string): number {
		for (let i = 0; i < name.length; i++) {
			const s = name.charCodeAt(i);
			if (s < 48) return 0;
			if (s > 57 && s < 65) return 0;
			if (s > 90 && s < 95) return 0;
			if (s === 96) return 0;
			if (s > 122) return 0;
		}
		return 1;
	}

	/** var_parse$(): find the assignment operator after "$name"; the name goes to p_varname$. */
	var_parse(): string {
		this.p_varname = '';
		const start = this.p_p + 1;
		let equal = 0;
		let op = '';
		for (this.p_p = start; this.p_p <= this.p_len; this.p_p++) {
			const s = this.p_l.charCodeAt(this.p_p - 1);
			if (s === 61) {
				op = '=';
				equal = this.p_p;
				break;
			} else if (s === 43) {
				const two = Mid(this.p_l, this.p_p, 2);
				if (two === '+=' || two === '++') {
					op = two;
					equal = this.p_p;
					break;
				}
			} else if (s === 45) {
				const two = Mid(this.p_l, this.p_p, 2);
				if (two === '-=' || two === '--') {
					op = two;
					equal = this.p_p;
					break;
				}
			}
		}
		if (equal === 0) {
			this.parse_error('expect', 'variable assignment (=,+=,++,-=,--)');
			this.p_varname = '';
			return '';
		}
		this.p_varname = Trim(Mid(this.p_l, start, equal - start));
		this.p_p = this.p_p + op.length;
		return op;
	}

	/** var_extract(): move the cursor behind the next $variable. */
	var_extract(): number {
		this.p_varname = '';
		const start = this.p_p;
		let gotdollar = 0;
		for (this.p_p = start; this.p_p <= this.p_len; this.p_p++) {
			if (this.p_l[this.p_p - 1] === '$') {
				gotdollar = this.p_p;
				break;
			}
		}
		if (gotdollar > 0) {
			// quirk: the scan starts on the '$' itself, which ends it at once.
			for (; this.p_p <= this.p_len; this.p_p++) {
				const s = this.p_l.charCodeAt(this.p_p - 1);
				if (s < 48) break;
				if (s > 57 && s < 65) break;
				if (s > 90 && s < 97) {
					if (s !== 95) break;
				}
				if (s > 122) break;
			}
		} else {
			this.parse_error('expect', 'variable (introduced by $)');
		}
		return 0;
	}

	/** var_rep$(txt$): replace every $name by its value; "\$" stays a dollar sign. */
	var_rep(txt: string): string {
		let pos = Instr(txt, '$');
		let l = txt.length;
		while (pos > 0) {
			// Find end of Var
			let i: number;
			for (i = pos + 1; i <= l; i++) {
				const s = txt.charCodeAt(i - 1);
				if (s < 48) break;
				if (s > 57 && s < 65) break;
				if (s > 90 && s < 97) {
					if (s !== 95) break;
				}
				if (s > 122) break;
			}
			const v = Mid(txt, pos, i - pos);
			let ignore = 0;
			if (pos > 1) {
				if (Mid(txt, pos - 1, 1) === '\\') ignore = 1;
			}
			if (ignore === 0) {
				if (v === '$') this.parse_error('$ without variable');
				const txtl = pos > 1 ? Left(txt, pos - 1) : '';
				const txtr = Mid(txt, pos + v.length, -1);
				txt = txtl + this.var_get(Mid(v, 2, -1)) + txtr;
			} else {
				// Remove \
				const txtl = pos > 2 ? Left(txt, pos - 2) : '';
				const txtr = Mid(txt, pos, -1);
				txt = txtl + txtr;
			}
			l = txt.length;
			pos = Instr(txt, '$', pos + 1);
		}
		return txt;
	}

	/** var_modify$(name$, value$): add value to a variable (integer if both are integers, else float). */
	var_modify(name: string, value: string): string {
		// -- = +
		if (Left(value, 2) === '--') value = Mid(value, 3, -1);
		const tx = this.findLocal(name) ?? this.findGlobal(name);
		if (tx) {
			const t1 = this.var_type(tx.value);
			const t2 = this.var_type(value);
			if (t1 + t2 === 0) tx.value = istr(Int(tx.value) + Int(value));
			else tx.value = fstr(f32(Float(tx.value) + Float(value)));
			return tx.value;
		}
		// quirk: a new variable takes the text as it is, without a name check.
		return this.tx.add({ mode: 1, key: name, value }).value;
	}

	var_temp(v: string): number {
		if (Left(v, 1) === '$') v = Mid(v, 2, -1);
		const tx = this.findLocal(v) ?? this.findGlobal(v);
		if (tx) {
			tx.stuff = 'temp';
			return 1;
		}
		return 0;
	}

	/** var_local(var$): turn a global into a local of the current script's entity. */
	var_local(v: string): number {
		if (Left(v, 1) === '$') v = Mid(v, 2, -1);
		let value = 0;
		let gotglobal = 0;
		const g = this.findGlobal(v);
		if (g) {
			// quirk: the value goes through an integer, so text and fractions are lost.
			value = Int(g.value);
			gotglobal = 1;
			this.tx.delete(g);
		}
		const loc = this.findLocal(v);
		if (loc) {
			if (gotglobal === 1) loc.value = istr(value);
			return 1;
		}
		this.tx.add({ mode: 4, key: v, value: istr(value), parent_class: this.p_env_class, parent_id: this.p_env_id });
		return 1;
	}

	/** var_cache_save(file$, varlist$="-"): globals as encoded Blitz strings (WriteString = int32 length + bytes). */
	var_cache_save(file: string, varlist = '-'): number {
		const out: number[] = [];
		const writeString = (s: string) => {
			const n = s.length;
			out.push(n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >> 24) & 255);
			for (let i = 0; i < n; i++) out.push(s.charCodeAt(i) & 255);
		};
		if (varlist !== '-') varlist = Replace(',' + varlist + ',', ' ', '');
		for (const tx of this.tx.items) {
			if (tx.mode === 1) {
				if (varlist === '-' || Instr(varlist, ',' + tx.key + ',') > 0) {
					writeString(code(tx.key, 5, 0));
					writeString(code(tx.value, 7, 0));
				}
			}
		}
		return this.host.WriteFileBytes(file, new Uint8Array(out)) ? 1 : 0;
	}

	var_cache_load(file: string): number {
		const data = this.host.ReadFileBytes(file) ?? null;
		if (data === null) return 0;
		let p = 0;
		const readString = (): string => {
			if (p + 4 > data.length) {
				p = data.length;
				return '';
			}
			const n = data[p] | (data[p + 1] << 8) | (data[p + 2] << 16) | (data[p + 3] << 24);
			p += 4;
			let s = '';
			for (let i = 0; i < n && p < data.length; i++) s += String.fromCharCode(data[p++]);
			return s;
		};
		while (p < data.length) {
			const v = code(readString(), 5, 1);
			const value = code(readString(), 7, 1);
			this.var_set(v, value);
		}
		return 1;
	}

	var_get_local(cls: number, id: number, name: string): string {
		const tx = this.findLocal(name, cls, id);
		return tx ? tx.value : '0';
	}

	var_set_local(cls: number, id: number, name: string, newvalue: string): number {
		const tx = this.findLocal(name, cls, id);
		if (tx) {
			tx.value = newvalue;
			return 1;
		}
		if (!this.var_name(name)) this.parse_error('var_name');
		this.tx.add({ mode: 4, key: name, value: newvalue, parent_class: cls, parent_id: id });
		return 1;
	}

	/** defvar_set(class, typ): "var=name,description,default,global" of a definition; splits is split$(value, ",", 3). */
	defvar_set(cls: number, typ: number, splits: readonly string[]): void {
		const s = [splits[0] ?? '', splits[1] ?? '', splits[2] ?? '', splits[3] ?? ''];
		if (s[0] === '') throw new BlitzRuntimeError('Invalid Def VAR definition (missing var name)');
		if (s[1] === '') s[1] = s[0];
		this.Tdefvar.push({ class: cls, typ, key: s[0], descr: s[1], defaultval: s[2], isglobal: Int(s[3]) });
	}

	/** defvar_ini(): create the definition variables of every existing entity. */
	defvar_ini(): void {
		for (const d of this.Tdefvar) {
			if (d.class < Cclass_object || d.class > Cclass_info) continue;
			for (const e of this.host.entities(d.class) ?? []) {
				if (e.typ === d.typ) {
					if (d.isglobal === 0) this.defvar_ini_local(d.class, e.id, d.key, d.defaultval);
					else this.defvar_ini_global(d.key, d.defaultval);
				}
			}
		}
	}

	defvar_ini_local(cls: number, id: number, key: string, val: string): void {
		if (this.findLocal(key, cls, id)) return;
		this.tx.add({ mode: 4, key, value: val, parent_class: cls, parent_id: id });
	}

	defvar_ini_global(key: string, val: string): void {
		if (this.findGlobal(key)) return;
		this.tx.add({ mode: 1, key, value: val });
	}

	/** defvar_oncreate(class, id, typ): definition variables for one new entity. */
	defvar_oncreate(cls: number, id: number, typ: number): void {
		for (const d of this.Tdefvar) {
			if (d.class === cls && d.typ === typ) {
				if (d.isglobal === 0) this.defvar_ini_local(cls, id, d.key, d.defaultval);
				else this.defvar_ini_global(d.key, d.defaultval);
			}
		}
	}

	const_set(n: string, v: number): void {
		if (Left(n, 1) === '#') n = Mid(n, 2, -1);
		if (n !== '') this.Tconst.set(n, v | 0);
	}

	const_get(n: string): number {
		const v = this.Tconst.get(n);
		if (v === undefined) return 0;
		this.tmp_constv = v;
		return 1;
	}

	/** var_type(txt$): 0 integer, 1 float, 2 string. */
	var_type(txt: string): number {
		if (istr(Int(txt)) === txt) return 0;
		let isfloat = 0;
		for (let i = 1; i <= txt.length; i++) {
			const c = txt.charCodeAt(i - 1);
			if (c < 48 || c > 57) {
				if (c === 46) {
					isfloat = 1;
				} else if (i === 1) {
					if (c !== 45) return 2;
				} else {
					return 2;
				}
			}
		}
		// quirk: "", "-" and "007" count as integers, "1.2.3" and "." as floats.
		return isfloat;
	}

	// ====================================================================
	// timer.bb
	// ====================================================================

	/** timer_add(): the "timer" command. */
	timer_add(): void {
		const cls = this.param();
		let classint: number;
		let id = 0;
		if (cls === 'self' || cls === '-1' || cls === '0') {
			classint = -1;
			if (cls === '0') classint = 0;
		} else {
			classint = this.parse_getclass(cls, 0);
		}
		if (classint < 1) {
			if (classint === -1) {
				classint = this.p_env_class;
				id = this.p_env_id;
			}
		} else {
			this.parse_comma(1);
			id = Int(this.param());
		}
		const timer: Ttimer = { typ: 0, parent_class: classint, parent_id: id, duration: 0, start: 0, mode: 1, scr: '' };
		this.timers.push(timer);
		this.parse_comma(1);
		timer.duration = Int(this.param());
		timer.start = this.host.gt() ?? 0;

		timer.mode = 1;
		if (this.parse_comma(0)) timer.mode = Int(this.param());

		let txt: string;
		if (this.parse_comma(0)) {
			const source = this.params();
			txt = '0';
			if (Int(source) !== 0) {
				// Info as Source. quirk: the first Tx of that info, whatever its mode.
				for (const tx of this.tx.items) {
					if (tx.parent_class === Cclass_info && tx.parent_id === Int(source)) {
						txt = tx.value;
						timer.typ = 1;
						break;
					}
				}
			} else if (Instr(txt, '.') > 0) {
				// quirk: tests txt$ ("0") instead of source$, so a script file is never loaded.
				txt = this.parse_loadscript(source);
				timer.typ = 1;
			}
			if (txt === '0' || txt === '') {
				txt = source;
				timer.typ = 0;
			}
		} else {
			txt = 'timer';
			timer.typ = 0;
		}
		timer.scr = txt;

		// Parent exists? Delete when not
		if (timer.parent_class !== 0) {
			if (!this.host.parent_con(classint, id)) {
				this.parse_error('object', id);
				this.timers.splice(this.timers.indexOf(timer), 1);
			}
		}
	}

	timer_free(parent_class: number, parent_id: number, mode = ''): void {
		for (let i = this.timers.length - 1; i >= 0; i--) {
			const t = this.timers[i];
			if (t.parent_class === parent_class && t.parent_id === parent_id) {
				if (mode === '' || t.scr === mode) this.timers.splice(i, 1);
			}
		}
	}

	timer_count(parent_class: number, parent_id: number): number {
		let c = 0;
		for (const t of this.timers) {
			if (t.parent_class === parent_class && t.parent_id === parent_id) c++;
		}
		return c;
	}

	/** timer_update(): queue the event or script of every timer that ran out. */
	timer_update(): void {
		const gt = this.host.gt() ?? 0;
		for (const t of [...this.timers]) {
			if (gt - (t.start + t.duration) > 0) {
				if (t.typ === 0) {
					if (t.parent_class === 0) this.parse_globalevent(t.scr, 'triggerd by timer');
					else this.parse_emuevent(t.parent_class, t.parent_id, t.scr, 'triggered by timer');
				} else {
					this.parse_task(t.parent_class, t.parent_id, 'timer', 'timer script', t.scr);
				}
				t.mode = t.mode - 1;
				if (t.mode === 0) {
					const i = this.timers.indexOf(t);
					if (i >= 0) this.timers.splice(i, 1);
				} else {
					t.start = gt;
				}
			}
		}
	}

	// ====================================================================
	// parser_dialogue.bb
	// ====================================================================

	/** parse_dialogue(page$): fill the dialogue state from in_dlg$ for one page (or run a button action). */
	parse_dialogue(page: string): void {
		const d = this.dialogue;
		// Special Button Action?
		const dd = Instr(page, ':');
		if (dd > 0) {
			const action = Left(page, dd - 1);
			const param = Trim(Mid(page, dd + 1, -1));
			switch (action) {
				case 'action':
					if (param === 'close') {
						d.m_menu_closed = true;
						return;
					}
					break;
				case 'script':
					this.parse_task(0, 0, '', 'dialogue button script', param);
					return;
				case 'event':
					// quirk: no Return, so the text is afterwards also looked up as a page.
					this.parse_globalevent(param, 'dialogue button event');
					break;
			}
		}

		d.in_msgtext = '';
		let script = '';
		d.in_scr_scr = 0;
		for (const b of d.buttons) b.active = 0;
		d.trades.length = 0;
		d.in_dlg_page = page;
		// Count Lines
		let c = 1;
		for (let i = 0; i < d.in_dlg.length; i++) {
			if (d.in_dlg[i] === SEP_LINE) c++;
		}
		const splits = split(d.in_dlg, SEP_LINE, c);
		let bi = 0;
		let ti = 0;
		let foundpage = 0;

		let i = 0;
		scan: while (i < c) {
			let txt = splits[i];
			// Only Parse Lines with Assignment (=) and without Comment (#)
			let equal = Instr(txt, '=');
			if (Left(txt, 1) === '#') equal = 0;
			if (equal > 0) {
				let v = Trim(Left(txt, equal - 1));
				let val = Trim(Mid(txt, equal + 1, -1));
				if (foundpage === 0) {
					if (v === 'page') {
						if (val === page) foundpage = 1;
					}
				} else {
					switch (v) {
						case 'page':
							break scan;
						case 'title':
							d.in_msgtitle = val;
							break;
						case 'button':
							if (bi < 10) {
								const co = Instr(val, ',');
								if (co > 0) {
									const b = d.buttons[bi];
									b.active = 1;
									b.icon = Cicon_ok;
									b.txt = trimspace(Mid(val, co + 1, -1));
									b.scr = trimspace(Left(val, co - 1));
									b.handle = 0;
									bi++;
								} else {
									this.parse_error("dialogue 'button' expects 'page,text' (no comma found)");
								}
							} else {
								this.parse_error('there is a maximum of 10 buttons in a dialogue');
							}
							break;
						case 'ibutton':
							if (bi < 10) {
								const co = Instr(val, ',');
								const co2 = Instr(val, ',', co + 1);
								if (co > 0 && co2 > 0) {
									const b = d.buttons[bi];
									b.active = 1;
									b.txt = trimspace(Mid(val, co2 + 1, -1));
									b.scr = trimspace(Mid(val, co + 1, co2 - (co + 1)));
									b.handle = 0;
									const frame = Trim(Left(val, co - 1));
									if (frame.length > 2) {
										b.handle = this.host.load_res(frame, 1, 1) ?? 0;
										b.icon = b.handle === 0 ? Cicon_ok : -1;
									} else {
										b.icon = Int(frame);
									}
									bi++;
								} else {
									this.parse_error("dialogue 'button' expects 'icon,page,text' (not enough commas found)");
								}
							} else {
								this.parse_error('there is a maximum of 10 buttons in a dialogue');
							}
							break;
						case 'script':
							if (val === 'start') {
								i++;
								while (i < c) {
									val = splits[i];
									if (val === 'script=end') break;
									script = script + val + SEP_LINE;
									i++;
								}
							}
							break;
						case 'text':
							if (val === 'start') {
								i++;
								while (i < c) {
									val = splits[i];
									if (val === 'text=end') break;
									d.in_msgtext = d.in_msgtext + val + SEP_LINE;
									i++;
								}
							}
							break;
						case 'trade':
							if (val === 'start') {
								let sellsc = 0;
								let buysc = 0;
								ti++;
								i++;
								d.trades.push({ id: ti, mode: 0, typ: 0, count: 0 });
								while (i < c) {
									txt = splits[i];
									if (txt === 'trade=end') break;
									equal = Instr(txt, '=');
									if (Left(txt, 1) === '#') equal = 0;
									if (equal > 0) {
										v = Trim(Left(txt, equal - 1));
										val = Trim(Mid(txt, equal + 1, -1));
										if (v === 'sell' || v === 'buy') {
											const trd: Ttrade = { id: ti, mode: 0, typ: 0, count: 0 };
											d.trades.push(trd);
											if (v === 'sell') {
												trd.mode = 1;
												sellsc++;
												if (sellsc > 5) throw new BlitzRuntimeError("DIALOGUE TRADE allows max 5 x 'sell' per trade");
											} else {
												trd.mode = 2;
												buysc++;
												if (buysc > 5) throw new BlitzRuntimeError("DIALOGUE TRADE allows max 5 x 'buy' per trade");
											}
											const co = Instr(val, ',');
											if (co > 0) {
												trd.typ = Math.abs(Int(trimspace(Left(val, co - 1))));
												trd.count = Math.abs(Int(trimspace(Mid(val, co + 1, -1))));
											} else {
												trd.typ = Math.abs(Int(val));
												trd.count = 1;
											}
											if (
												(this.host.def_name(Cclass_item, trd.typ) ?? '') === '' ||
												(this.host.Ditem_iconh(trd.typ) ?? 0) === 0
											) {
												throw new BlitzRuntimeError("DIALOGUE TRADE item with id '" + trd.typ + "' is not defined");
											}
										} else {
											throw new BlitzRuntimeError("Invalid DIALOGUE TRADE Property '" + v + "'");
										}
									}
									i++;
								}
							}
							break;
						default:
							throw new BlitzRuntimeError("Invalid DIALOGUE Property '" + v + "'");
					}
				}
			}
			i++;
		}

		// Clearup (Remove separators at both ends)
		while (Left(d.in_msgtext, 1) === SEP_LINE) d.in_msgtext = Right(d.in_msgtext, d.in_msgtext.length - 1);
		while (Right(d.in_msgtext, 1) === SEP_LINE) d.in_msgtext = Left(d.in_msgtext, d.in_msgtext.length - 1);

		// Execute Script
		if (script !== '') this.parse_task(0, 0, '', 'dialogue script', script);

		// Page not Found
		if (foundpage === 0) this.parse_error("the dialogue page '" + page + "' is not defined");
	}

	// ====================================================================
	// Convenience for loaders and tests (not in the original)
	// ====================================================================

	/** Dobject_script$(typ)=..., with its key and the type count kept up to date. */
	def_script_set(cls: number, typ: number, script: string): void {
		this.Dscript[cls][typ] = script;
		this.Dscriptk[cls][typ] = this.preparse_string(script);
		if (typ > this.Dcount[cls]) this.Dcount[cls] = typ;
	}

	/** game_script$=..., with its key. */
	game_script_set(script: string): void {
		this.game_script = script;
		this.game_scriptk = this.preparse_string(script);
	}

	/** Queue one script as a task and run the queue: parse_task() + parse_all(). */
	run(script: string, cls = 0, id = 0, event = '', info = ''): void {
		this.parse_task(cls, id, event, info, script.replace(/\r?\n/g, SEP_LINE));
		this.parse_all();
	}
}

/** parse_getstate(): names and numbers of the Cstate_* constants. */
const STATES = new Map<string, number>();
for (const [names, v] of [
	[['bleeding'], 1],
	[['intoxication'], 2],
	[['pus'], 3],
	[['fire'], 4],
	[['eternalfire', 'eternal fire'], 5],
	[['frostbite'], 6],
	[['fracture'], 7],
	[['electroshock'], 8],
	[['bloodrush'], 9],
	[['dizzy'], 10],
	[['wet'], 11],
	[['fuddle'], 12],
	[['healing'], 16],
	[['invulnerability', 'invulnerable'], 17],
	[['tame'], 18],
	[['action'], 21],
	[['flare'], 22],
	[['smoke'], 23],
	[['light'], 24],
	[['particles'], 25],
	[['physics'], 51],
	[['buildplace'], 52],
	[['link'], 53],
	[['ai_stick'], 60],
	[['speed', 'speedmod'], 54],
	[['ghost'], 55]
] as [string[], number][]) {
	for (const n of names) STATES.set(n, v);
	STATES.set(String(v), v);
}
