/**
 * parse_commands() Case blocks of parser_commands.bb lines 3357-4333:
 * SEQUENCE, EFFECTS, SOUNDS, MODEL, STATES, SKILLS, FREE
 * ("seqstart" .. "freetext"; freescripts, freescript, freevars and
 * freevar/unset live in the interpreter core).
 */
import type { CommandDef, ParseCtx } from '../api';
import { Float, Int, f32, istr } from '../_helpers';

const Cclass_object = 1;
const Cclass_item = 3;
const Cclass_info = 4;

/** One value handed to seq_addevent (see the table at Host.seq_addevent). */
export type SeqValue = number | string | number[];

export interface Host {
	// --- SEQUENCE ---------------------------------------------------------
	/**
	 * seq_start() of game_sequences.bb. The original function reads its two
	 * optional parameters from the script ITSELF (parse_param/param/parse_comma:
	 * seq_blend, default 1, and seq_skipable, default 0, anything but 1 becomes
	 * 0) and then resets the sequence state. The game host calls it and
	 * returns true. Any other result (no game: the recording host) makes the
	 * handler read the parameters, so that the script still parses.
	 */
	seq_start(P: ParseCtx): true | void;
	/**
	 * seqtimemode. Raw values; the original then does:
	 * seq_tmod=tmod : If seq_tmod=0 Then seq_tmod=1 : seq_tmod=Abs(seq_tmod) : seq_tabs=tabs
	 * (tabs is 1 when the parameter is missing).
	 */
	cmd_seqtimemode(P: ParseCtx, tmod: number, tabs: number): void;
	/**
	 * seq_addevent(event$) of game_sequences.bb. The original function reads
	 * the parameters of the event from the script ITSELF; the game host calls
	 * it and returns true. Any other result (no game: the recording host) makes
	 * the handler read the parameters, so that the script still parses; the
	 * values are then dropped. What the fallback reads per event, in Tseq terms
	 * (`t` is the raw time parameter):
	 *   end, hidebar, showbar: (t)
	 *   msg:          (t, txt0, in0 color=0, in1 pos=0)
	 *   msgclear:     (t, in0 pos=-1)
	 *   sound:        (t, txt0 file, fl0 volume=1, fl1 pan=0, in0 pitch=0)
	 *   event:        (t, txt0 event, in0 class=0, in1 id=0)   class is the raw parse_getclass result (-1 for "self")
	 *   script:       (t, txt0 script text)
	 *   hideplayer:   (t, in0=1)
	 *   bar:          (t, in0 mode=0)
	 *   setcam:       (t, in0 target)
	 *   movecam:      (t, in0 endtime, in1 target)
	 *   campath:      (t, steptime, targets[])     one "movecam" Tseq per target, see the original for the time maths
	 *   timedcampath: (t, steptimes[], targets[])  steptimes[0] is the first steptime, the others are the raw increments
	 *   cammode:      (t, in0 mode, in1 class=0, in2 id=0)
	 *   flash:        (t, in0 r=255, in1 g=255, in2 b=255, fl0 speed=0.05, fl1 alpha=1.1)
	 *   fade:         (t, in0 endtime, in1 r=255, in2 g=255, in3 b=255, in4 mode=0)
	 *   cls:          (t, in0 mode, in1 r=0, in2 g=0, in3 b=0)
	 *   image:        (t, txt0 image, in0 masked=0)
	 *   itxt:         (t, txt0 text, in0 x, in1 y, in2 color=0, in3 align=0)
	 *   camfollow:    (t, in0 class, in1 id, fl0 x, fl1 y, fl2 z)   class 0 = stop following (rest 0)
	 */
	seq_addevent(P: ParseCtx, event: string): true | void;

	// --- EFFECTS ----------------------------------------------------------
	cmd_flash(P: ParseCtx, r: number, g: number, b: number, flashspeed: number, flasha: number): void;
	/** r/g/b are undefined when the colour group is missing (particles keep their default colour). id 0 = not stuck to a unit. */
	cmd_corona(
		P: ParseCtx,
		x: number,
		z: number,
		size: number,
		r: number | undefined,
		g: number | undefined,
		b: number | undefined,
		speed: number,
		id: number
	): void;
	cmd_thunder(P: ParseCtx): void;
	/** game_explosion(x#,y#,z#,range,damage#,style) */
	game_explosion(P: ParseCtx, x: number, y: number, z: number, range: number, damage: number, exstyle: number): void;
	/** in_scriptblur#=value, then clamped to 0..Cpeakblur# by the original. */
	cmd_blur(P: ParseCtx, value: number): void;
	cmd_vomit(P: ParseCtx, unitid: number): void;
	/** p_add(x#,y#,z#,typ,size#,alpha#); only called when size AND alpha were given. */
	cmd_particle(P: ParseCtx, x: number, y: number, z: number, typ: number, size: number, alpha: number): void;
	/** EntityColor of the last added particle (TCp), if any. */
	cmd_particlec(P: ParseCtx, r: number, g: number, b: number): void;

	// --- SOUNDS -----------------------------------------------------------
	/** sfx_play(file$,vol#,pan#,pitch) */
	sfx_play(P: ParseCtx, file: string, vol: number, pan: number, pitch: number): void;
	/** stopsounds() */
	stopsounds(P: ParseCtx): void;
	/** sfx_music(file$,vol#); if fade is given: mfx_fade=1, mfx_fadestart=gt, mfx_fadeend=Abs(fade). */
	cmd_music(P: ParseCtx, file: string, vol: number, fade: number | undefined): void;
	cmd_stopmusic(P: ParseCtx): void;
	/** mfx_fade=-1, mfx_fadestart=gt, mfx_fadeend=Abs(fade) */
	cmd_fademusic(P: ParseCtx, fade: number): void;
	/** mfx_fade=0, mfx_peakvol#=vol */
	cmd_musicvolume(P: ParseCtx, vol: number): void;
	/** Stops/frees the ambient sound, map_music$=file, loads "sfx\"+file when not "". */
	cmd_ambientsfx(P: ParseCtx, file: string): void;

	// --- MODEL ------------------------------------------------------------
	/** parent_h(parentclass,parentid,model): entity handle, 0 when there is none. */
	parent_h(parentclass: number, parentid: number, model: number): number;
	cmd_color(P: ParseCtx, r: number, g: number, b: number, classint: number, id: number): void;
	cmd_blend(P: ParseCtx, mode: number, classint: number, id: number): void;
	/** Original quirk: alpha_object() is applied to p_env_id whenever p_env_class is object, even with an explicit target. */
	cmd_alpha(P: ParseCtx, alpha: number, classint: number, id: number): void;
	cmd_scale(P: ParseCtx, sx: number, sy: number, sz: number, classint: number, id: number): void;
	cmd_fx(P: ParseCtx, mode: number, classint: number, id: number): void;
	cmd_shininess(P: ParseCtx, shininess: number, classint: number, id: number): void;
	/** Only called for an existing object or item. Original quirk in the item branch: RotateEntity TCobject\h (wrong variable). */
	cmd_model(P: ParseCtx, model: string, modelclass: number, modelid: number): void;
	cmd_texture(P: ParseCtx, texture: string, classint: number, id: number): void;

	// --- STATES -----------------------------------------------------------
	/** p_return$=set_state(stateint,classint,id); called only when the parent exists. */
	cmd_addstate(P: ParseCtx, stateint: number, classint: number, id: number): string | void;
	cmd_statecolor(P: ParseCtx, classint: number, id: number, stateint: number, r: number, g: number, b: number): void;
	cmd_statesize(P: ParseCtx, classint: number, id: number, stateint: number, size: number): void;
	cmd_statevalue(P: ParseCtx, classint: number, id: number, stateint: number, statevalue: number): void;
	/** valuetype 0 value_f#, 1 value, 2 r, 3 g, 4 b; returns nothing when the state is missing or valuetype is out of range. */
	cmd_getstatevalue(P: ParseCtx, classint: number, id: number, stateint: number, valuetype: number): string | void;
	/** stateint may be 0 (unknown state name): the original calls set_state(0,...) anyway. */
	cmd_areal_state(P: ParseCtx, stateint: number, x: number, y: number, z: number, range: number): void;

	// --- FREE -------------------------------------------------------------
	/**
	 * free. One of:
	 *   item:      (cls, Cclass_item, id, count)   -> free_item(id,count)   (count -1 = whole stack)
	 *   classint 0 (cls, 0, 0, undefined)          -> cls "particles": free all particles; anything else: nothing
	 *   other:     (cls, classint, id, undefined)  -> ha_free(classint,id)
	 *   self:      (cls, -1, -1, undefined)        -> ha_free(-1,-1)        (resolves p_env_class / p_env_id itself)
	 */
	cmd_free(P: ParseCtx, cls: string, classint: number, id: number, count: number | undefined): void;
	/** stateint given: free_state(stateint,classint,id) (parent exists); undefined: free every state of that parent. */
	cmd_freestate(P: ParseCtx, classint: number, id: number, stateint: number | undefined): void;
	/** typstr "all": free_item(item,-1) for every stored item; else the first stored item of typ Int(typstr): free_item(item,count). */
	cmd_freestored(P: ParseCtx, classint: number, id: number, typstr: string, count: number): void;
	/** in_sb(id)=0, id already checked 0..9 */
	cmd_freebutton(P: ParseCtx, id: number): void;
	/** in_sitxt(id)=0, id already checked 0..18 */
	cmd_freetext(P: ParseCtx, id: number): void;
}

// ---------------------------------------------------------------------------
// shared parameter readers
// ---------------------------------------------------------------------------

/** class$=param() : classint=parse_getclass(class$) : If -1 Then env Else parse_comma(1):id=param() */
function classid(P: ParseCtx): [number, number] {
	const cls = P.param();
	let classint = P.parse_getclass(cls);
	let id: number;
	if (classint === -1) {
		classint = P.p_env_class;
		id = P.p_env_id;
	} else {
		P.parse_comma(1);
		id = Int(P.param());
	}
	return [classint, id];
}

/**
 * MODEL commands: If parse_comma(0) Then class,id Else p_env.
 * Quirk: an explicit "self" is NOT resolved here (classint stays -1, parent_h finds nothing).
 */
function modeltarget(P: ParseCtx): [number, number] {
	if (P.parse_comma(0)) {
		const cls = P.param();
		const classint = P.parse_getclass(cls);
		P.parse_comma(1);
		const id = Int(P.param());
		return [classint, id];
	}
	return [P.p_env_class, P.p_env_id];
}

/** The fallback of seq(): the values were read so that the script parses, nothing else happens. */
function parsed(_event: string, _t: number, ..._values: SeqValue[]): void {}

/**
 * Case "seqend" .. "camfollow": seq_addevent(event$). The game's function reads its
 * parameters itself; without a game the parameters are read here and dropped.
 */
function seq(P: ParseCtx, event: string): void {
	if (P.host.seq_addevent(P, event) === true) return;
	const t = Int(P.param());
	switch (event) {
		case 'end':
		case 'hidebar':
		case 'showbar':
			parsed(event, t);
			break;
		case 'msg': {
			P.parse_comma(1);
			const txt = P.param();
			let in0 = 0;
			let in1 = 0;
			if (P.parse_comma(0)) in0 = Int(P.param());
			if (P.parse_comma(0)) in1 = Int(P.param());
			parsed(event, t, txt, in0, in1);
			break;
		}
		case 'msgclear': {
			let in0 = -1;
			if (P.parse_comma(0)) in0 = Int(P.param());
			parsed(event, t, in0);
			break;
		}
		case 'sound': {
			let fl0 = 1;
			let fl1 = 0;
			let in0 = 0;
			P.parse_comma(1);
			const txt = P.param();
			if (P.parse_comma(0)) fl0 = Float(P.param());
			if (P.parse_comma(0)) fl1 = Float(P.param());
			if (P.parse_comma(0)) in0 = Int(P.param());
			parsed(event, t, txt, fl0, fl1, in0);
			break;
		}
		case 'event': {
			P.parse_comma(1);
			const txt = P.param();
			let in0 = 0;
			let in1 = 0;
			if (P.parse_comma(0)) {
				const cls = P.param();
				in0 = P.parse_getclass(cls); // quirk: "self" is stored as -1, never resolved
				P.parse_comma(1);
				in1 = Int(P.param());
			}
			parsed(event, t, txt, in0, in1);
			break;
		}
		case 'script': {
			P.parse_comma(1);
			const source = P.params();
			let txt = '0'; // txt$=0
			if (Int(source) !== 0) {
				// quirk: takes the first Tx of that info regardless of its mode (script, local var, ...)
				const tx = P.tx.find((x) => x.parent_class === Cclass_info && x.parent_id === Int(source));
				if (tx) txt = tx.value;
			} else {
				txt = P.parse_loadscript(source);
			}
			if (txt === '0' || txt === '') P.parse_error('txtsource', source);
			parsed(event, t, txt);
			break;
		}
		case 'hideplayer': {
			let in0 = 1;
			// quirk: parse_comma(1), so leaving the "optional" value out raises an "expect" error
			if (P.parse_comma(1)) in0 = Int(P.param());
			parsed(event, t, in0);
			break;
		}
		case 'bar': {
			let in0 = 0;
			if (P.parse_comma(0)) in0 = Int(P.param());
			parsed(event, t, in0);
			break;
		}
		case 'setcam': {
			P.parse_comma(1);
			const in0 = Int(P.param());
			parsed(event, t, in0);
			break;
		}
		case 'movecam': {
			P.parse_comma(1);
			const in0 = Int(P.param());
			P.parse_comma(1);
			const in1 = Int(P.param());
			parsed(event, t, in0, in1);
			break;
		}
		case 'campath': {
			P.parse_comma(1);
			const steptime = Int(P.param());
			P.parse_comma(1);
			const targets = [Int(P.param())];
			while (P.parse_comma(0)) targets.push(Int(P.param()));
			parsed(event, t, steptime, targets);
			break;
		}
		case 'timedcampath': {
			P.parse_comma(1);
			const steptimes = [Int(P.param())];
			P.parse_comma(1);
			const targets = [Int(P.param())];
			while (P.parse_comma(0)) {
				steptimes.push(Int(P.param()));
				P.parse_comma(1);
				targets.push(Int(P.param()));
			}
			parsed(event, t, steptimes, targets);
			break;
		}
		case 'cammode': {
			P.parse_comma(1);
			const in0 = Int(P.param());
			let in1 = 0;
			let in2 = 0;
			if (P.parse_comma(0)) [in1, in2] = classid(P);
			parsed(event, t, in0, in1, in2);
			break;
		}
		case 'flash': {
			let in0 = 255;
			let in1 = 255;
			let in2 = 255;
			let fl0 = f32(0.05);
			let fl1 = f32(1.1);
			if (P.parse_comma(0)) in0 = Int(P.param());
			if (P.parse_comma(0)) in1 = Int(P.param());
			if (P.parse_comma(0)) in2 = Int(P.param());
			if (P.parse_comma(0)) fl0 = Float(P.param());
			if (P.parse_comma(0)) fl1 = Float(P.param());
			parsed(event, t, in0, in1, in2, fl0, fl1);
			break;
		}
		case 'fade': {
			P.parse_comma();
			let in1 = 255;
			let in2 = 255;
			let in3 = 255;
			let in4 = 0;
			const in0 = Int(P.param());
			if (P.parse_comma(0)) in1 = Int(P.param());
			if (P.parse_comma(0)) in2 = Int(P.param());
			if (P.parse_comma(0)) in3 = Int(P.param());
			if (P.parse_comma(0)) in4 = Int(P.param());
			parsed(event, t, in0, in1, in2, in3, in4);
			break;
		}
		case 'cls': {
			P.parse_comma();
			let in1 = 0;
			let in2 = 0;
			let in3 = 0;
			const in0 = Int(P.param());
			if (P.parse_comma(0)) in1 = Int(P.param());
			if (P.parse_comma(0)) in2 = Int(P.param());
			if (P.parse_comma(0)) in3 = Int(P.param());
			parsed(event, t, in0, in1, in2, in3);
			break;
		}
		case 'image': {
			P.parse_comma();
			let in0 = 0;
			const txt = P.param();
			if (P.parse_comma(0)) in0 = Int(P.param());
			parsed(event, t, txt, in0);
			break;
		}
		case 'itxt': {
			P.parse_comma();
			const txt = P.param();
			P.parse_comma(1);
			const in0 = Int(P.param());
			P.parse_comma(1);
			const in1 = Int(P.param());
			let in2 = 0;
			let in3 = 0;
			if (P.parse_comma(0)) in2 = Int(P.param());
			if (P.parse_comma(0)) in3 = Int(P.param());
			parsed(event, t, txt, in0, in1, in2, in3);
			break;
		}
		case 'camfollow': {
			P.parse_comma();
			const cls = P.param();
			if (cls !== '0') {
				// string compare: "0.0" or " 0" would not count as 0
				let classint = P.parse_getclass(cls);
				let id: number;
				if (classint === -1) {
					classint = P.p_env_class;
					id = P.p_env_id;
				} else {
					P.parse_comma(1);
					id = Int(P.param());
				}
				P.parse_comma();
				const fl0 = Float(P.param());
				P.parse_comma();
				const fl1 = Float(P.param());
				P.parse_comma();
				const fl2 = Float(P.param());
				parsed(event, t, classint, id, fl0, fl1, fl2);
			} else {
				parsed(event, t, 0, 0, 0, 0, 0);
			}
			break;
		}
	}
}

const seqdef = (names: string[], line: number, event: string, usage: string): CommandDef => ({
	names,
	section: 'SEQUENCE',
	line,
	kind: 'host',
	returns: false,
	usage,
	run: (P) => seq(P, event)
});

// ---------------------------------------------------------------------------
// skills (skills.bb): Tx mode 5, key = skill, value = value, stuff = caption
// ---------------------------------------------------------------------------

const skill_find = (P: ParseCtx, skill: string) => P.tx.find((x) => x.mode === 5 && x.key === skill);

/** free_skill(skill$): 1 if a skill was deleted. */
function free_skill(P: ParseCtx, skill: string): number {
	const tx = skill_find(P, skill);
	if (!tx) return 0;
	P.tx.delete(tx);
	return 1;
}

const TARGET = '[, class:s, id:i]';
const CLASSID = '{class:s, id:i | "self"}';

export const commands: CommandDef[] = [
	// ################################################# SEQUENCE
	{
		names: ['seqstart'],
		section: 'SEQUENCE',
		line: 3360,
		kind: 'host',
		returns: false,
		usage: '[blend:i=1 [, skipable:i=0]]',
		run(P) {
			// seq_start() reads its parameters itself (game_sequences.bb)
			if (P.host.seq_start(P) === true) return;
			// no game: read them so that the script parses
			let blend = 1;
			let skipable = 0;
			if (P.parse_param()) {
				blend = Int(P.param());
				if (P.parse_comma(0)) {
					skipable = Int(P.param());
					if (skipable !== 1) skipable = 0;
				}
			}
			void blend;
			void skipable;
		}
	},
	{
		names: ['seqtimemode'],
		section: 'SEQUENCE',
		line: 3364,
		kind: 'host',
		returns: false,
		usage: 'tmod:i [, tabs:i=1]',
		run(P) {
			const tmod = Int(P.param());
			let tabs = 1;
			if (P.parse_comma(0)) tabs = Int(P.param());
			P.host.cmd_seqtimemode(P, tmod, tabs);
		}
	},
	seqdef(['seqend'], 3374, 'end', 't:i'),
	seqdef(['seqmsg'], 3377, 'msg', 't:i, msg:s [, color:i=0] [, pos:i=0]'),
	seqdef(['seqmsgclear'], 3378, 'msgclear', 't:i [, pos:i=-1]'),
	seqdef(['seqsound'], 3381, 'sound', 't:i, file:s [, vol:f=1] [, pan:f=0] [, pitch:i=0]'),
	seqdef(['seqbar'], 3382, 'bar', 't:i [, mode:i=0]'),
	// quirk: the label is "hidbar" (typo for "hidebar"); the event name is "hidebar"
	seqdef(['hidbar'], 3383, 'hidebar', 't:i'),
	// quirk: "showbar" has no "seq" prefix
	seqdef(['showbar'], 3384, 'showbar', 't:i'),
	seqdef(['seqflash'], 3385, 'flash', 't:i [, r:i=255] [, g:i=255] [, b:i=255] [, speed:f=0.05] [, alpha:f=1.1]'),
	seqdef(['seqfade'], 3386, 'fade', 't:i, endtime:i [, r:i=255] [, g:i=255] [, b:i=255] [, mode:i=0]'),
	seqdef(['seqcls'], 3387, 'cls', 't:i, mode:i [, r:i=0] [, g:i=0] [, b:i=0]'),
	seqdef(['seqimage'], 3388, 'image', 't:i, image:s [, masked:i=0]'),
	seqdef(['seqimagetext'], 3389, 'itxt', 't:i, text:s, x:i, y:i [, color:i=0] [, align:i=0]'),
	seqdef(['seqevent'], 3392, 'event', 't:i, event:s [, class:s, id:i]'),
	seqdef(['seqscript'], 3393, 'script', 't:i, source:S'),
	// quirk: the value is read behind parse_comma(1), so omitting it raises an error (and hides the player)
	seqdef(['seqhideplayer'], 3394, 'hideplayer', 't:i, hide:i=1'),
	seqdef(['setcam', 'sc'], 3397, 'setcam', 't:i, target:i'),
	seqdef(['movecam', 'mc'], 3398, 'movecam', 't:i, endtime:i, target:i'),
	seqdef(['campath'], 3399, 'campath', 't:i, steptime:i, target:i [, target:i]...'),
	seqdef(['timedcampath'], 3400, 'timedcampath', 't:i, steptime:i, target:i [, steptime:i, target:i]...'),
	seqdef(['cammode'], 3401, 'cammode', `t:i, mode:i [, ${CLASSID}]`),
	seqdef(['camfollow'], 3402, 'camfollow', `t:i, {"0" | ${CLASSID}, x:f, y:f, z:f}`),

	// ################################################# EFFECTS
	{
		names: ['flash'],
		section: 'EFFECTS',
		line: 3408,
		kind: 'host',
		returns: false,
		usage: 'r:i, g:i, b:i [, speed:f=0.05] [, alpha:f=1.1]',
		run(P) {
			let flashspeed = f32(0.05);
			let flasha = f32(1.1);
			// the r=g=b=255 defaults of the original are dead: all three are always read
			const r = Int(P.param());
			P.parse_comma();
			const g = Int(P.param());
			P.parse_comma();
			const b = Int(P.param());
			if (P.parse_comma(0)) flashspeed = Float(P.param());
			if (P.parse_comma(0)) flasha = Float(P.param());
			P.host.cmd_flash(P, r, g, b, flashspeed, flasha);
		}
	},
	{
		names: ['corona'],
		section: 'EFFECTS',
		line: 3424,
		kind: 'host',
		returns: false,
		usage: 'x:f, z:f [, size:f=20] [, r:i, g:i, b:i [, speed:f=1] [, unit:s=0]]',
		run(P) {
			const x = Float(P.param());
			P.parse_comma();
			const z = Float(P.param());
			let size = 20;
			let speed = 1;
			let id = 0;
			let r: number | undefined;
			let g: number | undefined;
			let b: number | undefined;
			if (P.parse_comma(0)) size = Float(P.param());
			// quirk: speed and the unit to stick to can only be given together with a colour
			if (P.parse_comma(0)) {
				r = Int(P.param());
				P.parse_comma();
				g = Int(P.param());
				P.parse_comma();
				b = Int(P.param());
				if (P.parse_comma(0)) speed = Float(P.param());
				if (P.parse_comma(0)) {
					const idstring = P.param();
					id = idstring === 'self' ? P.p_env_id : Int(idstring);
				}
			}
			P.host.cmd_corona(P, x, z, size, r, g, b, speed, id);
		}
	},
	{
		names: ['thunder'],
		section: 'EFFECTS',
		line: 3467,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_thunder(P);
		}
	},
	{
		names: ['explosion', 'explode'],
		section: 'EFFECTS',
		line: 3474,
		kind: 'host',
		returns: false,
		usage: 'x:f, y:f, z:f [, range:i=50] [, damage:f=50] [, style:i=1]',
		run(P) {
			const x = Float(P.param());
			P.parse_comma(1);
			const y = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			let range = 50; // int local although game_explosion takes range#
			if (P.parse_comma(0)) range = Int(P.param());
			let damage = 50;
			if (P.parse_comma(0)) damage = Float(P.param());
			let exstyle = 1;
			if (P.parse_comma(0)) exstyle = Int(P.param());
			P.host.game_explosion(P, x, y, z, range, damage, exstyle);
		}
	},
	{
		names: ['blur'],
		section: 'EFFECTS',
		line: 3495,
		kind: 'host',
		returns: false,
		usage: 'blur:f',
		run(P) {
			const value = Float(P.param());
			P.host.cmd_blur(P, value);
		}
	},
	{
		names: ['vomit'],
		section: 'EFFECTS',
		line: 3504,
		kind: 'host',
		returns: false,
		usage: 'unit:s',
		run(P) {
			const unitidstr = P.param();
			const unitid = unitidstr === 'self' ? P.p_env_id : Int(unitidstr);
			P.host.cmd_vomit(P, unitid);
		}
	},
	{
		names: ['particle'],
		section: 'EFFECTS',
		line: 3523,
		kind: 'host',
		returns: false,
		usage: 'x:f, y:f, z:f, typ:i [, size:f=1 [, alpha:f=1]]',
		run(P) {
			let size = 1;
			let alpha = 1;
			const x = Float(P.param());
			P.parse_comma();
			const y = Float(P.param());
			P.parse_comma();
			const z = Float(P.param());
			P.parse_comma();
			const typ = Int(P.param());
			if (P.parse_comma(0)) {
				size = Float(P.param());
				if (P.parse_comma(0)) {
					alpha = Float(P.param());
					// quirk: p_add sits inside the innermost If, so no particle is created unless size AND alpha are given
					P.host.cmd_particle(P, x, y, z, typ, size, alpha);
				}
			}
		}
	},
	{
		names: ['particlec'],
		section: 'EFFECTS',
		line: 3542,
		kind: 'host',
		returns: false,
		usage: 'r:i, g:i, b:i',
		run(P) {
			const r = Int(P.param());
			P.parse_comma(1);
			const g = Int(P.param());
			P.parse_comma(1);
			const b = Int(P.param());
			P.host.cmd_particlec(P, r, g, b);
		}
	},

	// ################################################# SOUNDS
	{
		names: ['play'],
		section: 'SOUNDS',
		line: 3558,
		kind: 'host',
		returns: false,
		usage: 'file:S [, vol:f=1] [, pan:f=0] [, pitch:i=0]',
		run(P) {
			let vol = 1;
			let pan = 0;
			let pitch = 0;
			const file = P.params();
			if (P.parse_comma(0)) vol = Float(P.param());
			if (P.parse_comma(0)) pan = Float(P.param());
			if (P.parse_comma(0)) pitch = Int(P.param());
			P.host.sfx_play(P, file, vol, pan, pitch);
		}
	},
	{
		names: ['stopsounds'],
		section: 'SOUNDS',
		line: 3570,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.stopsounds(P);
		}
	},
	{
		names: ['music'],
		section: 'SOUNDS',
		line: 3574,
		kind: 'host',
		returns: false,
		usage: 'file:S [, vol:f=1] [, fade:i]',
		run(P) {
			let vol = 1;
			let fade: number | undefined;
			const file = P.params();
			if (P.parse_comma(0)) vol = Float(P.param());
			// the original calls sfx_music(file,vol) here, before the fade parameter is read
			if (P.parse_comma(0)) fade = Int(P.param());
			P.host.cmd_music(P, file, vol, fade);
		}
	},
	{
		names: ['stopmusic'],
		section: 'SOUNDS',
		line: 3589,
		kind: 'host',
		returns: false,
		usage: '',
		run(P) {
			P.host.cmd_stopmusic(P);
		}
	},
	{
		names: ['fademusic'],
		section: 'SOUNDS',
		line: 3595,
		kind: 'host',
		returns: false,
		usage: 'fade:i',
		run(P) {
			const fade = Int(P.param());
			P.host.cmd_fademusic(P, fade);
		}
	},
	{
		names: ['musicvolume'],
		section: 'SOUNDS',
		line: 3602,
		kind: 'host',
		returns: false,
		usage: 'vol:f',
		run(P) {
			const vol = Float(P.param());
			P.host.cmd_musicvolume(P, vol);
		}
	},
	{
		names: ['ambientsfx'],
		section: 'SOUNDS',
		line: 3607,
		kind: 'host',
		returns: false,
		usage: 'file:s',
		run(P) {
			// the original stops and frees the old ambient sound before reading the parameter
			const file = P.param();
			P.host.cmd_ambientsfx(P, file);
		}
	},

	// ################################################# MODEL
	{
		names: ['color'],
		section: 'MODEL',
		line: 3619,
		kind: 'host',
		returns: false,
		usage: `r:i, g:i, b:i ${TARGET}`,
		run(P) {
			const r = Int(P.param());
			P.parse_comma(1);
			const g = Int(P.param());
			P.parse_comma(1);
			const b = Int(P.param());
			const [classint, id] = modeltarget(P);
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_color(P, r, g, b, classint, id);
			else P.parse_error('model', 'color');
		}
	},
	{
		names: ['blend'],
		section: 'MODEL',
		line: 3641,
		kind: 'host',
		returns: false,
		usage: `mode:i ${TARGET}`,
		run(P) {
			const mode = Int(P.param());
			const [classint, id] = modeltarget(P);
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_blend(P, mode, classint, id);
			else P.parse_error('model', 'blend');
		}
	},
	{
		names: ['alpha'],
		section: 'MODEL',
		line: 3659,
		kind: 'host',
		returns: false,
		usage: `alpha:f ${TARGET}`,
		run(P) {
			const alpha = Float(P.param());
			const [classint, id] = modeltarget(P);
			// quirk (host side): alpha_object(p_env_id) keys on p_env_class, not on the explicit target
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_alpha(P, alpha, classint, id);
			else P.parse_error('model', 'alpha');
		}
	},
	{
		names: ['scale'],
		section: 'MODEL',
		line: 3680,
		kind: 'host',
		returns: false,
		usage: `sx:f, sy:f, sz:f ${TARGET}`,
		run(P) {
			const sx = Float(P.param());
			P.parse_comma(1);
			const sy = Float(P.param());
			P.parse_comma(1);
			const sz = Float(P.param());
			const [classint, id] = modeltarget(P);
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_scale(P, sx, sy, sz, classint, id);
			else P.parse_error('model', 'scale');
		}
	},
	{
		names: ['fx'],
		section: 'MODEL',
		line: 3754,
		kind: 'host',
		returns: false,
		usage: `mode:i ${TARGET}`,
		run(P) {
			const mode = Int(P.param());
			const [classint, id] = modeltarget(P);
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_fx(P, mode, classint, id);
			else P.parse_error('model', 'fx');
		}
	},
	{
		names: ['shininess'],
		section: 'MODEL',
		line: 3772,
		kind: 'host',
		returns: false,
		usage: `shininess:f ${TARGET}`,
		run(P) {
			const shininess = Float(P.param());
			const [classint, id] = modeltarget(P);
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_shininess(P, shininess, classint, id);
			else P.parse_error('model', 'shininess');
		}
	},
	{
		names: ['model'],
		section: 'MODEL',
		line: 3790,
		kind: 'host',
		returns: false,
		usage: `model:s ${TARGET}`,
		run(P) {
			const model = P.param();
			const [modelclass, modelid] = modeltarget(P);
			if ((P.host.parent_h(modelclass, modelid, 1) ?? 0) !== 0) {
				if (modelclass === Cclass_object || modelclass === Cclass_item) {
					P.host.cmd_model(P, model, modelclass, modelid);
				} else {
					P.parse_error("'model' command needs to be executed at an object or item");
				}
			} else {
				P.parse_error('model', 'model');
			}
		}
	},
	{
		names: ['texture'],
		section: 'MODEL',
		line: 3875,
		kind: 'host',
		returns: false,
		usage: `texture:s ${TARGET}`,
		run(P) {
			const texture = P.param();
			const [classint, id] = modeltarget(P);
			if ((P.host.parent_h(classint, id, 1) ?? 0) !== 0) P.host.cmd_texture(P, texture, classint, id);
			else P.parse_error('model', 'fx'); // quirk: copy/paste, reports "fx" instead of "texture"
		}
	},

	// ################################################# STATES
	{
		names: ['addstate'],
		section: 'STATES',
		line: 3903,
		kind: 'host',
		returns: true,
		usage: `${CLASSID}, state:s`,
		run(P) {
			P.p_return = '0';
			const [classint, id] = classid(P);
			P.parse_comma(1);
			const state = P.param();
			const stateint = P.parse_getstate(state);
			if (stateint !== 0) {
				if (P.host.parent_con(classint, id)) {
					const r = P.host.cmd_addstate(P, stateint, classint, id);
					if (typeof r === 'string') P.p_return = r;
				} else {
					P.parse_error('object', id);
				}
			}
		}
	},
	{
		names: ['statecolor'],
		section: 'STATES',
		line: 3926,
		kind: 'host',
		returns: false,
		usage: `${CLASSID}, state:s, r:i, g:i, b:i`,
		run(P) {
			const [classint, id] = classid(P);
			P.parse_comma(1);
			const state = P.param();
			const stateint = P.parse_getstate(state);
			P.parse_comma(1);
			const r = Int(P.param());
			P.parse_comma(1);
			const g = Int(P.param());
			P.parse_comma(1);
			const b = Int(P.param());
			if (stateint !== 0) P.host.cmd_statecolor(P, classint, id, stateint, r, g, b);
		}
	},
	{
		names: ['statesize'],
		section: 'STATES',
		line: 3963,
		kind: 'host',
		returns: false,
		usage: `${CLASSID}, state:s, size:f`,
		run(P) {
			const [classint, id] = classid(P);
			P.parse_comma(1);
			const state = P.param();
			const stateint = P.parse_getstate(state);
			P.parse_comma(1);
			const size = Float(P.param());
			if (stateint !== 0) P.host.cmd_statesize(P, classint, id, stateint, size);
		}
	},
	{
		names: ['statevalue'],
		section: 'STATES',
		line: 3993,
		kind: 'host',
		returns: false,
		usage: `${CLASSID}, state:s, value:f`,
		run(P) {
			const [classint, id] = classid(P);
			P.parse_comma(1);
			const state = P.param();
			const stateint = P.parse_getstate(state);
			P.parse_comma(1);
			const statevalue = Float(P.param());
			if (stateint !== 0) P.host.cmd_statevalue(P, classint, id, stateint, statevalue);
		}
	},
	{
		names: ['getstatevalue'],
		section: 'STATES',
		line: 4022,
		kind: 'host',
		returns: true,
		usage: `${CLASSID}, state:s [, valuetype:i=0]`,
		run(P) {
			const [classint, id] = classid(P);
			P.parse_comma(1);
			const state = P.param();
			const stateint = P.parse_getstate(state);
			let valuetype = 0;
			if (P.parse_comma(0)) valuetype = Int(P.param());
			// no default: p_return$ stays "" when the state does not exist
			if (stateint !== 0) {
				const r = P.host.cmd_getstatevalue(P, classint, id, stateint, valuetype);
				if (typeof r === 'string') P.p_return = r;
			}
		}
	},
	{
		names: ['areal_state'],
		section: 'STATES',
		line: 4059,
		kind: 'host',
		returns: false,
		usage: 'state:s, x:f, y:f, z:f [, range:i=50]',
		run(P) {
			const state = P.param();
			const stateint = P.parse_getstate(state);
			P.parse_comma(1);
			const x = Float(P.param());
			P.parse_comma(1);
			const y = Float(P.param());
			P.parse_comma(1);
			const z = Float(P.param());
			let range = 50;
			if (P.parse_comma(0)) range = Int(P.param());
			// quirk: no "If stateint<>0" guard, an unknown state is still applied as state 0
			P.host.cmd_areal_state(P, stateint, x, y, z, range);
		}
	},

	// ################################################# SKILLS
	{
		names: ['setskill'],
		section: 'SKILLS',
		line: 4097,
		kind: 'core',
		returns: false,
		usage: 'skill:S [, value:i=0] [, caption:s=skill]',
		run(P) {
			const skill = P.params();
			let skillval = 0;
			let caption = skill;
			if (P.parse_comma(0)) skillval = Int(P.param());
			if (P.parse_comma(0)) caption = P.param();
			// set_skill(skill$,value,caption$)
			const tx = skill_find(P, skill);
			if (tx) {
				tx.value = istr(skillval);
				if (caption !== '') tx.stuff = caption;
			} else {
				P.tx.add({ mode: 5, key: skill, value: istr(skillval), stuff: caption });
			}
		}
	},
	{
		names: ['incskill'],
		section: 'SKILLS',
		line: 4106,
		kind: 'core',
		returns: false,
		usage: 'skill:S [, value:i=1] [, caption:s=skill]',
		run(P) {
			const skill = P.params();
			let skillval = 1;
			let caption = skill;
			if (P.parse_comma(0)) skillval = Int(P.param());
			if (P.parse_comma(0)) caption = P.param();
			// inc_skill(skill$,modify,caption$)
			const tx = skill_find(P, skill);
			if (tx) {
				tx.value = istr(Int(tx.value) + skillval);
				// quirk: the caption is always overwritten, so without a caption parameter it is reset to the skill key
				tx.stuff = caption;
			} else {
				P.tx.add({ mode: 5, key: skill, value: istr(skillval), stuff: caption });
			}
		}
	},
	{
		names: ['gotskill'],
		section: 'SKILLS',
		line: 4115,
		kind: 'core',
		returns: true,
		usage: 'skill:S',
		run(P) {
			const skill = P.params();
			// quirk/bug: calls free_skill() instead of got_skill(), so asking for a skill deletes it
			P.p_return = istr(free_skill(P, skill));
		}
	},
	{
		names: ['skillvalue'],
		section: 'SKILLS',
		line: 4120,
		kind: 'core',
		returns: true,
		usage: 'skill:S',
		run(P) {
			const skill = P.params();
			const tx = skill_find(P, skill);
			P.p_return = istr(tx ? Int(tx.value) : 0);
		}
	},
	{
		names: ['skillname'],
		section: 'SKILLS',
		line: 4125,
		kind: 'core',
		returns: true,
		usage: 'skill:s, caption:s',
		run(P) {
			const skill = P.param(); // param(), not params() like the other skill commands
			P.parse_comma(1);
			const caption = P.param();
			const tx = skill_find(P, skill);
			if (tx) tx.stuff = caption;
			P.p_return = tx ? '1' : '0';
		}
	},

	// ################################################# FREE
	{
		names: ['freediary'],
		section: 'FREE',
		line: 4135,
		kind: 'core',
		returns: false,
		usage: '',
		run(P) {
			P.tx.remove((x) => x.mode === 2);
		}
	},
	{
		names: ['free'],
		section: 'FREE',
		line: 4196,
		kind: 'host',
		returns: false,
		usage: '{"self" [, count:i=-1] | "item" [,] id:i [, count:i=-1] | "particles" | class:s [,] id:i}',
		run(P) {
			const cls = P.param();
			let classint = P.parse_getclass(cls);
			if ((classint === -1 && P.p_env_class === Cclass_item) || classint === Cclass_item) {
				let id: number;
				if (classint === -1) {
					classint = P.p_env_class;
					id = P.p_env_id;
				} else {
					P.parse_comma(0); // quirk: comma optional, no error when it is missing
					id = Int(P.param());
				}
				let count = -1;
				if (P.parse_comma(0)) count = Int(P.param());
				P.host.cmd_free(P, cls, classint, id, count);
			} else if (classint === 0) {
				// only "particles" does something; any other unknown class is silently ignored
				P.host.cmd_free(P, cls, 0, 0, undefined);
			} else if (classint !== -1) {
				P.parse_comma(0); // quirk: comma optional
				const id = Int(P.param());
				P.host.cmd_free(P, cls, classint, id, undefined);
			} else {
				P.host.cmd_free(P, cls, -1, -1, undefined); // self
			}
		}
	},
	{
		names: ['freestate'],
		section: 'FREE',
		line: 4235,
		kind: 'host',
		returns: false,
		usage: `${CLASSID} [, state:s]`,
		run(P) {
			const [classint, id] = classid(P);
			if (P.parse_comma(0)) {
				const state = P.param();
				const stateint = P.parse_getstate(state);
				if (stateint !== 0) {
					if (P.host.parent_con(classint, id)) P.host.cmd_freestate(P, classint, id, stateint);
					else P.parse_error('object', id);
				}
			} else {
				P.host.cmd_freestate(P, classint, id, undefined);
			}
		}
	},
	{
		names: ['freeskill'],
		section: 'FREE',
		line: 4266,
		kind: 'core',
		returns: false,
		usage: 'skill:s',
		run(P) {
			const skill = P.param(); // param(), not params()
			free_skill(P, skill);
		}
	},
	{
		names: ['freestored'],
		section: 'FREE',
		line: 4272,
		kind: 'host',
		returns: false,
		usage: `${CLASSID} [, typ:s="all" [, count:i=-1]]`,
		run(P) {
			const [classint, id] = classid(P);
			let typstr: string;
			if (P.parse_comma(0)) typstr = P.param();
			else typstr = 'all';
			let count = -1; // "all" passes a literal -1 to free_item
			if (typstr !== 'all') {
				if (P.parse_comma(0)) count = Int(P.param());
			}
			P.host.cmd_freestored(P, classint, id, typstr, count);
		}
	},
	{
		names: ['freebutton'],
		section: 'FREE',
		line: 4315,
		kind: 'host',
		returns: false,
		usage: 'id:i',
		run(P) {
			const id = Int(P.param());
			if (id >= 0 && id < 10) P.host.cmd_freebutton(P, id);
			else P.parse_error('Button ID between 0 and 9 expected!');
		}
	},
	{
		names: ['freetext'],
		section: 'FREE',
		line: 4324,
		kind: 'host',
		returns: false,
		usage: 'id:i',
		run(P) {
			const id = Int(P.param());
			// quirk: "id<19" although in_sitxt has 20 slots and the message says 0..19, so text 19 can never be freed
			if (id >= 0 && id < 19) P.host.cmd_freetext(P, id);
			else P.parse_error('Interface Text ID between 0 and 19 expected!');
		}
	}
];
