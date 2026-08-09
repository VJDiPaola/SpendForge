# Public release checklist

The owner authorized a clean-root history rewrite. The replacement refs were
verified before publication; the checks below record the final release state.

- [x] Final lint, typecheck, focused tests, production build, and maintained Chromium flows pass.
- [x] Secret, high-entropy, raw-provider-ID, private-path, and Git-history scans
      find no material exposure.
- [x] Retired execution routes return 404 on the final protected Preview and public Production.
- [x] All provider mutation and model-execution gates are closed.
- [x] Production is fixture-only with no provider credentials or mutation gates.
- [x] Production is public; Preview remains protected by Vercel Authentication.
- [ ] Screenshots match final copy and visibly label fixture/sandbox/testnet.
- [x] The final branch is the GitHub default branch.
- [x] Repository visibility changed only after the audit above passed.
- [x] Vercel Authentication remains enabled after GitHub visibility changes.
- [x] The README states that the repository has no open-source license.

Public visibility does not make this repository open source. Until the owner
chooses a license, the code remains unlicensed/all-rights-reserved. No custom
legal terms are inferred here.
