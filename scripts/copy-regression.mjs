import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC = path.join(ROOT, "src");
const LEGACY_ROOM = path.join(SRC, "routes", "room.$code.tsx");

const forbidden = [
  { label: "five-minute", re: /five[- ]minute/gi },
  { label: "5 minutes", re: /\b5\s+minutes?\b/gi },
  { label: "fixed lifetime", re: /fixed\s+lifetime/gi },
  { label: "clock never resets", re: /clock\s+never\s+resets/gi },
];

function collectFiles(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(full);
    return /\.(?:ts|tsx|css)$/.test(entry.name) ? [full] : [];
  });
}

const failures = [];
for (const file of collectFiles(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  for (const rule of forbidden) {
    const matches = [...text.matchAll(rule.re)];
    if (matches.length === 0) continue;

    // The giant room route still contains exactly two legacy literals that are normalized
    // immediately by RoomClarityLayer. Keep this exception narrow until the planned room
    // architecture consolidation moves those labels into direct route state/JSX.
    if (file === LEGACY_ROOM) {
      const allowed =
        (rule.label === "fixed lifetime" && matches.length === 1) ||
        (rule.label === "clock never resets" && matches.length === 1);
      if (allowed) continue;
    }

    failures.push(
      `${path.relative(ROOT, file)}: stale ${rule.label} copy (${matches.length} match${matches.length === 1 ? "" : "es"})`,
    );
  }
}

const home = fs.readFileSync(path.join(SRC, "routes", "index.tsx"), "utf8");
const clarity = fs.readFileSync(
  path.join(SRC, "components", "eznoobs", "RoomClarityLayer.tsx"),
  "utf8",
);

for (const required of [
  "7 min base · up to 10",
  "Rooms start at 7 minutes",
  "hard 10-minute cap",
]) {
  if (!home.includes(required)) failures.push(`homepage missing current lifetime copy: ${required}`);
}

for (const required of [
  "7 min base · active rooms can reach 10",
  "Active rooms can last up to 10 minutes.",
]) {
  if (!clarity.includes(required)) failures.push(`room clarity missing current lifetime copy: ${required}`);
}

if (failures.length > 0) {
  console.error("EZNOOBS copy regression check failed:\n");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("EZNOOBS copy regression check passed.");
