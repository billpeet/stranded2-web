/**
 * Port of includes/gui_tb.bb: the multi-line text box (script editor) and
 * its script helper. The rows are the Blitz type list Ttbt (S.Ttbt), the
 * cursor is S.in_tb_row / S.in_tb_col, the selection S.in_mark with
 * S.in_ms_* / S.in_me_*. The box has keyboard focus when
 * S.in_inputfocus=1337.
 */
import { Color, Rect, bbInt } from '../gfx2d';
import { KeyDown, KeyHit } from '../input';
import { S, type Ttbt } from '../input/state';
import { Asc, Chr, Instr, Left, Len, Mid, Replace, Trim } from './bb';
import { bmpf_len, bmpf_txt, bmpf_txt_ml, bmpf_txt_ml_len, bmpf_txt_ml_marked, bmpf_txt_pos } from './bmpf';
import { Cbmpf_tiny, SEP_LINE, UMLAUTS } from './consts';
import { gui_ttb } from './gui';
import { host } from './host';
import { sm } from './strings';

/** Each row of the text box is 15 pixels high. */
const ROW = 15;

/**
 * ### Textbox: Function gui_tb(rx,ry,w,rowsh,info=0,scripthelper=0).
 * Draws `rowsh` rows at rx,ry (width w) and handles mouse and keyboard.
 * info=1 prints "Line: n Column: n" below; scripthelper=1 looks up the word
 * left of the cursor in the command reference.
 */
export function gui_tb(rx: number, ry: number, w: number, rowsh: number, info = 0, scripthelper = 0): void {
	const h = rowsh * ROW;
	// BG
	Color(0, 0, 0);
	Rect(rx, ry, w, h);
	// Text
	let y = ry;
	let i = 0;
	let cursorline = '';
	let cursorx = 0,
		cursory = 0;
	let cursordraw = 0;
	const rows = Math.floor(h / ROW);
	// Scripthelper Update?
	let shu = 0;
	if (S.in_sh_update === 1) {
		shu = 1;
		S.in_sh_update = 0;
	}

	// Mark
	// Bring Mark Start/End Row and Col in correct Order!
	let ms_row = 0,
		ms_col = 0,
		me_row = 0,
		me_col = 0;
	if (S.in_mark > 0) {
		if (S.in_ms_row < S.in_me_row) {
			ms_row = S.in_ms_row;
			ms_col = S.in_ms_col;
			me_row = S.in_me_row;
			me_col = S.in_me_col;
		} else if (S.in_ms_row > S.in_me_row) {
			ms_row = S.in_me_row;
			ms_col = S.in_me_col;
			me_row = S.in_ms_row;
			me_col = S.in_ms_col;
		} else {
			if (S.in_ms_col < S.in_me_col) {
				ms_row = S.in_ms_row;
				ms_col = S.in_ms_col;
				me_row = S.in_me_row;
				me_col = S.in_me_col;
			} else {
				ms_row = S.in_me_row;
				ms_col = S.in_me_col;
				me_row = S.in_ms_row;
				me_col = S.in_ms_col;
			}
		}
	}

	/** Column under the mouse in a row. */
	const mousecol = (txt: string): number => {
		let col = S.in_tb_scrx + bmpf_txt_pos(Mid(txt, S.in_tb_scrx + 1, -1), Cbmpf_tiny, S.in_mx - (rx + 2));
		if (col < 0) col = 0;
		if (col > Len(txt)) col = Len(txt);
		return col;
	};

	// Draw Lines
	i = 0;
	for (const row of S.Ttbt) {
		// Cache selected Row
		if (i === S.in_tb_row) cursorline = row.txt;
		// Is Line in visible Area?
		if (i >= S.in_tb_scry && y <= ry + h - ROW) {
			const visible = Mid(row.txt, S.in_tb_scrx + 1, -1);
			// Darkback
			Color(28, 17, 0);
			Rect(rx + 1, y + 1, w - 2, 14, 1);

			// Markback if marked
			if (S.in_mark > 0) {
				if (i > ms_row && i < me_row) {
					Color(84, 51, 0);
					let markbacklen = bmpf_txt_ml_len(rx + 2, y, visible, Cbmpf_tiny, rx + w - 3) + 2;
					if (markbacklen > w - 2) markbacklen = w - 2;
					Rect(rx + 1, y + 1, markbacklen, 14, 1);
				}
			}

			// Clickline/Releaseline - Set Cursorpos
			if (S.in_mx >= rx - 15 && S.in_mx <= rx + w) {
				if (S.in_my >= y && S.in_my < y + ROW) {
					S.in_cursorf = 5;

					// Click
					if (S.in_mhit[1]) {
						// Set Cursor
						cursorline = row.txt;
						S.in_tb_row = i;
						S.in_tb_col = mousecol(row.txt);
						// Set Mark Start
						S.in_mark = 1;
						S.in_ms_col = S.in_tb_col;
						S.in_ms_row = S.in_tb_row;
						S.in_me_col = 999999;
						S.in_me_row = 999999;
						// Script Helper Update
						shu = 1;
					}

					// Down
					if (S.in_mdown[1]) {
						if (S.in_mark === 1) {
							cursorline = row.txt;
							S.in_tb_row = i;
							S.in_tb_col = mousecol(row.txt);
							// Set
							S.in_me_col = S.in_tb_col;
							S.in_me_row = S.in_tb_row;
							// Script Helper Reset
							shu = -1;
						}
					}

					// Release
					if (S.in_mrelease[1]) {
						S.in_inputfocus = 1337;
						if (S.in_mark === 1) {
							// Set Cursor
							cursorline = row.txt;
							S.in_tb_row = i;
							S.in_tb_col = mousecol(row.txt);
							// Set Mark End
							S.in_mark = 2;
							S.in_me_col = S.in_tb_col;
							S.in_me_row = S.in_tb_row;
							// Swap Mark Start/End?
							if (S.in_me_row < S.in_ms_row || (S.in_ms_row === S.in_me_row && S.in_me_col < S.in_ms_col)) {
								let x = S.in_me_row;
								S.in_me_row = S.in_ms_row;
								S.in_ms_row = x;
								x = S.in_me_col;
								S.in_me_col = S.in_ms_col;
								S.in_ms_col = x;
							}
							// Nothing Selected?
							if (S.in_ms_row === S.in_me_row) {
								if (S.in_ms_col === S.in_me_col) S.in_mark = 0;
							}
							// Script Helper Update
							shu = 1;
						}
					}
				}
			}

			// Draw Text
			if (S.in_mark > 0) {
				if (i === ms_row || i === me_row) {
					if (i === ms_row && i === me_row) {
						bmpf_txt_ml_marked(rx + 2, y, visible, Cbmpf_tiny, rx + w - 3, ms_col, me_col);
					} else if (i === ms_row) {
						bmpf_txt_ml_marked(rx + 2, y, visible, Cbmpf_tiny, rx + w - 3, ms_col, 999999);
					} else {
						bmpf_txt_ml_marked(rx + 2, y, visible, Cbmpf_tiny, rx + w - 3, 0, me_col);
					}
				} else {
					bmpf_txt_ml(rx + 2, y, visible, Cbmpf_tiny, rx + w - 3);
				}
			} else {
				bmpf_txt_ml(rx + 2, y, visible, Cbmpf_tiny, rx + w - 3);
			}

			// Cursor
			if (i === S.in_tb_row) {
				if (S.in_tb_col - S.in_tb_scrx >= 0) {
					cursordraw = 1;
					cursorx = rx + 1 + bmpf_len(Mid(cursorline, S.in_tb_scrx + 1, S.in_tb_col - S.in_tb_scrx), Cbmpf_tiny);
					cursory = y - 1;
					if (S.in_inputfocus === 1337) {
						if (S.in_cursor) bmpf_txt(cursorx, cursory, '|', Cbmpf_tiny);
					}
				}
			}

			// Inc Y
			y = y + ROW;
		}

		// Inc Line
		i = i + 1;
	}

	// Input - Control Cursor
	if (S.in_inputfocus === 1337 && S.in_console === 0) {
		if (KeyHit(200)) {
			// Cursor Up
			S.in_tb_row = S.in_tb_row - 1;
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(208)) {
			// Cursor Down
			S.in_tb_row = S.in_tb_row + 1;
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(203)) {
			// Cursor Left
			S.in_tb_col = S.in_tb_col - 1;
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(205)) {
			// Cursor Right
			S.in_tb_col = S.in_tb_col + 1;
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(199)) {
			// Cursor Pos 1
			S.in_tb_col = 0;
			S.in_tb_scrx = 0;
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(207)) {
			// Cursor End
			S.in_tb_col = Len(cursorline);
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(201)) {
			// Cursor PgUp
			S.in_tb_row = 0;
			S.in_mark = 0;
			shu = 1;
		}
		if (KeyHit(209)) {
			// Cursor PgDown
			S.in_tb_row = i - 1;
			S.in_mark = 0;
			shu = 1;
		}
		if (S.in_mzs !== 0.0) {
			// Cursor Up/Down Wheel
			S.in_tb_row = bbInt(S.in_tb_row + S.in_mzs * -5);
		}
	}

	// Check
	if (S.in_tb_row < 0) S.in_tb_row = 0;
	if (S.in_tb_row > i - 1) S.in_tb_row = i - 1;
	if (S.in_tb_col < 0) S.in_tb_col = 0;
	if (S.in_tb_col > Len(cursorline)) S.in_tb_col = Len(cursorline);

	// Get Cursorline
	i = 0;
	for (const gl of S.Ttbt) {
		if (i === S.in_tb_row) {
			cursorline = gl.txt;
			break;
		}
		i = i + 1;
	}

	/** Write `cursorline` back to the cursor row. */
	const modify = (): void => {
		const row = S.Ttbt[S.in_tb_row];
		if (row) row.txt = cursorline;
	};

	// Input - Write
	if (S.in_inputfocus === 1337 && S.in_console === 0) {
		// Get Ctrl
		const ctrlkey = KeyDown(29) || KeyDown(157);

		// Cut / Copy / Paste
		const cutkey = KeyHit(45);
		const copykey = KeyHit(46);
		const pastekey = KeyHit(47);

		const key = S.in_key;
		if (S.in_mark === 0) {
			// ##################################### UNMARKED
			let changed = 0;
			if ((key > 31 && key < 127) || Instr(UMLAUTS, Chr(key)) > 0) {
				// INS
				cursorline = gui_tb_act_ins(cursorline, S.in_tb_col, Chr(key));
				changed = 1;
				shu = 1;
			} else if (key === 9) {
				// TAB
				cursorline = gui_tb_act_ins(cursorline, S.in_tb_col, '   ');
				changed = 1;
				shu = 1;
			} else if (key === 4) {
				// DEL
				shu = 1;
				const cache = cursorline;
				cursorline = gui_tb_act_del(cursorline, S.in_tb_col);
				if (cache === cursorline) {
					// Nothing to delete in this row: pull the next row up.
					const next = S.in_tb_row + 1;
					if (next < S.Ttbt.length) {
						const tail = S.Ttbt[next].txt;
						S.Ttbt.splice(next, 1);
						const before = S.Ttbt[next - 1];
						before.txt = before.txt + tail;
						// (sic) the cursor moves up a row and to the end of the joined text
						S.in_tb_row = S.in_tb_row - 1;
						S.in_tb_col = Len(before.txt);
					}
				} else {
					changed = 1;
				}
			} else if (key === 8) {
				// BS
				shu = 1;
				const cache = cursorline;
				cursorline = gui_tb_act_bs(cursorline, S.in_tb_col);
				if (cache === cursorline) {
					if (S.in_tb_row > 0) {
						// At column 0: join this row onto the previous one.
						const cur = S.in_tb_row;
						if (cur < S.Ttbt.length) {
							const tail = S.Ttbt[cur].txt;
							S.Ttbt.splice(cur, 1);
							const before = S.Ttbt[cur - 1];
							before.txt = before.txt + tail;
							S.in_tb_row = S.in_tb_row - 1;
							// (sic) end of the joined text, not the join position
							S.in_tb_col = Len(before.txt);
						}
					}
				} else {
					changed = 1;
				}
			} else if (key === 13) {
				// Break
				shu = 1;
				gui_tb_act_break();
			}
			// Ctrl
			if (ctrlkey) {
				shu = 1;
				// Paste
				if (pastekey) {
					cursorline = gui_tb_act_ins(cursorline, S.in_tb_col, gui_tb_tr2(host.paste()));
					modify();
					gui_tb_resplit();
				}
			}
			// Modify
			if (changed === 1) {
				modify();
				changed = 0;
			}
		} else {
			// ##################################### MARKED
			if (key > 31 && key < 127) {
				// INS
				shu = 1;
				gui_tb_replacemarked(Chr(key));
				S.in_mark = 0;
			} else if (key === 9) {
				// TAB
				shu = 1;
				gui_tb_replacemarked('   ');
				S.in_mark = 0;
			} else if (key === 4 || key === 8 || key === 13) {
				// DEL / BS / Break
				shu = 1;
				gui_tb_replacemarked('');
				S.in_mark = 0;
			}

			// Ctrl
			if (ctrlkey) {
				if (cutkey) {
					// Cut
					host.copy(gui_tb_tr1(gui_tb_tostrmarked()));
					gui_tb_replacemarked('');
					S.in_mark = 0;
					shu = 1;
				} else if (copykey) {
					// Copy
					host.copy(gui_tb_tr1(gui_tb_tostrmarked()));
					shu = 1;
				} else if (pastekey) {
					// Paste
					gui_tb_replacemarked(gui_tb_tr2(host.paste()));
					gui_tb_resplit();
					S.in_mark = 0;
					shu = 1;
				}
			}
		}
	}

	// Scroll to Cursor X
	while (cursorx >= rx + w - 5) {
		S.in_tb_scrx = S.in_tb_scrx + 1;
		cursorx = rx + bmpf_len(Mid(cursorline, S.in_tb_scrx + 1, S.in_tb_col - S.in_tb_scrx), Cbmpf_tiny);
		// Defensive: the width reaches 0 at scrx=col, so this only matters for boxes narrower than 6 pixels.
		if (S.in_tb_scrx > S.in_tb_col) break;
	}
	while (cursorx < rx) {
		S.in_tb_scrx = S.in_tb_scrx - 1;
		if (S.in_tb_scrx <= 0) {
			S.in_tb_scrx = 0;
			break;
		}
		cursorx = rx + bmpf_len(Mid(cursorline, S.in_tb_scrx + 1, S.in_tb_col - S.in_tb_scrx), Cbmpf_tiny);
	}
	// Scroll to Cursor Y
	if (cursordraw === 0) {
		while (S.in_tb_row < S.in_tb_scry) {
			S.in_tb_scry = S.in_tb_scry - 1;
			if (S.in_tb_scry <= 0) {
				S.in_tb_scry = 0;
				break;
			}
		}
		while (S.in_tb_row > S.in_tb_scry + rows - 1) {
			S.in_tb_scry = S.in_tb_scry + 1;
			if (S.in_tb_scry >= i - 1) {
				S.in_tb_scry = i - 1;
				break;
			}
		}
	}

	// Info
	if (info) bmpf_txt(rx, ry + h + 1, sm(37) + ': ' + S.in_tb_row + ' ' + sm(38) + ': ' + S.in_tb_col, Cbmpf_tiny);

	// Scripthelper
	if (S.in_inputfocus === 1337) {
		if (scripthelper) {
			if (shu === 1) gui_tb_scripthelper(cursorline, S.in_tb_col, cursorx, cursory);
			else if (shu === -1) S.in_sh = 0;
		}
	}
}

/** ### Textbox Clear: Function gui_tb_clear(oneline=0) */
export function gui_tb_clear(oneline = 0): void {
	S.in_tb_row = 0;
	S.in_tb_col = 0;
	S.in_tb_scrx = 0;
	S.in_tb_scry = 0;
	S.Ttbt.length = 0;
	if (oneline) S.Ttbt.push({ txt: '' });
}

/** ### Textbox Add Line: Function gui_tb_addline(txt$) */
export function gui_tb_addline(txt: string): void {
	S.Ttbt.push({ txt });
}

/** ### Textbox Action: Insert. Advances S.in_tb_col by the inserted length. */
export function gui_tb_act_ins(txt: string, pos: number, ins: string): string {
	const strlen = Len(txt);
	S.in_tb_col = S.in_tb_col + Len(ins);
	if (pos === 0) return ins + txt;
	if (pos >= strlen) return txt + ins;
	const p1 = Mid(txt, 1, pos);
	const p2 = Mid(txt, pos + 1, -1);
	return p1 + ins + p2;
}

/** ### Textbox Action: Del (character right of the cursor). */
export function gui_tb_act_del(txt: string, pos: number): string {
	const strlen = Len(txt);
	if (pos === 0) return Mid(txt, 2, -1);
	if (pos >= strlen) return txt;
	if (pos === strlen - 1) return Left(txt, strlen - 1);
	const p1 = Mid(txt, 1, pos);
	const p2 = Mid(txt, pos + 2, -1);
	return p1 + p2;
}

/** ### Textbox Action: BS (character left of the cursor). Moves S.in_tb_col back. */
export function gui_tb_act_bs(txt: string, pos: number): string {
	const strlen = Len(txt);
	if (pos === 0) return txt;
	if (pos >= strlen) {
		S.in_tb_col = S.in_tb_col - 1;
		return Left(txt, strlen - 1);
	}
	if (pos === 1) {
		S.in_tb_col = S.in_tb_col - 1;
		return Mid(txt, 2, -1);
	}
	const p1 = Mid(txt, 1, pos - 1);
	const p2 = Mid(txt, pos + 1, -1);
	S.in_tb_col = S.in_tb_col - 1;
	return p1 + p2;
}

/** ### Textbox Action: break (Enter) at the cursor. */
export function gui_tb_act_break(): void {
	const pos = S.in_tb_col;
	const j = S.in_tb_row;
	const row = S.Ttbt[j];
	if (!row) return;
	if (S.in_tb_col === Len(row.txt)) {
		// New empty Line after current
		S.Ttbt.splice(j + 1, 0, { txt: '' });
		S.in_tb_row = S.in_tb_row + 1;
		S.in_tb_col = 0;
		S.in_tb_scrx = 0;
	} else if (S.in_tb_col === 0) {
		// New empty Line before current (the cursor stays on the new, empty row)
		S.Ttbt.splice(j, 0, { txt: '' });
		S.in_tb_col = 0;
		S.in_tb_scrx = 0;
	} else {
		// New Line with splittet content
		const p1 = Mid(row.txt, 1, pos);
		const p2 = Mid(row.txt, pos + 1, -1);
		row.txt = p1;
		S.Ttbt.splice(j + 1, 0, { txt: p2 });
		S.in_tb_row = S.in_tb_row + 1;
		S.in_tb_col = 0;
		S.in_tb_scrx = 0;
	}
}

/**
 * ### Replace Marked: Function gui_tb_replacemarked(txt$).
 *
 * Original behaviour kept, including its defects on multi-row selections:
 *  - the start row keeps one character too many (Left(txt,ms_col+1)), and
 *    nothing at all when the selection starts in column 0;
 *  - the merged row is created with `New`, which appends it to the END of
 *    the row list instead of where the selection was.
 */
export function gui_tb_replacemarked(txt: string): number {
	let i = 0;
	let s = '',
		e = '';
	// For-Each over a list that is modified: iterate a snapshot, delete from the live list.
	for (const row of [...S.Ttbt]) {
		// Start or End Row
		if (i === S.in_ms_row || i === S.in_me_row) {
			if (i === S.in_ms_row && i === S.in_me_row) {
				// One Line
				s = Left(row.txt, S.in_ms_col);
				e = Mid(row.txt, S.in_me_col + 1, -1);
				row.txt = s + txt + e;
				return 1;
			} else if (i === S.in_ms_row) {
				// Start
				if (S.in_ms_col > 0) s = Left(row.txt, S.in_ms_col + 1);
			} else {
				// End
				if (S.in_me_col < Len(row.txt + '1')) e = Mid(row.txt, S.in_me_col + 1, -1);
			}
		}

		// Delete Row
		if (i >= S.in_ms_row && i <= S.in_me_row) {
			const k = S.Ttbt.indexOf(row);
			if (k >= 0) S.Ttbt.splice(k, 1);
		}

		// Add
		if (i === S.in_me_row) {
			S.Ttbt.push({ txt: s + txt + e });
			return 1;
		}

		i = i + 1;
	}
	return 0;
}

/** ### To String Marked: the selection as one string, rows joined with the line separator. */
export function gui_tb_tostrmarked(): string {
	let i = 0;
	let s = '',
		e = '',
		full = '';
	let endingbreak = 0;
	for (const row of S.Ttbt) {
		// Start or End Row
		if (i === S.in_ms_row || i === S.in_me_row) {
			if (i === S.in_ms_row && i === S.in_me_row) {
				// One Line
				return Mid(row.txt, S.in_ms_col + 1, S.in_me_col - S.in_ms_col);
			} else if (i === S.in_ms_row) {
				// Start
				s = Mid(row.txt, S.in_ms_col + 1, -1);
			} else {
				// End
				e = Left(row.txt, S.in_me_col + 1);
				if (e === row.txt) endingbreak = 1;
			}
		}

		// Add Row
		if (i > S.in_ms_row && i < S.in_me_row) full = full + SEP_LINE + row.txt;

		i = i + 1;
	}

	let txt: string;
	if (full === '') txt = s + SEP_LINE + e;
	else txt = s + full + SEP_LINE + e;
	if (endingbreak === 1) txt = txt + SEP_LINE;

	return txt;
}

/** ### Resplit (after Paste!) */
export function gui_tb_resplit(): void {
	const tmp = gui_tb_savestring(SEP_LINE);
	gui_tb_loadstring(tmp, SEP_LINE, 0);
}

/** ### Textbox Loadstring: Function gui_tb_loadstring(txt$,sep$="",clearmode=1) */
export function gui_tb_loadstring(txt: string, sep = '', clearmode = 1): void {
	if (clearmode === 1) gui_tb_clear();
	else S.Ttbt.length = 0;
	if (sep === '' || txt === '') {
		S.Ttbt.push({ txt });
	} else {
		let substr = txt;
		while (Instr(substr, sep)) {
			const pos = Instr(substr, sep);
			S.Ttbt.push({ txt: Left(substr, pos - 1) });
			// (sic) skips one character, whatever the separator's length
			substr = Mid(substr, pos + 1, -1);
		}
		if (substr !== '') S.Ttbt.push({ txt: substr });
	}
}

/** ### Textbox Savestring: every row followed by sep$. */
export function gui_tb_savestring(sep = ''): string {
	let txt = '';
	for (const row of S.Ttbt) txt = txt + row.txt + sep;
	return txt;
}

/** ### Textbox Loadfile: rows from a text file, tabs become three spaces. Returns 0 if it cannot be read. */
export async function gui_tb_loadfile(file: string): Promise<number> {
	const lines = await host.readLines(file);
	if (lines === null) return 0;
	S.Ttbt.length = 0;
	for (const line of lines) S.Ttbt.push({ txt: Replace(line, Chr(9), '   ') });
	return 1;
}

/** ### Textbox Savefile: three spaces become a tab again. */
export async function gui_tb_savefile(file: string): Promise<number> {
	const lines = S.Ttbt.map((row: Ttbt) => Replace(row.txt, '   ', Chr(9)));
	return (await host.writeLines(file, lines)) ? 1 : 0;
}

/** ### Textbox filled? */
export function gui_tb_filled(): number {
	for (const row of S.Ttbt) {
		if (Len(Trim(row.txt)) > 0) return 1;
	}
	return 0;
}

/** ### Textbox insert: insert text at the cursor (used by the command window and helper list). */
export function gui_tb_insert(txt: string): number {
	// Replace
	txt = Replace(txt, Chr(9), '   '); // Tabs
	txt = Replace(txt, Chr(13) + Chr(10), SEP_LINE); // Linebreaks

	const row = S.Ttbt[S.in_tb_row];
	if (row && S.in_tb_row >= 0) {
		const p1 = Left(row.txt, S.in_tb_col);
		const p2 = Mid(row.txt, S.in_tb_col + 1, -1);
		row.txt = p1 + txt + p2;
		S.in_tb_col = S.in_tb_col + Len(txt);
		return 1;
	}
	return 0;
}

/**
 * ### Textbox Scripthelper: Function gui_tb_scripthelper(txt$,col,x,y).
 * Takes the run of [a-z_] characters left of the cursor as a command name;
 * if it is in the reference, shows its syntax above the cursor.
 */
export function gui_tb_scripthelper(txt: string, col: number, x: number, y: number): number {
	// Reset
	S.in_sh = 0;
	S.in_sh_txt = '';
	S.in_sh_cmd = '';
	// Cancel on Empty / 1 Sign Line
	if (col < 2) return 0;
	// Extract possible Command
	txt = Left(txt, col);
	let cmd: string;
	let i: number;
	for (i = col; i >= 1; i--) {
		const s = Asc(Mid(txt, i, 1));
		if (s < 97) {
			if (s !== 95) break;
		}
		if (s > 122) break;
	}
	if (i === 0) cmd = txt;
	else cmd = Mid(txt, i + 1, -1);
	if (Len(cmd) < 2) return 0;
	S.in_sh_cmd = cmd;
	// Find Command in Reference
	for (const sc of host.Tsc) {
		if (sc.cmd === cmd) {
			S.in_sh = 1;
			S.in_sh_txt = sc.cmd + sc.params;
			S.in_sh_x = x + 20;
			S.in_sh_y = y - 20;
			break;
		}
	}
	return 0;
}

/**
 * ### Textbox Scripthelper List: buttons for every command starting with the
 * half-typed word (two rows at the bottom of the script editor). Returns 2
 * when there are more than fit.
 */
export function gui_tb_scripthelper_list(): number {
	const l = Len(S.in_sh_cmd);
	if (l < 2) return 0;
	let x = 236 + 37 + 37 + 37 + 5 + 37 + 37;
	let y = 0;
	// Find Similiar Commands
	for (const sc of host.Tsc) {
		if (Left(sc.cmd, l) === S.in_sh_cmd) {
			const ble = bmpf_len(sc.cmd, Cbmpf_tiny) + 3;
			if (x + ble > 704) {
				x = 236 + 37 + 37 + 37 + 5 + 37 + 37;
				y = y + 1;
				if (y === 2) return 2;
			}
			if (gui_ttb(x, 541 + y * 19, sc.cmd, 0, sc.cmd + sc.params)) {
				gui_tb_insert(Mid(sc.cmd, l + 1, -1));
				S.in_sh = 0;
				S.in_sh_cmd = '';
				S.in_sh_update = 1;
			}
			x = x + ble;
		}
	}
	return 0;
}

// ### Transform Functions

/** SII -> Normal: three spaces to tab, line separator to CR LF (for the clipboard). */
export function gui_tb_tr1(t: string): string {
	t = Replace(t, '   ', Chr(9));
	t = Replace(t, SEP_LINE, Chr(13) + Chr(10));
	return t;
}

/** Normal -> SII */
export function gui_tb_tr2(t: string): string {
	t = Replace(t, Chr(9), '   ');
	t = Replace(t, Chr(13) + Chr(10), SEP_LINE);
	return t;
}
