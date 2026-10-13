import { Float, Int, Trim, split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, constName, ftoa, parseDefParam, parseDefVar, sysFiles, type DefParam } from './_helpers';
import { Cmat_flesh, get_material } from './constants';
import { DefinitionError, type FindDef } from './objects';

/**
 * Unit definitions (sys/units*.inf). Ported from load_units() in
 * includes/load_units.bb; field names follow the Dunit_* arrays.
 */

/** Cunit_count_limit from includes/load_game.bb */
export const Cunit_count_limit = 500;

/** One Dunit_ani_* pair plus the frame range it was extracted from. */
export interface UnitAni {
	/** Dunit_ani_*(i,0) */
	speed: number;
	/**
	 * Dunit_ani_*(i,1): the value ExtractAnimSeq returns, i.e. the number of
	 * sequences extracted so far from the model handle. load_res shares one
	 * handle between all units with the same model path, so the count runs
	 * across units. 0 when the property was never set.
	 */
	seq: number;
	/** First and last frame passed to ExtractAnimSeq. */
	f1: number;
	f2: number;
}

export interface UnitDef {
	id: number;
	/** Scripting constant names set with "const=" (leading # stripped). */
	consts: string[];
	name: string;
	icon: string;
	model: string;
	size: [number, number, number];
	color: [number, number, number];
	fx: number;
	autofade: number;
	alpha: number;
	shininess: number;
	col: number;
	colxr: number;
	colyr: number;
	mat: number;
	health: number;
	healthchange: number;
	/** Maximum storable food/water (hunger/thirst) */
	store: number;
	maxweight: number;
	gt: number;
	/** [mode, x, y, z]; mode 0 = random position, 1 = fixed offsets */
	state: [number, number, number, number];
	ani_idle1: UnitAni;
	ani_idle2: UnitAni;
	ani_idle3: UnitAni;
	ani_move: UnitAni;
	ani_attack: UnitAni;
	ani_use: UnitAni;
	ani_die: UnitAni;
	ani_spcl: UnitAni;
	loopmoveani: number;
	/** Sound set name; the original calls load_soundset() on it. */
	sfx: string;
	/** ai_getbehaviour() of the "behaviour=" value */
	behaviour: number;
	/** Dunit_searchratio: declared but never set by the loader */
	searchratio: number;
	speed: number;
	tspeed: number;
	eyes: number;
	damage: number;
	range: number;
	attackrange: number;
	/** Dunit_territory: declared but never set by the loader */
	territory: number;
	driveoffset: number;
	/** Script lines joined with SEP_LINE. Dunit_scripto is a copy; Dunit_scriptk is preparse_string() of it. */
	script: string;
	/** 0 normal, 1 water surface (set by behaviour "watercraft") */
	align: number;
	/** Dunit_v$: "acceleration,friction,steering,maxdepth,flyspeed" */
	v: string;
	descr: string;
	ined: number;
	group: string;
	/** Tfind entries with class=Cclass_unit ("loot="); ratio, min and reqtyp stay 0. */
	loot: FindDef[];
	params: DefParam[];
	/** Raw "var=" declarations; see parseDefVar. */
	vars: string[];
}

export interface UnitDefs {
	byId: Map<number, UnitDef>;
	/**
	 * Index 0 of the Dunit_* arrays: receives properties that appear before the
	 * first "id=", and the player values cached from unit 1 after loading
	 * (speed, damage, attackrange, maxweight, mat).
	 */
	zero: UnitDef;
	/** unit_count: number of "id=" lines read */
	count: number;
	/** unit_count_e: named units with editor<>0 */
	countEditor: number;
	/** Cunit_count the definitions were loaded with */
	limit: number;
	/** con_add() error lines the original prints when set_debug is on */
	warnings: string[];
}

/** The name table of ai_getbehaviour() in includes/ai_units.bb. */
const AI_BEHAVIOURS: Record<string, number> = {
	'': 0,
	player: 0,
	normal: 1,
	animal: 1,
	raptor: 2,
	predator: 2,
	standandsnap: 3,
	idle: 4,
	idleturn: 5,
	standandshoot: 6,
	monkey: 7,
	shy: 8,
	plague: 9,
	landbird: 10,
	crab: 200,
	amphibian: 201,
	fish: 300,
	circlingfish: 301,
	predatorfish: 302,
	deepseafish: 303,
	bird: 400,
	circlingbird: 401,
	predatorbird: 402,
	flyinginsect: 404,
	highbird: 405,
	lowbird: 406,
	landskybird: 407,
	killerbird: 408,
	vehicle: 500,
	watercraft: 501,
	aircraft: 502
};

/** ai_getbehaviour(): 0 for unknown names (the original also logs those when set_debug is on). */
export function ai_getbehaviour(behaviour: string): number {
	const name = behaviour.toLowerCase();
	return Object.hasOwn(AI_BEHAVIOURS, name) ? AI_BEHAVIOURS[name] : 0;
}

export async function loadUnits(vfs: Vfs, Cunit_count = 100): Promise<UnitDefs> {
	const defs: UnitDefs = {
		byId: new Map(),
		zero: blankUnitDef(0),
		count: 0,
		countEditor: 0,
		limit: Cunit_count,
		warnings: []
	};
	let d = defs.zero;

	// Vehicle values are variables of load_units() itself: "id=" resets them,
	// each vehicle property rebuilds Dunit_v$ from all five.
	let acceleration = 0;
	let friction = 0;
	let steering = 0;
	let maxd = 0;
	let flyspeed = 0;
	const vehicle = () =>
		`${ftoa(acceleration)},${ftoa(friction)},${steering},${maxd},${ftoa(flyspeed)}`;

	// ExtractAnimSeq(Dunit_modelh(i),f1,f2) return values per model handle
	const animSeqs = new Map<string, number>();
	const ani = (val: string): UnitAni => {
		const s = split(val, ',', 2);
		const f1 = Int(Trim(s[0]));
		const f2 = Int(Trim(s[1]));
		const speed = Float(Trim(s[2]));
		const seq = (animSeqs.get(d.model) ?? 0) + 1;
		animSeqs.set(d.model, seq);
		return { speed, seq, f1, f2 };
	};

	for (const file of sysFiles(vfs, 'units')) {
		const stream = await InfStream.open(vfs, `sys\\${file}`);
		for (let p = stream.next(); p; p = stream.next()) {
			const { key, val } = p;
			switch (key) {
				case 'id': {
					defs.count++;
					const i = Int(val);
					if (i < 1 || i > Cunit_count) {
						throw new DefinitionError(`ID between 1 and ${Cunit_count} expected!`);
					}
					const prev = defs.byId.get(i);
					if (prev && prev.name !== '') {
						throw new DefinitionError(`Unit with ID ${i} is already defined as '${prev.name}'!`);
					}
					d = prev ?? blankUnitDef(i);
					defs.byId.set(i, d);
					d.size = [1, 1, 1];
					d.color = [255, 255, 255];
					d.alpha = 1;
					d.autofade = 500;
					d.col = 1;
					d.colxr = 1;
					d.colyr = 1;
					d.health = 5;
					d.store = 100;
					d.mat = Cmat_flesh;
					d.damage = 1;
					d.maxweight = 100000;
					d.state[0] = 1;
					d.speed = 2;
					d.tspeed = 2;
					d.range = 300;
					d.attackrange = 50;
					d.driveoffset = 30;
					d.ined = 1;
					acceleration = Math.fround(0.03);
					friction = Math.fround(0.04);
					steering = 2;
					maxd = 3;
					flyspeed = 3;
					d.v = vehicle();
					break;
				}
				case 'const': {
					const n = constName(val);
					if (n !== undefined) d.consts.push(n);
					break;
				}
				case 'name':
					d.name = val;
					break;
				case 'icon':
					d.icon = val; // load_res(Dunit_icon$(i),Cres_image,0)
					break;
				case 'model':
					d.model = val; // load_res(Dunit_model$(i),Cres_animmesh); "Unable to load " error if that fails
					break;
				case 'x':
					d.size[0] = Float(val);
					break;
				case 'y':
					d.size[1] = Float(val);
					break;
				case 'z':
					d.size[2] = Float(val);
					break;
				case 'scale':
					d.size = [Float(val), Float(val), Float(val)];
					break;
				case 'r':
					d.color[0] = Int(val);
					break;
				case 'g':
					d.color[1] = Int(val);
					break;
				case 'b':
					d.color[2] = Int(val);
					break;
				case 'color': {
					const s = split(val, ',', 2);
					d.color = [Int(Trim(s[0])), Int(Trim(s[1])), Int(Trim(s[2]))];
					break;
				}
				case 'fx':
					d.fx = Int(val);
					break;
				case 'autofade':
					d.autofade = Int(val);
					break;
				case 'alpha':
					d.alpha = Float(val);
					break;
				case 'shine':
					d.shininess = Float(val);
					break;
				case 'col':
					d.col = Int(val);
					break;
				case 'colxr':
					d.colxr = Float(val);
					break;
				case 'colyr':
					d.colyr = Float(val);
					break;
				case 'mat':
					d.mat = get_material(val);
					break;
				case 'health':
					d.health = Float(val);
					d.healthchange = Math.fround(d.health / 5);
					break;
				case 'healthchange':
					d.healthchange = Float(val);
					break;
				case 'store':
					d.store = Float(val);
					break;
				case 'maxweight':
					d.maxweight = Int(val);
					break;
				case 'gt':
					d.gt = Int(val);
					break;
				case 'state':
					if (val === 'random') {
						d.state[0] = 0;
					} else {
						const s = split(val, ',', 2);
						d.state = [1, Float(Trim(s[0])), Float(Trim(s[1])), Float(Trim(s[2]))];
					}
					break;
				case 'ani_idle1':
					d.ani_idle1 = ani(val);
					break;
				case 'ani_idle2':
					d.ani_idle2 = ani(val);
					break;
				case 'ani_idle3':
					d.ani_idle3 = ani(val);
					break;
				case 'ani_move':
					d.ani_move = ani(val);
					break;
				case 'ani_attack':
					d.ani_attack = ani(val);
					break;
				case 'ani_use':
					d.ani_use = ani(val);
					break;
				case 'ani_die':
					d.ani_die = ani(val);
					break;
				case 'ani_special':
					d.ani_spcl = ani(val);
					break;
				case 'loopmoveani':
					d.loopmoveani = Int(val);
					break;
				case 'sfx':
					d.sfx = val; // load_soundset(val$)
					break;
				case 'behaviour':
					d.behaviour = ai_getbehaviour(val);
					// ai_getbehaviour() logs unknown names; the loader logs every 0 result again
					if (!Object.hasOwn(AI_BEHAVIOURS, val.toLowerCase())) {
						defs.warnings.push(`ERROR: Invalid unit behaviour '${val}'`);
					}
					if (d.behaviour === 0) defs.warnings.push(`ERROR: Invalid unit behaviour '${val}'`);
					if (d.behaviour === 501) d.align = 1;
					break;
				case 'loot': {
					const s = split(val, ',', 1);
					const f: FindDef = {
						typ: Int(Trim(s[0])),
						ratio: 0,
						max: Int(Trim(s[1])),
						min: 0,
						reqtyp: 0
					};
					if (f.max <= 1) f.max = 1;
					d.loot.push(f);
					break;
				}
				case 'script':
					if (val === 'start') d.script += stream.readBlock('script=end');
					break;
				case 'speed':
					d.speed = Float(val);
					break;
				case 'turnspeed':
					d.tspeed = Float(val);
					break;
				case 'eyes':
					d.eyes = Float(val);
					break;
				case 'damage':
					d.damage = Float(val);
					break;
				case 'range':
					d.range = Int(val);
					break;
				case 'attackrange':
					d.attackrange = Int(val);
					break;
				case 'rideoffset':
					d.driveoffset = Float(val);
					break;
				case 'acceleration':
					acceleration = Float(val);
					d.v = vehicle();
					break;
				case 'friction':
					friction = Float(val);
					d.v = vehicle();
					break;
				case 'steering':
					steering = Int(val);
					d.v = vehicle();
					break;
				case 'maxdepth':
					maxd = Int(val);
					d.v = vehicle();
					break;
				case 'flyspeed':
					flyspeed = Float(val);
					d.v = vehicle();
					break;
				case 'description':
					if (val === 'start') d.descr += stream.readBlock('description=end');
					break;
				case 'editor':
					d.ined = Int(val);
					break;
				case 'param':
					d.params.push(parseDefParam(val));
					break;
				case 'var':
					parseDefVar(val); // defvar_set(Cclass_unit,i): raises its error here
					d.vars.push(val);
					break;
				case 'group':
					d.group = val; // group_set$(Cclass_unit,val$)
					break;
				default:
					throw new DefinitionError(`Invalid UNIT Property '${key}'`);
			}
		}
	}

	// "Cache Player Stuff"
	const player = defs.byId.get(1);
	defs.zero.speed = player?.speed ?? 0;
	defs.zero.damage = player?.damage ?? 0;
	defs.zero.attackrange = player?.attackrange ?? 0;
	defs.zero.maxweight = player?.maxweight ?? 0;
	defs.zero.mat = player?.mat ?? 0;

	for (const u of [defs.zero, ...defs.byId.values()]) {
		if (u.name !== '' && u.ined !== 0) defs.countEditor++;
	}

	// The check after the first load_units() call. Without sys\units.inf the
	// original copies units.template into the mod (mod_copy_template) and
	// loads again; a read-only Vfs cannot, so both cases raise the error.
	if (defs.count === 0) {
		throw new DefinitionError('Unit with ID 1 must be defined (used as player unit)!');
	}
	return defs;
}

function blankAni(): UnitAni {
	return { speed: 0, seq: 0, f1: 0, f2: 0 };
}

/** A Dunit_* slot as Dim leaves it; "id=" then sets the documented defaults. */
function blankUnitDef(id: number): UnitDef {
	return {
		id,
		consts: [],
		name: '',
		icon: '',
		model: '',
		size: [0, 0, 0],
		color: [0, 0, 0],
		fx: 0,
		autofade: 0,
		alpha: 0,
		shininess: 0,
		col: 0,
		colxr: 0,
		colyr: 0,
		mat: 0,
		health: 0,
		healthchange: 0,
		store: 0,
		maxweight: 0,
		gt: 0,
		state: [0, 0, 0, 0],
		ani_idle1: blankAni(),
		ani_idle2: blankAni(),
		ani_idle3: blankAni(),
		ani_move: blankAni(),
		ani_attack: blankAni(),
		ani_use: blankAni(),
		ani_die: blankAni(),
		ani_spcl: blankAni(),
		loopmoveani: 0,
		sfx: '',
		behaviour: 0,
		searchratio: 0,
		speed: 0,
		tspeed: 0,
		eyes: 0,
		damage: 0,
		range: 0,
		attackrange: 0,
		territory: 0,
		driveoffset: 0,
		script: '',
		align: 0,
		v: '',
		descr: '',
		ined: 0,
		group: '',
		loot: [],
		params: [],
		vars: []
	};
}
