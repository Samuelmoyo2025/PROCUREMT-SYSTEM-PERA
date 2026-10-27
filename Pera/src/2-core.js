(function(){
'use strict';
const LIVE = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const TABLES = ['app_users','suppliers','categories','items','budgets','plan_lines','requisitions','rfqs','bids','purchase_orders','receipts','invoices','contracts','requests','comments','stock_moves','audit_log','notifications'];
const TOUCH = ['suppliers','categories','items','budgets','contracts','requests','app_users'];
const $ = (s,el=document)=>el.querySelector(s);
const $$ = (s,el=document)=>[...el.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-'+Date.now().toString(36)+Math.random().toString(36).slice(2));
const nowISO = () => new Date().toISOString();
const todayStr = () => { const d=new Date(); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
const addDays = (s,n) => { const d=new Date((s||todayStr())+'T00:00:00'); d.setDate(d.getDate()+n); return d.toISOString().slice(0,10); };
const daysBetween = (a,b) => Math.round((new Date(b+'T00:00:00')-new Date(a+'T00:00:00'))/864e5);
const num = v => Number(v||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtMoney = (cur,v) => (cur||'')+' '+num(v);
const fmtK = v => Math.abs(v)>=1e6 ? (v/1e6).toFixed(1)+'M' : Math.abs(v)>=1e3 ? (v/1e3).toFixed(1)+'k' : Math.round(v)+'';
const fmtDate = d => d ? new Date(String(d).length===10? d+'T00:00:00' : d).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : '—';
const fmtDT = d => d ? new Date(d).toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
const fmtSize = b => b>1048576 ? (b/1048576).toFixed(1)+' MB' : Math.max(1,Math.round((b||0)/1024))+' KB';
const initials = n => String(n||'?').split(/\s+/).filter(Boolean).slice(0,2).map(w=>w[0]).join('').toUpperCase();
const sum = (arr,f) => arr.reduce((s,x)=>s+(+f(x)||0),0);
const round2 = v => Math.round((+v||0)*100)/100;

const ROLE_LABEL = {requisitioner:'Requisitioner',approver:'Approver (executive)',procurement:'Procurement officer',finance:'Finance / accounts payable',admin:'Administrator',supplier:'Supplier (portal)'};
const PAY_METHODS = ['Bank transfer','Cheque','Cash / petty cash','Mobile money','Card'];
const REQ_KIND = {purchase:'Purchase (goods or services via PO)', payment:'Direct payment (no PO — fees, petty cash, claims, refunds)'};
const REQUEST_TYPES = ['Goods from stores','Service or repair','IT support','Facilities','Transport','Other'];
const PRIORITIES = ['Low','Normal','High','Urgent'];
const RECURRENCE = {none:'Does not repeat', weekly:'Every week', monthly:'Every month', quarterly:'Every quarter'};
const SUP_CATS_DEFAULT = ['Manufacturer','Distributor / wholesaler','Service provider','Contractor','Consultant'];
const ESG_TAGS = ['Local supplier','SME','Women-owned','Youth-owned','Environmental certification','Disability-inclusive'];
const DOC_TYPES = ['Company registration','Tax clearance certificate','Bank confirmation letter','Trading licence','Insurance certificate','Health & safety certificate'];
const CONTRACT_TYPES = ['Framework agreement','Service contract','Supply contract','Lease','Consultancy'];
const METHODS = ['Direct purchase','Request for quotation (RFQ)','Open tender','Framework call-off'];

/* ---------- icons ---------- */
const I = {
  dash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/></svg>',
  plan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4M7 14h4M7 17h7"/></svg>',
  budget:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v18M17 7H9.5a3 3 0 0 0 0 6h5a3 3 0 0 1 0 6H6"/></svg>',
  req:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/></svg>',
  check:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/></svg>',
  rfq:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/></svg>',
  po:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 4h2l2.5 11h10L20 7H6.2"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/></svg>',
  grn:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m8.5 12 2.5 2.5 4.5-5"/></svg>',
  inv:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6"/></svg>',
  pay:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="6" width="19" height="12" rx="2"/><path d="M2.5 10h19M6 15h4"/></svg>',
  sup:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 21V9l6-4v4l6-4v4l6-4v16z"/><path d="M8 17h2M14 17h2"/></svg>',
  contract:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h9l4 4v14H6z"/><path d="M9 12h6M9 16h3M14 17c1-2 2 1 3-1"/></svg>',
  item:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="m12 3 8 4.5v9L12 21l-8-4.5v-9z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/></svg>',
  cat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h10"/></svg>',
  report:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
  audit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3 4 6v6c0 4.5 3.4 8 8 9 4.6-1 8-4.5 8-9V6z"/><path d="M9 12l2 2 4-4"/></svg>',
  cog:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
  portal:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="14" rx="2"/><path d="M8 21h8M12 18v3M7 9h5M7 12h10"/></svg>',
  filter:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 5h18l-7 8v6l-4 2v-8z"/></svg>',
  copy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/></svg>',
  edit:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="m13.5 6.5 4 4"/></svg>',
  trash:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
  power:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v8M6.3 6.3a8 8 0 1 0 11.4 0"/></svg>',
  star:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>',
  starOn:'<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="m12 3 2.8 5.8 6.2.9-4.5 4.4 1 6.2L12 17.4 6.5 20.3l1-6.2L3 9.7l6.2-.9z"/></svg>',
  box:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4M12 11v10M7.5 5l9 4"/></svg>',
  next:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 6 6 6-6 6"/></svg>',
  chev:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m6 9 6 6 6-6"/></svg>',
  chat:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H9l-5 4z"/></svg>',
  receipt:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 3h12v18l-2-1.5L14 21l-2-1.5L10 21l-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  inbox:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 13l3-8h12l3 8v6H3z"/><path d="M3 13h5l1 3h6l1-3h5"/></svg>',
  help:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6V14M12 17.5v.5"/></svg>',
  branch:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 21V8l8-5 8 5v13"/><path d="M9 21v-6h6v6"/></svg>',
  scan:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M7 12h10"/></svg>',
  plus:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M12 5v14M5 12h14"/></svg>',
  bell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  menu:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h16"/></svg>',
  x:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  up:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg>',
  down:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 4v12M7 11l5 5 5-5M4 20h16"/></svg>',
  back:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 6l-6 6 6 6"/></svg>',
  eye:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
  print:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M7 9V3h10v6M7 17H4v-7h16v7h-3"/><rect x="7" y="14" width="10" height="7"/></svg>'
};
const HP_LOGO = (()=>{ let n=0; return ()=>{ n++; return '<svg viewBox="12 6 80 84" aria-hidden="true"><defs><linearGradient id="hpg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFAC31"/><stop offset="1" stop-color="#E8680C"/></linearGradient></defs><g fill="url(#hpg)"><path d="M61 12 Q61 9 64 10.5 L85 22 Q87 23 87 26 L87 64 Q87 67 85 68 L64 83.5 Q61 85.5 61 82 Z"/><path d="M17 12 Q17 9 20 9.5 C27 10.5 32 13 32 20 L32 38 L64 38 C73 38 78 40.5 76.5 43.5 C75.5 45 73 45.5 71 46 C58 50 35 58 17 71 Z"/><path d="M17 86 C30 78 46 68 58 60.5 C53 67 50 72 49 79 L49 84 C40 91 26 91 17 86 Z"/></g></svg>'.replace(/hpg/g,'hpg'+n); }; })();
/* Pera product mark: a rounded tile in the brand colour with a "P" whose bowl closes like an approval tick */
const LOGO = () => '<svg class="pera-mark" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="var(--accent)"/><path d="M23 47V17h11.5a9.5 9.5 0 0 1 0 19H29" fill="none" stroke="var(--accent-ink)" stroke-width="6.5" stroke-linecap="round" stroke-linejoin="round"/><path d="M34 44.5l4.5 4.5 9-10" fill="none" stroke="var(--accent-ink)" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round" opacity=".85"/></svg>';
const brandInfo = () => Object.assign({}, CONFIG.BRAND||{}, (typeof Store!=='undefined' && Store.settings && Store.settings.brand) || {});
const brandMark = () => { const b = brandInfo(); return b.logo ? `<img class="client-logo" src="${esc(b.logo)}" alt="${esc(b.client||'')}">` : LOGO(); };
const WORDMARK = sub => `<div class="wordmark">${brandInfo().logo?brandMark():''}${LOGO()}<div><b>Pera</b><small>${sub}</small></div></div>`;
/* per-client brand colour: re-derives the accent family from one hex colour */
function applyBrand(){
  const st = document.documentElement.style, c = (brandInfo().color||'').trim();
  const props = ['--accent','--accent-2','--accent-soft','--accent-ink'];
  if (!/^#[0-9a-f]{6}$/i.test(c)){ props.forEach(p=>st.removeProperty(p)); return; }
  const rgb = [1,3,5].map(k=>parseInt(c.slice(k,k+2),16));
  const hex = a => '#'+a.map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
  const lum = (0.2126*rgb[0]+0.7152*rgb[1]+0.0722*rgb[2])/255;
  const dark = document.documentElement.dataset.theme==='dark' || (document.documentElement.dataset.theme!=='light' && window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches);
  st.setProperty('--accent', c);
  st.setProperty('--accent-2', hex(rgb.map(v=>v*0.85)));
  st.setProperty('--accent-soft', dark ? hex(rgb.map(v=>v*0.25+25*0.75)) : hex(rgb.map(v=>v*0.12+255*0.88)));
  st.setProperty('--accent-ink', lum > 0.58 ? '#16191F' : '#FFFFFF');
}

/* ---------- demo file storage (IndexedDB with memory fallback) ---------- */
const memFiles = new Map();
let idb = null;
function openIDB(){
  return new Promise(res=>{
    // Some locked-down browsers never answer indexedDB.open; fall back to memory after 1.5 s instead of hanging.
    const t = setTimeout(res, 1500);
    const done = ()=>{ clearTimeout(t); res(); };
    try{
      const r = indexedDB.open('pera-files',1);
      r.onupgradeneeded = ()=> r.result.createObjectStore('files');
      r.onsuccess = ()=>{ idb = r.result; done(); };
      r.onerror = done;
      r.onblocked = done;
    }catch(e){ done(); }
  });
}
async function sha256Of(blob){
  try{ if (!(window.crypto && crypto.subtle)) return ''; const h = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()); return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join(''); }
  catch(e){ return ''; }
}
function idbPut(key,blob){
  memFiles.set(key,blob);
  return new Promise(res=>{
    if(!idb) return res();
    const t = setTimeout(res, 1500);                       // never let a stalled browser store block the app
    const done = ()=>{ clearTimeout(t); res(); };
    try{ const tx = idb.transaction('files','readwrite'); tx.objectStore('files').put(blob,key); tx.oncomplete=done; tx.onerror=done; tx.onabort=done; }catch(e){ done(); }
  });
}
function idbGet(key){
  if(memFiles.has(key)) return Promise.resolve(memFiles.get(key));
  return new Promise(res=>{
    if(!idb) return res(null);
    const t = setTimeout(()=>res(null), 1500);
    try{ const r = idb.transaction('files').objectStore('files').get(key); r.onsuccess=()=>{ clearTimeout(t); res(r.result||null); }; r.onerror=()=>{ clearTimeout(t); res(null); }; }catch(e){ clearTimeout(t); res(null); }
  });
}
function makePdf(title, lines){
  const safe = s => String(s).replace(/[^\x20-\x7E]/g,'-').replace(/([()\\])/g,'\\$1');
  const body = ['BT /F2 16 Tf 50 790 Td ('+safe(title)+') Tj ET','BT /F1 11 Tf 50 760 Td 16 TL'].concat(lines.map(l=>'('+safe(l)+') Tj T*')).concat(['ET']).join('\n');
  const objs = ['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R /F2 6 0 R >> >> /Contents 4 0 R >>',
    '<< /Length '+body.length+' >>\nstream\n'+body+'\nendstream','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  let out = '%PDF-1.4\n'; const offs = [];
  objs.forEach((o,i)=>{ offs.push(out.length); out += (i+1)+' 0 obj\n'+o+'\nendobj\n'; });
  const x = out.length;
  out += 'xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+offs.map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  out += 'trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R >>\nstartxref\n'+x+'\n%%EOF';
  return new Blob([out],{type:'application/pdf'});
}

/* ---------- business rules ---------- */
const S = () => Store.settings;
const baseCur = () => S().base_currency || 'USD';
const rateOf = cur => { const c=(S().currencies||[]).find(c=>c.code===cur); return c && +c.rate ? +c.rate : 1; };
const toBase = (cur,v) => (+v||0)/rateOf(cur);
function pickTier(currency, total){
  const base = toBase(currency,total);
  const tiers = (S().approval_tiers||[]).slice().sort((a,b)=>(a.max==null?Infinity:+a.max)-(b.max==null?Infinity:+b.max));
  return tiers.find(t=>t.max==null || t.max==='' || base<=+t.max) || tiers[tiers.length-1] || {label:'Default',approver_ids:[],required:1};
}
/* approval steps: a record either has `stages` (step 1, then step 2…, each "any N of these people")
   or, like every PO, contract and older requisition, one step made of approver_ids + approvals_required */
function stagesOf(r){
  if (r.stages && r.stages.length) return r.stages;
  const ids = r.approver_ids||[];
  return [{label:r.tier_label||'Approval', ids, required:Math.min(+r.approvals_required||ids.length, ids.length)}];
}
function stageVotes(r, i){
  const s = stagesOf(r)[i], v = (r.approvals||[]).filter(a=>(a.stage||0)===i && s.ids.includes(a.approver_id));
  return {s, yes:v.filter(a=>a.decision==='approved').length, no:v.filter(a=>a.decision==='rejected').length, needed:Math.min(+s.required||s.ids.length, s.ids.length)};
}
/* index of the step now waiting for decisions, or -1 once every step is complete */
function currentStage(r){ const st = stagesOf(r); for (let i=0;i<st.length;i++){ const v=stageVotes(r,i); if (v.yes < v.needed) return i; } return -1; }
function outcome(req){
  const st = stagesOf(req);
  if (!st.length || !st[0].ids.length) return 'pending';
  const veto = (S().reject_rule||'veto')==='veto';
  for (let i=0;i<st.length;i++){ const v=stageVotes(req,i); if ((veto && v.no>0) || v.no > v.s.ids.length - v.needed) return 'rejected'; }
  return currentStage(req)===-1 ? 'approved' : 'pending';
}
/* the approval route a requisition gets on submission: the tier's first step, then any further steps; the requester is never in it */
function routeFor(tier, creator){
  const raw = [{label:tier.step_label||'Approval', approver_ids:tier.approver_ids||[], required:tier.required}].concat(tier.next_steps||[]);
  const stages = raw.map(s=>{ const ids=(s.approver_ids||[]).filter(a=>a!==creator); return {label:s.label||'Approval', ids, required:Math.min(Math.max(1,+s.required||1), ids.length)}; }).filter(s=>s.ids.length);
  return {stages, multi:(tier.next_steps||[]).length>0, ids:[...new Set(stages.flatMap(s=>s.ids))], required:sum(stages,s=>s.required)};
}
const linesTotal = lines => round2(sum(lines||[], l=>(+l.qty||0)*(+l.unit_price||0)));
const usersWhere = f => Store.all('app_users').filter(u=>u.active && f(u)).map(u=>u.id);
const FLOW = {
  requisitions:{ type:r=>r.kind==='expense'?'expense':'requisition', approved:()=>S().review_enabled?'review':'approved', released:()=>'approved' },
  purchase_orders:{ type:()=>'po', approved:()=>S().review_enabled?'review':'issued', released:()=>'issued' },
  contracts:{ type:()=>'contract', approved:()=>'active', released:()=>'active' }
};
async function afterApproval(table, rec){
  const type = FLOW[table].type(rec);
  if (rec.status==='review'){
    await Store.log(type, rec, 'Fully approved', 'Sent to Finance for review before release');
    await Store.notify(usersWhere(u=>u.role==='finance'), type, rec, rec.number+' is approved and needs your review before release');
    await Store.notify([rec.created_by], type, rec, rec.number+' is fully approved — waiting for Finance review');
    return;
  }
  await Store.log(type, rec, 'Fully approved', '');
  await afterRelease(table, rec);
}
async function afterRelease(table, rec){
  const type = FLOW[table].type(rec);
  if (table==='requisitions'){
    const direct = rec.kind!=='purchase';
    await Store.log(type, rec, 'Released', direct?'Released to Finance for payment':'Released to Procurement to source and raise a purchase order');
    await Store.notify([rec.created_by, ...usersWhere(u=>direct?u.role==='finance':u.role==='procurement')], type, rec, rec.number+(direct?' is approved and ready for payment':' is approved — ready for sourcing / PO'));
  } else if (table==='purchase_orders'){
    await Store.log('po', rec, 'Purchase order issued', Store.supName(rec.supplier_id)+' · '+fmtMoney(rec.currency,rec.total));
    const r = Store.byId('requisitions', rec.req_id);
    if (r) await Store.log('requisition', r, 'Purchase order issued', rec.number+' to '+Store.supName(rec.supplier_id));
    await Store.notify([rec.created_by, r&&r.created_by, ...usersWhere(u=>u.role==='supplier'&&u.supplier_id===rec.supplier_id)], 'po', rec, 'Purchase order '+rec.number+' issued to '+Store.supName(rec.supplier_id));
  } else if (table==='contracts'){
    await Store.notify([rec.created_by], 'contract', rec, rec.number+' – '+rec.title+' is approved and active');
  }
}

/* =====================================================================
   DATA STORE — demo (localStorage + IndexedDB) or live (Supabase)
   ===================================================================== */
const LS_KEY = 'pera-demo-v1';
const Store = {
  data:{}, settings:{}, me:null,
  async init(){
    if (LIVE) return this.initLive();
    await openIDB();
    let saved=null; try{ saved = JSON.parse(localStorage.getItem(LS_KEY)||'null'); }catch(e){}
    if (saved && saved.version===1){ this.data=saved.data; this.settings=saved.settings; await this.ensureSampleFiles(); this.me=this.byId('app_users',saved.demoUser); }
    else await this.seed();
    for (const t of TABLES) this.data[t] = this.data[t] || [];
    if (!this.me) this.me = this.data.app_users[0];
    return true;
  },
  persist(){ if (LIVE) return; try{ localStorage.setItem(LS_KEY, JSON.stringify({version:1,data:this.data,settings:this.settings,demoUser:this.me&&this.me.id})); }catch(e){} },
  all(t){ return this.data[t]||[]; },
  byId(t,id){ return id ? this.all(t).find(x=>x.id===id) : undefined; },
  user(id){ return this.byId('app_users',id) || {name:'—',role:''}; },
  sup(id){ return this.byId('suppliers',id); },
  supName(id){ const s=this.sup(id); return s? s.name : '—'; },
  catName(id){ const c=this.byId('categories',id); return c? c.name : '—'; },

  async insert(t,obj){
    if (LIVE){ const {data,error}=await this.sb.from(t).insert(obj).select().single(); if(error) throw error; this.data[t].push(data); return data; }
    this.data[t].push(obj); this.persist(); return obj;
  },
  async update(t,id,patch){
    if (TOUCH.includes(t) && !('updated_at' in patch)) patch = Object.assign({}, patch, {updated_at:nowISO()});
    if (LIVE){ const {data,error}=await this.sb.from(t).update(patch).eq('id',id).select().single(); if(error) throw error; const i=this.data[t].findIndex(x=>x.id===id); if(i>-1) this.data[t][i]=data; return data; }
    const o=this.byId(t,id); Object.assign(o,patch); this.persist(); return o;
  },
  async saveSettings(patch){
    const next = Object.assign({}, this.settings, patch);
    if (LIVE){ const {error}=await this.sb.from('settings').update({value:next}).eq('id',1); if(error) throw error; }
    this.settings = next; this.persist();
  },
  async log(type, ent, action, details){
    const row = {id:uid(), entity_type:type, entity_id:ent?ent.id:null, entity_number:ent?(ent.number||ent.name||null):null, action, details:details||'', user_id:this.me.id, user_name:this.me.name, at:nowISO()};
    if (LIVE){ const {error}=await this.sb.from('audit_log').insert(row); if(!error) this.data.audit_log.push(row); else console.warn(error); return; }
    this.data.audit_log.push(row); this.persist();
  },
  async notify(userIds, type, ent, message){
    for (const u of [...new Set(userIds)].filter(Boolean)){
      const row = {id:uid(), user_id:u, entity_type:type, entity_id:ent.id, message, read:false, at:nowISO()};
      if (LIVE){ const {error}=await this.sb.from('notifications').insert(row); if(error) console.warn(error); }
      else this.data.notifications.push(row);
    }
    this.persist();
  },
  nextNumber(t, prefix){
    const n = this.all(t).filter(r=>String(r.number||'').startsWith(prefix)).reduce((m,r)=>Math.max(m, parseInt(String(r.number).slice(prefix.length))||0),0)+1;
    return prefix+String(n).padStart(5,'0');
  },
  async remove(t,id){
    if (LIVE){ const {error}=await this.sb.from(t).delete().eq('id',id); if(error) throw error; }
    this.data[t] = this.all(t).filter(x=>x.id!==id); this.persist();
  },
  async putFile(file, folder, kind){
    const path = folder+'/'+uid().slice(0,8)+'-'+file.name.replace(/[^\w.\-]+/g,'_');
    if (LIVE){ const {error}=await this.sb.storage.from(CONFIG.STORAGE_BUCKET).upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false}); if(error) throw error; }
    else await idbPut(path,file);
    return {id:uid(), path, name:file.name, size:file.size, type:file.type||'', kind:kind||'support', sha256: await sha256Of(file), uploaded_by:this.me.id, uploaded_by_name:this.me.name, at:nowISO()};
  },
  async fileUrl(att){
    if (LIVE){ const {data,error}=await this.sb.storage.from(CONFIG.STORAGE_BUCKET).createSignedUrl(att.path,3600); if(error) throw error; return data.signedUrl; }
    const b = await idbGet(att.path); return b ? URL.createObjectURL(b) : null;
  },
  /* generic approve / reject for requisitions & expenses, purchase orders and contracts */
  async decide(table, rec, decision, comment){
    const F = FLOW[table];
    if (LIVE){
      const {error}=await this.sb.rpc('decide_record',{p_table:table,p_id:rec.id,p_decision:decision,p_comment:comment||''});
      if (error) throw error;
      await this.reloadTables([table,'audit_log','notifications']);
      return this.byId(table,rec.id);
    }
    if (rec.created_by===this.me.id) throw new Error('You cannot approve or reject your own request');
    const principal = actingFor(this.me, rec);
    if (!principal) throw new Error('You are not an approver on this record');
    const p = this.user(principal), onBehalf = principal!==this.me.id, cur = currentStage(rec);
    const approvals = (rec.approvals||[]).concat([Object.assign({approver_id:principal, approver_name:p.name, decision, comment:comment||'', at:nowISO(), stage:Math.max(0,cur)}, onBehalf?{by_id:this.me.id, by_name:this.me.name}:{})]);
    const res = outcome(Object.assign({},rec,{approvals}));
    const status = res==='approved' ? F.approved(rec) : res==='rejected' ? 'rejected' : rec.status;
    const patch = {approvals, status}; if (res!=='pending') patch.decided_at = nowISO();
    await this.update(table, rec.id, patch);
    const type = F.type(rec), label = rec.number+' – '+(rec.title||Store.supName(rec.supplier_id));
    await this.log(type, rec, (decision==='approved'?'Approved':'Rejected')+(onBehalf?' on behalf of '+p.name:''), comment?'“'+comment+'”':'');
    await this.notify([rec.created_by], type, rec, this.me.name+' '+decision+' '+label);
    if (res==='pending' && rec.stages && rec.stages.length){
      const nr = this.byId(table,rec.id), next = currentStage(nr);
      if (next > cur){ const s = stagesOf(nr)[next];
        await this.log(type, nr, 'Step '+(cur+1)+' approved', 'Sent to step '+(next+1)+' – '+s.label+': '+s.ids.map(a=>this.user(a).name).join(', '));
        await this.notify(withDelegates(s.ids), type, nr, label+' ('+fmtMoney(rec.currency,rec.total)+') needs your approval – step '+(next+1)+' of '+stagesOf(nr).length); }
    }
    if (res==='approved') await afterApproval(table, this.byId(table,rec.id));
    else if (res==='rejected'){
      await this.log(type, rec, 'Rejected (final)', 'Rejected by '+this.me.name);
      await this.notify((rec.approver_ids||[]).filter(a=>a!==this.me.id), type, rec, rec.number+' was rejected — no further action needed');
    }
    return this.byId(table,rec.id);
  },
  /* finance review step after approval */
  async review(table, rec, ok, note){
    if (LIVE){
      const {error}=await this.sb.rpc('review_record',{p_table:table,p_id:rec.id,p_ok:ok,p_note:note||''});
      if (error) throw error;
      await this.reloadTables([table,'audit_log','notifications']);
      return this.byId(table,rec.id);
    }
    const F = FLOW[table], type = F.type(rec);
    const status = ok ? F.released(rec) : 'rejected';
    await this.update(table, rec.id, {status, reviewed_by:this.me.id, reviewed_by_name:this.me.name, reviewed_at:nowISO(), review_note:note||''});
    await this.log(type, rec, ok?'Reviewed and released':'Returned by review', note||'');
    const r2 = this.byId(table, rec.id);
    if (ok) await afterRelease(table, r2);
    else await this.notify([rec.created_by], type, rec, rec.number+' was returned by '+this.me.name+' at review: '+(note||''));
    return r2;
  },

  /* ----- live mode ----- */
  async initLive(){
    this.sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
    const {data:{session}} = await this.sb.auth.getSession();
    if (!session) return false;
    await this.reloadAll(session.user.email);
    if (!this.me){ try{ const {data:added}=await this.sb.rpc('provision_me'); if (added) await this.reloadAll(session.user.email); }catch(e){ console.warn(e); } }
    try{ const {data:made}=await this.sb.rpc('run_schedules'); if (made) await this.reloadTables(['requests','notifications']); }catch(e){ console.warn(e); }
    if (!this.me){ await this.sb.auth.signOut(); throw new Error('Your login ('+session.user.email+') is not set up as a Pera user. Ask an administrator to add you under Settings → Users.'); }
    this.sb.channel('pera').on('postgres_changes',{event:'*',schema:'public'},()=>{ clearTimeout(this._t); this._t=setTimeout(async()=>{ await this.reloadAll(); App.render(); },500); }).subscribe();
    return true;
  },
  async reloadTables(list){
    for (const t of list){ const {data,error}=await this.sb.from(t).select('*').limit(20000); if(error) throw error; this.data[t]=data||[]; }
  },
  async reloadAll(email){
    await this.reloadTables(TABLES);
    const {data}=await this.sb.from('settings').select('value').eq('id',1).single();
    this.settings=(data&&data.value)||{};
    const em=(email||(this.me&&this.me.email)||'').toLowerCase();
    this.me=this.data.app_users.find(u=>(u.email||'').toLowerCase()===em && u.active);
  },

  async ensureSampleFiles(){
    const each = async a => { if (a && a.sample && !(await idbGet(a.path))) await idbPut(a.path, makePdf(a.sample.title, a.sample.lines)); };
    for (const t of ['requisitions','rfqs','bids','receipts','invoices','contracts','requests']) for (const r of this.all(t)) for (const a of (r.attachments||[])) await each(a);
    for (const s of this.all('suppliers')) for (const d of (s.documents||[])) await each(d.file);
  }
};
