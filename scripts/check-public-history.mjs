import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const forbiddenObjectPaths = [
  "raingentic-hackathon-starter-kit.pdf",
  "raingentic-monad-builder-one-pager.pdf",
  "raingentic-hackathon-5-ideas",
  "src/app/api/integrations/rain/card-issue/route.ts",
  "src/app/api/integrations/rain/collateral-window/route.ts",
  "src/app/api/integrations/rain/fund-async/route.ts",
  "src/app/api/integrations/rain/fund-shape/route.ts",
  "src/app/api/integrations/rain/proof/route.ts",
  "src/app/api/integrations/rain/reconcile/route.ts",
  "src/lib/integrations/rain/proof.ts",
  "tests/contract/rain-card-issue-route.test.ts",
  "tests/contract/rain-collateral-window-route.test.ts",
  "tests/contract/rain-fund-async-route.test.ts",
  "tests/contract/rain-fund-shape-route.test.ts",
  "tests/contract/rain-proof-route.test.ts",
  "tests/contract/rain-reconciliation-route.test.ts",
  "tests/integration/rain-live.test.ts",
  "docs/screenshots/04-rain-202-safe-stop.png",
  "docs/screenshots/05-rain-card-readback.png",
  "docs/screenshots/07-proof-ledger.png",
  "docs/screenshots/09-policy-gates.png",
];

const output = (args) =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const reachableObjects = output(["rev-list", "--objects", "--all"]);
const tracked = output(["ls-files"])
  .split(/\r?\n/u)
  .filter(Boolean);
const findings = [];
const userPathPattern = new RegExp(
  String.raw`(?:[A-Za-z]:[\\/])${["Us", "ers"].join("")}[\\/]`,
  "u",
);
const workspacePathPattern = new RegExp(
  ["Project", "Codespaces"].join("_"),
  "u",
);
const fileUriPattern = new RegExp(["file:", "//"].join(""), "u");

for (const path of forbiddenObjectPaths) {
  if (reachableObjects.split(/\r?\n/u).some((line) => line.endsWith(` ${path}`))) {
    findings.push(`forbidden reachable object: ${path}`);
  }
}

for (const path of tracked) {
  if (/^\.env(?:\.|$)/u.test(path) && path !== ".env.example") {
    findings.push(`tracked environment file: ${path}`);
    continue;
  }
  let source;
  try {
    source = readFileSync(path, "utf8");
  } catch {
    continue;
  }
  if (
    userPathPattern.test(source) ||
    workspacePathPattern.test(source) ||
    fileUriPattern.test(source)
  ) {
    findings.push(`private-machine path in ${path}`);
  }
  if (/^(?:RAIN_API_KEY|OPENAI_API_KEY|DATABASE_URL|MONAD_X402_BUYER_PRIVATE_KEY|RECOVERY_ENCRYPTION_KEY)=\S+/mu.test(source)) {
    findings.push(`credential assignment in ${path}`);
  }
}

if (findings.length > 0) {
  console.error("Public-history guard failed:");
  for (const finding of findings) console.error(`- ${finding}`);
  process.exit(1);
}

console.log(
  `Public-history guard passed (${tracked.length} tracked paths, ${forbiddenObjectPaths.length} forbidden object paths).`,
);
