import { writeFileSync } from "node:fs";
// Schema values and request types share names in Orval's split output.
// Keep generated TypeScript models namespaced to avoid ambiguous barrel exports.
writeFileSync(new URL("../api-zod/src/index.ts", import.meta.url),
  'export * from "./generated/api";\nexport type * as ApiTypes from "./generated/types";\n');
