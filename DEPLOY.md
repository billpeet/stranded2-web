# Deploying with Dokploy

The `dokploy` branch is the deployment branch. Pushing to it rebuilds and
republishes the site.

## What gets deployed

A single container built from the `Dockerfile` at the repository root:

1. **Build stage** (Node): `pnpm build` produces a static single-page app
   (`@sveltejs/adapter-static`; the game runs entirely in the browser).
2. **Runtime stage** (nginx): serves the app on port **80**, and serves the
   original game's data from the volume mounted at **`/data/game`** under the
   URL `/game/`.

Saved games, settings and editor maps live in each visitor's browser
(IndexedDB). The server stores nothing per user.

## Game data

The game's models, textures, sounds and maps are not in the repository or the
image. The container needs them in `/data/game` (`manifest.json` and `mod/`).

Make the archive once, on a machine with the game installed:

```sh
pnpm sync-assets "C:\path\to\Stranded II"
pnpm pack-assets            # writes game-data.tar.gz and prints its SHA-256
```

Then use one of:

- **Copy over SSH (how the current deployment was filled).** Unpack the
  archive into the application's named volume on the Docker host:

  ```sh
  scp game-data.tar.gz user@host:/tmp/stranded2-game-data.tar.gz
  ssh user@host 'docker run --rm -v stranded2-game-data:/data     -v /tmp/stranded2-game-data.tar.gz:/in.tar.gz:ro alpine     sh -c "find /data -mindepth 1 -delete; tar -xzf /in.tar.gz -C /data && chmod -R a+rX /data"     && rm /tmp/stranded2-game-data.tar.gz'
  ```

  nginx reads the files per request, so no restart is needed.
- **Download on first start.** Put `game-data.tar.gz` somewhere the server
  can fetch it over HTTP(S) and set `GAME_DATA_URL`. On start, if the volume
  has no `manifest.json`, the container downloads and unpacks it.

The volume persists across deploys, so either way this is done once.

| Variable | Meaning |
| --- | --- |
| `GAME_DATA_URL` | URL of `game-data.tar.gz`. Used only when the volume is empty or `GAME_DATA_FORCE=1`. |
| `GAME_DATA_SHA256` | Optional. The download is rejected if its checksum differs. |
| `GAME_DATA_FORCE` | Set to `1` for one deploy to replace the data in the volume, then remove it. |

Without data the site still starts; the page reports that the game data is
missing.

Hosting the game publicly means redistributing the original data files. The
code is CC BY-NC-SA 3.0 DE; the data files' licence is the author's to state.
Check with Unreal Software before making a deployment public, or keep the
site private.

## Dokploy application settings

The current deployment is the application **Stranded II Web** at
<https://stranded2.biap.cc>. Its settings:

| Setting | Value |
| --- | --- |
| Source | GitHub, repository `billpeet/stranded2-web`, branch `dokploy` |
| Build type | Dockerfile, path `./Dockerfile`, context `.` |
| Auto deploy | On (deploys on every push to `dokploy`) |
| Domain | `stranded2.biap.cc`, container port `80`, HTTPS (Let's Encrypt) |
| Volume mount | Named volume `stranded2-game-data` mounted at `/data/game` |
| Environment | None needed when the volume is filled by hand; otherwise `GAME_DATA_URL` |

HTTPS is required, not optional: browsers only allow mouse capture (pointer
lock) on secure pages.

The image has a health check on `/healthz`. Its start period is two minutes to
leave room for the first-start download.

If the repository is connected through Dokploy's GitHub integration, auto
deploy needs nothing else. If it is added as a plain Git URL instead, copy the
application's deploy webhook URL from Dokploy into the GitHub repository's
webhook settings (push events).

## Publishing a new version

`main` is where development happens. `dokploy` is `main` plus the deployment
files. To publish:

```sh
git checkout dokploy
git merge main
git push
```

## Trying the image locally

```sh
docker build -t stranded2-web .
docker run --rm -p 8088:80 -v "$PWD/static/game:/data/game:ro" stranded2-web
```

Then open <http://localhost:8088>.
