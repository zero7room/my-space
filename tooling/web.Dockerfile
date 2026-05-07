FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY packages/contracts/package.json packages/contracts/
RUN corepack enable && pnpm install --frozen-lockfile=false
COPY . .
RUN pnpm --filter @ai-workflow/contracts build && pnpm --filter @ai-workflow/web build

FROM node:22-alpine
WORKDIR /app
COPY --from=builder /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@ai-workflow/web", "start"]
