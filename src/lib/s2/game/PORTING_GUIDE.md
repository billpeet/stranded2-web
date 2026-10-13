# Porting guide: Stranded II game code to TypeScript

This is the contract for everyone who ports a part of the original Blitz3D
source (`../s2_re/source/source`, 118 `.bb` files) into `src/lib/s2/game/`.
The modules are ported in parallel by different people; they fit together
only if every one follows this document. Read all of it before writing code.

Where this guide and your intuition disagree, the guide wins. Where the guide
is silent, the original source wins: port what it does, not what it should do.

Contents

1. [What exists](#1-what-exists)
2. [File map](#2-file-map)
3. [Function index](#3-function-index)
4. [Ownership](#4-ownership)
5. [Fidelity](#5-fidelity)
6. [Translation rules](#6-translation-rules)
7. [Blocking code: async functions](#7-blocking-code-async-functions)
8. [Encoding of strings](#8-encoding-of-strings)
9. [Files, system, network](#9-files-system-network)
10. [The runtime layers from game code](#10-the-runtime-layers-from-game-code)
11. [Script commands (ScriptHost)](#11-script-commands-scripthost)
12. [Testing a ported module](#12-testing-a-ported-module)
13. [Work packages](#13-work-packages)

---

## 1. What exists

| File in `src/lib/s2/game/` | What it is | Edit? |
| --- | --- | --- |
| `state.ts` | `G`: every Global and Dim array of the program | generated, no |
| `types.ts`, `bblist.ts` | every `Type` as a class or record, its list, `New`/`Delete`/`Each`... | generated, no |
| `consts.ts` | every `Const` | generated, no |
| `defs_arrays.ts`, `defs_store.ts`, `defs.ts` | the `D...` definition arrays as accessors; the definition loaders | no |
| `function_index.json`, `FUNCTION_INDEX.md` | every Function: module, signature, sync/async, status | generated, no |
| `rt.ts`, `runtime.ts` | `RT`: the session's layer objects, and their wiring | no |
| `flow.ts` | `frame()`, `delay()`, `waitKey()`, `defer()`, frame limiter | no |
| `files.ts` | Blitz file commands on a writable virtual file system | no |
| `sys.ts` | CommandLine, SystemProperty, ExecFile, End, clipboard, network interface | no |
| `main.ts` | StrandedII.bb: startup, main loop | no |
| `_stubs.ts` | skeleton support and the stand-ins main.ts uses for unported sections | no (delete your stand-in from `STUBS` in your final change if you ported its function) |
| `load_*.ts`, `prepare.ts`, `ressources.ts`, `grasspread.ts`, `*.ported.ts`, facade modules | files of the original that are already ported | no |
| every other `<name>.ts` starting with `// @skeleton` | generated signatures of a file that is not ported | the owner replaces it |
| `script_host/*.ts` | the script commands' game side, one part per work package | add your own file |
| `_additions/<package>.ts` | your temporary additions to the shared files (section 4) | your own file |

`scripts/gen-game-foundation.mjs` generates the generated files from the
original source and from the correction tables at its top. `tests/gameState.test.ts`
checks them against the source.

Layers below `game/` (do not edit; import through the game modules where a
facade exists):

| Layer | Path | Read |
| --- | --- | --- |
| Blitz language semantics | `$lib/s2/blitz` | header comments of `blitz/num.ts`, `blitz/string.ts`, `blitz/typelist.ts` |
| Blitz3D 3D commands | `$lib/s2/bb3d` | `bb3d/README.md` |
| Blitz 2D commands | `$lib/s2/gfx2d` | header of `gfx2d/index.ts` |
| Input | `$lib/s2/input` | `input/index.ts` |
| Audio | `$lib/s2/audio` | header of `audio/S2Audio.ts`, `audio/BlitzAudio.ts` |
| Interface (fonts, GUI, text box) | `$lib/s2/ui` | `ui/host.ts` |
| Script interpreter | `$lib/s2/script` | `script/api.ts`, `script/host.ts` |
| Environment (sea, sky, weather, terrain editing, grass) | `$lib/s2/engine/environment`, `$lib/s2/bb3d/environment` | `e_environment.ported.ts` |
| Definition loaders, map format | `$lib/s2/defs`, `$lib/s2/formats/map.ts` | `defs.ts` |

---

## 2. File map

Every `.bb` file maps to exactly one module with the same base name:
`includes/handle_units.bb` -> `game/handle_units.ts`,
`includes/ai/300_fish.bb` -> `game/ai/300_fish.ts`. Import any function of
the original from the module of its file, under its original lower-case name:

```ts
import { set_unit, con_unit } from './handle_units';
import { parse_sel } from './parser_functions';
import { bmpf_txt } from './load_bmpf';
import { sfx } from './sfx';
```

Kinds of modules:

- **own**: ported by hand in `game/`. Complete.
- **facade**: every function of the file already exists in a runtime layer;
  the module re-exports it under the original name (generated).
- **partial**: some functions exist. They are in `<name>.ported.ts`; the
  owner writes `<name>.ts`, which must start with
  `export * from './<name>.ported';` and adds the rest.
- **skeleton**: nothing exists. The owner writes `<name>.ts`.
- **declarations**: the file only declares globals, types or constants: no module.
- **dead**: the file is not part of the program: do not port.

Files that are top-level code (no `Function`, or statements between
functions) become a function `include_<basename>()` in their module, called
by `main.ts` at the position of the `Include` (for `ai/*.bb`: from the
`Select` in `update_unit`, see below). Declarations (`Global`, `Dim`,
`Const`, `Type`) inside them are already in `state.ts`/`types.ts`/`consts.ts`.

<!-- GENERATED:FILEMAP BEGIN -->
| original file | lines | module | kind | functions (ported / to port) | notes |
| --- | --- | --- | --- | --- | --- |
| StrandedII.bb | 226 | `game/main` | own | - | startup(), mainLoopStep(), main() |
| load_const.bb | 437 | - | declarations | - | constants: consts.ts |
| load_vars.bb | 1425 | - | declarations | - | globals and arrays: state.ts (G); types: types.ts |
| load_commandline.bb | 147 | `game/load_commandline` | own | 1 / 0 | top-level code: `include_load_commandline()` (exists) |
| load_functions.bb | 98 | `game/load_functions` | own | 8 / 0 |  |
| load_settings.bb | 171 | `game/load_settings` | own | 2 / 0 | top-level code: `include_load_settings()` (exists) |
| load_strings.bb | 55 | `game/load_strings` | own | 2 / 0 | top-level code: `include_load_strings()` (exists) |
| load_setup.bb | 96 | `game/load_setup` | own | - | top-level code: `include_load_setup()` (exists) |
| load_bmpf.bb | 488 | `game/load_bmpf` | own | 13 / 0 | top-level code: `include_load_bmpf()` (exists) |
| load_media.bb | 454 | `game/load_media` | own | 1 / 0 | top-level code: `include_load_media()` (exists) |
| load_materials.bb | 160 | `game/load_materials` | own | 3 / 0 | top-level code: `include_load_materials()` - defs/constants.ts (Dmat_swim, Dmat_nofire, Dmat_hard are constant tables); package **map** |
| load_keynames.bb | 39 | `game/load_keynames` | own | 1 / 0 | top-level code: `include_load_keynames()` (exists) |
| load_states.bb | 81 | `game/load_states` | facade | 1 / 0 | top-level code: `include_load_states()` (exists); exists in game/defs.ts |
| load_lightcycle.bb | 36 | `game/load_lightcycle` | facade | 1 / 0 | top-level code: `include_load_lightcycle()` (exists); exists in game/defs.ts |
| load_game.bb | 282 | `game/load_game` | facade | 1 / 0 | top-level code: `include_load_game()` (exists); exists in game/defs.ts |
| load_groups.bb | 64 | `game/load_groups` | facade | 3 / 0 | top-level code: `include_load_groups()` (exists); exists in game/defs.ts |
| load_objects.bb | 314 | `game/load_objects` | facade | 2 / 0 | top-level code: `include_load_objects()` (exists); exists in game/defs.ts |
| load_units.bb | 400 | `game/load_units` | facade | 1 / 0 | top-level code: `include_load_units()` (exists); exists in game/defs.ts |
| load_items.bb | 272 | `game/load_items` | facade | 2 / 0 | top-level code: `include_load_items()` (exists); exists in game/defs.ts |
| load_infos.bb | 106 | `game/load_infos` | facade | 1 / 0 | top-level code: `include_load_infos()` (exists); exists in game/defs.ts |
| load_combinations.bb | 233 | `game/load_combinations` | facade | 2 / 0 | top-level code: `include_load_combinations()` (exists); exists in game/defs.ts |
| load_buildings.bb | 182 | `game/load_buildings` | facade | 1 / 0 | top-level code: `include_load_buildings()` (exists); exists in game/defs.ts |
| load_fps.bb | 26 | `game/load_fps` | own | 1 / 0 |  |
| handle_objects.bb | 811 | `game/handle_objects` | own | 16 / 0 | package **entities1** |
| handle_units.bb | 881 | `game/handle_units` | own | 22 / 0 | package **entities1** |
| handle_items.bb | 1180 | `game/handle_items` | own | 22 / 0 | package **entities2** |
| handle_infos.bb | 814 | `game/handle_infos` | own | 14 / 0 | package **entities2** |
| handle_states.bb | 921 | `game/handle_states` | own | 10 / 0 | package **entities2** |
| handle_all.bb | 684 | `game/handle_all` | own | 16 / 0 | package **entities1** |
| e_clear.bb | 487 | `game/e_clear` | own | 1 / 0 | package **map** |
| e_environment.bb | 1552 | `game/e_environment` | own | 28 / 0 | no function in the port: e_skybox; package **map** |
| e_save_map.bb | 553 | `game/e_save_map` | own | 3 / 0 | package **map** |
| e_load_map.bb | 906 | `game/e_load_map` | own | 7 / 0 | package **map** |
| gui.bb | 2003 | `game/gui` | facade | 33 / 0 | exists in src/lib/s2/ui/gui |
| gui_tb.bb | 782 | `game/gui_tb` | facade | 20 / 0 | exists in src/lib/s2/ui/gui_tb |
| input.bb | 364 | `game/input` | facade | 4 / 0 | exists in src/lib/s2/input/input |
| debug.bb | 308 | `game/debug` | own | 5 / 0 | package **menu** |
| functions.bb | 774 | `game/functions` | own | 33 / 0 | package **map** |
| ressources.bb | 109 | `game/ressources` | own | 3 / 0 |  |
| parentchild.bb | 460 | `game/parentchild` | own | 9 / 0 | package **entities1** |
| grasspread.bb | 213 | `game/grasspread` | own | 5 / 0 |  |
| motionblur.bb | 67 | `game/motionblur` | own | 3 / 0 | package **combat** |
| menu.bb | 1188 | `game/menu` | own | 5 / 0 | package **menu** |
| parser.bb | 358 | `game/parser` | facade | 1 / 0 | exists in RT.script |
| parser_pre.bb | 84 | `game/parser_pre` | facade | 2 / 0 | exists in RT.script |
| parser_functions.bb | 1364 | `game/parser_functions` | facade | 38 / 0 | exists in RT.script |
| parser_brace.bb | 104 | `game/parser_brace` | facade | 2 / 0 | exists in RT.script |
| parser_commands.bb | 5504 | `game/parser_commands` | facade | 1 / 0 | exists in RT.script |
| parser_vars.bb | 701 | `game/parser_vars` | facade | 24 / 0 | exists in RT.script |
| parser_math.bb | 593 | `game/parser_math` | facade | 5 / 0 | exists in RT.script |
| parser_dialogue.bb | 232 | `game/parser_dialogue` | facade | 1 / 0 | exists in RT.script |
| parser_loop.bb | 269 | `game/parser_loop` | facade | 2 / 0 | exists in RT.script; no function in the port: parse_loop_objects, parse_loop_units, parse_loop_items, parse_loop_infos |
| editor.bb | 948 | `game/editor` | own | 1 / 0 | package **editor** |
| editor_menus.bb | 2827 | `game/editor_menus` | own | 6 / 0 | package **editor** |
| editor_functions.bb | 1274 | `game/editor_functions` | own | 31 / 0 | package **editor** |
| game.bb | 124 | `game/game` | own | 1 / 0 | package **player** |
| game_functions.bb | 1511 | `game/game_functions` | own | 24 / 0 | package **player** |
| game_build.bb | 647 | `game/game_build` | own | 6 / 0 | package **combat** |
| game_input.bb | 471 | `game/game_input` | own | 2 / 0 | package **player** |
| game_input_vehicles.bb | 470 | `game/game_input_vehicles` | own | 6 / 0 | package **player** |
| game_focus.bb | 127 | `game/game_focus` | own | 2 / 0 | package **player** |
| game_weapons.bb | 388 | `game/game_weapons` | own | 6 / 0 | package **combat** |
| game_sequences.bb | 697 | `game/game_sequences` | own | 7 / 0 | package **interface** |
| game_changeday.bb | 148 | `game/game_changeday` | own | 4 / 0 | package **player** |
| interface.bb | 3009 | `game/interface` | own | 12 / 0 | package **interface** |
| console.bb | 503 | `game/console` | own | 27 / 0 | package **menu** |
| skills.bb | 102 | `game/skills` | own | 6 / 0 | package **player** |
| particles.bb | 1431 | `game/particles` | own | 15 / 0 | package **combat** |
| projectiles.bb | 657 | `game/projectiles` | own | 5 / 0 | package **combat** |
| timer.bb | 137 | `game/timer` | facade | 4 / 0 | exists in RT.script |
| physics.bb | 29 | `game/physics` | own | 1 / 0 | package **map** |
| collisions.bb | 80 | `game/collisions` | own | 4 / 0 | top-level code: `include_collisions()` (exists); package **map** |
| sfx.bb | 160 | `game/sfx` | facade | 7 / 0 | exists in RT.audio, game/ressources.ts |
| unrealsoftware.bb | 51 | `game/unrealsoftware` | own | 1 / 0 | package **menu** |
| cull.bb | 424 | `game/cull` | own | 2 / 0 | package **map** |
| ai_units.bb | 1462 | `game/ai_units` | own | 23 / 0 | package **ai** |
| ai/001_normal_animal.bb | 61 | `game/ai/001_normal_animal` | own | - | top-level code: `include_001_normal_animal()` (exists); package **ai** |
| ai/002_raptor_predator.bb | 61 | `game/ai/002_raptor_predator` | own | - | top-level code: `include_002_raptor_predator()` (exists); package **ai** |
| ai/003_standandsnap.bb | 19 | `game/ai/003_standandsnap` | own | - | top-level code: `include_003_standandsnap()` (exists); package **ai** |
| ai/004_idle.bb | 16 | `game/ai/004_idle` | own | - | top-level code: `include_004_idle()` (exists); package **ai** |
| ai/005_idleturn.bb | 21 | `game/ai/005_idleturn` | own | - | top-level code: `include_005_idleturn()` (exists); package **ai** |
| ai/006_standandshoot.bb | 19 | `game/ai/006_standandshoot` | own | - | top-level code: `include_006_standandshoot()` (exists); package **ai** |
| ai/007_monkey.bb | 61 | `game/ai/007_monkey` | own | - | top-level code: `include_007_monkey()` (exists); package **ai** |
| ai/008_shy.bb | 61 | `game/ai/008_shy` | own | - | top-level code: `include_008_shy()` (exists); package **ai** |
| ai/009_plague.bb | 103 | `game/ai/009_plague` | own | - | top-level code: `include_009_plague()` (exists); package **ai** |
| ai/010_landbird.bb | 61 | `game/ai/010_landbird` | own | - | top-level code: `include_010_landbird()` (exists); package **ai** |
| ai/200_crab.bb | 64 | `game/ai/200_crab` | own | - | top-level code: `include_200_crab()` (exists); package **ai** |
| ai/201_amphibian.bb | 58 | `game/ai/201_amphibian` | own | - | top-level code: `include_201_amphibian()` (exists); package **ai** |
| ai/300_fish.bb | 72 | `game/ai/300_fish` | own | - | top-level code: `include_300_fish()` (exists); package **ai** |
| ai/301_circlingfish.bb | 34 | `game/ai/301_circlingfish` | own | - | top-level code: `include_301_circlingfish()` (exists); package **ai** |
| ai/302_predatorfish.bb | 80 | `game/ai/302_predatorfish` | own | - | top-level code: `include_302_predatorfish()` (exists); package **ai** |
| ai/303_deepseafish.bb | 74 | `game/ai/303_deepseafish` | own | - | top-level code: `include_303_deepseafish()` (exists); package **ai** |
| ai/400_405_406_bird.bb | 47 | `game/ai/400_405_406_bird` | own | - | top-level code: `include_400_405_406_bird()` (exists); package **ai** |
| ai/401_circlingbird.bb | 21 | `game/ai/401_circlingbird` | own | - | top-level code: `include_401_circlingbird()` (exists); package **ai** |
| ai/404_flyinginsect.bb | 46 | `game/ai/404_flyinginsect` | own | - | top-level code: `include_404_flyinginsect()` (exists); package **ai** |
| ai/407_landskybird.bb | 89 | `game/ai/407_landskybird` | own | - | top-level code: `include_407_landskybird()` (exists); package **ai** |
| ai/408_killerbird.bb | 102 | `game/ai/408_killerbird` | own | - | top-level code: `include_408_killerbird()` (exists); package **ai** |
| ai_signals.bb | 61 | `game/ai_signals` | own | 4 / 0 | top-level code: `include_ai_signals()` - nothing: the repository file is a stray copy of an AI behaviour; the executable has four functions here (see EXE_ONLY); package **ai** |
| unitpath.bb | 212 | `game/unitpath` | own | 5 / 0 | package **ai** |
| tcpcommands.bb | 104 | `game/tcpcommands` | own | 2 / 0 | package **net** |
| udp.bb | 42 | - | declarations | - | only Includes the udp_*.bb files |
| udp_constants.bb | 38 | - | declarations | - | constants: consts.ts |
| udp_variables.bb | 86 | - | declarations | - | globals and arrays: state.ts (G); types: types.ts |
| udp_functions.bb | 791 | `game/udp_functions` | own | 13 / 0 | package **net** |
| udp_messages.bb | 152 | `game/udp_messages` | own | 13 / 0 | package **net** |
| udp_processing.bb | 164 | `game/udp_processing` | own | 1 / 0 | package **net** |
| mp_usgn.bb | 190 | `game/mp_usgn` | own | 4 / 0 | package **net** |
| mp_game.bb | 106 | `game/mp_game` | own | 1 / 0 | package **net** |
| mp_game_functions.bb | 306 | `game/mp_game_functions` | own | 8 / 0 | package **net** |
| mods.bb | 309 | `game/mods` | own | 5 / 0 | package **menu** |
| randommap.bb | 444 | `game/randommap` | own | 4 / 0 | top-level code: `include_randommap()` (exists); package **map** |
| speech.bb | 63 | `game/speech` | facade | 1 / 0 | exists in RT.audio |
| prepare.bb | 15 | `game/prepare` | own | 1 / 0 |  |
| mp_get_client.bb | 2 | - | dead | - | empty |
| mp_get_server.bb | 2 | - | dead | - | empty |
| parser_math.bb2.bb | 354 | - | dead | 0 / 0 | older copy of parser_math.bb, not included |
| watersystem.bb | 12 | - | dead | 0 / 0 | not included; updatewatersystem is an empty stub that the executable does not contain |
<!-- GENERATED:FILEMAP END -->

Notes on single files:

- **`ai/*.bb`** are included inside `Select Dunit_behaviour(TCunit\typ)` of
  `update_unit` (ai_units.bb:938-1024). Each becomes
  `export function include_<name>(): void` in `game/ai/<name>.ts`, working on
  `G.TCunit` like the inline code does. They use no locals of `update_unit`
  except implicitly declared ones (`x`), which become locals of the function.
- **`ai_signals.bb`**: the repository file is a stray copy of an AI behaviour
  file as top-level code; it is NOT what shipped and is not ported. The
  shipped executable has four functions in its place. Port them from the
  decompiled C into `game/ai_signals.ts`:
  `../s2_re/out/decomp/ai_signal.c`, `ai_typesignal.c`, `ai_behavioursignal.c`,
  `ai_unitmode.c` (names of callees and globals: `../s2_re/out/module.json`).
  The skeleton's signatures (`...args: number[]`) are placeholders: the owner
  fixes them first and announces them in `_additions/<package>.ts`. Callers:
  `parse_commands` ("ai_signal", "ai_typesignal", "ai_behavioursignal",
  "ai_mode" via ScriptHost) and the AI code.
- **`watersystem.bb`** (`updatewatersystem`, an empty loop) is never included
  and not in the executable: not ported. Same for `parser_math.bb2.bb`
  (an older copy), `mp_get_client.bb`, `mp_get_server.bb` (empty).
- **`interface.bb`**: `interface` is a reserved word; the function is
  exported as `interface_`. (Rule: a function whose name is a reserved word
  of JavaScript gets a trailing underscore. It is the only one.)
- **`console.bb`** exports a function `console`. Import it as
  `import { console as console_ } from './console'`, and inside console.ts
  use `globalThis.console` for the browser's.
- **`e_environment.bb`**, **`grasspread.bb`**, **`e_clear.bb`**: the
  environment layer keeps terrain, colour map, sea, sky and grass in its own
  objects. Read the header of `e_environment.ported.ts`. `e_clear()` (to
  port) calls `RT.core.e_clear()` for the environment part of the original
  function and `RT.audio.e_clear_audio()` for the sound part.
- **`e_load_map.bb`**: `formats/map.ts` parses the file format; `load_map`
  still has to be ported for its effects (entities, script variables, G).
  `RT.env.setMap(map, terrain)` builds terrain and environment from parsed
  map data (see `runtime.ts` `loadMapScene` for the calls).
- **`functions.bb`**: `split` fills `G.splits` (and returns it);
  `numsep(txt)` uses `s(33)`.
- **`load_materials.bb`**: `Dmat_swim(i)`, `Dmat_nofire(i)`, `Dmat_hard(i)`
  are accessors in `defs_arrays.ts`; `get_material` exists.

---

## 3. Function index

`function_index.json` lists every `Function` of the original (and every
`include_<file>()`), with

| field | meaning |
| --- | --- |
| `name` | original name, lower case |
| `bb` | original signature, e.g. `set_unit(id=-1,typ,x#,z#)` |
| `file`, `line`, `lines` | where it is in the source |
| `module`, `export` | import path and exported name (`export` differs from `name` only for `interface_`) |
| `ts` | TypeScript signature of the skeleton |
| `async` | true: returns a Promise, must be awaited (section 7) |
| `asyncBecause` / `barrier` | why it is async / why it is not although the original blocks |
| `status` | `ported` (exists now), `todo`, `absorbed` (no function in the port; `note` says where its work happens), `dead` |
| `via` | for `ported`: the layer or module that implements it |

`FUNCTION_INDEX.md` is the same as tables per file.

Rules:

- Call other modules only through the index. If the function you need is
  `todo`, import it anyway from its module: the skeleton is there, type-checks,
  and throws `NotPortedError` until its owner lands.
- **Signatures are fixed**: name, parameter order, defaults, sync/async. The
  skeleton's parameter and return *types* are the default typing by sigil
  (Int/Float -> `number`, `$` -> `string`, `.T` -> `T | null`, no `Return value`
  anywhere in the function -> `void`), with entity handles already typed
  `Handle` where the generator knows them. If a type is wrong (an Int
  parameter that is really an entity, image or texture), the owner corrects
  it in the port and lists the change in `_additions/<package>.ts`.
- A function that the original declares without `Return <value>` is `void`.
  If a caller uses its value (it is always 0), write `0`.

---

## 4. Ownership

- You edit only the modules of your work package (section 13), your
  `script_host/<package>.ts`, your `_additions/<package>.ts` and your tests
  (`tests/game/<package>*.test.ts`).
- Nobody edits `state.ts`, `types.ts`, `consts.ts`, `defs*.ts`, `runtime.ts`,
  `rt.ts`, `flow.ts`, `files.ts`, `sys.ts`, `main.ts`, the facades, or
  another package's modules. If something is missing or wrong there (a
  global the parser missed, a wrong handle type, a missing layer function),
  put a working substitute into `game/_additions/<package>.ts`, with a
  comment saying what should change where, and report it. Example:

  ```ts
  // game/_additions/entities1.ts
  /** types.ts: Tup.info is typed number but (say) holds an entity. Substitute until fixed: */
  export const upInfo = (u: Tup) => u.info as unknown as Handle;
  /** function_index: get_unit(searchhandle,...) takes an entity -> its signature is (searchhandle: Handle, ...). */
  ```
- Calls into other packages are written against the function index. They
  resolve (stop throwing `NotPortedError`) when the other package lands. Do
  not write your own copy of another package's function, and do not stub it.
- A skeleton module is replaced as a whole: remove the `// @skeleton` first
  line, keep every exported name. Port all functions of the file, including
  the ones nothing seems to call.
- When your function replaces a stand-in of `_stubs.ts` (`menu`, `console`,
  `con_add`, `e_clear`, ...), `main.ts` and the foundation switch over by
  themselves (`live(real, stub)` checks whether the real one is still a skeleton).

---

## 5. Fidelity

The goal is a feature-identical game, bugs included.

1. **Port every statement of every branch**, in the original order: dead
   code (`If 1=0`), debug paths (`If set_debug`, `set_debug_load`,
   `set_debug_rt`...), commented-out alternatives stay comments.
2. **Do not improve.** No refactoring into helpers, no early returns that
   change evaluation order, no clamping the original does not do, no fixing
   of obvious bugs. Evaluate function arguments and operands in the order the
   executable uses when they have side effects (`Rnd`/`Rand`, stream reads,
   calls that change globals). That order is **not** plain left to right:
   see section 6.14.
3. **Keep quirks, and mark them**: one line `// quirk: <what happens>` where
   the original does something surprising that a reader might "fix"
   (a variable used before it is set, a misspelled global that is therefore a
   fresh local, an `Int` receiving a Float, a loop that never runs).
4. **Keep the original comments** (translate nothing): `;Setup AI Center`
   becomes `//Setup AI Center`. Every function starts with
   `/** Function <original signature> */`.
5. **Names**: globals, functions, locals, fields keep their original names
   and case as declared (`Tunit\ai_ch` -> `.ai_ch`). Blitz identifiers are
   case insensitive: where the source varies the case (`Bmpf_txt`,
   `Dunit_ani_move` vs. `dunit_ani_move`), use the declared spelling.
6. **Where the shipped executable differs from the repository source**
   ("1.0.0.1 with some minor changes"), the executable wins. Known cases: the
   four `ai_signal` functions (section 2) and the dead files. If you find
   another (a function in `../s2_re/out/module.json` that the source lacks or
   that clearly differs), port the source, mark it `// exe differs: ...` and
   report it.
7. A crash of the original (`RuntimeError`, "Memory access violation" on a
   Null object, division by zero) is a thrown `BlitzRuntimeError` here: the
   helpers of `$lib/s2/blitz` and the lists throw where Blitz would. Do not
   catch them.

---

## 6. Translation rules

Imports used below:

```ts
import { Abs, Chr, Float, Instr, Int, Left, Len, Mid, Rand, Rnd, RuntimeError, Sgn, Str, f32, idiv, idivConst, imod, forFloat /* ... */ } from '../blitz';
import { G, dim } from './state';
import { New, Delete, First, After, Each, isNull, Tunit /* ... */ } from './types';
import { Cclass_unit /* ... */ } from './consts';
import { Dunit_speed /* ... */ } from './defs_arrays';
```

### 6.1 Globals

Every Global and Dim array is a property of `G`, original name without sigil.

```blitz
set_debug=1 : in_mx=MouseX() : map_hour=map_hour+1
If g_player=TCunit\id Then pv_x#=EntityX(TCunit\h)
```
```ts
G.set_debug = 1; G.in_mx = MouseX(); G.map_hour = G.map_hour + 1;
if (G.g_player === G.TCunit!.id) G.pv_x = EntityX(G.TCunit!.h);
```

Never copy a global into a local "for speed" across a call: the callee may
change it. Constants (`Const`, load_const.bb and others) are imported from
`./consts`.

### 6.2 Locals and implicit declaration

A variable that is not a Global is a local of the function, whether declared
with `Local` or just used. It exists from the start of the function with 0,
0.0, "" or Null, and keeps one type for the whole function: the sigil of its
first appearance (`x#` Float, `t$` String, `p.Tunit` object, none: Int).

- Declare **all** locals at the top of the function with their Blitz default,
  in order of first appearance: `let x = 0; let name = ''; let u: Tunit | null = null;`
  Do not rely on `let` in inner blocks: Blitz locals are function-scoped and
  a second loop often reads what the first left.
- A misspelled global is a local (starts at 0 on every call). Keep it, with
  `// quirk:`.
- **Assignment converts to the variable's type.** Keep it exact:

  | assigned to | value is | write |
  | --- | --- | --- |
  | Int variable | Float expression | `x = Int(expr)` (fistp: round to nearest, ties to even; never `Math.floor`/`trunc`) |
  | Int variable | String | `x = Int(str)` (atoi) |
  | Float variable | Int or Float | `x = f32(expr)` |
  | Float variable | String | `x = Float(str)` |
  | String variable | Int | `s = Str(n)` |
  | String variable | Float | `s = Str(x, 'float')` |

  ```blitz
  perc#=Float(Float(object_count)/Float(load_objects_c))   ; Float local
  y=20+(40.*perc#)                                         ; y has no sigil: Int
  size=Dobject_size#(typ,1)*10
  ```
  ```ts
  perc = f32(G.object_count / G.load_objects_c);
  y = Int(f32(20 + f32(40 * perc)));
  size = Int(f32(Dobject_size(typ, 1) * 10));
  ```
  The same conversion happens for arguments (a Float passed to an Int
  parameter is rounded: `Int(...)` at the call), for `Return`, for array
  elements and for Type fields. `Dx(i)` Int arrays, `G.` Int globals and Int
  fields receive `Int(...)`.

### 6.3 Arithmetic

Operand types decide the operation (see the header of `blitz/num.ts`):
String anywhere -> string concatenation; otherwise a Float operand or `^`
-> Float; otherwise Int.

- **Float**: every single operation rounds to float32. Wrap each operation
  whose result is not obviously exact: `a# * b# + c#` -> `f32(f32(a * b) + c)`.
  You may leave out `f32` only around an operation that feeds directly into
  another `f32(...)` *of the same kind of exactness you can prove* (in doubt,
  wrap). Values stored in Float variables, Float fields and Float arrays must
  always be float32: wrap the stored expression. `Sin`, `Cos`, `Sqr`, `ATan2`,
  `Rnd`... of `$lib/s2/blitz` take degrees and already return float32.
  Float literals are float32: `0.2` as a Float value is `f32(0.2)`
  (`x# = 0.2` -> `x = f32(0.2)`; in a product `f32(v * 0.2)` is enough).
- **Int `+ - *`**: plain JS on integers; where 32-bit overflow is possible
  (colour packing, hashes, serial arithmetic) use `iadd`/`imul` or `| 0`.
- **Int division** truncates, except by a constant power of two:

  ```blitz
  cx=set_scrx/2            ; constant 2      -> idivConst (sar: floors)
  n=total/count            ; variable        -> idiv
  h=(y1-y2)/3              ; constant, not a power of two -> idiv
  f#=Float(a)/b            ; Float division
  ```
  ```ts
  cx = idivConst(G.set_scrx, 2);
  n = idiv(total, count);
  h = idiv(y1 - y2, 3);
  f = f32(a / b);
  ```
  `idiv`/`imod` throw "Integer divide by zero" like the original. A literal
  or `Const` divisor that is 1, 2, 4, 8, ... -> `idivConst`; everything else
  -> `idiv`. A Global is not a constant.
- **`Mod`**: Int -> `imod(a, b)` (sign of the dividend); Float -> `fmod`.
- **`^`**: `fpow(a, b)`, always Float.
- **`Abs`, `Sgn`**: `Abs`/`Sgn` of blitz (Int stays Int); for Floats `fabs`/`fsgn`.
- **`Int(x)`**: `Int(x)`. **`Float(x)`**: `Float(x)`. **`Str(x)`**: `Str(x)`
  for an Int, `Str(x, 'float')` for a Float.
- **`Rnd(a,b)`, `Rand(a,b)`, `SeedRnd`**: the functions of `$lib/s2/blitz`
  (one generator for the whole program; the script engine uses the same).
  Never `Math.random()`.
- **`Shl`, `Shr`, `Sar`**: `Shl(a,n)`, `Shr(a,n)`, `Sar(a,n)`.

### 6.4 `And`, `Or`, `Xor`, `Not`, conditions

`And`/`Or`/`Xor` are bitwise on Ints and evaluate both sides; comparisons
give 1 or 0; `If x` is true when `Int(x) <> 0`.

- Between comparisons, `&&` / `||` are equivalent **unless the right side has
  a side effect or can throw** (a function call that changes state, `After`
  of a possibly Null object, a field of a possibly Null object: Blitz
  evaluates it and may crash; keep that by using the bitwise form):

  ```blitz
  If x>0 And y>0 Then ...                 ' pure        -> if (x > 0 && y > 0)
  If con_unit(id) And TCunit\health>0     ' side effect -> if ((con_unit(id) & (G.TCunit!.health > 0 ? 1 : 0)) !== 0)
  If flags And 4 Then ...                 ' bit test    -> if ((flags & 4) !== 0)
  ```
- `Not x` is `x = 0`: `Not(x)` of blitz, or `x === 0` / `!cond` for a comparison.
  Mind the precedence: `Not a=b` is `Not (a=b)`; `Not a And b` is `Not (a And b)`.
- `If x Then` with an Int: `if (x !== 0)` (or `if (x)`); with a Float:
  `if (Int(x) !== 0)` (0.4 is false); with a String: `if (Int(s) !== 0)`;
  with an entity handle: `if (h !== null)`; with an image: `if (img !== 0)`.
- Precedence, loosest first: `Not`; `And Or Xor` (equal, left to right);
  comparisons; `+ -`; `Shl Shr Sar`; `* / Mod`; `^`; unary. So
  `a Or b And c` is `(a Or b) And c`, and `-x^2` is `(-x)^2`. Parenthesise the
  translation accordingly.

### 6.5 Strings

Strings are byte strings: one JavaScript char per byte, codes 0..255
(section 8). Use the Blitz functions of `$lib/s2/blitz` (`Len Left Right Mid
Instr Replace Upper Lower Trim LSet RSet Chr Asc Hex Bin String`); positions
are 1-based and **bad arguments throw as in Blitz** (`Left(s,-1)`,
`Mid(s,0)`, `Instr(s,t,0)`): do not guard them, do not replace them by
`slice`/`substring`/`indexOf`.

- Concatenation with a number converts with `Str`:

  ```blitz
  con_add("Unit "+id+" at "+EntityX(h))        ' id Int, EntityX Float
  txt$=txt$+Chr(13)+f#
  ```
  ```ts
  con_add('Unit ' + Str(id) + ' at ' + Str(EntityX(h), 'float'));
  txt = txt + Chr(13) + Str(f, 'float');
  ```
  (`'x' + id` gives the same text for an Int in JavaScript; a Float never
  does. Always `Str(x, 'float')` for Floats.)
- **Comparing a string with a number compares as strings**: the number is
  converted with `Str`, not the string parsed.
  `If val$=0` -> `if (val === '0')`; `If Tx\value$>5` -> `strCompare(tx.value, '5') > 0`;
  `If param()=1` -> `param() === '1'`. `<`/`>` on strings: `strCompare(a, b)`
  (byte order), not JS `<` on mixed types.
- `Select txt$ / Case "a","b"` -> `switch (txt) { case 'a': case 'b': ...; break; }`.
- A String used where an Int is expected is converted with `Int(s)` (atoi:
  leading digits, else 0); where a Float is expected `Float(s)`.
- Case: `Upper`/`Lower` of blitz (bytes), not `toUpperCase`.

### 6.6 Control flow

- **`If`**: `If a Then b : c` on one line puts **both** b and c under the If.
  `If a Then b Else c` likewise.
- **`Select`**: no fall-through, the first matching Case wins, `Default`
  only if none matched.

  ```blitz
  Select x
      Case 1,2 a()
      Case 3 b()
      Default c()
  End Select
  ```
  ```ts
  switch (x) {
      case 1:
      case 2:
          a();
          break;
      case 3:
          b();
          break;
      default:
          c();
  }
  ```
  Every `case` ends with `break` (or `return`). The selector is evaluated
  once. `Case` expressions that are not constants (`Case a+1`, `Case f(x)`,
  ranges written as comparisons) become an `if / else if` chain over a local
  holding the selector. `Select True`-style and Float/String selectors compare
  with Blitz's typing rules (6.4, 6.5). `Exit` inside a `Select` leaves the
  enclosing **loop**: a `break` inside `switch` does not, use a labelled
  `break loop;`.
- **`For i=a To b [Step s]`** (Int): `for (i = a; i <= b; i += s)`
  (`>=` for a negative step). `b` is evaluated on every pass, `s` once and it
  must be a constant. The loop variable is a function local: after the loop
  it holds the first value that failed the test (`b+1`), after `Exit` the
  current value; code after the loop may use it. A Global as loop variable
  stays `G.x`.
- **`For x#=a To b Step s`** (Float): `for (const x of forFloat(a, b, s))`
  when `b` is constant in the loop; otherwise write the loop out with
  `x = f32(x + s)` and the test of `forFloat`. An Int variable with a Float
  step: the step is rounded to Int once (`Step 0.5` is 0: endless loop; keep, with `// quirk:`).
- **`While c ... Wend`** -> `while (cond)`; **`Repeat ... Until c`** ->
  `do { } while (!(cond))`; **`Repeat ... Forever`** -> `for (;;) { }`.
- **`Exit`** -> `break` (labelled if inside a `switch`).
- **`Return`** without a value returns 0 / "" / Null according to the
  function's type; in a `void` port just `return;`. `Return x` converts to the
  function's type (`Function f#()` returns `f32(...)`, `Function f$()` returns
  `Str(...)` of a number, an Int function returning a Float expression
  returns `Int(...)`).
- **`Goto`, `Gosub`, labels**: the source has none.
- **`End`** -> `End()` of `./sys` (throws; the main loop shuts down).
  **`RuntimeError msg`** -> `RuntimeError(msg)` (throws; main shows the
  message box and ends). **`DebugLog x`** -> `DebugLog(x)` of `./sys` (keep
  the call; commented-out ones stay comments). `Stop` (debugger) -> nothing, as a comment.
- **`Include`** inside a function (ai_units.bb): a call of `include_<name>()`.

### 6.7 Functions

```blitz
Function set_unit(id=-1,typ,x#,z#)        ; Int result (no sigil)
Function e_tery#(x#,z#)                   ; Float result
Function ss$(txt$,p1$="",p2$="",p3$="")   ; String result
Function gui_win_color()                  ; no Return value anywhere -> void
```
```ts
export function set_unit(id = -1, typ: number, x: number, z: number): number
export function e_tery(x: number, z: number): number      // returns float32
export function ss(txt: string, p1 = '', p2 = '', p3 = ''): string
export async function gui_win_color(): Promise<number>
```

- Parameters are locals: assigning to them is fine and common.
- Default values as in the original. A defaulted parameter before a
  required one (`set_unit(id=-1,typ,...)`) stays as it is: callers always pass it.
- The caller converts arguments to the parameter's type (6.2).
- A function reads and writes its result through globals as often as
  through `Return` (`con_unit(id)` sets `TCunit`). Keep both.
- Calls without parentheses (`con_add "x"`) are calls.
- An object parameter (`u.Tunit`) is `u: Tunit | null`.

### 6.8 Types and lists

See the header of `types.ts`. Summary:

```blitz
Tunit.Tunit=New Tunit : Tunit\id=5          ; local named like its type
For Tunit.Tunit=Each Tunit
    If Tunit\typ=typ Then Delete Tunit
Next
If Tunit=Null Then ...
TCunit.Tunit=First Tunit : TCunit=After TCunit
Insert Titem After Last Titem
For Tx.Tx=Each Tx : If Tx\key$=k$ Then Exit : Next
If Tx<>Null Then v$=Tx\value$
```
```ts
let Tunit_: Tunit | null = null;            // a local named like its Type gets a trailing underscore
Tunit_ = New(Tunit); Tunit_.id = 5;
for (Tunit_ = First(Tunit); Tunit_ !== null; Tunit_ = After(Tunit, Tunit_)) {
    if (Tunit_.typ === typ) Delete(Tunit, Tunit_);
}
if (isNull(Tunit, Tunit_)) ...
G.TCunit = First(Tunit); G.TCunit = After(Tunit, G.TCunit);
InsertAfter(Titem, Titem_!, Last(Titem)!);
for (Tx_ = First(Tx); Tx_ !== null; Tx_ = After(Tx, Tx_)) { if (Tx_.key === k) break; }
if (Tx_ !== null) v = Tx_.value;
```

- **Naming**: the class is the Type's declared name with a capital first
  letter (`Tunit`, `T3d`, `Tconst`). A local variable with the same name as
  its Type (the usual `For Tunit.Tunit=Each Tunit`) is named `Tunit_`.
  Globals keep their name on `G` (`G.TCunit`).
- **`For x.T=Each T`** is `x=First T` and `x=After x` at each `Next`, and
  the variable keeps its value after the loop: **Null after a complete loop,
  the current object after `Exit`**. Use the `for (x = First(T); x !== null; x = After(T, x))`
  form whenever the variable is a global, is read after the loop, or the
  body may return while the variable matters. `for (const x of Each(T))` only
  for a local that is not used after the loop.
- **Deleting inside the loop** is safe in both forms, also for other
  elements. `Delete x` leaves `x` pointing at the dead object: its fields
  still read (stale values; Blitz would crash), `x = Null` is true for it.
  So: `If x=Null` / `If x<>Null` -> `isNull(T, x)` / `!isNull(T, x)` when
  `x` may have been deleted (by this function or a callee) since it was
  assigned; a plain `x === null` is enough right after `First`/`After`/`New`
  or a loop. When in doubt use `isNull`: it is always right.
  `Handle(x)=0` / `Handle(x)<>0` is the same test: `isNull(T, x)`.
- **Field access on a possibly Null variable**: Blitz crashes ("Memory
  access violation"); the port may crash with a TypeError. Write `x!.field`
  where the original relies on x being set, do not add checks.
- **Fields**: `x\name$` -> `x.name`; `x\ints[2]` -> `x.ints[2]`. Field types
  convert on assignment like variables (6.2).
- **Reused Types** (`TYPE_INFO[...].kind === 'reused'`: Tx, Ttimer, Tfile,
  Ttbt, Tres, Tsg, Tgroup, Tcom, Tbui, Tdefvar ...) are plain records in an
  array owned by a layer; the same `New`/`Delete`/`First`/`After` work on
  them. Their record types come from the layer and may differ in detail from
  the original Type (Tlensf, Twave: see `TYPE_INFO[].owner`).
- **Private Types** (Tpc, Tpj, Tpm, Tplj: script engine; Tbmpf_s: fonts) are
  kept inside their layer. Code outside the parser does not touch them in
  the original either, except e_clear: use `clear_parsecache()`.
- `Handle(x)` / `Object.T(h)` as numbers (randommap.bb `Drpool`):
  `HandleOf(T, x)` / `ObjectOf(T, h)`.
- "Current object" globals (`TCobject`, `TCunit`, `TCitem`, `TCinfo`,
  `TCstate`, `TCx`, `TCp`, `TCpro`, `TCup`, `g_cplayer`) are how functions
  pass objects around: a callee's `con_unit(id)` changes `G.TCunit` for the
  caller too. Never cache them in a local across a call unless the original does.

### 6.9 Arrays (`Dim`)

`Dim a(n)` has n+1 elements; `a(i,j)` -> `G.a[i][j]`. Element types convert
on assignment (6.2). A `Dim` inside a function replaces the array with a new
cleared one:

```blitz
Dim g_unitlist.Tunit(g_unitlistc)       -> G.g_unitlist = dim<Tunit | null>(null, G.g_unitlistc);
Dim seq_msg$(2,1)                       -> G.seq_msg = dim('', 2, 1);
Dim env_wavematrixy#(size,size)         -> G.env_wavematrixy = dim(0, size, size);
```

Out-of-range indices are not checked by the release runtime (they read or
overwrite other memory). The port reads `undefined`; where the original
visibly depends on an out-of-range access, keep the access and mark it `// quirk:`.

### 6.10 Definition arrays (`D...`)

```blitz
name$=Dunit_name$(TCunit\typ)                     -> name = Dunit_name(G.TCunit!.typ);
s#=Dobject_size#(typ,1)                           -> s = Dobject_size(typ, 1);
Animate h,1,Dunit_ani_move(typ,0),Dunit_ani_move(typ,1)
                                                  -> Animate(h, 1, Dunit_ani_move(typ, 0), Dunit_ani_move(typ, 1));
Dunit_speed#(1)=fval#                             -> Dunit_speed.set(1, f32(fval));
If Dobject_modelh(i)=0 Then Dobject_modelh(i)=load_res(...)
                                                  -> if (Dobject_modelh(i) === null) Dobject_modelh.set(i, load_res(..., Cres_mesh));
```

Import them from `./defs_arrays` (or `./defs`). Index 0 is a real slot.
`Dobject_modelh`, `Dunit_modelh`, `Ditem_modelh` are `Handle`;
`D*_iconh`, `Ditem_icondh`, `Dstate_icon` are `ImageHandle`. Counts and
limits are globals: `G.object_count`, `G.Cobject_count`, `G.Cunit_count`,
`G.Citem_count`; `Cinfo_count`, `Cstate_count` are constants. Script texts:
`Dunit_script(typ)`, keys `Dunit_scriptk(typ)` (the `Instr(Dunit_scriptk$(typ),"Śevent")`
test works unchanged, with the separator of section 8).

### 6.11 Handles: entities, textures, images, sounds

| Blitz value | TypeScript | "0" | test |
| --- | --- | --- | --- |
| entity (mesh, pivot, camera, light, sprite, terrain) | `Handle` = `BBEntity \| null` | `null` | `h !== null` |
| texture | `Texture \| null` | `null` | `t !== null` |
| brush | `Brush \| null` | `null` | |
| image | `ImageHandle` = `BBImage \| 0` | `0` | `img !== 0` |
| 2D buffer | `Canvas2D` (`BackBuffer()`, `ImageBuffer(img)`, `TextureBuffer(tex)`) | - | |
| sound, channel | `number` | `0` | `snd !== 0` |
| stream, directory | `Stream`, `DirHandle` of `./files` | `0` | `stream !== 0` |
| bank | `Bank` of blitz | - | |

```blitz
If h<>0 Then FreeEntity h : h=0           -> if (h !== null) { FreeEntity(h); h = null; }
TCunit\h=CreatePivot()                    -> G.TCunit!.h = CreatePivot();
If EntityPick(cam,50)=TCobject\h Then     -> if (EntityPick(G.cam!, 50) === G.TCobject!.h)
img=load_res(file$,Cres_image) : If img<>0 Then DrawImage img,x,y
                                          -> img = load_res(file, Cres_image); if (img !== 0) DrawImage(img, x, y);
chan=sfx(sfx_click) : If ChannelPlaying(chan) Then StopChannel chan
                                          -> chan = sfx(G.sfx_click); if (ChannelPlaying(chan)) StopChannel(chan);
```

- An entity command on a freed or null entity throws here (Blitz corrupts
  memory): if that happens the port has a bug or the original a dangling
  handle. Report the latter, do not guard silently.
- An Int variable that holds an entity is typed `Handle` and starts as
  `null`. Storing an entity in something typed `number` (a generic field such
  as `Tres\h`, `Tpkill\h`) needs a cast; say so in a comment.
- `EntityName`/`NameEntity`, `FindChild`, `CountChildren`: bb3d commands.
- `load_res(path, Cres_...)` returns the right handle type per class
  (`ressources.ts`); meshes and textures give `null` on failure, images and
  sounds 0.

### 6.12 2D drawing

The Blitz 2D commands are the functions of `$lib/s2/gfx2d` with the original
names and argument order: `Color Rect Line Oval Plot Text Cls ClsColor
DrawImage DrawBlock DrawImageRect TileBlock GrabImage CopyRect SetBuffer
BackBuffer ImageBuffer LockBuffer ReadPixelFast WritePixelFast Viewport Origin
ImageWidth MaskImage MidHandle HandleImage ScaleImage CreateImage FreeImage ...`

- Float arguments are rounded like Blitz does (the functions take care).
- **`LoadImage` / `LoadAnimImage`: import them from `./load_functions`**, not
  from gfx2d: those return a complete image at once (the mod's images are
  preloaded). Prefer `load_image` / `load_animimage` / `load_res` where the
  original uses them.
- `SaveImage`/`SaveBuffer` write a BMP through the save handler (the
  screenshot function; goes to `files.ts` when the handler is installed by
  its owner).
- After `RenderWorld` the 2D back buffer is transparent where nothing was
  drawn, so the 3D scene shows through; this is automatic.
- `Text` uses the layer's default font; the game draws nearly all text with
  `bmpf_txt*` (`./load_bmpf`).
- `Flip`: see section 7. `VWait`, `Delay`: section 7. `Graphics3D`:
  `setGraphics(w, h, depth, mode)` of `./runtime` (only load_setup and the
  options menu's restart path).
- Colours are 0..255 Ints; `ReadPixelFast` returns ARGB Ints
  (`And $FFFFFF` -> `& 0xffffff`); hex literals `$FF00FF` -> `0xff00ff`
  (mind the sign: `$FFFFFFFF` is -1 in Blitz: `0xffffffff | 0`).

### 6.13 Time

`MilliSecs()` of `$lib/s2/blitz` (Int, wraps like the original).
`CurrentDate()`, `CurrentTime()` likewise. The per-frame values are globals
set by `getinput()`: `G.ms`, `G.gt` (game time), `G.f` (frame factor, 1.0 at
50 FPS), `G.in_t50go` ... Use what the original uses.

### 6.14 Evaluation order

Blitz3D does not evaluate call arguments or operands left to right. The code
generator labels every expression with a register "need" (Sethi-Ullman) and,
wherever two subtrees meet, evaluates the right one first if its need is
strictly greater, otherwise the left one. This decides which random number
goes into which argument, so it has to be reproduced wherever two or more
parts of one statement have side effects.

Compiler sources (github.com/blitz-research/blitz3d):
`compiler/codegen_x86/tile.cpp` (`Tile::label`, `Tile::eval`),
`compiler/codegen_x86/codegen_x86.cpp` (`munchCall`, `munch`/`munchReg` for
`IR_SEQ` and `IR_MOVE`, `munchArith`, `munchFPArith`, `genCompare`),
`compiler/exprnode.cpp` (`ExprSeqNode::translate`, `ExprSeqNode::castTo`,
`CallNode::translate`), `compiler/stmtnode.cpp` (`ForNode::translate`),
`blitz/libs.cpp` (`linkRuntime`: default values of runtime commands).

**need(E)**, with `join(a,b) = a+1 if a==b, else max(a,b)`:

| expression | need |
| --- | --- |
| Int/Float/String literal, `Const`, folded constant expression | 1 |
| simple local/global/parameter, field chain `a\b\c`, `a\v[const]`, `arr(simple)` | 1 |
| `a\v[i]` with a variable index | 2 |
| unary minus, `Int()`, `Float()`, `Str()`, implicit conversion, `Abs`, `Sgn` | need of the operand |
| call | complete the argument list with the default values (they count as arguments, need 1 each); `S_n = need(A_n)`, `S_k = join(need(A_k), S_k+1)`; need = `S_1`. No arguments: 1. Userlib (`.decls`) call: `join(1, S_1)` |
| Float `+ - * /` | `join(l, r)`, always |
| Int `+`, `*` | right operand constant or simple variable: `need(l)`; else left operand constant or simple variable: `need(r)`; else `join` |
| Int `-` | right operand constant or simple variable: `need(l)`; else `join` |
| Int `/` | divisor a power-of-two constant: `need(l)`; else `join`, always |
| `Mod`, `^`, String `+`, String/object comparison | a runtime call with two arguments: `join(l, r)` |
| `And`, `Or`, `Xor` | `join(l, r)` |
| `Shl`, `Shr`, `Sar` | constant count: `need(l)`; else `join` |
| Int comparison | left simple variable: `need(r)`; else right constant or simple variable: `need(l)`; else `join` |
| Float comparison | `join(l, r)` |

"Simple variable" is a plain local, global or parameter; a field or array
element is not. Typical values: `Rnd(c)`, `Rnd(a,b)`, `Rand(a,b)` and
`EntityX(h)` are 2 (two arguments each, counting the default);
`Rnd(-s#*3.,s#*3.)` is 3; `x#+Rnd(a,b)` is 2; `EntityX(h)+Rnd(a,b)` is 3.

**Order.** In a call, argument `k` meets "the rest of the list" (`S_k+1`):
the rest runs first if `S_k+1 > need(A_k)`, otherwise argument `k` runs first
and then the rest. Operands of an operator: the right one first if
`need(r) > need(l)`, otherwise the left one. (The largest need in the whole
game is 4; the compiler's special case for 6 and more never applies.)

Common outcomes:

| call | order of the arguments |
| --- | --- |
| `f h,Rnd(..),Rnd(..),Rnd(..)` (`PositionEntity`, `TranslateEntity`, `RotateEntity`, `EntityColor`) | 2nd, 3rd, 1st random argument (y, z, x / g, b, r) |
| `EntityColor h,const,Rand(..),Rand(..)` | left to right |
| `p_add(x#,y#,z#,typ,Rnd(..),Rnd(..))` | size, alpha |
| `p_add(x#+Rnd(a,b),y#+Rnd(..),z#+Rnd(a,b),typ,Rnd(..),Rnd(..))` (plain variables) | size, alpha, z, y, x |
| `p_add(EntityX(h)+Rnd(a,b),EntityY(h)+Rnd(a,b),EntityZ(h)+Rnd(a,b),typ,Rnd(..),Rnd(..))` | z, size, alpha, y, x |
| `p_add(EntityX(h)+Rnd(a,b),EntityY(h)+5,EntityZ(h)+Rnd(a,b),typ,Rnd(..),1.)` | x, z, size |
| `PositionEntity h,EntityX(h)+Rnd(a,b),EntityY(h)+Rnd(c),EntityZ(h)+Rnd(a,b)` | y, z, x |

Do not guess from these: a different argument shape gives a different order
(`game_explosion` has x, z, size, y and y, z, size, x two lines apart). Apply
the algorithm or run the reference tool.

How to write it: hoist the side-effecting arguments into locals (declared at
the top of the function, section 6.2) in the executable's order, then call
with the locals in source order, with a comment:

```ts
// exe: arguments evaluated z, size, alpha, y, x
argz = f32(EntityZ(h) + Rnd(-3, 3));
argsize = Rnd(5, 7);
arga = Rnd(0.4, 0.7);
argy = f32(EntityY(h) + Rnd(-3, 3));
argx = f32(EntityX(h) + Rnd(-3, 3));
p_add(argx, argy, argz, Cp_smoke, argsize, arga);
```

Also decided by the same mechanism:

- **Binary operators.** `f(..)+g(..)`, `f(..)*g(..)`, comparisons, `And`/`Or`
  and String concatenation of two calls evaluate the right call first when
  its need is greater (`Rnd(1)+Rnd(1)` is a tie: left first). `And`/`Or`
  always evaluate both sides (section 6.4).
- **Folded memory operands.** In Int `g + f()`, `f() + g`, `g < f()` and
  `g = g + f()` with a simple variable `g`, the variable is read **after**
  the call (it is used as a memory operand of the instruction). It matters
  when `f` changes `g`. A Float variable is loaded separately and follows the
  need rule.
- **Assignments.** For an Int/Float field or array element the right-hand
  side is evaluated before the target address (unless the address has the
  greater need). String and object stores are runtime calls
  (`__bbStrStore(address, value)`): address first, unless the value has the
  greater need. `var_modify$(p_varname$,("-"+param$()))` is such a case:
  `param$()` runs before `p_varname$` is read.
- **`For i=a To b`.** `a` is evaluated once. `b` is evaluated again at every
  loop test, the first included: `For i=0 To Rand(3,5)` draws a new number
  per test (`for (i = 0; i <= Rand(3, 5); i++)`). `Step` is a constant.
- **`Select`.** The `Case` expressions are compared one after the other and
  evaluation stops at the first match.

Reference tool: `..\s2_work_evalorder\scripts (outside this repository)`.
`bbc.py` is a port of the compiler front end and of the tile
labelling/evaluation; `cmp_exe.py` compares its call and argument-store
sequence per function with the executable (646 of 653 functions identical;
the rest are the `ai_signal` functions and three functions whose source
revision differs); `showroot.py <file.bb>:<line>` prints the evaluation order
of one statement; `sites.py` lists the statements with order-dependent side
effects.

---

## 7. Blocking code: async functions

The original stands still inside `Flip`, `Delay`, `WaitKey` and inside modal
windows (their own `Repeat ... Flip ... Forever` loops). A browser cannot.

**Rule: a function is `async` if and only if `function_index.json` says
`"async": true`.** The list is computed from the source: every function that
contains `Flip`, `Delay` or `WaitKey`, or calls (directly or through other
functions) one that does, except where a *sync barrier* stops the chain.
Everybody uses the same list, so callers and callees agree.

Inside an async function:

| original | port |
| --- | --- |
| `Flip` | `Flip(); await frame();` |
| `Delay n` | `await delay(n);` |
| `WaitKey()` | `await waitKey()` |
| a frame-limiting wait loop (`While MilliSecs()-ms<20 : Delay 1 : Wend`) | `while (MilliSecs() - ms < 20) await delay(1);` |
| call of an async function `x()` | `await x()` (also when it is in a condition: `if (await gui_msgdecide(...))`) |
| `bmpf_loadscreen(txt$,p)` | `await bmpf_loadscreen(txt, p)` (from `./load_bmpf`) |

`frame`, `delay`, `waitKey`, `defer` are in `./flow`. `frame()` is the single
"wait for the next display frame" of the port; do not call
`requestAnimationFrame` or `setTimeout` yourself.

Never call an async function without `await` (a "floating" promise runs
later, in the middle of another frame). Never make a function async that the
index lists as sync, and never the other way round.

### Sync barriers

Some functions must stay synchronous although the original reaches blocking
code from them, because synchronous layers call them:

<!-- GENERATED:BARRIERS BEGIN -->
- `e_terrainhm` (e_environment.bb): synchronous in the port; reaches async: bmpf_loadscreen
- `e_terraincmscale` (e_environment.bb): synchronous in the port; reaches async: bmpf_loadscreen, gui_msg
- `debug` (debug.bb): called from the synchronous endinput(); its load_map branch is deferred with defer(); reaches async: editor_ini, load_map
- `parse_commands` (parser_commands.bb): the script interpreter is synchronous; modal commands are deferred (flow.ts defer); reaches async: gui_msgdecide, menu_start, menu_set, editor_gencolormap, e_terraincm, gui_msg, gui_win_image, gui_msginput
<!-- GENERATED:BARRIERS END -->

In a sync barrier, a call that would block is **deferred**: wrap the
blocking call *and every statement after it in the same block* into
`defer(async () => { ... })`. The main loop runs deferred work right after
the current section function returns, before the frame is flipped.

```blitz
;debug.bb, If KeyHit(88) Then
editor_ini()
m_section=Csection_editor
load_map("maps\"+set_debug_testmapfile$+".s2","")
in_edmap$=set_debug_testmapfile$
set_debug=0
```
```ts
// deferred: debug() is synchronous (called from endinput)
defer(async () => {
    await editor_ini();
    G.m_section = Csection_editor;
    await load_map('maps\\' + G.set_debug_testmapfile + '.s2', '');
    G.in_edmap = G.set_debug_testmapfile;
    G.set_debug = 0;
});
```

Script commands (ScriptHost methods, section 11) are always synchronous. The
ones that open a modal window:

| command | original | port |
| --- | --- | --- |
| `msgwin`, `imagewin` | `gui_msg(...)`, `gui_win_image(...)` | `defer(() => gui_msg(...))`: the window opens after the script has finished instead of in the middle of it |
| `exec` | `If gui_msgdecide("Execute ...?") Then ExecFile` | deferred as a whole |
| `decisionwin`, `inputwin` | `p_return$=gui_msgdecide(...)` | **cannot be mapped**: the script needs the answer before it continues. The port opens the window deferred and returns the "cancel" result (`"0"` / `""`) to the script. Mark the method `// unmapped: needs an asynchronous interpreter`. (Used by one shipped map, "Color Game".) |
| `loadmap`, `savemap`, quick/auto save | set `in_quicksave` / `tmp_loadmapcmdmap$`; `cull()` does the work | as in the original; `cull` is async |

### The list

<!-- GENERATED:ASYNC BEGIN -->
63 functions are async (0 of them still to port). Everything else is synchronous.

| function | file | status | why |
| --- | --- | --- | --- |
| `load_strings` | load_strings.bb | ported | async in the port (game/load_strings.ts) |
| `bmpf_load_font` | load_bmpf.bb | ported | async in the port (game/load_bmpf.ts) |
| `bmpf_loadscreen` | load_bmpf.bb | ported | async in the port (game/load_bmpf.ts) |
| `load_keynames` | load_keynames.bb | ported | async in the port (game/load_keynames.ts) |
| `load_states` | load_states.bb | ported | async in the port (game/defs.ts) |
| `load_lightcycle` | load_lightcycle.bb | ported | async in the port (game/defs.ts) |
| `load_game` | load_game.bb | ported | async in the port (game/defs.ts) |
| `load_groups` | load_groups.bb | ported | async in the port (game/defs.ts) |
| `load_objects` | load_objects.bb | ported | async in the port (game/defs.ts) |
| `load_units` | load_units.bb | ported | async in the port (game/defs.ts) |
| `load_items` | load_items.bb | ported | async in the port (game/defs.ts) |
| `load_infos` | load_infos.bb | ported | async in the port (game/defs.ts) |
| `load_combinations` | load_combinations.bb | ported | async in the port (game/defs.ts) |
| `load_buildings` | load_buildings.bb | ported | async in the port (game/defs.ts) |
| `e_terraincm` | e_environment.bb | ported | async in the port (game/e_environment.ported.ts) |
| `save_map` | e_save_map.bb | ported | async in the port (game/e_save_map.ts) |
| `load_map` | e_load_map.bb | ported | async in the port (game/e_load_map.ts) |
| `gui_msg` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_msginput` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_msgdecide` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_color` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_file` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_map` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_command` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_defvars` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_image` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_win_text` | gui.bb | ported | async in the port (src/lib/s2/ui/gui) |
| `gui_tb_loadfile` | gui_tb.bb | ported | async in the port (src/lib/s2/ui/gui_tb) |
| `gui_tb_savefile` | gui_tb.bb | ported | async in the port (src/lib/s2/ui/gui_tb) |
| `brightness` | functions.bb | ported | async in the port (game/functions.ts) |
| `mb_update` | motionblur.bb | ported | async in the port (game/motionblur.ts) |
| `menu_start` | menu.bb | ported | async in the port (game/menu.ts) |
| `menu_set` | menu.bb | ported | async in the port (game/menu.ts) |
| `menu` | menu.bb | ported | async in the port (game/menu.ts) |
| `editor` | editor.bb | ported | async in the port (game/editor.ts) |
| `editor_menus` | editor_menus.bb | ported | async in the port (game/editor_menus.ts) |
| `editor_ini` | editor_functions.bb | ported | async in the port (game/editor_functions.ts) |
| `editor_genmap` | editor_functions.bb | ported | async in the port (game/editor_functions.ts) |
| `editor_gencolormap` | editor_functions.bb | ported | async in the port (game/editor_functions.ts) |
| `editor_testmap` | editor_functions.bb | ported | async in the port (game/editor_functions.ts) |
| `game` | game.bb | ported | async in the port (game/game.ts) |
| `interface_` | interface.bb | ported | async in the port (game/interface.ts) |
| `unrealsoftware` | unrealsoftware.bb | ported | async in the port (game/unrealsoftware.ts) |
| `cull` | cull.bb | ported | async in the port (game/cull.ts) |
| `usgn_setup` | mp_usgn.bb | ported | async in the port (game/mp_usgn.ts) |
| `usgn_hostserver` | mp_usgn.bb | ported | async in the port (game/mp_usgn.ts) |
| `usgn_joinserver` | mp_usgn.bb | ported | async in the port (game/mp_usgn.ts) |
| `game_mp` | mp_game.bb | ported | async in the port (game/mp_game.ts) |
| `randommapcreate` | randommap.bb | ported | async in the port (game/randommap.ts) |
| `include_load_strings` | load_strings.bb | ported | async in the port (game/load_strings.ts) |
| `include_load_bmpf` | load_bmpf.bb | ported | async in the port (game/load_bmpf.ts) |
| `include_load_media` | load_media.bb | ported | async in the port (game/load_media.ts) |
| `include_load_keynames` | load_keynames.bb | ported | async in the port (game/load_keynames.ts) |
| `include_load_states` | load_states.bb | ported | async in the port (game/defs.ts) |
| `include_load_lightcycle` | load_lightcycle.bb | ported | async in the port (game/defs.ts) |
| `include_load_game` | load_game.bb | ported | async in the port (game/defs.ts) |
| `include_load_groups` | load_groups.bb | ported | async in the port (game/defs.ts) |
| `include_load_objects` | load_objects.bb | ported | async in the port (game/defs.ts) |
| `include_load_units` | load_units.bb | ported | async in the port (game/defs.ts) |
| `include_load_items` | load_items.bb | ported | async in the port (game/defs.ts) |
| `include_load_infos` | load_infos.bb | ported | async in the port (game/defs.ts) |
| `include_load_combinations` | load_combinations.bb | ported | async in the port (game/defs.ts) |
| `include_load_buildings` | load_buildings.bb | ported | async in the port (game/defs.ts) |
<!-- GENERATED:ASYNC END -->

### Frame pacing

The main loop of StrandedII.bb has no limiter: `calcfpsfactor()` (called by
`endinput()` at the end of every section function) waits until 20 ms have
passed since `getinput()`, then `Flip` waits for the vertical blank. The port:
`calcfpsfactor` (`./load_fps`) computes `f#` as if it had waited, and
`main.ts` starts the next frame only when `frameDue()` (`./flow`) is true.
Section functions (`menu`, `game`, `game_mp`, `editor`) are ported as they
are: `getinput()` ... `endinput()`; they do not wait themselves.

---

## 8. Encoding of strings

Game strings are **byte strings**: one JavaScript char per original byte,
char codes 0..255 (Windows-1252 bytes kept as Latin-1 code points). All game
files are read that way (`files.ts`, `Vfs`), the fonts index glyphs by byte
(`bmpf_txt`), `Asc`/`Chr`/`Len`/`Mid` work on bytes. Never run text through
`TextDecoder('utf-8')`, `normalize()`, or `toUpperCase()`.

Text leaves that world in two places only, which convert:
`fromGameString(s)` / `toGameString(s)` in `$lib/s2/ui/bb` (clipboard, page
title, `ExecFile`). Text typed by the player arrives as byte codes from the
input layer.

### Non-ASCII literals in the source

The GitHub copy of the source is UTF-8, produced by decoding the original
bytes as ISO-8859-2 (Latin-2). To get the true byte of a non-ASCII character
in a string literal, **encode the character you see in ISO-8859-2**. The
whole source has ten such characters in string literals (178 lines):

| in the listing | true byte | write | what it is |
| --- | --- | --- | --- |
| `Ś` (U+015A), 175 times | `0xA6` | `SEP_LINE` from `$lib/s2/blitz` (the char `'\xa6'`) | line separator inside scripts, descriptions, script key lists (`"Śon:start"`) |
| `ż` (U+017C), 12 times | `0xBF` | `SEP_FIELD` from `$lib/s2/blitz` (`'\xbf'`) | field separator of cached state strings (functions.bb, e_load_map.bb) |
| `Š` (U+0160), once | `0xA9` | `'\xa9'` | the © in the map file header written by e_save_map.bb |
| `Ä ä Ö ö Ü ü ß` | `C4 E4 D6 F6 DC FC DF` | `'\xc4'` ... (`UMLAUTS` in `$lib/s2/ui/consts`) | same in Latin-1 and Latin-2 |

In comments the listing also shows `ś` = `0xB6` (`SEP_BREAK` in `ui/consts`).

```blitz
If Instr(Dunit_scriptk$(TCunit\typ),"Śai_idle1") Then
WriteLine(stream,"### Stranded II Mapfile Šby Unreal Software 2004-2007")
```
```ts
if (Instr(Dunit_scriptk(G.TCunit!.typ), SEP_LINE + 'ai_idle1')) {
WriteLine(stream, '### Stranded II Mapfile \xa9by Unreal Software 2004-2007');
```

Write non-ASCII bytes as `\xNN` escapes or the named constants, never as a
pasted character. Verify any literal you are unsure of against the string
constants of the shipped binary, `../s2_re/out/code.bin` (search the
surrounding ASCII text; the bytes next to it are the truth):

```sh
node -e "const b=require('fs').readFileSync('../s2_re/out/code.bin');const i=b.indexOf(Buffer.from('Mapfile','latin1'));console.log(JSON.stringify(b.subarray(i-20,i+40).toString('latin1')))"
```

Read the `.bb` files as UTF-8 when you look for these characters.

---

## 9. Files, system, network

### Files (`./files`)

The Blitz file commands exist with their names and semantics on a virtual
file system: the read-only mod directory plus a writable overlay that is
persisted in the browser (IndexedDB): saves, `sys\settings.cfg`,
`sys\controls.cfg`, `sys\load.cache`, `sys\recent.cache`, maps written by the
editor, `core\mods.inf`. Reads are synchronous.

```blitz
stream=ReadFile("sys\controls.cfg")
If stream=0 Then ... Else
    ReadLine(stream)
    For i=0 To 20 : in_keys(i)=ReadShort(stream) : Next
    set_msens#=ReadFloat(stream)
    CloseFile(stream)
EndIf
dir=ReadDir("sys") : Repeat : file$=NextFile(dir) : ... : Until file$="" : CloseDir(dir)
If FileType("saves")<>2 Then CreateDir("saves")
```
```ts
stream = ReadFile('sys\\controls.cfg');
if (stream === 0) { ... } else {
    ReadLine(stream);
    for (i = 0; i <= 20; i++) G.in_keys[i] = ReadShort(stream);
    G.set_msens = ReadFloat(stream);
    CloseFile(stream);
}
dir = ReadDir('sys'); do { file = NextFile(dir); ... } while (!(file === '')); CloseDir(dir);
if (FileType('saves') !== 2) CreateDir('saves');
```

Available: `ReadFile WriteFile OpenFile CloseFile Eof FilePos SeekFile
FileSize FileType ReadDir NextFile CloseDir CreateDir DeleteDir DeleteFile
CopyFile CurrentDir ChangeDir ReadByte ReadShort ReadInt ReadFloat ReadString
ReadLine ReadBytes WriteByte WriteShort WriteInt WriteFloat WriteString
WriteLine WriteBytes`. `load_settings.ts` is a complete example.

- `ReadLine` returns a string; assigning it to an Int/Float variable
  converts (6.2): `G.set_scrx = Int(ReadLine(stream))`.
- `WriteLine(stream, x)` takes a string: `WriteLine(stream, Str(n))`.
- Paths as the original writes them: backslashes, any case, relative to the
  mod directory, or absolute under `G.set_rootdir` (`ROOT_DIR`,
  `C:\Stranded II\`). `set_rootdir$+"mods\"+set_moddir$+"\x"` is the same file as `"x"`.
- `NextFile` lists files and directories including "." and "..", sorted the
  way NTFS returns them (the loaders rely on that order).
- Media files (images, models, sounds) are not in memory for `ReadFile`
  unless you `await ensureFile(path)` first (only needed where the original
  reads such a file byte by byte; loading goes through the loaders).
- Files of the program directory outside the mod (`core\scriptcommands.inf`,
  `core\*.template`) are not served yet: `FileType` gives 0 for them. Port
  the code as it is.
- Whole-file helpers for new glue code: `readFileBytes`, `writeFileBytes`,
  `readFileLines`. Ported code uses the stream commands.

### System (`./sys`)

| original | port |
| --- | --- |
| `CommandLine()` | `CommandLine()`: `?cmd=...` of the page URL |
| `SystemProperty("APPDIR")` | `SystemProperty('APPDIR')` -> `ROOT_DIR` |
| `AppTitle t$` | `AppTitle(t)` |
| `ExecFile f$` | `ExecFile(f)`: opens URLs in a new tab, refuses programs |
| `End` | `End()` |
| `DebugLog x` | `DebugLog(x)` |
| `GfxMode3DExists`, `Windowed3D`, `TotalVidMem`, `AvailVidMem` | same names; fixed answers |
| clipboard userlib (`copy`, `paste$` of functions.bb) | `copy(txt)`, `paste()` (`./functions`) |
| `HidePointer`/`ShowPointer`, `MoveMouse`, `FlushKeys`, `KeyHit`, `GetKey` ... | `$lib/s2/input` |
| `SetBuffer`, `Graphics` ... | section 6.12 |
| `CountGfxModes3D`, `GfxModeWidth` ... (options menu) | not available: report in `_additions` if the code path is reachable |

### Network

Browsers have no UDP and no raw TCP. The network code (`udp_*.bb`,
`tcpcommands.bb`, `mp_usgn.bb`, `mp_game*.bb`) is ported like everything
else, against the transport interface `NET` of `./sys`:
`NET.OpenTCPStream(server, port)`, `NET.CreateUDPStream(port)`,
`NET.SendUDPMsg(...)`, `NET.RecvUDPMsg(...)`, `NET.CountHostIPs("")` ...
The default transport answers like a machine without a network (stream 0,
no datagrams), so the multiplayer menus show their "failed" paths. Do not
implement a transport. Bank commands (`CreateBank`, `PokeInt`, ...) are in
`$lib/s2/blitz`.

---

## 10. The runtime layers from game code

- **`RT`** (`./rt`): `RT.world` (bb3d), `RT.core` (environment logic),
  `RT.env` (environment drawing; browser only), `RT.audio`, `RT.script`,
  `RT.vfs`. Ported code rarely needs them: use the commands and facades.
- **3D**: import the Blitz3D commands from `$lib/s2/bb3d`. `RenderWorld` of
  the main scene: from `./e_environment` (it renders through the environment
  layer). `UpdateWorld(f)`: bb3d.
- **Input**: `getinput()`, `endinput()`, `inputhit()`, `flushinput()` from
  `./input`; raw `KeyDown`, `KeyHit`, `MouseX` ... from `$lib/s2/input`.
  Their globals are `G.in_*`.
- **GUI**: `./gui`, `./gui_tb`; fonts `./load_bmpf`; strings
  `s(n)`, `sm(n)`, `se(n)`, `ss(...)` from `./load_strings`.
- **Sound**: `sfx`, `sfx_3d`, `sfx_play`, `sfx_music`, `sfx_update`,
  `stopsounds` from `./sfx`; `sfx_emit`, `load_res`, `play_soundset`,
  `load_soundset` from `./ressources`; `play` from `./functions`; `speech`
  from `./speech`. Raw channel commands (`ChannelPlaying`, `StopChannel`,
  `ChannelVolume`, `ChannelPitch`, `PlaySound`, `LoopSound` ...):
  `RT.audio.bb.<Command>(...)`. Sound globals: `G.sfx_click`, `G.mfx_chan`, ...
  The map music, ambient and menu sound parts of other files exist as
  methods: `RT.audio.cmd_music`, `load_map_music`, `e_clear_audio`,
  `menu_set_sfx` (see the header of `audio/S2Audio.ts`).
- **Scripts**: `parse_sel`, `parse_task`, `parse_globalevent`, `var_get`,
  `set_parsecache`, `param`, ... from `./parser_functions`, `./parser_vars`,
  `./parser` etc. (facades of the interpreter). The parser globals are
  `G.p_*`, `G.pv_*`.
- **Definitions**: section 6.10.
- **Environment**: `./e_environment`, `./grasspread`. Globals `G.map_hour`,
  `G.env_cweather`, `G.ter`, `G.env_sea2` ...

One storage per variable: whatever you read through `G` is what the layer
uses (`state.ts` header, `runtime.ts` `BOUND`). If you find a global that a
layer keeps separately from `G` (changing `G.x` has no effect on the layer),
report it; do not write to the layer object directly.

---

## 11. Script commands (ScriptHost)

`parser_commands.bb` (5500 lines, one `Select p_com$`) is ported in
`$lib/s2/script/commands/*.ts`: each `Case` reads its parameters there and
then calls a method of `ScriptHost` for the part that needs the game
(`P.host.cmd_addunit(P, typ, x, z)` ...). About 210 such methods are to be
written. They are distributed over the work packages by subject.

- Put yours into `game/script_host/<package>.ts`, exporting
  `host: Partial<ScriptHost>` (pattern and explanation: `script_host/core.ts`).
  `runtime.ts` merges all files; defining a method twice is a startup error.
- Each method is documented next to the handler that calls it
  (`script/commands/*.ts`, interface `Host` at the top of each file): the
  parameters are exactly what `parse_commands` read, with Blitz types.
  The body is the rest of the original `Case` block, ported by these rules,
  from `parser_commands.bb` at the `line` given in the command definition.
- A value-returning method returns the text for `p_return$` (a number is
  converted as Blitz would: `Str(n)` / `Str(x, 'float')`); `undefined` means
  "leave `p_return$` alone".
- Methods are synchronous (section 7).
- Until a method exists it is inert (returns `undefined`); nothing breaks.

---

## 12. Testing a ported module

Tests run headless under vitest: bb3d world without renderer, fake audio
backend, files in memory, the real mod data from `static/game/mod`
(`pnpm sync-assets`). Put them in `tests/game/<package>*.test.ts`.

```sh
pnpm vitest run tests/game/entities1          # only your tests
pnpm vitest run tests/gameState.test.ts       # the foundation (must stay green)
pnpm vitest run                               # everything, before you finish
pnpm check                                    # types
```

Worked example. This is `tests/game/example.test.ts`, which runs as part of the test suite; copy its
`beforeEach`/`afterEach` and replace the tests with those of your modules.

```ts
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EntityX, PositionEntity, type BBEntity } from '../../src/lib/s2/bb3d';
import { Rand, SeedRnd, setClock } from '../../src/lib/s2/blitz';
import { BackBuffer, Color, ReadPixelFast, Rect, SetBuffer } from '../../src/lib/s2/gfx2d';
import { injectKeyDown, injectKeyUp, injectMouseMove } from '../../src/lib/s2/input';
import { Cclass_unit, Cres_image } from '../../src/lib/s2/game/consts';
import { Dobject_model, Dobject_modelh, Dunit_name, load_object_model, loadAllDefinitions } from '../../src/lib/s2/game/defs';
import { DEFS, resetDefs } from '../../src/lib/s2/game/defs_store';
import { clearDeferred, defer, frame, runDeferred, setFrameHook, setFrameScheduler } from '../../src/lib/s2/game/flow';
import { getinput } from '../../src/lib/s2/game/input';
import { include_load_commandline } from '../../src/lib/s2/game/load_commandline';
import { include_load_setup } from '../../src/lib/s2/game/load_setup';
import * as mods from '../../src/lib/s2/game/mods';
import { parse_task } from '../../src/lib/s2/game/parser_functions';
import { var_get } from '../../src/lib/s2/game/parser_vars';
import { load_res } from '../../src/lib/s2/game/ressources';
import { RT, hasRuntime } from '../../src/lib/s2/game/rt';
import { createTestRuntime, disposeRuntime } from '../../src/lib/s2/game/runtime';
import { G, resetGameState } from '../../src/lib/s2/game/state';
import { setCommandLine } from '../../src/lib/s2/game/sys';
import { CONST_STORE, DeleteEach, New, TYPES, Tunit } from '../../src/lib/s2/game/types';
import { NodeVfs } from '../NodeVfs';

const MOD = resolve('static/game/mod');

describe.skipIf(!existsSync(MOD))('worked example: a headless module test', () => {
	let now = 0;

	beforeEach(async () => {
		// RT, files, lists and G wired; no window, no WebGL, no sound device
		await createTestRuntime({ vfs: new NodeVfs(MOD) });
		setFrameScheduler((cb) => cb()); // frame() returns at once
		now = 1000;
		setClock(() => (now += 20)); // MilliSecs(): 20 ms per call, deterministic
		SeedRnd(0x1234); // the Rnd/Rand sequence of a fresh program
		include_load_setup(); // cam, listener, env_light, RT.core (as StrandedII.bb does)
		await loadAllDefinitions(); // the D... accessors, Tfind, Tdefvar, constants
	});

	afterEach(() => {
		disposeRuntime();
		resetGameState();
		resetDefs();
		clearDeferred();
		setFrameScheduler(null);
		setFrameHook(null);
		setCommandLine(null);
		setClock(() => performance.now());
		for (const t of Object.values(TYPES)) {
			try {
				DeleteEach(t);
			} catch {
				// the Tconst view
			}
		}
		CONST_STORE.clear();
		vi.restoreAllMocks();
	});

	it('3D: commands work without a renderer; models load after preload', async () => {
		expect(G.cam).not.toBeNull();
		expect(hasRuntime('env')).toBe(false); // no drawing half of the environment
		const typ = [...DEFS.objects.byId.values()].find((o) => o.model.toLowerCase().endsWith('.b3d'))!.id;

		// not preloaded: the loader reports "cannot be loaded", as for a broken file
		expect(() => load_object_model(typ)).toThrow('Unable to load ' + Dobject_model(typ));

		await RT.world.preload([Dobject_model(typ)]);
		load_object_model(typ);
		const h = Dobject_modelh(typ) as BBEntity;
		expect(h).not.toBeNull();
		PositionEntity(h, 10, 0, -5);
		expect(EntityX(h)).toBe(10);
	});

	it('calls into a package that is not ported: spy on its skeleton', () => {
		// parse_commandline() ends with mod_check() of mods.bb
		const mod_check = vi.spyOn(mods, 'mod_check').mockImplementation(() => {});
		setCommandLine('-debug -win');
		include_load_commandline();
		expect(mod_check).toHaveBeenCalledOnce();
		expect(G.set_debug).toBe(1);
		expect(G.set_scrwin).toBe(2);
	});

	it('scripts: run one through the engine, or record what the module asks of it', () => {
		const u = New(Tunit);
		u.id = 7;
		u.typ = 1;
		// the real interpreter
		parse_task(Cclass_unit, 7, 'test', '', 'on:test {\xa6$seen=' + '1;\xa6}\xa6');
		RT.script.parse_all();
		expect(var_get('seen')).toBe('1');
		// or a recording hook
		const calls: string[] = [];
		vi.spyOn(RT.script, 'parse_task').mockImplementation((cls, id, event) => {
			calls.push(`${cls}:${id}:${event}`);
		});
		parse_task(Cclass_unit, 7, 'kill', '', '');
		expect(calls).toEqual(['2:7:kill']);
		expect(Dunit_name(1)).not.toBe('');
	});

	it('sound: silent; assert on the calls', () => {
		const sfx = vi.spyOn(RT.audio, 'sfx');
		RT.audio.sfx(G.sfx_click, 0.5);
		expect(sfx).toHaveBeenCalledWith(G.sfx_click, 0.5);
		expect(load_res('sfx\\click.wav', 2)).toBe(0); // no sound files unless createTestRuntime({ sounds: true })
	});

	it('input, time and frames are under the control of the test', async () => {
		injectMouseMove(320, 200);
		injectKeyDown(57); // space
		getinput();
		expect(G.in_mx).toBe(320);
		expect(G.in_my).toBe(200);
		expect(G.ms).toBe(now);
		injectKeyUp(57);

		// a blocking loop of the original: runs until the hook "presses" something
		let frames = 0;
		let done = false;
		setFrameHook(() => {
			if (++frames === 3) done = true;
		});
		while (!done) await frame();
		expect(frames).toBe(3);

		// deferred work of a sync barrier
		defer(async () => {
			await frame();
			G.m_menu = 5;
		});
		await runDeferred();
		expect(G.m_menu).toBe(5);
	});

	it('2D: draw into the back buffer and read it back; images after preload', async () => {
		SetBuffer(BackBuffer());
		Color(255, 0, 0);
		Rect(10, 10, 4, 4, 1);
		expect(ReadPixelFast(11, 11, BackBuffer()) & 0xffffff).toBe(0xff0000);
		await RT.world.preload(['sys\\gfx\\defaulticon.bmp']);
		const img = load_res('sys\\gfx\\defaulticon.bmp', Cres_image, 0);
		expect(img).not.toBe(0);
	});

	it('random numbers are the program-wide generator', () => {
		SeedRnd(42);
		const a = [Rand(1, 100), RT.script.Rand(1, 100)];
		SeedRnd(42);
		expect([Rand(1, 100), Rand(1, 100)]).toEqual(a);
	});
});
```

What the headless runtime gives you:

- **3D**: every bb3d command works (transforms, hierarchy, collisions,
  picks, animation time), nothing is drawn. Models and textures load only
  after `await RT.world.preload([...paths])`; an unpreloaded file loads as
  `null`/0 (and `load_res` returns 0 instead of raising).
- **Terrain/environment**: `RT.core` runs the environment logic without
  drawing; `RT.env` does not exist (`hasRuntime('env')` is false). For a
  terrain create one with bb3d (`CreateTerrain`, `ModifyTerrain`) and assign
  `G.ter`, or test against `e_tery` with `G.ter = null` (returns `G.ter_groundy`).
- **Audio**: silent; sound handles are 0 unless you pass `sounds: true` and
  preload. To assert on sounds, spy on `RT.audio.sfx` / `sfx_emit` / `bb.PlaySound`.
- **Files**: base = the mod (data files in memory), overlay in memory:
  write with the file commands, then run the code that reads.
- **Input**: `injectKeyDown(scancode)`, `injectMouseMove(x, y)`,
  `injectMouseDown(1)` of `$lib/s2/input`, then `getinput()`.
- **2D**: drawing works into the 800x600 back buffer; read pixels back with
  `ReadPixelFast(x, y, BackBuffer())` if you need to assert on drawing.
  Images: `LoadImage` of `./load_functions` is complete after preload of the
  file through `RT.world.preload`.
- **Other packages' functions**: `vi.spyOn(module, 'fn').mockImplementation(...)`
  on the skeleton module (ES module namespace spying works under vitest for
  these modules because callers import the binding from the module). Mock the
  few you reach; do not mock your own module.
- **Recording hooks**: `vi.spyOn(RT.script, 'parse_task' | 'parse_sel' | ...)`,
  `createRecordingHost` of `$lib/s2/script` for a ScriptHost that logs calls.
- **Time**: `setClock(fn)` of blitz controls `MilliSecs()`;
  `setFrameScheduler` controls `frame()`; `setFrameHook(fn)` runs at every
  `frame()` (use it to press a key that ends a modal loop).
- **Determinism**: seed with `SeedRnd`; the script engine draws from the same generator.

Test what the original does, with values taken from reading the original
(branch by branch), not what seems reasonable. A good module test drives each
`Select` case and each early `Return` once.

---

## 13. Work packages

<!-- GENERATED:PACKAGES BEGIN -->
Each package is one unit of ownership (section 4). Lines are those of the original files; "to port" counts functions and `include_` bodies.

| package | subject | files (lines) | lines | to port | async | ScriptHost methods |
| --- | --- | --- | --- | --- | --- | --- |
| **entities1** | Objects, units, shared entity code, parent/child | handle_objects (811), handle_units (881), handle_all (684), parentchild (460) | 2836 | - | - | its own subject, as needed by script1/script2 |
| **entities2** | Items, infos, states | handle_items (1180), handle_infos (814), handle_states (921) | 2915 | - | - | its own subject, as needed by script1/script2 |
| **map** | Map load/save, clear, culling, collisions, random maps, helpers | e_clear (487), e_load_map (906), e_save_map (553), e_environment (1552), cull (424), collisions (80), physics (29), randommap (444), functions (774), load_materials (160) | 5409 | - | - | its own subject, as needed by script1/script2 |
| **player** | Game loop, player, input, vehicles, day change, skills | game (124), game_functions (1511), game_input (471), game_input_vehicles (470), game_focus (127), game_changeday (148), skills (102) | 2953 | - | - | its own subject, as needed by script1/script2 |
| **combat** | Weapons, building, projectiles, particles, motion blur | game_weapons (388), game_build (647), projectiles (657), particles (1431), motionblur (67) | 3190 | - | - | its own subject, as needed by script1/script2 |
| **interface** | In-game interface and sequences | interface (3009), game_sequences (697) | 3706 | - | - | its own subject, as needed by script1/script2 |
| **menu** | Menu, console, debug, intro, mods | menu (1188), console (503), debug (308), unrealsoftware (51), mods (309) | 2359 | - | - | its own subject, as needed by script1/script2 |
| **editor** | Editor | editor (948), editor_menus (2827), editor_functions (1274) | 5049 | - | - | its own subject, as needed by script1/script2 |
| **ai** | AI | ai_units, ai_signals, unitpath, ai/*.bb (21 files) | 2905 | - | - | its own subject, as needed by script1/script2 |
| **net** | Multiplayer and network | udp_functions (791), udp_messages (152), udp_processing (164), tcpcommands (104), mp_usgn (190), mp_game (106), mp_game_functions (306) | 1813 | - | - | its own subject, as needed by script1/script2 |
| **script1** | Script commands: BASIC and PLAYER sections | - | - | - | - | 80 (script_host/script1.ts: commands/basic1, basic2) |
| **script2** | Script commands: interface, world, return values | - | - | - | - | 129 (script_host/script2.ts: commands/interface, world, returns) |

Notes

- **entities1**: set_/get_/con_/free_/update_ of objects and units; everything else creates entities through these.
- **entities2**: Inventory (parent_class/parent_id), info entities and their timers, state effects.
- **map**: e_environment: only e_terrain, e_gc, e_teralign are left. functions/load_materials: the rest of partially ported files. Owns the bridge between load_map and the environment layer (RT.env.setMap).
- **player**: game() is the per-frame section function (async).
- **combat**: p_add is called from everywhere (and by the environment layer through runtime.ts hooks).
- **interface**: interface.bb is one 2570-line function (exported as interface_, async).
- **menu**: Replaces most stand-ins of _stubs.ts (menu_start, menu, console, con_add, con_welcome, unrealsoftware). debug() and console() are sync barriers.
- **editor**: The largest package; can be split into editor_menus (2827 lines) and editor + editor_functions (2222 lines). Uses the terrain editing facades of e_environment.
- **ai**: ai_signals: four functions from the decompiled executable, not from the repository file.
- **net**: Ported against the NET interface of sys.ts; no transport. Lowest priority.
- **script1**: ScriptHost methods of script/commands/basic1.ts and basic2.ts (parser_commands.bb lines 18-2147). Calls into every other package through the index.
- **script2**: ScriptHost methods of script/commands/interface.ts, world.ts, returns.ts (parser_commands.bb lines 2188-5414).

The ScriptHost methods (section 11) are written by script1 and script2 as thin calls into the functions of the other packages; a package may take over the methods of its own subject by putting them into its own `script_host/<package>.ts` and telling script1/script2 (a method must exist only once).

Suggested order when not everything runs in parallel: entities1, entities2, map, menu (the game then loads and shows a map), player, combat, interface, ai, script1, script2, editor, net.
<!-- GENERATED:PACKAGES END -->
