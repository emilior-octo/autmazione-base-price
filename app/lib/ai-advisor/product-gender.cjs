// Canonical running-shoe department gate for technical compatibility.
const asTags=tags=>Array.isArray(tags)?tags.map(x=>String(x).trim().toLowerCase()):[];
function genderEligibility(tags,runnerGender){
  const values=new Set(asTags(tags));
  const men=values.has('uomo');
  const women=values.has('donna');
  if(men&&women)return {eligible:true,reason:null};
  if(!men&&!women)return {eligible:false,reason:'missing_product_gender'};
  return runnerGender==='men'&&men||runnerGender==='women'&&women
    ? {eligible:true,reason:null}
    : {eligible:false,reason:'gender_mismatch'};
}
module.exports={genderEligibility};
