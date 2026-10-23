import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import fs from "node:fs";
const require=createRequire(import.meta.url);
require("../app/lib/ai-advisor/shoe-finder-core.cjs");
const core=globalThis.ValsportShoeFinderCore;
const source=fs.readFileSync(new URL("../app/routes/api.advisor.proxy.compatibility.ts",import.meta.url),"utf8");
const fixture={id:"101",handle:"fixture",title:"Fixture",support:["neutral"],usage:["daily"],weight_range:["60-75"],distance_range:["5-10"],sizes_available:["39"],price:14900,priority:0,excluded:false};
const runner={gender:"women",size:"39",weight:"60-75",usage:"daily",support:"neutral",distance:"5-10"};
const technical=p=>{
 const item=core.normalizeProduct(p);
 const bucket=core.getSupportBucket(item,runner.support);
 const points=core.scoreWithinBucket({...item,size_match:{isExact:false,hasHalfTolerance:false}},runner);
 const raw=Math.max(0,Math.min(100,Math.round((points.usage+points.distance+points.weight)/65*100)));
 return bucket==="primary"?raw:bucket==="secondary"?Math.min(raw,70):Math.min(raw,40);
};
test("approved engine loads with technical scoring and matching operations",()=>{
 for(const fn of ["scoreWithinBucket","getSupportBucket","rankProducts","normalizeProduct"])assert.equal(typeof core[fn],"function");
});
test("technical compatibility does not depend on price, merchant priority or stock",()=>{
 const baseline=technical(fixture);
 assert.equal(technical({...fixture,price:999999,priority:10,sizes_available:[]}),baseline);
 assert.equal(technical({...fixture,price:1,priority:0,sizes_available:["44"]}),baseline);
});
test("support alternatives are capped below a primary match",()=>{
 const primary=technical(fixture);
 const secondary=technical({...fixture,support:["supination"]});
 const fallback=technical({...fixture,support:["stability"]});
 assert.ok(primary>secondary);
 assert.ok(secondary<=70);
 assert.ok(fallback<=40);
});
test("recommendation engine still requires an available size",()=>{
 const products=[fixture,{...fixture,id:"102",handle:"other",sizes_available:[]}].map(core.normalizeProduct);
 assert.deepEqual(core.rankProducts(products,runner).all.map(p=>p.id),["101"]);
});
test("compatibility route uses signed Shopify identity and does not trust user profile JSON",()=>{
 assert.match(source,/authenticate\.public\.appProxy\(request\)/);
 assert.match(source,/logged_in_customer_id/);
 assert.match(source,/getAdvisorCustomerContext\(id\)/);
 assert.match(source,/getVisibleShoes\(admin,ids\)/);
});
test("compatibility route excludes price, priority and size from technical formula",()=>{
 assert.match(source,/points\.usage/);
 assert.match(source,/points\.distance/);
 assert.match(source,/points\.weight/);
 assert.match(source,/technical\/65/);
 assert.match(source,/excluded_by_finder/);
 assert.match(source,/missing_/);
});
