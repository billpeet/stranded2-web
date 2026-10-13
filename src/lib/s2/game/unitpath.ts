/**
 * includes/unitpath.bb: unit paths. A unit path is a set of Tup objects of one
 * unit: the controller (mode=0, info=number of the node to go to next) and the
 * nodes (mode=1,2,3..., info=id of the info entity to walk to).
 */
import { DeltaYaw, EntityDistance, EntityX, EntityYaw, EntityZ, MoveEntity, RotateEntity } from '../bb3d';
import { Instr, Rnd, SEP_LINE, Str, f32 } from '../blitz';
import { ai_ani, ai_center } from './ai_units';
import { con_add } from './console';
import { Cbmpf_green, Cbmpf_red, Cclass_info, Cclass_unit, Cp_rwave, ani_move } from './consts';
import { Dunit_behaviour, Dunit_script, Dunit_scriptk, Dunit_speed } from './defs_arrays';
import { e_tery } from './e_environment';
import { dist, zerofill } from './functions';
import { con_info } from './handle_infos';
import { con_unit, unit_speed } from './handle_units';
import { parse_sel, parse_task, set_parsecache } from './parser_functions';
import { p_add } from './particles';
import { G } from './state';
import { After, Delete, First, New, Tinfo, Tunit, Tup, isNull } from './types';

//############################################ UNIT PATH

/** Function up_setup(unit) */
export function up_setup(unit: number): void {
	let Tup_: Tup | null = null;

	//Delete old nodes/controller
	for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
		if (Tup_.unit === unit) {
			Delete(Tup, Tup_);
		}
	}
	//Create
	Tup_ = New(Tup);
	Tup_.unit = unit;
	Tup_.info = 1;
	Tup_.mode = 0;
}

/** Function up_addnode(unit,info) */
export function up_addnode(unit: number, info: number): void {
	let c = 0;
	let Tup_: Tup | null = null;

	//Count existing nodes
	c = 0;
	for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
		if (Tup_.unit === unit) {
			c = c + 1;
		}
	}
	//Create
	Tup_ = New(Tup);
	Tup_.unit = unit;
	Tup_.info = info;
	Tup_.mode = c;
	//Limit
	if (c > 255) {
		if (G.set_debug) {
			con_add('ERROR: Unitpath nodes are limited to 256 per unit!', Cbmpf_red);
		}
		Delete(Tup, Tup_);
	}
	//con_add("unitpath add "+unit+" -> "+info)
}

/** Function up_free(unit) */
export function up_free(unit: number): void {
	let Tup_: Tup | null = null;

	for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
		if (Tup_.unit === unit) {
			Delete(Tup, Tup_);
		}
	}
}

/** Function up_controlled(unit) */
export function up_controlled(unit: number): number {
	let Tup_: Tup | null = null;

	for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
		if (Tup_.unit === unit) {
			if (Tup_.mode === 0) {
				return 1;
			}
		}
	}
	return 0;
}

/** Function up_update() */
export function up_update(): void {
	let Troot: Tup | null = null;
	let found = 0;
	let Tn: Tup | null = null;
	let predist = 0;
	let speed = 0;
	let angle = 0;
	let postdist = 0;
	let eventname = '';
	let c = 0;
	let Tend: Tup | null = null;
	let delid = 0;
	let Tdel: Tup | null = null;

	if (G.g_unpaused === 1) {
		//Go trough Unit Path Controllers
		for (Troot = First(Tup); Troot !== null; Troot = After(Tup, Troot)) {
			if (Troot.mode === 0) {
				//Con Unit?
				if (con_unit(Troot.unit)) {
					//Find Node
					found = 0;
					for (Tn = First(Tup); Tn !== null; Tn = After(Tup, Tn)) {
						if (Tn.unit === Troot.unit) {
							if (Tn.mode === Troot.info) {
								found = 1;
								break;
							}
						}
					}

					//Node found
					if (found === 1) {
						//Con Info?
						if (con_info(Tn!.info)) {
							//Animation
							ai_ani(ani_move);
							G.TCunit!.ai_mode = -1;
							G.TCunit!.ai_duration = 1000;
							G.TCunit!.ai_timer = G.gt;

							//Cache
							predist = EntityDistance(G.TCunit!.h, G.TCinfo!.h);
							if (G.TCunit!.states === 1) {
								speed = f32(unit_speed() * G.f);
							} else {
								speed = f32(Dunit_speed(G.TCunit!.typ) * G.f);
							}

							if (predist > 100) {
								angle = f32(DeltaYaw(G.TCunit!.h, G.TCinfo!.h) / 5);
							} else {
								angle = DeltaYaw(G.TCunit!.h, G.TCinfo!.h);
							}

							//Move to Info
							switch (Dunit_behaviour(G.TCunit!.typ)) {
								//Watercraft
								case 501:
									RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + angle), 0);
									MoveEntity(G.TCunit!.h, 0, 0, speed);
									if (e_tery(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h)) > -1) {
										MoveEntity(G.TCunit!.h, 0, 0, -speed);
									} else {
										if (G.in_gt100go) {
											p_add(EntityX(G.TCunit!.h), 1, EntityZ(G.TCunit!.h), Cp_rwave, Rnd(10, 20), Rnd(0.6, 0.9));
										}
									}
									break;

								//Normal Movement
								default:
									RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) + angle), 0);
									MoveEntity(G.TCunit!.h, 0, 0, speed);
									break;
							}

							//Info Node reached?
							postdist = EntityDistance(G.TCunit!.h, G.TCinfo!.h);
							if (predist < postdist) {
								if (
									dist(EntityX(G.TCunit!.h), EntityZ(G.TCunit!.h), EntityX(G.TCinfo!.h), EntityZ(G.TCinfo!.h)) <
									f32(Dunit_speed(G.TCunit!.typ) * 50.0)
								) {
									//Event @ Unit
									if (G.set_debug === 1)
										con_add('unitpath ' + Str(Troot.unit) + ': reached node ' + Str(Troot.info) + ' @ info ' + Str(G.TCinfo!.id), Cbmpf_green);
									//con_add("reach node "+TCinfo\id+" predist: "+Int(predist#)+" postdist: "+Int(EntityDistance(TCunit\h,TCinfo\h)))
									eventname = zerofill(Str(G.TCinfo!.id), 4);
									set_parsecache(Cclass_unit, G.TCunit!.id, 'node' + eventname);
									if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'node' + eventname)) {
										parse_task(Cclass_unit, G.TCunit!.id, 'node' + eventname, 'reached by unit ' + Str(G.TCunit!.id), Dunit_script(G.TCunit!.typ));
										parse_sel(Cclass_unit, G.TCunit!.id, 'node' + eventname);
									}
									//Event @ Info Node
									if (!isNull(Tinfo, G.TCinfo)) set_parsecache(Cclass_info, G.TCinfo!.id, 'reach');
									//Next Info Node!
									if (!isNull(Tup, Troot)) Troot.info = Troot.info + 1;
									//Delete Info Node
									if (!isNull(Tup, Tn)) Delete(Tup, Tn);
									//Undo Last Step
									if (!isNull(Tunit, G.TCunit)) {
										RotateEntity(G.TCunit!.h, 0, f32(EntityYaw(G.TCunit!.h) - angle), 0);
										MoveEntity(G.TCunit!.h, 0, 0, -speed);
										ai_center();
									}

									//End?
									if (!isNull(Tunit, G.TCunit)) {
										c = 0;
										for (Tend = First(Tup); Tend !== null; Tend = After(Tup, Tend)) {
											if (Tend.unit === G.TCunit!.id) {
												c = c + 1;
											}
										}
										if (c === 1) {
											if (G.set_debug === 1) con_add('unitpath ' + Str(Troot.unit) + ': end (no more nodes found)', Cbmpf_red);
											for (Tend = First(Tup); Tend !== null; Tend = After(Tup, Tend)) {
												if (Tend.unit === G.TCunit!.id) {
													Delete(Tup, Tend);
												}
											}
										}
									}
								}
							}
						} else {
							if (G.set_debug === 1)
								con_add(
									'unitpath ' + Str(Troot.unit) + ': skipping node ' + Str(Troot.info) + ' @ info ' + Str(Tn!.info) + ' (info not found)',
									Cbmpf_red
								);
							Troot.info = Troot.info + 1;
						}
						//Node not found -> delete Unit Path
					} else {
						if (G.set_debug === 1) con_add('unitpath ' + Str(Troot.unit) + ': end (no more nodes found)', Cbmpf_red);
						delid = Troot.unit;
						for (Tdel = First(Tup); Tdel !== null; Tdel = After(Tup, Tdel)) {
							if (Tdel.unit === delid) {
								Delete(Tup, Tdel);
							}
						}
					}
				} else {
					//Unit does not exist -> delete Unit Path
					if (G.set_debug === 1)
						con_add('unitpath ' + Str(Troot.unit) + ': End (units ' + Str(Troot.unit) + ' does Not exist)', Cbmpf_red);
					delid = Troot.unit;
					for (Tdel = First(Tup); Tdel !== null; Tdel = After(Tup, Tdel)) {
						if (Tdel.unit === delid) {
							Delete(Tup, Tdel);
						}
					}
				}
			}
		}
	}
}
