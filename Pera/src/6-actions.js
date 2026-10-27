/* =====================================================================
   MODALS & FORMS
   ===================================================================== */
const M = {
  open(html, narrow){
    this.close();
    const o = document.createElement('div'); o.className='overlay'; o.id='overlay';
    o.innerHTML = `<div class="modal ${narrow?'narrow':''}" role="dialog" aria-modal="true">${html}</div>`;
    document.body.appendChild(o);
    o.addEventListener('mousedown',e=>{ if(e.target===o) this.close(); });
    const f = o.querySelector('.modal-b input:not([type=checkbox]):not([type=file]),.modal-b select,.modal-b textarea'); f && f.focus();
    return o;
  },
  close(){ const o=$('#overlay'); if(o) o.remove(); (this._blobs||[]).forEach(u=>URL.revokeObjectURL(u)); this._blobs=[]; },
  head(title){ return `<div class="modal-h"><h2>${title}</h2><button class="icon-btn" data-close aria-label="Close">${I.x}</button></div>`; },
  err(msg){ const e=$('#m-err'); if(e){ e.hidden=!msg; e.textContent=msg||''; } },
  busy(on){ $$('.modal-f .btn').forEach(b=>b.disabled=on); }
};
function fieldHTML(f, v){
  const id = 'fm-'+f.k, val = v==null ? '' : v;
  let inp;
  switch(f.type){
    case 'textarea': inp=`<textarea id="${id}">${esc(val)}</textarea>`; break;
    case 'select': inp=`<select id="${id}">${f.blank!==false?`<option value="">${esc(f.blank||'—')}</option>`:''}${f.options.map(([k,l])=>`<option value="${esc(k)}" ${String(k)===String(val)?'selected':''}>${esc(l)}</option>`).join('')}</select>`; break;
    case 'checks': inp=`<div class="checks" id="${id}">${f.options.map(([k,l])=>`<label class="chk"><input type="checkbox" value="${esc(k)}" ${(val||[]).includes(k)?'checked':''}> ${esc(l)}</label>`).join('')}</div>`; break;
    case 'bool': return `<label class="chk ${f.span?'span-all':''}"><input type="checkbox" id="${id}" ${val?'checked':''}> ${esc(f.label)}</label>`;
    case 'files': return `<div class="span-all"><b>${esc(f.label)}</b>${f.req?' <span style="color:var(--red)">*</span>':''}${f.help?`<p class="faint" style="margin:2px 0 8px;font-size:12.5px">${esc(f.help)}</p>`:''}<label class="drop" id="${id}-drop" for="${id}" style="margin-top:6px">Drop files here or <u>browse</u><input id="${id}" type="file" multiple></label><div class="files" id="${id}-list" style="margin-top:8px"></div></div>`;
    default: inp=`<input id="${id}" type="${f.type||'text'}" ${f.step?`step="${f.step}"`:''} value="${esc(val)}" ${f.ph?`placeholder="${esc(f.ph)}"`:''}>`;
  }
  return `<label class="f ${f.span==='all'||f.type==='textarea'||f.type==='checks'?'span-all':f.span?'span-2':''}" for="${id}">${esc(f.label)}${f.req?' <span class="req">*</span>':''}${f.help?`<span class="help">${esc(f.help)}</span>`:''}${inp}</label>`;
}
function readFields(fields){
  const o = {};
  for (const f of fields){
    const el = $('#fm-'+f.k); if (!el || f.type==='files') continue;
    if (f.type==='checks') o[f.k] = $$('input:checked',el).map(x=>x.value);
    else if (f.type==='bool') o[f.k] = el.checked;
    else if (f.type==='number') o[f.k] = el.value==='' ? null : +el.value;
    else o[f.k] = el.value.trim();
  }
  return o;
}
const fileBins = {};
function wireFiles(id){
  fileBins[id] = [];
  const input = $('#'+id), drop = $('#'+id+'-drop'), list = $('#'+id+'-list');
  if (!input) return;
  const draw = () => { list.innerHTML = fileBins[id].map((f,i)=>`<div class="file"><span class="ft">${esc(f.name.split('.').pop().slice(0,4).toUpperCase())}</span><div class="fn"><b>${esc(f.name)}</b><span>${fmtSize(f.size)} · ready to upload</span></div><button type="button" class="btn sm ghost" data-rmfile="${id}:${i}" aria-label="Remove">${I.x}</button></div>`).join(''); };
  fileBins[id]._draw = draw;
  input.addEventListener('change',e=>{ fileBins[id].push(...e.target.files); e.target.value=''; draw(); });
  ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
  ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
  drop.addEventListener('drop',e=>{ fileBins[id].push(...e.dataTransfer.files); draw(); });
}
function formModal(o){
  M.open(`${M.head(o.title)}<div class="modal-b">${o.intro||''}<div class="grid-form">${o.fields.map(f=>fieldHTML(f,(o.values||{})[f.k])).join('')}</div>${o.extra||''}<div class="err" id="m-err" hidden></div></div>
    <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" id="fm-save">${esc(o.save||'Save')}</button></div>`, o.narrow!==false);
  o.fields.filter(f=>f.type==='files').forEach(f=>wireFiles('fm-'+f.k));
  $('#fm-save').addEventListener('click', async ()=>{
    const v = readFields(o.fields);
    const miss = o.fields.filter(f=>f.req && f.type!=='files' && (v[f.k]==null || v[f.k]==='' || (Array.isArray(v[f.k])&&!v[f.k].length)));
    const missF = o.fields.filter(f=>f.req && f.type==='files' && !(fileBins['fm-'+f.k]||[]).length);
    if (miss.length||missF.length) return M.err('Fill in '+miss.concat(missF).map(f=>f.label.toLowerCase()).join(', ')+'.');
    const files = {}; o.fields.filter(f=>f.type==='files').forEach(f=>files[f.k]=fileBins['fm-'+f.k]||[]);
    M.busy(true);
    try{ const msg = await o.onSave(v, files); M.close(); App.render(); if (msg!==false) App.toast(msg||'Saved'); }
    catch(e){ console.error(e); M.err(e.message||String(e)); M.busy(false); }
  });
}
const opt = (t, f) => Store.all(t).filter(f||(()=>true)).sort((a,b)=>(a.name||a.number||'').localeCompare(b.name||b.number||'')).map(x=>[x.id, x.code?x.code+' – '+x.name:(x.name||x.number)]);

/* ---------- line editor (requisitions, POs, RFQs) ---------- */
const Ed = {
  lines:[], priced:true, cur:()=>'USD', onChange:null,
  html(){ return `<div class="tw"><table class="lines"><thead><tr><th style="width:52%">Description</th><th class="r">Qty</th>${this.priced?'<th class="r">Unit price</th><th class="r">Amount</th>':''}<th></th></tr></thead><tbody id="lines-body"></tbody>
    <tfoot><tr><td>${btn('Add line','type="button" data-act="line-add"','sm','plus')}</td><td></td>${this.priced?'<td class="r">Total</td><td class="r num" id="lines-total"></td>':''}<td></td></tr></tfoot></table></div>
    <datalist id="item-list">${Store.all('items').filter(i=>i.active).map(i=>`<option value="${esc(i.name)}">`).join('')}</datalist>`; },
  draw(){
    const b = $('#lines-body'); if (!b) return;
    b.innerHTML = this.lines.map((l,i)=>`<tr><td><input list="item-list" type="text" data-line="${i}" data-k="description" value="${esc(l.description)}" aria-label="Line ${i+1} description" placeholder="Item or service"></td>
      <td><input type="number" min="0" step="any" data-line="${i}" data-k="qty" value="${l.qty}" style="width:86px;text-align:right" aria-label="Quantity"></td>
      ${this.priced?`<td><input type="number" min="0" step="0.01" data-line="${i}" data-k="unit_price" value="${l.unit_price}" style="width:120px;text-align:right" aria-label="Unit price"></td><td class="r num" data-amt="${i}"></td>`:''}
      <td>${this.lines.length>1?`<button type="button" class="btn sm ghost" data-act="line-del" data-i="${i}" aria-label="Remove line">${I.x}</button>`:''}</td></tr>`).join('');
    this.totals();
  },
  totals(){
    if (!this.priced) return;
    this.lines.forEach((l,i)=>{ const c=document.querySelector(`[data-amt="${i}"]`); if(c) c.textContent=num((+l.qty||0)*(+l.unit_price||0)); });
    const t=$('#lines-total'); if (t) t.textContent = fmtMoney(this.cur(), linesTotal(this.lines));
    this.onChange && this.onChange();
  },
  clean(){ return this.lines.map(l=>({description:String(l.description||'').trim(), qty:+l.qty||0, unit_price:round2(l.unit_price)})).filter(l=>l.description || l.unit_price); }
};

/* ---------- requisition form ---------- */
Object.assign(App, {
  reqForm(existing, preset){
    const base = {title:'', kind:'purchase', description:'', category_id:'', supplier_id:'', budget_id:'', contract_id:'', department:me().department||'', branch_id:me().branch_id||'', currency:baseCur(), payment_method:PAY_METHODS[0], due_date:'', payee:'', expense_date:'', lines:[{description:'',qty:1,unit_price:0}], attachments:[]};
    const r = existing || Object.assign(base, preset||{});
    const exp = r.kind==='expense';
    this._reqEdit = existing || null; this._reqPreset = preset || null; this._reqKind = r.kind;
    const supList = Store.all('suppliers').filter(s=>!S().approved_suppliers_only || s.status==='approved' || s.id===r.supplier_id).sort((a,b)=>a.name.localeCompare(b.name));
    Ed.lines = JSON.parse(JSON.stringify(r.lines)); Ed.priced = true; Ed.cur = () => ($('#rf-cur')||{}).value || baseCur(); Ed.onChange = () => this.reqPreview();
    const staff = Store.all('app_users').filter(x=>x.active && x.role!=='supplier');
    M.open(`${M.head(existing?'Edit '+esc(r.number):exp?'New expense record':'New requisition')}
      <div class="modal-b">
        ${(preset||{})._scanNote?`<div class="note">${esc(preset._scanNote)}</div>`:''}
        <div class="grid-form">
          <label class="f span-2" for="rf-title">${exp?'Expense name':'Requisition name'} <span class="req">*</span><input id="rf-title" type="text" value="${esc(r.title)}" placeholder="${exp?'e.g. Mileage claim – client visits':'e.g. Q4 internet connectivity – head office'}"></label>
          ${exp?`<input type="hidden" id="rf-kind" value="expense"><label class="f" for="rf-expdate">Expense date <span class="req">*</span><input id="rf-expdate" type="date" value="${r.expense_date||''}"></label>`
            :`<label class="f" for="rf-kind">Type<select id="rf-kind">${Object.entries(REQ_KIND).map(([k,l])=>`<option value="${k}" ${k===r.kind?'selected':''}>${esc(l)}</option>`).join('')}</select></label>`}
          <label class="f" for="rf-cat">Category <span class="req">*</span><select id="rf-cat"><option value="">Select…</option>${catOpts().filter(([id])=>{const c=Store.byId('categories',id);return c.active;}).map(([id,n])=>`<option value="${id}" ${id===r.category_id?'selected':''}>${esc(n)}</option>`).join('')}</select></label>
          <label class="f" for="rf-dept">Department<select id="rf-dept">${(S().departments||[]).map(d=>`<option ${d===r.department?'selected':''}>${esc(d)}</option>`).join('')}</select></label>
          ${(S().branches||[]).length?`<label class="f" for="rf-branch">Branch<select id="rf-branch">${(S().branches||[]).map(b=>`<option value="${b.id}" ${b.id===r.branch_id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`:'<input type="hidden" id="rf-branch" value="">'}
          ${mod('budgets')?`<label class="f" for="rf-budget">Budget line <span class="req">*</span><select id="rf-budget"><option value="">Select…</option>${Store.all('budgets').filter(b=>b.active).map(b=>`<option value="${b.id}" ${b.id===r.budget_id?'selected':''}>${esc(b.code+' – '+b.name)}</option>`).join('')}</select></label>`:'<input type="hidden" id="rf-budget" value="">'}
          ${exp?`<label class="f" for="rf-payee">Payee (reimburse to) <span class="req">*</span><input id="rf-payee" type="text" list="staff-list" value="${esc(r.payee||me().name)}"><datalist id="staff-list">${staff.map(x=>`<option value="${esc(x.name)}">`).join('')}</datalist></label><input type="hidden" id="rf-sup" value=""><input type="hidden" id="rf-ct" value="">`
            :`<label class="f" for="rf-sup">Supplier<select id="rf-sup"><option value="">Not chosen yet / no supplier</option>${supList.map(s=>`<option value="${s.id}" ${s.id===r.supplier_id?'selected':''}>${esc(s.name)}${s.status!=='approved'?' ('+s.status+')':''}</option>`).join('')}</select></label>
          <label class="f" for="rf-payee">Payee if no supplier<input id="rf-payee" type="text" value="${esc(r.payee||'')}" placeholder="e.g. law firm, staff member"></label>
          ${mod('contracts')?`<label class="f" for="rf-ct">Contract<select id="rf-ct"><option value="">None</option>${Store.all('contracts').filter(c=>c.status==='active'&&contractState(c)[0]!=='Expired').map(c=>`<option value="${c.id}" ${c.id===r.contract_id?'selected':''}>${esc(c.number+' – '+c.title)}</option>`).join('')}</select></label>`:'<input type="hidden" id="rf-ct" value="">'}`}
          <label class="f" for="rf-cur">Currency<select id="rf-cur">${(S().currencies||[{code:'USD'}]).map(c=>`<option ${c.code===r.currency?'selected':''}>${esc(c.code)}</option>`).join('')}</select></label>
          <label class="f" for="rf-pm">Payment method<select id="rf-pm">${PAY_METHODS.map(p=>`<option ${p===r.payment_method?'selected':''}>${p}</option>`).join('')}</select></label>
          ${payAccts().some(a=>a.active)?`<label class="f" for="rf-payfrom">Pay from<select id="rf-payfrom"><option value="">Finance decides</option>${payAccts().filter(a=>a.active||a.id===r.pay_from_id).map(a=>`<option value="${a.id}" data-cur="${esc(a.currency)}" ${a.id===(r.pay_from_id||((payAccts().find(x=>x.active&&x.currency===r.currency)||{}).id))?'selected':''}>${esc(acctLabel(a))}</option>`).join('')}</select></label>`:''}
          <label class="f" for="rf-due">${exp?'Reimburse by':'Needed / due by'} <span class="req">*</span><input id="rf-due" type="date" min="${todayStr()}" value="${r.due_date||''}"></label>
          ${exp?'':`${addrFor('delivery').length?`<label class="f span-2" for="rf-deliv">Delivery address<select id="rf-deliv"><option value="">Not needed (services, fees)</option>${addrFor('delivery').map(a=>`<option value="${a.id}" ${a.id===(r.delivery_address_id!==undefined?r.delivery_address_id:(addrDefault('delivery')||{}).id)?'selected':''}>${esc(a.name+' — '+a.lines.split('\n')[0])}</option>`).join('')}</select></label>`:''}
          ${addrFor('distribution').length?`<label class="f span-2" for="rf-dist">Distribution address <span class="help">Where invoices and documents go</span><select id="rf-dist">${addrFor('distribution').map(a=>`<option value="${a.id}" ${a.id===(r.distribution_address_id||(addrDefault('distribution')||{}).id)?'selected':''}>${esc(a.name+' — '+a.lines.split('\n')[0])}</option>`).join('')}</select></label>`:''}`}
          <label class="f span-all" for="rf-desc">${exp?'What was it for?':'Justification'} <span class="req">*</span><textarea id="rf-desc" placeholder="${exp?'Business purpose, who attended, where…':'What is this for, and why is it needed now?'}">${esc(r.description)}</textarea></label>
        </div>
        <div><b>${exp?'Amounts':'Line items'}</b>${Ed.html()}</div>
        <div id="rf-preview"></div>
        <div><b>${exp?'Receipts':'Supporting documents'}</b> ${S().require_documents?'<span style="color:var(--red)">*</span>':''}<p class="faint" style="margin:2px 0 8px;font-size:12.5px">${exp?'A photo or scan of every receipt.':'Quotations, invoices, approvals or anything the approvers need to decide.'} Kept permanently for audit.</p>
          <label class="drop" id="rf-files-drop" for="rf-files">Drop files here or <u>browse</u> · PDF, images, Word, Excel<input id="rf-files" type="file" multiple></label>
          ${(r.attachments||[]).length?`<p class="faint" style="margin:8px 0 0;font-size:12.5px">Already attached: ${r.attachments.map(a=>esc(a.name)).join(', ')}</p>`:''}
          <div class="files" id="rf-files-list" style="margin-top:8px"></div></div>
        <div id="rf-dup"></div>
        <div class="err" id="m-err" hidden></div>
      </div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><span class="grow"></span><button class="btn" data-act="req-save">Save draft</button><button class="btn primary" data-act="req-save-submit">Submit for approval</button></div>`);
    Ed.draw(); wireFiles('rf-files');
    if ((preset||{})._files) { fileBins['rf-files'].push(...preset._files); fileBins['rf-files']._draw(); }
    ['rf-cur','rf-budget','rf-sup','rf-kind'].forEach(id=>{ const el=$('#'+id); el && el.addEventListener('change',()=>{ Ed.totals(); }); });
    $('#rf-cat').addEventListener('change',e=>{ const b=mod('budgets')&&Store.all('budgets').find(x=>x.category_id===e.target.value && x.active); if (b && !$('#rf-budget').value) $('#rf-budget').value=b.id; Ed.totals(); });
    const sup = $('#rf-sup'); if (sup && sup.tagName==='SELECT') sup.addEventListener('change',e=>{ const c=Store.all('contracts').find(x=>x.supplier_id===e.target.value && x.status==='active'); if (c && !$('#rf-ct').value) $('#rf-ct').value=c.id; });
  },
  reqPreview(){
    const box = $('#rf-preview'); if (!box) return;
    const cur = $('#rf-cur').value, total = linesTotal(Ed.lines), base = toBase(cur,total);
    const creator = (this._reqEdit||{}).created_by||me().id, t = pickTier(cur,total), notes = [], rt = routeFor(t, creator);
    notes.push(`<div class="note ${rt.ids.length?'':'warn'}"><b>Approval route:</b> ${esc(t.label)} tier — ${this.routeText(t, creator)}.${rt.multi?' Each step is asked only after the one before it approves.':' All of them are notified.'}${(t.approver_ids||[]).concat(...(t.next_steps||[]).map(s=>s.approver_ids||[])).includes(creator)?' You are left out because nobody approves their own request.':''}</div>`);
    const bc = bankCheck($('#rf-desc').value, $('#rf-sup').value, $('#rf-payee').value);
    if (bc) notes.push(`<div class="note ${bc.tone==='blue'?'':'warn'}">${bc.text}</div>`);
    const pf = $('#rf-payfrom') && payAccts().find(a=>a.id===$('#rf-payfrom').value);
    if (pf && pf.currency!==cur) notes.push(`<div class="note warn">${esc(pf.name)} is a ${esc(pf.currency)} account but this ${this._reqKind==='expense'?'claim':'requisition'} is in ${esc(cur)}.</div>`);
    const b = Store.byId('budgets',$('#rf-budget').value);
    if (b){ const u=budgetUse(b), cur_=this._reqEdit&&['pending','approved'].includes(this._reqEdit.status)?toBase(this._reqEdit.currency,this._reqEdit.total):0; const after=u.available+cur_-base;
      notes.push(`<div class="note ${after<0?'warn':''}"><b>Budget ${esc(b.code)}:</b> ${baseCur()} ${num(u.available+cur_)} available · ${baseCur()} ${num(after)} after this requisition${after<0?(S().budget_control==='block'?' — over budget: submission will be blocked.':' — this will over-commit the budget line.'):''}</div>`); }
    if ($('#rf-kind').value==='purchase' && base > (+S().quotes_threshold||Infinity)) notes.push(`<div class="note">Above ${baseCur()} ${num(S().quotes_threshold)}: attach ${S().quotes_required} competitive quotes, or Procurement will run an RFQ after approval.</div>`);
    const s = Store.sup($('#rf-sup').value);
    if (s && supExpired(s).length) notes.push(`<div class="note warn">${esc(s.name)} has expired compliance documents (${supExpired(s).map(d=>esc(d.type)).join(', ')}).</div>`);
    box.innerHTML = `<div style="display:flex;flex-direction:column;gap:8px">${notes.join('')}</div>`;
  },
  async reqSave(submit){
    const v = id => { const el=$('#'+id); return el ? (el.value||'').trim() : ''; };
    const exp = v('rf-kind')==='expense';
    const lines = Ed.clean(), problems = [];
    if (!v('rf-title')) problems.push(exp?'an expense name':'a requisition name');
    if (submit){
      if (!v('rf-cat')) problems.push('a category');
      if (mod('budgets') && !v('rf-budget')) problems.push('a budget line');
      if (!v('rf-due')) problems.push('a due date');
      if (!v('rf-desc')) problems.push(exp?'what it was for':'a justification');
      if (exp && !v('rf-expdate')) problems.push('the expense date');
      if (exp && v('rf-expdate') > todayStr()) problems.push('an expense date that is not in the future');
      if (exp && !v('rf-payee')) problems.push('who to reimburse');
      if (v('rf-due') && v('rf-due') < todayStr()) problems.push((exp?'a reimburse-by':'a due')+' date that is today or later (it can’t already be past when you submit)');
      if (!lines.length || lines.some(l=>!l.description||l.qty<=0||l.unit_price<=0)) problems.push('at least one line with a description, quantity and price');
      const docs = ((this._reqEdit||{}).attachments||[]).length + fileBins['rf-files'].length;
      if (S().require_documents && !docs) problems.push(exp?'at least one receipt':'at least one supporting document');
      const s = Store.sup(v('rf-sup')); if (s && S().approved_suppliers_only && s.status!=='approved') problems.push('a prequalified supplier ('+s.name+' is '+s.status+')');
      const creator = (this._reqEdit||{}).created_by || me().id;
      if (!routeFor(pickTier(v('rf-cur'),linesTotal(lines)), creator).ids.length) problems.push('an approver other than yourself under Settings (nobody can approve their own request)');
      const bl = Store.byId('budgets', v('rf-budget'));
      if (bl && S().budget_control==='block'){ const bu=budgetUse(bl), mine=this._reqEdit&&['pending','review','approved'].includes(this._reqEdit.status)?toBase(this._reqEdit.currency,this._reqEdit.total):0, after=bu.available+mine-toBase(v('rf-cur'),linesTotal(lines));
        if (after < 0) problems.push('budget headroom on '+bl.code+' (it would be over-committed by '+baseCur()+' '+num(-after)+' and budget control is set to block)'); }
    }
    if (problems.length) return M.err('To '+(submit?'submit':'save')+', add '+problems.join(', ')+'.');
    let dupNote = (this._reqEdit||{}).dup_note || null;
    if (submit){
      const dups = findDuplicates({id:(this._reqEdit||{}).id, kind:v('rf-kind'), supplier_id:v('rf-sup')||null, payee:v('rf-payee'), title:v('rf-title'), currency:v('rf-cur'), total:linesTotal(lines)});
      if (dups.length){
        const ok = $('#rf-dup-ok'), why = v('rf-dup-why');
        if (!ok || !ok.checked || !why){
          if (!ok) $('#rf-dup').innerHTML = `<div class="note warn"><b>This looks like ${dups.length===1?'a requisition':'requisitions'} already in the system:</b><ul class="dup-list">${dupListHTML(dups, {})}</ul>
            <label class="chk" style="margin-top:6px"><input type="checkbox" id="rf-dup-ok"> I have checked — this is not a duplicate</label>
            <label class="f" for="rf-dup-why" style="margin-top:6px">Why it is different <span class="req">*</span><input id="rf-dup-why" type="text" placeholder="e.g. second instalment, different invoice number"></label></div>`;
          $('#rf-dup').scrollIntoView({block:'center'});
          return M.err('Possible duplicate — confirm it below before submitting, or cancel.');
        }
        dupNote = why;
      }
    }
    M.busy(true);
    try{
      const addr = id => { const a = addrList().find(x=>x.id===id); return a ? addrText(a) : null; };
      const base = {title:v('rf-title'), kind:v('rf-kind'), description:v('rf-desc'), category_id:v('rf-cat')||null, supplier_id:v('rf-sup')||null, payee:v('rf-payee'), contract_id:v('rf-ct')||null, budget_id:v('rf-budget')||null, department:v('rf-dept'), branch_id:v('rf-branch')||null, currency:v('rf-cur'), payment_method:v('rf-pm'), due_date:v('rf-due')||null, expense_date:exp?(v('rf-expdate')||null):null, lines, total:linesTotal(lines),
        pay_from_id:v('rf-payfrom')||null, delivery_address_id:exp?null:(v('rf-deliv')||null), delivery_address:exp?null:addr(v('rf-deliv')), distribution_address_id:exp?null:(v('rf-dist')||null), distribution_address:exp?null:addr(v('rf-dist')), dup_note:dupNote};
      const T = exp?'expense':'requisition';
      let r;
      if (this._reqEdit){ r = await Store.update('requisitions', this._reqEdit.id, base); await Store.log(T,r,'Edited','Draft updated'); }
      else {
        const row = Object.assign({id:uid(), created_by:me().id, created_at:nowISO(), status:'draft', approvals:[], attachments:[], payment:null, approver_ids:[], approvals_required:0, tier_label:'', plan_line_id:(this._reqPreset||{}).plan_line_id||null}, base);
        if (!LIVE) row.number = Store.nextNumber('requisitions', exp?'EX-':'R-');
        r = await Store.insert('requisitions', row);
        await Store.log(T,r,'Created',(this._reqPreset||{})._from ? (this._reqPreset._from) : 'Draft saved');
        if (r.plan_line_id){ const pl=Store.byId('plan_lines',r.plan_line_id); if (pl) await Store.update('plan_lines',pl.id,{status:'requisitioned',req_id:r.id}); }
        const rqId = (this._reqPreset||{})._request;
        if (rqId){ const rq=Store.byId('requests',rqId); if (rq){ await Store.update('requests',rq.id,{req_id:r.id}); await Store.log('request',rq,'Converted to requisition',r.number); await Store.notify([rq.created_by],'request',rq,rq.number+' is being bought through requisition '+r.number); } }
      }
      const files = fileBins['rf-files'];
      if (files.length){ const atts=(r.attachments||[]).slice(); for (const f of files) atts.push(await Store.putFile(f,'requisitions/'+r.id,'support')); r = await Store.update('requisitions',r.id,{attachments:atts}); await Store.log(T,r,'Documents uploaded',files.map(f=>f.name).join(', ')); }
      if (submit){
        if (dupNote && dupNote!==(this._reqEdit||{}).dup_note) await Store.log(T, r, 'Possible duplicate acknowledged', dupNote);
        if (!(await this.reqSubmit(r, {skipDup:true}))){ M.close(); this.go('req',r.id); return; }
      }
      M.close(); this.go('req',r.id);
      this.toast(submit?'Submitted — approvers notified':'Draft saved');
    }catch(e){ console.error(e); M.err('Could not save: '+(e.message||e)); M.busy(false); }
  },
  async reqSubmit(r){
    if (S().require_documents && !(r.attachments||[]).length){ this.toast('Attach at least one supporting document before submitting'); return false; }
    if (r.due_date && r.due_date < todayStr()){ this.toast('The due date ('+fmtDate(r.due_date)+') has passed — edit the draft and choose today or a later date'); return false; }
    const t = pickTier(r.currency, r.total), T = r.kind==='expense'?'expense':'requisition';
    const rt = routeFor(t, r.created_by);
    if (!rt.ids.length){ this.toast('Nobody else can approve this - ask an administrator to add another approver to the '+t.label+' tier'); return false; }
    const purchaser = r.purchaser_id || (r.kind==='purchase' ? S().default_purchaser_id||null : null);
    r = await Store.update('requisitions', r.id, {status:'pending', submitted_at:nowISO(), approvals:[], approver_ids:rt.ids, approvals_required:rt.multi?rt.required:rt.stages[0].required, stages:rt.multi?rt.stages:[], tier_label:t.label, purchaser_id:purchaser});
    const first = stagesOf(r)[0];
    await Store.log(T,r,'Submitted for approval', t.label+' tier – '+(rt.multi?stagesOf(r).map((s,i)=>'step '+(i+1)+' '+s.label+': '+s.required+' of '+s.ids.length).join(', ')+'. Notified step 1: ':r.approvals_required+' of '+r.approver_ids.length+' approvals needed. Notified: ')+first.ids.map(a=>Store.user(a).name).join(', '));
    await Store.notify(withDelegates(first.ids),T,r,'New '+(T==='expense'?'expense claim ':'requisition ')+r.number+' – '+r.title+' ('+fmtMoney(r.currency,r.total)+') from '+me().name+' needs your approval'+(rt.multi?' – step 1 of '+stagesOf(r).length:''));
    return true;
  },
  duplicate(r){
    const preset = {title:r.title+' (copy)', kind:r.kind, description:r.description, category_id:r.category_id, supplier_id:r.supplier_id, budget_id:r.budget_id, contract_id:r.contract_id, department:r.department, branch_id:r.branch_id, currency:r.currency, payment_method:r.payment_method, payee:r.payee, lines:r.lines, pay_from_id:r.pay_from_id, delivery_address_id:r.delivery_address_id, distribution_address_id:r.distribution_address_id, _from:'Duplicated from '+r.number};
    this.reqForm(null, preset);
  },

  /* ---------- RFQ ---------- */
  rfqForm(reqId){
    const r = Store.byId('requisitions',reqId);
    const sups = Store.all('suppliers').filter(s=>s.status==='approved').sort((a,b)=>{ const ca=r&&(a.category_ids||[]).includes(r.category_id)?0:1, cb=r&&(b.category_ids||[]).includes(r.category_id)?0:1; return ca-cb||a.name.localeCompare(b.name); });
    Ed.lines = r ? r.lines.map(l=>({description:l.description, qty:l.qty, unit_price:0})) : [{description:'',qty:1,unit_price:0}]; Ed.priced=false; Ed.onChange=null;
    const closing = addDays(todayStr(),7)+'T12:00';
    M.open(`${M.head('New request for quotation')}<div class="modal-b">
      <div class="grid-form">
        <label class="f span-2" for="q-title">Title <span class="req">*</span><input id="q-title" type="text" value="${esc(r?r.title:'')}"></label>
        <label class="f" for="q-req">For requisition<select id="q-req"><option value="">Standalone RFQ</option>${Store.all('requisitions').filter(x=>reqStage(x)==='to_order').map(x=>`<option value="${x.id}" ${r&&r.id===x.id?'selected':''}>${esc(x.number+' – '+x.title)}</option>`).join('')}</select></label>
        <label class="f" for="q-cat">Category<select id="q-cat">${Store.all('categories').map(c=>`<option value="${c.id}" ${r&&r.category_id===c.id?'selected':''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label class="f" for="q-cur">Currency of bids<select id="q-cur">${(S().currencies||[]).map(c=>`<option ${r&&r.currency===c.code?'selected':''}>${esc(c.code)}</option>`).join('')}</select></label>
        <label class="f" for="q-close">Bids close <span class="req">*</span><input id="q-close" type="datetime-local" value="${closing}"></label>
        <label class="f span-all" for="q-desc">Specification & instructions to bidders<textarea id="q-desc">${esc(r?r.description:'')}</textarea></label>
      </div>
      <div><b>Items to quote on</b>${Ed.html()}</div>
      <div class="grid-form">
        <label class="f span-all">Invite suppliers <span class="req">*</span><span class="help">Prequalified suppliers only. Those in this category are listed first. Invited suppliers with portal access are notified.</span><div class="checks" id="q-inv">${sups.map(s=>`<label class="chk"><input type="checkbox" value="${s.id}" ${r&&(s.category_ids||[]).includes(r.category_id)?'checked':''}> ${esc(s.name)}</label>`).join('')}</div></label>
        <label class="f">Price weight %<input id="q-wp" type="number" value="60"></label><label class="f">Delivery weight %<input id="q-wd" type="number" value="20"></label><label class="f">Technical weight %<input id="q-wt" type="number" value="20"></label>
        <label class="chk span-all"><input type="checkbox" id="q-sealed" checked> Sealed bids — amounts stay hidden until the closing time</label>
      </div>
      ${fieldHTML({k:'qfiles',label:'Specification documents',type:'files'})}
      <div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-act="rfq-save">Publish RFQ</button></div>`);
    Ed.draw(); wireFiles('fm-qfiles');
  },
  async rfqSave(){
    const v = id => ($('#'+id).value||'').trim();
    const inv = $$('#q-inv input:checked').map(x=>x.value), lines = Ed.lines.filter(l=>String(l.description).trim()).map(l=>({description:l.description.trim(), qty:+l.qty||1, unit_price:0}));
    const w = [+v('q-wp')||0, +v('q-wd')||0, +v('q-wt')||0];
    if (!v('q-title')||!v('q-close')||!inv.length||!lines.length) return M.err('Add a title, closing time, at least one item and at least one invited supplier.');
    if (w[0]+w[1]+w[2]!==100) return M.err('The three weights must add up to 100%.');
    if (new Date(v('q-close')).toISOString() <= nowISO()) return M.err('The closing time must be in the future.');
    M.busy(true);
    try{
      const row = {id:uid(), title:v('q-title'), description:v('q-desc'), req_id:v('q-req')||null, category_id:v('q-cat'), currency:v('q-cur'), lines, invited_ids:inv, closing_at:new Date(v('q-close')).toISOString(), sealed:$('#q-sealed').checked, criteria:{price:w[0],delivery:w[1],technical:w[2]}, status:'open', created_by:me().id, created_at:nowISO(), attachments:[]};
      if (!LIVE) row.number = Store.nextNumber('rfqs','RFQ-');
      let q = await Store.insert('rfqs',row);
      const files = fileBins['fm-qfiles']; if (files.length){ const a=[]; for (const f of files) a.push(await Store.putFile(f,'rfqs/'+q.id,'support')); q = await Store.update('rfqs',q.id,{attachments:a}); }
      await Store.log('rfq',q,'RFQ published', inv.length+' suppliers invited · closes '+fmtDT(q.closing_at)+(q.sealed?' · sealed':''));
      if (q.req_id){ const r=Store.byId('requisitions',q.req_id); await Store.log('requisition',r,'Sourcing started',q.number+' issued to '+inv.length+' suppliers'); }
      await Store.notify(Store.all('app_users').filter(u=>u.role==='supplier'&&inv.includes(u.supplier_id)).map(u=>u.id),'rfq',q,'You are invited to quote on '+q.number+' – '+q.title+' (closes '+fmtDT(q.closing_at)+')');
      M.close(); this.go('rfq',q.id); this.toast('RFQ published');
    }catch(e){ M.err(e.message||String(e)); M.busy(false); }
  },
  bidForm(q, supplierId){
    const existing = supplierId ? Store.all('bids').find(b=>b.rfq_id===q.id&&b.supplier_id===supplierId) : null;
    const choices = (q.invited_ids||[]).filter(id=>!bidsFor(q).some(b=>b.supplier_id===id));
    formModal({title:(existing?'Revise quote':'Quote')+' · '+q.number, narrow:true,
      intro:`<p class="muted" style="margin:0">${esc(q.title)}<br>${q.lines.map(l=>esc(l.qty+' × '+l.description)).join('<br>')}<br>Closes ${fmtDT(q.closing_at)}${q.sealed?' · sealed until closing':''}</p>`,
      fields:[...(supplierId?[]:[{k:'supplier_id',label:'Supplier',type:'select',req:1,options:choices.map(id=>[id,Store.supName(id)])}]),
        {k:'amount',label:'Total price ('+q.currency+')',type:'number',step:'0.01',req:1},{k:'delivery_days',label:'Delivery (days)',type:'number',req:1},{k:'validity_days',label:'Quote valid for (days)',type:'number'},
        {k:'notes',label:'Notes',type:'textarea'},{k:'files',label:'Quotation document',type:'files',req:1}],
      values:existing||{validity_days:30}, save:existing?'Replace quote':'Submit quote',
      onSave: async (v, files) => {
        if (q.closing_at <= nowISO()) throw new Error('Bidding has closed.');
        const sid = supplierId || v.supplier_id;
        const atts = []; for (const f of files.files) atts.push(await Store.putFile(f,'bids/'+q.id,'support'));
        const row = {rfq_id:q.id, supplier_id:sid, amount:round2(v.amount), currency:q.currency, delivery_days:+v.delivery_days, validity_days:+v.validity_days||30, notes:v.notes, technical_score:0, submitted_at:nowISO(), submitted_by:me().id, attachments:atts};
        if (existing) await Store.update('bids',existing.id,row); else await Store.insert('bids',Object.assign({id:uid()},row));
        await Store.log('rfq',q,existing?'Bid revised':'Bid received',Store.supName(sid)+(q.sealed?' (sealed)':' · '+fmtMoney(q.currency,row.amount)));
        await Store.notify([q.created_by],'rfq',q,Store.supName(sid)+' submitted a quote on '+q.number);
        return existing?'Quote replaced':'Quote submitted';
      }});
  },

  /* ---------- purchase order ---------- */
  poForm(reqId, existing){
    const r = Store.byId('requisitions', existing?existing.req_id:reqId); const q = rfqFor(r); const bid = q && Store.byId('bids',q.awarded_bid_id);
    const factor = bid ? bid.amount / (r.total||bid.amount) : 1;
    Ed.lines = existing ? JSON.parse(JSON.stringify(existing.lines)) : r.lines.map(l=>({description:l.description, qty:l.qty, unit_price:round2(l.unit_price*factor)})); Ed.priced=true; Ed.cur=()=>($('#po-cur')||{}).value||r.currency; Ed.onChange=null;
    const e = existing || {};
    const supId = e.supplier_id || (bid ? bid.supplier_id : r.supplier_id);
    const pa = S().po_approval||{};
    this._poEdit = existing || null;
    M.open(`${M.head((existing?'Edit '+esc(existing.number):'New purchase order')+' · '+esc(r.number))}<div class="modal-b">
      ${bid&&!existing?`<div class="note">From ${esc(q.number)} award: ${esc(Store.supName(bid.supplier_id))} at ${fmtMoney(bid.currency,bid.amount)}. Line prices are pro-rated from the bid — adjust if the quote itemises differently.</div>`:''}
      <div class="note">${pa.enabled?`After you submit, ${esc((pa.approver_ids||[]).map(a=>Store.user(a).name).join(', ')||'the PO approvers')} approve${S().review_enabled?' and Finance reviews':''} the PO before it is issued to the supplier.`:S().review_enabled?'After you submit, Finance reviews the PO before it is issued.':'The PO is issued to the supplier as soon as you submit it.'}</div>
      <div class="grid-form">
        <label class="f" for="po-sup">Supplier <span class="req">*</span><select id="po-sup"><option value="">Select…</option>${Store.all('suppliers').filter(s=>s.status==='approved').sort((a,b)=>a.name.localeCompare(b.name)).map(s=>`<option value="${s.id}" ${s.id===supId?'selected':''}>${esc(s.name)}</option>`).join('')}</select></label>
        <label class="f" for="po-cur">Currency<select id="po-cur">${(S().currencies||[]).map(c=>`<option ${c.code===(e.currency||(bid?bid.currency:r.currency))?'selected':''}>${esc(c.code)}</option>`).join('')}</select></label>
        <label class="f" for="po-date">Deliver by <span class="req">*</span><input id="po-date" type="date" value="${e.delivery_date||(r.due_date&&r.due_date>todayStr()?r.due_date:addDays(todayStr(),14))}"></label>
        <label class="f" for="po-ct">Contract<select id="po-ct"><option value="">None</option>${Store.all('contracts').filter(c=>c.status==='active'&&contractState(c)[0]!=='Expired').map(c=>`<option value="${c.id}" ${c.id===(e.contract_id||r.contract_id)?'selected':''}>${esc(c.number+' – '+c.title)}</option>`).join('')}</select></label>
        ${addrFor('delivery').length?`<label class="f" for="po-addr-pick">Choose a saved address<select id="po-addr-pick"><option value="">—</option>${addrFor('delivery').map(a=>`<option value="${a.id}" ${!e.delivery_address&&a.id===r.delivery_address_id?'selected':''}>${esc(a.name)}</option>`).join('')}</select></label>`:''}
        <label class="f span-2" for="po-addr">Delivery address<input id="po-addr" type="text" value="${esc(e.delivery_address||(r.delivery_address?r.delivery_address.replace(/\n/g,', '):'')||S().delivery_address||'')}"></label>
      </div>
      <div><b>Order lines</b>${Ed.html()}</div>
      <label class="f" for="po-terms">Terms<textarea id="po-terms">${esc(e.terms||S().po_terms||'')}</textarea></label>
      <div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><span class="grow"></span><button class="btn" data-act="po-save" data-mode="draft" data-id="${r.id}">Save draft</button><button class="btn primary" data-act="po-save" data-mode="submit" data-id="${r.id}">${pa.enabled?'Submit for approval':S().review_enabled?'Submit for review':'Issue purchase order'}</button></div>`);
    Ed.draw(); $('#po-cur').addEventListener('change',()=>Ed.totals());
  },
  async poSave(reqId, mode){
    const r = Store.byId('requisitions',reqId), v = id => ($('#'+id).value||'').trim(), lines = Ed.clean();
    if (!v('po-sup')||!v('po-date')||!lines.length||lines.some(l=>l.qty<=0)) return M.err('Choose a supplier and delivery date, and add at least one line with a quantity.');
    const total = linesTotal(lines), approvedBase = toBase(r.currency,r.total), poBase = toBase(v('po-cur'),total);
    if (poBase > approvedBase*(1+(+S().match_tolerance_pct||0)/100)+0.01) return M.err(`The order (${baseCur()} ${num(poBase)}) is more than the approved amount (${baseCur()} ${num(approvedBase)}). Raise a new requisition for the difference.`);
    M.busy(true);
    try{
      const q = rfqFor(r);
      const data = {req_id:r.id, rfq_id:q&&q.status==='awarded'?q.id:null, contract_id:v('po-ct')||null, supplier_id:v('po-sup'), currency:v('po-cur'), lines, total, delivery_date:v('po-date'), delivery_address:v('po-addr'), terms:v('po-terms'), branch_id:r.branch_id||null};
      let p;
      if (this._poEdit){ p = await Store.update('purchase_orders', this._poEdit.id, data); await Store.log('po',p,'Draft edited',''); }
      else {
        const row = Object.assign({id:uid(), status:'draft', created_by:me().id, created_at:nowISO(), approvals:[], approver_ids:[], approvals_required:0}, data);
        if (!LIVE) row.number = Store.nextNumber('purchase_orders','PO-');
        p = await Store.insert('purchase_orders',row);
        await Store.log('po',p,'Draft saved',Store.supName(p.supplier_id)+' · '+fmtMoney(p.currency,p.total));
        await Store.log('requisition',r,'Purchase order drafted',p.number);
      }
      if (!r.supplier_id || r.supplier_id!==p.supplier_id) await Store.update('requisitions',r.id,{supplier_id:p.supplier_id});
      if (mode==='submit') await this.poSubmit(p);
      M.close(); this.go('po',p.id); this.toast(mode==='submit'?'Purchase order '+p.number+' submitted':'Draft saved');
    }catch(e){ console.error(e); M.err(e.message||String(e)); M.busy(false); }
  },
  async poSubmit(p){
    const pa = S().po_approval||{};
    const pids = approversExcluding(pa.approver_ids, p.created_by);
    if (pa.enabled && (pa.approver_ids||[]).length && !pids.length){ this.toast('You are the only PO approver - another approver is needed (nobody approves their own PO)'); return p; }
    if (pa.enabled && pids.length){
      p = await Store.update('purchase_orders',p.id,{status:'pending_approval', submitted_at:nowISO(), approvals:[], approver_ids:pids, approvals_required:Math.min(+pa.required||1, pids.length)});
      await Store.log('po',p,'Submitted for approval','Approvers: '+p.approver_ids.map(a=>Store.user(a).name).join(', '));
      await Store.notify(withDelegates(p.approver_ids),'po',p,'Purchase order '+p.number+' ('+Store.supName(p.supplier_id)+', '+fmtMoney(p.currency,p.total)+') needs your approval');
    } else if (S().review_enabled){
      p = await Store.update('purchase_orders',p.id,{status:'review', submitted_at:nowISO()});
      await Store.log('po',p,'Submitted for review','');
      await Store.notify(usersWhere(u=>u.role==='finance'),'po',p,'Purchase order '+p.number+' needs your review before it is issued');
    } else {
      p = await Store.update('purchase_orders',p.id,{status:'issued', submitted_at:nowISO()});
      await afterRelease('purchase_orders', p);
    }
    return p;
  },
  newPoPicker(){
    const list = Store.all('requisitions').filter(r=>inBranch(r)&&['to_order','sourcing'].includes(reqStage(r)));
    M.open(`${M.head('Create purchase order')}<div class="modal-b"><p class="muted" style="margin:0">A purchase order is raised from an approved purchase requisition. Choose one:</p>
      ${list.length?`<div class="list">${list.map(r=>`<button class="li" data-act="po-new" data-id="${r.id}"><div class="t"><b>${esc(r.title)}</b><span class="mono">${esc(r.number)} · ${esc(Store.user(r.created_by).name)}</span></div><span class="num">${fmtMoney(r.currency,r.total)}</span></button>`).join('')}</div>`:'<div class="empty">No approved requisitions are waiting for a purchase order.</div>'}</div>`, true);
  },

  /* ---------- goods received ---------- */
  grnForm(p){
    const got = p.lines.map((l,i)=>sum(receiptsFor(p),g=>(g.lines[i]||{}).received));
    M.open(`${M.head('Goods received · '+esc(p.number))}<div class="modal-b">
      <p class="muted" style="margin:0">${esc(Store.supName(p.supplier_id))} · expected ${fmtDate(p.delivery_date)}</p>
      <div class="tw"><table class="lines"><thead><tr><th>Item</th><th class="r">Ordered</th><th class="r">Already received</th><th class="r">Received now</th></tr></thead><tbody>
        ${p.lines.map((l,i)=>`<tr><td>${esc(l.description)}</td><td class="r num">${l.qty}</td><td class="r num">${got[i]}</td><td class="r"><input type="number" min="0" step="any" id="g-q-${i}" value="${Math.max(0,l.qty-got[i])}" style="width:100px;text-align:right" aria-label="Received now"></td></tr>`).join('')}</tbody></table></div>
      <div class="grid-form">
        ${fieldHTML({k:'g_date',label:'Date received',type:'date',req:1},todayStr())}
        ${fieldHTML({k:'g_cond',label:'Condition',type:'select',blank:false,options:[['Good','Good'],['Damaged','Some items damaged'],['Short','Short delivered']]},'Good')}
        ${fieldHTML({k:'g_notes',label:'Notes',type:'textarea'})}
        ${fieldHTML({k:'g_files',label:'Delivery note / proof of service',type:'files'})}
      </div>
      <div><b>Rate this delivery</b> <span class="faint">(feeds the supplier’s performance record)</span><div class="grid-form" style="margin-top:8px">
        ${['quality','timeliness','service'].map(k=>fieldHTML({k:'rv_'+k,label:k[0].toUpperCase()+k.slice(1),type:'select',blank:'Not rated',options:[[5,'5 – Excellent'],[4,'4 – Good'],[3,'3 – Acceptable'],[2,'2 – Poor'],[1,'1 – Unacceptable']]})).join('')}
        ${fieldHTML({k:'rv_comment',label:'Comment',type:'text',span:'all'})}</div></div>
      <div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-act="grn-save" data-id="${p.id}">Confirm receipt</button></div>`);
    wireFiles('fm-g_files');
  },
  async grnSave(p){
    const qty = p.lines.map((l,i)=>+($('#g-q-'+i).value)||0);
    if (!qty.some(x=>x>0)) return M.err('Enter the quantity received for at least one line.');
    const got = p.lines.map((l,i)=>sum(receiptsFor(p),g=>(g.lines[i]||{}).received));
    if (p.lines.some((l,i)=>got[i]+qty[i] > l.qty*1.0001)) return M.err('You can’t receive more than was ordered. Record extra items on a new PO.');
    M.busy(true);
    try{
      const atts=[]; for (const f of fileBins['fm-g_files']) atts.push(await Store.putFile(f,'receipts/'+p.id,'support'));
      const row = {id:uid(), po_id:p.id, lines:p.lines.map((l,i)=>({description:l.description, ordered:l.qty, received:qty[i]})), received_on:$('#fm-g_date').value, received_by:me().id, received_by_name:me().name, condition:$('#fm-g_cond').value, notes:$('#fm-g_notes').value.trim(), created_at:nowISO(), attachments:atts};
      if (!LIVE) row.number = Store.nextNumber('receipts','GRN-');
      const g = await Store.insert('receipts',row);
      const full = p.lines.every((l,i)=>got[i]+qty[i] >= l.qty-0.0001);
      await Store.update('purchase_orders',p.id,{status:full?'received':'partially_received'});
      for (let i=0;i<p.lines.length;i++){ const it = Store.all('items').find(x=>x.track_stock && x.name.toLowerCase()===String(p.lines[i].description).toLowerCase()); if (it && qty[i]>0) await stockMove(it, qty[i], 'Received', g.number); }
      await Store.log('po',p,'Goods received',g.number+' · '+g.condition+(full?' · complete':' · partial'));
      const r = Store.byId('requisitions',p.req_id); if (r) await Store.log('requisition',r,'Goods received',g.number+' against '+p.number);
      const rv = ['quality','timeliness','service'].map(k=>+$('#fm-rv_'+k).value||0);
      if (rv.every(x=>x>0)){ const s=Store.sup(p.supplier_id); const reviews=(s.reviews||[]).concat([{id:uid(), quality:rv[0], timeliness:rv[1], service:rv[2], comment:$('#fm-rv_comment').value.trim(), ref:p.number, by:me().id, by_name:me().name, at:nowISO()}]); await Store.update('suppliers',s.id,{reviews}); }
      await Store.notify(Store.all('app_users').filter(u=>u.role==='finance'&&u.active).map(u=>u.id),'po',p,g.number+': goods received against '+p.number+(full?'':' (partial)'));
      M.close(); this.render(); this.toast('Receipt '+g.number+' recorded');
    }catch(e){ M.err(e.message||String(e)); M.busy(false); }
  },

  /* ---------- invoices ---------- */
  invForm(p, preset){
    const r = Store.byId('requisitions',p.req_id);
    const already = sum(Store.all('invoices').filter(v=>v.po_id===p.id),v=>v.amount);
    const recVal = sum(receiptsFor(p), g=>g.lines.reduce((s,l,i)=>s+(+l.received||0)*(+(p.lines[i]||{}).unit_price||0),0));
    formModal({title:(me().role==='supplier'?'Submit invoice':'Capture invoice')+' · '+p.number, narrow:true,
      intro:`<div class="match"><div><span>Ordered</span><b>${num(p.total)}</b></div><div><span>Received</span><b>${num(recVal)}</b></div><div><span>Already invoiced</span><b>${num(already)}</b></div></div>`,
      fields:[{k:'supplier_invoice_no',label:'Supplier invoice number',req:1},{k:'amount',label:'Amount ('+p.currency+')',type:'number',step:'0.01',req:1},{k:'invoice_date',label:'Invoice date',type:'date',req:1},{k:'due_date',label:'Payment due',type:'date',req:1},{k:'files',label:'Invoice copy',type:'files',req:1}],
      values:Object.assign({amount:round2((S().require_grn?recVal:p.total)-already), invoice_date:todayStr(), due_date:addDays(todayStr(),30)}, preset||{}), save:'Save invoice',
      onSave: async (v, files) => {
        if (Store.all('invoices').some(x=>x.supplier_id===p.supplier_id && x.supplier_invoice_no.toLowerCase()===v.supplier_invoice_no.toLowerCase())) throw new Error('Invoice '+v.supplier_invoice_no+' from this supplier has already been captured (possible duplicate).');
        const row = {id:uid(), supplier_invoice_no:v.supplier_invoice_no, supplier_id:p.supplier_id, po_id:p.id, req_id:p.req_id, currency:p.currency, amount:round2(v.amount), invoice_date:v.invoice_date, due_date:v.due_date, status:'captured', created_by:me().id, created_at:nowISO(), attachments:[]};
        if (!LIVE) row.number = Store.nextNumber('invoices','INV-');
        for (const f of files.files) row.attachments.push(await Store.putFile(f,'invoices/'+p.id,'invoice'));
        const inv = await Store.insert('invoices',row);
        await Store.log('invoice',inv,'Invoice captured',inv.supplier_invoice_no+' · '+fmtMoney(inv.currency,inv.amount)+' against '+p.number);
        if (r) await Store.log('requisition',r,'Invoice captured',inv.number+' ('+inv.supplier_invoice_no+')');
        const m = r && matchFor(r);
        await Store.notify(Store.all('app_users').filter(u=>u.role==='finance'&&u.active).map(u=>u.id),'invoice',inv,inv.number+' ('+Store.supName(p.supplier_id)+') '+(m&&m.invOk?'matched '+p.number+' — ready to pay':'does not match '+p.number+' — check before paying'));
        return m && !m.invOk ? 'Invoice saved — it does not match the PO/receipt, check before paying' : 'Invoice saved and matched';
      }});
  },

  /* ---------- payment ---------- */
  payForm(r){
    const invs = invoicesFor(r).filter(v=>v.status!=='paid');
    const amt = r.kind==='payment' || !invs.length ? r.total : sum(invs,v=>v.amount);
    const m = matchFor(r);
    formModal({title:'Record payment · '+r.number, narrow:true,
      intro:`<p class="muted" style="margin:0">${esc(r.title)} — ${esc(r.supplier_id?Store.supName(r.supplier_id):(r.payee||''))}${(Store.sup(r.supplier_id)||{}).bank_details?'<br>Bank: '+esc(Store.sup(r.supplier_id).bank_details):''}</p>${m&&!m.invOk?'<div class="note warn">The invoice does not match what was ordered/received. Resolve before paying.</div>':''}${(()=>{ const b=bankCheck(r.description,r.supplier_id,r.payee); return b&&b.tone!=='blue'?`<div class="note warn">${b.text}</div>`:''; })()}`,
      fields:[{k:'reference',label:'Payment reference',req:1,ph:'Bank / EFT / cheque number'},{k:'paid_on',label:'Payment date',type:'date',req:1},{k:'amount',label:'Amount ('+r.currency+')',type:'number',step:'0.01',req:1},{k:'method',label:'Method',type:'select',blank:false,options:PAY_METHODS.map(p=>[p,p])},
        ...(payAccts().length?[{k:'pay_from',label:'Paid from',type:'select',blank:'—',options:payAccts().filter(a=>a.active||a.id===r.pay_from_id).map(a=>[a.id,acctLabel(a)])}]:[]),
        {k:'note',label:'Note',type:'textarea'},{k:'files',label:'Proof of payment',type:'files',req:1}],
      values:{paid_on:todayStr(), amount:amt, method:r.payment_method, pay_from:r.pay_from_id||((payAccts().find(a=>a.active&&a.currency===r.currency)||{}).id)||''}, save:'Mark as paid',
      onSave: async (v, files) => {
        const atts=(r.attachments||[]).slice(); for (const f of files.files) atts.push(await Store.putFile(f,'requisitions/'+r.id,'payment'));
        const pf = payAccts().find(a=>a.id===v.pay_from);
        await Store.update('requisitions',r.id,{status:'paid', paid_at:nowISO(), attachments:atts, payment:{reference:v.reference, paid_on:v.paid_on, amount:round2(v.amount), method:v.method, note:v.note, paid_by:me().id, paid_by_name:me().name, invoice_ids:invs.map(x=>x.id), pay_from_id:pf?pf.id:null, pay_from_name:pf?acctLabel(pf):null}});
        for (const x of invs) await Store.update('invoices',x.id,{status:'paid'});
        for (const p of posFor(r)) if (['received','partially_received','issued'].includes(p.status)) await Store.update('purchase_orders',p.id,{status:'closed'});
        await Store.log('requisition',r,'Payment recorded','Ref '+v.reference+' · '+fmtMoney(r.currency,v.amount)+(Math.abs(v.amount-amt)>0.005?' (expected '+fmtMoney(r.currency,amt)+')':''));
        await Store.notify([r.created_by, ...Store.all('app_users').filter(u=>u.role==='supplier'&&u.supplier_id===r.supplier_id).map(u=>u.id)],'requisition',r,r.number+' has been paid ('+v.reference+')');
        return 'Payment recorded';
      }});
  },

  /* ---------- master data forms ---------- */
  supForm(s){
    formModal({title:s?'Edit supplier':'Add supplier', narrow:false, values:s||{country:'',status:'pending',category_ids:[],tags:[]},
      fields:[{k:'name',label:'Company name',req:1,span:2},{k:'contact',label:'Main contact'},{k:'phone',label:'Phone'},{k:'email',label:'Email',type:'email'},{k:'address',label:'Address'},{k:'country',label:'Country'},
        {k:'registration_no',label:'Registration number'},{k:'tax_number',label:'Tax number'},{k:'bank_details',label:'Bank details',type:'textarea'},
        {k:'category_ids',label:'Supplies these categories',type:'checks',options:opt('categories')},{k:'tags',label:'Supplier profile (ESG / inclusion)',type:'checks',options:ESG_TAGS.map(t=>[t,t])},{k:'notes',label:'Internal notes',type:'textarea'}],
      onSave: async v => {
        if (s){ const bankChanged = (v.bank_details||'').trim() !== (s.bank_details||'').trim();
          await Store.update('suppliers',s.id,v); await Store.log('supplier',Object.assign({},s,v),'Supplier details updated','');
          if (bankChanged && !LIVE){ await Store.log('supplier',Object.assign({},s,v),'Bank details changed','Changed by '+me().name+' - Finance alerted');
            await Store.notify(usersWhere(u=>u.role==='finance'),'supplier',s,'Bank details for '+s.name+' were changed by '+me().name+' - confirm them with the supplier before the next payment'); } }
        else { const row=Object.assign({id:uid(), status:'pending', documents:[], reviews:[], active:true, created_at:nowISO()},v); const x=await Store.insert('suppliers',row); await Store.log('supplier',x,'Supplier added','Pending prequalification'); }
        return 'Supplier saved';
      }});
  },
  supStatus(s, status){
    const label = {approved:s.status==='pending'?'Prequalify':'Reinstate', suspended:'Suspend', blacklisted:'Blacklist'}[status];
    formModal({title:label+' '+esc(s.name), save:label, intro: status==='approved'&&supExpired(s).length?`<div class="note warn">This supplier has expired documents: ${supExpired(s).map(d=>esc(d.type)).join(', ')}.</div>`:'',
      fields:[{k:'reason',label:status==='approved'?'Prequalification note (documents checked, references, etc.)':'Reason',type:'textarea',req:1}],
      onSave: async v => { await Store.update('suppliers',s.id,{status, active:status==='approved'||status==='pending'}); await Store.log('supplier',s,{approved:s.status==='pending'?'Prequalified':'Reinstated',suspended:'Suspended',blacklisted:'Blacklisted'}[status],v.reason); return 'Supplier '+(status==='approved'?'approved':status); }});
  },
  supDoc(s){
    formModal({title:'Add compliance document · '+esc(s.name), save:'Upload',
      fields:[{k:'type',label:'Document',type:'select',blank:false,options:DOC_TYPES.map(t=>[t,t]),req:1},{k:'expiry',label:'Expiry date',type:'date',help:'Leave blank if it does not expire.'},{k:'files',label:'Document',type:'files',req:1}],
      onSave: async (v, files) => { const file = await Store.putFile(files.files[0],'suppliers/'+s.id,'compliance'); const docs=(s.documents||[]).filter(d=>d.type!==v.type).concat([{id:uid(), type:v.type, expiry:v.expiry||null, file}]); await Store.update('suppliers',s.id,{documents:docs}); await Store.log('supplier',s,'Compliance document uploaded',v.type+(v.expiry?' · valid to '+fmtDate(v.expiry):'')); return 'Document uploaded'; }});
  },
  ctForm(c){
    const ca = S().contract_approval||{};
    formModal({title:c?'Edit '+esc(c.number):'New contract', narrow:false, values:c||{currency:baseCur(), type:CONTRACT_TYPES[0], branch_id:me().branch_id||'', submit_now:!!ca.enabled},
      intro: c&&c.status==='active' ? '<div class="note">Changes to an active contract (for example a renewal or extension) are recorded in its audit trail.</div>' : '',
      fields:[{k:'title',label:'Title',req:1,span:2},{k:'supplier_id',label:'Supplier',type:'select',req:1,options:opt('suppliers',s=>s.status==='approved'||(c&&s.id===c.supplier_id))},{k:'type',label:'Type',type:'select',blank:false,options:CONTRACT_TYPES.map(t=>[t,t])},
        {k:'start_date',label:'Start',type:'date',req:1},{k:'end_date',label:'End',type:'date',req:1},{k:'value',label:'Contract value',type:'number',step:'0.01',req:1},{k:'currency',label:'Currency',type:'select',blank:false,options:(S().currencies||[]).map(x=>[x.code,x.code])},
        ...((S().branches||[]).length?[{k:'branch_id',label:'Branch',type:'select',blank:'Company-wide',options:branchOpts()}]:[]),
        {k:'notes',label:'Notes',type:'textarea'},{k:'files',label:'Contract document',type:'files',req:!c},
        ...(!c||c.status==='draft'?[{k:'submit_now',label:ca.enabled?'Submit for approval now':'Activate now',type:'bool',span:1}]:[])],
      onSave: async (v, files) => {
        if (v.end_date < v.start_date) throw new Error('The end date is before the start date.');
        const atts = ((c||{}).attachments||[]).slice(); for (const f of files.files) atts.push(await Store.putFile(f,'contracts/'+(c?c.id:'new'),'contract'));
        const submit = v.submit_now; const row = Object.assign({}, v, {attachments:atts, branch_id:v.branch_id||null}); delete row.files; delete row.submit_now;
        let x;
        if (c){ x = await Store.update('contracts',c.id,row); await Store.log('contract',x,c.status==='active'?'Contract amended':'Draft edited',fmtDate(v.start_date)+' → '+fmtDate(v.end_date)+' · '+fmtMoney(v.currency,v.value)); }
        else { const r=Object.assign({id:uid(), status:'draft', created_by:me().id, created_at:nowISO(), approvals:[], approver_ids:[], approvals_required:0},row); if(!LIVE) r.number=Store.nextNumber('contracts','CT-'); x=await Store.insert('contracts',r); await Store.log('contract',x,'Draft saved',v.type+' · '+fmtMoney(v.currency,v.value)); }
        if (submit) await App.ctSubmit(x);
        App.go('contract', x.id);
        return submit ? (ca.enabled?'Submitted for approval':'Contract activated') : 'Contract saved';
      }});
  },
  async ctSubmit(c){
    const ca = S().contract_approval||{};
    const cids = approversExcluding(ca.approver_ids, c.created_by);
    if (ca.enabled && (ca.approver_ids||[]).length && !cids.length){ this.toast('You are the only contract approver - another approver is needed'); return c; }
    if (ca.enabled && cids.length){
      c = await Store.update('contracts',c.id,{status:'pending', submitted_at:nowISO(), approvals:[], approver_ids:cids, approvals_required:Math.min(+ca.required||1, cids.length)});
      await Store.log('contract',c,'Submitted for approval','Approvers: '+c.approver_ids.map(a=>Store.user(a).name).join(', '));
      await Store.notify(withDelegates(c.approver_ids),'contract',c,'Contract '+c.number+' – '+c.title+' ('+fmtMoney(c.currency,c.value)+') needs your approval');
    } else { c = await Store.update('contracts',c.id,{status:'active', submitted_at:nowISO()}); await Store.log('contract',c,'Activated',''); }
    return c;
  },
  simpleForm(t, rec, title, fields, logName){
    formModal({title:(rec?'Edit ':'Add ')+title, values:rec||{active:true}, fields:fields.concat([{k:'active',label:'Active',type:'bool'}]),
      onSave: async v => { if (rec){ await Store.update(t,rec.id,v); await Store.log(logName,Object.assign({},rec,v),title[0].toUpperCase()+title.slice(1)+' updated',v.name||v.code||v.description||''); } else { const x=await Store.insert(t,Object.assign({id:uid(), created_at:nowISO()},v)); await Store.log(logName,x,title[0].toUpperCase()+title.slice(1)+' added',v.name||v.code||v.description||''); } return 'Saved'; }});
  },

  async viewFile(ref){
    const [t,id,...rest] = ref.split(':');
    let att;
    if (t==='suppliers' && rest[0]==='doc'){ const d=(Store.sup(id).documents||[]).find(x=>x.id===rest[1]); att=d&&d.file; }
    else { const rec=Store.byId(t,id); att=rec && (rec.attachments||[]).find(a=>a.id===rest[0]); }
    if (!att) return this.toast('File not found');
    try{
      const url = await Store.fileUrl(att);
      if (!url) return this.toast('This file is not available in this browser');
      if (!LIVE) (M._blobs=M._blobs||[]).push(url);
      let integ = '';
      if (att.sha256){ try{ const now = await sha256Of(await (await fetch(url)).blob()); integ = !now ? '' : now===att.sha256 ? ' · <span style="color:var(--green)">Fingerprint verified ✓</span>' : ' · <b style="color:var(--red)">WARNING: this file has changed since it was uploaded</b>'; if (now && now!==att.sha256) await Store.log('file',{id:att.id,number:att.name},'Fingerprint mismatch','Stored file no longer matches its SHA-256 fingerprint'); }catch(e){} }
      const img = /^image\//.test(att.type)||/\.(png|jpe?g|gif|webp)$/i.test(att.name), pdf=/pdf/.test(att.type)||/\.pdf$/i.test(att.name);
      M.open(`${M.head(esc(att.name))}<div class="modal-b">${img?`<img src="${url}" alt="${esc(att.name)}" style="max-height:70vh;object-fit:contain">`:pdf?`<iframe class="preview-frame" src="${url}" title="${esc(att.name)}"></iframe>`:'<p class="muted">No preview for this file type — download it to open.</p>'}
        <p class="faint" style="margin:0;font-size:12.5px">Uploaded by ${esc(att.uploaded_by_name)} on ${fmtDT(att.at)} · ${fmtSize(att.size)}${att.sha256?' · SHA-256 <span class="mono">'+esc(att.sha256.slice(0,16))+'…</span>':''}${integ}</p></div>
        <div class="modal-f"><a class="btn primary" href="${url}" download="${esc(att.name)}" target="_blank" rel="noopener">${I.down}Download</a></div>`);
    }catch(e){ this.toast('Could not open file: '+(e.message||e)); }
  },
  toast(msg){ $$('.toast').forEach(x=>x.remove()); const t=document.createElement('div'); t.className='toast'; t.setAttribute('role','status'); t.textContent=msg; document.body.appendChild(t); setTimeout(()=>t.remove(),3400); },
  csv(name, header, rows){
    const q = v => '"'+String(v==null?'':v).replace(/"/g,'""')+'"';
    const blob = new Blob(['﻿'+[header.map(q).join(',')].concat(rows.map(r=>r.map(q).join(','))).join('\r\n')],{type:'text/csv'});
    const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name; document.body.appendChild(a); a.click(); setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove();},500);
  },
  exportCurrent(){
    const [kind, rows] = this._export||[]; const d = todayStr();
    const E = {
      requisitions:()=>this.csv('requisitions-'+d+'.csv',['Number','Name','Type','Stage','Category','Budget','Supplier/payee','Department','Requisitioner','Created','Submitted','Decided','Due','Currency','Total','Approvals','Payment ref','Paid on'],rows.map(r=>[r.number,r.title,r.kind,STAGE[reqStage(r)][0],Store.catName(r.category_id),(Store.byId('budgets',r.budget_id)||{}).code,r.supplier_id?Store.supName(r.supplier_id):r.payee,r.department,Store.user(r.created_by).name,fmtDate(r.created_at),fmtDT(r.submitted_at),fmtDT(r.decided_at),fmtDate(r.due_date),r.currency,Number(r.total).toFixed(2),(r.approvals||[]).map(a=>a.approver_name+': '+a.decision).join('; '),r.payment&&r.payment.reference,r.payment&&r.payment.paid_on])),
      audit:()=>this.csv('audit-trail-'+d+'.csv',['Timestamp','Record type','Record','Action','User','Details'],rows.map(a=>[a.at,a.entity_type,a.entity_number,a.action,a.user_name,a.details])),
      suppliers:()=>this.csv('suppliers-'+d+'.csv',['Name','Status','Categories','Tags','Contact','Phone','Email','Tax number','Bank details','Rating','Expired documents'],rows.map(s=>[s.name,s.status,(s.category_ids||[]).map(c=>Store.catName(c)).join('; '),(s.tags||[]).join('; '),s.contact,s.phone,s.email,s.tax_number,s.bank_details,supRating(s)==null?'':supRating(s).toFixed(1),supExpired(s).map(x=>x.type).join('; ')])),
      budgets:()=>this.csv('budgets-'+d+'.csv',['Code','Name','Department','Budget','Spent','Committed','Available'],rows.map(b=>{const u=budgetUse(b);return [b.code,b.name,b.department,b.amount,u.spent.toFixed(2),u.committed.toFixed(2),u.available.toFixed(2)];})),
      plan:()=>this.csv('procurement-plan-'+d+'.csv',['Year','Quarter','Department','Need','Category','Method','Qty','Estimate','Currency','Status','Requisition'],rows.map(p=>[p.year,p.quarter,p.department,p.description,Store.catName(p.category_id),p.method,p.qty,p.est_cost,p.currency,p.status,(Store.byId('requisitions',p.req_id)||{}).number])),
      invoices:()=>this.csv('invoices-'+d+'.csv',['Number','Supplier invoice','Supplier','PO','Invoice date','Due','Currency','Amount','Status'],rows.map(v=>[v.number,v.supplier_invoice_no,Store.supName(v.supplier_id),(Store.byId('purchase_orders',v.po_id)||{}).number,v.invoice_date,v.due_date,v.currency,v.amount,v.status]))
    };
    E[kind] ? E[kind]() : this.toast('Nothing to export here');
  }
});

/* =====================================================================
   EVENTS
   ===================================================================== */
const ACT = {
  menu:()=>$('#side').classList.toggle('open'),
  bell:()=>{ App.menu = App.menu==='bell'?null:'bell'; App.render(); },
  'read-all':()=>{ Store.all('notifications').filter(n=>n.user_id===me().id&&!n.read).forEach(n=>{ n.read=true; if(LIVE) Store.update('notifications',n.id,{read:true}).catch(()=>{}); }); Store.persist(); App.render(); },
  logout: async ()=>{ await Store.sb.auth.signOut(); location.reload(); },
  back:()=>App.goBack(),
  print:()=>window.print(),
  export:()=>App.exportCurrent(),
  'new-req':()=>App.reqForm(),
  'req-edit':()=>App.reqForm(Store.byId('requisitions',App.param)),
  'req-save':()=>App.reqSave(false),
  'req-save-submit':()=>App.reqSave(true),
  'req-submit': async ()=>{ if (await App.reqSubmit(Store.byId('requisitions',App.param))){ App.render(); App.toast('Submitted — approvers notified'); } },
  'req-withdraw':()=>{ const r=Store.byId('requisitions',App.param); M.open(`${M.head('Withdraw '+esc(r.number)+'?')}<div class="modal-b"><p style="margin:0">Approvers will no longer be asked to decide. The requisition and its documents stay on record for audit.</p></div><div class="modal-f"><button class="btn ghost" data-close>Keep it</button><button class="btn danger" data-act="req-withdraw-ok">Withdraw</button></div>`,true); },
  'req-withdraw-ok': async ()=>{ const r=Store.byId('requisitions',App.param); await Store.update('requisitions',r.id,{status:'withdrawn'}); await Store.log('requisition',r,'Withdrawn','Withdrawn by the requisitioner'); await Store.notify((r.approver_ids||[]).filter(a=>!(r.approvals||[]).some(x=>x.approver_id===a)),'requisition',r,r.number+' was withdrawn by '+me().name); M.close(); App.render(); App.toast('Withdrawn'); },
  'req-revise':()=>{ const r=Store.byId('requisitions',App.param); App.reqForm(null,{title:r.title+' (revised)', kind:r.kind, description:r.description+'\n\nRevision of '+r.number+' (rejected).', category_id:r.category_id, supplier_id:r.supplier_id, budget_id:r.budget_id, contract_id:r.contract_id, department:r.department, currency:r.currency, payment_method:r.payment_method, payee:r.payee, lines:r.lines}); },
  decide: async (t)=>{ const table=t.dataset.t||'requisitions', r=Store.byId(table,App.param), c=$('#d-comment').value.trim(), d=t.dataset.d;
    if (d==='rejected' && !c){ const e=$('#d-err'); e.hidden=false; e.textContent='Give a reason so the requester knows what to fix.'; return; }
    t.disabled=true; try{ const nr=await Store.decide(table,r,d,c); App.render(); App.toast(d==='approved'?(nr.status==='pending'||nr.status==='pending_approval'?'Approval recorded':nr.status==='review'?'Fully approved — sent to Finance for review':'Fully approved'):'Rejected — requester notified'); }catch(e){ App.toast('Could not record decision: '+(e.message||e)); t.disabled=false; } },
  review:(t)=>{ const table=t.dataset.t, r=Store.byId(table,App.param), ok=t.dataset.ok==='1';
    formModal({title:(ok?'Release ':'Return ')+esc(r.number), save:ok?'Release':'Return to requester', intro: ok?'<p class="muted" style="margin:0">Confirm the budget line, documents and payee details are correct.</p>':'<p class="muted" style="margin:0">It will be marked rejected and the requester notified. They can revise and resubmit it as a new record.</p>',
      fields:[{k:'note',label:ok?'Review note (optional)':'What needs fixing',type:'textarea',req:!ok}],
      onSave: async v=>{ await Store.review(table, r, ok, v.note); return ok?(table==='purchase_orders'?'Released — PO issued to the supplier':'Released'):'Returned to the requester'; }}); },
  'line-add':()=>{ Ed.lines.push({description:'',qty:1,unit_price:0}); Ed.draw(); },
  'line-del':(t)=>{ Ed.lines.splice(+t.dataset.i,1); Ed.draw(); },
  'rfq-new':(t)=>App.rfqForm(t.dataset.id),
  'rfq-save':()=>App.rfqSave(),
  'bid-new':(t)=>App.bidForm(Store.byId('rfqs',t.dataset.id)),
  'portal-bid':(t)=>App.bidForm(Store.byId('rfqs',t.dataset.id), me().supplier_id),
  'rfq-close': async ()=>{ const q=Store.byId('rfqs',App.param); await Store.update('rfqs',q.id,{closing_at:nowISO()}); await Store.log('rfq',q,'Closed early','Bidding closed and bids opened'); App.render(); App.toast('Bidding closed — bids are now visible'); },
  'rfq-cancel':()=>{ const q=Store.byId('rfqs',App.param); formModal({title:'Cancel '+esc(q.number), save:'Cancel RFQ', fields:[{k:'reason',label:'Reason',type:'textarea',req:1}], onSave: async v=>{ await Store.update('rfqs',q.id,{status:'cancelled'}); await Store.log('rfq',q,'Cancelled',v.reason); return 'RFQ cancelled'; }}); },
  award:(t)=>{ const q=Store.byId('rfqs',App.param), b=Store.byId('bids',t.dataset.id), best=scoreBids(q)[0];
    formModal({title:'Award '+esc(q.number)+' to '+esc(Store.supName(b.supplier_id)), save:'Award', intro:`<p style="margin:0">${fmtMoney(b.currency,b.amount)} · ${b.delivery_days} days delivery.</p>${best&&best.b.id!==b.id?'<div class="note warn">This is not the highest-scoring bid. Record why in the justification.</div>':''}`,
      fields:[{k:'note',label:'Award justification',type:'textarea',req:1}],
      onSave: async v=>{ await Store.update('rfqs',q.id,{status:'awarded', awarded_bid_id:b.id, award_note:v.note, awarded_at:nowISO()}); await Store.log('rfq',q,'Awarded',Store.supName(b.supplier_id)+' · '+fmtMoney(b.currency,b.amount)+' — '+v.note);
        if (q.req_id){ const r=Store.byId('requisitions',q.req_id); await Store.update('requisitions',r.id,{supplier_id:b.supplier_id}); await Store.log('requisition',r,'Supplier selected',q.number+' awarded to '+Store.supName(b.supplier_id)); }
        await Store.notify(Store.all('app_users').filter(u=>u.role==='supplier'&&(q.invited_ids||[]).includes(u.supplier_id)).map(u=>u.id),'rfq',q,q.number+' has been awarded');
        return 'Awarded'; }}); },
  'po-new':(t)=>App.poForm(t.dataset.id),
  'po-save':(t)=>App.poSave(t.dataset.id, t.dataset.mode),
  'po-cancel':()=>{ const p=Store.byId('purchase_orders',App.param); formModal({title:'Cancel '+esc(p.number), save:'Cancel PO', fields:[{k:'reason',label:'Reason',type:'textarea',req:1}], onSave: async v=>{ await Store.update('purchase_orders',p.id,{status:'cancelled'}); await Store.log('po',p,'Cancelled',v.reason); const r=Store.byId('requisitions',p.req_id); if(r) await Store.log('requisition',r,'Purchase order cancelled',p.number+' — '+v.reason); return 'PO cancelled'; }}); },
  'grn-new':(t)=>App.grnForm(Store.byId('purchase_orders',t.dataset.id)),
  'grn-save':(t)=>App.grnSave(Store.byId('purchase_orders',t.dataset.id)),
  'inv-new':(t)=>App.invForm(Store.byId('purchase_orders',t.dataset.id)),
  pay:(t)=>App.payForm(Store.byId('requisitions',t.dataset.id)),
  'pay-all':(t)=>$$('.pay-sel').forEach(x=>x.checked=t.checked),
  'pay-export':()=>{ const ids=$$('.pay-sel:checked').map(x=>x.value); if(!ids.length) return App.toast('Tick the requisitions to include first');
    const rows = ids.map(id=>Store.byId('requisitions',id)).map(r=>{ const s=Store.sup(r.supplier_id)||{}; const invs=invoicesFor(r).filter(v=>v.status!=='paid'); const pf=payAccts().find(a=>a.id===r.pay_from_id)||{}; return [r.number, r.supplier_id?s.name:(r.payee||Store.user(r.created_by).name), s.bank_details||'', s.tax_number||'', r.currency, (r.kind==='payment'||!invs.length?r.total:sum(invs,v=>v.amount)).toFixed(2), invs.map(v=>v.supplier_invoice_no).join(' ')||r.number, r.due_date, pf.name||'', pf.account_no||'', pf.gl_code||'']; });
    App.csv('payment-file-'+todayStr()+'.csv',['Requisition','Payee','Bank details (verified supplier record only)','Tax number','Currency','Amount','Payment reference','Due date','Pay from account','Pay from account number','Pay from GL code'],rows);
    Store.log('payment-batch',{id:'batch-'+Date.now(),number:'Batch '+todayStr()},'Payment file exported',ids.length+' items: '+rows.map(r=>r[0]).join(', ')); },
  'sup-new':()=>App.supForm(),
  'sup-edit':()=>App.supForm(Store.sup(App.param)),
  'sup-status':(t)=>App.supStatus(Store.sup(App.param), t.dataset.s),
  'sup-doc':()=>App.supDoc(Store.sup(me().role==='supplier'?me().supplier_id:App.param)),
  'ct-new':()=>App.ctForm(),
  'ct-edit':(t)=>App.ctForm(Store.byId('contracts',t.dataset.id)),
  'item-new':()=>ACT._item(), 'item-edit':(t)=>ACT._item(Store.byId('items',t.dataset.id)),
  _item:(rec)=>App.simpleForm('items',rec,'item',[{k:'name',label:'Item name',req:1,span:2},{k:'category_id',label:'Category',type:'select',options:opt('categories')},{k:'uom',label:'Unit of measure',ph:'per unit, per month…'},{k:'price',label:'Reference price ('+baseCur()+')',type:'number',step:'0.01'}],'item'),
  'cat-new':()=>ACT._cat(), 'cat-edit':(t)=>ACT._cat(Store.byId('categories',t.dataset.id)),
  _cat:(rec)=>App.simpleForm('categories',rec,'category',[{k:'name',label:'Category name',req:1,span:2},{k:'description',label:'Description',type:'textarea'}],'category'),
  'budget-new':()=>ACT._bud(), 'budget-edit':(t)=>ACT._bud(Store.byId('budgets',t.dataset.id)),
  _bud:(rec)=>App.simpleForm('budgets',rec,'budget line',[{k:'code',label:'Budget code',req:1},{k:'name',label:'Name',req:1},{k:'department',label:'Department',type:'select',options:(S().departments||[]).map(d=>[d,d])},{k:'category_id',label:'Category',type:'select',options:opt('categories')},{k:'year',label:'Year',type:'number'},{k:'amount',label:'Amount ('+baseCur()+')',type:'number',step:'0.01',req:1}],'budget'),
  'plan-new':()=>ACT._plan(), 'plan-edit':(t)=>ACT._plan(Store.byId('plan_lines',t.dataset.id)),
  _plan:(rec)=>App.simpleForm('plan_lines',rec||{year:S().fiscal_year,quarter:'Q1',currency:baseCur(),status:'planned',qty:1,active:true},'plan line',[{k:'description',label:'Need',req:1,span:2},{k:'department',label:'Department',type:'select',options:(S().departments||[]).map(d=>[d,d]),req:1},{k:'category_id',label:'Category',type:'select',options:opt('categories')},{k:'year',label:'Year',type:'number',req:1},{k:'quarter',label:'Quarter',type:'select',blank:false,options:['Q1','Q2','Q3','Q4'].map(q=>[q,q])},{k:'qty',label:'Quantity',type:'number'},{k:'est_cost',label:'Estimated cost',type:'number',step:'0.01',req:1},{k:'currency',label:'Currency',type:'select',blank:false,options:(S().currencies||[]).map(c=>[c.code,c.code])},{k:'method',label:'Sourcing method',type:'select',blank:false,options:METHODS.map(m=>[m,m])},{k:'status',label:'Status',type:'select',blank:false,options:[['planned','Planned'],['requisitioned','Requisitioned'],['completed','Completed'],['cancelled','Cancelled']]}],'plan'),
  'plan-req':(t)=>{ const p=Store.byId('plan_lines',t.dataset.id); const b=Store.all('budgets').find(x=>x.category_id===p.category_id&&x.active); const it=Store.all('items').find(i=>i.category_id===p.category_id);
    App.reqForm(null,{plan_line_id:p.id, title:p.description, department:p.department, category_id:p.category_id, budget_id:b?b.id:'', currency:p.currency, kind:'purchase', description:'Planned in the FY'+p.year+' procurement plan ('+p.quarter+', '+p.method+').', lines:[{description:p.description, qty:p.qty||1, unit_price:round2((p.est_cost||0)/(p.qty||1))}]}); void it; },
  'user-new':()=>ACT._user(), 'user-edit':(t)=>ACT._user(Store.byId('app_users',t.dataset.id)),
  _user:(rec)=>App.simpleForm('app_users',rec,'user',[{k:'name',label:'Full name',req:1},{k:'email',label:'Email (used to sign in)',type:'email',req:1},{k:'title',label:'Job title'},{k:'department',label:'Department',type:'select',options:(S().departments||[]).map(d=>[d,d])},{k:'role',label:'Role',type:'select',blank:false,options:Object.entries(ROLE_LABEL)},{k:'supplier_id',label:'Supplier (portal users only)',type:'select',options:opt('suppliers')}],'user'),
  'tier-add':()=>{ ACT._readTiers(); const t=S().approval_tiers; t.push({label:'New tier', max:null, approver_ids:[], required:1}); App.render(); },
  'tier-del':()=>{ ACT._readTiers(); S().approval_tiers.pop(); App.render(); },
  _readTiers:()=>{ S().approval_tiers = (S().approval_tiers||[]).map((t,i)=>({label:$('#t-label-'+i).value.trim()||'Tier '+(i+1), max:$('#t-max-'+i).value===''?null:+$('#t-max-'+i).value, approver_ids:$$('.t-ap-'+i+':checked').map(x=>x.value), required:Math.max(1,+$('#t-req-'+i).value||1)})); },
  'settings-save': async ()=>{
    ACT._readTiers();
    const tiers = S().approval_tiers.map(t=>Object.assign(t,{required:Math.min(t.required, Math.max(1,t.approver_ids.length)), next_steps:(t.next_steps||[]).map(s=>Object.assign(s,{required:Math.min(s.required, Math.max(1,s.approver_ids.length))}))}));
    if (tiers.some(t=>!t.approver_ids.length)) return App.toast('Every approval tier needs at least one approver');
    if (tiers.some(t=>t.next_steps.some(s=>!s.approver_ids.length))) return App.toast('Every approval step needs at least one approver — or remove the empty step');
    if (tiers.some(t=>{ const all=t.approver_ids.concat(...t.next_steps.map(s=>s.approver_ids)); return new Set(all).size!==all.length; })) return App.toast('A person can be in only one step of a tier, so nobody approves the same request twice');
    if ($('#po_approval-on').checked && !$$('.po_approval-ap:checked').length) return App.toast('Choose at least one purchase order approver, or turn PO approval off');
    if ($('#contract_approval-on').checked && !$$('.contract_approval-ap:checked').length) return App.toast('Choose at least one contract approver, or turn contract approval off');
    const cur = $('#s-cur').value.split('\n').map(l=>l.split('=')).filter(p=>p[0]&&p[0].trim()).map(([c,r])=>({code:c.trim().toUpperCase(), rate:+(r||'1').trim()||1}));
    const base = $('#s-base').value.trim().toUpperCase()||'USD';
    if (!cur.some(c=>c.code===base)) cur.unshift({code:base,rate:1});
    await Store.saveSettings({company:$('#s-company').value.trim(), base_currency:base, fiscal_year:+$('#s-fy').value||new Date().getFullYear(), delivery_address:$('#s-addr').value.trim(), po_terms:$('#s-terms').value.trim(),
      currencies:cur, approval_tiers:tiers, reject_rule:$('#s-reject').value,
      quotes_threshold:+$('#s-qth').value||0, quotes_required:+$('#s-qn').value||3, match_tolerance_pct:+$('#s-tol').value||0, expiry_warning_days:+$('#s-exp').value||60,
      require_documents:$('#s-docs').checked, approved_suppliers_only:$('#s-appr').checked, require_grn:$('#s-grn').checked, review_enabled:$('#s-review').checked,
      branches:(()=>{ const old=S().branches||[]; return $('#s-branches').value.split('\n').map(x=>x.trim()).filter(Boolean).map((n,i)=>({id:(old.find(b=>b.name===n)||{}).id||('br-'+uid().slice(0,6)), name:n})); })(),
      po_approval:{enabled:$('#po_approval-on').checked, approver_ids:$$('.po_approval-ap:checked').map(x=>x.value), required:Math.max(1,+$('#po_approval-req').value||1)},
      contract_approval:{enabled:$('#contract_approval-on').checked, approver_ids:$$('.contract_approval-ap:checked').map(x=>x.value), required:Math.max(1,+$('#contract_approval-req').value||1)},
      support:{email:$('#s-sup-email').value.trim(), phone:$('#s-sup-phone').value.trim(), hours:$('#s-sup-hours').value.trim()},
      budget_control:$('#s-budget').value, default_purchaser_id:($('#s-purch')||{}).value||null,
      reminders:{enabled:$('#rm-on').checked, reminder_hours:Math.max(1,+$('#rm-h').value||24), escalate_hours:Math.max(1,+$('#rm-e').value||72), escalate_to:$$('.rm-to:checked').map(x=>x.value)},
      brand:{client:$('#s-company').value.trim(), logo:$('#s-logo').value, color:$('#s-color-def').checked?'':$('#s-color').value},
      sso:{auto_provision:$('#s-sso-auto').checked, domains:$('#s-sso-domains').value.split(',').map(x=>x.trim().toLowerCase().replace(/^@/,'')).filter(Boolean)}});
    await Store.log('settings',{id:'settings',number:'Settings'},'Settings changed', tiers.map(t=>t.label+': '+[t].concat(t.next_steps).map(s=>s.required+' of '+s.approver_ids.length).join(' then ')+(t.max!=null?' up to '+num(t.max):'')).join(' · '));
    App.render(); App.toast('Settings saved'); },
  'reset-demo':()=>M.open(`${M.head('Reset demo data?')}<div class="modal-b"><p style="margin:0">Everything you created in this browser is removed and the sample company is reloaded.</p></div><div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" data-act="reset-ok">Reset</button></div>`,true),
  'reset-ok': async ()=>{ try{ localStorage.removeItem(LS_KEY); }catch(_){} await Store.seed(); M.close(); App.back=[]; App.go('dashboard'); App.toast('Demo data reset'); },
  'export-spend':()=>{ const paid=Store.all('requisitions').filter(r=>r.status==='paid'); App.csv('spend-'+todayStr()+'.csv',['Requisition','Paid on','Department','Category','Supplier/payee','Budget','Currency','Amount',baseCur()+' equivalent','Under contract','Via RFQ'],paid.map(r=>[r.number,r.payment.paid_on,r.department,Store.catName(r.category_id),r.supplier_id?Store.supName(r.supplier_id):r.payee,(Store.byId('budgets',r.budget_id)||{}).code,r.currency,r.payment.amount,toBase(r.currency,r.payment.amount).toFixed(2),r.contract_id?'Yes':'No',rfqFor(r)?'Yes':'No'])); }
};

document.addEventListener('click', async e=>{
  if (e.target.closest('[data-stop]')) return;
  const rm = e.target.closest('[data-rmfile]');
  if (rm){ const [id,i]=rm.dataset.rmfile.split(':'); fileBins[id].splice(+i,1); fileBins[id]._draw(); return; }
  const t = e.target.closest('[data-close],[data-go],[data-open],[data-act],[data-tab],[data-note],[data-view]');
  if (!t){ if (App.menu && !e.target.closest('.dropdown')){ App.menu=null; App.render(); } return; }
  if (t.dataset.close!==undefined) return M.close();
  if (t.dataset.go){ if (t.dataset.tab){ const [k,v]=t.dataset.tab.split(':'); App.tab[k]=v; } return App.go(t.dataset.go); }
  if (t.dataset.open!==undefined){ if (t.dataset.open) App.open(t.dataset.open); return; }
  if (t.dataset.tab){ const [k,v]=t.dataset.tab.split(':'); App.tab[k]=v; return App.render(); }
  if (t.dataset.note){ const n=Store.byId('notifications',t.dataset.note); if (!n) return; if (!n.read){ n.read=true; if(LIVE) Store.update('notifications',n.id,{read:true}).catch(()=>{}); else Store.persist(); } App.menu=null; App.open(n.entity_type+':'+n.entity_id); return App.render(); }
  if (t.dataset.view) return App.viewFile(t.dataset.view);
  const f = ACT[t.dataset.act]; if (f) { try{ await f(t); }catch(err){ console.error(err); App.toast('Something went wrong: '+(err.message||err)); } }
});
document.addEventListener('change', async e=>{
  const t = e.target;
  if (t.dataset.act==='switch-user'){ Store.me=Store.byId('app_users',t.value); Store.persist(); App.back=[]; App.menu=null; App.dashView=null; App.go(Store.me.role==='supplier'?'portal':(['req','rfq','po','supplier','contract','request'].includes(App.view)&&can.seeAll(Store.me)?App.view:'dashboard'), App.param); return; }
  if (t.dataset.act==='pay-all'){ ACT['pay-all'](t); return; }
  if (t.dataset.act==='add-doc'){ const r=Store.byId('requisitions',App.param), files=[...t.files]; if(!files.length) return; const atts=(r.attachments||[]).slice(); for (const f of files) atts.push(await Store.putFile(f,'requisitions/'+r.id,'support')); await Store.update('requisitions',r.id,{attachments:atts}); await Store.log('requisition',r,'Documents uploaded',files.map(f=>f.name).join(', ')); App.render(); App.toast('Document added'); return; }
  if (t.dataset.tech){ const b=Store.byId('bids',t.dataset.tech); const v=Math.max(0,Math.min(100,+t.value||0)); await Store.update('bids',b.id,{technical_score:v}); const q=Store.byId('rfqs',b.rfq_id); await Store.log('rfq',q,'Technical score entered',Store.supName(b.supplier_id)+': '+v); App.render(); return; }
  if (t.dataset.filter && t.type!=='text'){ const [k,f]=t.dataset.filter.split('.'); App.f[k]=App.f[k]||{}; App.f[k][f]= t.type==='checkbox'?t.checked:t.value; if (App.pg[k]) App.pg[k].page=0; App.render(); }
});
document.addEventListener('input', e=>{
  const t = e.target;
  if (t.dataset.line!==undefined){
    const l = Ed.lines[+t.dataset.line]; l[t.dataset.k] = t.dataset.k==='description'?t.value:(+t.value||0);
    if (t.dataset.k==='description' && Ed.priced){ const it=Store.all('items').find(i=>i.name===t.value); if (it&&it.price&&!l.unit_price){ l.unit_price=it.price; const p=document.querySelector(`[data-line="${t.dataset.line}"][data-k="unit_price"]`); if(p) p.value=it.price; } }
    Ed.totals(); return;
  }
  if (t.dataset.filter && t.type==='text'){ const [k,f]=t.dataset.filter.split('.'); App.f[k]=App.f[k]||{}; App.f[k][f]=t.value; if (App.pg[k]) App.pg[k].page=0; clearTimeout(App._qt); App._qt=setTimeout(()=>{ const pos=t.selectionStart; App.render(); const n=document.querySelector(`[data-filter="${t.dataset.filter}"]`); if(n){ n.focus(); try{n.setSelectionRange(pos,pos);}catch(_){} } },220); }
});
document.addEventListener('keydown', e=>{ if (e.key==='Escape'){ if ($('#overlay')) M.close(); else if (App.menu){ App.menu=null; App.render(); } } });

