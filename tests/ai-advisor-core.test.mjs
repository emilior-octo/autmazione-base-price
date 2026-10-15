import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
require("../app/lib/ai-advisor/shoe-finder-core.cjs");
const core = globalThis.ValsportShoeFinderCore;
assert.ok(core?.rankProducts, "Approved Shoe Finder core must load");

const product = (id, overrides = {}) => ({
 id, handle: id, title: id, url: "/products/" + id, price: 10000,
 support: ["neutral"], usage: ["daily"], weight_range: ["60-75"],
 distance_range: ["5-10"], priority: 0, excluded: false,
 sizes_available: ["39"], ...overrides
});
const profile = {
 gender: "women", size: core.normalizeSize("39 EU"),
 weight: core.normalizeWeight("60-75"), usage: core.normalizeUsage("daily"),
 support: core.normalizeSupport("neutral"), distance: core.normalizeDistance("5-10")
};
const rank = (products, answers = profile) =>
 core.rankProducts(products.map(core.normalizeProduct), answers).all;

test("canonical runner profile values are normalized as approved", () => {
 assert.equal(profile.weight, "60-75");
 assert.equal(profile.distance, "5-10");
 assert.equal(profile.size, "39");
});

test("excluded and unavailable sizes are never recommended", () => {
 const matches = rank([
  product("valid"), product("excluded", {excluded: true}),
  product("wrong-size", {sizes_available: ["42"]}),
  product("out-of-stock", {sizes_available: []})
 ]);
 assert.deepEqual(matches.map(p => p.id), ["valid"]);
});

test("approved support bucket order takes precedence over price", () => {
 const matches = rank([
  product("fallback", {support: ["stability"], price: 100}),
  product("primary", {support: ["neutral"], price: 30000})
 ]);
 assert.deepEqual(matches.map(p => p.id), ["primary", "fallback"]);
});

test("approved tie-break remains lower price without changing ranking logic", () => {
 const matches = rank([
  product("expensive", {price: 20000}),
  product("affordable", {price: 10000})
 ]);
 assert.deepEqual(matches.map(p => p.id), ["affordable", "expensive"]);
});
