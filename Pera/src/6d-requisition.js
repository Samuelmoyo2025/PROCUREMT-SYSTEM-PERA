/* =====================================================================
   REQUISITION CONTROLS — address book, paying accounts, purchaser, approval steps,
   duplicate and bank-detail checks, requisition PDF
   ===================================================================== */
const ADDR_KIND = {both:'Delivery and distribution', delivery:'Delivery', distribution:'Distribution (invoices & documents)'};
const addrList = () => S().addresses || (S().delivery_address ? [{id:'addr-main', name:'Main office', lines:S().delivery_address, kind:'both', active:true, def_delivery:true, def_distribution:true}] : []);
const addrFor = kind => addrList().filter(a=>a.active && (a.kind==='both' || a.kind===kind));
const addrDefault = kind => { const l = addrFor(kind); return l.find(a=>kind==='delivery'?a.def_delivery:a.def_distribution) || l[0] || null; };
const addrText = a => a ? a.name+'\n'+a.lines : '';
const payAccts = () => S().pay_accounts || [];
const acctLabel = a => a ? a.name+' · '+a.currency+(a.account_no?' · …'+String(a.account_no).replace(/\D/g,'').slice(-4):'') : '';
const purchasers = () => Store.all('app_users').filter(u=>u.active && ['procurement','admin'].includes(u.role));
const RQ_CLOSED = ['paid','rejected','withdrawn'];

/* ---------- possible duplicates: same amount, and the same or a similar supplier / payee / name, within 45 days ---------- */
const normName = s => String(s||'').toLowerCase().replace(/\b(pvt|private|ltd|limited|t\/a|inc|co|the)\b/g,'').replace(/[^a-z0-9]/g,'');
function similarity(a, b){
  a = normName(a); b = normName(b);
  if (!a || !b) return 0; if (a===b) return 1;
  const m = a.length, n = b.length; if (Math.abs(m-n) > Math.max(m,n)*0.3) return 0;
  let prev = Array.from({length:n+1},(_,j)=>j);
  for (let i=1;i<=m;i++){ const cur=[i]; for (let j=1;j<=n;j++) cur[j]=Math.min(prev[j]+1, cur[j-1]+1, prev[j-1]+(a[i-1]===b[j-1]?0:1)); prev=cur; }
  return 1 - prev[n]/Math.max(m,n);
}
function findDuplicates(d){
  const base = toBase(d.currency, d.total); if (!base) return [];
  const when = new Date(d.submitted_at || d.created_at || nowISO()).getTime();
  const who = x => x.supplier_id ? Store.supName(x.supplier_id) : (x.payee||'');
  return Store.all('requisitions')
    .filter(r=>r.id!==d.id && !['draft','withdrawn','rejected'].includes(r.status) && (r.kind==='expense')===(d.kind==='expense'))
    .filter(r=>Math.abs(new Date(r.submitted_at||r.created_at).getTime() - when) <= 45*864e5)
    .filter(r=>Math.abs(toBase(r.currency,r.total) - base) <= Math.max(0.01, base*0.02))
    .map(r=>{ const why = [];
      if (d.supplier_id && d.supplier_id===r.supplier_id) why.push('same supplier');
      else { const p = similarity(who(d), who(r)); if (p>=0.8) why.push(p===1?'same payee':'similar payee'); }
      const t = similarity(d.title, r.title); if (t>=0.8) why.push(t===1?'same name':'similar name');
      return {r, why}; })
    .filter(x=>x.why.length)
    .map(x=>({r:x.r, why:x.why.concat(['same amount'])}));
}
const dupGap = (a, b) => { const m = Math.round(Math.abs(new Date(a.submitted_at||a.created_at)-new Date(b.submitted_at||b.created_at||nowISO()))/6e4); return m<60 ? m+' minute'+(m===1?'':'s') : m<2880 ? Math.round(m/60)+' hours' : Math.round(m/1440)+' days'; };
const dupListHTML = (list, d) => list.map(x=>`<li><button class="link mono" data-open="${x.r.kind==='expense'?'expense':'requisition'}:${x.r.id}">${esc(x.r.number)}</button> ${esc(x.r.title)} · ${fmtMoney(x.r.currency,x.r.total)} · ${esc(STAGE[reqStage(x.r)]?STAGE[reqStage(x.r)][0]:x.r.status)} — <i>${esc(x.why.join(', '))}</i>, ${dupGap(x.r,d)} apart</li>`).join('');

/* ---------- bank details typed into a justification ---------- */
const BANK_WORDS = /\b(acc(?:oun)?t\s*(?:no|num(?:ber)?|#)|a\/c\s*(?:no)?|iban|swift|bic|branch\s*code|sort\s*code|routing\s*(?:no|number)|bank\s*:)/i;
const bankDigits = t => (String(t||'').match(/\d(?:[\s-]?\d){8,}/g)||[]).map(s=>s.replace(/\D/g,'')).filter(s=>s.length>=9 && s.length<=20);
function bankCheck(text, supplierId, payee){
  if (!BANK_WORDS.test(String(text||''))) return null;
  const nums = bankDigits(text), s = Store.sup(supplierId), onFile = s ? bankDigits(s.bank_details) : [];
  const tail = n => '…'+n.slice(-4);
  if (s && nums.length && onFile.length && !nums.every(n=>onFile.includes(n)))
    return {tone:'red', text:`<b>Bank details in the justification don’t match ${esc(s.name)}’s verified record</b> (notes say ${nums.map(tail).join(', ')}; the supplier record says ${onFile.map(tail).join(', ')}). Pay only to the verified record. If the supplier really changed banks, update the supplier record so Finance is alerted and confirms the change.`};
  if (s) return {tone:'blue', text:`The justification mentions bank details. Pera pays ${esc(s.name)} only to the bank details on its supplier record${onFile.length?' (…'+onFile[0].slice(-4)+')':' — which has none yet, so add them there'}.`};
  return {tone:'amber', text:`<b>Bank details for ${esc(payee||'this payee')} are only typed into the justification</b>, so nobody has verified them. Add the payee as a supplier: bank details on a supplier record are checked, and any change alerts Finance.`};
}

/* ---------- sample data for the demo company ---------- */
function demoReqData(){
  if (LIVE || S()._p2) return;
  const hq = S().delivery_address || 'Head office';
  S().addresses = [
    {id:'addr-hq', name:'Northgate House (head office)', lines:hq, kind:'delivery', active:true, def_delivery:true},
    {id:'addr-ap', name:'Accounts Payable', lines:'Finance Department, '+hq+' · ap@northgate.example', kind:'distribution', active:true, def_distribution:true},
    {id:'addr-byo', name:'Bulawayo branch', lines:'14 Fife Street, Bulawayo', kind:'both', active:true}];
  S().pay_accounts = [
    {id:'pa-usd', name:'USD Nostro FCA', bank:'CBZ Bank', account_no:'0112 3456 7890', currency:'USD', gl_code:'1010', active:true},
    {id:'pa-zwg', name:'ZWG Current Account', bank:'CBZ Bank', account_no:'0198 7654 3210', currency:'ZWG', gl_code:'1020', active:true},
    {id:'pa-petty', name:'Petty cash – head office', bank:'', account_no:'', currency:'USD', gl_code:'1050', active:true}];
  S().default_purchaser_id = 'u-proc';
  const large = (S().approval_tiers||[]).find(t=>t.label==='Large');
  if (large && Store.byId('app_users','u-cfo')){ Object.assign(large, {step_label:'Executive', approver_ids:['u-ceo','u-coo'], required:1, next_steps:[{label:'Finance sign-off', approver_ids:['u-cfo'], required:1}]}); }
  Store.all('requisitions').forEach(r=>{ if (r.kind==='purchase' && r.status!=='draft' && !r.purchaser_id) r.purchaser_id='u-proc'; if (!r.pay_from_id && r.kind!=='purchase' && r.currency==='USD') r.pay_from_id='pa-usd'; });
  /* two near-identical payment requests a minute apart, with bank details typed into the notes */
  const tpl = Store.all('requisitions').find(r=>r.status==='pending' && r.kind!=='expense' && (r.approver_ids||[]).length);
  if (tpl){
    const at = new Date(Date.now()-3*36e5);
    const mk = (title, mins) => { const t = new Date(at.getTime()+mins*6e4).toISOString();
      return Object.assign(JSON.parse(JSON.stringify(tpl)), {id:uid(), number:Store.nextNumber('requisitions','R-'), title, kind:'payment', supplier_id:null, contract_id:null, payee:title, purchaser_id:null, pay_from_id:'pa-usd',
        description:'Commission payment as per agreement.\n\nBank: FBC\nBranch: Belgravia\nBranch Code: 8104\nAccount Number: 222 750 807 0147',
        lines:[{description:'Commission payment', qty:1, unit_price:881.81}], total:881.81, currency:'USD', created_at:t, submitted_at:t, approvals:[], decided_at:null}); };
    const a = mk('HUJEEN INVESTMENTS', 0); Store.data.requisitions.push(a);
    const b = mk('HUJEEN IVESTMENTS', 1); Store.data.requisitions.push(b);
    [a,b].forEach(r=>Store.data.audit_log.push({id:uid(), entity_type:'requisition', entity_id:r.id, entity_number:r.number, action:'Submitted for approval', details:r.tier_label+' tier', user_id:r.created_by, user_name:Store.user(r.created_by).name, at:r.submitted_at}));
  }
  S()._p2 = 1; Store.persist();
}
const _seed2 = Store.seed;
Store.seed = async function(){ const r = await _seed2.apply(this, arguments); demoReqData(); return r; };
const _init2 = Store.init;
Store.init = async function(){ const ok = await _init2.apply(this, arguments); if (ok && this.me) demoReqData(); return ok; };

Object.assign(App, {
  /* approvals panel: one block per step; a pool shows "any N of M" and who is still needed */
  approvalStagesHTML(r){
    const st = stagesOf(r), cur = ['pending','pending_approval'].includes(r.status) ? currentStage(r) : -1, waiting = ['pending','pending_approval'].includes(r.status);
    return st.map((s,i)=>{
      const v = stageVotes(r,i), done = v.yes>=v.needed, pool = v.needed < s.ids.length;
      const state = v.no && r.status==='rejected' ? ['Rejected','t-red'] : done ? ['Approved','t-green'] : i===cur ? ['Pending','t-amber'] : waiting ? ['Waiting','t-grey'] : ['Not reached','t-grey'];
      const rule = pool ? 'Any '+v.needed+' of '+s.ids.length : s.ids.length>1 ? 'All '+s.ids.length+' must approve' : '';
      const head = st.length>1 || pool ? `<div class="stage-h"><div><b>${st.length>1?'Step '+(i+1)+' · ':''}${esc(s.label)}</b>${rule?`<span>${rule}</span>`:''}</div>${pill(...state)}</div>` : '';
      const rows = s.ids.map(id=>{ const x = Store.user(id), a = (r.approvals||[]).find(y=>y.approver_id===id && (y.stage||0)===i);
        const stamp = a ? `<span class="stamp ${a.decision==='approved'?'t-green':'t-red'}">${a.decision}</span>` : done ? '<span class="stamp t-grey">Not needed</span>' : i===cur ? '<span class="stamp t-amber">Pending</span>' : waiting ? '<span class="stamp t-grey">Waiting</span>' : '<span class="stamp t-grey">—</span>';
        return `<div class="approver">${avatarHTML(x)}<div class="t"><b>${esc(x.name)}</b><span>${esc(x.title||'')}${a?' · '+fmtDT(a.at):''}${a&&a.by_name?' · by '+esc(a.by_name)+' (delegate)':(!a&&delegActive(x)?' · delegated to '+esc(Store.user(x.delegate_to).name)+(x.delegate_until?' until '+fmtDate(x.delegate_until):''):'')}</span>${a&&a.comment?`<q>${esc(a.comment)}</q>`:''}</div>${stamp}</div>`; }).join('');
      return `<div class="stage ${i===cur?'now':''} ${st.length>1||pool?'boxed':''}">${head}${rows}</div>`;
    }).join('');
  },
  routeText(t, creator){
    const rt = routeFor(t, creator);
    if (!rt.stages.length) return 'nobody other than you — an administrator must add an approver';
    return rt.stages.map((s,i)=>`${rt.stages.length>1?'Step '+(i+1)+' '+esc(s.label)+': ':''}${s.required<s.ids.length?'any '+s.required+' of':s.ids.length>1?'all of':''} ${s.ids.map(a=>esc(Store.user(a).name)).join(', ')}`).join(' → ');
  },
  /* requisition warnings shown on the detail page */
  reqWarnings(r){
    const out = [], B = (tone, text) => `<div class="banner ${tone}"><span class="grow">${text}</span></div>`;
    if (['pending','review','approved'].includes(r.status) && can.seeAll(me())){
      const d = findDuplicates(r);
      if (d.length) out.push(B('amber', `<b>Possible duplicate.</b> Check before ${r.status==='approved'?'paying':'approving'}:<ul class="dup-list">${dupListHTML(d, r)}</ul>${r.dup_note?`<span class="muted">Requester’s note: “${esc(r.dup_note)}”</span>`:''}`));
    }
    if (r.status!=='paid'){ const b = bankCheck(r.description, r.supplier_id, r.payee); if (b) out.push(B(b.tone, b.text)); }
    return out.join('');
  },
  printReq(r){
    const old = document.title; document.title = r.number+' – '+r.title;
    const done = () => { document.title = old; window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    Store.log(r.kind==='expense'?'expense':'requisition', r, 'Printed / saved as PDF', '');
    setTimeout(()=>window.print(), 50);
  },

  /* ---------- Manage company: addresses and paying accounts ---------- */
  companyAddresses(){
    const list = addrList(), t = this.curTab('coa','active');
    const rows = list.filter(a=>t==='active'?a.active:!a.active);
    return panel('Addresses', btn('Add address','data-act="addr-new"','sm primary','plus'),
      `${this.tabs('coa',[['active','Active'],['inactive','Inactive']],k=>list.filter(a=>k==='active'?a.active:!a.active).length)}
      <p class="faint" style="margin:0;padding:10px 18px 0;font-size:12.5px"><b>Delivery</b> addresses are where goods go. <b>Distribution</b> addresses are where invoices and documents are sent. Requisitions and purchase orders pick from this list.</p>
      ${tableHTML([
        {h:'Name',cls:'name',v:a=>`${esc(a.name)}${a.def_delivery?' '+pill('Default delivery','t-blue'):''}${a.def_distribution?' '+pill('Default distribution','t-blue'):''}`},
        {h:'Address',v:a=>`<span style="white-space:pre-line">${esc(a.lines)}</span>`},
        {h:'Used for',v:a=>esc(ADDR_KIND[a.kind]||a.kind)},
        {h:'Actions',r:1,v:a=>ibtn('edit','Edit',`data-act="addr-edit" data-id="${a.id}"`)+ibtn('power',a.active?'Deactivate':'Reactivate',`data-act="addr-toggle" data-id="${a.id}"`)}
      ], rows, {empty:'No addresses yet.'})}`);
  },
  companyAccounts(){
    const list = payAccts();
    return panel('Paying accounts', btn('Add account','data-act="acct-new"','sm primary','plus'),
      `<p class="faint" style="margin:0;padding:10px 18px 0;font-size:12.5px">The company’s own bank, FCA and petty-cash accounts. Requisitions say which one pays, Finance confirms it when recording the payment, and it goes on the payment file — instead of setting accounts up as “items”.</p>
      ${tableHTML([
        {h:'Account',cls:'name',v:a=>`${esc(a.name)}<small>${esc(a.bank||'')}</small>`},
        {h:'Currency',v:a=>esc(a.currency)},{h:'Account number',cls:'mono',v:a=>esc(a.account_no||'—')},{h:'GL code',cls:'mono',v:a=>esc(a.gl_code||'—')},
        {h:'Status',v:a=>pill(a.active?'Active':'Inactive',a.active?'t-green':'t-grey')},
        {h:'Actions',r:1,v:a=>ibtn('edit','Edit',`data-act="acct-edit" data-id="${a.id}"`)+ibtn('power',a.active?'Deactivate':'Reactivate',`data-act="acct-toggle" data-id="${a.id}"`)}
      ], list, {empty:'No paying accounts yet.'})}`);
  },
  addrForm(a){
    formModal({title:a?'Edit address':'Add address', values:a||{kind:'both', active:true},
      fields:[{k:'name',label:'Name',req:1,ph:'e.g. Head office, Accounts Payable'},{k:'kind',label:'Used for',type:'select',blank:false,options:Object.entries(ADDR_KIND)},{k:'lines',label:'Address',type:'textarea',req:1},
        {k:'def_delivery',label:'Default delivery address',type:'bool'},{k:'def_distribution',label:'Default distribution address',type:'bool'}],
      onSave: async v=>{
        if (v.def_delivery && v.kind==='distribution') throw new Error('A distribution-only address can’t be the default delivery address.');
        if (v.def_distribution && v.kind==='delivery') throw new Error('A delivery-only address can’t be the default distribution address.');
        const list = addrList().map(x=>Object.assign({},x));
        if (v.def_delivery) list.forEach(x=>x.def_delivery=false);
        if (v.def_distribution) list.forEach(x=>x.def_distribution=false);
        if (a) Object.assign(list.find(x=>x.id===a.id), v); else list.push(Object.assign({id:'addr-'+uid().slice(0,8), active:true}, v));
        const dd = list.find(x=>x.active && x.def_delivery);
        await Store.saveSettings({addresses:list, delivery_address:dd?dd.lines:S().delivery_address});
        await Store.log('settings',{id:'addresses',number:'Addresses'},a?'Address updated':'Address added',v.name);
        return 'Address saved'; }});
  },
  acctForm(a){
    formModal({title:a?'Edit paying account':'Add paying account', values:a||{currency:baseCur(), active:true},
      fields:[{k:'name',label:'Account name',req:1,ph:'e.g. USD Nostro FCA'},{k:'bank',label:'Bank'},{k:'account_no',label:'Account number'},{k:'currency',label:'Currency',type:'select',blank:false,options:(S().currencies||[]).map(c=>[c.code,c.code])},{k:'gl_code',label:'GL / ledger code'}],
      onSave: async v=>{
        const list = payAccts().map(x=>Object.assign({},x));
        if (list.some(x=>x.name.toLowerCase()===v.name.toLowerCase() && (!a || x.id!==a.id))) throw new Error('There is already an account called '+v.name+'.');
        if (a) Object.assign(list.find(x=>x.id===a.id), v); else list.push(Object.assign({id:'pa-'+uid().slice(0,8), active:true}, v));
        await Store.saveSettings({pay_accounts:list});
        await Store.log('settings',{id:'pay-accounts',number:'Paying accounts'},a?'Paying account updated':'Paying account added',v.name+' · '+v.currency);
        return 'Account saved'; }});
  }
});

Object.assign(ACT, {
  'req-print':()=>App.printReq(Store.byId('requisitions',App.param)),
  'purchaser-set':()=>{ const r = Store.byId('requisitions',App.param);
    formModal({title:'Purchaser for '+esc(r.number), narrow:true, values:{purchaser_id:r.purchaser_id||''},
      intro:'<p class="muted" style="margin:0 0 8px">The buyer in Procurement who sources this requisition and raises its purchase order. They are notified.</p>',
      fields:[{k:'purchaser_id',label:'Purchaser',type:'select',blank:'Not assigned',options:purchasers().map(u=>[u.id,u.name+(u.title?' – '+u.title:'')])}],
      onSave: async v=>{ const id = v.purchaser_id||null; if (id===(r.purchaser_id||null)) return false;
        await Store.update('requisitions', r.id, {purchaser_id:id});
        await Store.log('requisition', r, id?'Purchaser assigned':'Purchaser removed', id?Store.user(id).name+(r.purchaser_id?' (was '+Store.user(r.purchaser_id).name+')':''):'');
        if (id && id!==me().id) await Store.notify([id],'requisition',r,'You are the purchaser for '+r.number+' – '+r.title);
        return id?'Purchaser assigned':'Purchaser removed'; }}); },
  'step-add':(t)=>{ ACT._readTiers(); const tier = S().approval_tiers[+t.dataset.i]; tier.next_steps = (tier.next_steps||[]).concat([{label:'Step '+((tier.next_steps||[]).length+2), approver_ids:[], required:1}]); App.render(); },
  'step-del':(t)=>{ ACT._readTiers(); const tier = S().approval_tiers[+t.dataset.i]; (tier.next_steps||[]).pop(); App.render(); },
  _readTiers:()=>{ S().approval_tiers = (S().approval_tiers||[]).map((t,i)=>({label:$('#t-label-'+i).value.trim()||'Tier '+(i+1), max:$('#t-max-'+i).value===''?null:+$('#t-max-'+i).value,
    step_label:($('#t-slabel-'+i)||{value:''}).value.trim()||'Approval', approver_ids:$$('.t-ap-'+i+':checked').map(x=>x.value), required:Math.max(1,+$('#t-req-'+i).value||1),
    next_steps:(t.next_steps||[]).map((s,j)=>({label:$('#t-slabel-'+i+'-'+j).value.trim()||'Step '+(j+2), approver_ids:$$('.t-ap-'+i+'-'+j+':checked').map(x=>x.value), required:Math.max(1,+$('#t-req-'+i+'-'+j).value||1)}))})); },
  'addr-new':()=>App.addrForm(), 'addr-edit':(t)=>App.addrForm(addrList().find(a=>a.id===t.dataset.id)),
  'addr-toggle': async (t)=>{ const list = addrList().map(x=>Object.assign({},x)), a = list.find(x=>x.id===t.dataset.id); a.active = !a.active; if (!a.active){ a.def_delivery=false; a.def_distribution=false; }
    await Store.saveSettings({addresses:list}); await Store.log('settings',{id:'addresses',number:'Addresses'},a.active?'Address reactivated':'Address deactivated',a.name); App.render(); },
  'acct-new':()=>App.acctForm(), 'acct-edit':(t)=>App.acctForm(payAccts().find(a=>a.id===t.dataset.id)),
  'acct-toggle': async (t)=>{ const list = payAccts().map(x=>Object.assign({},x)), a = list.find(x=>x.id===t.dataset.id); a.active = !a.active;
    await Store.saveSettings({pay_accounts:list}); await Store.log('settings',{id:'pay-accounts',number:'Paying accounts'},a.active?'Paying account reactivated':'Paying account deactivated',a.name); App.render(); },
  /* submitting a saved draft from its page: same duplicate check as the form */
  'req-submit': async ()=>{ const r = Store.byId('requisitions',App.param), d = findDuplicates(r);
    if (!d.length){ if (await App.reqSubmit(r)){ App.render(); App.toast('Submitted — approvers notified'); } return; }
    formModal({title:'Possible duplicate', save:'Submit anyway',
      intro:`<div class="note warn">${esc(r.number)} looks like ${d.length===1?'a requisition that is':'requisitions that are'} already in the system:<ul class="dup-list">${dupListHTML(d, r)}</ul></div>`,
      fields:[{k:'why',label:'Why this is not a duplicate',type:'textarea',req:1,help:'Approvers will see this.'}],
      onSave: async v=>{ await Store.update('requisitions', r.id, {dup_note:v.why}); await Store.log('requisition', r, 'Possible duplicate acknowledged', d.map(x=>x.r.number).join(', ')+' — '+v.why);
        if (!(await App.reqSubmit(Store.byId('requisitions',r.id), {skipDup:true}))) return false; return 'Submitted — approvers notified'; }}); }
});

document.addEventListener('input', e=>{ if (e.target.id==='rf-desc' || e.target.id==='rf-payee' || e.target.id==='rf-title') App.reqPreview && App.reqPreview(); });
document.addEventListener('change', e=>{
  if (e.target.id==='po-addr-pick'){ const a = addrList().find(x=>x.id===e.target.value); if (a) $('#po-addr').value = a.name+', '+a.lines.replace(/\n/g,', '); }
});
