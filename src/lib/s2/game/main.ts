/**
 * StrandedII.bb: the program. Startup in the order of the Includes, the
 * main loop, shutdown.
 *
 * Every function comes from the module of its original file (the network
 * section game_mp() may still be a generated skeleton, which throws
 * NotPortedError when it is reached).
 *
 * ## Frame pacing
 *
 * The original loop has no limiter of its own (the 19 ms loop is commented
 * out): every section function ends with endinput(), whose calcfpsfactor()
 * waits until 20 ms have passed since getinput() (looplimit, 50 FPS), and
 * then `Flip` waits for the vertical blank. Here a frame starts on a display
 * frame (requestAnimationFrame = the vertical blank) once frameDue() says the
 * 20 ms are over; see flow.ts and load_fps.ts. `pacing: 'timer'` drops the
 * vertical blank from the condition (`Flip False`): 50 FPS on any display.
 */
import { BlitzRuntimeError, MilliSecs } from '../blitz';
import { Flip } from '../gfx2d';
import { include_collisions } from './collisions';
import { con_welcome, console as console_ } from './console';
import { Csection_editor, Csection_game_mp, Csection_game_sp, Csection_menu, Cversion } from './consts';
import {
	Ditem_icon,
	Dobject_icon,
	Dunit_icon,
	include_load_buildings,
	include_load_combinations,
	include_load_game,
	include_load_groups,
	include_load_infos,
	include_load_items,
	include_load_lightcycle,
	include_load_objects,
	include_load_states,
	include_load_units
} from './defs';
import { e_clear } from './e_clear';
import { editor } from './editor';
import { delay, frame, frameDue, runDeferred } from './flow';
import { brightness } from './functions';
import { game } from './game';
import { bmpf_loadscreen, include_load_bmpf } from './load_bmpf';
import { include_load_commandline } from './load_commandline';
import { load_progress_get, load_progress_set } from './load_functions';
import { include_load_keynames } from './load_keynames';
import { include_load_media } from './load_media';
import { include_load_settings } from './load_settings';
import { include_load_setup } from './load_setup';
import { include_load_strings, s } from './load_strings';
import { menu, menu_start } from './menu';
import { game_mp } from './mp_game';
import { prepare_cache_viewranges } from './prepare';
import { include_randommap } from './randommap';
import { G } from './state';
import { TYPES } from './types';
import { EndProgram } from './sys';
import { unrealsoftware } from './unrealsoftware';

/** Const Cversion$="1.0.0.1" */
export { Cversion };

export interface MainOptions {
	/** 'vsync' (default): frames start on a display frame, as with the original's Flip. 'timer': every looplimit ms. */
	pacing?: 'vsync' | 'timer';
	/** Called with the text of a RuntimeError (the original shows a message box and ends). */
	onError?: (message: string) => void;
	/** Called once the startup has reached the main loop. */
	onRunning?: () => void;
	/** Return true to stop the loop (page teardown). */
	stopped?: () => boolean;
}

/** State of the running program, for the page and for tests. */
export const PROGRAM = {
	/** 'startup' | 'running' | 'ended' | 'error' */
	phase: 'idle' as 'idle' | 'startup' | 'running' | 'ended' | 'error',
	/** The last load screen text (startup progress for pages without the 2D canvas). */
	step: '',
	error: ''
};

/** The Includes of StrandedII.bb that run code, in order, with the load screens between them. */
export async function startup(): Promise<void> {
	PROGRAM.phase = 'startup';
	const loadscreen = async (txt: string, percent: number) => {
		PROGRAM.step = `${txt} ${percent}%`;
		await bmpf_loadscreen(txt, percent);
	};

	//Include "includes\load_const.bb"        ;Load Constants        -> consts.ts
	//Include "includes\load_vars.bb"         ;Load Vars             -> state.ts, types.ts
	include_load_commandline(); //Load Commandline
	//Include "includes\load_functions.bb"    ;Load Functions
	include_load_settings(); //Load Settings
	await include_load_strings(); //Load Strings
	include_load_setup(); //Load & Setup Graphics, Title, Camera, Random
	await include_load_bmpf(); //Load Bitmapfonts
	await loadscreen(s(1), 6);
	await include_load_media(); //Load Media
	await loadscreen('Loading Materials', 18);
	//Include "includes\load_materials.bb"    ;Load Materials        -> constant tables of defs/constants.ts
	await loadscreen(s(2), 19);
	await include_load_keynames(); //Load Keynames
	await include_load_states(); //Load States
	await include_load_lightcycle(); //Load Lightcycle
	await include_load_game(); //Load Game
	await include_load_groups(); //Load Groups

	load_progress_get();
	await loadscreen(s(3), 20);
	await include_load_objects();
	await loadscreen(s(4), 60);
	await include_load_units();
	await loadscreen(s(5), 80);
	await include_load_items();
	await loadscreen(s(6), 98);
	await include_load_infos();
	load_progress_set();

	await include_load_combinations(); //Load Combinations
	await include_load_buildings(); //Load Buildings

	//Include "includes\load_fps.bb" ... "includes\prepare.bb": functions, except for the
	//top-level statements of collisions.bb (col_set()) and randommap.bb (load_randommap())
	include_collisions();
	include_randommap();

	//############################################ PREPARE

	prepare_cache_viewranges();

	G.br = 1.0;
	// dead in the original as well (If 1=0): the icon brightness tool
	if ((1 as number) === 0) {
		for (let i = 0; i <= G.Citem_count; i++) {
			G.br = 1;
			if (Ditem_icon(i) !== '') await brightness(Ditem_icon(i), 0, 0, 0, G.br);
		}

		for (let i = 0; i <= G.Cobject_count; i++) {
			G.br = 1;
			if (Dobject_icon(i) !== '') await brightness(Dobject_icon(i), 0, 0, 0, G.br);
		}
		for (let i = 0; i <= G.Cunit_count; i++) {
			G.br = 1;
			if (Dunit_icon(i) !== '') await brightness(Dunit_icon(i), 0, 0, 0, G.br);
		}
	}

	//############################################ START

	con_welcome();
	await unrealsoftware();
}

/** One pass of `While Not m_performquit ... Wend`, without the wait for the next frame. */
export async function mainLoopStep(): Promise<void> {
	// loopspeedlimit=MilliSecs()   (only used by the commented-out limiter)
	void MilliSecs;

	// port: deleted Type objects stay in their lists as dead nodes for the loops that still stand on
	// them (blitz/typelist.ts); no Blitz loop is running here, so they can go
	for (const t of Object.values(TYPES)) t.list.purge?.();

	//Stuff
	switch (G.m_section) {
		case Csection_menu:
			await menu();
			break;

		case Csection_game_sp:
			await game();
			break;

		case Csection_game_mp:
			await game_mp();
			break;

		case Csection_editor:
			await editor();
			break;
	}

	// port: blocking work started by synchronous code (defer) runs here, before the frame is shown
	await runDeferred();

	//Everywhere
	G.gframe = G.gframe + 1;
	console_();
	//While (MilliSecs()-loopspeedlimit)<19
	//	Delay 1
	//Wend
	Flip();
}

/** The whole program: startup, menu_start(), the main loop, shutdown. Resolves when the game ends. */
export async function main(o: MainOptions = {}): Promise<void> {
	try {
		await startup();

		//############################################ RUNTIME

		await menu_start();
		PROGRAM.phase = 'running';
		o.onRunning?.();

		while (!G.m_performquit) {
			// port: the page went away (the runtime is disposed): no shutdown code can run
			if (o.stopped?.()) return;
			await mainLoopStep();
			// Flip's wait for the vertical blank, and the 20 ms of calcfpsfactor() (flow.ts frameDue)
			if (o.pacing === 'timer') {
				const wait = G.looplimit - (MilliSecs() - G.ms);
				await delay(wait > 0 ? wait : 0);
			} else {
				do {
					await frame();
				} while (!frameDue() && !o.stopped?.());
			}
		}

		//############################################ SHUTDOWN

		e_clear();
		//EndGraphics() : End
		PROGRAM.phase = 'ended';
	} catch (e) {
		if (e instanceof EndProgram) {
			PROGRAM.phase = 'ended';
			return;
		}
		PROGRAM.phase = 'error';
		PROGRAM.error = e instanceof Error ? e.message : String(e);
		// RuntimeError: message box "Error!" and the program ends
		if (e instanceof BlitzRuntimeError || (e instanceof Error && e.name === 'RuntimeError')) {
			o.onError?.(PROGRAM.error.replaceAll('\r', '\n'));
			return;
		}
		o.onError?.(e instanceof Error ? `${e.name}: ${e.message}` : String(e));
		throw e;
	}
}
