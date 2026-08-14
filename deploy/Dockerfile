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

# Cap on the V8 old space, in MB.
#
# This is a ceiling, not a reservation, and setting it too high is actively harmful: V8 delays serious
# garbage collection until it approaches the limit, so a value larger than the RAM actually free on the
# host lets the process balloon until the kernel OOM-kills it. The build then dies with SIGKILL rather
# than a useful error. Lower it to fit the host, or add swap.
#
#   docker compose -f deploy/docker-compose.yml build --build-arg NODE_HEAP_MB=2048
ARG NODE_HEAP_MB=2048
ENV NODE_OPTIONS=--max-old-space-size=${NODE_HEAP_MB}

# Install dependencies first so this layer is cached whenever only source files change.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy only what webpack actually reads, rather than the whole repository.
#
# A blanket `COPY . .` puts deploy/ in this layer too, so editing an nginx config would invalidate it
# and force a full rebuild of the bundle - several minutes of compilation to change a one line header.
# Listing the real inputs keeps deployment tweaks to a rebuild of the tiny final stage.
COPY src ./src
COPY public ./public
COPY webpack ./webpack
COPY webpack.config.js tsconfig.json postcss.config.js tailwind.config.js ./

# Declared after the dependency install so that changing either one does not invalidate the cached
# npm layer: which app in this monorepo to build, and which env file to bake in.
ARG APP=sentinel2explorer
ARG ENV_FILE=.env.production

# package.json is named alongside the glob so that COPY still succeeds when the env file is absent -
# a glob matching nothing is an error on its own, which would pre-empt the friendly check below.
COPY package.json ${ENV_FILE}* ./

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
