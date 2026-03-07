# TX Refactor TODO

## Goal
Remove gateway-injected trusted execution context from LLM prompt content while preserving signing/deploy flows and authenticated user binding.

## Context
- Current gateway chat path injects execution context into the message sent to the agent.
- Logging/metrics are already out-of-band and should remain that way.
- Desired end state: execution identity never appears in prompt text.

## TODO
- [ ] Add gateway-owned action endpoints for tx staging/signing orchestration (session-authenticated).
- [ ] Ensure agent calls gateway action endpoints without passing execution token in prompt content.
- [ ] Move execution token usage (or equivalent internal identity binding) to server-side only.
- [ ] Keep tools APIs internal; gateway should be the only public entrypoint for tx flows.
- [ ] Update agent skills to remove any instruction that depends on reading execution token from prompt text.
- [ ] Add tests proving tx flow works with zero prompt-injected context.
- [ ] Add regression test ensuring prompts sent via `chat.send` do not contain execution token/user identity block.
- [ ] Keep token logging/metrics parallel-only (gateway logs + internal metrics route), never model-mediated.

## Acceptance Criteria
- [ ] No `[trusted-context ...]` prompt injection in chat forwarding.
- [ ] Deploy/signing works end-to-end for authenticated users.
- [ ] Token metrics and run usage logging still work.
- [ ] No user-facing behavior regressions in widget signing UX.
