# honcut — Lightweight Timeline Viewer for OpenChatCut project data
FROM node:24-slim

WORKDIR /app

# ffmpeg for media preview + chromium for render (both ARM64 native)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg chromium && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV FFMPEG_PATH=/usr/bin/ffmpeg

COPY package.json ./
RUN npm install

COPY . .

EXPOSE 5199
CMD ["npm", "run", "dev"]
