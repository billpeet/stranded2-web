/**
 * includes/prepare.bb
 */
import { Int, f32 } from '../blitz';
import { Ditem_afc, Ditem_autofade, Dobject_afc, Dobject_autofade, Dunit_afc, Dunit_autofade } from './defs_arrays';
import { G } from './state';

/** Function prepare_cache_viewranges(): Cache Viewrange */
export function prepare_cache_viewranges(): void {
	for (let i = 0; i <= G.Cobject_count; i++) {
		// Dobject_afc(i)=(Dobject_autofade(i)*set_viewfac#)+300   (Float result stored in an Int array)
		Dobject_afc.set(i, Int(f32(f32(Dobject_autofade(i) * G.set_viewfac) + 300)));
	}
	for (let i = 0; i <= G.Cunit_count; i++) {
		Dunit_afc.set(i, Int(f32(f32(Dunit_autofade(i) * G.set_viewfac) + 300)));
	}
	for (let i = 0; i <= G.Citem_count; i++) {
		Ditem_afc.set(i, Int(f32(f32(Ditem_autofade(i) * G.set_viewfac) + 300)));
	}
}
