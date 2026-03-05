FROM node:22-slim AS base
RUN corepack enable && corepack prepare pnpm@9.15.4 --activate
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/config/package.json packages/config/
COPY packages/shared-types/package.json packages/shared-types/
COPY packages/evm-utils/package.json packages/evm-utils/
COPY apps/tools/package.json apps/tools/
RUN pnpm install --frozen-lockfile

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages/config/node_modules ./packages/config/node_modules
COPY --from=deps /app/packages/shared-types/node_modules ./packages/shared-types/node_modules
COPY --from=deps /app/packages/evm-utils/node_modules ./packages/evm-utils/node_modules
COPY --from=deps /app/apps/tools/node_modules ./apps/tools/node_modules
COPY . .
RUN pnpm turbo build --filter=@quant-bot/tools

FROM base AS raindex-mcp-build
WORKDIR /app/services/raindex-mcp
COPY services/raindex-mcp/package.json ./
COPY services/raindex-mcp/package-lock.json ./
RUN npm ci
COPY services/raindex-mcp/ ./
RUN npm run build

ARG COMMIT_SHA=dev

FROM base AS runner
ENV COMMIT_SHA=$COMMIT_SHA
COPY --from=build /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=build /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=build /app/packages/evm-utils/dist ./packages/evm-utils/dist
COPY --from=build /app/packages/evm-utils/package.json ./packages/evm-utils/
COPY --from=build /app/packages/evm-utils/node_modules ./packages/evm-utils/node_modules
COPY --from=build /app/apps/tools/dist ./apps/tools/dist
COPY --from=build /app/apps/tools/package.json ./apps/tools/
COPY --from=build /app/apps/tools/node_modules ./apps/tools/node_modules
COPY --from=build /app/node_modules ./node_modules
COPY --from=raindex-mcp-build /app/services/raindex-mcp/dist ./raindex-mcp/dist
COPY --from=raindex-mcp-build /app/services/raindex-mcp/node_modules ./raindex-mcp/node_modules
COPY --from=raindex-mcp-build /app/services/raindex-mcp/package.json ./raindex-mcp/package.json
COPY --from=build /app/package.json ./

EXPOSE 4000
CMD ["node", "apps/tools/dist/index.js"]
