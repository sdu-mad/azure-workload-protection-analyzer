FROM node:22-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production
ENV PORT=8080
ENV BICEP_CLI_PATH=/usr/local/bin/bicep
WORKDIR /app

ARG BICEP_VERSION=v0.47.16
ARG BICEP_SHA256=64c345a58e0c3e48b1bc98a4e62d6b3adb1d238281297de3400aeafb2697aa5a

RUN apt-get update \
  && apt-get upgrade --yes \
  && apt-get install --yes --no-install-recommends ca-certificates curl libicu72 \
  && curl --fail --location --silent --show-error \
    "https://github.com/Azure/bicep/releases/download/${BICEP_VERSION}/bicep-linux-x64" \
    --output /usr/local/bin/bicep \
  && echo "${BICEP_SHA256}  /usr/local/bin/bicep" | sha256sum --check --strict \
  && chmod 0755 /usr/local/bin/bicep \
  && bicep --version \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts \
  && npm cache clean --force \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server

USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD curl --fail --silent http://127.0.0.1:8080/api/health > /dev/null || exit 1

CMD ["node", "dist-server/index.js"]
