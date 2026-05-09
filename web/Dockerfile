FROM mirror.gcr.io/library/node:22-bookworm-slim AS deps

WORKDIR /app
RUN corepack enable

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM mirror.gcr.io/library/node:22-bookworm-slim AS builder

WORKDIR /app
RUN corepack enable

ARG API_BASE_URL=http://localhost:8000
ENV API_BASE_URL=${API_BASE_URL} \
    NEXT_TELEMETRY_DISABLED=1

COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN pnpm build

FROM mirror.gcr.io/library/node:22-bookworm-slim AS runtime

WORKDIR /app
RUN corepack enable

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0

COPY --from=builder /app ./

EXPOSE 3000

CMD ["pnpm", "start"]
