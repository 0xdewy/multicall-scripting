// Syncs the JS mirror of the canonical schema.
//
// The canonical bit-layout schema lives at the repo-root `schema/offset-schema.json` (shared by the
// Solidity, JS, and Rust layers). The npm package can only bundle files inside `js/`, and
// `js/encoding.js` imports `./offset-schema.json`, so JS keeps a generated mirror at
// `js/offset-schema.json`. This script copies canonical -> mirror. It runs on `prepack` (so every
// publish bundles a fresh copy) and can be run manually via `bun run sync:schema`.
//
// Do not hand-edit `js/offset-schema.json` — edit `schema/offset-schema.json` and re-sync.
// `js/test/schemaSync.test.js` fails if the two ever diverge.

import { copyFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const canonical = join(here, "..", "..", "schema", "offset-schema.json");
const mirror = join(here, "..", "offset-schema.json");

copyFileSync(canonical, mirror);
process.stdout.write(`synced ${canonical} -> ${mirror}\n`);
