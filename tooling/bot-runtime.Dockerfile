FROM node:22-alpine AS builder
RUN apk add --no-cache git
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/bot-runtime/package.json apps/bot-runtime/
COPY packages/contracts/package.json packages/contracts/
COPY packages/fs-store/package.json packages/fs-store/
COPY packages/test-fixtures/package.json packages/test-fixtures/
RUN corepack enable && pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @ai-workflow/contracts build && \
    pnpm --filter @ai-workflow/fs-store build && \
    pnpm --filter @ai-workflow/bot-runtime build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 4000
CMD ["node", "apps/bot-runtime/dist/index.js"]
