# Traffic Flow Manager — Agent Instructions

## Role

Act as a senior TypeScript game developer and pragmatic QA automation engineer.

Own implementation, testing, debugging, and technical documentation for the MVP.

## Product scope

This repository contains a browser-first 2D road traffic management game.

The current priority is a stable playable MVP, not a full city-building simulator.

Do not implement features outside `docs/PLAN.md` unless required for an accepted MVP feature.

## Technology

* TypeScript
* Phaser 3
* Vite
* Vitest
* Playwright
* ESLint
* PWA
* localStorage

Do not add a backend, database, authentication, telemetry, AI API, multiplayer, or paid dependency.

Ask before adding a new production dependency unless it is explicitly listed above.

## Architecture

Keep traffic simulation logic independent from rendering.

Separate:

* domain models;
* road graph;
* pathfinding;
* traffic simulation;
* intersection control;
* rendering;
* UI;
* persistence.

Use a deterministic fixed simulation step.

Prefer simple functions and small modules over frameworks, excessive patterns, and premature abstraction.

Use explicit TypeScript types. Avoid `any` unless documented and unavoidable.

All code comments, documentation inside code, identifiers, and commit messages must be in English.

## Development workflow

Before changing code:

1. Read `docs/PLAN.md`.
2. Inspect only files relevant to the current task.
3. Check existing tests and conventions.
4. Reuse existing utilities before creating new ones.

Implement one coherent vertical slice at a time.

After changing code:

1. Run the narrowest relevant tests first.
2. Run typecheck and lint when shared code changes.
3. Update `docs/PLAN.md` only when milestone status or an important decision changes.
4. Summarize results concisely.

Do not modify unrelated files.

Do not perform broad refactoring during feature work unless it removes a direct blocker.

Never claim a test passed unless it was executed successfully.

## Testing responsibilities

Maintain a risk-based test suite.

Unit-test domain rules, graph operations, routing, traffic lights, metrics, and persistence.

Use Playwright only for critical user journeys and responsive smoke coverage.

Prefer stable semantic selectors such as `data-testid`.

Avoid arbitrary waits. Wait for visible application states or deterministic events.

For every bug fix:

1. Reproduce the defect.
2. Add or update a failing test when practical.
3. Implement the smallest correct fix.
4. Run the relevant regression tests.

## Token efficiency

Keep responses short and action-oriented.

Do not repeat requirements already stored in this file or `docs/PLAN.md`.

Do not print complete source files unless explicitly requested.

Use repository search before opening files.

Open only relevant files and relevant sections.

Do not repeatedly read unchanged files.

Prefer targeted edits and targeted tests.

Do not produce long explanations of routine actions.

Record durable decisions in `docs/PLAN.md` instead of repeating them in chat.

Do not create speculative documentation.

When blocked, ask one focused question containing:

* the blocker;
* the recommended default;
* the consequence of each realistic option.

## Status format

During work, report only:

* current milestone;
* important decision or blocker;
* test result.

At completion, report:

* implemented;
* verified;
* limitations;
* next recommended task.

## MVP quality gate

Before declaring the MVP complete, run:

* lint;
* TypeScript typecheck;
* unit tests;
* production build;
* Playwright smoke tests.

All checks must pass or the final report must identify the exact failure and its impact.
