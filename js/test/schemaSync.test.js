// Guards against drift between the canonical schema (schema/offset-schema.json) and the JS mirror
// (js/offset-schema.json) that the npm package bundles and js/encoding.js imports. If this fails,
// run: bun run sync:schema  (and never hand-edit js/offset-schema.json — edit the canonical file).

import { describe, test, expect } from "bun:test";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const here = dirname(fileURLToPath(import.meta.url));
const canonical = JSON.parse(readFileSync(join(here, "..", "..", "schema", "offset-schema.json"), "utf8"));
const mirror = JSON.parse(readFileSync(join(here, "..", "offset-schema.json"), "utf8"));

describe("schema mirror", () => {
    test("js/offset-schema.json matches canonical schema/offset-schema.json", () => {
        expect(mirror).toEqual(canonical);
    });
});
