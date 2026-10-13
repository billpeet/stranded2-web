/**
 * The 2D image globals of load_bmpf.bb / load_media.bb, with their original
 * names, on one object (see input/state.ts for why). Filled by
 * load_bmpf() and load_media() in bmpf.ts / media.ts.
 */
import type { ImageHandle } from '../gfx2d';

const arr = (n: number): ImageHandle[] => new Array<ImageHandle>(n + 1).fill(0);

export const M = {
	/** load_bmpf.bb: Global gfx_bar */
	gfx_bar: 0 as ImageHandle,

	gfx_bigbutton: arr(1),
	gfx_iconbutton: arr(1),
	gfx_check: arr(2),
	gfx_opt: arr(2),
	gfx_slider: arr(3),
	gfx_input: arr(5),
	gfx_scroll: arr(1),
	gfx_scroll_bar: arr(2),
	gfx_scrollspace: 0 as ImageHandle,

	gfx_icons: 0 as ImageHandle,
	gfx_icons_passive: 0 as ImageHandle,
	gfx_defaulticon: 0 as ImageHandle,

	gfx_border: arr(4),
	gfx_cursor: arr(6),
	gfx_bg: arr(5),
	gfx_paperback: 0 as ImageHandle,

	gfx_sidebar: 0 as ImageHandle,
	gfx_win: 0 as ImageHandle,
	gfx_winbar: 0 as ImageHandle,

	gfx_bars: 0 as ImageHandle,
	gfx_bar_hunger: 0 as ImageHandle,
	gfx_bar_thirst: 0 as ImageHandle,
	gfx_bar_exhaustion: 0 as ImageHandle,

	gfx_if_barback: 0 as ImageHandle,
	gfx_if_itemback: 0 as ImageHandle,
	gfx_if_itemshade: 0 as ImageHandle,
	gfx_if_values: 0 as ImageHandle,
	gfx_if_weapon: 0 as ImageHandle,
	gfx_if_compass: 0 as ImageHandle,

	gfx_state: 0 as ImageHandle,
	gfx_states: 0 as ImageHandle,
	gfx_arrows: 0 as ImageHandle,
	gfx_title: 0 as ImageHandle,

	gfx_ex: 0 as ImageHandle,
	gfx_ey: 0 as ImageHandle,
	gfx_ez: 0 as ImageHandle,
	gfx_esel: 0 as ImageHandle,

	gfx_tutor: 0 as ImageHandle,

	/** load_image("gfx\water.jpg"): the 2D copy of the water texture. */
	gfx_waterimg: 0 as ImageHandle,
	gfx_waterimg_custom: 0 as ImageHandle
};

export type MediaGlobals = typeof M;
