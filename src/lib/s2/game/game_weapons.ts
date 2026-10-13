/**
 * includes/game_weapons.bb, line-by-line port.
 */
import {
	CreatePivot,
	EntityBlend,
	EntityDistance,
	EntityOrder,
	EntityPick,
	EntityPickMode,
	EntityPitch,
	EntityRoll,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	LinePick,
	MoveEntity,
	PickedX,
	PickedY,
	PickedZ,
	PositionEntity,
	RotateEntity,
	type Handle
} from '../bb3d';
import { Float, Instr, Rand, Rnd, SEP_LINE, f32 } from '../blitz';
import { Cclass_item, Cclass_unit, Cp_attack, Cp_bubbles, Cp_fadeout, Cp_impact, Cp_rwave, Cp_smoke, Cp_splash, Cworld_useradius } from './consts';
import { Ditem_damage, Ditem_rate, Ditem_script, Ditem_scriptk, Ditem_speed, Ditem_wstate, Dunit_attackrange, Dunit_colxr, Dunit_damage, Dunit_eyes } from './defs_arrays';
import { meshline } from './functions';
import { game_damage, game_exhaust } from './game_functions';
import { free_item, get_stored_item } from './handle_items';
import { find_object, get_object } from './handle_objects';
import { attach_state } from './handle_states';
import { con_unit } from './handle_units';
import { parse_globalevent, parse_sel_event, parse_task, set_parsecache } from './parser_functions';
import { p_add } from './particles';
import { pro_add, pro_ini } from './projectiles';
import { G } from './state';
import { After, First, Titem } from './types';

//############################################ GAME Weapons

//None
/** Function game_wpn_none(player) */
export function game_wpn_none(player: number): number {
	if (con_unit(player)) {
		G.p_skipevent = 0;
		parse_globalevent('usehand');
		parse_sel_event('usehand');
		if (G.p_skipevent === 0) {
			if (G.gt - G.TCunit!.player_lastattack < 400) return 0;
			G.TCunit!.player_lastattack = G.gt;

			//Exhaust
			game_exhaust(G.game_exh_attack[0], G.game_exh_attack[1], G.game_exh_attack[2]);

			//Pick
			game_wpnfunc_pick(G.cam, Dunit_attackrange(1), Dunit_damage(1), player);
			if (G.in_pe !== null) {
				if (get_object(G.in_pe) !== -1) find_object(G.TCobject!.id);
			}
		}

		//Okay
		return 1;
	}
	return 0;
}

//Blade
/** Function game_wpn_blade(player,range#=50) */
export function game_wpn_blade(player: number, range: number = 50): number {
	let speed = 0;
	let damage = 0;

	if (con_unit(player)) {
		speed = Ditem_rate(G.TCunit!.player_weapon);
		damage = Float(Ditem_damage(G.TCunit!.player_weapon)); // Ditem_damage$ is a String array
		if (G.gt - G.TCunit!.player_lastattack < speed) return 0;
		G.TCunit!.player_lastattack = G.gt;

		//Exhaust
		game_exhaust(G.game_exh_attack[0], G.game_exh_attack[1], G.game_exh_attack[2]);

		//Pick
		game_wpnfunc_pick(G.cam, range, damage, player);
		if (G.in_pe !== null) {
			if (get_object(G.in_pe) !== -1) find_object(G.TCobject!.id);
		}

		//Okay
		return 1;
	}
	return 0;
}

//Distance
/** Function game_wpn_distance(player) */
export function game_wpn_distance(player: number): number {
	let speed = 0;
	let gotammo = 0;
	let Titem_: Titem | null = null;

	if (con_unit(player)) {
		speed = Ditem_rate(G.TCunit!.player_weapon);
		if (G.gt - G.TCunit!.player_lastattack < speed) return 0;
		G.TCunit!.player_lastattack = G.gt;

		//Ammo
		gotammo = 0;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === Cclass_unit) {
				if (Titem_.parent_id === G.TCunit!.id) {
					if (Titem_.typ === G.TCunit!.player_ammo) {
						//Decrease 1
						free_item(Titem_.id, 1);
						//Found Ammo!
						gotammo = 1;
					}
				}
			}
		}
		//Spawn Projectile
		if (gotammo) {
			pro_add(player, G.TCunit!.player_ammo, EntityPitch(G.cam), EntityYaw(G.cam));
			pro_ini();
			return 1;
		} else {
			//Noammo
			if (get_stored_item(G.g_cplayer!.player_weapon, Cclass_unit, G.g_cplayer!.id)) {
				if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'noammo')) {
					parse_task(Cclass_item, G.TCitem!.id, 'noammo', '', Ditem_script(G.TCitem!.typ));
				}
			}
			return 0;
		}
	}
	return 0;
}

//Distance (Fire)
/** Function game_wpn_distancef(player) */
export function game_wpn_distancef(player: number): number {
	let speed = 0;
	let gotammo = 0;
	let Titem_: Titem | null = null;
	let h: Handle = null;
	let i = 0;
	let water = 0;
	let target: Handle = null;
	let sx = 0;
	let sy = 0;
	let sz = 0;
	let cx = 0;
	let cy = 0;
	let cz = 0;
	let lineh: Handle = null;
	let argx = 0;
	let argy = 0;
	let argz = 0;
	let argsize = 0;
	let arga = 0;
	// quirk: "e_ter" is no global (the terrain is "ter"): a local that is always 0
	const e_ter: Handle = null;

	if (con_unit(player)) {
		speed = Ditem_rate(G.TCunit!.player_weapon);
		if (G.gt - G.TCunit!.player_lastattack < speed) return 0;
		G.TCunit!.player_lastattack = G.gt;

		//Ammo
		gotammo = 0;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === Cclass_unit) {
				if (Titem_.parent_id === G.TCunit!.id) {
					if (Titem_.typ === G.TCunit!.player_ammo) {
						//Decrease 1
						free_item(Titem_.id, 1);
						//Found Ammo!
						gotammo = 1;
					}
				}
			}
		}
		//Fire
		if (gotammo) {
			//Script Vars
			G.pv_attack_damage = f32(Float(Ditem_damage(G.g_cplayer!.player_weapon)) * Float(Ditem_damage(G.g_cplayer!.player_ammo)));
			G.pv_attack_weapon = G.g_cplayer!.player_weapon;
			G.pv_attack_ammo = G.g_cplayer!.player_ammo;

			//Start
			h = CreatePivot();
			RotateEntity(h, EntityPitch(G.cam), EntityYaw(G.cam), 0);
			PositionEntity(h, EntityX(G.TCunit!.h), f32(EntityY(G.TCunit!.h) + Dunit_eyes(G.TCunit!.typ)), EntityZ(G.TCunit!.h));
			if (G.g_drive !== 0) {
				PositionEntity(h, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
			}
			MoveEntity(h, 0, 0, f32(Dunit_colxr(G.TCunit!.typ) + 5));
			//Pick
			G.in_pe = null;
			EntityPickMode(G.env_sea2, 0);
			EntityPickMode(G.g_cplayer!.h, 0);
			G.in_pe = EntityPick(h, Ditem_speed(G.TCunit!.player_weapon));
			EntityPickMode(G.g_cplayer!.h, 2, 1);
			G.in_px = f32(PickedX());
			G.in_py = f32(PickedY());
			G.in_pz = f32(PickedZ());

			//Muzzle Smoke
			if (G.set_effects > 0) {
				for (i = 1; i <= 5; i++) {
					// exe: arguments evaluated z, size, alpha, y, x
					argz = f32(EntityZ(h) + Rnd(-3, 3));
					argsize = Rnd(5, 7);
					arga = Rnd(f32(0.15), f32(0.4));
					argy = f32(EntityY(h) + Rnd(-3, 3));
					argx = f32(EntityX(h) + Rnd(-3, 3));
					p_add(argx, argy, argz, Cp_smoke, argsize, arga);
				}
			}

			//Water
			if (EntityY(h) < 0 || G.in_py < 0) {
				water = 0;
				target = CreatePivot();
				sx = f32(EntityX(h));
				sy = f32(EntityY(h));
				sz = f32(EntityZ(h));
				PositionEntity(target, G.in_px, G.in_py, G.in_pz);
				if (EntityY(h) < 0) water = 1;
				for (i = 1; i <= 10000; i++) {
					MoveEntity(h, 0, 0, 10);
					//Over Water
					if (water === 0) {
						if (EntityY(h) < 0) {
							water = 1;
							p_add(EntityX(h), 1, EntityZ(h), Cp_rwave, Rnd(5, 10), Rnd(f32(0.9), 1.5));
							p_add(EntityX(h), 1, EntityZ(h), Cp_splash, Rnd(15, 20), 1);
							cx = f32(EntityX(h));
							cy = f32(EntityY(h));
							cz = f32(EntityZ(h));
						}
						//Under Water
					} else {
						if (Rand(2) === 1) {
							p_add(EntityX(h), EntityY(h), EntityZ(h), Cp_bubbles, Rnd(1, 3), Rnd(f32(0.3), f32(0.5)));
						}
						if (EntityY(h) > 0) {
							water = 0;
							p_add(EntityX(h), 1, EntityZ(h), Cp_rwave, Rnd(5, 10), Rnd(f32(0.9), 1.5));
							cx = f32(EntityX(h));
							cy = f32(EntityY(h));
							cz = f32(EntityZ(h));
							break;
						}
					}
					//Exit Loop
					if (EntityDistance(h, target) < 10) break;
				}
				//Line
				if (sy > 0) {
					lineh = meshline(cx, cy, cz, G.in_px, G.in_py, G.in_pz, f32(0.4));
				} else {
					if (water === 0) {
						lineh = meshline(sx, sy, sz, cx, cy, cz, f32(0.4));
					} else {
						lineh = meshline(sx, sy, sz, G.in_px, G.in_py, G.in_pz, f32(0.4));
					}
				}
				if (lineh !== null) {
					EntityBlend(lineh, 3);
					G.tmp_ph = lineh;
					p_add(0, f32(0.2), f32(0.011), Cp_fadeout);
				}

				FreeEntity(target);
			}

			//Free Pivot
			FreeEntity(h);

			//Damage
			if (G.in_pe !== null) {
				//Terrain
				// quirk: in_pe=e_ter is never true (e_ter is 0, in_pe is not): a hit on the terrain takes the "Object?" branch
				if (G.in_pe === e_ter) {
					p_add(G.in_px, G.in_py, G.in_pz, Cp_smoke, Rnd(5, 10), Rnd(f32(0.3), 1.5));
					G.pv_impact_class = 0;
					G.pv_impact_id = 0;
					G.pv_impact_kill = 0;
					G.pv_impact_num = 1;
					G.pv_impact_amount = 1;
					G.pv_impact_x = G.in_px;
					G.pv_impact_y = G.in_py;
					G.pv_impact_z = G.in_pz;
					G.pv_impact_ground = 1;
					if (get_stored_item(G.g_cplayer!.player_weapon, Cclass_unit, G.g_player)) {
						set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
						if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
							parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
						}
					}
					if (get_stored_item(G.g_cplayer!.player_ammo, Cclass_unit, G.g_player)) {
						set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
						if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
							parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
						}
					}
					//Object?
				} else {
					//State (by weapon)
					if (Ditem_wstate(G.g_cplayer!.player_weapon) !== 0) {
						attach_state(G.in_pe, Ditem_wstate(G.g_cplayer!.player_weapon));
					}
					//State (by ammo)
					if (Ditem_wstate(G.g_cplayer!.player_ammo) !== 0) {
						attach_state(G.in_pe, Ditem_wstate(G.g_cplayer!.player_ammo));
					}
					//Damage
					G.pv_impact_class = 0;
					G.pv_impact_id = 0;
					G.pv_impact_kill = 0;
					G.pv_impact_num = 1;
					G.pv_impact_amount = 1;
					G.pv_impact_x = G.in_px;
					G.pv_impact_y = G.in_py;
					G.pv_impact_z = G.in_pz;
					G.pv_impact_ground = 0;
					if (game_damage(G.in_pe, G.pv_attack_damage, player, 1)) {
						G.pv_impact_class = G.tmp_class;
						G.pv_impact_id = G.tmp_id;
						G.pv_impact_kill = G.tmp_kill;
						if (get_stored_item(G.g_cplayer!.player_weapon, Cclass_unit, G.g_player)) {
							set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
							if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
								parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
							}
						}
						if (get_stored_item(G.g_cplayer!.player_ammo, Cclass_unit, G.g_player)) {
							set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
							if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
								parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
							}
						}
					}
				}
			}
			return 1;
		} else {
			//Noammo
			if (get_stored_item(G.g_cplayer!.player_weapon, Cclass_unit, G.g_cplayer!.id)) {
				if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'noammo')) {
					parse_task(Cclass_item, G.TCitem!.id, 'noammo', '', Ditem_script(G.TCitem!.typ));
				}
			}
			return 0;
		}
	}
	return 0;
}

//Selfthrow
/** Function game_wpn_selfthrow(player) */
export function game_wpn_selfthrow(player: number): number {
	let Titem_: Titem | null = null;
	let speed = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let damage = 0;

	if (con_unit(player)) {
		//Find
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === Cclass_unit) {
				if (Titem_.parent_id === player) {
					if (Titem_.typ === G.TCunit!.player_weapon) {
						//Stuff
						speed = Ditem_rate(G.TCunit!.player_weapon);
						damage = Float(Ditem_damage(G.TCunit!.player_weapon));
						if (G.gt - G.TCunit!.player_lastattack < speed) return 0;
						G.TCunit!.player_lastattack = G.gt;

						//Exhaust
						game_exhaust(G.game_exh_attack[0], G.game_exh_attack[1], G.game_exh_attack[2]);

						//Dcrease
						free_item(Titem_.id, 1);

						//Spawn Projectile
						pro_add(player, G.TCunit!.player_weapon, EntityPitch(G.cam), EntityYaw(G.cam));
						pro_ini();

						//Okay
						return 1;
					}
				}
			}
		}
	}
	void damage;
	return 0;
}

//Weapon Function: Pick
/** Function game_wpnfunc_pick(h,range#,damage#,player) */
export function game_wpnfunc_pick(h: Handle, range: number, damage: number, player: number): void {
	let target: Handle = null;

	void h; // the parameter is not used by the original
	//Pick
	target = CreatePivot();
	PositionEntity(target, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam));
	RotateEntity(target, EntityPitch(G.cam), EntityYaw(G.cam), EntityRoll(G.cam));
	MoveEntity(target, 0, 0, range);
	EntityPickMode(G.g_cplayer!.h, 0);
	EntityPickMode(G.env_sea2, 0);
	G.in_pe = null;
	G.in_pe = LinePick(
		EntityX(G.cam),
		EntityY(G.cam),
		EntityZ(G.cam),
		f32(EntityX(target) - EntityX(G.cam)),
		f32(EntityY(target) - EntityY(G.cam)),
		f32(EntityZ(target) - EntityZ(G.cam)),
		Cworld_useradius
	);
	G.in_px = f32(PickedX());
	G.in_py = f32(PickedY());
	G.in_pz = f32(PickedZ());
	FreeEntity(target);
	EntityPickMode(G.g_cplayer!.h, 2, 1);

	//Attack FX
	p_add(Rand(-1, 2), 0, 0, Cp_attack, 12, 0.5);

	if (G.in_pe !== null) {
		//Script Vars
		G.pv_attack_damage = f32(damage);
		G.pv_attack_weapon = G.g_cplayer!.player_weapon;
		G.pv_attack_ammo = 0;

		//State
		if (Ditem_wstate(G.g_cplayer!.player_weapon) !== 0) {
			attach_state(G.in_pe, Ditem_wstate(G.g_cplayer!.player_weapon), -1, 0);
		}

		//Damage
		G.pv_impact_class = 0;
		G.pv_impact_id = 0;
		G.pv_impact_kill = 0;
		G.pv_impact_num = 1;
		G.pv_impact_amount = 1;
		G.pv_impact_x = G.in_px;
		G.pv_impact_y = G.in_py;
		G.pv_impact_z = G.in_pz;
		if (G.in_pe === G.ter) {
			G.pv_impact_ground = 1;
		} else {
			G.pv_impact_ground = 0;
		}
		if (game_damage(G.in_pe, damage, player, 1)) {
			//Impact FX
			p_add(G.in_px, G.in_py, G.in_pz, Cp_impact, Rnd(4, 12), Rnd(f32(0.4), f32(0.6)));
			EntityOrder(G.TCp!.h, -1);
			//Event
			G.pv_impact_class = G.tmp_class;
			G.pv_impact_id = G.tmp_id;
			G.pv_impact_kill = G.tmp_kill;
			if (get_stored_item(G.g_cplayer!.player_weapon, Cclass_unit, G.g_player)) {
				set_parsecache(Cclass_item, G.TCitem!.id, 'impact');
				if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'impact')) {
					parse_task(Cclass_item, G.TCitem!.id, 'impact', '', Ditem_script(G.TCitem!.typ));
				}
			}
		}
	}
}
