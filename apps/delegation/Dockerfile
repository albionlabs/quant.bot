FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY apps/delegation/package.json apps/delegation/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/apps/delegation/node_modules ./apps/delegation/node_modules
COPY . .
RUN pnpm turbo build --filter=@quant-bot/delegation

FROM base AS runner
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/apps/delegation/dist ./apps/delegation/dist
COPY --from=build /app/apps/delegation/package.json ./apps/delegation/
COPY --from=build /app/apps/delegation/node_modules ./apps/delegation/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

EXPOSE 5000
CMD ["node", "apps/delegation/dist/index.js"]
