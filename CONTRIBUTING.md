# Contributing

SpendForge is a hackathon prototype with unusually strict evidence boundaries.
Before changing behavior, read `AGENTS.md`, the `docs/spec/` package, and
`docs/DEMO-NOTES.md`.

## Local workflow

1. Create a focused branch.
2. Keep provider credentials in ignored local or Preview-only environment
   configuration; never place them in fixtures, prompts, screenshots, or logs.
3. Preserve integer money, deterministic policy authority, idempotent provider
   operations, and separate payment/delivery/outcome states.
4. Run `npm.cmd run verify` on Windows, or the equivalent npm scripts on your
   platform.
5. Update `docs/DEMO-NOTES.md` whenever a fixture/live/proven boundary changes.

Provider calls require an explicit, bounded authorization and a durable
pre-call claim. A passing fixture or contract test never establishes live
provider behavior.

The repository currently has no open-source license. Public visibility does
not grant permission to copy, modify, or redistribute the code.
