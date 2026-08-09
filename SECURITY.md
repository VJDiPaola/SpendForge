# Security policy

Do not open a public issue containing credentials, provider identifiers, wallet
material, card data, database URLs, or unredacted request/response bodies.
Report sensitive findings through GitHub's private vulnerability reporting or
a private Security Advisory when available.

## Important boundaries

- All Rain, OpenAI, Monad, wallet, and database credentials are server-only.
- PAN/CVC, private keys, raw provider payloads, and chain-of-thought must never
  be stored in public evidence.
- Provider writes require a Preview-only kill switch, durable CAS claim,
  integer cap, one-attempt gate, and explicit authorization.
- Unknown write outcomes stay unknown and must not be retried automatically.
- Rain Sandbox and Monad Testnet are not production or real-money evidence.

Supported release line: the current hackathon branch. This prototype has no
production SLA or security-maintenance commitment.
