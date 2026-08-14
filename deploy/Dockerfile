# Sentinel-2 Explorer - production image
#
# Multi stage: Node builds the static bundle, then a small Nginx image serves it. The Node toolchain
# does not survive into the final image, which keeps it at roughly 60 MB rather than 1.5 GB.
#
# Build from the REPOSITORY ROOT, not from this directory:
#   docker build -f deploy/Dockerfile -t sentinel2explorer:latest .
#
# The app is configured entirely at build time: webpack inlines the values from the env file through
# DefinePlugin, so the resulting image is tied to one ArcGIS app id and one service URL. Changing
# either means rebuilding the image, not restarting the container.

# ---------------------------------------------------------------------------
# Stage 1 - build the bundle
# ---------------------------------------------------------------------------
FROM node:20-alpine AS build

WORKDIR /app

# The ArcGIS SDK bundle is large enough that the default heap can abort the build on a small VPS.
ENV NODE_OPTIONS=--max-old-space-size=4096

# Install dependencies first so this layer is cached whenever only source files change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY . .

# Declared after the dependency install so that changing either one does not invalidate the cached
# npm layer: which app in this monorepo to build, and which env file to bake in.
ARG APP=sentinel2explorer
ARG ENV_FILE=.env.production

# Fail loudly and early rather than producing an image configured with placeholder values.
RUN test -f "${ENV_FILE}" || ( \
        echo "ERROR: ${ENV_FILE} not found in the build context." >&2; \
        echo "Create it from .env.template before building - see deploy/README.md" >&2; \
        exit 1 \
    )

RUN npx webpack --mode production --env app="${APP}" --env envFileName="${ENV_FILE}"

# ---------------------------------------------------------------------------
# Stage 2 - serve the bundle
# ---------------------------------------------------------------------------
FROM nginx:alpine

ARG APP=sentinel2explorer

COPY deploy/nginx/app.conf /etc/nginx/conf.d/default.conf
COPY deploy/nginx/security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY --from=build /app/dist/${APP} /usr/share/nginx/html

# TLS is terminated by whatever sits in front of this container, so plain HTTP inside is correct.
EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://localhost/index.html || exit 1
