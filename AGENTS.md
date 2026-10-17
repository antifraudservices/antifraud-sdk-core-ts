# AGENTS.md

## Scope

This repository owns runtime-neutral orchestration for identity presentation, verification continuity, authoritative-provider handoff and credential issuance state. It contains no React, Node.js transport, storage engine, tenant configuration, product policy, signing key or deployment code.

## Development contract

- Use red-green-refactor test-driven development for every behavior change.
- Begin every test file with the required flow-contract comment.
- Keep wallet presentation and credential issuance as separate states and operations.
- Persist only opaque transaction continuity; never persist presentations or disclosed claims.
- Reuse governed contracts from antifraud-data-utils-ts after their immutable registry release.
- Documentation and code are written in English.

