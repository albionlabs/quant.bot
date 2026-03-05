# TODO: Agentic Order-Deploy Flow Hardening

Date: 2026-03-04
Scope: Agent -> tools -> delegated signing/execution

## Critical

- [ ] Enforce execution auth binding in tools `POST /api/evm/execute`.
  - Remove trust in caller-supplied `userId`.
  - Validate `delegationId` belongs to authenticated user and is active.
  - Reject mismatched `delegationId`/`userId`.
  - Files:
    - `apps/tools/src/routes/tx-execute.ts`
    - `apps/tools/src/services/tx-executor.ts`
    - `apps/tools/src/services/delegation-client.ts`

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

- [ ] Add explicit timeouts/retries for upstream calls.
  - Orderbook fetch calls
  - Delegation credential fetch calls
  - Transaction receipt waiting
  - Files:
    - `apps/tools/src/services/delegation-client.ts`
    - `apps/tools/src/services/tx-executor.ts`

## Environment/Operations

- [ ] Confirm required delegation signing env is present in tools.
  - `DYNAMIC_ENVIRONMENT_ID`
  - `DYNAMIC_SIGNING_KEY`
  - `INTERNAL_SECRET`
  - `DELEGATION_SERVICE_URL`

