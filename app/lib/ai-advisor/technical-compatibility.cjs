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
  const insights=[];
  if(answers.support!=="unknown")insights.push({tone:bucket==="primary"?"good":bucket==="secondary"?"medium":"caution",text:bucket==="primary"?"Adatta al tuo appoggio":bucket==="secondary"?"Compatibilità parziale con il tuo appoggio":"Meno indicata per il tuo appoggio"});
  insights.push({tone:item.weight_range.includes(answers.weight)?"good":"caution",text:item.weight_range.includes(answers.weight)?"Adatta alla tua fascia di peso":"Meno indicata per la tua fascia di peso"});
  insights.push({tone:item.distance_range.includes(answers.distance)?"good":"caution",text:item.distance_range.includes(answers.distance)?"Adatta alle tue distanze abituali":"Meno indicata per le tue distanze abituali"});
  if(insights.length<3)insights.push({tone:item.usage.includes(answers.usage)?"good":"caution",text:item.usage.includes(answers.usage)?"Indicata per il tuo allenamento":"Meno indicata per il tuo allenamento"});
  return {bullets:insights.slice(0,3),percentage,reasons:Array.isArray(labels)?labels.filter(x=>typeof x==="string").slice(0,2):[]};
}
module.exports={scoreTechnicalCompatibility};
