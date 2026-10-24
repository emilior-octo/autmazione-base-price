import test from "node:test";
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import fs from "node:fs";
const require=createRequire(import.meta.url);
const {genderEligibility}=require("../app/lib/ai-advisor/product-gender.cjs");
const route=fs.readFileSync(new URL("../app/routes/api.advisor.proxy.compatibility.ts",import.meta.url),"utf8");
test("gender is checked before returning technical compatibility",()=>{
 assert.match(route,/id handle tags/);
 assert.match(route,/genderEligibility\(/);
 assert.match(route,/gender_mismatch|department\.reason/);
});
test("men never receive a women-only technical score and vice versa",()=>{
 assert.deepEqual(genderEligibility(["Donna","Nuovi arrivi"],"men"),{eligible:false,reason:"gender_mismatch"});
 assert.deepEqual(genderEligibility(["uomo"],"women"),{eligible:false,reason:"gender_mismatch"});
 assert.equal(genderEligibility(["uomo"],"men").eligible,true);
 assert.equal(genderEligibility(["donna"],"women").eligible,true);
});
test("only matching canonical department tags allow compatibility",()=>{
 for(const gender of ["men","women"]){
  assert.equal(genderEligibility(["unisex"],gender).eligible,false);
  assert.equal(genderEligibility([gender==="men"?"men":"women"],gender).eligible,false);
  assert.equal(genderEligibility(["uomo","donna"],gender).eligible,true);
 }
});
test("unknown gender does not generate misleading compatibility",()=>{
 assert.deepEqual(genderEligibility(["running","trail"],"men"),{eligible:false,reason:"missing_product_gender"});
});
