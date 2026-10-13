/**
 * includes/parentchild.bb - PARENT/CHILD STUFF.
 * Line-by-line port (PORTING_GUIDE.md). Package entities1.
 */
import {
	CountSurfaces,
	CountVertices,
	EntityX,
	EntityY,
	EntityZ,
	FindChild,
	GetSurface,
	MeshDepth,
	MeshHeight,
	MeshWidth,
	PositionEntity,
	ShowEntity,
	TFormPoint,
	TFormedX,
	TFormedY,
	TFormedZ,
	VertexX,
	VertexY,
	VertexZ,
	type Handle,
	type Surface
} from '../bb3d';
import { Rand, Rnd, f32, imod } from '../blitz';
import { Cclass_info, Cclass_item, Cclass_object, Cclass_state, Cclass_unit, Cpm_in, Cpm_out } from './consts';
import { Ditem_mat, Ditem_state, Dobject_mat, Dobject_state, Dunit_mat, Dunit_state } from './defs_arrays';
import { free_item } from './handle_items';
import { free_state } from './handle_states';
import { G } from './state';
import { After, Delete, First, Tfrap, Tinfo, Titem, Tobject, Tstate, Ttimer, Tunit, Tup, Tx } from './types';

//############################################ PARENT/CHILD STUFF

//### Parent H (Get Handle of Parent)
/** Function parent_h(parentclass,parentid,model=0) */
export function parent_h(parentclass: number, parentid: number, model: number = 0): Handle {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (parentclass) {
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === parentid) return Tobject_.h;
			}
			break;
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parentid) {
					if (model === 1) {
						return Tunit_.mh;
					} else {
						return Tunit_.h;
					}
				}
			}
			break;
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === parentid) return Titem_.h;
			}
			break;
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === parentid) {
					if (model === 1) {
						if (FindChild(Tinfo_.h, 'model') !== null) {
							return FindChild(Tinfo_.h, 'model');
						} else {
							return Tinfo_.h;
						}
					} else {
						return Tinfo_.h;
					}
				}
			}
			break;
	}
	return null;
}

//### Parent Position (Get Position of Parent)
/** Function parent_pos(parentclass,parentid) */
export function parent_pos(parentclass: number, parentid: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (parentclass) {
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === parentid) {
					G.tmp_x = f32(EntityX(Tobject_.h));
					G.tmp_y = f32(EntityY(Tobject_.h));
					G.tmp_z = f32(EntityZ(Tobject_.h));
					return 1;
				}
			}
			break;
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parentid) {
					G.tmp_x = f32(EntityX(Tunit_.h));
					G.tmp_y = f32(EntityY(Tunit_.h));
					G.tmp_z = f32(EntityZ(Tunit_.h));
					return 1;
				}
			}
			break;
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === parentid) {
					G.tmp_x = f32(EntityX(Titem_.h));
					G.tmp_y = f32(EntityY(Titem_.h));
					G.tmp_z = f32(EntityZ(Titem_.h));
					return 1;
				}
			}
			break;
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				// quirk: compares the entity handle Tinfo\h (not Tinfo\id) with the id: an info is never found (a handle is a memory address)
				if ((Tinfo_.h as unknown) === parentid) {
					G.tmp_x = f32(EntityX(Tinfo_.h));
					G.tmp_y = f32(EntityY(Tinfo_.h));
					G.tmp_z = f32(EntityZ(Tinfo_.h));
					return 1;
				}
			}
			break;
	}
	return 0;
}

//### Parent Con (Cache in Container Var)
/** Function parent_con(parentclass,parentid) */
export function parent_con(parentclass: number, parentid: number): number {
	// quirk: the container globals are the loop variables: when the id is not found the TC* of that class is Null afterwards
	switch (parentclass) {
		case Cclass_object:
			for (G.TCobject = First(Tobject); G.TCobject !== null; G.TCobject = After(Tobject, G.TCobject)) {
				if (G.TCobject.id === parentid) return 1;
			}
			break;
		case Cclass_unit:
			for (G.TCunit = First(Tunit); G.TCunit !== null; G.TCunit = After(Tunit, G.TCunit)) {
				if (G.TCunit.id === parentid) return 1;
			}
			break;
		case Cclass_item:
			for (G.TCitem = First(Titem); G.TCitem !== null; G.TCitem = After(Titem, G.TCitem)) {
				if (G.TCitem.id === parentid) return 1;
			}
			break;
		case Cclass_info:
			for (G.TCinfo = First(Tinfo); G.TCinfo !== null; G.TCinfo = After(Tinfo, G.TCinfo)) {
				if (G.TCinfo.id === parentid) return 1;
			}
			break;
	}
	return 0;
}

//### Parent State Position (Get State Position of an Object)
/** Function parent_statepos(parentclass,parentid) */
export function parent_statepos(parentclass: number, parentid: number): number {
	let Tobject_: Tobject | null = null;
	let surf: Surface | null = null;
	let vertices = 0;
	let vertex = 0;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (parentclass) {
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === parentid) {
					G.tmp_ry = f32(EntityY(Tobject_.h) + Dobject_state(Tobject_.typ, 2));
					if (Dobject_state(Tobject_.typ, 0) === 1) {
						G.tmp_x = f32(EntityX(Tobject_.h) + Dobject_state(Tobject_.typ, 1));
						G.tmp_y = f32(EntityY(Tobject_.h) + Dobject_state(Tobject_.typ, 2));
						G.tmp_z = f32(EntityZ(Tobject_.h) + Dobject_state(Tobject_.typ, 3));
						return 1;
					} else {
						surf = GetSurface(Tobject_.h, Rand(1, CountSurfaces(Tobject_.h)));
						vertices = CountVertices(surf) - 1;
						vertex = Rand(0, vertices);
						G.tmp_x = f32(VertexX(surf, vertex));
						G.tmp_y = f32(VertexY(surf, vertex));
						G.tmp_z = f32(VertexZ(surf, vertex));
						TFormPoint(G.tmp_x, G.tmp_y, G.tmp_z, Tobject_.h, null);
						G.tmp_x = f32(TFormedX());
						G.tmp_y = f32(TFormedY());
						G.tmp_z = f32(TFormedZ());
						return 1;
					}
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parentid) {
					G.tmp_ry = f32(EntityY(Tunit_.h) + Dunit_state(Tunit_.typ, 2));
					if (Dunit_state(Tunit_.typ, 0) === 1) {
						G.tmp_x = f32(EntityX(Tunit_.h) + Dunit_state(Tunit_.typ, 1));
						G.tmp_y = f32(EntityY(Tunit_.h) + Dunit_state(Tunit_.typ, 2));
						G.tmp_z = f32(EntityZ(Tunit_.h) + Dunit_state(Tunit_.typ, 3));
						return 1;
					} else {
						surf = GetSurface(Tunit_.mh, 1);
						vertices = CountVertices(surf) - 1;
						vertex = Rand(0, vertices);
						G.tmp_x = f32(VertexX(surf, vertex));
						G.tmp_y = f32(VertexY(surf, vertex));
						G.tmp_z = f32(VertexZ(surf, vertex));
						TFormPoint(G.tmp_x, G.tmp_y, G.tmp_z, Tunit_.mh, null);
						G.tmp_x = f32(TFormedX());
						G.tmp_y = f32(TFormedY());
						G.tmp_z = f32(TFormedZ());
						return 1;
					}
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === parentid) {
					G.tmp_ry = f32(EntityY(Titem_.h) + Ditem_state(Titem_.typ, 2));
					if (Ditem_state(Titem_.typ, 0) === 1) {
						G.tmp_x = f32(EntityX(Titem_.h) + Ditem_state(Titem_.typ, 1));
						G.tmp_y = f32(EntityY(Titem_.h) + Ditem_state(Titem_.typ, 2));
						G.tmp_z = f32(EntityZ(Titem_.h) + Ditem_state(Titem_.typ, 3));
						return 1;
					} else {
						surf = GetSurface(Titem_.h, 1);
						vertices = CountVertices(surf) - 1;
						vertex = Rand(0, vertices);
						G.tmp_x = f32(VertexX(surf, vertex));
						G.tmp_y = f32(VertexY(surf, vertex));
						G.tmp_z = f32(VertexZ(surf, vertex));
						TFormPoint(G.tmp_x, G.tmp_y, G.tmp_z, Titem_.h, null);
						G.tmp_x = f32(TFormedX());
						G.tmp_y = f32(TFormedY());
						G.tmp_z = f32(TFormedZ());
						return 1;
					}
				}
			}
			break;
		//Info
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === parentid) {
					G.tmp_x = f32(EntityX(Tinfo_.h));
					G.tmp_y = f32(EntityY(Tinfo_.h));
					G.tmp_z = f32(EntityZ(Tinfo_.h));
					G.tmp_ry = G.tmp_y;
					return 1;
				}
			}
			break;
	}
	return 0;
}

//### Is Parent State Position Static?
/** Function parent_stateposstatic(parentclass,parentid) */
export function parent_stateposstatic(parentclass: number, parentid: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;

	switch (parentclass) {
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === parentid) {
					if (Dobject_state(Tobject_.typ, 0) === 1) {
						return 1;
					} else {
						return 0;
					}
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parentid) {
					if (Dunit_state(Tunit_.typ, 0) === 1) {
						return 1;
					} else {
						return 0;
					}
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === parentid) {
					// quirk: a "static?" question that also sets tmp_ry for items
					G.tmp_ry = f32(EntityY(Titem_.h) + Ditem_state(Titem_.typ, 2));
					if (Ditem_state(Titem_.typ, 0) === 1) {
						return 1;
					} else {
						return 0;
					}
				}
			}
			break;
		//Info
		case Cclass_info:
			return 1;
	}
	return 0;
}

//### Parent State Position by Vertex
/** Function parent_stateposvertex(parentclass,parentid,randomoffset#=5.) */
export function parent_stateposvertex(parentclass: number, parentid: number, randomoffset: number = 5): number {
	let Tobject_: Tobject | null = null;
	let surf: Surface | null = null;
	let vertices = 0;
	let vertex = 0;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;
	let Tinfo_: Tinfo | null = null;

	switch (parentclass) {
		//Object
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === parentid) {
					G.tmp_ry = f32(EntityY(Tobject_.h) + Dobject_state(Tobject_.typ, 2));
					surf = GetSurface(Tobject_.h, Rand(1, CountSurfaces(Tobject_.h)));
					vertices = CountVertices(surf) - 1;
					vertex = Rand(0, vertices);
					G.tmp_x = f32(VertexX(surf, vertex));
					G.tmp_y = f32(VertexY(surf, vertex));
					G.tmp_z = f32(VertexZ(surf, vertex));
					TFormPoint(G.tmp_x, G.tmp_y, G.tmp_z, Tobject_.h, null);
					G.tmp_x = f32(TFormedX());
					G.tmp_y = f32(TFormedY());
					G.tmp_z = f32(TFormedZ());
					return 1;
				}
			}
			break;
		//Unit
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parentid) {
					G.tmp_ry = f32(EntityY(Tunit_.h) + Dunit_state(Tunit_.typ, 2));
					surf = GetSurface(Tunit_.mh, 1);
					vertices = CountVertices(surf) - 1;
					vertex = Rand(0, vertices);
					G.tmp_x = f32(VertexX(surf, vertex));
					G.tmp_y = f32(VertexY(surf, vertex));
					G.tmp_z = f32(VertexZ(surf, vertex));
					TFormPoint(G.tmp_x, G.tmp_y, G.tmp_z, Tunit_.mh, null);
					G.tmp_x = f32(TFormedX());
					G.tmp_y = f32(TFormedY());
					G.tmp_z = f32(TFormedZ());
					return 1;
				}
			}
			break;
		//Item
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === parentid) {
					G.tmp_ry = f32(EntityY(Titem_.h) + Ditem_state(Titem_.typ, 2));
					surf = GetSurface(Titem_.h, 1);
					vertices = CountVertices(surf) - 1;
					vertex = Rand(0, vertices);
					G.tmp_x = f32(VertexX(surf, vertex));
					G.tmp_y = f32(VertexY(surf, vertex));
					G.tmp_z = f32(VertexZ(surf, vertex));
					TFormPoint(G.tmp_x, G.tmp_y, G.tmp_z, Titem_.h, null);
					G.tmp_x = f32(TFormedX());
					G.tmp_y = f32(TFormedY());
					G.tmp_z = f32(TFormedZ());
					return 1;
				}
			}
			break;
		//Info
		case Cclass_info:
			for (Tinfo_ = First(Tinfo); Tinfo_ !== null; Tinfo_ = After(Tinfo, Tinfo_)) {
				if (Tinfo_.id === parentid) {
					G.tmp_x = f32(EntityX(Tinfo_.h) + Rnd(f32(-randomoffset), randomoffset));
					G.tmp_y = f32(EntityY(Tinfo_.h) + Rnd(f32(-randomoffset), randomoffset));
					G.tmp_z = f32(EntityZ(Tinfo_.h) + Rnd(f32(-randomoffset), randomoffset));
					G.tmp_ry = G.tmp_y;
					return 1;
				}
			}
			break;
	}
	return 0;
}

//### Parent Material
/** Function parent_material(parentclass,parentid) */
export function parent_material(parentclass: number, parentid: number): number {
	let Tobject_: Tobject | null = null;
	let Tunit_: Tunit | null = null;
	let Titem_: Titem | null = null;

	switch (parentclass) {
		case Cclass_object:
			for (Tobject_ = First(Tobject); Tobject_ !== null; Tobject_ = After(Tobject, Tobject_)) {
				if (Tobject_.id === parentid) return Dobject_mat(Tobject_.typ);
			}
			break;
		case Cclass_unit:
			for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
				if (Tunit_.id === parentid) return Dunit_mat(Tunit_.typ);
			}
			break;
		case Cclass_item:
			for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
				if (Titem_.id === parentid) return Ditem_mat(Titem_.typ);
			}
			break;
	}
	return 0;
}

//### Drop Childs (Childs=Items)
/** Function drop_childs(parentclass,parentid,in=0,h=0) */
export function drop_childs(parentclass: number, parentid: number, in_: number = 0, h: Handle = null): void {
	let Titem_: Titem | null = null;
	let xs = 0;
	let ys = 0;
	let zs = 0;
	let sz = 0;
	// not locals of the original: the argument values of the PositionEntity call below
	let argx = 0;
	let argy = 0;
	let argz = 0;

	//Drop Outside Object
	for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
		if (Titem_.parent_class === parentclass) {
			if (Titem_.parent_id === parentid) {
				if (Titem_.parent_mode === Cpm_out) {
					Titem_.parent_class = 0;
					Titem_.parent_id = 0;
					Titem_.phy_pause = 0;
				}
			}
		}
	}
	//Drop Inside Objects
	if (in_ === 1) {
		xs = f32(MeshWidth(h) / 2);
		ys = f32(MeshHeight(h));
		zs = f32(MeshDepth(h) / 2);
		void ys;
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === parentclass) {
				if (Titem_.parent_id === parentid) {
					if (Titem_.parent_mode === Cpm_in) {
						// PositionEntity Titem\h,EntityX(h)+Rnd(-xs#,xs#),EntityY(h)+Rnd(xs#),EntityZ(h)+Rnd(-zs#,sz#)
						// quirk: the height uses Rnd(xs#) (not ys#); sz# is a misspelled zs#, a fresh local that is 0: z is offset by Rnd(-zs,0)
						// exe: the compiled code evaluates the arguments in the order y, z, x (drop_childs in the executable),
						// which decides which random number goes into which coordinate
						argy = f32(EntityY(h) + Rnd(xs));
						argz = f32(EntityZ(h) + Rnd(f32(-zs), sz));
						argx = f32(EntityX(h) + Rnd(f32(-xs), xs));
						PositionEntity(Titem_.h, argx, argy, argz);
						ShowEntity(Titem_.h);
						Titem_.parent_class = 0;
						Titem_.parent_id = 0;
						Titem_.phy_pause = 0;
					}
				}
			}
		}
	}
}

//### Free Childs
/** Function free_childs(parent_class,parent_id) */
export function free_childs(parent_class: number, parent_id: number): void {
	let items = 0;
	let states = 0;
	let scripts = 0;
	let Titem_: Titem | null = null;
	let Tstate_: Tstate | null = null;
	let Tx_: Tx | null = null;
	let Ttimer_: Ttimer | null = null;
	let Tfrap_: Tfrap | null = null;
	let Tup_: Tup | null = null;

	//Scan
	items = 1;
	states = 1;
	scripts = 1;
	switch (parent_class) {
		case Cclass_object:
			break;
		case Cclass_unit:
			break;
		case Cclass_item:
			items = 0;
			break;
		case Cclass_info:
			break;
		case Cclass_state:
			items = 0;
			states = 0;
			break;
	}

	//Free Child Items
	if (items) {
		for (Titem_ = First(Titem); Titem_ !== null; Titem_ = After(Titem, Titem_)) {
			if (Titem_.parent_class === parent_class) {
				if (Titem_.parent_id === parent_id) {
					free_item(Titem_.id);
				}
			}
		}
	}
	//Free Child States
	if (states) {
		for (Tstate_ = First(Tstate); Tstate_ !== null; Tstate_ = After(Tstate, Tstate_)) {
			if (Tstate_.parent_class === parent_class) {
				if (Tstate_.parent_id === parent_id) {
					free_state(Tstate_.typ, parent_class, parent_id);
				}
			}
		}
	}
	//Free Child Scripts and Vars
	if (scripts) {
		for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) {
			if (Tx_.parent_class === parent_class) {
				if (Tx_.parent_id === parent_id) {
					if (imod(Tx_.mode, 2) === 0) {
						if (Tx_.mode < 6) {
							//Mark Locals to be deleted (allows access for on:kill event!)
							if (Tx_.mode === 4) {
								Tx_.typ = 1;
								G.tmp_dumpvars = 1;
								//Delete other Stuff
							} else {
								Delete(Tx, Tx_);
							}
						}
					}
				}
			}
		}
	}
	//Free Child Timers
	for (Ttimer_ = First(Ttimer); Ttimer_ !== null; Ttimer_ = After(Ttimer, Ttimer_)) {
		if (Ttimer_.parent_class === parent_class) {
			if (Ttimer_.parent_id === parent_id) {
				Delete(Ttimer, Ttimer_);
			}
		}
	}
	//Free Child FRAPs
	for (Tfrap_ = First(Tfrap); Tfrap_ !== null; Tfrap_ = After(Tfrap, Tfrap_)) {
		if (Tfrap_.parent_class === parent_class) {
			if (Tfrap_.parent_id === parent_id) {
				Delete(Tfrap, Tfrap_);
				break;
			}
		}
	}
	//Free Units Paths
	if (parent_class === Cclass_unit) {
		for (Tup_ = First(Tup); Tup_ !== null; Tup_ = After(Tup, Tup_)) {
			if (parent_id === Tup_.unit) {
				Delete(Tup, Tup_);
			}
		}
	}
}
