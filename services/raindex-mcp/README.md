# Raindex MCP Workspace Mount

`apps/tools` runs the Raindex MCP server over stdio.

Expected runtime path in containers:

- `/app/raindex-mcp/dist/index.js`

For local `docker-compose`:

1. Clone/build the MCP server into this directory.
2. Keep `RAINDEX_MCP_HOST_PATH=./services/raindex-mcp`.
3. Set:
   - `RAINDEX_MCP_COMMAND=node`
   - `RAINDEX_MCP_ARGS=["/app/raindex-mcp/dist/index.js"]`
   - `RAINDEX_MCP_CWD=/app/raindex-mcp`

If you use a different location or command, update the corresponding `RAINDEX_MCP_*` env vars.

CI/CD note:

- `.github/workflows/deploy.yml` clones `raindex-mcp` at a pinned commit
  before deploying `quant-bot-tools`, and `apps/tools/Dockerfile` builds/copies the
  MCP artifact into the runtime image at `/app/raindex-mcp/dist/index.js`.
- Currently pinned to `alastairong1/raindex-mcp` fork with Map serialization fix.
  Upstream PR: https://github.com/hardyjosh/raindex-mcp/pull/8
