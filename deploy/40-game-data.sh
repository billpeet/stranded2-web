#!/bin/sh
# Runs before nginx starts. Fills the /data/game volume from GAME_DATA_URL
# (a .tar.gz made by `pnpm pack-assets`) when the volume is empty, or when
# GAME_DATA_FORCE=1. Optional GAME_DATA_SHA256 is checked before unpacking.
set -eu

dir=/data/game
marker="$dir/manifest.json"

if [ -f "$marker" ] && [ "${GAME_DATA_FORCE:-0}" != "1" ]; then
	echo "game-data: present in $dir"
	exit 0
fi

if [ -z "${GAME_DATA_URL:-}" ]; then
	echo "game-data: WARNING $marker is missing and GAME_DATA_URL is not set."
	echo "game-data: the site will start but report that the game data is missing."
	exit 0
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
echo "game-data: downloading"
if ! wget -q -O "$tmp/game.tar.gz" "$GAME_DATA_URL"; then
	echo "game-data: ERROR download failed"
	exit 1
fi

if [ -n "${GAME_DATA_SHA256:-}" ]; then
	echo "${GAME_DATA_SHA256}  $tmp/game.tar.gz" | sha256sum -c - >/dev/null || {
		echo "game-data: ERROR checksum mismatch"
		exit 1
	}
fi

mkdir -p "$tmp/out"
tar -xzf "$tmp/game.tar.gz" -C "$tmp/out"
if [ ! -f "$tmp/out/manifest.json" ]; then
	echo "game-data: ERROR archive has no manifest.json at its top level"
	exit 1
fi

find "$dir" -mindepth 1 -delete
cp -a "$tmp/out/." "$dir/"
chmod -R a+rX "$dir"
echo "game-data: installed $(find "$dir" -type f | wc -l) files"
