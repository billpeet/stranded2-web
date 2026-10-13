/**
 * con_add for the modules of the foundation (loaders, runtime). Ported game
 * modules import con_add from './console' directly.
 */
import { con_add as real } from './console';

export function con_add(txt = '', special = -1): void {
	real(txt, special);
}
