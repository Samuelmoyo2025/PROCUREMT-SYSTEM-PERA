/* =====================================================================
   MORE ACTIONS: requests, stock, favourites, suppliers, categories,
   comments, columns, menus, schedules
   ===================================================================== */
function entityOf(type, id){
  const t = {requisition:'requisitions', expense:'requisitions', po:'purchase_orders', contract:'contracts', request:'requests', rfq:'rfqs'}[type];
  return t ? Store.byId(t, id) : null;
}
function mentions(body){
  const words = (String(body).match(/@([A-Za-z][\w'-]*)/g)||[]).map(w=>w.slice(1).toLowerCase());
  if (!words.length) return [];
  return Store.all('app_users').filter(u=>u.active && words.some(w=>u.name.toLowerCase().split(/\s+/).includes(w))).map(u=>u.id);
}
async function stockMove(item, qty, reason, ref){
  const row = {id:uid(), item_id:item.id, qty, reason, ref:ref||'', user_id:me().id, user_name:me().name, at:nowISO()};
  if (LIVE){ const {error}=await Store.sb.from('stock_moves').insert(row); if (error) throw error; await Store.reloadTables(['items','stock_moves']); }
  else { Store.data.stock_moves.push(row); item.stock_qty = round2((+item.stock_qty||0) + qty); item.updated_at = nowISO(); Store.persist(); }
  const it = Store.byId('items', item.id);
  if (it && it.track_stock && it.stock_qty <= it.reorder_level) await Store.notify(usersWhere(u=>u.role==='procurement'),'item',it, it.name+' is at '+it.stock_qty+' '+(it.uom||'')+' — at or below its reorder level of '+it.reorder_level);
}
const nextRun = (d, rec) => addDays(d, rec==='weekly'?7 : rec==='quarterly'?91 : 30);
async function runSchedules(){
  if (LIVE) return 0;
  let made = 0;
  for (const t of Store.all('requests').filter(r=>r.status==='scheduled' && r.next_run && r.next_run<=todayStr())){
    let guard = 0;
    while (t.next_run<=todayStr() && guard++<6){ await createFromSchedule(t, t.next_run); made++; }
  }
  return made;
}
async function createFromSchedule(t, due){
  const row = {id:uid(), title:t.title.replace(/\s*\((weekly|monthly|quarterly)\)\s*$/i,'')+' – '+fmtDate(due), description:'Created automatically from the '+RECURRENCE[t.recurrence].toLowerCase()+' schedule '+t.number+'.', type:t.type, category_id:t.category_id, department:t.department, branch_id:t.branch_id,
    items:JSON.parse(JSON.stringify(t.items||[])), needed_by:due, priority:t.priority, status:'pending', recurrence:'none', next_run:null, parent_id:t.id, req_id:null, assigned_to:null, completed_at:null, resolution:'', attachments:[], created_by:t.created_by, created_at:nowISO(), updated_at:nowISO()};
  if (!LIVE) row.number = Store.nextNumber('requests','RQ-');
  const r = await Store.insert('requests', row);
  await Store.update('requests', t.id, {next_run:nextRun(t.next_run||todayStr(), t.recurrence)});
  await Store.log('request', r, 'Created from schedule', t.number);
  await Store.notify([t.created_by, ...usersWhere(u=>u.role==='procurement')], 'request', r, 'New request '+r.number+' – '+r.title+' (from schedule '+t.number+')');
  return r;
}

Object.assign(App, {
  /* ---------- requests ---------- */
  requestForm(existing, preset){
    const r = existing || Object.assign({title:'', type:REQUEST_TYPES[0], description:'', category_id:'', department:me().department||'', branch_id:me().branch_id||'', items:[{description:'',qty:1}], needed_by:addDays(todayStr(),7), priority:'Normal', recurrence:'none'}, preset||{});
    this._rqEdit = existing || null;
    Ed.lines = (r.items||[]).map(i=>({description:i.description, qty:i.qty, unit_price:0})); Ed.priced=false; Ed.onChange=null;
    M.open(`${M.head(existing?'Edit '+esc(r.number):'New request')}<div class="modal-b">
      <div class="grid-form">
        <label class="f span-2" for="rq-title">What do you need? <span class="req">*</span><input id="rq-title" type="text" value="${esc(r.title)}" placeholder="e.g. Printer toner for the Bulawayo office"></label>
        <label class="f" for="rq-type">Type<select id="rq-type">${REQUEST_TYPES.map(t=>`<option ${t===r.type?'selected':''}>${esc(t)}</option>`).join('')}</select></label>
        <label class="f" for="rq-cat">Category<select id="rq-cat"><option value="">—</option>${catOpts().map(([id,n])=>`<option value="${id}" ${id===r.category_id?'selected':''}>${esc(n)}</option>`).join('')}</select></label>
        <label class="f" for="rq-dept">Department<select id="rq-dept">${(S().departments||[]).map(d=>`<option ${d===r.department?'selected':''}>${esc(d)}</option>`).join('')}</select></label>
        ${(S().branches||[]).length?`<label class="f" for="rq-branch">Branch<select id="rq-branch">${(S().branches||[]).map(b=>`<option value="${b.id}" ${b.id===r.branch_id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`:'<input type="hidden" id="rq-branch" value="">'}
        <label class="f" for="rq-need">Needed by<input id="rq-need" type="date" value="${r.needed_by||''}"></label>
        <label class="f" for="rq-prio">Priority<select id="rq-prio">${PRIORITIES.map(p=>`<option ${p===r.priority?'selected':''}>${p}</option>`).join('')}</select></label>
        <label class="f" for="rq-rec">Repeat<select id="rq-rec">${Object.entries(RECURRENCE).map(([k,l])=>`<option value="${k}" ${k===r.recurrence?'selected':''}>${esc(l)}</option>`).join('')}</select><span class="help">A repeating request creates a new pending request on each due date.</span></label>
        <label class="f span-all" for="rq-desc">Details<textarea id="rq-desc" placeholder="Anything that helps: model numbers, location, who to contact…">${esc(r.description||'')}</textarea></label>
      </div>
      <div><b>Items or services</b> <span class="faint" style="font-size:12.5px">Pick from the catalogue where possible so stores can issue them.</span>${Ed.html()}</div>
      ${fieldHTML({k:'rqfiles',label:'Attachments (photos, specs)',type:'files'})}
      <div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><span class="grow"></span><button class="btn" data-act="rq-save" data-mode="draft">Save draft</button><button class="btn primary" data-act="rq-save" data-mode="submit">Submit request</button></div>`);
    Ed.draw(); wireFiles('fm-rqfiles');
  },
  async requestSave(mode){
    const v = id => ($('#'+id).value||'').trim();
    const items = Ed.lines.filter(l=>String(l.description).trim()).map(l=>{ const it=Store.all('items').find(i=>i.name===String(l.description).trim()); return {item_id:it?it.id:null, description:String(l.description).trim(), qty:+l.qty||1}; });
    if (!v('rq-title') || (mode==='submit' && !items.length)) return M.err('Say what you need and add at least one item or service.');
    const rec = v('rq-rec');
    if (rec!=='none' && !v('rq-need')) return M.err('A repeating request needs a first due date.');
    M.busy(true);
    try{
      const data = {title:v('rq-title'), type:v('rq-type'), category_id:v('rq-cat')||null, department:v('rq-dept'), branch_id:v('rq-branch')||null, needed_by:v('rq-need')||null, priority:v('rq-prio'), recurrence:rec, description:v('rq-desc'), items};
      let r;
      if (this._rqEdit){ r = await Store.update('requests', this._rqEdit.id, Object.assign(data, rec!=='none'?{next_run:this._rqEdit.next_run||data.needed_by}:{})); await Store.log('request',r,'Edited',''); }
      else { const row = Object.assign({id:uid(), status:'draft', next_run:null, parent_id:null, req_id:null, assigned_to:null, completed_at:null, resolution:'', attachments:[], created_by:me().id, created_at:nowISO()}, data); if (!LIVE) row.number = Store.nextNumber('requests','RQ-'); r = await Store.insert('requests', row); await Store.log('request',r,'Draft saved',r.type); }
      const files = fileBins['fm-rqfiles']; if (files.length){ const a=(r.attachments||[]).slice(); for (const f of files) a.push(await Store.putFile(f,'requests/'+r.id,'support')); r = await Store.update('requests',r.id,{attachments:a}); }
      if (mode==='submit') r = await this.requestSubmit(r);
      M.close(); this.go('request', r.id); this.toast(mode==='submit'?(r.status==='scheduled'?'Schedule saved':'Request submitted — Procurement notified'):'Draft saved');
    }catch(e){ console.error(e); M.err(e.message||String(e)); M.busy(false); }
  },
  async requestSubmit(r){
    if (r.recurrence && r.recurrence!=='none'){
      r = await Store.update('requests', r.id, {status:'scheduled', next_run:r.next_run||r.needed_by||todayStr()});
      await Store.log('request',r,'Schedule created',RECURRENCE[r.recurrence]+' from '+fmtDate(r.next_run));
      await runSchedules();
      return Store.byId('requests', r.id);
    }
    r = await Store.update('requests', r.id, {status:'pending'});
    await Store.log('request',r,'Submitted',r.type);
    await Store.notify(usersWhere(u=>u.role==='procurement'),'request',r,'New request '+r.number+' – '+r.title+' from '+me().name);
    return r;
  },

  /* ---------- items ---------- */
  itemForm(rec){
    const nextNo = 'ITM-'+String(Store.all('items').reduce((m,i)=>Math.max(m,parseInt(String(i.item_number||'').replace(/\D/g,''))||0),0)+1).padStart(4,'0');
    formModal({title:rec?'Edit item':'Add new item', values:rec||{active:true, item_number:nextNo, track_stock:false, stock_qty:0, reorder_level:0},
      fields:[{k:'name',label:'Item name',req:1,span:2},{k:'item_number',label:'Item number',req:1},{k:'category_id',label:'Category',type:'select',options:catOpts()},{k:'uom',label:'Default unit of measure',ph:'per unit, per month…'},{k:'price',label:'Purchase price ('+baseCur()+')',type:'number',step:'0.01'},
        {k:'track_stock',label:'Track stock in stores',type:'bool'},{k:'reorder_level',label:'Reorder level',type:'number'},...(rec?[]:[{k:'stock_qty',label:'Opening stock quantity',type:'number'}]),{k:'active',label:'Active',type:'bool'}],
      onSave: async v => {
        if (Store.all('items').some(i=>i.item_number===v.item_number && (!rec||i.id!==rec.id))) throw new Error('Item number '+v.item_number+' is already used.');
        if (rec){ await Store.update('items',rec.id,v); await Store.log('item',Object.assign({},rec,v,{number:v.item_number}),'Item updated',v.name); return 'Item saved'; }
        const opening = +v.stock_qty||0; const row = Object.assign({id:uid(), created_at:nowISO(), updated_at:nowISO()}, v, {stock_qty:0});
        const x = await Store.insert('items', row); await Store.log('item',Object.assign({},x,{number:x.item_number}),'Item added',x.name);
        if (x.track_stock && opening) await stockMove(x, opening, 'Opening balance', '');
        return 'Item added';
      }});
  },
  stockForm(it){
    formModal({title:'Adjust stock · '+esc(it.name), intro:`<p class="muted" style="margin:0">On hand now: <b class="num">${it.stock_qty}</b> ${esc(it.uom||'')} · reorder at ${it.reorder_level}</p>`,
      fields:[{k:'dir',label:'Movement',type:'select',blank:false,options:[['in','Add to stock (received, returned, found)'],['out','Remove from stock (issued, damaged, lost)']]},{k:'qty',label:'Quantity',type:'number',req:1},{k:'reason',label:'Reason',req:1,ph:'e.g. stock count correction'},{k:'ref',label:'Reference',ph:'GRN, request or count sheet'}],
      onSave: async v => { const q=(v.dir==='out'?-1:1)*Math.abs(+v.qty||0); if (!q) throw new Error('Enter a quantity.'); if (it.stock_qty+q<0) throw new Error('That would take stock below zero.'); await stockMove(it,q,v.reason,v.ref); await Store.log('item',Object.assign({},it,{number:it.item_number}),'Stock adjusted',(q>0?'+':'')+q+' · '+v.reason); return 'Stock updated'; }});
  },
  async toggleFav(id){
    const u = me(), favs = (u.favourites||[]).slice(), i = favs.indexOf(id);
    if (i>-1) favs.splice(i,1); else favs.push(id);
    if (LIVE){ const {error}=await Store.sb.from('app_users').update({favourites:favs}).eq('id',u.id); if (error) throw error; }
    u.favourites = favs; Store.persist(); this.render();
  },

  /* ---------- categories ---------- */
  catForm(rec){
    const type = rec ? (rec.type||'item') : this.curTab('cats','item');
    formModal({title:(rec?'Edit ':'Add new ')+(type==='item'?'item category':'supplier category'), values:rec||{active:true, type, branch_id:''},
      fields:[{k:'name',label:'Category name',req:1,span:2},{k:'parent_id',label:'Parent category',type:'select',blank:'None (top level)',options:catOpts(type).filter(([id])=>!rec||id!==rec.id)},
        ...((S().branches||[]).length?[{k:'branch_id',label:'Branch',type:'select',blank:'Company-wide',options:branchOpts()}]:[]),{k:'description',label:'Description',type:'textarea'},{k:'active',label:'Active',type:'bool'}],
      onSave: async v => { v.parent_id=v.parent_id||null; v.branch_id=v.branch_id||null; v.type=type;
        if (rec){ await Store.update('categories',rec.id,v); await Store.log('category',Object.assign({},rec,v),'Category updated',v.name); }
        else { const x=await Store.insert('categories',Object.assign({id:uid(), created_at:nowISO(), updated_at:nowISO()},v)); await Store.log('category',x,'Category added',v.name); }
        return 'Category saved'; }});
  },
  async setCompanyWide(wide){
    const ids = $$('.cat-sel:checked').map(x=>x.value);
    if (!ids.length) return this.toast('Tick the categories to change first');
    const branch = this.branch || me().branch_id || ((S().branches||[])[0]||{}).id || null;
    for (const id of ids){ const c=Store.byId('categories',id); await Store.update('categories',id,{branch_id: wide?null:branch}); await Store.log('category',c, wide?'Made company-wide':'Limited to branch', wide?'':branchName(branch)); }
    this.render(); this.toast(ids.length+' categor'+(ids.length===1?'y':'ies')+(wide?' made company-wide':' limited to '+branchName(branch)));
  },

  /* ---------- delete master data only if never used ---------- */
  usageOf(t, id){
    if (t==='items'){ const it=Store.byId('items',id); const n=it.name.toLowerCase(); return Store.all('requisitions').filter(r=>(r.lines||[]).some(l=>String(l.description).toLowerCase()===n)).length + Store.all('purchase_orders').filter(p=>(p.lines||[]).some(l=>String(l.description).toLowerCase()===n)).length + Store.all('stock_moves').filter(m=>m.item_id===id).length + Store.all('requests').filter(r=>(r.items||[]).some(i=>i.item_id===id)).length; }
    if (t==='categories') return Store.all('items').filter(i=>i.category_id===id).length + Store.all('requisitions').filter(r=>r.category_id===id).length + Store.all('categories').filter(c=>c.parent_id===id).length + Store.all('suppliers').filter(s=>(s.category_ids||[]).includes(id)||(s.supplier_category_ids||[]).includes(id)).length + Store.all('budgets').filter(b=>b.category_id===id).length;
    if (t==='suppliers') return Store.all('requisitions').filter(r=>r.supplier_id===id).length + Store.all('purchase_orders').filter(p=>p.supplier_id===id).length + Store.all('contracts').filter(c=>c.supplier_id===id).length + Store.all('bids').filter(b=>b.supplier_id===id).length + Store.all('invoices').filter(v=>v.supplier_id===id).length;
    return 0;
  },
  confirmDelete(t, id, label, type){
    const used = this.usageOf(t, id);
    if (used){ M.open(`${M.head('Can’t delete '+esc(label))}<div class="modal-b"><p style="margin:0">It is used on ${used} record${used===1?'':'s'}, so it must stay for the audit trail. Deactivate it instead — it will no longer be offered on new records.</p></div><div class="modal-f"><button class="btn ghost" data-close>Close</button>${btn('Deactivate','data-act="deactivate" data-t="'+t+'" data-id="'+id+'"','primary')}</div>`, true); return; }
    M.open(`${M.head('Delete '+esc(label)+'?')}<div class="modal-b"><p style="margin:0">It has never been used, so it can be deleted. This can’t be undone; the deletion is recorded in the audit trail.</p></div><div class="modal-f"><button class="btn ghost" data-close>Cancel</button>${btn('Delete','data-act="delete-ok" data-t="'+t+'" data-id="'+id+'" data-type="'+type+'"','danger')}</div>`, true);
  },

  /* ---------- suppliers: import & portal invite ---------- */
  supImport(){
    M.open(`${M.head('Import suppliers from CSV')}<div class="modal-b">
      <p class="muted" style="margin:0">Use a CSV with a header row. Recognised columns: <span class="mono">name, contact, phone, email, country, address, tax_number, registration_no, bank_details</span>. Only <span class="mono">name</span> is required. Imported suppliers start as “Pending prequalification”. Names that already exist are skipped.</p>
      <label class="drop" for="imp-file">Choose a .csv file<input id="imp-file" type="file" accept=".csv,text/csv"></label>
      <div id="imp-preview"></div><div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-act="sup-import-ok" disabled id="imp-go">Import</button></div>`);
    $('#imp-file').addEventListener('change', async e=>{
      const f = e.target.files[0]; if (!f) return;
      const rows = parseCSV(await f.text());
      const head = (rows.shift()||[]).map(h=>h.trim().toLowerCase().replace(/\s+/g,'_'));
      if (!head.includes('name')){ M.err('The file needs a “name” column.'); return; }
      const have = new Set(Store.all('suppliers').map(s=>s.name.toLowerCase()));
      this._imp = rows.filter(r=>r.some(x=>x.trim())).map(r=>Object.fromEntries(head.map((h,i)=>[h,(r[i]||'').trim()]))).filter(o=>o.name);
      const fresh = this._imp.filter(o=>!have.has(o.name.toLowerCase()));
      this._imp = fresh;
      $('#imp-preview').innerHTML = `<p style="margin:0"><b>${fresh.length}</b> new supplier${fresh.length===1?'':'s'} ready to import${rows.length-fresh.length>0?`, ${rows.length-fresh.length} skipped (duplicates or blank)`:''}.</p>`+tableHTML([{h:'Name',v:o=>esc(o.name)},{h:'Contact',v:o=>esc(o.contact||'')},{h:'Phone',v:o=>esc(o.phone||'')},{h:'Country',v:o=>esc(o.country||'')}], fresh.slice(0,8));
      $('#imp-go').disabled = !fresh.length;
    });
  },
  async supImportOk(){
    M.busy(true);
    for (const o of this._imp||[]){
      const x = await Store.insert('suppliers',{id:uid(), name:o.name, contact:o.contact||'', phone:o.phone||'', email:o.email||'', country:o.country||'', address:o.address||'', tax_number:o.tax_number||'', registration_no:o.registration_no||'', bank_details:o.bank_details||'', category_ids:[], supplier_category_ids:[], tags:[], status:'pending', documents:[], reviews:[], notes:'Imported from CSV', active:true, created_at:nowISO(), updated_at:nowISO()});
      await Store.log('supplier',x,'Supplier imported','Pending prequalification');
    }
    const n = (this._imp||[]).length; M.close(); this.render(); this.toast(n+' supplier'+(n===1?'':'s')+' imported');
  },
  supInvite(id){
    formModal({title:'Invite to supplier portal', intro:'<p class="muted" style="margin:0">Creates a supplier portal login. In the live system the person also needs an account under Supabase → Authentication with the same email.</p>',
      values:{supplier_id:id||'', email:(Store.sup(id)||{}).email||'', name:((Store.sup(id)||{}).contact||'')},
      fields:[{k:'supplier_id',label:'Supplier',type:'select',req:1,options:opt('suppliers',s=>s.status==='approved')},{k:'name',label:'Contact person',req:1},{k:'email',label:'Email (their login)',type:'email',req:1}],
      onSave: async v => {
        if (Store.all('app_users').some(u=>u.email.toLowerCase()===v.email.toLowerCase())) throw new Error('A user with that email already exists.');
        const s = Store.sup(v.supplier_id);
        const u = await Store.insert('app_users',{id:uid(), name:v.name+' ('+s.name+')', email:v.email, role:'supplier', supplier_id:s.id, department:'', title:'Supplier portal user', branch_id:null, favourites:[], active:true, created_at:nowISO()});
        await Store.log('supplier',s,'Invited to supplier portal',v.email);
        await Store.notify([u.id],'supplier',s,'Welcome to the '+(S().company||'')+' supplier portal. You can now see RFQ invitations, purchase orders and submit invoices.');
        return s.name+' is now connected to the portal';
      }});
  },

  /* ---------- comments ---------- */
  async postComment(type, id){
    const box = $('#cm-body-'+id), body = (box.value||'').trim();
    if (!body) return this.toast('Write a comment first');
    const rec = entityOf(type, id);
    const row = {id:uid(), entity_type:type, entity_id:id, entity_number:rec.number, body, user_id:me().id, user_name:me().name, at:nowISO()};
    if (LIVE){ const {error}=await Store.sb.from('comments').insert(row); if (error) throw error; }
    Store.data.comments.push(row); Store.persist();
    const people = new Set([rec.created_by, rec.assigned_to, ...(rec.approver_ids||[]), ...commentsFor(id).map(c=>c.user_id), ...mentions(body)]);
    if (type==='po' || type==='rfq') Store.all('app_users').filter(u=>u.role==='supplier' && u.supplier_id===rec.supplier_id).forEach(u=>people.add(u.id));
    people.delete(me().id); people.delete(undefined); people.delete(null);
    await Store.notify([...people], type, rec, me().name+(mentions(body).length?' mentioned you on ':' commented on ')+rec.number+': '+body.slice(0,90)+(body.length>90?'…':''));
    this.render(); this.toast('Comment posted'+(people.size?' — '+people.size+' notified':''));
  },

  /* ---------- table columns ---------- */
  editCols(key){
    const all = this._colDefs[key]||[], hid = this.hidden[key]||[];
    M.open(`${M.head('Edit columns')}<div class="modal-b"><p class="muted" style="margin:0">Choose which columns to show in this table.</p><div class="checks" style="max-height:none">${all.map(c=>`<label class="chk"><input type="checkbox" class="col-chk" value="${esc(c)}" ${hid.includes(c)?'':'checked'}> ${esc(c)}</label>`).join('')}</div></div>
      <div class="modal-f"><button class="btn ghost" data-act="cols-reset" data-key="${key}">Show all</button><span class="grow"></span><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-act="cols-save" data-key="${key}">Apply</button></div>`, true);
  },
  saveCols(key, reset){
    const all = this._colDefs[key]||[];
    this.hidden[key] = reset ? [] : all.filter(c=>!$$('.col-chk:checked').map(x=>x.value).includes(c));
    try{ localStorage.setItem('pera-cols', JSON.stringify(this.hidden)); }catch(e){}
    M.close(); this.render();
  }
});
function parseCSV(text){
  const rows=[]; let row=[], cur='', q=false;
  for (let i=0;i<text.length;i++){ const c=text[i];
    if (q){ if (c==='"'){ if (text[i+1]==='"'){ cur+='"'; i++; } else q=false; } else cur+=c; }
    else if (c==='"') q=true; else if (c===','){ row.push(cur); cur=''; } else if (c==='\n'||c==='\r'){ if (c==='\r'&&text[i+1]==='\n') i++; row.push(cur); rows.push(row); row=[]; cur=''; } else cur+=c; }
  if (cur||row.length){ row.push(cur); rows.push(row); }
  return rows;
}

Object.assign(ACT, {
  'delegate':()=>{ const u=me(); App.menu=null;
    formModal({title:'Out of office - delegate my approvals', values:{delegate_to:u.delegate_to||'', delegate_until:u.delegate_until||''},
      intro:'<p class="muted" style="margin:0 0 10px">While this is set, the person you choose can approve or reject on your behalf. Every decision records that they acted for you. Clear the name to switch it off.</p>',
      fields:[{k:'delegate_to',label:'Delegate my approvals to',type:'select',blank:'Nobody (off)',options:Store.all('app_users').filter(x=>x.active && x.id!==u.id && x.role!=='supplier' && x.role!=='requisitioner').map(x=>[x.id,x.name+(x.title?' – '+x.title:'')])},
              {k:'delegate_until',label:'Until (inclusive)',type:'date'}],
      onSave: async v => { const patch={delegate_to:v.delegate_to||null, delegate_until:v.delegate_to?(v.delegate_until||null):null};
        await Store.update('app_users',u.id,patch); Object.assign(u,patch);
        await Store.log('user',{id:u.id,number:u.name},patch.delegate_to?'Approvals delegated':'Delegation ended', patch.delegate_to?'To '+Store.user(patch.delegate_to).name+(patch.delegate_until?' until '+fmtDate(patch.delegate_until):''):'');
        if (patch.delegate_to) await Store.notify([patch.delegate_to],'user',{id:u.id},u.name+' has delegated their approvals to you'+(patch.delegate_until?' until '+fmtDate(patch.delegate_until):''));
        return patch.delegate_to?'Approvals delegated':'Delegation switched off'; }}); },
  'audit-verify': async ()=>{
    if (!LIVE){ App._auditCheck={ok:true,msg:'Demo mode: the tamper-evident hash chain is kept by the live database. Connect Supabase to verify it.'}; return App.render(); }
    try{ const {data,error}=await Store.sb.rpc('audit_verify'); if (error) throw error; const r=(data&&data[0])||data||{};
      App._auditCheck = r.ok ? {ok:true,msg:'Integrity verified ✓ - all '+(r.entries||0)+' audit entries chain correctly; none has been altered or removed.'} : {ok:false,msg:'INTEGRITY FAILURE at audit entry #'+r.broken_at+' - the trail has been altered outside Pera. Investigate immediately.'};
    }catch(e){ App._auditCheck={ok:false,msg:'Could not verify: '+(e.message||e)}; }
    App.render(); },
  'create-menu':()=>{ App.menu = App.menu==='create'?null:'create'; App.render(); },
  'user-menu':()=>{ App.menu = App.menu==='user'?null:'user'; App.render(); },
  'sup-more':()=>{ App.menu = App.menu==='sup-more'?null:'sup-more'; App.render(); },
  'new-expense':()=>{ App.menu=null; App.render(); App.reqForm(null,{kind:'expense', payee:me().name, expense_date:todayStr(), due_date:addDays(todayStr(),14)}); },
  'new-req':()=>{ App.menu=null; App.render(); App.reqForm(); },
  'new-request':()=>{ App.menu=null; App.render(); App.requestForm(); },
  'new-contract':()=>{ App.menu=null; App.render(); App.ctForm(); },
  'new-po':()=>{ App.menu=null; App.render(); App.newPoPicker(); },
  'rfq-new':(t)=>{ App.menu=null; if (!t.dataset.id) App.render(); App.rfqForm(t.dataset.id); },
  'req-edit-id':(t)=>App.reqForm(Store.byId('requisitions',t.dataset.id)),
  duplicate:(t)=>App.duplicate(Store.byId('requisitions',t.dataset.id)),
  'po-edit':(t)=>App.poForm(null, Store.byId('purchase_orders',t.dataset.id)),
  'po-submit': async ()=>{ const p=Store.byId('purchase_orders',App.param); await App.poSubmit(p); App.render(); App.toast('Purchase order submitted'); },
  'po-print':(t)=>{ App.go('po',t.dataset.id); setTimeout(()=>window.print(),300); },
  'po-new':(t)=>{ M.close(); App.poForm(t.dataset.id); },
  'ct-submit': async ()=>{ await App.ctSubmit(Store.byId('contracts',App.param)); App.render(); App.toast('Contract submitted'); },
  'ct-terminate':()=>{ const c=Store.byId('contracts',App.param); formModal({title:'Terminate '+esc(c.number), save:'Terminate', fields:[{k:'reason',label:'Reason',type:'textarea',req:1},{k:'date',label:'Effective date',type:'date',req:1}], values:{date:todayStr()}, onSave: async v=>{ await Store.update('contracts',c.id,{status:'terminated', end_date:v.date}); await Store.log('contract',c,'Terminated',fmtDate(v.date)+' — '+v.reason); return 'Contract terminated'; }}); },
  /* requests */
  'rq-save':(t)=>App.requestSave(t.dataset.mode),
  'rq-edit':()=>App.requestForm(Store.byId('requests',App.param)),
  'rq-submit': async ()=>{ const r=await App.requestSubmit(Store.byId('requests',App.param)); App.render(); App.toast(r.status==='scheduled'?'Schedule saved':'Request submitted'); },
  'rq-dup':(t)=>{ const r=Store.byId('requests',t.dataset.id); App.requestForm(null,{title:r.title+' (copy)', type:r.type, category_id:r.category_id, department:r.department, branch_id:r.branch_id, items:r.items, priority:r.priority, description:r.description}); },
  'rq-accept':()=>{ const r=Store.byId('requests',App.param); formModal({title:'Accept '+esc(r.number), save:'Accept & assign', values:{assigned_to:me().id}, fields:[{k:'assigned_to',label:'Assign to',type:'select',blank:false,options:Store.all('app_users').filter(u=>u.active&&u.role!=='supplier').map(u=>[u.id,u.name+' — '+(u.title||'')])},{k:'note',label:'Note to requester',type:'textarea'}],
      onSave: async v=>{ await Store.update('requests',r.id,{status:'open', assigned_to:v.assigned_to}); await Store.log('request',r,'Accepted','Assigned to '+Store.user(v.assigned_to).name+(v.note?' — '+v.note:'')); await Store.notify([r.created_by, v.assigned_to],'request',r,r.number+' accepted and assigned to '+Store.user(v.assigned_to).name); return 'Request accepted'; }}); },
  'rq-issue': async ()=>{ const r=Store.byId('requests',App.param);
    for (const i of r.items){ const it=Store.byId('items',i.item_id); if (!it || it.stock_qty < i.qty) return App.toast('Not enough '+(it?it.name:i.description)+' in stores'); }
    for (const i of r.items){ await stockMove(Store.byId('items',i.item_id), -i.qty, 'Issued', r.number); }
    await Store.update('requests',r.id,{status:'completed', completed_at:nowISO(), resolution:'Issued from stores.'});
    await Store.log('request',r,'Issued from stores',r.items.map(i=>i.qty+' × '+i.description).join('; ')); await Store.log('request',r,'Completed','Issued from stores.');
    await Store.notify([r.created_by],'request',r,r.number+' – your items have been issued from stores'); App.render(); App.toast('Issued from stores — stock updated'); },
  'rq-convert':()=>{ const r=Store.byId('requests',App.param); const cat=r.category_id; const b=Store.all('budgets').find(x=>x.category_id===cat&&x.active);
    App.reqForm(null,{_request:r.id, _from:'Converted from request '+r.number, title:r.title, kind:'purchase', category_id:cat, budget_id:b?b.id:'', department:r.department, branch_id:r.branch_id, due_date:r.needed_by, description:(r.description||r.title)+'\n\nFrom request '+r.number+' by '+Store.user(r.created_by).name+'.', lines:r.items.map(i=>{ const it=Store.byId('items',i.item_id); return {description:i.description, qty:i.qty, unit_price:it?+it.price||0:0}; })}); },
  'rq-complete':()=>{ const r=Store.byId('requests',App.param); formModal({title:'Complete '+esc(r.number), save:'Mark completed', fields:[{k:'resolution',label:'What was done?',type:'textarea',req:1}], onSave: async v=>{ await Store.update('requests',r.id,{status:'completed', completed_at:nowISO(), resolution:v.resolution}); await Store.log('request',r,'Completed',v.resolution); await Store.notify([r.created_by],'request',r,r.number+' is completed: '+v.resolution); return 'Request completed'; }}); },
  'rq-cancel':()=>{ const r=Store.byId('requests',App.param); formModal({title:(r.status==='scheduled'?'Stop schedule ':'Cancel ')+esc(r.number), save:r.status==='scheduled'?'Stop schedule':'Cancel request', fields:[{k:'reason',label:'Reason',type:'textarea',req:1}], onSave: async v=>{ await Store.update('requests',r.id,{status:'cancelled', resolution:v.reason}); await Store.log('request',r,r.status==='scheduled'?'Schedule stopped':'Cancelled',v.reason); if (r.created_by!==me().id) await Store.notify([r.created_by],'request',r,r.number+' was cancelled: '+v.reason); return 'Done'; }}); },
  'rq-run': async ()=>{ const t=Store.byId('requests',App.param); const r=await createFromSchedule(t, todayStr()); App.go('request',r.id); App.toast(r.number+' created from the schedule'); },
  /* items */
  'item-new':()=>App.itemForm(), 'item-edit':(t)=>App.itemForm(Store.byId('items',t.dataset.id)),
  'item-del':(t)=>App.confirmDelete('items',t.dataset.id,Store.byId('items',t.dataset.id).name,'item'),
  'stock-adj':(t)=>App.stockForm(Store.byId('items',t.dataset.id)),
  fav:(t)=>App.toggleFav(t.dataset.id),
  /* categories */
  'cat-new':()=>App.catForm(), 'cat-edit':(t)=>App.catForm(Store.byId('categories',t.dataset.id)),
  'cat-del':(t)=>App.confirmDelete('categories',t.dataset.id,Store.catName(t.dataset.id),'category'),
  'cat-wide':()=>App.setCompanyWide(true), 'cat-unwide':()=>App.setCompanyWide(false),
  'cat-all':(t)=>$$('.cat-sel').forEach(x=>x.checked=t.checked),
  /* suppliers */
  'sup-edit-id':(t)=>App.supForm(Store.sup(t.dataset.id)),
  'sup-del':(t)=>App.confirmDelete('suppliers',t.dataset.id,Store.supName(t.dataset.id),'supplier'),
  'sup-deact':(t)=>{ App.param=t.dataset.id; App.supStatus(Store.sup(t.dataset.id),'suspended'); },
  'sup-act':(t)=>{ App.param=t.dataset.id; App.supStatus(Store.sup(t.dataset.id),'approved'); },
  'sup-import':()=>{ App.menu=null; App.render(); App.supImport(); },
  'sup-import-ok':()=>App.supImportOk(),
  'sup-invite':(t)=>{ App.menu=null; App.render(); App.supInvite(t.dataset.id || (App.view==='supplier'?App.param:'')); },
  deactivate: async (t)=>{ const tbl=t.dataset.t, rec=Store.byId(tbl,t.dataset.id); const patch = tbl==='suppliers'?{status:'suspended',active:false}:{active:false}; await Store.update(tbl,rec.id,patch); await Store.log(tbl==='suppliers'?'supplier':tbl==='items'?'item':'category',Object.assign({},rec,{number:rec.item_number||rec.name}),'Deactivated',''); M.close(); App.render(); App.toast('Deactivated'); },
  'delete-ok': async (t)=>{ const tbl=t.dataset.t, rec=Store.byId(tbl,t.dataset.id); await Store.remove(tbl,rec.id); await Store.log(t.dataset.type,{id:rec.id,number:rec.item_number||rec.name},'Deleted',rec.name); M.close(); App.render(); App.toast('Deleted'); },
  /* comments, columns */
  comment:(t)=>App.postComment(t.dataset.type, t.dataset.id),
  'edit-cols':(t)=>App.editCols(t.dataset.key),
  'cols-save':(t)=>App.saveCols(t.dataset.key,false),
  'cols-reset':(t)=>App.saveCols(t.dataset.key,true),
  _user:(rec)=>App.simpleForm('app_users',rec,'user',[{k:'name',label:'Full name',req:1},{k:'email',label:'Email (used to sign in)',type:'email',req:1},{k:'title',label:'Job title'},{k:'department',label:'Department',type:'select',options:deptOpts()},...((S().branches||[]).length?[{k:'branch_id',label:'Branch',type:'select',options:branchOpts()}]:[]),{k:'role',label:'Role',type:'select',blank:false,options:Object.entries(ROLE_LABEL)},{k:'supplier_id',label:'Supplier (portal users only)',type:'select',options:opt('suppliers')}],'user'),
  'user-new':()=>ACT._user(), 'user-edit':(t)=>ACT._user(Store.byId('app_users',t.dataset.id)),
  _bud:(rec)=>App.simpleForm('budgets',rec,'budget line',[{k:'code',label:'Budget code',req:1},{k:'name',label:'Name',req:1},{k:'department',label:'Department',type:'select',options:deptOpts()},...((S().branches||[]).length?[{k:'branch_id',label:'Branch',type:'select',blank:'Company-wide',options:branchOpts()}]:[]),{k:'category_id',label:'Category',type:'select',options:catOpts()},{k:'year',label:'Year',type:'number'},{k:'amount',label:'Amount ('+baseCur()+')',type:'number',step:'0.01',req:1}],'budget'),
  'budget-new':()=>ACT._bud(), 'budget-edit':(t)=>ACT._bud(Store.byId('budgets',t.dataset.id))
});

/* extra click targets: dashboard tabs & controls, messages, paging, toggles */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-dtab],[data-due],[data-msg],[data-pg],[data-toggle],[data-clear]');
  if (!t) return;
  if (t.dataset.dtab){ App.dashTab = t.dataset.dtab; if (App.view!=='dashboard') return App.go('dashboard'); return App.render(); }
  if (t.dataset.due){ App.dash.due = t.dataset.due; App.dashTab='analytics'; if (App.view!=='dashboard') return App.go('dashboard'); App.render(); const el=$('.due-list'); el&&el.scrollIntoView({block:'center'}); return; }
  if (t.dataset.msg){ App.msgSel = t.dataset.msg; return App.view==='messages' ? App.render() : App.go('messages'); }
  if (t.dataset.pg){ const [k,d]=t.dataset.pg.split(':'); App.pg[k].page = Math.max(0, App.pg[k].page + (+d)); return App.render(); }
  if (t.dataset.toggle){ const [k,f]=t.dataset.toggle.split('.'); App.f[k]=App.f[k]||{}; App.f[k][f]=!App.f[k][f]; if (App.pg[k]) App.pg[k].page=0; return App.render(); }
  if (t.dataset.clear){ const k=t.dataset.clear; App.f[k]={_more:true}; return App.render(); }
});
document.addEventListener('change', e=>{
  const t = e.target;
  if (t.dataset.act==='branch'){ App.branch = t.value; return App.render(); }
  if (t.dataset.act==='dash-view'){ App.dashView = t.value; return App.render(); }
  if (t.dataset.act==='cat-all'){ $$('.cat-sel').forEach(x=>x.checked=t.checked); return; }
  if (t.dataset.dash){ App.dash[t.dataset.dash] = t.value; return App.render(); }
  if (t.dataset.pgsize){ const k=t.dataset.pgsize; App.pg[k] = {size:+t.value, page:0}; return App.render(); }
  if (t.dataset.filter && t.type!=='text'){ const [k]=t.dataset.filter.split('.'); if (App.pg[k]) App.pg[k].page=0; }
});
try{ App.hidden = JSON.parse(localStorage.getItem('pera-cols')||'{}') || {}; }catch(e){}
