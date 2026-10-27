// Quick add: turns text like "phở 55k, grab 32k" or "dinner 1.2tr with An, Bình #Dalat ship 30k" into records.
// Pure rules, no AI and no network.
import { today, addDays, pad } from "./dates.js";
import { guessCat } from "./categories.js";
import { t } from "./i18n.js";

export function parseAmountToken(numStr,suf){
  let s=numStr;suf=(suf||"").toLowerCase();
  const mult=/^(k|nghìn|ngàn|n|thousand)$/.test(suf)?1e3:/^(tr|triệu|m|mil|million|củ)$/.test(suf)?1e6:/^(b|tỷ|ty)$/.test(suf)?1e9:1;
  if(mult>1)s=s.replace(",",".");
  else if(/^\d{1,3}([.,]\d{3})+$/.test(s))s=s.replace(/[.,]/g,"");
  else s=s.replace(",",".");
  const v=parseFloat(s)*mult;return isFinite(v)?v:null;
}
const pct=n=>parseFloat(String(n).replace(",","."));
const ADJ_RES=[
  [/\b(?:ship(?:ping)?(?:\s+fee)?|delivery(?:\s+fee)?|phí ship|phí giao hàng)\s*:?\s*(\d+(?:[.,]\d+)*)\s*(k|tr|nghìn|ngàn)?(?![\p{L}%])/giu,g=>({label:"Shipping",type:"fee",value:parseAmountToken(g[1],g[2]),unit:"amount",alloc:"proportional"})],
  [/\b(?:service(?:\s+charge)?|svc|phí dịch vụ)\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/giu,g=>({label:"Service charge",type:"fee",value:pct(g[1]),unit:"percent",alloc:"proportional"})],
  [/\b(?:vat|tax|thuế)\s*:?\s*(\d+(?:[.,]\d+)?)\s*%/giu,g=>({label:"VAT",type:"fee",value:pct(g[1]),unit:"percent",alloc:"proportional"})],
  [/\b(?:tip|boa)\s*:?\s*(\d+(?:[.,]\d+)*)\s*(k|tr|nghìn|ngàn)?(?![\p{L}%])/giu,g=>({label:"Tip",type:"fee",value:parseAmountToken(g[1],g[2]),unit:"amount",alloc:"proportional"})],
  [/\b(?:discount|promo(?:\s+code)?|voucher|coupon|giảm(?:\s+giá)?|khuyến mãi|km)\s*:?\s*-?\s*(\d+(?:[.,]\d+)*)\s*(%|k|tr|nghìn|ngàn)?(?!\p{L})/giu,g=>g[2]==="%"?{label:"Discount",type:"discount",value:pct(g[1]),unit:"percent",alloc:"proportional"}:{label:"Discount",type:"discount",value:parseAmountToken(g[1],g[2]),unit:"amount",alloc:"proportional"}],
];
const AMT_RE=/(\$|€)?\s*(\d+(?:[.,]\d+)*)\s*(k|tr|triệu|nghìn|ngàn|củ|thousand|million|mil|m|b|tỷ)?\b\s*(đồng|dong|đ|vnd|usd|dollars?|\$|€)?/i;
/** A written date like "25/10" or "25/10/2026" (day first). Without a year, a date that would be
 *  in the future means last year. Returns [ymd, matchedText] or null. */
export function parseDayMonth(s){
  const m=String(s).match(/(?:^|\s)(?:ngày\s*|ngay\s*|on\s*)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?(?=\s|$|[,.;])/i);
  if(!m)return null;
  const d=Number(m[1]),mo=Number(m[2]);
  let y=m[3]?Number(m[3].length===2?"20"+m[3]:m[3]):new Date().getFullYear();
  const ok=(yy)=>{const x=new Date(yy,mo-1,d);return x.getMonth()===mo-1&&x.getDate()===d};
  if(!ok(y))return null;
  let ymd=`${y}-${pad(mo)}-${pad(d)}`;
  if(!m[3]&&ymd>today()){y--;if(!ok(y))return null;ymd=`${y}-${pad(mo)}-${pad(d)}`}
  return [ymd,m[0]];
}
export function localParse(text){
  text=String(text).normalize("NFC");
  const items=[];
  const parts=[];
  text.split(/[\n;]+/).forEach(p=>{const segs=p.split(/,|\band\b|\s+và\s+/i);
    if(!/\b(with|split|chia|cùng|với)\b/i.test(p)&&segs.length>1&&segs.every(s=>/\d/.test(s)))parts.push(...segs);else parts.push(p)});
  for(let part of parts){
    part=part.trim();if(!part)continue;
    const adjs=[];
    if(/\b(with|split|chia|cùng|với)\b/i.test(part))ADJ_RES.forEach(([re,mk])=>{part=part.replace(re,(...g)=>{const a=mk(g);if(a&&a.value>0)adjs.push(a);return " "})});
    // a written date comes out first so its numbers aren't read as the amount
    const dm=parseDayMonth(part);if(dm)part=part.replace(dm[1]," ");
    const m=part.match(AMT_RE);if(!m)continue;
    let amount=parseAmountToken(m[2],m[3]);if(!amount)continue;
    let date=dm?dm[0]:today();if(!dm&&/yesterday|hôm qua/i.test(part))date=addDays(-1);
    const evm=part.match(/#([\p{L}\d][\p{L}\d_-]*)/u)||part.match(/\b(?:for|at|on|in)\s+(?:the\s+)?([\p{L}\d ]+?\s(?:trip|party|event|weekend|holiday))\b/iu);
    const paidm=part.match(/\b([\p{L}]+)\s+(?:paid|trả)\b/iu);
    const withm=(paidm?part.replace(paidm[0]," "):part).match(/\b(?:with|split with|chia với|chia cho|cùng|với)\s+([^#]+?)(?=\s+(?:at|for|on|in|#)\b|\s*#|\s*$)/i);
    const note=part.replace(m[0]," ").replace(/^\s*\+/,"").replace(paidm?paidm[0]:/$^/,"").replace(/#[\p{L}\d_-]+/gu," ").replace(/(?:\bwith\b|\bsplit with\b|chia với|chia cho|cùng|với).*$/i," ").replace(/\b(yesterday|today|spent|paid|for|on)\b/gi," ").replace(/\s+/g," ").trim()||"Entry";
    const backm=part.match(/^\s*([\p{L}]+)\s+(?:paid|sent|transferred|trả)\s+(me|you|[\p{L}]+)\s+back\b/iu)||part.match(/^\s*(I|me|tôi)\s+(?:paid|sent|trả)\s+([\p{L}]+)\s+back\b/iu);
    if(backm){items.push({type:"settle",from:backm[1],to:backm[2],amount,event:evm?evm[1]:null,date});continue}
    if(withm||/\bsplit\b|chia\b/i.test(part)){
      const names=(withm?withm[1].replace(m[0]," "):"").split(/,|\band\b|&|\s+và\s+/i).map(s=>s.replace(/\s+/g," ").trim()).filter(Boolean);
      items.push({type:"bill",title:note.replace(/^split\s*/i,"")||"Shared bill",subtotal:amount,mode:"equal",people:["me",...names].map(name=>({name})),adjustments:adjs,payers:[{name:paidm&&!/^i$/i.test(paidm[1])?paidm[1]:"me",amount:null}],event:evm?evm[1]:null,category:guessCat(note,false),date});
    }else{
      const income=/^\+|salary|lương|luong|income|received|got paid|bonus|thưởng|refund|hoàn tiền|hoan tien|earned|freelance|nhận tiền|nhan tien|được lì xì|duoc li xi|nhận lì xì|cổ tức|tiền lãi/i.test(part);
      items.push({type:income?"income":"expense",amount,category:guessCat(income?part:note,income),note:note.charAt(0).toUpperCase()+note.slice(1),date});
    }
  }
  return {items,reply:items.length?"":t("I couldn't find an amount in that. Try “coffee 45k” or “dinner 1.2tr with An, Bình #Dalat”.")};
}
