# syntax=docker/dockerfile:1

# ---- Stage 1: build the React UI ----
FROM node:20-slim AS web
WORKDIR /web
COPY web/package*.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

# ---- Stage 2: build the NestJS server ----
FROM node:20-slim AS server
WORKDIR /server
COPY server/package*.json ./
RUN npm ci
COPY server/ ./
RUN npm run build && npm prune --omit=dev

# ---- Stage 3: runtime ----
FROM node:20-slim AS runtime
WORKDIR /app

# ffmpeg + yt-dlp (static binary) + deno (JS runtime yt-dlp needs to decipher
# YouTube formats reliably) + python3 (yt-dlp runtime).
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg python3 ca-certificates wget unzip \
    && wget -qO /usr/local/bin/yt-dlp \
      https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && wget -qO /tmp/deno.zip \
      https://github.com/denoland/deno/releases/latest/download/deno-x86_64-unknown-linux-gnu.zip \
    && unzip -q /tmp/deno.zip -d /usr/local/bin \
    && chmod a+rx /usr/local/bin/deno \
    && rm -rf /tmp/deno.zip /var/lib/apt/lists/*

ENV NODE_ENV=production \
    PORT=3000 \
    VIDEO_TMP_DIR=/tmp/video-editor \
    WEB_DIR=/app/public

COPY --from=server /server/dist ./dist
COPY --from=server /server/node_modules ./node_modules
COPY --from=server /server/package.json ./package.json
COPY --from=web /web/dist ./public

EXPOSE 3000
CMD ["node", "dist/main.js"]
