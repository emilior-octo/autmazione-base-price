/* Pure technical card compatibility: no price, budget, inventory or size weighting.
 * Preserve the approved Finder's dimensions and support caps.
 */
function scoreTechnicalCompatibility(core, item, answers) {
  const bucket=core.getSupportBucket(item,answers.support);
  const technicalItem={...item,size_match:{isExact:false,hasHalfTolerance:false}};
  const points=core.scoreWithinBucket(technicalItem,answers);
  const technical=(Number(points.usage)||0)+(Number(points.distance)||0)+(Number(points.weight)||0);
  const raw=Math.max(0,Math.min(100,Math.round(technical/65*100)));
  const percentage=bucket==="primary"?raw:bucket==="secondary"?Math.min(raw,70):Math.min(raw,40);
  const labels=core.buildLabels(technicalItem,answers);
  return {percentage,reasons:Array.isArray(labels)?labels.filter(x=>typeof x==="string").slice(0,2):[]};
}
module.exports={scoreTechnicalCompatibility};
