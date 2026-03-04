# TODO: Agentic Order-Deploy Flow Hardening

Date: 2026-03-04
Scope: Agent -> tools -> REST API -> delegated signing/execution

## Critical

- [ ] Enforce execution auth binding in tools `POST /api/evm/execute`.
  - Remove trust in caller-supplied `userId`.
  - Validate `delegationId` belongs to authenticated user and is active.
  - Reject mismatched `delegationId`/`userId`.
  - Files:
    - `apps/tools/src/routes/tx-execute.ts`
    - `apps/tools/src/services/tx-executor.ts`
    - `apps/tools/src/services/delegation-client.ts`

- [ ] Fix/disable unimplemented REST order routes still using `todo!()`.
  - `order/dca`
  - `order/solver`
  - `order/{hash}`
  - `order/cancel`
  - `orders/*`
  - `trades/*`
  - Files:
    - `services/rest-api/src/routes/order.rs`
    - `services/rest-api/src/routes/orders.rs`
    - `services/rest-api/src/routes/trades.rs`

## High

- [ ] Enforce Dynamic webhook signature verification (fail closed).
  - Require signature at gateway ingress and delegation service.
  - Remove permissive behavior when signature/secret missing.
  - Files:
    - `apps/gateway/src/routes/webhook.ts`
    - `apps/delegation/src/routes.ts`

- [ ] Add trusted runtime identity context to agent tool calls.
  - Stop relying on user/model-provided identity values for execution.
  - Attach authenticated user context in gateway->agent->tools path.
  - Files:
    - `apps/gateway/src/routes/chat.ts`
    - `apps/gateway/src/services/agent-proxy.ts`
    - `apps/agent/workspace/skills/tx-executor/SKILL.md`

## Medium

- [ ] Improve simulation fidelity with sender context.
  - Add `from` address support in simulation request/types.
  - Use delegated wallet address for `call`/`estimateGas`.
  - Files:
    - `packages/shared-types/src/tools.ts`
    - `apps/tools/src/services/evm-simulator.ts`
    - `apps/tools/src/routes/evm-simulate.ts`

- [ ] Add explicit approval orchestration before state-changing deploy execution.
  - If order/swap returns approvals, execute approval tx(s) first.
  - Then simulate+execute final deployment tx.
  - Files:
    - `apps/agent/workspace/skills/orderbook/SKILL.md`
    - `apps/agent/workspace/skills/tx-executor/SKILL.md`
    - (optional) dedicated orchestrator route in `apps/tools`

## Low

- [ ] Normalize orderbook proxy error mapping.
  - Parse REST shape `{ error: { code, message } }`.
  - Return structured message/code to agent.
  - Files:
    - `apps/tools/src/services/orderbook-client.ts`

- [ ] Add explicit timeouts/retries for upstream calls.
  - Orderbook fetch calls
  - Delegation credential fetch calls
  - Transaction receipt waiting
  - Files:
    - `apps/tools/src/services/orderbook-client.ts`
    - `apps/tools/src/services/delegation-client.ts`
    - `apps/tools/src/services/tx-executor.ts`

## Environment/Operations

- [ ] Confirm tools app has working orderbook auth strategy.
  - If REST API requires Basic Auth, set:
    - `ORDERBOOK_API_KEY`
    - `ORDERBOOK_API_SECRET`
  - Keep `ORDERBOOK_API_URL` aligned with deployed REST API.
  - Files:
    - `fly.tools.toml`
    - Fly app secrets for `quant-bot-tools`

- [ ] Confirm required delegation signing env is present in tools.
  - `DYNAMIC_ENVIRONMENT_ID`
  - `DYNAMIC_SIGNING_KEY`
  - `INTERNAL_SECRET`
  - `DELEGATION_SERVICE_URL`

