/**
 * includes/game_changeday.bb: what happens when a day ends: growth, spawning
 * and health changes of objects, units and items, the weather of the new day
 * and the spawn control infos.
 */
import { EntityX, EntityY, EntityZ, MoveEntity, RotateEntity } from '../bb3d';
import { Float, Int, Rand, Rnd, f32 } from '../blitz';
import { Cclass_item, Cclass_object, Cpm_out, Cstate_invulnerability } from './consts';
import {
	Ditem_health,
	Ditem_healthchange,
	Dobject_growtime,
	Dobject_healthchange,
	Dobject_spawn,
	Dunit_healthchange
} from './defs_arrays';
import { e_environment_setweather } from './e_environment';
import { split } from './functions';
import { info_spawncontrol } from './handle_infos';
import { countstored_items, free_item, set_item, store_item } from './handle_items';
import { damage_object, grow_object } from './handle_objects';
import { get_state } from './handle_states';
import { free_unit, health_unit } from './handle_units';
import { parse_globalevent } from './parser_functions';
import { G } from './state';
import { After, First, Tinfo, Titem, Tobject, Tunit } from './types';

//############################################ GAME CHANGEDAY

//### Change Day
/** Function game_cd() */
export function game_cd(): void {
	let Tinfo_: Tinfo | null = null;
	//Event
	parse_globalevent('changeday');

	//Objects
	for (G.TCobject = First(Tobject); G.TCobject !== null; G.TCobject = After(Tobject, G.TCobject)) {
		game_cd_object();
	}
	//Units
	for (G.TCunit = First(Tunit); G.TCunit !== null; G.TCunit = After(Tunit, G.TCunit)) {
		game_cd_unit();
	}
	//Items
	for (G.TCitem = First(Titem); G.TCitem !== null; G.TCitem = After(Titem, G.TCitem)) {
		game_cd_item();
	}

	//Weather
	switch (G.map_climate) {
		case 0:
			if (Rand(1, 100) <= G.map_rainratio) {
				e_environment_setweather(1);
			} else {
				e_environment_setweather(0);
			}
			break;
		case 1:
			if (Rand(1, 100) <= G.map_snowratio) {
				e_environment_setweather(2);
			} else {
				e_environment_setweather(0);
			}
			break;
		case 2:
			e_environment_setweather(0);
			break;
		case 3:
			e_environment_setweather(1);
			break;
		case 4:
			e_environment_setweather(2);
			break;
		case 5:
			e_environment_setweather(3);
			break;
	}

	//Spawn Control
	for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
		if (Tinfo_.typ === 45) {
			info_spawncontrol(Tinfo_);
		}
	}
}

//### Objects
/** Function game_cd_object() */
export function game_cd_object(): void {
	let s_item = 0;
	let s_rate = 0;
	let s_xzr = 0;
	let s_yr = 0;
	let s_yo = 0;
	let s_limit = 0;
	let s_count = 0;
	//Grow
	if (G.TCobject!.daytimer < 0) {
		//Grow
		if (Dobject_growtime(G.TCobject!.typ) > 0) {
			G.TCobject!.daytimer = G.TCobject!.daytimer + 1;
			grow_object(G.TCobject);
		}
	} else {
		//Spawn Stuff
		if (Dobject_spawn(G.TCobject!.typ) !== '') {
			//Increase Daytimer
			G.TCobject!.daytimer = G.TCobject!.daytimer + 1;
			//Get Spawn Values
			split(Dobject_spawn(G.TCobject!.typ));
			s_item = Int(G.splits[0]);
			s_rate = Int(G.splits[1]);
			s_xzr = Float(G.splits[2]);
			s_yr = Float(G.splits[3]);
			s_yo = Float(G.splits[4]);
			s_limit = Int(G.splits[5]);
			s_count = Int(G.splits[6]);
			//Spawn?
			if (G.TCobject!.daytimer >= s_rate) {
				G.TCobject!.daytimer = 0;
				//Limit not reached?
				if (countstored_items(Cclass_object, G.TCobject!.id, s_item, 1) < s_limit) {
					//Create Item
					set_item(-1, s_item, 0, 0, 0, s_count);
					//Store Item
					store_item(
						G.TCitem!.id,
						Cclass_object,
						G.TCobject!.id,
						Cpm_out,
						EntityX(G.TCobject!.h),
						f32(f32(EntityY(G.TCobject!.h) + Rnd(-s_yr, s_yr)) + s_yo),
						EntityZ(G.TCobject!.h)
					);
					RotateEntity(G.TCitem!.h, 0, Rand(360), 0);
					MoveEntity(G.TCitem!.h, 0, 0, Rnd(f32(s_xzr / 2.5), s_xzr));
					RotateEntity(G.TCitem!.h, -90, Rand(360), 0);
				}
			}
		}
		//Change Health
		if (Dobject_healthchange(G.TCobject!.typ) !== 0) {
			if (Dobject_healthchange(G.TCobject!.typ) < 0) {
				//Decrease Health
				if (get_state(Cstate_invulnerability, Cclass_object, G.TCobject!.id) === 0) {
					G.TCobject!.health = f32(G.TCobject!.health + Dobject_healthchange(G.TCobject!.typ));
					if (G.TCobject!.health <= 0) {
						damage_object(0, 1);
					}
				}
			} else {
				//Increase Health
				G.TCobject!.health = f32(G.TCobject!.health + Dobject_healthchange(G.TCobject!.typ));
				if (G.TCobject!.health > G.TCobject!.health_max) {
					G.TCobject!.health = G.TCobject!.health_max;
				}
			}
		}
	}
}

//### Units
/** Function game_cd_unit() */
export function game_cd_unit(): void {
	//Remove dead Units
	if (G.TCunit!.health <= 0) {
		if (G.TCunit!.id >= 100) {
			free_unit(G.TCunit!.id);
		}
		//Change Health
	} else {
		health_unit(Dunit_healthchange(G.TCunit!.typ));
	}
}

//### Items
/** Function game_cd_item() */
export function game_cd_item(): void {
	//Change Health
	if (G.TCitem!.parent_class === 0) {
		if (Ditem_healthchange(G.TCitem!.typ) !== 0) {
			if (Ditem_healthchange(G.TCitem!.typ) < 0) {
				//Decrease Health
				if (get_state(Cstate_invulnerability, Cclass_item, G.TCitem!.id) === 0) {
					G.TCitem!.health = f32(G.TCitem!.health + Ditem_healthchange(G.TCitem!.typ));
					if (G.TCitem!.health <= 0) {
						free_item(G.TCitem!.id);
					}
				}
			} else {
				//Increase Health
				G.TCitem!.health = f32(G.TCitem!.health + Ditem_healthchange(G.TCitem!.typ));
				if (G.TCitem!.health > Ditem_health(G.TCitem!.typ)) {
					G.TCitem!.health = Ditem_health(G.TCitem!.typ);
				}
			}
		}
	}
}
