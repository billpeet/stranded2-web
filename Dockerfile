# syntax=docker/dockerfile:1

# ---- build: static single-page app ----
FROM node:24-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# ---- runtime: nginx serving the app and the game data volume ----
FROM nginx:1.29-alpine
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
COPY deploy/40-game-data.sh /docker-entrypoint.d/40-game-data.sh
RUN chmod +x /docker-entrypoint.d/40-game-data.sh && mkdir -p /data/game
COPY --from=build /app/build /usr/share/nginx/html

# The original game's data files are not part of the image (see DEPLOY.md).
VOLUME /data/game
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --start-period=120s --retries=3 \
	CMD wget -q -O /dev/null http://127.0.0.1/healthz || exit 1
