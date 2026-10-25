// Bill splitting: turns a bill's inputs into who owes and who paid what, plus group balances.
import { money, round, eps } from "./money.js";
import { t } from "./i18n.js";

export const isNum=v=>v!==null&&v!==""&&v!==undefined&&isFinite(Number(v));
export function roundAll(raw,total){const out={};let sum=0;const ks=Object.keys(raw);ks.forEach(k=>{out[k]=round(raw[k]);sum+=out[k]});const diff=round(total-sum);if(diff&&ks.length){const k=ks.reduce((a,c)=>Math.abs(raw[c])>Math.abs(raw[a])?c:a);out[k]=round(out[k]+diff)}return out}
export function adjAmount(a,sub){const v=Math.abs(Number(a.value))||0;const amt=a.unit==="percent"?sub*v/100:v;return a.type==="discount"?-amt:amt}
export const ADJ_NAME=a=>a.label||(a.type==="discount"?t("Discount"):t("Fee"));
// Turns a bill's inputs (subtotal, split mode, fees/discounts, payers) into who owes and who paid what.
export function computeBill(b){
  const P=Object.keys(b.people||{});const errs=[];const base={},adj={};P.forEach(p=>{base[p]=0;adj[p]=0});
  if(!P.length)errs.push(t("Pick who shares this bill."));
  let sub=Number(b.subtotal)||0;
  if(P.length){
    if(b.mode==="items"){
      const fixed=P.filter(p=>isNum(b.people[p].item)),rest=P.filter(p=>!isNum(b.people[p].item));
      const sumF=fixed.reduce((a,p)=>a+Number(b.people[p].item),0);
      if(!sub&&!rest.length)sub=sumF;
      fixed.forEach(p=>base[p]=Number(b.people[p].item));
      const left=sub-sumF;
      if(rest.length){if(left<-eps())errs.push(t("Item amounts are {amt} more than the subtotal.",{amt:money(-left)}));else rest.forEach(p=>base[p]=left/rest.length)}
      else if(Math.abs(left)>eps())errs.push(left>0?t("{amt} of the subtotal isn't assigned. Clear someone's amount so they share the rest.",{amt:money(left)}):t("Item amounts are {amt} more than the subtotal.",{amt:money(-left)}));
    }else if(b.mode==="shares"){
      const w={};P.forEach(p=>{const x=Number(b.people[p].weight);w[p]=isNum(b.people[p].weight)&&x>=0?x:1});
      const sw=Object.values(w).reduce((a,c)=>a+c,0);
      if(sw<=0)errs.push(t("Give at least one person a share above zero."));else P.forEach(p=>base[p]=sub*w[p]/sw);
    }else P.forEach(p=>base[p]=sub/P.length);
  }
  if(!(sub>0))errs.push(t("Enter the items subtotal."));
  const baseSum=Object.values(base).reduce((a,c)=>a+c,0);
  let fees=0,disc=0;
  (b.adjustments||[]).forEach(a=>{
    const amt=adjAmount(a,sub);if(!amt||!P.length)return;
    if(amt>0)fees+=amt;else disc-=amt;
    if(a.alloc==="person"){if(!P.includes(a.person)){errs.push(t("Pick who covers “{name}”.",{name:ADJ_NAME(a)}));return}adj[a.person]+=amt}
    else if(a.alloc==="proportional"&&baseSum>0)P.forEach(p=>adj[p]+=amt*base[p]/baseSum);
    else P.forEach(p=>adj[p]+=amt/P.length);
  });
  const total=round(sub+fees-disc);
  if(total<0)errs.push(t("Discounts are bigger than the bill."));
  const raw={};P.forEach(p=>raw[p]=base[p]+adj[p]);
  const shares=P.length?roundAll(raw,total):{};
  if(Object.values(shares).some(v=>v<-eps()))errs.push(t("Someone ends up with a negative share. Check the discounts."));
  const pay=(b.payers||[]).filter(x=>x&&x.p);
  if(!pay.length)errs.push(t("Pick who paid."));
  const fx=pay.filter(x=>isNum(x.amount)),rs=pay.filter(x=>!isNum(x.amount));
  const sumP=fx.reduce((a,x)=>a+Number(x.amount),0);
  const rawPaid={};fx.forEach(x=>rawPaid[x.p]=(rawPaid[x.p]||0)+Number(x.amount));
  const leftP=total-sumP;
  if(rs.length){if(leftP<-eps())errs.push(t("Payments are {amt} more than the total.",{amt:money(-leftP)}));else rs.forEach(x=>rawPaid[x.p]=(rawPaid[x.p]||0)+leftP/rs.length)}
  else if(pay.length&&Math.abs(leftP)>eps())errs.push(leftP>0?t("{amt} of the total has no payer. Leave one payer's amount empty to cover the rest.",{amt:money(leftP)}):t("Payments are {amt} more than the total.",{amt:money(-leftP)}));
  const paid=Object.keys(rawPaid).length?roundAll(rawPaid,rs.length&&leftP>=0?total:sumP):{};
  const paidBy=Object.keys(paid).sort((a,c)=>paid[c]-paid[a])[0]||"me";
  return {ok:!errs.length,errs,subtotal:round(sub),base,adj,shares,paid,total,fees:round(fees),disc:round(disc),paidBy};
}
export function finalizeBill(b){const r=computeBill(b);Object.assign(b,{amount:r.total,subtotal:r.subtotal,shares:r.shares,paid:r.paid,paidBy:r.paidBy,fees:r.fees,disc:r.disc});return r}
// older bills only stored shares + one payer
export function normalizeBill(b){
  if(b.people)return b;
  const ids=Object.keys(b.shares||{});const vals=ids.map(i=>b.shares[i]);const eq=vals.every(v=>Math.abs(v-vals[0])<=1);
  b.people={};ids.forEach(i=>b.people[i]={item:eq?null:b.shares[i],weight:1});
  b.mode=eq?"equal":"items";b.subtotal=b.amount;b.adjustments=[];b.payers=[{p:b.paidBy||"me",amount:null}];return b;
}

export function balances(D,scope){
  const net={};
  Object.values(D.bills).forEach(b=>{
    if(scope!=="all"&&(b.eventId||"none")!==scope)return;
    Object.entries(b.paid||{[b.paidBy]:b.amount}).forEach(([p,a])=>net[p]=(net[p]||0)+a);
    Object.entries(b.shares||{}).forEach(([p,a])=>net[p]=(net[p]||0)-a);
  });
  Object.keys(net).forEach(k=>net[k]=round(net[k]));
  return net;
}
export function settlePlan(net){
  const e=eps();
  const cr=Object.entries(net).filter(([,v])=>v>e).map(([p,v])=>({p,v})).sort((a,b)=>b.v-a.v);
  const dr=Object.entries(net).filter(([,v])=>v<-e).map(([p,v])=>({p,v:-v})).sort((a,b)=>b.v-a.v);
  const out=[];let i=0,j=0;
  while(i<dr.length&&j<cr.length){const a=Math.min(dr[i].v,cr[j].v);out.push({from:dr[i].p,to:cr[j].p,amount:round(a)});dr[i].v-=a;cr[j].v-=a;if(dr[i].v<=e)i++;if(cr[j].v<=e)j++}
  return out;
}

