import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
const require=createRequire(import.meta.url);
require("../app/lib/ai-advisor/shoe-finder-core.cjs");
const core=globalThis.ValsportShoeFinderCore;
const {scoreTechnicalCompatibility}=require("../app/lib/ai-advisor/technical-compatibility.cjs");
const runner={gender:"women",size:"39",weight:"60-75",usage:"daily",support:"supination",distance:"5-10"};
const item=changes=>core.normalizeProduct({id:"1",support:["neutral"],usage:["daily"],distance_range:["5-10"],weight_range:["60-75"],sizes_available:["39"],...changes});
test("PDP technical insights are concise and bound to actual categorical matches",()=>{
 const result=scoreTechnicalCompatibility(core,item({}),runner);
 assert.equal(result.bullets.length,3);
 assert.ok(result.bullets.every(b=>["good","medium","caution"].includes(b.tone)));
 assert.ok(result.bullets.every(b=>b.text.length<80));
 const changed=scoreTechnicalCompatibility(core,item({distance_range:["20-plus"]}),runner);
 assert.ok(changed.bullets.some(b=>b.tone==="caution"&&b.text.includes("distanze")));
 assert.ok(!changed.bullets.some(b=>/25 km/i.test(b.text)));
});
test("PDP bullets do not depend on product price or stock",()=>{
 const a=scoreTechnicalCompatibility(core,item({price:1,sizes_available:[]}),runner);
 const b=scoreTechnicalCompatibility(core,item({price:90000,sizes_available:["39"]}),runner);
 assert.deepEqual(a.bullets,b.bullets);
 assert.equal(a.percentage,b.percentage);
});
