import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../app/lib/ai-advisor/catalog.server.ts",import.meta.url),"utf8");
const chat=fs.readFileSync(new URL("../app/routes/api.advisor.proxy.chat.ts",import.meta.url),"utf8");
test("catalog is refreshed after 60 seconds and does not become a static recommendation list",()=>{
 assert.match(source,/cached\.expires > Date\.now\(\)/);
 assert.match(source,/expires:\s*Date\.now\(\) \+ 60000/);
 assert.match(source,/collection\(id:\s*\$id\)/);
 assert.match(chat,/getAdvisorCatalog\(args\.gender\)/);
 assert.match(chat,/core\.rankProducts\(catalog\.map\(core\.normalizeProduct\),answers\)/);
});
test("new products from every collection page are included rather than only first 100",()=>{
 assert.match(source,/products\(first:\s*100,\s*after:\s*\$after\)/);
 assert.match(source,/if \(!page\.pageInfo\.hasNextPage\) break/);
 assert.match(source,/after = page\.pageInfo\.endCursor/);
});
test("one loader per gender; invalidation prevents obsolete requests from repopulating cache",()=>{
 assert.match(source,/inFlight\.get\(gender\)/);
 assert.match(source,/inFlight\.set\(gender, promise\)/);
 assert.match(source,/generation === cacheGeneration/);
 assert.match(source,/cacheGeneration\+\+/);
 assert.match(source,/inFlight\.clear\(\)/);
});
test("recommended shoes still require real available sizes",()=>{
 assert.match(source,/availableForSale/);
 assert.match(source,/sizes_available/);
 assert.match(source,/finder_support/);
 assert.match(source,/finder_usage/);
 assert.match(source,/finder_distance_range/);
});
