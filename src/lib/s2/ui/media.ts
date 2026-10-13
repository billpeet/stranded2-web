/**
 * Port of includes/load_media.bb and the image loaders of
 * includes/load_functions.bb.
 *
 * The 2D images (gfx_* globals drawn with DrawImage) are loaded and composed
 * here exactly as the original does. Textures, meshes and sounds belong to
 * the 3D and audio parts of the port; they are listed in MEDIA_RESOURCES
 * with the original global names, paths and flags for the integrator.
 */
import {
	BackBuffer,
	Color,
	CreateImage,
	DrawBlock,
	DrawImage,
	FreeImage,
	HandleImage,
	ImageBuffer,
	ImageHeight,
	ImageWidth,
	LoadAnimImage,
	LoadImage,
	LockBuffer,
	MaskImage,
	MidHandle,
	ReadPixelFast,
	Rect,
	SaveImage,
	SetBuffer,
	TileBlock,
	UnlockBuffer,
	WritePixelFast,
	bbInt,
	type BBImage,
	type ImageHandle
} from '../gfx2d';
import type { Vfs } from '../io/Vfs';
import { S } from '../input/state';
import { RuntimeError } from './bb';
import { bmpf_loadscreen } from './bmpf';
import { M } from './gfx';
import { host } from './host';
import { s } from './strings';

export { M } from './gfx';

/**
 * Function load_image(path$,masked=1). Returns at once; the pixels arrive
 * asynchronously (see gfx2d LoadImage). Use load_image_async where the size
 * or content is needed straight away.
 */
export function load_image(path: string, masked = 1): BBImage {
	const image = LoadImage(path);
	if (image === 0) RuntimeError('Unable to load Image ' + path);
	if (masked) MaskImage(image, 255, 0, 255);
	return image;
}

export async function load_image_async(path: string, masked = 1): Promise<BBImage> {
	const image = load_image(path, masked);
	await image.ready;
	if (image.error) RuntimeError(`Unable to load Image ${path} (${image.error})`);
	return image;
}

/** Function load_animimage(path$,w,h,f,masked=1) */
export function load_animimage(path: string, w: number, h: number, f: number, masked = 1): BBImage {
	const image = LoadAnimImage(path, w, h, 0, f);
	if (image === 0) RuntimeError('Unable to load Image ' + path);
	if (masked) MaskImage(image, 255, 0, 255);
	return image;
}

export async function load_animimage_async(path: string, w: number, h: number, f: number, masked = 1): Promise<BBImage> {
	const image = load_animimage(path, w, h, f, masked);
	await image.ready;
	if (image.error) RuntimeError(`Unable to load Image ${path} (${image.error})`);
	return image;
}

/**
 * The 2D part of load_media.bb, in the original order, including the load
 * screens at 8, 10, 12 and 16 percent. Requires load_bmpf() and the string
 * table. `between` runs after every load screen (yield to the browser so
 * the screen is shown).
 */
export async function load_media(vfs: Vfs, between?: () => Promise<void>): Promise<void> {
	const img = load_image_async;
	const set_scrx = S.set_scrx,
		set_scry = S.set_scry;

	// ### Buttons
	M.gfx_bigbutton[0] = await img('sys\\gfx\\bigbutton.bmp');
	M.gfx_bigbutton[1] = await img('sys\\gfx\\bigbutton_over.bmp');
	M.gfx_iconbutton[0] = await img('sys\\gfx\\iconbutton.bmp');
	M.gfx_iconbutton[1] = await img('sys\\gfx\\iconbutton_over.bmp');

	// ### Checkbox
	M.gfx_check[0] = await img('sys\\gfx\\check.bmp');
	M.gfx_check[1] = await img('sys\\gfx\\check_over.bmp');
	M.gfx_check[2] = await img('sys\\gfx\\check_sel.bmp');

	// ### Option
	M.gfx_opt[0] = await img('sys\\gfx\\opt.bmp');
	M.gfx_opt[1] = await img('sys\\gfx\\opt_over.bmp');
	M.gfx_opt[2] = await img('sys\\gfx\\opt_sel.bmp');

	// ### Slider
	M.gfx_slider[0] = await img('sys\\gfx\\slider.bmp');
	M.gfx_slider[1] = await img('sys\\gfx\\slider_over.bmp');
	M.gfx_slider[2] = await img('sys\\gfx\\slider_sel.bmp');
	MidHandle(M.gfx_slider[2]);
	M.gfx_slider[3] = await img('sys\\gfx\\slider_sec.bmp');
	MidHandle(M.gfx_slider[3]);

	// ### Input
	M.gfx_input[0] = await img('sys\\gfx\\input_left.bmp');
	M.gfx_input[1] = await img('sys\\gfx\\input_left_over.bmp');
	M.gfx_input[2] = await img('sys\\gfx\\input_middle.bmp');
	M.gfx_input[3] = await img('sys\\gfx\\input_middle_over.bmp');
	M.gfx_input[4] = await img('sys\\gfx\\input_right.bmp');
	M.gfx_input[5] = await img('sys\\gfx\\input_right_over.bmp');

	// Scroll
	M.gfx_scroll[0] = await img('sys\\gfx\\scroll.bmp');
	M.gfx_scroll[1] = await img('sys\\gfx\\scroll_over.bmp');
	M.gfx_scroll_bar[0] = await img('sys\\gfx\\scroll_bar_top.bmp');
	M.gfx_scroll_bar[1] = await img('sys\\gfx\\scroll_bar_middle.bmp');
	M.gfx_scroll_bar[2] = await img('sys\\gfx\\scroll_bar_bottom.bmp');
	M.gfx_scrollspace = await img('sys\\gfx\\edscrollspace.bmp');

	bmpf_loadscreen(s(1), 8);
	await between?.();

	// ### Icons
	M.gfx_icons = await load_animimage_async('sys\\gfx\\icons.bmp', 32, 32, 100);
	if (!vfs.exists('sys\\gfx\\icons_passive.bmp')) {
		// Generate the greyed-out icon sheet and save it, as the original does on first start.
		const passive = CreateImage(32, 32, 100);
		M.gfx_icons_passive = passive;
		const tempimg = CreateImage(32 * 100, 32);
		for (let i = 0; i <= 99; i++) {
			SetBuffer(ImageBuffer(passive, i));
			DrawBlock(M.gfx_icons, 0, 0, i);
			LockBuffer(ImageBuffer(passive, i));
			for (let x = 0; x <= 31; x++) {
				for (let y = 0; y <= 31; y++) {
					let rgb = ReadPixelFast(x, y);
					let rr = (rgb & 0xff0000) / 0x10000;
					let rg = (rgb & 0xff00) / 0x100;
					let rb = rgb & 0xff;
					if (!((rr === 255 && rg === 0 && rb === 255) || (rr === 248 && rg === 0 && rb === 248))) {
						rr = bbInt((rr + 40) / 2.5);
						rg = bbInt((rg + 20) / 2.5);
						rb = bbInt((rb + 0) / 2.5);
						rgb = rr * 0x10000 + rg * 0x100 + rb;
						WritePixelFast(x, y, rgb);
					}
				}
			}
			UnlockBuffer(ImageBuffer(passive, i));
			SetBuffer(ImageBuffer(tempimg));
			DrawBlock(passive, i * 32, 0, i);
		}
		SaveImage(tempimg, 'sys\\gfx\\icons_passive.bmp');
		FreeImage(tempimg);
	} else {
		M.gfx_icons_passive = await load_animimage_async('sys\\gfx\\icons_passive.bmp', 32, 32, 100);
	}
	MaskImage(M.gfx_icons_passive, 255, 0, 255);
	M.gfx_defaulticon = await img('sys\\gfx\\defaulticon.bmp', 0);

	// ### Borders
	M.gfx_border[0] = await img('sys\\gfx\\border_corn.bmp');
	M.gfx_border[1] = await img('sys\\gfx\\border_hori.bmp');
	M.gfx_border[2] = await img('sys\\gfx\\border_vert.bmp');
	M.gfx_border[3] = CreateImage(set_scrx, 16);
	SetBuffer(ImageBuffer(M.gfx_border[3]));
	TileBlock(M.gfx_border[1]);
	MaskImage(M.gfx_border[3], 255, 0, 255);
	M.gfx_border[4] = CreateImage(16, set_scry);
	SetBuffer(ImageBuffer(M.gfx_border[4]));
	TileBlock(M.gfx_border[2]);
	MaskImage(M.gfx_border[4], 255, 0, 255);

	// ### Cursor
	M.gfx_cursor[0] = await img('sys\\gfx\\cursor.bmp');
	M.gfx_cursor[1] = await img('sys\\gfx\\cursor_height.bmp');
	M.gfx_cursor[2] = await img('sys\\gfx\\cursor_move.bmp');
	M.gfx_cursor[3] = await img('sys\\gfx\\cursor_paint.bmp');
	M.gfx_cursor[4] = await img('sys\\gfx\\cursor_rotate.bmp');
	M.gfx_cursor[5] = await img('sys\\gfx\\cursor_text.bmp');
	HandleImage(M.gfx_cursor[5], 3, 5);
	M.gfx_cursor[6] = await img('sys\\gfx\\cursor_crosshair.bmp');
	MidHandle(M.gfx_cursor[6]);

	// ### Background
	M.gfx_bg[0] = await img('sys\\gfx\\woodback.bmp', 0);
	M.gfx_bg[1] = await img('sys\\gfx\\woodback_dark.bmp', 0);
	M.gfx_paperback = await img('sys\\gfx\\paperback.bmp');

	// ### Windows
	M.gfx_sidebar = CreateImage(210, set_scry);
	SetBuffer(ImageBuffer(M.gfx_sidebar));
	TileBlock(M.gfx_bg[1]);
	Color(255, 0, 255);
	Rect(202, 0, 8, set_scry, 1);
	DrawImage(M.gfx_border[4], 194, 0);
	MaskImage(M.gfx_sidebar, 255, 0, 255);

	M.gfx_win = CreateImage(580, 595);
	SetBuffer(ImageBuffer(M.gfx_win));
	TileBlock(M.gfx_bg[1]);
	Color(255, 0, 255);
	Rect(0, 0, 8, 595, 1);
	Rect(572, 0, 8, 595, 1);
	Rect(0, 587, 580, 8, 1);
	DrawImage(M.gfx_border[3], 0, 579);
	DrawImage(M.gfx_border[4], 0, 0);
	DrawImage(M.gfx_border[4], 564, 0);
	DrawImage(M.gfx_border[0], 0, 579);
	DrawImage(M.gfx_border[0], 564, 579);
	MaskImage(M.gfx_win, 255, 0, 255);

	M.gfx_winbar = CreateImage(580, 16);
	SetBuffer(ImageBuffer(M.gfx_winbar));
	DrawBlock(M.gfx_border[3], 0, 0);
	DrawImage(M.gfx_border[0], 0, 0);
	DrawImage(M.gfx_border[0], 564, 0);
	MaskImage(M.gfx_winbar, 255, 0, 255);

	bmpf_loadscreen(s(1), 10);
	await between?.();

	// ### Bars
	M.gfx_bars = await load_animimage_async('sys\\gfx\\progress_small.bmp', 100, 5, 2);
	M.gfx_bar_hunger = await load_animimage_async('sys\\gfx\\progress_hunger.bmp', 100, 5, 2);
	M.gfx_bar_thirst = await load_animimage_async('sys\\gfx\\progress_thirst.bmp', 100, 5, 2);
	M.gfx_bar_exhaustion = await load_animimage_async('sys\\gfx\\progress_exhaustion.bmp', 100, 5, 2);

	// ### Interface
	M.gfx_if_barback = await img('sys\\gfx\\if_barback.bmp');
	M.gfx_if_itemback = await img('sys\\gfx\\if_itemback.bmp');
	M.gfx_if_itemshade = await img('sys\\gfx\\if_itemshade.bmp');
	M.gfx_if_values = await img('sys\\gfx\\if_values.bmp');
	M.gfx_if_weapon = await img('sys\\gfx\\if_weapon.bmp');
	M.gfx_if_compass = await img('sys\\gfx\\if_compass.bmp');

	// ### States
	M.gfx_state = await load_animimage_async('sys\\gfx\\state.bmp', 21, 21, 9);
	M.gfx_states = await load_animimage_async('sys\\gfx\\states.bmp', 21, 21, 30);

	// ### Arrows
	M.gfx_arrows = await load_animimage_async('sys\\gfx\\arrows.bmp', 16, 16, 12);
	MidHandle(M.gfx_arrows);

	// ### Title
	M.gfx_title = await img('sys\\gfx\\title.bmp');
	MidHandle(M.gfx_title);

	// ### Editor
	M.gfx_ex = await img('sys\\gfx\\editor_x.bmp');
	MidHandle(M.gfx_ex);
	M.gfx_ey = await img('sys\\gfx\\editor_y.bmp');
	MidHandle(M.gfx_ey);
	M.gfx_ez = await img('sys\\gfx\\editor_z.bmp');
	MidHandle(M.gfx_ez);
	M.gfx_esel = await img('sys\\gfx\\editor_sel.bmp');
	MidHandle(M.gfx_esel);

	// ### Tutor
	M.gfx_tutor = await img('sys\\gfx\\tutor.bmp');
	HandleImage(M.gfx_tutor, 1, ImageHeight(M.gfx_tutor));

	// ### Water (2D copy; the texture itself is in MEDIA_RESOURCES)
	M.gfx_waterimg = await img('gfx\\water.jpg');
	M.gfx_waterimg_custom = 0;

	bmpf_loadscreen(s(1), 12);
	await between?.();

	// (particle and sprite textures are loaded here in the original)

	bmpf_loadscreen(s(1), 16);
	await between?.();

	// ### Buffer
	SetBuffer(BackBuffer());
}

/**
 * Function makedark(image,darkf#=4.5): darkened copy of an image; magenta
 * stays magenta. Original quirk kept: width and height are swapped
 * (w=ImageHeight, h=ImageWidth), so it is only correct for square images.
 */
export function makedark(image: ImageHandle, darkf = 4.5): ImageHandle {
	if (image === 0) return 0;
	let w = ImageHeight(image);
	let h = ImageWidth(image);
	const out = CreateImage(w, h);
	w = w - 1;
	h = h - 1;
	SetBuffer(ImageBuffer(out));
	DrawBlock(image, 0, 0);
	LockBuffer(ImageBuffer(out));
	const f = Math.fround;
	for (let x = 0; x <= w; x++) {
		for (let y = 0; y <= h; y++) {
			let rgb = ReadPixelFast(x, y);
			let rr = (rgb & 0xff0000) / 0x10000;
			let rg = (rgb & 0xff00) / 0x100;
			let rb = rgb & 0xff;
			if (!((rr === 255 && rg === 0 && rb === 255) || (rr === 248 && rg === 0 && rb === 248))) {
				rr = bbInt(f(rr / f(darkf)));
				rg = bbInt(f(rg / f(darkf)));
				rb = bbInt(f(rb / f(darkf)));
				rgb = rr * 0x10000 + rg * 0x100 + rb;
				WritePixelFast(x, y, rgb);
			} else {
				rgb = 255 * 0x1000000 + 255 * 0x10000 + 0 * 0x100 + 255;
				WritePixelFast(x, y, rgb);
			}
		}
	}
	UnlockBuffer(ImageBuffer(out));
	return out;
}

/** Function play(sound): sound is the name of the original global ("sfx_click"). */
export function play(sound: string): void {
	host.play(sound);
}

// ---------------------------------------------------------------- 3D / audio resources

/** load_res classes (ressources.bb). */
export const Cres_sound = 'sound',
	Cres_music = 'music';

export interface MediaResource {
	/** Name of the original global, e.g. "gfx_terstruc" or "sfx_step". */
	global: string;
	/** Array index for `Dim`med globals. */
	index?: number;
	path: string;
	kind: 'texture' | 'mesh' | 'sound' | 'music';
	/** LoadTexture flags (load_texture default: 1). */
	flags?: number;
	/** ScaleTexture u,v */
	scale?: [number, number];
	/** TextureBlend mode */
	blend?: number;
	/** LoopSound */
	loop?: boolean;
	/** HideEntity after loading */
	hide?: boolean;
}

function series(global: string, pattern: (i: number) => string, count: number, kind: MediaResource['kind'], first = 0): MediaResource[] {
	const out: MediaResource[] = [];
	for (let i = 0; i < count; i++) out.push({ global, index: i, path: pattern(i + first), kind, ...(kind === 'texture' ? { flags: 1 } : {}) });
	return out;
}
const tex = (global: string, path: string, flags = 1, extra: Partial<MediaResource> = {}): MediaResource => ({
	global,
	path,
	kind: 'texture',
	flags,
	...extra
});
const snd = (global: string, path: string, extra: Partial<MediaResource> = {}): MediaResource => ({
	global,
	path,
	kind: 'sound',
	...extra
});

/** Every texture, mesh and sound global of load_media.bb, in file order. */
export const MEDIA_RESOURCES: MediaResource[] = [
	// ### Structure Tex.
	tex('gfx_terstruc', 'sys\\gfx\\terrainstructure.bmp', 256 + 512, { scale: [2, 2], blend: 5 }),
	tex('gfx_struc', 'sys\\gfx\\structure.bmp', 256 + 512, { scale: [2, 2], blend: 5 }),
	// ### Terrain Dirt Tex.
	tex('gfx_terraindirt', 'sys\\gfx\\terraindirt.bmp', 1, { scale: [0.5, 0.5], blend: 5 }),
	// ### Terrain Ground
	tex('gfx_tergrounddirt', 'sys\\gfx\\terraindirt.bmp', 1, { scale: [30, 30], blend: 5 }),
	// ### Terrain Grassspread Stuff
	tex('gfx_grasspreadtex', 'gfx\\grasspread_a.png'),
	{ global: 'gfx_grasspread', path: 'gfx\\grasspread.b3d', kind: 'mesh', hide: true },
	// ### Water
	tex('gfx_water', 'gfx\\water.jpg', 256 + 512),
	// ### Weather
	tex('gfx_rain', 'sys\\gfx\\rain_a.bmp', 1, { scale: [1, 3] }),
	tex('gfx_snow', 'sys\\gfx\\snow_a.bmp'),
	// ### Particles / Sprites
	...series('gfx_p_flare', (i) => `sprites\\flare${i}_a.bmp`, 3, 'texture'),
	...series('gfx_p_bubbles', (i) => `sprites\\bubbles${i}_a.bmp`, 2, 'texture'),
	...series('gfx_p_roundwave', (i) => `sprites\\roundwave${i}_a.bmp`, 1, 'texture'),
	...series('gfx_p_wave', (i) => `sprites\\wave${i}_a.bmp`, 1, 'texture'),
	...series('gfx_p_smoke', (i) => `sprites\\smoke${i}_a.bmp`, 2, 'texture'),
	...series('gfx_p_spark', (i) => `sprites\\spark${i}_a.bmp`, 1, 'texture'),
	...series('gfx_p_splatter', (i) => `sprites\\splatter${i}_a.bmp`, 3, 'texture'),
	...series('gfx_p_woodfrag', (i) => `sprites\\woodfrag${i}_a.bmp`, 5, 'texture'),
	...series('gfx_p_flames', (i) => `sprites\\flames${i}_a.png`, 1, 'texture'),
	tex('gfx_p_starflare', 'sprites\\starflare_a.bmp'),
	...series('gfx_p_puddle', (i) => `sprites\\puddle${i}_a.bmp`, 1, 'texture'),
	tex('gfx_p_shockwave', 'sprites\\shockwave_a.bmp'),
	...series('gfx_p_splash', (i) => `sprites\\splash${i}_a.bmp`, 1, 'texture'),
	{ global: 'gfx_p_attack', index: 0, path: 'sprites\\attack1_a.bmp', kind: 'texture', flags: 1 },
	{ global: 'gfx_p_attack', index: 1, path: 'sprites\\attack2_a.bmp', kind: 'texture', flags: 1 },
	// ### Moon
	tex('gfx_moon', 'sprites\\moon_a.png'),

	// ############ SYSTEM SFX
	snd('sfx_click', 'sfx\\click.wav'),
	snd('sfx_switch', 'sfx\\switch.wav'),
	snd('sfx_menu', 'sfx\\menu.wav'),
	snd('sfx_fail', 'sfx\\fail.wav'),
	snd('sfx_build', 'sfx\\build.wav'),
	snd('sfx_build_finish', 'sfx\\build_finish.wav'),
	snd('sfx_eat', 'sfx\\eat.wav'),
	snd('sfx_drink', 'sfx\\drink.wav'),
	snd('sfx_swing_fast', 'sfx\\swing_fast.wav'),
	snd('sfx_swing_slow', 'sfx\\swing_slow.wav'),
	snd('sfx_dive', 'sfx\\dive.wav', { loop: true }),
	snd('sfx_collect', 'sfx\\collect.wav'),
	snd('sfx_pistol', 'sfx\\pistol.wav'),
	snd('sfx_splash', 'sfx\\splash.wav'),
	snd('sfx_splash2', 'sfx\\splash2.wav'),
	snd('sfx_blubb', 'sfx\\blubb.wav'),
	snd('sfx_sleep', 'sfx\\sleep.wav'),
	snd('sfx_fire', 'sfx\\fire.wav'),
	snd('sfx_gasp', 'sfx\\gasp.wav'),
	snd('sfx_startdive', 'sfx\\startdive.wav'),
	snd('sfx_drown', 'sfx\\drown.wav'),
	snd('sfx_treefall', 'sfx\\treefall.wav'),
	snd('sfx_fizzle', 'sfx\\fizzle.wav'),
	snd('sfx_launch', 'sfx\\launch.wav'),
	snd('sfx_fish', 'sfx\\fish.wav'),
	snd('sfx_dig', 'sfx\\dig.wav'),
	snd('sfx_rain', 'sfx\\rain.wav', { loop: true }),
	{ global: 'sfx_diary', path: 'sfx\\diary.wav', kind: 'music' },
	...series('sfx_step', (i) => `sfx\\step${i}.wav`, 4, 'sound', 1),
	snd('sfx_waterstep', 'sfx\\waterstep.wav'),
	...series('sfx_woodstep', (i) => `sfx\\woodstep${i}.wav`, 2, 'sound', 1),
	...series('sfx_stonestep', (i) => `sfx\\stonestep${i}.wav`, 2, 'sound', 1),
	snd('sfx_swim', 'sfx\\swim.wav'),
	snd('sfx_fountain', 'sfx\\fountain.wav'),
	...series('sfx_thunder', (i) => `sfx\\thunder${i}.wav`, 3, 'sound', 1),
	snd('sfx_pang', 'sfx\\pang.wav'),
	...series('sfx_wave', (i) => `sfx\\wave${i}.wav`, 3, 'sound', 1),
	...series('sfx_crack', (i) => `sfx\\crack${i}.wav`, 4, 'sound', 1),
	...series('sfx_spark', (i) => `sfx\\spark${i}.wav`, 4, 'sound', 1),
	...series('sfx_explode', (i) => `sfx\\explode${i}.wav`, 5, 'sound', 1),
	...series('sfx_humanhit', (i) => `sfx\\human_hit${i}.wav`, 5, 'sound', 1),
	...series('sfx_humandie', (i) => `sfx\\human_die${i}.wav`, 3, 'sound', 1),
	...series('sfx_mat_wood', (i) => `sfx\\mat_wood${i}.wav`, 2, 'sound', 1),
	...series('sfx_mat_stone', (i) => `sfx\\mat_stone${i}.wav`, 1, 'sound', 1),
	...series('sfx_mat_dust', (i) => `sfx\\mat_dust${i}.wav`, 1, 'sound', 1),
	...series('sfx_mat_metal', (i) => `sfx\\mat_metal${i}.wav`, 1, 'sound', 1),
	...series('sfx_mat_flesh', (i) => `sfx\\mat_flesh${i}.wav`, 5, 'sound', 1),
	...series('sfx_mat_fruit', (i) => `sfx\\mat_fruit${i}.wav`, 2, 'sound', 1),
	...series('sfx_mat_glass', (i) => `sfx\\mat_glass${i}.wav`, 2, 'sound', 1),
	...series('sfx_mat_leaf', (i) => `sfx\\mat_leaf${i}.wav`, 4, 'sound', 1)
];
