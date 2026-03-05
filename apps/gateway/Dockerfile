FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/gateway/package.json apps/gateway/
COPY apps/delegation/package.json apps/delegation/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/apps/gateway/node_modules ./apps/gateway/node_modules
COPY --from=deps /app/apps/delegation/node_modules ./apps/delegation/node_modules
COPY . .
RUN pnpm turbo build --filter=@quant-bot/gateway --filter=@quant-bot/delegation

ARG COMMIT_SHA=dev

FROM base AS runner
ENV COMMIT_SHA=$COMMIT_SHA
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=build /app/apps/gateway/package.json ./apps/gateway/
COPY --from=build /app/apps/gateway/node_modules ./apps/gateway/node_modules
COPY --from=build /app/apps/delegation/dist ./apps/delegation/dist
COPY --from=build /app/apps/delegation/package.json ./apps/delegation/
COPY --from=build /app/apps/delegation/node_modules ./apps/delegation/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 3000 5000
