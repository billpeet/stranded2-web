# Stranded II Web

An unofficial browser port of **Stranded II**, the 3D survival game by
**Peter Schauß / [Unreal Software](https://www.unrealsoftware.de)** (2007–2008),
rewritten in TypeScript on Three.js and SvelteKit. It loads the original
game's data files unchanged and aims to behave exactly like version 1.0.0.1,
quirks included.

This project uses the code of Stranded II. It is a fan project, is not
affiliated with or endorsed by Unreal Software, and must not be used
commercially (see [Licence](#licence)).

- Original game and author: <https://www.unrealsoftware.de> · <https://www.strandedonline.de>
- Original source code this port is translated from: <https://github.com/ttyborg/Stranded2>
  (a mirror of the Stranded II 1.0.0.1 source released by Unreal Software, written in Blitz3D)

## Status

Work in progress. The game boots, shows the original menu, loads the shipped
maps, and is playable in single player: walking, swimming, inventory,
combining, building, animals, scripts, saving and loading, random islands and
the editor have all been exercised in a browser. It has **not** been compared
side by side with the original, so differences in look, timing and feel are
to be expected. Multiplayer is ported but has no network transport.

[`PORTING.md`](PORTING.md) has the detailed status, known deviations and open
problems.

## Game data is not included

This repository contains code only. The models, textures, sounds, maps and
definition files belong to the original game and are not redistributed here.
You need your own copy of Stranded II (freeware, available from
[unrealsoftware.de](https://www.unrealsoftware.de)).

## Running it

Requires Node.js and [pnpm](https://pnpm.io).

```sh
pnpm install

# Copy the game data from an installed copy of Stranded II.
# The path is the folder that contains StrandedII.exe and the "mods" folder.
pnpm sync-assets "C:\path\to\Stranded II"

pnpm dev
```

Then open the address Vite prints. Click the game once so it can capture the
mouse; press Esc to release it.

Other commands:

```sh
pnpm check   # type-check
pnpm test    # test suite (most tests need the game data from sync-assets)
```

## How it is built

The original is about 51,000 lines of BlitzBasic. The port keeps that code's
structure and translates it close to line by line on top of a re-implementation
of the Blitz3D runtime:

| Path | What it is |
| --- | --- |
| `src/lib/s2/game/` | The game code, one module per original `.bb` file, original names kept. `PORTING_GUIDE.md` there documents the translation rules. |
| `src/lib/s2/bb3d/` | Blitz3D's 3D commands (entities, cameras, meshes, picking, collisions) on Three.js. |
| `src/lib/s2/blitz/` | BlitzBasic language and runtime semantics (number formatting, rounding, random numbers, strings, type lists). |
| `src/lib/s2/gfx2d/`, `input/`, `ui/` | Blitz 2D drawing, input, bitmap fonts and the game's GUI. |
| `src/lib/s2/audio/` | Blitz3D sound commands on Web Audio. |
| `src/lib/s2/script/` | The game's script interpreter. |
| `src/lib/s2/formats/`, `defs/` | Map (`.s2`), model (`.b3d`) and definition (`.inf`) loaders. |
| `src/lib/s2/engine/` | Terrain, environment, animation and collision internals. |

## Credits and sources

- **Stranded II** — game, design, original code and assets: Peter Schauß /
  Unreal Software, <https://www.unrealsoftware.de>. All rights to the game and
  its assets remain with the author.
- **Stranded II source** — <https://github.com/ttyborg/Stranded2>. The game
  logic in this repository is a translation of that source and therefore a
  derivative work of it.
- **Blitz3D** by Blitz Research — <https://github.com/blitz-research/blitz3d>.
  Its published source was the reference for engine and language behaviour;
  several modules here are ports of its algorithms. See that repository for
  its licence.
- **Three.js**, **SvelteKit**, **Tailwind CSS** — see their respective licences.

A few behaviours were determined from the freely distributed game executable
where the published source was incomplete or differs from the shipped game
(four AI helper functions absent from the source release, and the exact sound
attenuation and panning maths). These are reproductions of the original
game's behaviour and are covered by the same attribution.

Most of the translation was done with AI assistance (Claude Code) and is being
checked against the original source; treat it as unverified until stated
otherwise in `PORTING.md`.

## Licence

The original Stranded II source is released under the
**Creative Commons Attribution-NonCommercial-ShareAlike 3.0 Germany**
licence (CC BY-NC-SA 3.0 DE). As a derivative work, the code in this
repository is released under the same licence. See [`LICENSE`](LICENSE).

In short, and as the original author asks:

- You may use and modify this code.
- You may **not** use it for commercial projects without the permission of
  Peter Schauß / Unreal Software.
- Link <https://www.unrealsoftware.de> in projects that use this code.
- State that you used the code of Stranded II.
- Share derivatives under the same licence.

Licence deed: <https://creativecommons.org/licenses/by-nc-sa/3.0/de/deed.en>
