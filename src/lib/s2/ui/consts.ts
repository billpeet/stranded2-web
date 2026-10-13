/** Interface constants from load_const.bb. */

// Font ids (index into the bmpf_* arrays)
export const Cbmpf_norm = 0,
	Cbmpf_over = 1,
	Cbmpf_yellow = 1,
	Cbmpf_dark = 2,
	Cbmpf_red = 3,
	Cbmpf_green = 4,
	Cbmpf_tiny = 5,
	Cbmpf_handwriting = 6,
	Cbmpf_hw = 6;

// Frames of sys\gfx\icons.bmp
export const Cicon_save = 0,
	Cicon_load = 1,
	Cicon_new = 2,
	Cicon_x = 3,
	Cicon_colormap = 4,
	Cicon_heightmap = 5,
	Cicon_stuffmap = 6,
	Cicon_left = 7,
	Cicon_right = 8,
	Cicon_dir = 9,
	Cicon_up = 10,
	Cicon_down = 11,
	Cicon_inc = 12,
	Cicon_dec = 13,
	Cicon_pw = 14,
	Cicon_distort = 15,
	Cicon_options = 16,
	Cicon_ok = 17,
	Cicon_figure = 18,
	Cicon_bag = 19,
	Cicon_tree = 20,
	Cicon_info = 21,
	Cicon_dialog = 22,
	Cicon_smooth = 23,
	Cicon_borderup = 24,
	Cicon_borderdown = 25,
	Cicon_border = 26,
	Cicon_one = 27,
	Cicon_all = 28,
	Cicon_grassmap = 29,
	Cicon_mapaction = 30,
	Cicon_script = 31,
	Cicon_ext = 32,
	Cicon_entity = 33,
	Cicon_check = 41,
	Cicon_list = 42,
	Cicon_build = 44,
	Cicon_cam = 45,
	Cicon_brush = 46,
	Cicon_spray = 47,
	Cicon_sun = 48,
	Cicon_moon = 49,
	Cicon_update = 50,
	Cicon_file = 51,
	Cicon_parentdir = 52,
	Cicon_soundfile = 53,
	Cicon_imagefile = 54,
	Cicon_stranded = 55,
	Cicon_zoom = 56,
	Cicon_settoterrain = 57,
	Cicon_flatten = 58,
	Cicon_updown = 59,
	Cicon_trange = 60,
	Cicon_ttime = 61,
	Cicon_tcount = 62,
	Cicon_sleep = 63,
	Cicon_ex1 = 64,
	Cicon_ex5 = 65,
	Cicon_exall = 66,
	Cicon_map = 67,
	Cicon_select = 68,
	Cicon_s2script = 73,
	Cicon_plotbrush = 74,
	Cicon_linebrush = 75,
	Cicon_globe = 76,
	Cicon_hand = 77,
	Cicon_eat = 80;

/**
 * In-string separators. The GitHub copy of the source shows them mis-encoded
 * ("Ś" and "ś"); the bytes below are confirmed from the shipped binary's
 * string constants (out/code.bin) and from the numeric tests in the source
 * itself (`sign=166`, `sign=182`).
 */
export { SEP_LINE } from '../blitz'; // 0xA6, line separator ("Ś" in the listing)
export const SEP_BREAK = '¶'; // 0xB6, forced break inside bmpf_txt_rect ("ś" in a comment only)
/** "ÄäÖöÜüß" (bytes C4 E4 D6 F6 DC FC DF in the binary): extra characters accepted by text inputs. */
export const UMLAUTS = 'ÄäÖöÜüß';
