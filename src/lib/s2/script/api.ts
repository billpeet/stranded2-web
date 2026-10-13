/**
 * Contract between the interpreter core (engine.ts) and the command handlers
 * (commands/*.ts). Everything here mirrors a global or function of the
 * original Blitz3D source (includes/parser*.bb); names are kept.
 *
 * Blitz typing rules a handler must reproduce when it ports a Case block of
 * parse_commands():
 *   id=param()        -> Int(P.param())      (string -> int is C atoi)
 *   x#=param()        -> Float(P.param())    (string -> float is C atof, single precision)
 *   s$=param()        -> P.param()
 *   s$=params()       -> P.params()
 *   p_return$=<int>   -> P.p_return = istr(n)
 *   p_return$=<float> -> P.p_return = fstr(x)
 *   <float> -> <int>  -> f2i(x)  (round to nearest, not truncate)
 * A string compared with a number compares as strings ("0.0"=0 is false).
 * All locals of parse_commands start at 0 / "" on every call.
 */
import type { ScriptHost } from './host';

/** Type Tx: the shared "extension" list (scripts, variables, diary, locks, skills). */
export interface Tx {
	typ: number;
	parent_class: number;
	parent_id: number;
	/** 0 script, 1 global var, 2 diary, 3 buildlock, 4 local var, 5 skill, 6 save extension, 50 maplock */
	mode: number;
	key: string;
	value: string;
	stuff: string;
}

/** Ordered Tx list with the iteration semantics of Blitz "For Tx=Each Tx". */
export interface TxList {
	/** Live array in creation order. Do not splice while iterating; use remove(). */
	readonly items: Tx[];
	/** Tx.Tx=New Tx: appended at the end, unspecified fields are 0 / "". */
	add(fields: Partial<Tx>): Tx;
	/** Delete every entry matching pred (For Each ... Delete). Returns the count. */
	remove(pred: (tx: Tx) => boolean): number;
	/** Delete one entry. */
	delete(tx: Tx): void;
	/** First entry matching pred (For Each ... Exit/Return on first hit). */
	find(pred: (tx: Tx) => boolean): Tx | undefined;
}

/** Type Ttimer */
export interface Ttimer {
	/** 0 event timer, 1 script timer */
	typ: number;
	parent_class: number;
	parent_id: number;
	duration: number;
	start: number;
	mode: number;
	scr: string;
}

/** pv_* globals: values the game publishes for script functions to read. */
export interface ParseVars {
	x: number; // pv_x#
	y: number; // pv_y#
	z: number; // pv_z#
	buffer: string; // pv_buffer$
	attack_damage: number; // pv_attack_damage#
	attack_weapon: number;
	attack_ammo: number;
	impact_class: number;
	impact_id: number;
	impact_kill: number;
	impact_num: number;
	impact_amount: number;
	impact_x: number; // pv_impact_x#
	impact_y: number; // pv_impact_y#
	impact_z: number; // pv_impact_z#
	impact_ground: number;
	ai_eater: number;
	state: number;
	lastbuilding: number;
	loadmaploaded: number;
}

/**
 * What a command handler sees. Implemented by ScriptEngine. Members are the
 * original globals/functions with the same names and behaviour.
 */
export interface ParseCtx {
	readonly host: ScriptHost;
	readonly tx: TxList;
	readonly pv: ParseVars;
	readonly timers: Ttimer[];

	// --- parser globals -------------------------------------------------
	/**
	 * p_com$: GLOBAL current command name. A nested function call inside a
	 * parameter overwrites it, so read it at the point the original reads it
	 * (do not capture it before reading parameters).
	 */
	p_com: string;
	/** p_return$: reset to "" at the start of every parse_commands call. */
	p_return: string;
	p_env_class: number;
	p_env_id: number;
	p_env_event: string;
	p_env_info: string;
	p_internal: number;
	p_internaltxt: string;
	/** Line cursor (1-based column) and current line, for the rare command that touches them. */
	p_p: number;
	p_l: string;
	p_len: number;
	p_pl: number;
	p_bracelevel: number;
	p_loopmode: number;
	p_looplevel: number;
	p_loopi: number;
	p_skipevent: number;
	tmp_skipevent: number;
	tmp_dumpvars: number;
	/** tmp_gclass / tmp_gid: results of parse_classid(). */
	tmp_gclass: number;
	tmp_gid: number;
	/** The jumptosemi parameter of the running parse_commands call (set 0 to skip parse_semi). */
	jumptosemi: number;
	/** map_briefing$ / map_briefing_key$: the global map script. */
	map_briefing: string;
	map_briefing_key: string;

	// --- parameter reading (parser_functions.bb) --------------------------
	/** param$(rawvar=0): next parameter, variables replaced and maths evaluated. rawvar=1: no $ replacement, treated as text. rawvar=2: raw text. */
	param(rawvar?: number): string;
	/** params$(): next string parameter. */
	params(): string;
	/** parse_comma(error=1): consume a comma; 1 if found. error=1 raises "Expecting parameter resp. ','" when missing. */
	parse_comma(error?: number): number;
	/** parse_param(): 0 if the next non-space char is ';', else 1. */
	parse_param(): number;
	parse_semi(error?: number): number;
	parse_comsemi(error?: number): number;
	parse_closebrace(equalcount?: number): number;
	/** parse_error(id$, param$=""): numbers are converted like Blitz does (pass istr/fstr results for floats). */
	parse_error(id: string, param?: string | number): void;
	/** parse_getclass(txt$, mode=1). Returns 0 when nothing matches (Blitz falls off the end). */
	parse_getclass(txt: string, mode?: number): number;
	parse_getclasstxt(cls: number): string;
	parse_getstate(txt: string): number;
	parse_getaisignal(txt: string): number;
	parse_getaimode(txt: string): number;
	parse_isint(txt: string): number;
	/** parse_classid(): reads "class,id" | "self" | "player" into tmp_gclass / tmp_gid. */
	parse_classid(): void;
	/** parse_loadscript$(file$, getstartl=1, startl$="") */
	parse_loadscript(file: string, getstartl?: number, startl?: string): string;

	// --- events / tasks -----------------------------------------------------
	preparse_string(txt: string): string;
	parse_task(cls: number, id: number, event: string, info: string, script: string): void;
	parse_globalevent(event: string, info?: string): void;
	parse_emuevent(cls: number, id: number, event: string, info?: string): void;
	set_parsecache(cls: number, id: number, event?: string, info?: string): number;

	// --- variables (parser_vars.bb) ---------------------------------------
	var_get(name: string): string;
	var_set(name: string, value: string): number;
	var_free(name: string): number;
	var_exists(name: string): number;
	var_bool(name: string): number;
	var_modify(name: string, value: string): string;
	var_temp(name: string): number;
	var_local(name: string): number;
	var_get_local(cls: number, id: number, name: string): string;
	var_set_local(cls: number, id: number, name: string, value: string): number;
	var_type(txt: string): number;
	var_cache_save(file: string, varlist?: string): number;
	var_cache_load(file: string): number;
	const_set(n: string, v: number): void;
	/** const_get(n$): 1 if found; the value is left in tmp_constv. */
	const_get(n: string): number;
	tmp_constv: number;

	// --- timers (timer.bb) --------------------------------------------------
	timer_add(): void;
	timer_free(parent_class: number, parent_id: number, mode?: string): void;
	timer_count(parent_class: number, parent_id: number): number;

	/** Rand(low, high) / Rand(high) of the Blitz runtime (shared generator). */
	Rand(a: number, b?: number): number;
	/** Rnd(low, high) of the Blitz runtime. */
	Rnd(a: number, b?: number): number;
}

/** One Case block of parse_commands(). */
export interface CommandDef {
	/** Every Case label that shares this body, as written in the source. */
	names: string[];
	/** Section banner in parser_commands.bb (BASIC, PLAYER, ...). */
	section: string;
	/** Line of the Case statement in parser_commands.bb. */
	line: number;
	/** 'core': fully implemented here, needs no game world. 'host': parameters are read here, the effect is delegated to ScriptHost. */
	kind: 'core' | 'host';
	/** True if any path assigns p_return$ (the command is usable as a function). */
	returns: boolean;
	/**
	 * Parameter-reading pattern. Notation: name:i = Int(param()), name:f =
	 * Float(param()), name:s = param() string, name:S = params(), name:v =
	 * param(1) raw variable; "," = required comma (parse_comma(1)); "[, x]" =
	 * optional (parse_comma(0)); "[x]" = read only if parse_param(); "{a | b}"
	 * = alternatives chosen by an earlier value; "..." = repeats while commas
	 * follow; "=v" after a name is the default assigned before an optional read.
	 */
	usage: string;
	run(P: ParseCtx): void;
}
