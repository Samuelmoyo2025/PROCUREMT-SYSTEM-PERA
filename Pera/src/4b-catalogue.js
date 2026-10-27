  /* ---------------- suppliers ---------------- */
  supplierList(){
    const u = me();
    const rows = Store.all('suppliers').slice().sort((a,b)=>a.name.localeCompare(b.name));
    const T = [['all','All'],['active','Active'],['pending','Pending'],['inactive','Inactive'],['attention','Needs attention']];
    const pick = k => k==='all'?rows : k==='active'?rows.filter(s=>s.status==='approved') : k==='pending'?rows.filter(s=>s.status==='pending') : k==='inactive'?rows.filter(s=>['suspended','blacklisted'].includes(s.status)) : rows.filter(s=>supExpired(s).length);
    const countries = [...new Set(rows.map(s=>s.country).filter(Boolean))].sort();
    const fo = {ph:'Search name, contact, phone, tag…', dates:false, more:[{k:'cat',label:'Supplies',options:catOpts(),get:s=>(s.category_ids||[]).includes(App.f.sup.cat)?App.f.sup.cat:''},{k:'scat',label:'Supplier category',options:catOpts('supplier'),get:s=>(s.supplier_category_ids||[]).includes(App.f.sup.scat)?App.f.sup.scat:''},{k:'country',label:'Country',options:countries.map(c=>[c,c]),get:s=>s.country},{k:'conn',label:'Connection',options:[['yes','Connected'],['no','Not connected']],get:s=>supConnected(s)?'yes':'no'},{k:'tag',label:'Profile',options:ESG_TAGS.map(t=>[t,t]),get:s=>(s.tags||[]).includes(App.f.sup.tag)?App.f.sup.tag:''}]};
    App.f.sup = App.f.sup || {};
    const list = applyFilters(pick(this.curTab('sup','all')),'sup',Object.assign({},fo,{text:s=>[s.name,s.contact,s.email,s.phone,s.country,(s.tags||[]).join(' ')].join(' ')}));
    this._export = ['suppliers',list];
    const acts = s => `<span class="acts">${ibtn('edit','Edit',`data-act="sup-edit-id" data-id="${s.id}"`)}${ibtn('trash','Delete',`data-act="sup-del" data-id="${s.id}"`)}${s.status==='approved'?ibtn('power','Deactivate',`data-act="sup-deact" data-id="${s.id}"`):ibtn('check','Activate',`data-act="sup-act" data-id="${s.id}"`)}</span>`;
    return `${pageHead('Suppliers','Prequalify suppliers before they can be used, keep compliance documents current and rate every delivery.', (can.procure(u)?`<div class="pop-wrap">${btn('More actions','data-act="sup-more"','','plus')}${this.menu==='sup-more'?`<div class="dropdown menu" role="menu"><button class="mi" data-act="sup-import">${I.up}<span><b>Import from CSV</b><small>Add many suppliers at once</small></span></button><button class="mi" data-act="export">${I.down}<span><b>Export to CSV</b><small>The list as filtered</small></span></button>${mod('portal')?`<button class="mi" data-act="sup-invite">${I.portal}<span><b>Invite to supplier portal</b><small>Give a supplier a login</small></span></button>`:''}</div>`:''}</div>`+btn('Add new supplier','data-act="sup-new"','primary','plus'):btn('Export CSV','data-act="export"','','down')))}
      <section class="panel">${this.tabs('sup',T,k=>pick(k).length)}${filterBar('sup',fo)}
      ${tableHTML([
        {h:'Company name',cls:'name',v:s=>`${esc(s.name)}<small>${(s.category_ids||[]).map(c=>esc(Store.catName(c))).join(', ')}</small>`},
        {h:'Status',v:s=>pill(...(SUP_STATUS[s.status]||[s.status,'t-grey']))+(supExpired(s).length?' '+pill(supExpired(s).length+' doc expired','t-red'):'')},
        {h:'Main contact',v:s=>esc(s.contact||'TBA')},
        {h:'Connection',v:s=>supConnected(s)?pill('Connected','t-green'):pill('Not connected','t-amber')},
        {h:'Phone number',cls:'nw',v:s=>esc(s.phone||'')},{h:'Country',v:s=>esc(s.country||'')},
        {h:'Supplier category',v:s=>(s.supplier_category_ids||[]).map(c=>esc(Store.catName(c))).join(', ')||'—'},
        {h:'Rating',v:s=>stars(supRating(s))},
        {h:'Last edited',cls:'nw',v:s=>fmtDate(s.updated_at||s.created_at)},
        ...(can.procure(u)?[{h:'Actions',r:1,fixed:1,v:acts}]:[])
      ], list, {key:'sup', open:s=>'supplier:'+s.id, empty:'No suppliers match.'})}</section>`;
  },

  /* ---------------- contracts ---------------- */
  contractList(){
    const u = me();
    const rows = Store.all('contracts').filter(inBranch).slice().sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const T=[['all','All'],['pending','Pending'],['open','Open'],['drafts','Drafts'],['closed','Closed'],['expiring','Expiring soon']];
    const pick = k => k==='all'?rows : k==='expiring'?rows.filter(c=>contractState(c)[0].startsWith('Expires')) : rows.filter(c=>contractTab(c)===k);
    const fo = {ph:'Search contract, supplier…', total:true, mine:'View my own contracts', more:[{k:'sup',label:'Supplier',options:supOpts(),get:c=>c.supplier_id},{k:'type',label:'Type',options:CONTRACT_TYPES.map(t=>[t,t]),get:c=>c.type}]};
    const list = applyFilters(pick(this.curTab('ct','all')),'ct',Object.assign({},fo,{text:c=>[c.title,c.number,Store.supName(c.supplier_id),c.type].join(' '), date:c=>c.start_date, amount:c=>toBase(c.currency,c.value), mineFn:c=>c.created_by===u.id}));
    return `${pageHead('Contracts','Agreed prices and terms with suppliers. New contracts are approved before they become active. You are warned before a contract expires.', can.procure(u)?btn('Create contract','data-act="new-contract"','primary','plus'):'')}
      <section class="panel">${this.tabs('ct',T,k=>pick(k).length)}${filterBar('ct',fo)}${tableHTML([
        {h:'Contract',cls:'name',v:c=>`${esc(c.title)}<small class="mono">${esc(c.number)} · ${esc(c.type)}</small>`},
        {h:'Supplier',v:c=>esc(Store.supName(c.supplier_id))},
        {h:'Status',v:c=>pill(...contractState(c))},{h:'Approvals',v:c=>votes(c)},{h:'Start',cls:'nw',v:c=>fmtDate(c.start_date)},{h:'End',cls:'nw',v:c=>fmtDate(c.end_date)},
        {h:'Value',r:1,cls:'num',v:c=>fmtMoney(c.currency,c.value)},
        {h:'Used',r:1,cls:'num',v:c=>{const x=baseSum(Store.all('requisitions').filter(r=>r.contract_id===c.id&&['approved','paid'].includes(r.status))); return c.value?Math.round(x/toBase(c.currency,c.value)*100)+'%':'—';}},
        {h:'Created by',v:c=>esc(Store.user(c.created_by).name)},
        {h:'Actions',r:1,fixed:1,v:c=>`<span class="acts">${(c.attachments||[]).length?ibtn('eye','View document',`data-view="contracts:${c.id}:${c.attachments[0].id}"`):''}${can.procure(u)&&['draft','active'].includes(c.status)?ibtn('edit','Edit',`data-act="ct-edit" data-id="${c.id}"`):''}</span>`}
      ], list, {key:'ct', open:c=>'contract:'+c.id, empty:'No contracts here.'})}</section>`;
  },

  /* ---------------- items ---------------- */
  itemsPage(){
    const u = me(), favs = u.favourites||[];
    const rows = Store.all('items').slice().sort((a,b)=>a.name.localeCompare(b.name));
    const T = [['all','All'],['active','Active'],['inactive','Inactive'],['fav','Favourite']].concat(mod('inventory')?[['stock','Stock']]:[]);
    const pick = k => k==='all'?rows : k==='active'?rows.filter(i=>i.active) : k==='inactive'?rows.filter(i=>!i.active) : k==='fav'?rows.filter(i=>favs.includes(i.id)) : rows.filter(i=>i.track_stock);
    const tab = this.curTab('items','all');
    const fo = {ph:'Search item name or number…', dates:false, more:[{k:'cat',label:'Category',options:catOpts(),get:i=>i.category_id}]};
    const list = applyFilters(pick(tab),'items',Object.assign({},fo,{text:i=>[i.name,i.item_number].join(' ')}));
    const stockCols = tab==='stock' ? [{h:'On hand',r:1,cls:'num',v:i=>`<b class="${i.stock_qty<=i.reorder_level?'over':''}">${i.stock_qty}</b>`},{h:'Reorder at',r:1,cls:'num',v:i=>i.reorder_level},{h:'Stock value',r:1,cls:'num',v:i=>num(i.stock_qty*(+i.price||0))}] : [];
    const acts = i => `<span class="acts">${can.master(u)?ibtn('edit','Edit',`data-act="item-edit" data-id="${i.id}"`)+ibtn('trash','Delete',`data-act="item-del" data-id="${i.id}"`):''}${i.track_stock&&can.procure(u)&&mod('inventory')?ibtn('box','Adjust stock',`data-act="stock-adj" data-id="${i.id}"`):''}${ibtn(favs.includes(i.id)?'starOn':'star',favs.includes(i.id)?'Remove from favourites':'Add to favourites',`data-act="fav" data-id="${i.id}"`, favs.includes(i.id)?'on':'')}</span>`;
    const moves = tab==='stock' ? Store.all('stock_moves').slice().sort((a,b)=>b.at.localeCompare(a.at)).slice(0,15) : [];
    return `${pageHead('Items','Standard goods and services with their unit of measure and purchase price. Tick “track stock” to manage stores quantities.', can.master(u)?btn('Add new item','data-act="item-new"','primary','plus'):'')}
      <section class="panel">${this.tabs('items',T,k=>pick(k).length)}${filterBar('items',fo)}
      ${tableHTML([{h:'Item name',cls:'name',v:i=>`${esc(i.name)}<small>${esc(Store.catName(i.category_id))}</small>`},{h:'Item number',cls:'mono',v:i=>esc(i.item_number||'')},{h:'Status',v:i=>pill(i.active?'Active':'Inactive',i.active?'t-green':'t-grey')},{h:'Purchase price',r:1,cls:'num',v:i=>i.price?fmtMoney(baseCur(),i.price):'<span class="faint">NA</span>'},{h:'Default UOM',v:i=>esc(i.uom||'')},...stockCols,{h:'Last edited',cls:'nw',v:i=>fmtDate(i.updated_at||i.created_at)},{h:'Actions',r:1,fixed:1,v:acts}], list, {key:'items', empty:tab==='fav'?'No favourites yet. Tap the star on any item.':'Nothing here.'})}</section>
      ${tab==='stock'?panel('Recent stock movements','',tableHTML([{h:'When',cls:'nw mono',v:m=>fmtDT(m.at)},{h:'Item',v:m=>esc((Store.byId('items',m.item_id)||{}).name||'')},{h:'Change',r:1,cls:'num',v:m=>`<b class="${m.qty<0?'over':''}">${m.qty>0?'+':''}${m.qty}</b>`},{h:'Reason',v:m=>esc(m.reason)},{h:'Reference',cls:'mono',v:m=>esc(m.ref||'')},{h:'By',v:m=>esc(m.user_name)}], moves, {empty:'No movements yet.'})):''}`;
  },

  /* ---------------- categories ---------------- */
  categoriesPage(){
    const u = me(), type = this.curTab('cats','item');
    const all = Store.all('categories');
    const rows = applyFilters(all.filter(c=>(c.type||'item')===type).filter(c=>!App.branch||!c.branch_id||c.branch_id===App.branch),'cats',{text:c=>[c.name,c.description].join(' ')}).sort((a,b)=>catPath(a).localeCompare(catPath(b)));
    const records = c => type==='item' ? Store.all('items').filter(i=>i.category_id===c.id).length : Store.all('suppliers').filter(s=>(s.supplier_category_ids||[]).includes(c.id)).length;
    const T = [['item','Item categories'],['supplier','Supplier categories']];
    return `${pageHead('Categories','Item categories group what you buy for reporting and budgets. Supplier categories classify who you buy from. A category can belong to one branch or be company-wide.',
        can.master(u)?btn('Unmake company-wide','data-act="cat-unwide"','ghost')+btn('Make company-wide','data-act="cat-wide"','ghost')+btn(type==='item'?'Add new item category':'Add new supplier category','data-act="cat-new"','primary','plus'):'')}
      <section class="panel">${this.tabs('cats',T,k=>all.filter(c=>(c.type||'item')===k).length)}${filterBar('cats',{ph:'Search categories…', dates:false})}
      ${tableHTML([
        ...(can.master(u)?[{h:'<input type="checkbox" data-act="cat-all" aria-label="Select all">',fixed:1,v:c=>`<input type="checkbox" class="cat-sel" value="${c.id}" aria-label="Select ${esc(c.name)}" data-stop>`}]:[]),
        {h:'Category name',cls:'name',v:c=>`${c.parent_id?'<span class="faint">↳ </span>':''}${esc(c.name)}${c.description?`<small>${esc(c.description)}</small>`:''}`},
        {h:'Records',r:1,cls:'num',v:c=>records(c)+' '+(type==='item'?'items':'suppliers')},
        {h:'Created on',cls:'nw',v:c=>fmtDate(c.created_at)},
        {h:'Branch',v:c=>c.branch_id?esc(branchName(c.branch_id)):pill('Company-wide','t-blue')},
        {h:'Parent category',v:c=>c.parent_id?esc(Store.catName(c.parent_id)):'—'},
        {h:'Status',v:c=>pill(c.active?'Active':'Inactive',c.active?'t-green':'t-grey')},
        ...(can.master(u)?[{h:'Actions',r:1,fixed:1,v:c=>`<span class="acts">${ibtn('edit','Edit',`data-act="cat-edit" data-id="${c.id}"`)}${ibtn('trash','Delete',`data-act="cat-del" data-id="${c.id}"`)}</span>`}]:[])
      ], rows, {key:'cats', empty:'No categories yet.'})}</section>`;
  },

  /* ---------------- messages ---------------- */
  messagesPage(){
    const threads = this.myThreads();
    const sel = this.msgSel && threads.find(t=>t.id===this.msgSel) ? this.msgSel : (threads[0]||{}).id;
    const t = threads.find(x=>x.id===sel);
    const rec = t && entityOf(t.type, t.id);
    // mark as seen
    if (me().msg_seen_at !== nowISO().slice(0,16)){ Store.me.msg_seen_at = nowISO(); Store.persist(); }
    const TL = {requisition:'Requisition',expense:'Expense',po:'Purchase order',contract:'Contract',request:'Request',rfq:'RFQ'};
    return `${pageHead('Messages','Conversations about requisitions, expenses, orders, contracts and requests. Type @ and a first name to notify someone.')}
      <div class="msg-wrap panel">
        <div class="msg-list">${threads.length?threads.map(x=>`<button class="li ${x.id===sel?'sel':''}" data-msg="${x.id}"><div class="avatar">${esc(initials(x.last.user_name))}</div><div class="t"><b>${esc(TL[x.type]||x.type)} <span class="mono">${esc(x.number||'')}</span></b><span>${esc(x.last.user_name)}: ${esc(x.last.body.slice(0,70))}</span></div><span class="faint" style="font-size:11.5px;white-space:nowrap">${fmtDate(x.last.at)}</span></button>`).join(''):'<div class="empty">No conversations yet. Open any requisition, order or contract and post a comment.</div>'}</div>
        <div class="msg-thread">${t&&rec?`<div class="panel-h"><div><h2>${esc(rec.title||('Purchase order – '+Store.supName(rec.supplier_id)))}</h2><span class="faint mono">${esc(TL[t.type])} ${esc(rec.number)}</span></div>${me().role==='supplier'?'':btn('Open record',`data-open="${t.type}:${t.id}"`,'sm')}</div>${this.commentsBody(t.type, rec)}`:'<div class="empty">Select a conversation.</div>'}</div>
      </div>`;
  },
  commentsBody(type, rec){
    const list = commentsFor(rec.id);
    return `<div class="comments">${list.length?list.map(c=>`<div class="cm ${c.user_id===me().id?'mine':''}"><div class="avatar">${esc(initials(c.user_name))}</div><div><div class="cm-h"><b>${esc(c.user_name)}</b><time>${fmtDT(c.at)}</time></div><p>${esc(c.body).replace(/@(\w+)/g,'<span class="mention">@$1</span>')}</p></div></div>`).join(''):'<p class="faint" style="margin:0">No comments yet.</p>'}</div>
      <div class="cm-new"><label class="f" for="cm-body-${rec.id}" style="flex:1">Add a comment<textarea id="cm-body-${rec.id}" placeholder="Ask a question or add context. Type @ and a first name to notify someone."></textarea></label>${btn('Post','data-act="comment" data-type="'+type+'" data-id="'+rec.id+'"','primary')}</div>`;
  },
  commentsPanel(type, rec){ return panel('Comments','<span class="faint">'+commentsFor(rec.id).length+'</span>', `<div class="panel-b">${this.commentsBody(type, rec)}</div>`); },

  /* ---------------- help center ---------------- */
  helpPage(){
    const q = ((this.f.help||{}).q||'').toLowerCase();
    const sup = S().support||{};
    const sections = [
      ['Getting started', [
        ['What is Pera?','Pera runs every purchase and payment through one approval path. You raise a requisition (to buy or pay) or an expense (to claim back money you spent), attach the supporting documents, and the approvers for that amount are notified. After approval, Finance reviews it, Procurement orders it or Finance pays it, and every step is recorded in the audit trail.'],
        ['Which role am I?','Your role is shown in the menu under your name at the top right. Requisitioners raise requests; approvers (usually executives) approve or reject; Procurement sources and orders; Finance reviews, captures invoices and pays; administrators manage settings and users. Suppliers use the supplier portal.'],
        ['What do the branches mean?','If your company has several branches, each record belongs to one. Use the branch picker at the top of the page (or the Company/branch level view on the dashboard) to see one branch at a time.']]],
      ['Requisitions & expenses', [
        ['How do I raise a requisition?','Click Create → Requisition. Choose Purchase (goods or services that need a purchase order) or Direct payment (fees, petty cash, claims). Fill in the lines, choose the budget line, attach quotes or invoices and click Submit for approval.'],
        ['Who approves my requisition?','The approval route depends on the amount, converted to the base currency. Everyone in that tier is notified; the required number must approve. You can see the route and each decision on the requisition page.'],
        ['What is “Pending review”?','After the approvers agree, Finance checks the budget code and documents before releasing it. If something is wrong they return it with a note.'],
        ['How do I claim back money I spent?','Use Create → Expense. Add the expense date, the amounts and a photo or scan of each receipt. Once approved and reviewed, Finance reimburses the payee.'],
        ['Can I copy an old requisition?','Yes. Click the copy icon in the Actions column of the Requisitions or Expenses list, or Duplicate on the record. A new draft opens with the same lines.'],
        ['What does Smart scan do?','Smart scan reads a PDF or photo of a quote, invoice or receipt and fills in the supplier, reference, dates, amounts and lines for you to check. It works best on typed PDFs; photos are read with text recognition and may need correcting.']]],
      ['Requests', [
        ['When do I use a request instead of a requisition?','Use a request for things from stores, repairs, IT support or facilities work. Procurement either issues the items from stock or converts the request into a requisition if it needs to be bought.'],
        ['What is a scheduled request?','A request that repeats every week, month or quarter. Pera creates a new pending request automatically on each due date.']]],
      ['Buying & paying', [
        ['How are purchase orders approved?','Procurement raises the PO from an approved requisition or RFQ award. It is approved by the PO approvers and reviewed by Finance before it is issued to the supplier.'],
        ['What is the 3-way match?','Before paying, Pera compares what was ordered (PO), what was received (delivery) and what was invoiced. If they differ by more than the tolerance in Settings, the invoice is flagged as a mismatch.'],
        ['How do RFQs and sealed bids work?','Procurement invites prequalified suppliers to quote. Sealed bids stay hidden until the closing time. Bids are then scored on price, delivery and technical quality and one is awarded with a written justification.']]],
      ['Suppliers & items', [
        ['What does “Connected” mean on a supplier?','The supplier has a login to the supplier portal, where they can quote on RFQs, see their purchase orders, submit invoices and upload documents. Use More actions → Invite to supplier portal to connect one.'],
        ['What are favourites and stock?','Tap the star on an item to add it to your favourites. Items marked “track stock” show their quantity on hand under the Stock tab; issuing a request from stores or receiving a delivery updates the quantity.']]],
      ['Records & audit', [
        ['Can records be deleted?','Transactions (requisitions, expenses, orders, invoices, payments) can never be deleted — drafts can be withdrawn and everything stays on record. Master data (items, categories, suppliers) can only be deleted if it has never been used; otherwise deactivate it.'],
        ['Where is the history of a record?','Every record page has an audit trail at the bottom. The full log, which can be exported, is under Plan & control → Audit trail.']]]
    ];
    const match = ([qq,a]) => !q || (qq+' '+a).toLowerCase().includes(q);
    return `${pageHead('Help center','Answers to common questions. Can’t find what you need? Contact support below.')}
      <section class="panel"><div class="filters"><input class="search" type="text" placeholder="Search help…" value="${esc((this.f.help||{}).q||'')}" data-filter="help.q" aria-label="Search help"></div>
      <div class="panel-b help">${sections.map(([h,qs])=>{ const m = qs.filter(match); return m.length?`<h3>${esc(h)}</h3>${m.map(([qq,a])=>`<details ${q?'open':''}><summary>${esc(qq)}</summary><p>${esc(a)}</p></details>`).join('')}`:''; }).join('') || '<p class="faint">No answers match your search.</p>'}</div></section>
      ${panel('Contact support','',`<div class="panel-b kv"><div><span>Email</span><b class="mono">${esc(sup.email||'—')}</b></div><div><span>Phone</span><b class="mono">${esc(sup.phone||'—')}</b></div><div><span>Hours</span><b>${esc(sup.hours||'—')}</b></div></div>`)}`;
  },
