/**
 * includes/handle_all.bb - functions for all entity classes (ha_*).
 * Line-by-line port (PORTING_GUIDE.md). Package entities1.
 */
import {
	CreatePivot,
	EntityDistance,
	EntityPitch,
	EntityRoll,
	EntityY,
	FreeEntity,
	HideEntity,
	MeshesIntersect,
	PositionEntity,
	ShowEntity,
	type Handle
} from '../bb3d';
import { Float, Int, SEP_LINE, f32, fabs } from '../blitz';
import { con_add } from './console';
import { Cbmpf_red, Cclass_info, Cclass_item, Cclass_object, Cclass_state, Cclass_unit, Cpm_in, Csection_game_sp } from './consts';
import { Ditem_health, Ditem_name, Dobject_health, Dobject_name, Dunit_name } from './defs_arrays';
import { free_info } from './handle_infos';
import { con_item, damage_item, free_item, get_item, item_phyreset, set_item, store_item } from './handle_items';
import { con_object, damage_object, free_object, get_object } from './handle_objects';
import { look_state, set_state } from './handle_states';
import { con_unit, free_unit, get_unit, hurt_unit } from './handle_units';
import { parent_h } from './parentchild';
import { preparse_string } from './parser_pre';
import { G } from './state';
import { After, Delete, First, New, Tcopy, Tfrap, Tinfo, Titem, Tobject, Tstate, Tunit, Tx } from './types';

//### Count Objects which are in Range
/** Function ha_inrange(h,range,class,typ=0) */
export function ha_inrange(h: Handle, range: number, class_: number, typ: number = 0): number {
	let c = 0;
	let Tunit_: Tunit | null = null;
	let Tobject_: Tobject | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;
	let stateh: Handle = null;
	let Tstate_: Tstate | null = null;

	switch (class_) {
		//Player
		case 0:
			if (G.m_section !== Csection_game_sp) {
				for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
					if (Tunit_.id < 100) {
						if (EntityDistance(h, Tunit_.h) <= range) {
							c = c + 1;
						}
					}
				}
			} else {
				if (EntityDistance(h, G.g_cplayer!.h) <= range) {
					c = c + 1;
				}
			}
			break;
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.typ === typ) {
					if (EntityDistance(h, Tobject_.h) <= range) {
						c = c + 1;
					}
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.typ === typ) {
					if (Tunit_.health > 0) {
						if (EntityDistance(h, Tunit_.h) <= range) {
							c = c + 1;
						}
					}
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === 0) {
					if (Titem_.typ === typ) {
						if (EntityDistance(h, Titem_.h) <= range) {
							c = c + Titem_.count;
						}
					}
				}
			}
			break;
		//Info
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.typ === typ) {
					if (EntityDistance(h, Tinfo_.h) <= range) {
						c = c + 1;
					}
				}
			}
			break;
		//State
		case Cclass_state:
			for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
				if (Tstate_.typ === typ) {
					stateh = parent_h(Tstate_.parent_class, Tstate_.parent_id);
					if (stateh !== null) {
						if (EntityDistance(h, stateh) <= range) {
							c = c + 1;
						}
					}
				}
			}
			break;
	}
	//Return Count
	return c;
}

//### Get Class / ID by Handle
/** Function ha_getclass(h,bycollisionpivot=1) */
export function ha_getclass(h: Handle, bycollisionpivot: number = 1): number {
	G.tmp_class = 0;
	G.tmp_id = 0;
	//Object?
	if (get_object(h) > -1) {
		G.tmp_class = Cclass_object;
		G.tmp_id = G.TCobject!.id;
		return 1;
		//Unit?
	} else if (get_unit(h, bycollisionpivot) > -1) {
		G.tmp_class = Cclass_unit;
		G.tmp_id = G.TCunit!.id;
		return 1;
		//Item?
	} else if (get_item(h) > -1) {
		G.tmp_class = Cclass_item;
		G.tmp_id = G.TCitem!.id;
		return 1;
		//FAILED!
	} else {
		return 0;
	}
}

//### Check if specific Object is in range
/** Function ha_idinrange(h,range,class,id) */
export function ha_idinrange(h: Handle, range: number, class_: number, id: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (class_) {
		//Player
		case 0:
			return 0;
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === id) {
					if (EntityDistance(h, Tobject_.h) <= range) {
						return 1;
					}
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === id) {
					if (EntityDistance(h, Tunit_.h) <= range) {
						return 1;
					}
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.parent_class === 0) {
					if (Titem_.id === id) {
						if (EntityDistance(h, Titem_.h) <= range) {
							return 1;
						}
					}
				}
			}
			break;
		//Info
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === id) {
					if (EntityDistance(h, Tinfo_.h) <= range) {
						return 1;
					}
				}
			}
			break;
		//State
		case Cclass_state:
			return 0;
	}
	return 0;
}

//;### Distance
/** Function ha_distance(class1,id1,class2,id2) */
export function ha_distance(class1: number, id1: number, class2: number, id2: number): number {
	let h1: Handle = null;
	let h2: Handle = null;
	h1 = parent_h(class1, id1);
	h2 = parent_h(class2, id2);
	if (h1 !== null) {
		if (h2 !== null) {
			// quirk: an Int function: the distance is rounded to an Int
			return Int(EntityDistance(h1, h2));
		}
	}
	return 0;
}

//### Free
/** Function ha_free(class,id) */
export function ha_free(class_: number, id: number): void {
	//Self
	if (class_ === -1) {
		class_ = G.p_env_class;
		id = G.p_env_id;
	}
	//Select Class
	switch (class_) {
		//Object
		case Cclass_object:
			free_object(id);
			break;
		//Unit
		case Cclass_unit:
			free_unit(id);
			break;
		//Item
		case Cclass_item:
			free_item(id);
			break;
		//Info
		case Cclass_info:
			free_info(id);
			break;
		//State
		case Cclass_state:
			//Not Possible because parents are required to delete this.
			con_add("ERROR: Unable to remove a state by 'free' scriptcommand!", Cbmpf_red);
			break;
	}
}

//### Damage
/** Function ha_damage(class,id,damage#,causer=0,pickcords=0) */
export function ha_damage(class_: number, id: number, damage: number, causer: number = 0, pickcords: number = 0): number {
	void causer;
	switch (class_) {
		case Cclass_object:
			if (con_object(id)) {
				return damage_object(damage, 0, pickcords);
			}
			break;
		case Cclass_unit:
			if (con_unit(id)) {
				return hurt_unit(damage, 0, pickcords);
			}
			break;
		case Cclass_item:
			if (con_item(id)) {
				return damage_item(damage, 0, pickcords);
			}
			break;
	}
	return 0;
}

//### Heal
/** Function ha_heal(class,id,damage#) */
export function ha_heal(class_: number, id: number, damage: number): number {
	damage = fabs(damage);
	switch (class_) {
		case Cclass_object:
			if (con_object(id)) {
				G.TCobject!.health = f32(G.TCobject!.health + damage);
				if (G.TCobject!.health > Dobject_health(G.TCobject!.typ)) {
					G.TCobject!.health = f32(Dobject_health(G.TCobject!.typ));
				}
			}
			break;
		case Cclass_unit:
			if (con_unit(id)) {
				G.TCunit!.health = f32(G.TCunit!.health + damage);
				if (G.TCunit!.health > G.TCunit!.health_max) {
					G.TCunit!.health = G.TCunit!.health_max;
				}
			}
			break;
		case Cclass_item:
			if (con_item(id)) {
				G.TCitem!.health = f32(G.TCitem!.health + damage);
				if (G.TCitem!.health > Ditem_health(G.TCitem!.typ)) {
					G.TCitem!.health = f32(Ditem_health(G.TCitem!.typ));
				}
			}
			break;
	}
	return 0;
}

//### Get Class / ID by Handle
/** Function ha_killed(class,id) */
export function ha_killed(class_: number, id: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (class_) {
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === id) {
					return 0;
				}
			}
			return 1;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === id) {
					if (Tunit_.health_max === 0) {
						return 1;
					} else {
						return 0;
					}
				}
			}
			return 1;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === id) {
					return 0;
				}
			}
			return 1;
		//Info
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === id) {
					return 0;
				}
			}
			return 1;
	}
	return 0;
}

//### Free Spaace
/** Function ha_freespace(x#,y#,z#,range=300,objects=1,units=1,items=1,infos=0) */
export function ha_freespace(
	x: number,
	y: number,
	z: number,
	range: number = 300,
	objects: number = 1,
	units: number = 1,
	items: number = 1,
	infos: number = 0
): number {
	let h: Handle = null;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	h = CreatePivot();
	PositionEntity(h, x, y, z);
	//Objects
	if (objects === 1) {
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			if (EntityDistance(h, Tobject_.h) < range) {
				FreeEntity(h);
				return 0;
			}
		}
	}
	//Units
	if (units === 1) {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (EntityDistance(h, Tunit_.h) < range) {
				FreeEntity(h);
				return 0;
			}
		}
	}
	//Items
	if (items === 1) {
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_mode === 0) {
				if (EntityDistance(h, Titem_.h) < range) {
					FreeEntity(h);
					return 0;
				}
			}
		}
	}
	//Infos
	if (infos === 1) {
		for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
			if (EntityDistance(h, Tinfo_.h) < range) {
				FreeEntity(h);
				return 0;
			}
		}
	}
	//Nothing
	// quirk: the pivot is not freed when the space is free
	return 1;
}

//### Health
/** Function ha_health#(class,id) */
export function ha_health(class_: number, id: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;

	switch (class_) {
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === id) {
					return Tobject_.health;
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === id) {
					return Tunit_.health;
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === id) {
					return Titem_.health;
				}
			}
			break;
	}
	return 0;
}

//### Type
/** Function ha_type(class,id) */
export function ha_type(class_: number, id: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (class_) {
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === id) {
					return Tobject_.typ;
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === id) {
					return Tunit_.typ;
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === id) {
					return Titem_.typ;
				}
			}
			break;
		//Info
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === id) {
					return Tinfo_.typ;
				}
			}
			break;
	}
	return 0;
}

//### Type Exists
/** Function ha_typeexists(class,typ) */
export function ha_typeexists(class_: number, typ: number): number {
	if (typ < 1) return 0;
	switch (class_) {
		//Object
		case Cclass_object:
			if (typ > G.Cobject_count) return 0;
			if (Dobject_name(typ) !== '') return 1;
			break;
		//Unit
		case Cclass_unit:
			if (typ > G.Cunit_count) return 0;
			if (Dunit_name(typ) !== '') return 1;
			break;
		//Item
		case Cclass_item:
			if (typ > G.Citem_count) return 0;
			if (Ditem_name(typ) !== '') return 1;
			break;
	}
	return 0;
}

//### Intersect
/** Function ha_intersect(class,id) */
export function ha_intersect(class_: number, id: number): number {
	let h: Handle = null;
	let collide = 0;
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;

	h = parent_h(class_, id);
	collide = 0;
	void collide;
	//Objects
	for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
		if (class_ !== Cclass_object || id !== Tobject_.id) {
			if (EntityDistance(h, Tobject_.h) < 3000) {
				if (MeshesIntersect(h, Tobject_.h)) return 1;
			}
		}
	}
	//Units
	for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
		if (class_ !== Cclass_unit || id !== Tunit_.id) {
			if (EntityDistance(h, Tunit_.h) < 1000) {
				if (MeshesIntersect(h, Tunit_.mh)) return 1;
			}
		}
	}
	//Items
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (class_ !== Cclass_item || id !== Titem_.id) {
			if (EntityDistance(h, Titem_.h) < 500) {
				if (MeshesIntersect(h, Titem_.h)) return 1;
			}
		}
	}
	//No Collision
	return 0;
}

//### Setpos
/** Function ha_setpos(setph,classint,id,setpx$,setpy$,setpz$) */
export function ha_setpos(setph: Handle, classint: number, id: number, setpx: string, setpy: string, setpz: string): void {
	let Tunit_: Tunit | null = null;
	let Tobject_: Tobject | null = null;
	let update = 0;
	let Tfrap_: Tfrap | null = null;

	//Setpos
	HideEntity(setph);
	PositionEntity(setph, Float(setpx), Float(setpy), Float(setpz));
	ShowEntity(setph);
	//Unit with VH
	if (classint === Cclass_unit) {
		for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
			if (Tunit_.id === id) {
				if (Tunit_.vh !== null) HideEntity(Tunit_.vh);
				PositionEntity(Tunit_.h, Float(setpx), Float(setpy), Float(setpz));
				if (Tunit_.vh !== null) {
					PositionEntity(Tunit_.vh, Float(setpx), Float(setpy), Float(setpz));
					ShowEntity(Tunit_.vh);
				}
			}
		}
		//Update FRAP Data
	} else if (classint === Cclass_object) {
		for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
			if (Tobject_.id === id) {
				if (Tobject_.ch !== null) {
					PositionEntity(Tobject_.ch, Float(setpx), Float(setpy), Float(setpz));
				}
				break;
			}
		}
		update = 0;
		for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
			if (Tfrap_.parent_class === Cclass_object) {
				if (Tfrap_.parent_id === id) {
					Tfrap_.y = f32(EntityY(setph));
					Tfrap_.pitch = f32(EntityPitch(setph));
					Tfrap_.roll = f32(EntityRoll(setph));
					update = 1;
					break;
				}
			}
		}
		if (update === 0) {
			Tfrap_ = New(Tfrap);
			Tfrap_.parent_class = Cclass_object;
			Tfrap_.parent_id = id;
			Tfrap_.y = f32(EntityY(setph));
			Tfrap_.pitch = f32(EntityPitch(setph));
			Tfrap_.roll = f32(EntityRoll(setph));
		}
		item_phyreset();
		//Update Item Freeze
	} else if (classint === Cclass_item) {
		if (con_item(id)) {
			G.TCitem!.phy_pause = 0;
		}
	}
	//Player Teleport Bug FIX
	if (classint === Cclass_unit) {
		if (id === G.g_player) {
			G.in_tpforce = 3;
			G.in_tp[0] = Float(setpx);
			G.in_tp[1] = Float(setpy);
			G.in_tp[2] = Float(setpz);
		}
	}
}

//### Copy
/** Function ha_copychilds(class,id,vars=1,items=1,states=1,script=0,addtocache=0) */
export function ha_copychilds(
	class_: number,
	id: number,
	vars: number = 1,
	items: number = 1,
	states: number = 1,
	script: number = 0,
	addtocache: number = 0
): void {
	let Tcopy_: Tcopy | null = null;
	let Tx_: Tx | null = null;
	let Titem_: Titem | null = null;
	let Tstate_: Tstate | null = null;
	// quirk: items and states are not tested here: child items and states are always copied
	void items;
	void states;

	//Delete
	if (addtocache === 0) {
		for (Tcopy_ = First(Tcopy); Tcopy_ !== null; Tcopy_ = After(Tcopy, Tcopy_)) {
			Delete(Tcopy, Tcopy_);
		}
	}
	//Add Script / Local Vars
	for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
		if (Tx_.parent_class === class_) {
			if (Tx_.parent_id === id) {
				//Script
				if (Tx_.mode === 0) {
					if (script === 1) {
						Tcopy_ = New(Tcopy);
						Tcopy_.typ = 0;
						Tcopy_.value_s = Tx_.value;
					}
					//Local Var
				} else if (Tx_.mode === 4) {
					if (vars === 1) {
						Tcopy_ = New(Tcopy);
						Tcopy_.typ = 1;
						Tcopy_.key = Tx_.key;
						Tcopy_.value_s = Tx_.value;
					}
				}
			}
		}
	}
	//Add Item
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === class_) {
			if (Titem_.parent_id === id) {
				if (Titem_.parent_mode === Cpm_in) {
					//Item
					Tcopy_ = New(Tcopy);
					Tcopy_.typ = 2;
					Tcopy_.id = Titem_.typ;
					Tcopy_.value = Titem_.count;
				}
			}
		}
	}
	//Add State
	for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
		if (Tstate_.parent_class === class_) {
			if (Tstate_.parent_id === id) {
				//State
				Tcopy_ = New(Tcopy);
				Tcopy_.typ = 3;
				Tcopy_.id = Tstate_.typ;
				Tcopy_.x = Tstate_.x;
				Tcopy_.y = Tstate_.y;
				Tcopy_.z = Tstate_.z;
				Tcopy_.fx = Tstate_.fx;
				Tcopy_.fy = Tstate_.fy;
				Tcopy_.fz = Tstate_.fz;
				Tcopy_.value = Tstate_.value;
				Tcopy_.value_f = Tstate_.value_f;
				Tcopy_.value_s = Tstate_.value_s;
				Tcopy_.r = Tstate_.r;
				Tcopy_.g = Tstate_.g;
				Tcopy_.b = Tstate_.b;
			}
		}
	}
}

//### Paste
/** Function ha_pastechilds(class,id,vars=1,items=1,states=1,script=0) */
export function ha_pastechilds(class_: number, id: number, vars: number = 1, items: number = 1, states: number = 1, script: number = 0): number {
	let Tcopy_: Tcopy | null = null;
	let found = 0;
	let Tx_: Tx | null = null;
	let tmpid = 0;
	let Tstate_: Tstate | null = null;

	if (class_ === Cclass_item) items = 0;
	if (ha_type(class_, id) !== 0) {
		//Paste
		for (Tcopy_ = First(Tcopy); Tcopy_ !== null; Tcopy_ = After(Tcopy, Tcopy_)) {
			switch (Tcopy_.typ) {
				//0 Script
				case 0:
					if (script === 1) {
						found = 0;
						// quirk: Tx\mode is not tested: the script is appended to the first Tx of the entity, whatever it is
						for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
							if (Tx_.parent_class === class_) {
								if (Tx_.parent_id === id) {
									Tx_.value = Tx_.value + SEP_LINE + Tcopy_.value_s;
									Tx_.key = preparse_string(Tx_.value);
									found = 1;
									break;
								}
							}
						}
						if (found === 0) {
							Tx_ = New(Tx);
							Tx_.parent_class = class_;
							Tx_.parent_id = id;
							Tx_.value = Tcopy_.value_s;
							Tx_.key = preparse_string(Tx_.value);
						}
					}
					break;
				//1 Local Vars
				case 1:
					if (vars === 1) {
						found = 0;
						for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
							if (Tx_.mode === 4) {
								if (Tx_.parent_class === class_) {
									if (Tx_.parent_id === id) {
										if (Tx_.key === Tcopy_.key) {
											Tx_.value = Tcopy_.value_s;
											found = 1;
											break;
										}
									}
								}
							}
						}
						if (found === 0) {
							Tx_ = New(Tx);
							Tx_.mode = 4;
							Tx_.key = Tcopy_.key;
							Tx_.value = Tcopy_.value_s;
							Tx_.parent_class = class_;
							Tx_.parent_id = id;
						}
					}
					break;
				//2 Items
				case 2:
					if (items === 1) {
						tmpid = set_item(-1, Tcopy_.id, 0, 0, 0, Tcopy_.value);
						store_item(tmpid, class_, id);
					}
					break;
				//3 States
				case 3:
					if (states === 1) {
						set_state(Tcopy_.id, class_, id);
						for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
							if (Tstate_.parent_class === class_) {
								if (Tstate_.parent_id === id) {
									if (Tstate_.typ === Tcopy_.id) {
										Tstate_.value = Tcopy_.value;
										Tstate_.value_f = Tcopy_.value_f;
										Tstate_.value_s = Tcopy_.value_s;
										Tstate_.r = Tcopy_.r;
										Tstate_.g = Tcopy_.g;
										Tstate_.b = Tcopy_.b;
										G.TCstate = Tstate_;
										look_state();
										break;
									}
								}
							}
						}
					}
					break;
			}
		}
		return 1;
	} else {
		return 0;
	}
}
