ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base-nodejs:latest
FROM $BUILD_FROM

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY run.js ./

CMD ["node", "run.js"]
