<script lang="ts">
	/**
	 * Dev page for the 2D layer: an 800x600 stage drawn only with the Blitz 2D
	 * emulation (fonts, load screen, every gui_* widget, the modal windows),
	 * wired to live input. The gradient behind the stage stands in for the
	 * WebGL canvas so the transparent parts of the 2D layer are visible.
	 *
	 * ?screen=widgets|fonts|loadscreen|textbox selects the start screen.
	 */
	import { onMount } from 'svelte';
	import * as G from '../../../lib/s2/gfx2d';
	import * as I from '../../../lib/s2/input';
	import { load_controls } from '../../../lib/s2/input/controls';
	import { endinput, getinput } from '../../../lib/s2/input/input';
	import { Cclass_item, Cmenu_ed_scripts, Csection_editor, Csection_menu, S } from '../../../lib/s2/input/state';
	import { parseMapHeader } from '../../../lib/s2/formats/map';
	import { HttpVfs, readLines } from '../../../lib/s2/io/Vfs';
	import * as B from '../../../lib/s2/ui/bmpf';
	import * as C from '../../../lib/s2/ui/consts';
	import { M } from '../../../lib/s2/ui/gfx';
	import * as GUI from '../../../lib/s2/ui/gui';
	import * as TB from '../../../lib/s2/ui/gui_tb';
	import { host, makeFileHost, setHost, type Tdefvar, type Tsc, type Tsgr } from '../../../lib/s2/ui/host';
	import { load_image_async, load_media } from '../../../lib/s2/ui/media';
	import { load_keynames, load_strings, s, se, sm } from '../../../lib/s2/ui/strings';

	type Screen = 'widgets' | 'fonts' | 'loadscreen' | 'textbox';

	let canvas: HTMLCanvasElement;
	let stage: HTMLDivElement;
	let error = $state('');
	let ready = $state(false);

	const SAMPLE = 'The quick brown fox jumps over the lazy dog 0123456789 ÄäÖöÜüß !?';
	const LOREM =
		'Stranded II is a survival game. You are stranded on an island and have to find food, build a shelter and survive.' +
		C.SEP_LINE +
		C.SEP_LINE +
		'!1This line uses font 1 (the "!1" prefix).' +
		C.SEP_LINE +
		'!3And this one font 3, followed by a very long line that has to be wrapped at the right border of the text rectangle because it does not fit.' +
		C.SEP_LINE +
		'Press $key_jump to jump and $key_use to use things.' +
		C.SEP_LINE +
		'A-hyphenated-word-breaks-before-the-hyphen-when-the-line-is-full-like-this-one-here.' +
		C.SEP_LINE +
		'Line 8' +
		C.SEP_LINE +
		'Line 9' +
		C.SEP_LINE +
		'Line 10' +
		C.SEP_LINE +
		'Line 11' +
		C.SEP_LINE +
		'Line 12';

	/** A few entries of core\scriptcommands.inf (the file is outside the mod folder and not served). */
	const COMMANDS: [string, string, string][] = [
		['add', 'buffer', ' "Text"'],
		['addstate', 'states', ' "Class", ID, "State"'],
		['alpha', 'models', ' Alpha [, "Class", ID]'],
		['alteritem', 'items', ' Count, Type [, new Count] [, new Type]'],
		['blend', 'models', ' Mode [, "Class", ID]'],
		['button', 'interface', ' ID, Text [,"Icon"] [,"Script"]'],
		['clear', 'buffer, free', ''],
		['con', 'misc', ' "Command"'],
		['count_inrange', 'return, player', ' "Class", Type [,Radius]'],
		['count_stored', 'items, return', ' "Class", ID [,Type]'],
		['create', 'objects, return', ' "Class", Type [, X, Z] [, Count]'],
		['currentclass', 'return', ''],
		['day', 'return', ''],
		['diary', 'diary', ' "Title" [,"Source"]'],
		['distance', 'return', ' "Class", ID, "Class", ID'],
		['echo', 'misc', ' "Text"'],
		['equip', 'interface, player, items', ' [Item Type]'],
		['exec', 'misc', ' "File/Command"'],
		['exists', 'return', ' "Class", ID'],
		['getlocal', 'variables, return', ' "Class", ID, "Variable"'],
		['getx', 'return', ' "Class", ID'],
		['gety', 'return', ' "Class", ID'],
		['getz', 'return', ' "Class", ID'],
		['gotskill', 'skills, player, return', ' "Skill"'],
		['gotstate', 'states, return', ' "Class", ID, "State"'],
		['gt', 'return', ''],
		['msg', 'interface', ' "Message" [,Font] [,Duration]'],
		['scale', 'models', ' X, Y, Z [, "Class", ID]'],
		['seqend', 'sequences', ' Time'],
		['seqmsg', 'sequences', ' Time, "Text" [,Color] [,Position]'],
		['setcam', 'sequences', ' Time, ID'],
		['setlocal', 'variables', ' "Class", ID, "Variable" [,Value]'],
		['setskill', 'skills, player', ' "Skill" [,Value] [,"Name"]'],
		['shininess', 'models', ' Value [, "Class", ID]'],
		['skip', 'basic', ''],
		['skipevent', 'basic', ''],
		['stopmusic', 'sounds', ''],
		['stopsounds', 'sounds', '']
	];

	onMount(() => {
		let disposed = false;
		let detach = () => {};

		(async () => {
			const vfs = await HttpVfs.open();
			if (disposed) return;

			// --- Blitz runtime
			G.Graphics(S.set_scrx, S.set_scry);
			G.setVfs(vfs);
			G.attachCanvas(canvas);
			I.setInputSize(S.set_scrx, S.set_scry);
			detach = I.attachInput(stage);
			I.HidePointer();
			G.SetBuffer(G.BackBuffer());

			// --- host: the parts of the game the GUI calls into
			let lastsound = '-';
			const conlog: string[] = [];
			const vars = new Map<string, string>([['L:2:7:mood', '3']]);
			const manifest = (await (await fetch('/game/manifest.json')).json()) as { files: Record<string, string> };
			const sc: Tsc[] = COMMANDS.map(([cmd, groups, params]) => ({ cmd, groups, params }));
			const sgr: Tsgr[] = [];
			for (const c of sc) {
				for (const g of c.groups.split(',')) {
					const group = g.trim();
					if (group && !sgr.some((x) => x.group === group)) sgr.push({ group });
				}
			}
			const defvars: Tdefvar[] = [
				{ class: 2, typ: 5, key: 'mood', descr: 'Mood of the unit', defaultval: '0', isglobal: 0 },
				{ class: 2, typ: 5, key: 'gold', descr: 'Gold carried', defaultval: '10', isglobal: 0 },
				{ class: 2, typ: 5, key: 'alarm', descr: 'Island alarm level', defaultval: '0', isglobal: 1 }
			];
			setHost({
				play: (sound) => (lastsound = sound),
				con_add: (txt) => void conlog.push(txt),
				var_rep: (txt) => txt.replace('$day', '12'),
				var_local_get: (cls, id, key) => vars.get(`L:${cls}:${id}:${key}`),
				var_global_get: (key) => vars.get(`G:${key}`),
				var_local_delete: (cls, id, key) => void vars.delete(`L:${cls}:${id}:${key}`),
				var_global_delete: (key) => void vars.delete(`G:${key}`),
				var_set_local: (cls, id, key, v) => void vars.set(`L:${cls}:${id}:${key}`, String(v)),
				var_set: (key, v) => void vars.set(`G:${key}`, String(v)),
				Tdefvar: defvars,
				Tsc: sc,
				Tsgr: sgr,
				...makeFileHost(Object.values(manifest.files)),
				readLines: async (path) => (vfs.exists(path) ? readLines(vfs, path) : null),
				// load_maps(1,mp): every maps\*.s2, then the header of the first one
				async load_maps() {
					host.Tsg = vfs
						.list('maps')
						.filter((f) => f.endsWith('.s2'))
						.map((f) => ({ name: f.slice(0, -3) }));
					if (host.Tsg.length) {
						await host.load_map_header('maps\\' + host.Tsg[0].name + '.s2');
						S.in_opt[0] = 1;
						S.in_win_map = host.Tsg[0].name;
					}
				},
				// load_map_header(path$): date, time and the 96x72 preview stored column by column
				async load_map_header(path) {
					const h = parseMapHeader(await vfs.readBytes(path));
					host.sg_date = h.date;
					host.sg_time = h.time;
					if (host.map_image !== 0) G.FreeImage(host.map_image);
					const img = G.CreateImage(96, 72);
					G.SetBuffer(G.ImageBuffer(img));
					for (let x = 0; x < 96; x++) {
						for (let y = 0; y < 72; y++) {
							const p = (x * 72 + y) * 3;
							G.WritePixelFast(x, y, 255 * 0x1000000 + h.image[p] * 0x10000 + h.image[p + 1] * 0x100 + h.image[p + 2]);
						}
					}
					G.SetBuffer(G.BackBuffer());
					G.MaskImage(img, 255, 0, 255);
					host.map_image = img;
				}
			});

			// --- start-up, in the original order, with the real load screens
			await load_strings(vfs);
			await load_keynames(vfs);
			await load_controls(vfs);
			await B.load_bmpf(vfs);
			await host.frame();
			await load_media(vfs, host.frame);
			const itemicon = await load_image_async('gfx\\branch.bmp').catch(() => M.gfx_defaulticon);
			const titleimg = 'sys\\gfx\\title.bmp';
			setHost({
				Ditem_iconh: () => itemicon,
				Dobject_iconh: () => M.gfx_defaulticon,
				Dunit_iconh: () => M.gfx_defaulticon,
				Dstate_frame: (typ) => typ % 30
			});
			if (disposed) return;
			ready = true;

			// --- demo state
			let screen: Screen = (new URLSearchParams(location.search).get('screen') as Screen) || 'widgets';
			let result = '';
			let health = 70;
			let hunger = 20;
			let listscroll = 0;
			let textscroll = 0;
			let percent = 0;
			let scrolltxt = 0;
			let dragging = false;
			let listsel = -1;
			S.in_check[0] = 1;
			S.in_opt[1] = 2;
			S.in_slider[0] = 4;
			S.in_slider[1] = 60;
			S.in_input[0] = 'Mr. Stranded';
			S.in_input[1] = 'passive';
			S.in_input[4] = '2';
			S.in_input[5] = '0';
			S.in_item_sel = 12;
			S.in_editor_sidebar = 1;
			TB.gui_tb_loadstring(
				[
					'on:start {',
					'   msg "Welcome to the island!";',
					'   $day=getlocal("unit",1,"day");',
					'   if (count_stored("unit",1,12)>0) {',
					'      addstate "unit",1,"bleeding";',
					'   }',
					'}',
					'',
					'// type "ge" to see the script helper list below'
				].join(C.SEP_LINE),
				C.SEP_LINE
			);

			(window as unknown as Record<string, unknown>).s2gui = {
				S,
				G,
				I,
				host,
				setScreen: (v: Screen) => (screen = v),
				conlog
			};

			const sidebar = async (): Promise<void> => {
				G.DrawImage(M.gfx_sidebar, 0, 0);
				let y = 5;
				B.bmpf_txt(5, y, 'GUI test', C.Cbmpf_yellow);
				y += 25;
				const link = (txt: string, tip = ''): boolean => {
					const hit = GUI.gui_txtb(5, y, txt, 1, -1, tip) === 1;
					y += 20;
					return hit;
				};
				if (link('Widgets')) screen = 'widgets';
				if (link('Fonts')) screen = 'fonts';
				if (link('Load screen')) screen = 'loadscreen';
				if (link('Text box')) screen = 'textbox';
				y += 10;
				if (link('Color window', 'gui_win_color')) {
					const r = await GUI.gui_win_color();
					result = `color ${r}: ${S.in_win_color.join(',')}`;
				}
				if (link('File window', 'gui_win_file')) {
					const r = await GUI.gui_win_file('Select a file', 'sys\\gfx', '', 0, 0);
					result = `file ${r}: ${S.in_win_file}`;
				}
				if (link('File window (save)', 'gui_win_file save=1')) {
					const r = await GUI.gui_win_file('Save as', 'maps', '', 1, 1);
					result = `save ${r}: ${S.in_win_file}`;
				}
				if (link('Map window', 'gui_win_map')) {
					S.in_scr_scr = 0;
					const r = await GUI.gui_win_map(0, '');
					result = `map ${r}: ${S.in_win_map}`;
				}
				if (link('Command window', 'gui_win_command')) {
					const r = await GUI.gui_win_command();
					result = `command ${r}`;
				}
				if (link('Defvars window', 'gui_win_defvars')) {
					const r = await GUI.gui_win_defvars(2, 5, 7);
					result = `defvars ${r}: ${[...vars].map(([k, v]) => k.split(':').pop() + '=' + v).join(' ')}`;
				}
				if (link('Image window', 'gui_win_image')) {
					await GUI.gui_win_image(titleimg);
					result = 'image closed';
				}
				if (link('Text window', 'gui_win_text')) {
					await GUI.gui_win_text(LOREM + C.SEP_LINE + LOREM + C.SEP_LINE + LOREM);
					result = 'text closed';
				}
				if (link('Message', 'gui_msg')) {
					await GUI.gui_msg('Something happened on the island.', C.Cbmpf_green);
					result = 'msg closed';
				}
				if (link('Input message', 'gui_msginput')) {
					result = `input: "${await GUI.gui_msginput('Enter a name')}"`;
				}
				if (link('Decision', 'gui_msgdecide')) {
					result = `decision: ${await GUI.gui_msgdecide('Really quit?', C.Cbmpf_red)}`;
				}
				// status
				B.bmpf_txt(5, 520, 'sound: ' + lastsound, C.Cbmpf_tiny);
				B.bmpf_txt(5, 536, `mouse ${S.in_mx},${S.in_my} key ${S.in_key}`, C.Cbmpf_tiny);
				B.bmpf_txt_ml(5, 552, result, C.Cbmpf_tiny, 190);
				B.bmpf_txt(5, 568, 'fps ' + S.fps, C.Cbmpf_tiny);
				// group selector (editor sidebar widget)
				GUI.gui_groupsel(5, 470, 1);
			};

			const windowframe = (icon: number, title: string): void => {
				G.DrawImage(M.gfx_win, 215, 0);
				G.DrawImage(M.gfx_icons, 236, 5, icon);
				B.bmpf_txt(236 + 37, 10, title);
				G.DrawImage(M.gfx_winbar, 215, 42);
			};

			const widgets = (): void => {
				windowframe(C.Cicon_options, 'Widgets');
				GUI.gui_ibutton(742, 5, C.Cicon_x, sm(15));

				// buttons
				if (GUI.gui_button(236, 63, 'Button', 1, C.Cicon_ok)) result = 'gui_button';
				GUI.gui_button(236 + 195, 63, 'Passive', 0, C.Cicon_x);
				// icon buttons
				if (GUI.gui_ibutton(236, 115, C.Cicon_save, "Save", 1, 0, 59)) result = 'gui_ibutton save';
				if (GUI.gui_ibutton(236 + 37, 115, C.Cicon_load, 'Load')) result = 'gui_ibutton load';
				GUI.gui_ibutton(236 + 74, 115, C.Cicon_new, 'Forced over', 1, 1);
				GUI.gui_ibutton(236 + 111, 115, C.Cicon_dir, 'Passive', 0);
				if (GUI.gui_ibuttona(236 + 148, 115, M.gfx_cursor[2], 'gui_ibuttona')) result = 'gui_ibuttona';
				// text buttons
				if (GUI.gui_txtb(236 + 195, 115, 'Text button', 1, -1, 'gui_txtb')) result = 'gui_txtb';
				GUI.gui_txtb(236 + 195, 133, 'Passive text button', 0);
				if (GUI.gui_ttb(630, 115, ' Tiny ', 0, 'gui_ttb')) result = 'gui_ttb';
				GUI.gui_ttb(680, 115, ' Forced ', 1);

				// check / option
				GUI.gui_check(236, 160, 'Checkbox', 0);
				GUI.gui_check(236, 180, 'Checkbox 2', 1);
				GUI.gui_check(236, 200, 'Passive', 0, 0);
				GUI.gui_opt(400, 160, 'Option 1', 1, 1);
				GUI.gui_opt(400, 180, 'Option 2', 2, 1);
				GUI.gui_opt(400, 200, 'Passive', 3, 1, 0);

				// sliders
				GUI.gui_slider(560, 160, 10, 0);
				B.bmpf_txt(690, 158, S.in_slider[0]);
				GUI.gui_slider(560, 180, 100, 1);
				B.bmpf_txt(690, 178, S.in_slider[1]);
				GUI.gui_slider(560, 200, 10, 2, 0);

				// inputs
				GUI.gui_input(236, 230, 200, 0, 1, 'gui_input');
				GUI.gui_input(446, 230, 100, 1, 0);
				S.in_input[2] = GUI.gui_inputstr(S.in_input[2], 150);
				B.bmpf_txt(560, 231, 'inputstr: ' + S.in_input[2] + (S.in_cursor ? '_' : ''), C.Cbmpf_tiny);

				// operator / class selector
				B.bmpf_txt(236, 262, 'Operator:');
				GUI.gui_operator(330, 262, 4);
				GUI.gui_operator(480, 262, 4, 0);
				GUI.gui_classselbox(600, 255, Cclass_item, 5);
				B.bmpf_txt(645, 262, 'type ' + S.in_input[5], C.Cbmpf_tiny);

				// colour boxes
				for (let i = 0; i < 8; i++) {
					const r = i & 1 ? 255 : 0,
						g = i & 2 ? 255 : 0,
						b = i & 4 ? 255 : 0;
					const c = GUI.gui_colorbox(r, g, b, 236 + i * 29, 300, 24, 32, `${r},${g},${b}`);
					if (c) result = `gui_colorbox ${c}`;
				}
				GUI.gui_colorbox(S.in_win_color[0], S.in_win_color[1], S.in_win_color[2], 236 + 8 * 29, 300, 60, 32, 'last picked colour');

				// icon boxes
				for (let i = 0; i < 5; i++) {
					const x = 236 + i * 45;
					G.DrawImage(M.gfx_if_itemback, x, 345);
					const icon = host.Ditem_iconh(i);
					const c = GUI.gui_iconbox(x, 345, icon, 'Item ' + i, listsel === i);
					if (c === 1) listsel = i;
					if (c === 2) listsel = -1;
					GUI.gui_iconboxc(x, 345, i * 3, i >= 3 ? 1 : 0, i === 4 ? 1 : 0);
					GUI.gui_iconboxqs(x, 345, i === 1 ? 5 : 0);
				}
				// drag and drop watch
				G.DrawImage(M.gfx_if_itemback, 236 + 5 * 45 + 20, 345);
				if (GUI.gui_dndwatch(236 + 5 * 45 + 20, 345)) dragging = true;
				if (!S.in_mdown[1]) dragging = false;
				G.DrawImage(itemicon, dragging ? S.in_mx - 20 : 236 + 5 * 45 + 20, dragging ? S.in_my - 20 : 345);
				B.bmpf_txt(236 + 6 * 45 + 30, 358, 'drag me (gui_dndwatch)', C.Cbmpf_tiny);

				// health bars
				let v = GUI.gui_healthbar(236, 400, health, 100);
				if (v > -1) health = v;
				B.bmpf_txt(345, 394, 'health ' + Math.round(health), C.Cbmpf_tiny);
				v = GUI.gui_healthbar(236, 415, hunger, 100, 1, M.gfx_bar_hunger);
				if (v > -1) hunger = v;
				B.bmpf_txt(345, 409, 'hunger ' + Math.round(hunger) + ' (blinks at 30 or less)', C.Cbmpf_tiny);
				GUI.gui_healthbar(236, 430, 55, 100, 0, M.gfx_bar_thirst);
				GUI.gui_healthbar(236, 445, 80, 100, 0, M.gfx_bar_exhaustion);

				// states, arrows
				for (let i = 0; i < 9; i++) G.DrawImage(M.gfx_state, 560 + i * 23, 395, i);
				for (let i = 0; i < 9; i++) G.DrawImage(M.gfx_states, 560 + i * 23, 420, i);
				for (let i = 0; i < 12; i++) G.DrawImage(M.gfx_arrows, 568 + i * 17, 455, i);

				// scrollbar with a list
				G.Color(0, 0, 0);
				G.Rect(236, 470, 250, 100, 1);
				for (let i = 0; i < 5; i++) {
					const n = listscroll + i;
					if (n < 30) B.bmpf_txt(240, 470 + i * 20, 'List entry ' + (n + 1), n === listsel ? 1 : 0);
				}
				listscroll = GUI.gui_scrollbar(486, 470, 100, 30, listscroll, 5);

				// text rect with scroll buttons
				G.Color(0, 0, 0);
				G.Rect(530, 470, 207, 100, 1);
				const more = B.bmpf_txt_rect(533, 472, 200, 98, LOREM, C.Cbmpf_tiny, textscroll);
				if (GUI.gui_ibutton(742, 470, C.Cicon_up, sm(29), textscroll > 0)) textscroll--;
				if (GUI.gui_ibutton(742, 538, C.Cicon_down, sm(30), more === 0)) textscroll++;
			};

			const fonts = (): void => {
				G.ClsColor(0, 0, 0);
				G.Cls();
				G.TileBlock(M.gfx_bg[1]);
				G.DrawImage(M.gfx_sidebar, 0, 0);
				const names = ['norm', 'over / yellow', 'dark', 'red (bad)', 'green (good)', 'tiny', 'handwriting'];
				let y = 8;
				for (let id = 0; id <= 6; id++) {
					B.bmpf_txt(215, y, `${id} ${names[id]}  frames ${B.bmpf_frames[id]}  ${B.bmpf_framesx[id]}x${B.bmpf_framesy[id]}`, C.Cbmpf_tiny);
					B.bmpf_txt(215, y + 16, SAMPLE, id);
					y += 42;
				}
				// alignment
				G.Color(90, 60, 20);
				G.Line(500, y, 500, y + 66);
				B.bmpf_txt(500, y, 'bmpf_txt (left)');
				B.bmpf_txt_c(500, y + 22, 'bmpf_txt_c (centre)');
				B.bmpf_txt_r(500, y + 44, 'bmpf_txt_r (right)');
				y += 72;
				// max length / marked / scroll
				G.Color(90, 60, 20);
				G.Line(400, y, 400, y + 60);
				B.bmpf_txt_ml(215, y, 'bmpf_txt_ml stops at the line: ' + SAMPLE, 0, 400);
				B.bmpf_txt_ml_marked(215, y + 20, 'bmpf_txt_ml_marked ' + SAMPLE, C.Cbmpf_tiny, 400, 12, 18);
				scrolltxt -= 1;
				if (scrolltxt < -700) scrolltxt = 180;
				B.bmpf_txt_scroll(215, y + 40, 'bmpf_txt_scroll: ' + SAMPLE, C.Cbmpf_tiny, 400, scrolltxt);
				B.bmpf_txt(410, y, `len("Stranded")=${B.bmpf_len('Stranded')}  tiny=${B.bmpf_len('Stranded', 5)}`, C.Cbmpf_tiny);
				B.bmpf_txt(410, y + 20, `trim -> "${B.bmpf_trim('Stranded II', 0, 60)}"`, C.Cbmpf_tiny);
				y += 66;
				// text rect
				G.Color(0, 0, 0);
				G.Rect(215, y, 560, 600 - y - 8, 1);
				const more = B.bmpf_txt_rect(220, y + 2, 510, 600 - y - 12, LOREM, 0, textscroll);
				if (GUI.gui_ibutton(742, y + 2, C.Cicon_up, sm(29), textscroll > 0)) textscroll--;
				if (GUI.gui_ibutton(742, 600 - 8 - 34, C.Cicon_down, sm(30), more === 0)) textscroll++;
				B.bmpf_txt_r(735, 600 - 30, `${S.tmp_linesvisible}/${S.tmp_lines}`, C.Cbmpf_tiny);
			};

			const textbox = (): void => {
				windowframe(C.Cicon_script, se(170) || 'Script');
				B.bmpf_txt(450, 63, 'gui_tb(236,85,538,29,1,1)', C.Cbmpf_tiny);
				TB.gui_tb(236, 85, 538, 29, 1, 1);
				TB.gui_tb_scripthelper_list();
			};

			// --- main loop
			while (!disposed) {
				if (screen === 'loadscreen') {
					getinput(0);
					if (I.KeyHit(1) || S.in_mhit[1]) screen = 'widgets';
					percent = (percent + 0.25) % 130;
					B.bmpf_loadscreen(s(1 + (Math.floor(percent / 22) % 6)), Math.floor(percent));
					await host.frame();
					continue;
				}
				getinput(0);
				S.m_section = screen === 'textbox' ? Csection_editor : Csection_menu;
				S.m_menu = screen === 'textbox' ? Cmenu_ed_scripts : 0;
				G.SetBuffer(G.BackBuffer());
				// "RenderWorld": the 3D scene (here: the page background) fills the back buffer
				G.SceneRendered();
				if (screen === 'fonts') fonts();
				else if (screen === 'textbox') textbox();
				else widgets();
				await sidebar();
				if (screen === 'textbox' && GUI.gui_ibutton(236, 542, C.Cicon_list, 'Commands')) {
					S.in_inputfocus = 1337;
					await GUI.gui_win_command();
				}
				endinput(1, 1, 1);
				G.Flip();
				await host.frame();
			}
		})().catch((e) => {
			console.error(e);
			error = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
		});

		return () => {
			disposed = true;
			detach();
			G.attachCanvas(null);
		};
	});
</script>

<svelte:head><title>Stranded II Web - GUI test</title></svelte:head>

<div class="flex min-h-screen flex-col items-center justify-center gap-2 bg-neutral-900 text-sm text-neutral-300">
	<div bind:this={stage} id="stage" class="relative" style="width:800px;height:600px;">
		<!-- stand-in for the WebGL canvas -->
		<div class="absolute inset-0" style="background:linear-gradient(160deg,#2a6fa8 0%,#8fc4e8 45%,#d9c78f 55%,#3e7a34 100%)"></div>
		<canvas bind:this={canvas} class="absolute inset-0 block" style="width:800px;height:600px;image-rendering:pixelated"></canvas>
	</div>
	<div>
		{#if error}
			<span class="text-red-400">{error}</span>
		{:else if !ready}
			Loading…
		{:else}
			2D layer at 800×600 · Esc/Enter are the cancel/okay hotkeys of the message screens · click a text field or text row before typing · F1 is the Save hotkey
		{/if}
	</div>
</div>
