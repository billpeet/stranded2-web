# Stranded II web port — status and plan

Goal: a Three.js/SvelteKit version of Stranded II 1.0.0.1 that is
feature-identical to the original, loading the original game's data files
unchanged.

**If you are porting game code, read `src/lib/s2/game/PORTING_GUIDE.md`.** It
is the contract for that work: file map, function index, translation rules,
ownership, testing, work packages.

## Sources of truth

| What | Where | Notes |
| --- | --- | --- |
| Original Blitz3D source | `../s2_re/source/source` (clone of github.com/ttyborg/Stranded2) | 118 `.bb` files, ~52k lines. "1.0.0.1 with some minor changes". Read-only reference. |
| Shipped binary symbols | `../s2_re/out/module.json` | 658 function names; 648 match the source. |
| Decompiled C | `../s2_re/out/decomp` | Needed for `ai_signal`, `ai_typesignal`, `ai_behavioursignal`, `ai_unitmode`, which the repository lacks (its `ai_signals.bb` is a stray copy of an AI behaviour file). |
| String constants of the binary | `../s2_re/out/code.bin` | The true bytes of non-ASCII literals. |
| Game data | `static/game/mod` (copied by `pnpm sync-assets`) | Not committed. |

Licence: the source is CC BY-NC-SA 3.0 DE (Peter Schauß / Unreal Software).
Non-commercial, share-alike, must link www.unrealsoftware.de and state that
Stranded II code was used. The licence of the art and sound assets has not
been checked.

### Source text encoding trap

The GitHub copy of the source is UTF-8 made by decoding the original bytes as
ISO-8859-2, so separator characters look wrong. Encode the character in
ISO-8859-2 to get the true byte (confirmed against `code.bin`):

- `Ś` is byte `0xA6`: line separator inside scripts and descriptions — `SEP_LINE` in `src/lib/s2/blitz.ts`
- `ż` is byte `0xBF`: field separator in cached state strings — `SEP_FIELD`
- `Š` is byte `0xA9` (©), `ś` is `0xB6`; the German umlauts are unchanged

The full table and the rule for writing such literals are in the porting
guide, section 8.

## Conventions

- Game logic keeps Blitz3D coordinates, angles (degrees) and 0..255 colours.
  `src/lib/s2/engine/blitzSpace.ts` is the only place that knows about the
  handedness difference.
- Blitz3D 3D commands are the free functions of `src/lib/s2/bb3d` under their
  original names; see its `README.md`.
- Paths stay as the original writes them (`gfx\palm01.b3d`).
- Ported functions keep their original names, in a module named after their
  `.bb` file (`src/lib/s2/game/<file>.ts`).
- Where Blitz semantics differ from JavaScript, use `src/lib/s2/blitz.ts`.
- Everything else: the porting guide.

## Status (integration round, 2026-10-12)

All 657 functions of the source (and the four that only the executable has)
are ported; no generated skeleton is left. `function_index.json` is generated
from the ported modules themselves (status, sync/async and the real TypeScript
signature of each export), so it cannot disagree with the code;
`node scripts/gen-game-foundation.mjs` must be re-run when a module's exported
signature changes (`tests/gameState.test.ts` checks that it is up to date).

The real game runs at `/`: load screens, intro, menu, maps, game, editor.
`pnpm check`: 0 errors. `pnpm vitest run`: all tests pass.

### Runtime layers (`src/lib/s2/`)

| Layer | Path | Original |
| --- | --- | --- |
| Blitz language semantics (Int/Float/Str, float32, strings, Rnd, Type lists, banks) | `blitz/` | the Blitz3D runtime; helpers of `functions.bb` |
| 3D command runtime | `bb3d/`, `engine/anim`, `engine/collision` | Blitz3D entities, meshes, textures, animation, collisions, picks |
| 2D command runtime | `gfx2d/` | Blitz 2D (images, buffers, drawing) |
| Input | `input/` | Blitz input; `input.bb` |
| Audio | `audio/` | Blitz/FMOD audio; `sfx.bb`, `speech.bb`, sound part of `ressources.bb` and `load_media.bb` |
| Interface | `ui/` | `load_bmpf.bb`, `gui.bb`, `gui_tb.bb`, 2D part of `load_media.bb`, `load_strings.bb`, `load_keynames.bb` |
| Script interpreter | `script/` | `parser*.bb`, `timer.bb`; the game side of each command is in `game/script_host/` |
| Environment | `engine/environment/`, `bb3d/environment.ts` | `e_environment.bb`, `grasspread.bb`, `load_lightcycle.bb`, `load_fps.bb` |
| Definition loaders | `defs/` | `load_objects/units/items/infos/states/buildings/combinations/groups/game/settings.bb`, `load_const.bb` |
| File formats | `formats/` | `.s2`/`.sav` maps, `.b3d` |

The game is `src/lib/s2/game/`: one module per `.bb` file (guide, section 2),
`state.ts` (G), `types.ts`, `runtime.ts` (creation and wiring of the layers,
including the interface layer's callbacks into the game: console, debug,
if_drop, p_rectscreen, icons, map list), `main.ts` (StrandedII.bb).

### What was verified in a browser, and how

Edge (headless, software WebGL) driven with `agent-browser` against
`pnpm dev`; input through the input layer's `inject*` functions and, for the
console and text fields, real key events; state read from `window.s2`
(`G`, `RT`, `PROGRAM`, `mod(path)`). Screenshots:
`../s2_re/shots/integration/`. The page option `?nohmr` keeps a running game
from being reloaded while source files change (default in development: a
changed module reloads the page, because a hot update would start a second
game inside the same page).

| Scenario | Status |
| --- | --- |
| a. Boot: load screens, intro, main menu over the menu map, console and its commands | works (the load screens were not captured in a screenshot: too fast with a warm cache) |
| b. Menus: single player list with previews, random island setup, load game, options (key setting, slider, check box, graphics, sound; persisted across a reload), credits, quit with confirmation | works |
| c. Survival Guide through `load_map`: objects/units/items/infos/states, `on:start`, diary, HUD, compass, hand slots | works |
| d. Look, walk, jump, collision with objects (jetty) and terrain, swim and dive | works. No fall damage and no sprint: the original has neither (the `game_falldamage()` calls are commented out in ai_units.bb) |
| e. Inventory, eat, combine (Hammer from Branch + Stone), drop, take in hand, attack an object until destroyed, items of a killed object drop, building menu / placement / building site / finished building, sleep | works |
| f. Units present, animated, moving; a crab killed and looted through the exchange window; a lion attacked and killed the player ("You are DEAD") | works |
| g. Adventure intro sequence with subtitles, diary, trigger areas, msg windows, script error to the console | works; the exact appearance of script errors was not compared with the original |
| h. Save through the save menu and load again: position, inventory, time, weapon, counts match | works (the quick save/load keys do nothing, as in the shipped exe: they set `in_quicksave` without a `Tin_quicksave` entry) |
| i. Random island; Endless Easy / Normal / Hard and Raptor Hunter start | works |
| j. Editor: opens, loads a map, places an object, edits terrain, saves, reloads, test-play (F12) and back; grass map window | works. Not exercised: colour map painting, height map import/export, unit/item/info placement, script editor |
| k. Shooting Range, Tower Defense, Color Game, adventure maps 1-7 load and run | works; Color Game's highscore name (`inputwin`) is empty, see below |

Not verified: multiplayer (no transport), sound output (headless browser),
frame pacing on a real display, long play sessions, every script command in
real maps.

### Known deviations and open problems

- Rendering differences of the 3D layer: `src/lib/s2/bb3d/README.md`, "Not exact".
- `decisionwin` / `inputwin` (script commands that need the answer of a
  modal window inside a running script) open their window deferred and return
  the cancel value. Used by one shipped map (Color Game, `$hname=inputwin(...)`
  for the highscore name). Proposal, not built: make `ScriptEngine.parse()`
  resumable for exactly these two commands: the command handler throws a
  `ScriptSuspend` carrying a promise; `parse()` saves its cursor state
  (p_l, p_p, brace and loop stacks, the pending assignment target) in the
  task, the main loop awaits the promise in `runDeferred()`, stores the answer
  in `p_return$` and re-enters `parse()` at the saved cursor. Everything else
  stays synchronous.
- The colour map and the sky live in the environment layer; the texture
  `ter_tex_color` of the original is a second storage that the map bridge
  (`game/_additions/map.ts`) keeps in step at the points where the game
  writes or replaces it. `e_skybox` has no function; the Settings window of
  the editor and the `skytexture` command ask the layer
  (`game/_additions/editor_menus.ts`). One storage would need the layer to
  draw from bb3d textures and entities.
- Type lists: a deleted object stays in its list as a dead node until the
  main loop purges once per frame (Blitz: until the last reference is gone).
  Only a loop that spans frames (modal windows) could see a difference.
- bb3d keeps positions in doubles (Blitz: float32); `TerrainHeight` rounds
  `byte/255` where the Blitz runtime multiplies by float32(1/255) (save_map
  compensates with `TerrainHeight_exe`).
- Argument evaluation order follows the executable (guide 6.14); the sites
  with several random draws were corrected from the compiler's rule and
  checked against the decompiled code.
- Loudspeaker infos need their sound file preloaded before `load_map`
  (not done: such a loudspeaker stays silent).
- `files.ts` resolves `mods\<name>\` against the mod that was synced, not
  `G.set_moddir`; files of the program directory outside the mod
  (`core\scriptcommands.inf`, templates) are not served, so the editor's
  script helper lists are empty.
- The per-definition progress of the load screen is not shown (20, 60, 80, 98).
- Multiplayer has no transport (browsers have no UDP).
- Frame pacing follows the original (20 ms limiter, then the display's
  vertical blank); `?pacing=timer` gives 50 FPS regardless of the display.

## Commands

```
pnpm sync-assets                       # copy ../stranded2_en/mods/Stranded II into static/game
pnpm dev                               # run the game at /  (?pacing=timer, ?cmd=..., ?nohmr)
pnpm test                              # all tests
pnpm check                             # type-check
node scripts/gen-game-foundation.mjs   # regenerate state/types/index/skeletons from the original source
```
