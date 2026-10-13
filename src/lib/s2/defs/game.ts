import { Float, Int, Trim, split } from '../blitz';
import type { Vfs } from '../io/Vfs';
import { InfStream, sysFiles } from './_helpers';
import { Citem_count_limit } from './items';
import { Cobject_count_limit, DefinitionError } from './objects';
import { Cunit_count_limit } from './units';

/**
 * Game settings of a mod (sys/game*.inf). Ported from load_game() in
 * includes/load_game.bb. Fields are the game_* globals without the prefix;
 * the three count limits keep their original names.
 */

export { Cobject_count_limit, Cunit_count_limit, Citem_count_limit };

export interface GameDef {
	healthsystem: number;
	/** game_exh_*#(0..2) */
	exh_move: [number, number, number];
	exh_swim: [number, number, number];
	exh_jump: [number, number, number];
	exh_attack: [number, number, number];
	exh_damage: [number, number, number];
	divetime: number;
	divedamage: number;
	/** Path given to "default_itemmodel="; the original loads it with load_res(val$,Cres_mesh). */
	defaultitemmodel: string;
	projectiletimeout: number;
	firerange: number;
	digtime: number;
	fishtime: number;
	jumptime: number;
	rainratio: number;
	snowratio: number;
	jumpfac: number;
	/** Copies of jumptime/jumpfac that "jumptime="/"jumpfactor=" set along with them */
	jumptime2: number;
	jumpfac2: number;
	falltime: number;
	falldamage: number;
	fallminy: number;
	fallmaxy: number;
	scriptlooptimeout: number;
	/** Script lines joined with SEP_LINE; game_scriptk is preparse_string() of it. */
	script: string;
	/** 1 once any "scriptkey=" was read */
	scriptkeys: number;
	/** game_scriptkeyn$(0..20) */
	scriptkeyn: string[];
	combiscreen: number;
	Cobject_count: number;
	Cunit_count: number;
	Citem_count: number;
	m_adventure: number;
	m_random: number;
	m_loadsave: number;
	m_singleplayer: number;
	m_multiplayer: number;
	m_editor: number;
	m_credits: number;
	waverate: number;
	minwavespace: number;
	firelightsize: number;
	firelightbrightness: number;
	/** game_tercol(i,j): i = 0..8 (three r,g,b triples), j = 0 normal, 1 desert, 2 snow, 3 swamp */
	tercol: number[][];
	showemptybuildinggroups: number;
	/** "gore=" writes the settings global set_gore; undefined when the property is absent. */
	set_gore?: number;
}

export function defaultGameDef(): GameDef {
	return {
		healthsystem: 0,
		exh_move: [0, 0, 0],
		exh_swim: [0, 0, 0],
		exh_jump: [0, 0, 0],
		exh_attack: [0, 0, 0],
		exh_damage: [0, 0, 0],
		divetime: 8000,
		divedamage: 1,
		defaultitemmodel: '',
		projectiletimeout: 15 * 1000,
		firerange: 50,
		digtime: 2500,
		fishtime: 2500,
		jumptime: 450,
		rainratio: 15,
		snowratio: 45,
		jumpfac: Math.fround(1.7),
		jumptime2: 450,
		jumpfac2: Math.fround(1.7),
		falltime: 850,
		falldamage: 1000,
		fallminy: 100,
		fallmaxy: 3000,
		scriptlooptimeout: 5000,
		script: '',
		scriptkeys: 0,
		scriptkeyn: new Array<string>(21).fill(''),
		combiscreen: 2,
		Cobject_count: 255,
		Cunit_count: 100,
		Citem_count: 255,
		m_adventure: 1,
		m_random: 1,
		m_loadsave: 1,
		m_singleplayer: 1,
		m_multiplayer: 1,
		m_editor: 1,
		m_credits: 1,
		waverate: 5000,
		minwavespace: 300,
		firelightsize: 50,
		firelightbrightness: 150,
		tercol: Array.from({ length: 9 }, () => [0, 0, 0, 0]),
		showemptybuildinggroups: 0
	};
}

export async function loadGame(vfs: Vfs): Promise<GameDef> {
	const g = defaultGameDef();

	const triple = (val: string): [number, number, number] => {
		const s = split(val);
		return [Float(s[0]), Float(s[1]), Float(s[2])];
	};
	const tercol = (val: string, j: number) => {
		const s = split(val);
		for (let i = 0; i <= 8; i++) g.tercol[i][j] = Int(s[i]);
	};
	const limit = (name: string, val: string, max: number): number => {
		if (Int(val) < 0) val = '1';
		if (Int(val) > max) {
			throw new DefinitionError(`'${name}' is limited to a maximum of ${max}`);
		}
		return Int(val);
	};

	for (const file of sysFiles(vfs, 'game')) {
		const stream = await InfStream.open(vfs, `sys\\${file}`);
		for (let p = stream.next(); p; p = stream.next()) {
			const key = p.key;
			const val = Trim(p.raw); // this loader uses Trim, not trimspace
			switch (key) {
				case 'healthsystem':
					g.healthsystem = Int(val);
					break;
				case 'exhaust_move':
					g.exh_move = triple(val);
					break;
				case 'exhaust_swim':
					g.exh_swim = triple(val);
					break;
				case 'exhaust_jump':
					g.exh_jump = triple(val);
					break;
				case 'exhaust_attack':
					g.exh_attack = triple(val);
					break;
				case 'exhausted_damage':
					g.exh_damage = triple(val);
					break;
				case 'dive_time':
					g.divetime = Int(val);
					break;
				case 'dive_damage':
					g.divedamage = Float(val);
					break;
				case 'default_itemmodel':
					// load_res(val$,Cres_mesh); failure is
					// "Unable to load <val> (default_itemmodel in sys\<file>)"
					g.defaultitemmodel = val;
					break;
				case 'projectile_lifetime':
					g.projectiletimeout = Int(val);
					break;
				case 'firerange':
					g.firerange = Int(val);
					break;
				case 'dig_time':
					g.digtime = Int(val);
					break;
				case 'fish_time':
					g.fishtime = Int(val);
					break;
				case 'jumptime':
					g.jumptime = Int(val);
					g.jumptime2 = Int(val);
					break;
				case 'jumpfactor':
					g.jumpfac = Float(val);
					g.jumpfac2 = Float(val);
					break;
				case 'falltime':
					g.falltime = Int(val);
					break;
				case 'falldamage':
					g.falldamage = Float(val);
					break;
				case 'falldamageminy':
					g.fallminy = Float(val);
					break;
				case 'falldamagemaxy':
					g.fallmaxy = Float(val);
					break;
				case 'rainratio':
					g.rainratio = Int(val);
					break;
				case 'snowratio':
					g.snowratio = Int(val);
					break;
				case 'gore':
					g.set_gore = Int(val);
					break;
				case 'waverate':
					g.waverate = Int(val);
					break;
				case 'minwavespace':
					g.minwavespace = Int(val);
					break;
				case 'combiscreen':
					g.combiscreen = Int(val);
					break;
				case 'scriptlooptimeout':
					g.scriptlooptimeout = Int(val);
					break;
				case 'script':
					if (val === 'start') g.script += stream.readBlock('script=end');
					break;
				case 'scriptkey': {
					const s = split(val, ',', 1);
					const id = Int(s[0]);
					if (id >= 0 && id <= 20) {
						g.scriptkeys = 1;
						g.scriptkeyn[id] = s[1];
					} else {
						throw new DefinitionError("'scriptkey' id between 0 and 20 expected!");
					}
					break;
				}
				case 'limit_objects':
					g.Cobject_count = limit('limit_objects', val, Cobject_count_limit);
					break;
				case 'limit_units':
					g.Cunit_count = limit('limit_units', val, Cunit_count_limit);
					break;
				case 'limit_items':
					g.Citem_count = limit('limit_items', val, Citem_count_limit);
					break;
				case 'menu_adventure':
					g.m_adventure = Int(val);
					break;
				case 'menu_random':
					g.m_random = Int(val);
					break;
				case 'menu_loadsave':
					g.m_loadsave = Int(val);
					break;
				case 'menu_singleplayer':
					g.m_singleplayer = Int(val);
					break;
				case 'menu_multiplayer':
					g.m_multiplayer = Int(val);
					break;
				case 'menu_editor':
					g.m_editor = Int(val);
					break;
				case 'menu_credits':
					g.m_credits = Int(val);
					break;
				case 'firelightsize':
					g.firelightsize = Int(val);
					break;
				case 'firelightbrightness':
					g.firelightbrightness = Int(val);
					if (g.firelightbrightness < 0) g.firelightbrightness = 0;
					if (g.firelightbrightness > 255) g.firelightbrightness = 255;
					break;
				case 'terrain_color_normal':
					tercol(val, 0);
					break;
				case 'terrain_color_desert':
					tercol(val, 1);
					break;
				case 'terrain_color_snow':
					tercol(val, 2);
					break;
				case 'terrain_color_swamp':
					tercol(val, 3);
					break;
				case 'showemptybuildinggroups':
					g.showemptybuildinggroups = Int(val);
					break;
				default:
					throw new DefinitionError(`Invalid GAME Property '${key}'`);
			}
		}
	}
	return g;
}
