/**
 * includes/handle_items.bb: items and the inventory (parent_class / parent_id / parent_mode).
 * Line-by-line port (PORTING_GUIDE.md); original comments kept.
 */
//############################################ Handle items
import {
	CameraProject,
	CopyEntity,
	CreatePivot,
	EntityAlpha,
	EntityAutoFade,
	EntityBlend,
	EntityColor,
	EntityDistance,
	EntityFX,
	EntityInView,
	EntityPickMode,
	EntityPitch,
	EntityRadius,
	EntityRoll,
	EntityShininess,
	EntityType,
	EntityX,
	EntityY,
	EntityYaw,
	EntityZ,
	FreeEntity,
	HideEntity,
	MoveEntity,
	PositionEntity,
	ProjectedX,
	ProjectedY,
	RotateEntity,
	ScaleEntity,
	ShowEntity,
	TranslateEntity,
	type Handle
} from '../bb3d';
import { Abs, Instr, Int, Len, Rand, SEP_LINE, Str, f32 } from '../blitz';
import { Color, DrawImage, Line } from '../gfx2d';
import { KeyDown, KeyHit } from '../input';
import {
	Cbmpf_red,
	Cbmpf_tiny,
	Cclass_info,
	Cclass_item,
	Cclass_object,
	Cclass_unit,
	Cmenu_if_combine,
	Cmenu_if_items,
	Cmenu_if_map,
	Cp_flash,
	Cpm_in,
	Cpm_out,
	Cstate_invulnerability,
	Cworld_g,
	Cworld_itemcol
} from './consts';
import {
	Ditem_alpha,
	Ditem_autofade,
	Ditem_behaviour,
	Ditem_blend,
	Ditem_color,
	Ditem_fx,
	Ditem_health,
	Ditem_mat,
	Ditem_modelh,
	Ditem_name,
	Ditem_radius,
	Ditem_script,
	Ditem_scriptk,
	Ditem_shininess,
	Ditem_size,
	Ditem_weight,
	Dobject_maxweight,
	Dunit_maxweight
} from './defs_arrays';
import { e_tery } from './e_environment';
import { con_object } from './handle_objects';
import { get_state } from './handle_states';
import { con_unit } from './handle_units';
import { if_msg, if_quickslot } from './interface';
import { bmpf_txt_c } from './load_bmpf';
import { load_item_model } from './load_items';
import { material_fx } from './load_materials';
import { se, sm, ss } from './load_strings';
import { free_childs, parent_h } from './parentchild';
import { parse } from './parser';
import {
	loadstring_parsecache,
	parse_env,
	parse_globalevent,
	parse_kill_add,
	parse_sel,
	parse_task,
	set_parsecache
} from './parser_functions';
import { defvar_oncreate } from './parser_vars';
import { p_add } from './particles';
import { sfx } from './sfx';
import { speech } from './speech';
import { G } from './state';
import { After, Delete, Each, First, InsertAfter, Last, New, Tcom, Titem, Tx, isNull } from './types';

//### Set item
/** Function set_item(id=-1,typ,x#=0,y#=0,z#=0,count=1,silent=0) */
export function set_item(id: number = -1, typ: number, x: number = 0, y: number = 0, z: number = 0, count: number = 1, silent: number = 0): number {
	let Titem_: Titem | null = null;
	let h: Handle = null;

	G.TCitem = null;

	//Invalid typ? Cancel
	if (Len(Ditem_name(typ)) === 0) return -1;

	//Add at End
	if (id === -1) {
		G.item_serial = G.item_serial + 1;
		id = G.item_serial;
	}

	//Check Model
	if (Ditem_modelh(typ) === null) {
		load_item_model(typ);
	}

	//Check Count
	if (count <= 1) count = 1;

	//Create
	Titem_ = New(Titem);
	Titem_.id = id;
	Titem_.typ = typ;
	if (Ditem_modelh(typ) !== null) {
		h = CopyEntity(Ditem_modelh(typ));
	} else {
		h = CopyEntity(G.game_defaultitemmodel);
		EntityFX(h, 16);
	}
	Titem_.h = h;
	Titem_.count = count;

	//Adjust
	ScaleEntity(h, Ditem_size(typ, 0), Ditem_size(typ, 1), Ditem_size(typ, 2));
	EntityColor(h, Ditem_color(typ, 0), Ditem_color(typ, 1), Ditem_color(typ, 2));
	if (Ditem_fx(typ) !== 0) EntityFX(h, Ditem_fx(typ));
	if (Ditem_autofade(typ) !== 0) EntityAutoFade(h, f32(f32(Ditem_autofade(typ)) * G.set_viewfac), f32(f32(f32(Ditem_autofade(typ)) * G.set_viewfac) + 50));
	EntityAlpha(h, Ditem_alpha(typ));
	if (Ditem_shininess(typ) > 0.0) EntityShininess(h, Ditem_shininess(typ));
	if (Ditem_blend(typ) !== 0) EntityBlend(h, Ditem_blend(typ));

	//Values
	Titem_.health = f32(Ditem_health(typ));
	Titem_.phy_fall = G.gt;

	//Position
	PositionEntity(h, x, y, z);

	//Pick
	if (Ditem_radius(typ) === 0) {
		EntityPickMode(h, 2, 1);
		EntityRadius(h, f32(0.1));
		//EntityType h,Cworld_col
		EntityType(h, Cworld_itemcol);
	} else {
		EntityRadius(h, Ditem_radius(typ));
		EntityPickMode(h, 1, 1);
		//EntityType h,Cworld_col
		EntityType(h, Cworld_itemcol);
	}

	//Event: on:create
	if (silent === 0) {
		if (G.tmp_loading === 0) {
			set_parsecache(Cclass_item, Titem_.id, 'create');
			if (Instr(Ditem_scriptk(Titem_.typ), SEP_LINE + 'create')) {
				parse_task(Cclass_item, Titem_.id, 'create', '', Ditem_script(Titem_.typ));
			}
		}
	}

	//Defvars
	if (silent === 0) {
		if (G.tmp_loading === 0) defvar_oncreate(Cclass_item, id, typ);
	}

	//Okay
	G.TCitem = Titem_;
	return id;
}

//### Store Item
//stores (sets the parent of) an item
/** Function store_item(id,parentclass,parentid,parentmode=Cpm_in,x#=0,y#=0,z#=0) */
export function store_item(id: number, parentclass: number, parentid: number, parentmode: number = Cpm_in, x: number = 0, y: number = 0, z: number = 0): number {
	let Titem_: Titem | null = null;
	let storemode = 0;
	let storecount = 0;
	let free = 0;
	let needed = 0;
	let i = 0;
	let createnew = 0;
	let Texists: Titem | null = null;
	let oldcount = 0;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			//Determine if there is enough free capacity
			//storemode
			//0 = no storage
			//1 = full storage
			//2 = partial storage
			storemode = 1;
			if (parentmode === Cpm_in) {
				storecount = 0;
				free = -1;
				needed = 0;
				//Determine free capacity
				if (parentclass === Cclass_object) {
					if (con_object(parentid)) {
						free = capacity(parentclass, parentid, G.TCobject!.typ);
					}
				} else if (parentclass === Cclass_unit) {
					if (con_unit(parentid)) {
						free = capacity(parentclass, parentid, G.TCunit!.typ);
					}
				}
				if (free !== -1) {
					//Determine needed capacity
					needed = Ditem_weight(Titem_.typ) * Titem_.count;

					//DebugLog "<<<<<< STORE >>>>>>"
					//DebugLog "Needed: "+needed+" Free: "+free

					//Full Storage Possible?
					if (needed <= free) {
						//Full Storage!
						storemode = 1;
					} else if (Ditem_weight(Titem_.typ) <= free) {
						//Partial Storage!
						storemode = 2;
						for (i = 1; i <= Titem_.count; i++) {
							if (Ditem_weight(Titem_.typ) * i > free) break;
						}
						storecount = i - 1;
					} else {
						storemode = 0;
					}
					//Storing not possible!
					if (storemode === 0) {
						return 0;
					}

					//DebugLog "Store Mode: "+storemode
					//DebugLog "Store Count: "+storecount
				}
			}

			//Same Items exists?
			createnew = 1;
			if (parentmode === Cpm_in) {
				for (Texists = First(Titem); Texists !== null; Texists = After(Titem, Texists)) {
					if (Texists.id !== id) {
						//Ignore Itself
						if (Texists.typ === Titem_!.typ) {
							if (Texists.parent_class === parentclass) {
								if (Texists.parent_id === parentid) {
									//Full Storage - Delete
									if (storemode === 1) {
										//Delete old Item
										oldcount = Titem_!.count;
										free_item(id);
										//Add Amount of old Item to the existing Item
										Texists.count = Texists.count + oldcount;
										//Swap Handle
										Titem_ = Texists;
										createnew = 0;
										break;
										//Partial Storage - Keep
									} else {
										//Decrease Amount of old Item
										Titem_!.count = Titem_!.count - storecount;
										//Add storecount to the existing Item
										Texists.count = Texists.count + storecount;
										//Swap Handle
										Titem_ = Texists;
										createnew = 0;
										break;
									}
								}
							}
						}
					}
				}
			}

			//Create new Item in Case of Partial Storage and no same existing Item!
			if (storemode === 2) {
				if (createnew === 1) {
					//Decrease Amount of old Item
					Titem_!.count = Titem_!.count - storecount;
					//Create New and Swap Handle
					set_item(-1, Titem_!.typ, 0, 0, 0, storecount, 1);
					Titem_ = G.TCitem;
				}
				//Create new Item in Case of Total Storage and no same existing Item!
				//(in order to put item on last position!
			} else if (storemode === 1) {
				//Delete old Item
				//storecount=Titem\count
				//temptyp=Titem\typ
				//free_item(id)
				//Create New and Sawp Handle
				//set_item(-1,temptyp,0,0,0,storecount,1)
				//Titem.Titem=TCitem
				// quirk: also runs when the item was merged into an existing one (Titem is then the existing item) and for Cpm_out
				InsertAfter(Titem, Titem_!, Last(Titem)!);
			}

			//Set Parent Stuff
			Titem_!.parent_class = parentclass;
			Titem_!.parent_id = parentid;
			Titem_!.parent_mode = parentmode;

			//Free Childs
			free_childs(Cclass_item, Titem_!.id);

			//Position and Mode based Stuff
			PositionEntity(Titem_!.h, x, y, z);
			if (parentmode === Cpm_in) {
				HideEntity(Titem_!.h);
			} else {
				ShowEntity(Titem_!.h);
			}

			//Turn Object when stored Outside
			if (parentmode === Cpm_out) {
				RotateEntity(Titem_!.h, -90, Rand(360), 0);
				G.TCitem = Titem_;
			}

			return 1;
		}
	}
	return 0;
}

//### Unstore Item
//unstores an specified amount of an stored (item with parent) item
//and splits the item to 2 items if the amount is lower than the
//total amount of the item
/** Function unstore_item(id,count=1,atparent=0,x#=0,y#=0,z#=0) */
export function unstore_item(id: number, count: number = 1, atparent: number = 0, x: number = 0, y: number = 0, z: number = 0): number {
	let Titem_: Titem | null = null;
	let parenth: Handle = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			//Get Parent Position
			if (atparent) {
				parenth = parent_h(Titem_.parent_class, Titem_.parent_id);
				x = EntityX(parenth);
				y = EntityY(parenth);
				z = EntityZ(parenth);
			}

			//Count Stuff
			if (count < Titem_.count) {
				//Decrease Count of stored Item and create new, unstored Item
				Titem_.count = Titem_.count - count;
				set_item(-1, Titem_.typ, x, y, z, count);
			} else {
				//Just unstore the Item completely
				Titem_.parent_class = 0;
				Titem_.parent_id = 0;
				Titem_.parent_mode = 0;
				Titem_.if_sel = 0;
				Titem_.phy_fall = G.gt;
				Titem_.phy_pause = 0;
				PositionEntity(Titem_.h, x, y, z);
				ShowEntity(Titem_.h);
				G.TCitem = Titem_;
			}

			return 1;
		}
	}
	return 0;
}

//### Count stored Items
/** Function countstored_items(parent_class,parent_id,typ=0,dif=0) */
export function countstored_items(parent_class: number, parent_id: number, typ: number = 0, dif: number = 0): number {
	let c = 0;
	let difc = 0;
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === parent_class) {
			if (Titem_.parent_id === parent_id) {
				if (Titem_.typ === typ || typ === 0) {
					c = c + Titem_.count;
					difc = difc + 1;
				}
			}
		}
	}
	if (dif === 0) {
		return c;
	} else {
		return difc;
	}
}

//### Merge Item with surrounding Items
//'merges' items of the same type
//in order to reduce the global model and item amount.
//all surrounding items will be added to the item
//specified by the id parameter.
/** Function merge_item(id,mergerange#=30.) */
export function merge_item(id: number, mergerange: number = 30): number {
	let mergecount = 0;
	let Titem_: Titem | null = null;
	let Tmerge: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			//Finde Items with same Type which are in "merge range"
			// Each form: the current object may be deleted and others created in the body; the loop goes on from its place
			for (const each_Tmerge of Each(Titem)) {
				Tmerge = each_Tmerge;
				if (Tmerge.id !== Titem_.id) {
					if (Tmerge.typ === Titem_.typ) {
						// quirk: only the parent id is compared, not the parent class
						if (Tmerge.parent_id === Titem_.parent_id) {
							if (EntityDistance(Tmerge.h, Titem_.h) <= mergerange) {
								//Add Count from merged Item to Item
								Titem_.count = Titem_.count + Tmerge.count;
								//Delete merged Item
								free_item(Tmerge.id, -1);
								//Increase Mergecount for Return
								mergecount = mergecount + 1;
							}
						}
					}
				}
			}

			return mergecount;
		}
	}
	return -1;
}

//### Combine Items
//Combines all selected Items
/** Function combine_item(parentclass,parentid,forceid=-1) */
export function combine_item(parentclass: number, parentid: number, forceid: number = -1): number {
	let con = 0; //Conditions Total
	let conok = 0; //Conditions Okay (types and counts)
	let conokc = 0; //Conditions Okay (types but not counts)
	let sel = 0;
	let genid = 0;
	let selthis = 0;
	let Trcom: Tcom | null = null;
	let Tccom: Tcom | null = null;
	let Titem_: Titem | null = null;
	let locked = 0;
	let Tx_: Tx | null = null;
	let Tpcom: Tcom | null = null;
	let id = 0;

	//Check all Combinations (Trcom root)
	for (Trcom = First(Tcom); Trcom !== null; Trcom = After(Tcom, Trcom)) {
		//Select Combination
		selthis = 0;
		if (Trcom.mode === 2) {
			if (forceid === -1) {
				selthis = 1;
			} else {
				if (Trcom.id === forceid) selthis = 1;
			}
		}

		//Combination selected?
		if (selthis === 1) {
			//Check all Combination Conditions (Req) within each Combination
			con = 0; //Conditions Total
			conok = 0; //Conditions Okay
			conokc = 0; //Conditions Okay (types but not counts)
			for (Tccom = First(Tcom); Tccom !== null; Tccom = After(Tcom, Tccom)) {
				//(Tccom)
				if (Tccom.id === Trcom.id) {
					//Req
					if (Tccom.mode === 0) {
						con = con + 1; // + 1 Condition
						for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
							if (Titem_.if_sel === 1) {
								//Type exists?
								if (Titem_.typ === Tccom.typ) {
									//Enough?
									if (Titem_.count >= Tccom.count) {
										conok = conok + 1; // + 1 Condition Okay
									}
									conokc = conokc + 1;
								}
							}
						}
						//GenID
					} else if (Tccom.mode === 1) {
						genid = Tccom.typ;
					}
				}
			}
			//Count selected
			sel = 0; //Selected Items
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.if_sel === 1) {
					sel = sel + 1;
				}
			}
			//Not to many selected?
			if (sel === con) {
				//All Conditions Okay? / Count too low?
				if (con === conok || (G.game_combiscreen > 0 && con === conokc)) {
					//Find Similar Combinations (only when unforced)
					if (forceid === -1) {
						if (Trcom.gid !== 0) {
							//Similar Combinations!
							if (Trcom.gid > 0) {
								//Open Combiscreen and cancel combi?
								if (G.game_combiscreen > 0) {
									G.in_combi_gid = Trcom.gid;
									G.in_scr_scr = 0;
									G.m_menu = Cmenu_if_combine;
									return 1;
								}
								//No Similar Combinations!
							} else if (Trcom.gid < 0) {
								//Open Combiscreen and cancel combi?
								if (G.game_combiscreen > 1) {
									G.in_combi_gid = Trcom.gid;
									G.in_scr_scr = 0;
									G.m_menu = Cmenu_if_combine;
									return 1;
								}
							}
						}
					}

					//Run Script
					if (con === conok) {
						//Locked?
						locked = 0;
						for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
							if (Tx_.mode === 50) {
								if (Tx_.key === Trcom.aid) {
									locked = 1;
									break;
								}
							}
						}
						if (locked === 0) {
							G.p_skipevent = 0;
							if (Trcom.script !== '') {
								parse_task(0, 0, 'combine', '(combinations.inf-script)', Trcom.script);
								parse_sel(0, 0, 'combine');
							}
							if (G.p_skipevent === 0) {
								//Perform Combination (Tpcom)
								for (Tpcom = First(Tcom); Tpcom !== null; Tpcom = After(Tcom, Tpcom)) {
									if (Tpcom.id === Trcom.id) {
										//Req - Delete
										if (Tpcom.mode === 0) {
											if (Tpcom.del === 1) {
												// Each form: the current object may be deleted and others created in the body; the loop goes on from its place
												for (const each_Titem_ of Each(Titem)) {
													Titem_ = each_Titem_;
													if (Titem_.if_sel === 1) {
														if (Titem_.typ === Tpcom.typ) {
															//FX
															//p_combine(Tpcom\typ,genid)
															//Delete
															free_item(Titem_.id, Tpcom.count);
														}
													}
												}
											}
											//Gen - Create
										} else if (Tpcom.mode === 1) {
											id = set_item(-1, Tpcom.typ, EntityX(G.cam), EntityY(G.cam), EntityZ(G.cam), Tpcom.count);
											if (store_item(id, parentclass, parentid) === 0) {
												if_msg(sm(181), Cbmpf_red);
												sfx(G.sfx_fail);
											}
										}
									}
								}
							}
							//Okay!
							return 1;
						} else {
							//Negative
							speech('negative');
							return 0;
						}
					} else {
						//Not Enough Items
						speech('negative');
						return 0;
					}
				}
			}

			//Forced Combi? -> do not check other combis
			if (forceid > -1) {
				break;
			}
		}
	}
	//No Combination Performed
	speech('negative');
	return 0;
}

//### Exchange Item (TCitem)
/** Function exchange_item(class,id,count) */
export function exchange_item(class_: number, id: number, count: number): number {
	let creq = 0;
	let cfree = 0;
	let cok = 0;
	let Titem_: Titem | null = null;

	//con_add("EXCHANGE: "+Ditem_name(TCitem\typ)+"x"+count+" -> "+class+"#"+id)

	//Check Count
	if (count > G.TCitem!.count) {
		count = G.TCitem!.count;
	}

	//Check Capacity of current Destination
	creq = Ditem_weight(G.TCitem!.typ) * count;
	cfree = 0;
	cok = 1;
	if (creq < 0) {
		//con_add("item low weight! - "+creq)
		cok = 0;
		switch (G.TCitem!.parent_class) {
			case Cclass_object:
				con_object(G.TCitem!.parent_id);
				cfree = capacity(G.TCitem!.parent_class, G.TCitem!.parent_id, G.TCobject!.typ);
				if (cfree >= Abs(creq)) cok = 1;
				break;
			case Cclass_unit:
				con_unit(G.TCitem!.parent_id);
				cfree = capacity(G.TCitem!.parent_class, G.TCitem!.parent_id, G.TCunit!.typ);
				if (cfree >= Abs(creq)) cok = 1;
				break;
			case Cclass_info:
				cok = 1;
				break;
		}
		if (cok === 0) return -1;
	}

	//Check Capacity of new Destination
	cfree = 0;
	cok = 0;
	switch (class_) {
		case Cclass_object:
			con_object(id);
			cfree = capacity(class_, id, G.TCobject!.typ);
			if (cfree >= creq) cok = 1;
			break;
		case Cclass_unit:
			con_unit(id);
			cfree = capacity(class_, id, G.TCunit!.typ);
			if (cfree >= creq) cok = 1;
			break;
		case Cclass_info:
			cok = 1;
			break;
	}

	//Not enough Capacity - Reduce count
	if (cok === 0) {
		while (creq > cfree && count > 0) {
			count = count - 1;
			creq = Ditem_weight(G.TCitem!.typ) * count;
		}
		//Not enough Capacity! Cancel!
		if (count <= 0) return 0;
	}

	//Drop Event?
	G.p_skipevent = 0;
	if (G.TCitem!.parent_class === Cclass_unit) {
		if (G.TCitem!.parent_id === G.g_player) {
			//Drop Event!
			if (set_parsecache(Cclass_item, G.TCitem!.id, 'drop')) parse();
			if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'drop')) {
				parse_env(Cclass_item, G.TCitem!.id, 'drop');
				loadstring_parsecache(Ditem_script(G.TCitem!.typ));
				parse();
			}
		}
	}

	if (G.p_skipevent === 1) return -2;

	//Store!
	if (G.TCitem!.count === count) {
		//All Stored (increase count of existing)
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === class_) {
				if (Titem_.parent_id === id) {
					if (Titem_.typ === G.TCitem!.typ) {
						if (Titem_.id !== G.TCitem!.id) {
							Titem_.count = Titem_.count + G.TCitem!.count;
							free_item(G.TCitem!.id);
							return 1;
						}
					}
				}
			}
		}
		//All Stored (change parent)
		// quirk: parent_mode is not changed
		G.TCitem!.parent_class = class_;
		G.TCitem!.parent_id = id;
		InsertAfter(Titem, G.TCitem!, Last(Titem)!);
		return 1;
	} else {
		//Only Some are stored!
		//Reduce count
		G.TCitem!.count = G.TCitem!.count - count;
		//Create and store new item
		set_item(-1, G.TCitem!.typ, 0, 0, 0, count);
		store_item(G.TCitem!.id, class_, id);
		return 2;
	}
}

//### Capacity of Object
/** Function capacity(class,id,typ) */
export function capacity(class_: number, id: number, typ: number): number {
	//Determine Total
	let total = 0;
	let used = 0;
	let Titem_: Titem | null = null;

	switch (class_) {
		case Cclass_object:
			total = Dobject_maxweight(typ);
			break;
		case Cclass_unit:
			total = Dunit_maxweight(typ);
			break;
	}
	used = 0;
	//Determine Used
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === class_) {
			if (Titem_.parent_id === id) {
				used = used + Ditem_weight(Titem_.typ) * Titem_.count;
			}
		}
	}
	//Return Free
	return total - used;
}

//### Use Item
/** Function use_item(id) */
export function use_item(id: number): number {
	let Titem_: Titem | null = null;
	let action = 0;
	let tasks = 0;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			action = 0;

			//Use as weapon / tool
			if (item_istool(Ditem_behaviour(Titem_.typ))) {
				if (G.m_menu === Cmenu_if_items) {
					if_quickslot(0, 1);
					action = 1;
				}
			}

			//Event: on:use
			G.p_skipevent = 0;
			set_parsecache(Cclass_item, Titem_.id, 'use');
			if (Instr(Ditem_scriptk(Titem_.typ), SEP_LINE + 'use')) {
				parse_task(Cclass_item, Titem_.id, 'use', '', Ditem_script(Titem_.typ));
				tasks = parse_sel(Cclass_item, Titem_.id, 'use');
				if (tasks > 0) action = 1;
			}

			//Behaviour based Actions
			if (G.p_skipevent === 0) {
				if (!isNull(Titem, Titem_)) {
					switch (Ditem_behaviour(Titem_.typ)) {
						case 'watch':
							action = 1;
							if (G.map_hour === 13 && G.map_minute === 37) {
								if_msg('13:37 ' + sm(36) + ' - Y4y! t3h 3l!te!');
								parse_globalevent('leet');
								parse();
								p_add(0, 0, 0, Cp_flash, f32(0.06), f32(0.75));
								EntityColor(G.TCp!.h, 0, 255, 0);
							} else {
								if_msg(Str(G.map_hour) + ':' + Str(G.map_minute) + ' ' + sm(36));
							}
							break;
						case 'map':
							action = 1;
							G.m_menu = Cmenu_if_map;
							break;
					}
				}
			}

			if (action === 0) {
				if_msg(sm(196), Cbmpf_red);
				speech('negative');
			}
			return 1;
		}
	}
	return 0;
}

//### Eat Item
/** Function eat_item(id) */
export function eat_item(id: number): number {
	let Titem_: Titem | null = null;
	let action = 0;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			//Event: on:eat
			set_parsecache(Cclass_item, Titem_.id, 'eat');
			if (Instr(Ditem_scriptk(Titem_.typ), SEP_LINE + 'eat')) {
				parse_task(Cclass_item, Titem_.id, 'eat', '', Ditem_script(Titem_.typ));
				action = parse_sel(Cclass_item, Titem_.id, 'eat');
			}

			if (action === 0) {
				if_msg(sm(195), Cbmpf_red);
				speech('negative');
			}
			return 1;
		}
	}
	return 0;
}

//### Get Item ID by Handle
/** Function get_item(searchhandle) */
export function get_item(searchhandle: Handle): number {
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.h === searchhandle) {
			G.TCitem = Titem_;
			return Titem_.id;
		}
	}
	return -1;
}

//### Get stored Item
/** Function get_stored_item(typ,parent_class,parent_id) */
export function get_stored_item(typ: number, parent_class: number, parent_id: number): number {
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.typ === typ) {
			if (Titem_.parent_class === parent_class) {
				if (Titem_.parent_id === parent_id) {
					G.TCitem = Titem_;
					return 1;
				}
			}
		}
	}
	return 0;
}

//### Set Item Container
/** Function con_item(id) */
export function con_item(id: number): number {
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			G.TCitem = Titem_;
			return 1;
		}
	}
	return 0;
}

//### Draw Item
/** Function draw_item() */
export function draw_item(): void {
	let Titem_: Titem | null = null;

	Titem_ = G.TCitem;
	if (EntityInView(Titem_!.h, G.cam)) {
		//Name
		CameraProject(G.cam, EntityX(Titem_!.h), EntityY(Titem_!.h), EntityZ(Titem_!.h));
		bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Titem_!.id) + ' ' + Ditem_name(Titem_!.typ) + ' ' + Str(Titem_!.count) + 'x', Cbmpf_tiny);
		//Free Rotation and Position
		if (KeyHit(57)) {
			G.in_fraph = Titem_!.h;
		}
		//Info
		G.in_edoverinfo = ss(se(198), Ditem_name(Titem_!.typ));
		if (KeyHit(211)) free_item(Titem_!.id);
	}
}

//### Free Item
/** Function free_item(id,count=-1) */
export function free_item(id: number, count: number = -1): number {
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id === id) {
			if (count === -1 || count >= Titem_.count) {
				//Childs
				free_childs(Cclass_item, id);
				//Delete
				if (Titem_.h !== null) FreeEntity(Titem_.h);
				Delete(Titem, Titem_);
				//Ok
				return 1;
			} else {
				Titem_.count = Titem_.count - count;
				return 1;
			}
		}
	}
	return 0;
}

//### Update Items
/** Function update_items() */
export function update_items(): void {
	let i = 0;
	let h: Handle = null;
	let tery = 0;

	for (i = 1; i <= G.g_itemlistc; i++) {
		h = G.g_itemlist[i]!.h;

		//Fall
		TranslateEntity(h, 0, f32(-f32(f32(Cworld_g * G.f) * f32(0.6))), 0);

		//On Ground
		tery = f32(e_tery(EntityX(h), EntityZ(h)));
		if (EntityY(h) < f32(tery + 5)) {
			PositionEntity(h, EntityX(h), tery, EntityZ(h));
		}
	}
}

//### Determine Serial Peak
/** Function serialpeak_item() */
export function serialpeak_item(): void {
	let peak = 0;
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.id > peak) peak = Titem_.id;
	}
	G.item_serial = peak;
}

//### Damage Item
/** Function damage_item(damage#,kill=0,pickcords=0) */
export function damage_item(damage: number, kill: number = 0, pickcords: number = 0): number {
	let Tkill: Titem | null = null;
	let tmp_killpivot: Handle = null;

	//FX
	if (pickcords === 1) {
		material_fx(G.in_px, G.in_py, G.in_pz, Ditem_mat(G.TCitem!.typ));
	} else if (pickcords === 0) {
		material_fx(EntityX(G.TCitem!.h), EntityY(G.TCitem!.h), EntityZ(G.TCitem!.h), Ditem_mat(G.TCitem!.typ));
	}
	//Just Seperate?
	if (kill === 0) {
		if (G.TCitem!.parent_class !== 0) {
			if (G.TCitem!.parent_mode === Cpm_out) {
				//Event: on:use
				G.p_skipevent = 0;
				set_parsecache(Cclass_item, G.TCitem!.id, 'separate');
				if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'separate')) {
					parse_task(Cclass_item, G.TCitem!.id, 'separate', '', Ditem_script(G.TCitem!.typ));
					parse_sel(Cclass_item, G.TCitem!.id, 'separate');
				}
				if (G.p_skipevent === 0) {
					// quirk: parent_mode stays as it is
					G.TCitem!.parent_class = 0;
					G.TCitem!.parent_id = 0;
					return 0;
				}
			}
		}
	}
	//Decrease Health
	if (get_state(Cstate_invulnerability, Cclass_item, G.TCitem!.id) === 0) {
		G.TCitem!.health = f32(G.TCitem!.health - damage);
		if (G.TCitem!.health <= 0) {
			if (G.TCitem!.count > 1) {
				G.TCitem!.count = G.TCitem!.count - 1;
				G.TCitem!.health = f32(Ditem_health(G.TCitem!.typ));
			}
		}
	}
	//Kill?
	if (G.TCitem!.health <= 0 || kill === 1) {
		//Event: on:kill
		Tkill = G.TCitem;
		set_parsecache(Cclass_item, G.TCitem!.id, 'kill');
		if (Instr(Ditem_scriptk(G.TCitem!.typ), SEP_LINE + 'kill')) {
			parse_task(Cclass_item, G.TCitem!.id, 'kill', '', Ditem_script(G.TCitem!.typ));
			//parse_sel(Cclass_item,TCitem\id,"kill")
		}
		tmp_killpivot = CreatePivot();
		PositionEntity(tmp_killpivot, EntityX(Tkill!.h), EntityY(Tkill!.h), EntityZ(Tkill!.h));
		RotateEntity(tmp_killpivot, EntityPitch(Tkill!.h), EntityYaw(Tkill!.h), EntityRoll(Tkill!.h));
		G.tmp_h = null;
		G.tmp_killclass = Cclass_item;
		G.tmp_killid = Tkill!.id;
		G.tmp_killmodel = tmp_killpivot;
		free_item(Tkill!.id);
		parse_kill_add(G.tmp_killclass, G.tmp_killid, G.tmp_killmodel);
		G.tmp_kill = 1;
		return 2;
	}
	return 1;
}

//### Is Tool?
/** Function item_istool(behaviour$) */
export function item_istool(behaviour: string): number {
	switch (behaviour) {
		case 'tool':
			return 1;
		case 'weapon':
			return 1;
		case 'hammer':
			return 1;
		case 'slowblade':
			return 1;
		case 'blade':
			return 1;
		case 'fastblade':
			return 1;
		case 'slingshot':
			return 1;
		case 'bow':
			return 1;
		case 'launcher':
			return 1;
		case 'catapult':
			return 1;
		case 'pistol':
			return 1;
		case 'gun':
			return 1;
		case 'machinegun':
			return 1;
		case 'spear':
			return 1;
		case 'selfthrow':
			return 1;
		case 'spade':
			return 1;
		case 'fishingrod':
			return 1;
		case 'net':
			return 1;
		case 'torch':
			return 1;
		//Case "throw" Return 1
		default:
			return 0;
	}
}

//### Get Random Stored Item
/** Function item_getrandom(parent_class,parent_id) */
export function item_getrandom(parent_class: number, parent_id: number): number {
	let c = 0;
	let Titem_: Titem | null = null;
	let rnum = 0;

	//Find and Count
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === parent_class) {
			if (Titem_.parent_id === parent_id) {
				c = c + 1;
			}
		}
	}
	//No Item?
	if (c === 0) return 0;
	//Get Random
	rnum = Rand(1, c);
	//Select and Cache
	c = 0;
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === parent_class) {
			if (Titem_.parent_id === parent_id) {
				c = c + 1;
				//Return
				if (c === rnum) {
					G.TCitem = Titem_;
					return 1;
				}
			}
		}
	}
	return 0;
}

//### Frap Routine
/** Function frap_item() */
export function frap_item(): void {
	let Titem_: Titem | null = null;
	let h: Handle = null;
	let size = 0;
	let piv: Handle = null;
	let rx = 0;
	let ry = 0;
	let rz = 0;
	let rx2d = 0;
	let ry2d = 0;
	let px = 0;
	let py = 0;
	let s = 0;
	// eslint-disable-next-line @typescript-eslint/no-unused-vars
	let shift = 0;
	let mhp: Handle = null;

	Titem_ = G.TCitem;

	//Setup
	h = Titem_!.h;
	size = 20;
	// quirk: this pivot is never freed
	piv = CreatePivot();
	rx = EntityX(h);
	ry = EntityY(h);
	rz = EntityZ(h);
	CameraProject(G.cam, rx, ry, rz);
	rx2d = Int(ProjectedX());
	ry2d = Int(ProjectedY());
	RotateEntity(piv, EntityPitch(h, 1), EntityYaw(h, 1), EntityRoll(h, 1));

	s = 0.25;
	// quirk: shift is read but never used for items (frap_info rotates without shift)
	shift = KeyDown(42) + KeyDown(54);

	if (EntityInView(Titem_!.h, G.cam)) {
		if (rx2d > G.in_editor_sidebar * 210) {
			if (ry2d > 0) {
				//(1) Red Pitch
				Color(255, 0, 0);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, size, 0, 0);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				// quirk: 210 here, in_editor_sidebar*210 for the other axes
				if (px > 210) {
					if (py > 0) {
						Line(rx2d, ry2d, px, py);
						DrawImage(G.gfx_ex, px, py);

						if (G.in_frapdown === 0) {
							if (G.in_mx > px - 5) {
								if (G.in_my > py - 5) {
									if (G.in_mx < px + 5) {
										if (G.in_my < py + 5) {
											DrawImage(G.gfx_esel, px, py);
											if (G.in_mdown[1]) {
												G.in_mx = px;
												G.in_mxo = G.in_mx;
												G.in_my = py;
												G.in_myo = G.in_my;
												G.in_frapdown = 1;
												G.in_cursorf = 2;
												MoveEntity(h, f32(f32(G.in_mxs + G.in_mys) * s), 0, 0);
											}
										}
									}
								}
							}
						} else if (G.in_frapdown === 1) {
							DrawImage(G.gfx_esel, px, py);
							if (G.in_mdown[1]) {
								G.in_mx = px;
								G.in_mxo = G.in_mx;
								G.in_my = py;
								G.in_myo = G.in_my;
								G.in_frapdown = 1;
								G.in_cursorf = 2;
								MoveEntity(h, f32(f32(G.in_mxs + G.in_mys) * s), 0, 0);
							}
						}
					}
				}

				//(2) Green Yaw
				Color(0, 255, 0);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, 0, size, 0);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				if (px > G.in_editor_sidebar * 210) {
					if (py > 0) {
						Line(rx2d, ry2d, px, py);
						DrawImage(G.gfx_ey, px, py);

						if (G.in_frapdown === 0) {
							if (G.in_mx > px - 5) {
								if (G.in_my > py - 5) {
									if (G.in_mx < px + 5) {
										if (G.in_my < py + 5) {
											DrawImage(G.gfx_esel, px, py);
											if (G.in_mdown[1]) {
												G.in_mx = px;
												G.in_mxo = G.in_mx;
												G.in_my = py;
												G.in_myo = G.in_my;
												G.in_frapdown = 2;
												G.in_cursorf = 2;
												MoveEntity(h, 0, f32(f32(G.in_mxs + G.in_mys) * s), 0);
											}
										}
									}
								}
							}
						} else if (G.in_frapdown === 2) {
							DrawImage(G.gfx_esel, px, py);
							if (G.in_mdown[1]) {
								G.in_mx = px;
								G.in_mxo = G.in_mx;
								G.in_my = py;
								G.in_myo = G.in_my;
								G.in_frapdown = 2;
								G.in_cursorf = 2;
								MoveEntity(h, 0, f32(f32(G.in_mxs + G.in_mys) * s), 0);
							}
						}
					}
				}

				//(3) Blue Roll
				Color(0, 0, 255);
				PositionEntity(piv, rx, ry, rz);
				MoveEntity(piv, 0, 0, size);
				CameraProject(G.cam, EntityX(piv), EntityY(piv), EntityZ(piv));
				px = Int(ProjectedX());
				py = Int(ProjectedY());
				if (px > G.in_editor_sidebar * 210) {
					if (py > 0) {
						Line(rx2d, ry2d, px, py);
						DrawImage(G.gfx_ez, px, py);

						if (G.in_frapdown === 0) {
							if (G.in_mx > px - 5) {
								if (G.in_my > py - 5) {
									if (G.in_mx < px + 5) {
										if (G.in_my < py + 5) {
											DrawImage(G.gfx_esel, px, py);
											if (G.in_mdown[1]) {
												G.in_mx = px;
												G.in_mxo = G.in_mx;
												G.in_my = py;
												G.in_myo = G.in_my;
												G.in_frapdown = 3;
												G.in_cursorf = 2;
												MoveEntity(h, 0, 0, f32(f32(G.in_mxs + G.in_mys) * s));
											}
										}
									}
								}
							}
						} else if (G.in_frapdown === 3) {
							DrawImage(G.gfx_esel, px, py);
							if (G.in_mdown[1]) {
								G.in_mx = px;
								G.in_mxo = G.in_mx;
								G.in_my = py;
								G.in_myo = G.in_my;
								G.in_frapdown = 3;
								G.in_cursorf = 2;
								MoveEntity(h, 0, 0, f32(f32(G.in_mxs + G.in_mys) * s));
							}
						}
					}
				}

				//(4) Green Center Position
				px = rx2d;
				py = ry2d;
				DrawImage(G.gfx_ey, px, py);

				if (G.in_frapdown === 0) {
					if (G.in_mx > px - 5) {
						if (G.in_my > py - 5) {
							if (G.in_mx < px + 5) {
								if (G.in_my < py + 5) {
									DrawImage(G.gfx_esel, px, py);
									if (G.in_mdown[1]) {
										G.in_mx = px;
										G.in_mxo = G.in_mx;
										G.in_my = py;
										G.in_myo = G.in_my;
										G.in_frapdown = 4;
										G.in_cursorf = 2;
										TranslateEntity(h, 0, f32(-G.in_mys * s), 0);
										mhp = CreatePivot();
										PositionEntity(mhp, EntityX(h), 0, EntityZ(h));
										RotateEntity(mhp, 0, EntityYaw(G.cam), 0);
										MoveEntity(mhp, f32(-G.in_mxs * s), 0, f32(G.in_mzs * s));
										PositionEntity(h, EntityX(mhp), EntityY(h), EntityZ(mhp));
										FreeEntity(mhp);
									}
								}
							}
						}
					}
				} else if (G.in_frapdown === 4) {
					DrawImage(G.gfx_esel, px, py);
					if (G.in_mdown[1]) {
						G.in_mx = px;
						G.in_mxo = G.in_mx;
						G.in_my = py;
						G.in_myo = G.in_my;
						G.in_frapdown = 4;
						G.in_cursorf = 2;
						TranslateEntity(h, 0, f32(-G.in_mys * s), 0);
						mhp = CreatePivot();
						PositionEntity(mhp, EntityX(h), 0, EntityZ(h));
						RotateEntity(mhp, 0, EntityYaw(G.cam), 0);
						MoveEntity(mhp, f32(-G.in_mxs * s), 0, f32(G.in_mzs * s));
						PositionEntity(h, EntityX(mhp), EntityY(h), EntityZ(mhp));
						FreeEntity(mhp);
					}
				}

				//Name
				if (G.in_frapdown === 0) {
					CameraProject(G.cam, EntityX(Titem_!.h), EntityY(Titem_!.h), EntityZ(Titem_!.h));
					bmpf_txt_c(Int(ProjectedX()), Int(f32(ProjectedY() - 30)), '#' + Str(Titem_!.id) + ' ' + Ditem_name(Titem_!.typ), Cbmpf_tiny);
				}

				//Info
				G.in_edoverinfo = ss(se(197), Ditem_name(Titem_!.typ));
			}
		}
	}

	//Free
	if (KeyHit(211)) {
		free_item(Titem_!.id);
		G.in_fraph = null;
	}

	//Leave FRAP Mode
	if (KeyHit(57)) G.in_fraph = null;
}

//Reset Item Physics
/** Function item_phyreset() */
export function item_phyreset(): void {
	let Titem_: Titem | null = null;

	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		Titem_.phy_pause = 0;
	}
}
