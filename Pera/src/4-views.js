/* =====================================================================
   PERMISSIONS & DERIVED STATE
   ===================================================================== */
const can = {
  seeAll: u => ['approver','procurement','finance','admin'].includes(u.role),
  isApprover: u => (S().approval_tiers||[]).some(t=>(t.approver_ids||[]).includes(u.id)) || ((S().po_approval||{}).approver_ids||[]).includes(u.id) || ((S().contract_approval||{}).approver_ids||[]).includes(u.id),
  decide: (u,r) => ['pending','pending_approval'].includes(r.status) && r.created_by!==u.id && !!actingFor(u,r),
  review: u => ['finance','admin'].includes(u.role),
  procure: u => ['procurement','admin'].includes(u.role),
  finance: u => ['finance','admin'].includes(u.role),
  admin: u => u.role==='admin',
  master: u => ['procurement','finance','admin'].includes(u.role),
  receive: (u,po) => ['procurement','admin'].includes(u.role) || (po && po.req_id && (Store.byId('requisitions',po.req_id)||{}).created_by===u.id)
};
const me = () => Store.me;
/* delegation: an approver who is away can hand their approvals to someone until a date */
const delegActive = x => !!(x && x.delegate_to && (!x.delegate_until || x.delegate_until >= todayStr()));
function actingFor(u, r){
  const cur = currentStage(r); if (cur<0) return null;
  const ids = stagesOf(r)[cur].ids, done = id => (r.approvals||[]).some(a=>a.approver_id===id && (a.stage||0)===cur);
  if (ids.includes(u.id) && !done(u.id)) return u.id;
  return ids.find(id => id!==r.created_by && !done(id) && (()=>{ const p=Store.user(id); return delegActive(p) && p.delegate_to===u.id; })()) || null;
}
const withDelegates = ids => [...new Set(ids.concat(ids.map(id=>Store.user(id)).filter(delegActive).map(p=>p.delegate_to)))];
const approversExcluding = (ids, creator) => (ids||[]).filter(a=>a!==creator);
const inBranch = r => !App.branch || !r || !r.branch_id || r.branch_id===App.branch;
const branchName = id => ((S().branches||[]).find(b=>b.id===id)||{}).name || (id?'—':'Company-wide');
const reqsAll = () => Store.all('requisitions').filter(r => r.kind!=='expense' && inBranch(r) && (can.seeAll(me()) || r.created_by===me().id));
const expensesAll = () => Store.all('requisitions').filter(r => r.kind==='expense' && inBranch(r) && (can.seeAll(me()) || r.created_by===me().id));
const reqsVisible = () => Store.all('requisitions').filter(r => inBranch(r) && (can.seeAll(me()) || r.created_by===me().id));
function awaitingMe(){
  const u = me();
  return [].concat(
    Store.all('requisitions').filter(r=>can.decide(u,r)).map(r=>({t:'requisitions', type:r.kind==='expense'?'expense':'requisition', r})),
    Store.all('purchase_orders').filter(r=>can.decide(u,r)).map(r=>({t:'purchase_orders', type:'po', r})),
    Store.all('contracts').filter(r=>can.decide(u,r)).map(r=>({t:'contracts', type:'contract', r})));
}
function awaitingReview(){
  if (!can.review(me())) return [];
  return [].concat(Store.all('requisitions').filter(r=>r.status==='review').map(r=>({t:'requisitions', type:r.kind==='expense'?'expense':'requisition', r})),
    Store.all('purchase_orders').filter(r=>r.status==='review').map(r=>({t:'purchase_orders', type:'po', r})));
}
const LIVE_PO = ['issued','partially_received','received','closed'];
const posFor = r => Store.all('purchase_orders').filter(p=>p.req_id===r.id && LIVE_PO.includes(p.status));
const posPending = r => Store.all('purchase_orders').filter(p=>p.req_id===r.id && ['draft','pending_approval','review'].includes(p.status));
const rfqFor = r => Store.all('rfqs').filter(q=>q.req_id===r.id && q.status!=='cancelled').slice(-1)[0];
const invoicesFor = r => Store.all('invoices').filter(v=>v.req_id===r.id || posFor(r).some(p=>p.id===v.po_id));
const receiptsFor = po => Store.all('receipts').filter(g=>g.po_id===po.id);
const bidsFor = q => Store.all('bids').filter(b=>b.rfq_id===q.id);
const commentsFor = id => Store.all('comments').filter(c=>c.entity_id===id).sort((a,b)=>a.at.localeCompare(b.at));
function reqStage(r){
  if (r.status!=='approved') return r.status;
  if (r.kind!=='purchase') return 'to_pay';
  const pos = posFor(r);
  if (!pos.length){ if (posPending(r).length) return 'po_pending'; const q=rfqFor(r); return q ? 'sourcing' : 'to_order'; }
  const received = pos.every(p=>['received','closed'].includes(p.status));
  if (!received && S().require_grn) return 'ordered';
  if (!invoicesFor(r).length) return received ? 'received' : 'ordered';
  return 'to_pay';
}
const STAGE = {draft:['Draft','t-grey'], pending:['Pending approval','t-amber'], review:['Pending review','t-amber'], rejected:['Rejected','t-red'], withdrawn:['Withdrawn','t-grey'], paid:['Paid','t-green'],
  to_order:['Approved – to order','t-blue'], sourcing:['Sourcing (RFQ)','t-blue'], po_pending:['PO awaiting approval','t-blue'], ordered:['Ordered – awaiting delivery','t-blue'], received:['Received – awaiting invoice','t-blue'], to_pay:['Ready to pay','t-blue']};
/* the sample system's requisition tabs */
const reqTab = r => ({draft:'draft', pending:'pending', review:'review', paid:'closed', rejected:'closed', withdrawn:'closed'})[r.status] || (['received','to_pay'].includes(reqStage(r)) && r.kind==='purchase' ? 'fulfilled' : 'open');
const isOverdue = r => ['pending','review','approved'].includes(r.status) && r.due_date && r.due_date < todayStr();
function matchFor(r){
  const pos = posFor(r); if (!pos.length) return null;
  const ordered = sum(pos, p=>p.total);
  const received = sum(pos, p=>sum(receiptsFor(p), g=>g.lines.reduce((s,l,i)=>s+(+l.received||0)*(+(p.lines[i]||{}).unit_price||0),0)));
  const invoiced = sum(invoicesFor(r), v=>v.amount);
  const tol = (+S().match_tolerance_pct||0)/100;
  const within = (a,b) => Math.abs(a-b) <= Math.max(0.01, b*tol);
  return {ordered, received, invoiced, recOk: within(received,ordered) || (received>0 && !S().require_grn), invOk: invoiced>0 && within(invoiced, S().require_grn?received:ordered)};
}
function budgetUse(b){
  const rs = Store.all('requisitions').filter(r=>r.budget_id===b.id);
  const spent = sum(rs.filter(r=>r.status==='paid'), r=>toBase(r.currency, r.payment?r.payment.amount:r.total));
  const committed = sum(rs.filter(r=>['pending','review','approved'].includes(r.status)), r=>toBase(r.currency,r.total));
  return {spent, committed, available:(+b.amount||0)-spent-committed, pct:b.amount?(spent+committed)/b.amount*100:0};
}
const docState = doc => !doc.expiry ? ['No expiry','t-grey'] : doc.expiry < todayStr() ? ['Expired','t-red'] : doc.expiry <= addDays(todayStr(), +S().expiry_warning_days||60) ? ['Expires '+fmtDate(doc.expiry),'t-amber'] : ['Valid to '+fmtDate(doc.expiry),'t-green'];
const supExpired = s => (s.documents||[]).filter(d=>d.expiry && d.expiry<todayStr());
const supRating = s => { const r=s.reviews||[]; return r.length ? sum(r,x=>(x.quality+x.timeliness+x.service)/3)/r.length : null; };
const supConnected = s => Store.all('app_users').some(u=>u.role==='supplier' && u.supplier_id===s.id && u.active);
const SUP_STATUS = {approved:['Active','t-green'], pending:['Pending prequalification','t-amber'], suspended:['Suspended','t-red'], blacklisted:['Blacklisted','t-red']};
function contractState(c){
  if (c.status==='draft') return ['Draft','t-grey'];
  if (c.status==='pending') return ['Pending approval','t-amber'];
  if (c.status==='rejected') return ['Rejected','t-red'];
  if (c.status==='terminated') return ['Terminated','t-grey'];
  if (c.end_date < todayStr()) return ['Expired','t-red'];
  const left = daysBetween(todayStr(), c.end_date);
  if (left <= (+S().expiry_warning_days||60)) return ['Expires in '+left+' days','t-amber'];
  return ['Active','t-green'];
}
const contractTab = c => ({draft:'drafts',pending:'pending'})[c.status] || (['Active'].includes(contractState(c)[0])||contractState(c)[0].startsWith('Expires') ? 'open' : 'closed');
function rfqState(q){
  if (q.status==='open' && q.closing_at <= nowISO()) return ['Closed – evaluate','t-amber'];
  return ({draft:['Draft','t-grey'], open:['Open for bids','t-blue'], awarded:['Awarded','t-green'], cancelled:['Cancelled','t-grey']})[q.status] || [q.status,'t-grey'];
}
const bidsVisible = q => !q.sealed || q.status!=='open' || q.closing_at <= nowISO();
function scoreBids(q){
  const bids = bidsFor(q); if (!bids.length) return [];
  const c = q.criteria||{price:100,delivery:0,technical:0};
  const minP = Math.min(...bids.map(b=>+b.amount||Infinity)), minD = Math.min(...bids.map(b=>+b.delivery_days||1));
  return bids.map(b=>{ const price=(+c.price||0)*minP/(+b.amount||Infinity), delivery=(+c.delivery||0)*minD/(+b.delivery_days||1), tech=(+c.technical||0)*(+b.technical_score||0)/100; return {b, price, delivery, tech, total:price+delivery+tech}; }).sort((a,b)=>b.total-a.total);
}
const POSTATE = {draft:['Draft','t-grey'], pending_approval:['Pending approval','t-amber'], review:['Pending review','t-amber'], rejected:['Rejected','t-red'], issued:['Open – issued','t-blue'], partially_received:['Partly received','t-amber'], received:['Fully received','t-green'], closed:['Closed – paid','t-grey'], cancelled:['Cancelled','t-grey']};
const poTab = p => ({draft:'drafts',pending_approval:'pending',review:'review'})[p.status] || (['issued','partially_received','received'].includes(p.status)?'open':'closed');
const REQ_STATUS = {draft:['Draft','t-grey'], pending:['Pending','t-amber'], open:['Open','t-blue'], scheduled:['Scheduled','t-blue'], completed:['Completed','t-green'], cancelled:['Cancelled','t-grey']};

/* =====================================================================
   UI HELPERS
   ===================================================================== */
const pill = (label,tone) => `<span class="pill ${tone}">${esc(label)}</span>`;
const stagePill = r => { const s=STAGE[reqStage(r)]||[r.status,'t-grey']; return pill(s[0],s[1]); };
const stars = v => v==null ? '<span class="faint">No reviews</span>' : `<span class="stars" title="${v.toFixed(1)} of 5">${'★'.repeat(Math.round(v))}${'☆'.repeat(5-Math.round(v))}</span> <span class="num faint">${v.toFixed(1)}</span>`;
const pageHead = (title, sub, actions, crumb) => `<div class="page-head"><div>${crumb?`<p class="crumb">${crumb}</p>`:''}<h1>${title}</h1>${sub?`<p>${sub}</p>`:''}</div>${actions?`<div class="head-actions">${actions}</div>`:''}</div>`;
const panel = (title, right, body, cls) => `<section class="panel ${cls||''}"><div class="panel-h"><h2>${title}</h2>${right||''}</div>${body}</section>`;
const btn = (label, attrs, cls, icon) => `<button class="btn ${cls||''}" ${attrs}>${icon?I[icon]:''}${label}</button>`;
const ibtn = (icon, label, attrs, cls) => `<button class="ib ${cls||''}" title="${esc(label)}" aria-label="${esc(label)}" ${attrs}>${I[icon]}</button>`;
const stripTags = h => String(h).replace(/<[^>]+>/g,'').trim();
function tableHTML(cols, rows, opts={}){
  let vis = cols, page = rows, foot = '';
  if (opts.key){
    cols.forEach(c=>{ if (!c.id) c.id = stripTags(c.h) || null; });
    App._colDefs[opts.key] = cols.filter(c=>c.id && !c.fixed).map(c=>c.id);
    const hid = App.hidden[opts.key]||[];
    vis = cols.filter(c=>!c.id || c.fixed || !hid.includes(c.id));
    const pg = App.pg[opts.key] = App.pg[opts.key] || {size:opts.size||25, page:0};
    const pages = Math.max(1, Math.ceil(rows.length/pg.size)); if (pg.page>=pages) pg.page = pages-1;
    page = rows.slice(pg.page*pg.size, (pg.page+1)*pg.size);
    const from = rows.length ? pg.page*pg.size+1 : 0, to = Math.min(rows.length,(pg.page+1)*pg.size);
    foot = `<div class="tfoot"><div class="tf-left"><select data-pgsize="${opts.key}" aria-label="Rows per page">${[10,25,50,100].map(n=>`<option value="${n}" ${n===pg.size?'selected':''}>${n} per page</option>`).join('')}</select>${btn('Edit columns',`data-act="edit-cols" data-key="${opts.key}"`,'sm ghost')}${opts.summary?`<span>${opts.summary}</span>`:''}</div>
      <div class="tf-right"><span>${from}–${to} of ${rows.length}</span>${ibtn('back','Previous page',`data-pg="${opts.key}:-1" ${pg.page<=0?'disabled':''}`)}${ibtn('next','Next page',`data-pg="${opts.key}:1" ${pg.page>=pages-1?'disabled':''}`)}</div></div>`;
  }
  return `<div class="tw"><table><thead><tr>${vis.map(c=>`<th class="${c.r?'r':''}">${c.h}</th>`).join('')}</tr></thead><tbody>
    ${page.length ? page.map(r=>{ const o = opts.open ? opts.open(r) : ''; return `<tr class="${o?'click':''} ${opts.rowCls?opts.rowCls(r):''}" ${o?`data-open="${o}"`:''}>${vis.map(c=>`<td class="${c.cls||''} ${c.r?'r':''}">${c.v(r)}</td>`).join('')}</tr>`; }).join('')
      : `<tr><td colspan="${vis.length}"><div class="empty">${opts.empty||'Nothing here yet.'}</div></td></tr>`}
    </tbody>${opts.foot?`<tfoot><tr>${opts.foot}</tr></tfoot>`:''}</table></div>${foot}`;
}
const votes = r => {
  if (!(r.approver_ids||[]).length) return '';
  return `<span class="votes" title="${(r.approvals||[]).filter(a=>a.decision==='approved').length} of ${r.approvals_required} required">${r.approver_ids.map(id=>{ const a=(r.approvals||[]).find(x=>x.approver_id===id); return `<i class="${a?(a.decision==='approved'?'a':'r'):''}" title="${esc(Store.user(id).name)}: ${a?a.decision:'waiting'}"></i>`; }).join('')}</span>`;
};
const fileList = (list, owner) => list.length ? `<div class="files">${list.map(a=>`<div class="file"><span class="ft">${esc((a.name.split('.').pop()||'').slice(0,4).toUpperCase())}</span><div class="fn"><b title="${esc(a.name)}">${esc(a.name)}</b><span>${fmtSize(a.size)} · ${esc(a.uploaded_by_name)} · ${fmtDT(a.at)}</span></div><button class="btn sm" data-view="${owner}:${a.id}">${I.eye}View</button></div>`).join('')}</div>` : '<p class="faint" style="margin:0">None uploaded.</p>';
const byCurText = arr => { const m={}; arr.forEach(r=>m[r.currency]=(m[r.currency]||0)+(+r.total||0)); const e=Object.entries(m); return e.length ? e.map(([c,v])=>fmtMoney(c,v)).join(' · ') : '—'; };
const baseSum = (arr, f) => sum(arr, x=>toBase(x.currency, f?f(x):x.total));
const barRows = (rows, fmt, cls) => { const max = Math.max(1,...rows.map(r=>r[1])); return rows.length ? `<div class="bars">${rows.map(([l,v,extra])=>`<div class="bar-row" title="${esc(l)}: ${esc(fmt(v))}"><span>${esc(l)}</span><span class="num">${esc(fmt(v))}${extra||''}</span><div class="track"><div class="fill ${cls||''}" style="width:${Math.max(1.5,v/max*100)}%"></div></div></div>`).join('')}</div>` : '<p class="faint" style="margin:0">No data yet.</p>'; };
const selectHTML = (attrs, options, val, blank) => `<select ${attrs}>${blank!=null?`<option value="">${esc(blank)}</option>`:''}${options.map(([k,l])=>`<option value="${esc(k)}" ${String(k)===String(val??'')?'selected':''}>${esc(l)}</option>`).join('')}</select>`;

/* shared filter bar: search · date range · transaction total · "view my …" · more filters */
function filterBar(key, o){
  const f = App.f[key] = App.f[key] || {};
  const more = f._more;
  return `<div class="filters">
    <input class="search" type="text" placeholder="${esc(o.ph||'Search…')}" value="${esc(f.q||'')}" data-filter="${key}.q" aria-label="Search">
    ${o.dates!==false?`<label class="chk">From <input type="date" data-filter="${key}.from" value="${f.from||''}"></label><label class="chk">To <input type="date" data-filter="${key}.to" value="${f.to||''}"></label>`:''}
    ${o.total?`<label class="chk">Total <input type="number" placeholder="min" data-filter="${key}.min" value="${f.min??''}" style="width:90px"> – <input type="number" placeholder="max" data-filter="${key}.max" value="${f.max??''}" style="width:90px"></label>`:''}
    ${o.mine?`<button class="btn sm ${f.mine?'primary':''}" data-toggle="${key}.mine" aria-pressed="${f.mine?'true':'false'}">${esc(o.mine)}</button>`:''}
    ${o.more?`<button class="btn sm ghost" data-toggle="${key}._more" aria-expanded="${more?'true':'false'}">${I.filter}More filters</button>`:''}
  </div>${o.more&&more?`<div class="filters more">${o.more.map(m=>`<label class="chk">${esc(m.label)} ${selectHTML(`data-filter="${key}.${m.k}"`, m.options, f[m.k], 'Any')}</label>`).join('')}${btn('Clear filters',`data-clear="${key}"`,'sm ghost')}</div>`:''}`;
}
function applyFilters(rows, key, o){
  const f = App.f[key]||{};
  const q = (f.q||'').trim().toLowerCase();
  if (q) rows = rows.filter(r=>o.text(r).toLowerCase().includes(q));
  const dt = o.date || (r=>(r.created_at||'').slice(0,10));
  if (f.from) rows = rows.filter(r=>(dt(r)||'')>=f.from);
  if (f.to) rows = rows.filter(r=>(dt(r)||'')<=f.to);
  if (o.amount){ if (f.min!==undefined && f.min!=='') rows = rows.filter(r=>o.amount(r)>=+f.min); if (f.max!==undefined && f.max!=='') rows = rows.filter(r=>o.amount(r)<=+f.max); }
  if (f.mine && o.mineFn) rows = rows.filter(o.mineFn);
  (o.more||[]).forEach(m=>{ if (f[m.k]) rows = rows.filter(r=>String(m.get(r))===String(f[m.k])); });
  return rows;
}
const searchBox = (id, val, ph) => `<input class="search" id="${id}" type="text" placeholder="${esc(ph)}" value="${esc(val||'')}" data-filter="${id}" aria-label="Search">`;
const personOpts = () => Store.all('app_users').filter(u=>u.role!=='supplier').map(u=>[u.id,u.name]);
const catPath = c => { const p = c.parent_id && Store.byId('categories',c.parent_id); return p ? p.name+' › '+c.name : c.name; };
const catOpts = (type) => Store.all('categories').filter(c=>(c.type||'item')===(type||'item')).map(c=>[c.id,catPath(c)]).sort((a,b)=>a[1].localeCompare(b[1]));
const supOpts = () => Store.all('suppliers').slice().sort((a,b)=>a.name.localeCompare(b.name)).map(s=>[s.id,s.name]);
const deptOpts = () => (S().departments||[]).map(d=>[d,d]);
const branchOpts = () => (S().branches||[]).map(b=>[b.id,b.name]);

/* =====================================================================
   APP SHELL
   ===================================================================== */
const App = {
  view:'dashboard', param:null, tab:{}, f:{}, pg:{}, hidden:{}, _colDefs:{}, menu:null, back:[], branch:'', dashTab:'analytics', dashView:null, dash:{spendSrc:'po', spendPeriod:'year', overTime:'requisitions', latest:10, topSup:5, due:'overdue'}, msgSel:null,

  go(view,param,keepBack){
    if (!keepBack && (this.view!==view || this.param!==param)) this.back.push([this.view,this.param]);
    if (this.back.length>30) this.back.shift();
    this.view=view; this.param=param||null; this.menu=null;
    const sd=$('#side'); sd&&sd.classList.remove('open');
    this.render(); window.scrollTo(0,0);
  },
  goBack(){ const b=this.back.pop()||['dashboard',null]; this.go(b[0],b[1],true); },
  open(ref){
    const [type,id] = String(ref).split(':');
    const R = {requisition:'req', expense:'req', rfq:'rfq', po:'po', supplier:'supplier', contract:'contract', request:'request'};
    if (R[type]) return this.go(R[type],id);
    if (type==='invoice'){ const v=Store.byId('invoices',id); if (v&&v.po_id) return this.go('po',v.po_id); return this.go('invoices'); }
    if (type==='receipt'){ const g=Store.byId('receipts',id); if (g) return this.go('po',g.po_id); }
    if (type==='budget') return this.go('budgets');
    if (type==='plan') return this.go('plan');
    if (type==='item') return this.go('items');
    if (type==='category') return this.go('categories');
  },

  render(){
    if (!Store.me) return;
    applyTheme(); applyBrand();
    const u = me(), sup = u.role==='supplier';
    if (this.view==='messages') u.msg_seen_at = nowISO();
    const unread = unreadCount();
    const n = {
      approvals: awaitingMe().length + awaitingReview().length,
      order: Store.all('requisitions').filter(r=>reqStage(r)==='to_order').length,
      pay: Store.all('requisitions').filter(r=>reqStage(r)==='to_pay').length,
      rfq: Store.all('rfqs').filter(q=>q.status==='open' && q.closing_at<=nowISO()).length,
      sup: Store.all('suppliers').filter(s=>s.status==='pending').length,
      rq: Store.all('requests').filter(r=>r.status==='pending').length,
      msg: this.unreadMsgs()
    };
    const nav = (id,icon,label,count,also)=>`<button class="${this.view===id||(also||[]).includes(this.view)?'on':''}" data-go="${id}">${I[icon]}<span>${label}</span>${count?`<span class="count">${count}</span>`:''}</button>`;
    const navHTML = sup ? `${nav('portal','portal','Supplier portal')}${nav('messages','chat','Messages',n.msg)}${nav('help','help','Help center')}` : `
      ${nav('dashboard','dash','Dashboard')}
      <div class="nav-label">Transactions</div>
      ${nav('requisitions','req','Requisitions',0,['req'])}
      ${mod('expenses')?nav('expenses','receipt','Expenses'):''}
      ${mod('requests')?nav('requests','inbox','Requests',can.procure(u)?n.rq:0,['request']):''}
      ${can.seeAll(u)&&mod('contracts')?nav('contracts','contract','Contracts',0,['contract']):''}
      ${nav('pos','po','Purchase orders',can.procure(u)?n.order:0,['po'])}
      ${nav('deliveries','grn','Deliveries')}
      ${can.seeAll(u)&&mod('rfq')?nav('rfqs','rfq','RFQs & tenders',can.procure(u)?n.rfq:0,['rfq']):''}
      ${can.seeAll(u)?nav('invoices','inv','Invoices'):''}
      ${can.finance(u)||u.role==='approver'?nav('payments','pay','Payments',can.finance(u)?n.pay:0):''}
      ${can.isApprover(u)||can.review(u)?nav('approvals','check','My approvals',n.approvals):''}
      <div class="nav-label">Catalogue</div>
      ${nav('suppliers','sup','Suppliers',can.procure(u)?n.sup:0,['supplier'])}
      ${nav('items','item','Items')}
      ${nav('categories','cat','Categories')}
      ${can.seeAll(u)?`<div class="nav-label">Plan & control</div>${mod('plan')?nav('plan','plan','Procurement plan'):''}${mod('budgets')?nav('budgets','budget','Budgets'):''}${nav('reports','report','Reports')}${nav('audit','audit','Audit trail')}`:''}
      ${can.admin(u)?nav('settings','cog','Settings'):''}
      <div class="nav-sep"></div>
      ${nav('help','help','Help center')}`;
    const branches = S().branches||[];
    $('#root').innerHTML = `
    <div class="app">
      <aside class="side" id="side">
        <div class="brand">${brandMark()}<div><b>Pera</b><small title="${esc(S().company||'')}">${esc(S().company||'Procure-to-pay')}</small></div></div>
        <nav class="nav">${navHTML}</nav>
        <div class="side-foot">${LIVE?'Live · shared database':'Demo mode · data stays in this browser'}<span class="vendor">Pera · by HeartPath Solutions</span></div>
      </aside>
      <div class="main">
        <header class="top">
          <button class="icon-btn menu-btn" data-act="menu" aria-label="Open menu">${I.menu}</button>
          ${!sup && can.seeAll(u) && branches.length>1 ? `<label class="branch-pick" title="Branch level view">${I.branch}<select data-act="branch" aria-label="Branch level view"><option value="">All branches</option>${branches.map(b=>`<option value="${b.id}" ${this.branch===b.id?'selected':''}>${esc(b.name)}</option>`).join('')}</select></label>`:''}
          <div class="grow"></div>
          ${LIVE?'':'<span class="demo-chip">Demo · switch user from the menu on the right</span>'}
          ${sup?'':`<div class="pop-wrap"><button class="btn primary" data-act="create-menu" aria-haspopup="menu" aria-expanded="${this.menu==='create'}">${I.plus}<span>Create</span></button>${this.menu==='create'?this.createMenuHTML():''}</div>`}
          ${sup?'':`<div class="bell"><button class="icon-btn" data-go="approvals" aria-label="My approvals" title="My approvals">${I.check}</button>${n.approvals?`<span class="dot">${n.approvals}</span>`:''}</div>`}
          <div class="bell"><button class="icon-btn" data-go="messages" aria-label="Messages" title="Messages">${I.chat}</button>${n.msg?`<span class="dot">${n.msg}</span>`:''}</div>
          <div class="bell pop-wrap"><button class="icon-btn" data-act="bell" aria-label="Notifications" title="Notifications">${I.bell}</button>${unread?`<span class="dot">${unread}</span>`:''}${this.menu==='bell'?this.bellHTML():''}</div>
          <div class="who pop-wrap">
            <button class="who-btn" data-act="user-menu" aria-haspopup="menu">${avatarHTML(u)}<span class="who-txt"><b>${esc(u.name)}</b><span>${esc(S().company||'')}</span><span>${esc(sup?Store.supName(u.supplier_id):branchName(u.branch_id))}</span></span>${I.chev}</button>
            ${this.menu==='user'?this.userMenuHTML():''}
          </div>
        </header>
        <main class="page" id="page">${this.safePage()}</main>
      </div>
    </div>`;
    notifyBrowser();
  },
  createMenuHTML(){
    const u = me(), it = (act,icon,label,sub) => `<button class="mi" data-act="${act}">${I[icon]}<span><b>${label}</b><small>${sub}</small></span></button>`;
    return `<div class="dropdown menu" role="menu">
      ${it('new-req','req','Requisition','Ask for approval to buy or pay')}
      ${mod('expenses')?it('new-expense','receipt','Expense','Claim back money already spent'):''}
      ${mod('requests')?it('new-request','inbox','Request','Ask for something from stores or a service'):''}
      ${can.procure(u)&&mod('contracts')?it('new-contract','contract','Contract','Record a supplier agreement'):''}
      ${can.procure(u)?it('new-po','po','Purchase order','From an approved requisition'):''}
      ${can.procure(u)&&mod('rfq')?it('rfq-new','rfq','Request for quotation','Invite suppliers to quote'):''}
      ${mod('scan')?it('scan','scan','Smart scan','Read a quote, invoice or receipt'):''}
    </div>`;
  },
  userMenuHTML(){
    const u = me();
    return `<div class="dropdown menu" role="menu" style="width:300px">
      <div style="padding:12px 14px;border-bottom:1px solid var(--line);display:flex;gap:10px;align-items:flex-start">${avatarHTML(u)}<div><b>${esc(u.name)}</b><div class="faint" style="font-size:12.5px">${esc(u.title||ROLE_LABEL[u.role])}<br>${esc(u.email)}<br>${esc(S().company||'')} · ${esc(u.role==='supplier'?Store.supName(u.supplier_id):branchName(u.branch_id))}</div></div></div>
      ${LIVE?'':`<div style="padding:10px 14px;border-bottom:1px solid var(--line)"><label class="f" for="demo-user">Switch demo user<select id="demo-user" data-act="switch-user">${Store.all('app_users').filter(x=>x.active).map(x=>`<option value="${x.id}" ${x.id===u.id?'selected':''}>${esc(x.name)} — ${esc(x.title||ROLE_LABEL[x.role])}</option>`).join('')}</select></label></div>`}
      ${u.role!=='supplier'?`<button class="mi" data-act="delegate">${I.check}<span><b>Out of office</b><br><small class="faint">${delegActive(u)?'Approvals go to '+esc(Store.user(u.delegate_to).name)+(u.delegate_until?' until '+fmtDate(u.delegate_until):''):'Delegate my approvals'}</small></span></button>`:''}
      <button class="mi" data-act="my-profile">${I.edit}<span><b>My profile</b><br><small class="faint">Picture, contact details, theme, alerts, password</small></span></button>
      <button class="mi" data-go="notifications">${I.bell}<span><b>Notifications</b></span></button>
      ${can.admin(u)&&!LIVE?`<button class="mi" data-act="wiz-start">${I.cog}<span><b>Set up a new company</b><br><small class="faint">Try the 4-step setup wizard</small></span></button>`:''}
      ${can.admin(u)?`<button class="mi" data-act="manage-company">${I.sup}<span><b>Manage company</b><br><small class="faint">Users, departments, addresses, paying accounts</small></span></button>`:''}
      <button class="mi" data-go="help">${I.help}<span><b>Help center</b></span></button>
      ${LIVE?`<button class="mi" data-act="logout">${I.back}<span><b>Sign out</b></span></button>`:''}
    </div>`;
  },
  safePage(){ try{ return this.pageHTML(); }catch(e){ console.error(e); return `<div class="banner red"><span class="grow">This page could not be shown: ${esc(e.message)}</span>${btn('Back to dashboard','data-go="dashboard"','sm')}</div>`; } },
  bellHTML(){
    const all = myNotes(), list = all.slice(0,12);
    return `<div class="dropdown" role="menu"><div class="panel-h"><h2>Notifications</h2>${all.some(n=>!n.read)?btn('Mark all read','data-act="read-all"','sm ghost'):''}</div>
      ${list.length?list.map(n=>`<button class="nt ${n.read?'':'unread'}" data-note="${n.id}">${esc(n.message)}<time>${fmtDT(n.at)}</time></button>`).join(''):'<div class="empty">You’re all caught up.</div>'}
      <button class="nt see-all" data-go="notifications">See all notifications${all.length>list.length?' ('+all.length+')':''} →</button></div>`;
  },
  unreadMsgs(){ const seen = (me().msg_seen_at)||''; return this.myThreads().filter(t=>t.last.at>seen && t.last.user_id!==me().id).length; },
  myThreads(){
    const u = me(), m = {};
    const vis = c => { const rec = entityOf(c.entity_type,c.entity_id); if (!rec) return false;
      if (u.role==='supplier') return rec.supplier_id===u.supplier_id && ['po','rfq'].includes(c.entity_type);
      return can.seeAll(u) || rec.created_by===u.id || (rec.approver_ids||[]).includes(u.id) || rec.assigned_to===u.id || c.user_id===u.id || mentions(c.body).includes(u.id); };
    Store.all('comments').forEach(c=>{ if (!vis(c)) return; const t = m[c.entity_id] = m[c.entity_id] || {type:c.entity_type, id:c.entity_id, number:c.entity_number, count:0, last:c}; t.count++; if (c.at > t.last.at) t.last = c; });
    return Object.values(m).sort((a,b)=>b.last.at.localeCompare(a.last.at));
  },
  pageHTML(){
    const u = me();
    if (u.role==='supplier' && !['portal','messages','help','profile','notifications'].includes(this.view)) this.view='portal';
    const staffOnly = ['plan','budgets','rfqs','rfq','invoices','reports','audit','contracts','contract'];
    if ((staffOnly.includes(this.view) && !can.seeAll(u)) || (['settings','company'].includes(this.view) && !can.admin(u)) || (this.view==='payments' && !(can.finance(u)||u.role==='approver')))
      return `<div class="banner blue"><span class="grow">This page isn\u2019t available for your role (${esc(ROLE_LABEL[u.role])}).</span>${btn('Back to dashboard','data-go="dashboard"','sm')}</div>`;
    const V = {
      dashboard:()=>this.dashboard(), plan:()=>this.planPage(), budgets:()=>this.budgetsPage(),
      requisitions:()=>this.reqList(), expenses:()=>this.expenseList(), requests:()=>this.requestList(), request:()=>this.requestDetail(),
      approvals:()=>this.approvalsPage(), req:()=>this.reqDetail(),
      rfqs:()=>this.rfqList(), rfq:()=>this.rfqDetail(), pos:()=>this.poList(), po:()=>this.poDetail(),
      deliveries:()=>this.deliveryList(), invoices:()=>this.invoiceList(), payments:()=>this.paymentsPage(),
      suppliers:()=>this.supplierList(), supplier:()=>this.supplierDetail(), contracts:()=>this.contractList(), contract:()=>this.contractDetail(),
      items:()=>this.itemsPage(), categories:()=>this.categoriesPage(), reports:()=>this.reportsPage(),
      audit:()=>this.auditPage(), settings:()=>this.settingsPage(), portal:()=>this.portalPage(), messages:()=>this.messagesPage(), help:()=>this.helpPage(),
      notifications:()=>this.notificationsPage(), profile:()=>this.profilePage(), company:()=>this.companyPage(),
      quick:()=>this.quickPage(), setup:()=>this.setupPage()
    };
    if (this.view==='setup' && !can.admin(u)) this.view = 'dashboard';
    if (LIVE && can.admin(u) && !S().setup_done && (S().company||'Your Company Ltd')==='Your Company Ltd' && this.view!=='setup'){ this.view = 'setup'; }   // a brand-new installation
    const off = Object.keys(MOD_VIEWS).find(k=>MOD_VIEWS[k].includes(this.view) && !mod(k));
    if (off) return `<div class="banner blue"><span class="grow">The ${esc(MODULES.find(m=>m[0]===off)[1])} module is switched off for your organisation.${can.admin(u)?' Switch it on under Settings → Modules.':''}</span>${btn('Back to dashboard','data-go="dashboard"','sm')}</div>`;
    return (V[this.view]||V.dashboard)();
  },
  tabs(key, list, counts){
    const cur = this.tab[key] || list[0][0];
    return `<div class="tabs" role="tablist">${list.map(([k,l])=>`<button role="tab" aria-selected="${cur===k}" class="${cur===k?'on':''}" data-tab="${key}:${k}">${l}${counts?`<span class="n">${counts(k)}</span>`:''}</button>`).join('')}</div>`;
  },
  curTab(key, def){ return this.tab[key] || def; },
  feedEv(a){
    const tone = /Reject|Suspend|Blacklist|Cancel|Returned/.test(a.action)?['var(--red-bg)','var(--red)','✕']:/Approv|Award|Prequal|Reviewed|Completed/.test(a.action)?['var(--green-bg)','var(--green)','✓']:/Payment|Invoice/.test(a.action)?['var(--blue-bg)','var(--blue)','$']:/Goods|order|stores/i.test(a.action)?['var(--accent-soft)','var(--ink)','▣']:['var(--surface-2)','var(--ink-2)','•'];
    return `<div class="ev"><span class="ic" style="background:${tone[0]};color:${tone[1]}">${tone[2]}</span><div><b>${esc(a.user_name)}</b> · ${esc(a.action)} ${a.entity_number&&a.entity_id?`<button class="link mono" data-open="${a.entity_type}:${a.entity_id}">${esc(a.entity_number)}</button>`:''} <span class="muted">${esc(a.details)}</span><time>${fmtDT(a.at)}</time></div></div>`;
  },
  reqLi(r, type){
    const t = type || (r.kind==='expense'?'expense':'requisition');
    const who = r.created_by ? Store.user(r.created_by).name : '';
    const status = t==='po' ? pill(...(POSTATE[r.status]||[r.status,'t-grey'])) : t==='contract' ? pill(...contractState(r)) : (r.status==='pending'?votes(r):stagePill(r));
    return `<button class="li" data-open="${t}:${r.id}"><div class="avatar">${esc(initials(t==='po'?Store.supName(r.supplier_id):who))}</div>
      <div class="t"><b>${esc(r.title||(t==='po'?'Purchase order – '+Store.supName(r.supplier_id):''))}</b><span><span class="mono">${esc(r.number)}</span> · ${esc(t==='po'?Store.supName(r.supplier_id):who)}${r.due_date?` · due <span class="${isOverdue(r)?'over':''}">${fmtDate(r.due_date)}</span>`:''}</span></div>
      <div style="text-align:right;display:flex;flex-direction:column;gap:3px;align-items:flex-end"><span class="num" style="font-weight:700">${fmtMoney(r.currency, r.total!=null?r.total:r.value)}</span>${status}</div></button>`;
  },

  /* ---------------- dashboard ---------------- */
  dashboard(){
    const u = me(), all = can.seeAll(u);
    const defView = {approver:'approver', procurement:'purchasing', finance:'finance', requisitioner:'mine', admin:'purchasing'}[u.role] || 'mine';
    const pv = prefsOf(u).dash_view, view = this.dashView || (pv && (all || pv==='mine') ? pv : defView);
    const appr = awaitingMe().concat(awaitingReview());
    const unread = unreadCount();
    const T = [['analytics','Analytics'],['approvals','Approvals'],['messages','Messages'],['notifications','Notifications']];
    const cnt = {approvals:appr.length, messages:this.unreadMsgs(), notifications:unread};
    const hour = new Date().getHours();
    let body;
    if (this.dashTab==='approvals') body = panel('Waiting for you','<span class="faint">'+appr.length+'</span>', `<div class="list">${appr.length?appr.map(x=>this.reqLi(x.r,x.type)).join(''):'<div class="empty">Nothing is waiting for your approval or review.</div>'}</div>`);
    else if (this.dashTab==='messages'){ const th = this.myThreads().slice(0,12); body = panel('Latest messages', btn('Open messages','data-go="messages"','sm ghost'), `<div class="list">${th.length?th.map(t=>`<button class="li" data-msg="${t.id}"><div class="avatar">${esc(initials(t.last.user_name))}</div><div class="t"><b><span class="mono">${esc(t.number||'')}</span> · ${esc(t.last.user_name)}</b><span>${esc(t.last.body.slice(0,120))}</span></div><time class="faint" style="font-size:12px;white-space:nowrap">${fmtDT(t.last.at)}</time></button>`).join(''):'<div class="empty">No messages yet. Comment on any requisition, order or contract to start a conversation.</div>'}</div>`); }
    else if (this.dashTab==='notifications') body = panel('Notifications', btn('Open full page','data-go="notifications"','sm ghost'), `<div class="panel-b">${this.notesBody(true)}</div>`);
    else body = this.analytics(view, all);
    return `
      <div class="page-head"><div><h1>Dashboard</h1><p>Welcome back, ${esc(u.name.split(' ')[0])}. Here’s what’s happening with your procurement ${hour<12?'this morning':'today'}.</p></div>
        <div class="head-actions">${all&&(S().branches||[]).length>1?selectHTML('data-act="branch" aria-label="Branch level view"',[['','Company level view']].concat(branchOpts().map(([k,l])=>[k,l+' view'])),this.branch):''}
        ${selectHTML('data-act="dash-view" aria-label="Dashboard view"',[['purchasing','Purchasing view'],['finance','Finance view'],['approver','Approver view'],['mine','My view']].filter(([k])=>all||k==='mine'),view)}</div></div>
      <div class="tabs dash-tabs" role="tablist">${T.map(([k,l])=>`<button role="tab" aria-selected="${this.dashTab===k}" class="${this.dashTab===k?'on':''}" data-dtab="${k}">${l}${cnt[k]?`<span class="badge">${cnt[k]}</span>`:''}</button>`).join('')}</div>
      ${body}`;
  },
  analytics(view, all){
    const u = me(), reqs = reqsVisible(), month = todayStr().slice(0,7);
    const paidMonth = reqs.filter(r=>r.status==='paid' && (r.paid_at||'').slice(0,7)===month);
    const tile = (k,v,s,go,hot) => `<button class="stat ${hot?'hot':''}" ${go}><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></button>`;
    const dueItems = this.dueItems();
    const overdueN = dueItems.filter(x=>x.date<todayStr()).length;
    const openPOs = Store.all('purchase_orders').filter(p=>inBranch(p) && ['issued','partially_received','received'].includes(p.status));
    const waiting = awaitingMe().concat(awaitingReview());
    let tiles;
    if (view==='purchasing') tiles = [tile('Open purchase orders',openPOs.length,'View and close purchase orders','data-go="pos" data-tab="po:open"'), tile('Pending approvals',Store.all('requisitions').filter(r=>inBranch(r)&&r.status==='pending').length+Store.all('purchase_orders').filter(p=>inBranch(p)&&p.status==='pending_approval').length+Store.all('contracts').filter(c=>c.status==='pending').length,'View and action pending approvals','data-go="approvals"',waiting.length), tile('Overdue items',overdueN,'View and close overdue items','data-due="overdue"',overdueN), tile('Total spend this month',baseCur()+' '+fmtK(baseSum(paidMonth,r=>r.payment.amount)),paidMonth.length+' payments · '+baseCur()+' '+fmtK(baseSum(Store.all('purchase_orders').filter(p=>inBranch(p)&&LIVE_PO.includes(p.status)&&p.created_at.slice(0,7)===month)))+' ordered','data-go="reports"')];
    else if (view==='finance'){ const mism = reqs.filter(r=>{ const m=matchFor(r); return m && m.invoiced>0 && !m.invOk && r.status!=='paid'; }); const bl = Store.all('budgets').filter(inBranch); const tb=sum(bl,b=>+b.amount), tu=sum(bl,b=>{const x=budgetUse(b);return x.spent+x.committed;}); const toPay = reqs.filter(r=>reqStage(r)==='to_pay');
      tiles = [tile('Ready to pay',toPay.length,byCurText(toPay),'data-go="payments"',toPay.length), tile('Pending review',awaitingReview().length,'Approved items to check before release','data-go="approvals"',awaitingReview().length), tile('Invoice mismatches',mism.length,mism.length?'Invoice differs from PO / receipt':'All invoices match','data-go="invoices" data-tab="inv:mismatch"',mism.length), tile('Budget used',Math.round(tb?tu/tb*100:0)+'%',baseCur()+' '+fmtK(tu)+' of '+fmtK(tb),'data-go="budgets"')]; }
    else if (view==='approver') tiles = [tile('Awaiting your decision',awaitingMe().length,awaitingMe().length?'Requisitions, POs and contracts':'You are up to date','data-go="approvals"',awaitingMe().length), tile('In approval',reqs.filter(r=>r.status==='pending').length,byCurText(reqs.filter(r=>r.status==='pending')),'data-go="requisitions" data-tab="req:pending"'), tile('Approved, not yet paid',reqs.filter(r=>['review','approved'].includes(r.status)).length,byCurText(reqs.filter(r=>['review','approved'].includes(r.status))),'data-go="requisitions" data-tab="req:open"'), tile('Paid this month',paidMonth.length,byCurText(paidMonth),'data-go="payments" data-tab="pay:paid"')];
    else { const mine = Store.all('requisitions').filter(r=>r.created_by===u.id); tiles=[tile('My drafts',mine.filter(r=>r.status==='draft').length,'Not yet submitted','data-go="requisitions" data-tab="req:draft"'), tile('Waiting for approval',mine.filter(r=>['pending','review'].includes(r.status)).length,byCurText(mine.filter(r=>['pending','review'].includes(r.status))),'data-go="requisitions" data-tab="req:pending"'), tile('In progress',mine.filter(r=>r.status==='approved').length,'Approved — being ordered or paid','data-go="requisitions" data-tab="req:open"'), tile('My open requests',Store.all('requests').filter(r=>r.created_by===u.id&&['pending','open'].includes(r.status)).length,'Stores and service requests','data-go="requests"')]; }

    const alerts = [];
    if (all){
      const ex = Store.all('contracts').filter(c=>contractState(c)[0].startsWith('Expires')); if (ex.length) alerts.push(['amber',`<b>${ex.length} contract${ex.length>1?'s':''} expiring soon</b> — ${ex.map(c=>esc(c.number+' '+c.title)+' ('+daysBetween(todayStr(),c.end_date)+' days)').join('; ')}`, btn('View contracts','data-go="contracts" data-tab="ct:expiring"','sm')]);
      const sd = Store.all('suppliers').filter(s=>s.status==='approved' && supExpired(s).length); if (sd.length) alerts.push(['amber',`<b>${sd.length} active supplier${sd.length>1?'s have':' has'} expired compliance documents</b> — ${sd.map(s=>esc(s.name)).join(', ')}`, btn('View suppliers','data-go="suppliers" data-tab="sup:attention"','sm')]);
      const low = Store.all('items').filter(i=>i.track_stock && i.active && i.stock_qty<=i.reorder_level); if (low.length) alerts.push(['amber',`<b>${low.length} stock item${low.length>1?'s':''} at or below reorder level</b> — ${low.map(i=>esc(i.name)+' ('+i.stock_qty+' left)').join(', ')}`, btn('View stock','data-go="items" data-tab="items:stock"','sm')]);
      const rc = Store.all('rfqs').filter(q=>q.status==='open' && q.closing_at<=nowISO()); if (rc.length && can.procure(u)) alerts.push(['blue',`<b>${rc.length} RFQ${rc.length>1?'s':''} closed</b> and waiting for evaluation and award.`, btn('Evaluate','data-go="rfqs" data-tab="rfq:evaluate"','sm')]);
    }
    const pipe = [['pending','Approval'],['review','Review'],['to_order','To order'],['sourcing','Sourcing'],['ordered','Ordered'],['received','Received'],['to_pay','Ready to pay']];
    const which = this.dash.due, soon = addDays(todayStr(),21);
    const isW = (x,k) => k==='overdue' ? x.date<todayStr() : x.date>=todayStr() && x.date<=soon;
    const list = dueItems.filter(x=>isW(x,which)).sort((a,b)=> which==='overdue' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date));
    const groups = {}; list.forEach(x=>(groups[x.date]=groups[x.date]||[]).push(x));
    const dueHTML = `<div class="due-tabs" role="tablist">${[['overdue','Overdue'],['upcoming','Upcoming']].map(([k,l])=>`<button role="tab" aria-selected="${which===k}" class="${which===k?'on':''}" data-due="${k}">${l} <span class="badge ${k==='overdue'?'red':''}">${dueItems.filter(x=>isW(x,k)).length}</span></button>`).join('')}</div>
      <div class="due-list">${Object.keys(groups).length?Object.entries(groups).map(([dt,xs])=>`<div class="due-day"><div class="due-date ${dt<todayStr()?'over':''}">${I.plan}${fmtDate(dt)}</div>${xs.map(x=>`<button class="due-item" data-open="${x.ref}"><span class="tag">${esc(x.kind)}</span> <b>${esc(x.title)}</b> <span class="mono faint">(${esc(x.number)})</span></button>`).join('')}</div>`).join(''):`<div class="empty">No ${which} items.</div>`}</div>`;
    // spend breakdown
    const per = this.dash.spendPeriod, src = this.dash.spendSrc;
    const since = per==='month'?month+'-01' : per==='quarter'? (()=>{ const d=new Date(); const q=Math.floor(d.getMonth()/3)*3; return d.getFullYear()+'-'+String(q+1).padStart(2,'0')+'-01'; })() : (S().fiscal_year||new Date().getFullYear())+'-01-01';
    const srcRows = src==='po' ? Store.all('purchase_orders').filter(p=>inBranch(p)&&LIVE_PO.includes(p.status)&&p.created_at>=since).map(p=>({cat:(Store.byId('requisitions',p.req_id)||{}).category_id, v:toBase(p.currency,p.total)}))
      : src==='exp' ? reqs.filter(r=>r.kind==='expense'&&['approved','paid','review'].includes(r.status)&&(r.decided_at||r.created_at)>=since).map(r=>({cat:r.category_id, v:toBase(r.currency,r.total)}))
      : reqs.filter(r=>r.status==='paid'&&(r.paid_at||'')>=since).map(r=>({cat:r.category_id, v:toBase(r.currency,r.payment.amount)}));
    const bc = {}; srcRows.forEach(x=>{ const k=Store.catName(x.cat); bc[k]=(bc[k]||0)+x.v; });
    const spendHTML = barRows(Object.entries(bc).sort((a,b)=>b[1]-a[1]).slice(0,7), v=>baseCur()+' '+num(v));
    // over time: stacked by category (top 3 + other)
    const months=[]; for (let i=11;i>=0;i--){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i); months.push(d.toISOString().slice(0,7)); }
    const ot = this.dash.overTime;
    const otRows = ot==='po' ? Store.all('purchase_orders').filter(p=>inBranch(p)&&!['draft','rejected'].includes(p.status)).map(p=>({m:p.created_at.slice(0,7), cat:(Store.byId('requisitions',p.req_id)||{}).category_id, v:toBase(p.currency,p.total)}))
      : reqs.filter(r=>(ot==='expenses'?r.kind==='expense':r.kind!=='expense') && r.status!=='draft').map(r=>({m:(r.submitted_at||r.created_at).slice(0,7), cat:r.category_id, v:toBase(r.currency,r.total)}));
    const catTot = {}; otRows.forEach(x=>catTot[x.cat]=(catTot[x.cat]||0)+x.v);
    const top = Object.entries(catTot).sort((a,b)=>b[1]-a[1]).slice(0,3).map(x=>x[0]);
    const series = top.map(c=>[c,Store.catName(c)]).concat(Object.keys(catTot).length>3?[['__other','Other']]:[]);
    const grid = months.map(m=>{ const row={}; otRows.filter(x=>x.m===m).forEach(x=>{ const k=top.includes(x.cat)?x.cat:'__other'; row[k]=(row[k]||0)+x.v; }); return row; });
    const gmax = Math.max(1,...grid.map(r=>Object.values(r).reduce((a,b)=>a+b,0)));
    const otHTML = otRows.length ? `<div class="stack-chart" role="img" aria-label="Monthly value by category"><div class="cols">${months.map((m,i)=>{ const r=grid[i], tot=Object.values(r).reduce((a,b)=>a+b,0); return `<div class="c" title="${new Date(m+'-01T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}: ${baseCur()} ${num(tot)}"><b>${tot?fmtK(tot):''}</b><div class="stackbar" style="height:${tot/gmax*100}%">${series.map(([k,l],si)=>r[k]?`<i class="s${si+1}" style="flex:${r[k]}" title="${esc(l)}: ${baseCur()} ${num(r[k])}"></i>`:'').join('')}</div><span>${new Date(m+'-01T00:00:00').toLocaleDateString('en-GB',{month:'short'})}</span></div>`; }).join('')}</div>
      <div class="legend">${series.map(([k,l],i)=>`<span><i class="s${i+1}"></i>${esc(l)}</span>`).join('')}</div></div>` : '<div class="empty">No data yet.</div>';
    const latest = Store.all('purchase_orders').filter(p=>inBranch(p)&&p.status!=='draft').sort((a,b)=>b.created_at.localeCompare(a.created_at)).slice(0,+this.dash.latest);
    const supSpend = {}; Store.all('purchase_orders').filter(p=>inBranch(p)&&LIVE_PO.includes(p.status)).forEach(p=>supSpend[p.supplier_id]=(supSpend[p.supplier_id]||0)+toBase(p.currency,p.total));
    reqs.filter(r=>r.status==='paid'&&r.kind==='payment'&&r.supplier_id).forEach(r=>supSpend[r.supplier_id]=(supSpend[r.supplier_id]||0)+toBase(r.currency,r.payment.amount));
    const bud = Store.all('budgets').filter(b=>b.active&&inBranch(b)).map(b=>{const x=budgetUse(b); return [b.code, x.spent+x.committed, ` / ${fmtK(b.amount)}`, x.pct];}).sort((a,b)=>b[3]-a[3]).slice(0,6);
    const recent = Store.all('audit_log').filter(a=>all || reqs.some(r=>r.id===a.entity_id)).sort((a,b)=>b.at.localeCompare(a.at)).slice(0,8);
    const sel = (k, opts, lbl) => selectHTML(`data-dash="${k}" aria-label="${esc(lbl)}"`, opts, this.dash[k]);
    return `<div class="stats">${tiles.join('')}</div>
      ${alerts.length?`<div class="alerts">${alerts.map(([t,h,b])=>`<div class="banner ${t}"><span class="grow">${h}</span>${b}</div>`).join('')}</div>`:''}
      ${all?`<div class="flow pipe" aria-label="Procure-to-pay pipeline">${pipe.map(([k,l])=>{const c=reqs.filter(r=>reqStage(r)===k);return `<button class="st" data-go="requisitions" data-tab="req:${k==='pending'?'pending':k==='review'?'review':['received','to_pay'].includes(k)?'fulfilled':'open'}"><b>${l}</b><span class="num big">${c.length}</span><span class="faint">${c.length?baseCur()+' '+fmtK(baseSum(c)):'—'}</span></button>`;}).join('')}</div>`:''}
      <div class="dash">
        ${panel('Overdue & upcoming','',dueHTML)}
        ${panel('Spend', `<div class="head-actions">${sel('spendSrc',[['po','Purchase orders'],['paid','Payments'],['exp','Expenses']],'Spend source')}${sel('spendPeriod',[['month','This month'],['quarter','This quarter'],['year','This year']],'Period')}</div>`, `<div class="panel-b"><p class="faint" style="margin:0 0 10px;font-size:12.5px">Breakdown by category · ${baseCur()}</p>${spendHTML}</div>`)}
      </div>
      <div class="dash">
        ${panel('Requisitions over time', sel('overTime',[['requisitions','Requisitions'],['expenses','Expenses'],['po','Purchase orders']],'Record type'), `<div class="panel-b"><p class="faint" style="margin:0 0 6px;font-size:12.5px">Monthly value by category · ${baseCur()}</p>${otHTML}</div>`)}
        ${panel('Latest purchases', sel('latest',[['5','Latest 5'],['10','Latest 10'],['20','Latest 20']],'How many'), `<div class="list">${latest.length?latest.map(p=>this.reqLi(p,'po')).join(''):'<div class="empty">No purchase orders yet.</div>'}</div>`)}
      </div>
      <div class="dash">
        ${panel('Spend per supplier', sel('topSup',[['5','Top 5'],['10','Top 10'],['20','Top 20']],'How many suppliers'), `<div class="panel-b"><p class="faint" style="margin:0 0 10px;font-size:12.5px">Ordered and directly paid · ${baseCur()}</p>${barRows(Object.entries(supSpend).sort((a,b)=>b[1]-a[1]).slice(0,+this.dash.topSup).map(([k,v])=>[Store.supName(k),v]), v=>baseCur()+' '+num(v))}</div>`)}
        ${all?panel('Budget use','<span class="faint">'+baseCur()+' · committed + spent</span>',`<div class="panel-b">${barRows(bud.map(b=>[b[0],b[1],b[2]]), v=>fmtK(v))}</div>`):panel('How it works','',`<div class="panel-b"><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px"><li>Create a requisition and attach quotes or invoices.</li><li>The executives are notified and approve or reject.</li><li>Finance reviews it, then Procurement orders or Finance pays.</li><li>You confirm delivery; Finance pays the supplier.</li></ol></div>`)}
      </div>
      ${panel('Recent activity', all?btn('Full audit trail','data-go="audit"','sm ghost'):'', `<div class="feed">${recent.map(a=>this.feedEv(a)).join('')||'<div class="empty">No activity yet.</div>'}</div>`)}`;
  },
  dueItems(){
    const u = me(), out = [];
    reqsVisible().filter(r=>['pending','review','approved'].includes(r.status) && r.due_date).forEach(r=>out.push({date:r.due_date, kind:r.kind==='expense'?'Expense':'Requisition', title:r.title, number:r.number, ref:(r.kind==='expense'?'expense':'requisition')+':'+r.id}));
    if (can.seeAll(u)){
      Store.all('purchase_orders').filter(p=>inBranch(p)&&['issued','partially_received'].includes(p.status)&&p.delivery_date).forEach(p=>out.push({date:p.delivery_date, kind:'Delivery', title:Store.supName(p.supplier_id), number:p.number, ref:'po:'+p.id}));
      Store.all('invoices').filter(v=>v.status!=='paid'&&v.due_date).forEach(v=>out.push({date:v.due_date, kind:'Invoice', title:Store.supName(v.supplier_id), number:v.number, ref:'invoice:'+v.id}));
      Store.all('contracts').filter(c=>c.status==='active'&&c.end_date>=todayStr()).forEach(c=>out.push({date:c.end_date, kind:'Contract ends', title:c.title, number:c.number, ref:'contract:'+c.id}));
    }
    Store.all('requests').filter(r=>inBranch(r)&&['pending','open'].includes(r.status)&&r.needed_by&&(can.seeAll(u)||r.created_by===u.id)).forEach(r=>out.push({date:r.needed_by, kind:'Request', title:r.title, number:r.number, ref:'request:'+r.id}));
    return out;
  },

  /* ---------------- requisitions & expenses ---------------- */
  reqFilterOpts(kind){
    return {ph: kind==='expense'?'Search name, number, payee…':'Search name, number, supplier, person…', total:true, mine: kind==='expense'?'View my department expenses':'View my department requisitions',
      more:[{k:'status',label:'Status',options:Object.entries(STAGE).map(([k,v])=>[k,v[0]]),get:r=>reqStage(r)},{k:'cat',label:'Category',options:catOpts(),get:r=>r.category_id},{k:'person',label:kind==='expense'?'Created by':'Requisitioner',options:personOpts(),get:r=>r.created_by},
        ...(kind==='expense'?[]:[{k:'sup',label:'Supplier',options:supOpts(),get:r=>r.supplier_id},{k:'purch',label:'Purchaser',options:purchasers().map(u=>[u.id,u.name]),get:r=>r.purchaser_id}]),{k:'budget',label:'Budget',options:Store.all('budgets').map(b=>[b.id,b.code]),get:r=>r.budget_id},{k:'cur',label:'Currency',options:(S().currencies||[]).map(c=>[c.code,c.code]),get:r=>r.currency},{k:'branch',label:'Branch',options:branchOpts(),get:r=>r.branch_id}]};
  },
  filterReqs(rows, key, kind){
    const o = this.reqFilterOpts(kind);
    return applyFilters(rows, key, Object.assign({}, o, {text:r=>[r.title,r.number,r.description,Store.user(r.created_by).name,Store.supName(r.supplier_id),r.department,r.payee].join(' '), amount:r=>toBase(r.currency,r.total), mineFn:r=>deptsOf(me()).includes(r.department), date: kind==='expense'?(r=>r.expense_date||r.created_at.slice(0,10)):null})).sort((a,b)=>b.created_at.localeCompare(a.created_at));
  },
  reqCols(kind){
    const act = r => `<span class="acts">${ibtn('copy','Duplicate',`data-act="duplicate" data-id="${r.id}"`)}${r.status==='draft'&&r.created_by===me().id?ibtn('edit','Edit draft',`data-act="req-edit-id" data-id="${r.id}"`):''}</span>`;
    if (kind==='expense') return [
      {h:'Name', cls:'name', v:r=>`${esc(r.title)}<small>${esc(Store.catName(r.category_id))}</small>`},
      {h:'Number', cls:'mono', v:r=>esc(r.number)},{h:'Status', v:r=>stagePill(r)},{h:'Approvals', v:r=>votes(r)},
      {h:'Created by', v:r=>esc(Store.user(r.created_by).name)},{h:'Payee', v:r=>esc(r.payee||Store.user(r.created_by).name)},
      {h:'Expense date', cls:'nw', v:r=>fmtDate(r.expense_date)},{h:'Branch', v:r=>esc(branchName(r.branch_id))},
      {h:'Total', r:1, cls:'num', v:r=>`<b>${fmtMoney(r.currency,r.total)}</b>`},{h:'Actions', r:1, fixed:1, v:act}];
    return [
      {h:'Name', cls:'name', v:r=>`${esc(r.title)}<small>${esc(r.supplier_id?Store.supName(r.supplier_id):(r.payee||'No supplier yet'))} · ${esc(Store.catName(r.category_id))}</small>`},
      {h:'Number', cls:'mono', v:r=>esc(r.number)},{h:'Status', v:r=>stagePill(r)},{h:'Approvals', v:r=>votes(r)},
      {h:'Requisitioner', v:r=>`${esc(Store.user(r.created_by).name)}<br><small class="faint">${esc(r.department||'')}</small>`},
      {h:'Branch', v:r=>esc(branchName(r.branch_id))},
      {h:'Purchaser', v:r=>r.purchaser_id?esc(Store.user(r.purchaser_id).name):'<span class="faint">—</span>'},
      {h:'Created on', cls:'nw', v:r=>fmtDate(r.created_at)},{h:'Date sent', cls:'nw', v:r=>fmtDate(r.submitted_at)},
      {h:'Due date', cls:'nw', v:r=>`<span class="${isOverdue(r)?'over':''}">${fmtDate(r.due_date)}</span>`},
      {h:'Total', r:1, cls:'num', v:r=>`<b>${fmtMoney(r.currency,r.total)}</b>`},{h:'Actions', r:1, fixed:1, v:act}];
  },
  reqList(){
    const src = reqsAll();
    const T = [['all','All'],['pending','Pending'],['review','Pending review'],['open','Open'],['fulfilled','Fulfilled'],['draft','Drafts'],['closed','Closed'],['overdue','Overdue']];
    const pick = k => k==='all'?src : k==='overdue'?src.filter(isOverdue) : src.filter(r=>reqTab(r)===k);
    const rows = this.filterReqs(pick(this.curTab('req','all')),'req','requisition'); this._export = ['requisitions',rows];
    return `${pageHead('Requisitions','Every request to spend money, from draft to payment.', btn('Smart scan','data-act="scan"','','scan')+btn('Export CSV','data-act="export"','',"down")+btn('Create requisition','data-act="new-req"','primary','plus'))}
      <section class="panel">${this.tabs('req',T,k=>pick(k).length)}${filterBar('req',this.reqFilterOpts('requisition'))}
      ${tableHTML(this.reqCols(), rows, {key:'req', open:r=>'requisition:'+r.id, empty:'No requisitions match this view.', summary:byCurText(rows)})}</section>`;
  },
  expenseList(){
    const src = expensesAll();
    const T = [['all','All'],['pending','Pending'],['review','Pending review'],['approved','Approved'],['draft','Drafts'],['rejected','Rejected'],['paid','Paid']];
    const pick = k => k==='all'?src : src.filter(r=>r.status===k || (k==='rejected'&&r.status==='withdrawn'));
    const rows = this.filterReqs(pick(this.curTab('exp','all')),'exp','expense'); this._export = ['requisitions',rows];
    return `${pageHead('Expenses','Money already spent by staff — mileage, meals, travel, small purchases — claimed back with receipts and approved before reimbursement.', btn('Smart scan','data-act="scan" data-kind="expense"','','scan')+btn('Export CSV','data-act="export"','','down')+btn('Add expense record','data-act="new-expense"','primary','plus'))}
      <section class="panel">${this.tabs('exp',T,k=>pick(k).length)}${filterBar('exp',this.reqFilterOpts('expense'))}
      ${tableHTML(this.reqCols('expense'), rows, {key:'exp', open:r=>'expense:'+r.id, empty:'No expenses match this view.', summary:byCurText(rows)})}</section>`;
  },
  approvalsPage(){
    const mine = awaitingMe(), rev = awaitingReview();
    const lbl = {requisition:'Requisition',expense:'Expense',po:'Purchase order',contract:'Contract'};
    const cols = [{h:'Record',cls:'name',v:x=>`${esc(x.r.title||('Purchase order – '+Store.supName(x.r.supplier_id)))}<small>${esc(lbl[x.type])}</small>`},{h:'Number',cls:'mono',v:x=>esc(x.r.number)},{h:'From',v:x=>esc(Store.user(x.r.created_by).name)},{h:'Sent',cls:'nw',v:x=>fmtDate(x.r.submitted_at||x.r.created_at)},{h:'Approvals',v:x=>votes(x.r)},{h:'Amount',r:1,cls:'num',v:x=>`<b>${fmtMoney(x.r.currency,x.r.total!=null?x.r.total:x.r.value)}</b>`}];
    const decided = [].concat(Store.all('requisitions').map(r=>[r.kind==='expense'?'expense':'requisition',r]), Store.all('purchase_orders').map(r=>['po',r]), Store.all('contracts').map(r=>['contract',r])).filter(([,r])=>(r.approvals||[]).some(a=>a.approver_id===me().id)).sort((a,b)=>(b[1].decided_at||b[1].created_at).localeCompare(a[1].decided_at||a[1].created_at)).slice(0,20);
    const pick = {h:'<input type="checkbox" data-act="ap-all" aria-label="Select all">', fixed:1, v:x=>`<input type="checkbox" class="ap-sel" value="${x.t}:${x.r.id}" aria-label="Select ${esc(x.r.number)}" data-stop>`};
    const wait = {h:'Waiting', v:x=>slaPill(x.r)};
    const quick = {h:'', r:1, fixed:1, v:x=>btn('Review','data-act="qa-open" data-id="'+x.t+':'+x.r.id+'"','sm')};
    return `${pageHead('My approvals','Review each record on one screen and approve or reject it, or tick several and approve them together.', mine.length>1?btn('Approve selected','data-act="ap-bulk"','primary','check'):'')}
      ${panel('Waiting for your decision','<span class="faint">'+mine.length+'</span>', tableHTML([pick].concat(cols.slice(0,4), [wait], cols.slice(4), [quick]), mine, {open:x=>x.type+':'+x.r.id, empty:'Nothing is waiting for your approval.'}))}
      ${can.review(me())?panel('Pending review (Finance)','<span class="faint">'+rev.length+'</span>', tableHTML(cols, rev, {open:x=>x.type+':'+x.r.id, empty:'Nothing is waiting for review.'})):''}
      ${panel('Your recent decisions','', tableHTML([{h:'Record',cls:'name',v:([t,r])=>`${esc(r.title||'Purchase order – '+Store.supName(r.supplier_id))}<small>${esc(lbl[t])}</small>`},{h:'Number',cls:'mono',v:([,r])=>esc(r.number)},{h:'Your decision',v:([,r])=>{const a=r.approvals.find(x=>x.approver_id===me().id);return pill(a.decision==='approved'?'Approved':'Rejected',a.decision==='approved'?'t-green':'t-red')+' <span class="faint">'+fmtDT(a.at)+'</span>';}},{h:'Amount',r:1,cls:'num',v:([,r])=>fmtMoney(r.currency,r.total!=null?r.total:r.value)}], decided, {open:([t,r])=>t+':'+r.id, empty:'No decisions yet.'}))}`;
  },

  /* ---------------- requests ---------------- */
  requestList(){
    const u = me();
    const src = Store.all('requests').filter(r=>inBranch(r) && (can.seeAll(u) || r.created_by===u.id || r.assigned_to===u.id));
    const T = [['all','All'],['pending','Pending'],['open','Open'],['scheduled','Scheduled'],['draft','Drafts'],['completed','Completed']];
    const pick = k => k==='all'?src : k==='completed'?src.filter(r=>['completed','cancelled'].includes(r.status)) : src.filter(r=>r.status===k);
    const fo = {ph:'Search requests…', mine:'View my branch requests', more:[{k:'type',label:'Type',options:REQUEST_TYPES.map(t=>[t,t]),get:r=>r.type},{k:'prio',label:'Priority',options:PRIORITIES.map(p=>[p,p]),get:r=>r.priority},{k:'dept',label:'Department',options:deptOpts(),get:r=>r.department},{k:'person',label:'Requester',options:personOpts(),get:r=>r.created_by}]};
    const rows = applyFilters(pick(this.curTab('rq','all')),'rq',Object.assign({},fo,{text:r=>[r.title,r.number,r.description,Store.user(r.created_by).name,r.type].join(' '), mineFn:r=>r.branch_id===u.branch_id})).sort((a,b)=>b.created_at.localeCompare(a.created_at));
    return `${pageHead('Requests','Ask for things that don’t need a spending approval first: items from stores, repairs, IT support or facilities work. Procurement fulfils them from stock or turns them into a requisition. Repeat requests can be scheduled.', btn('Create request','data-act="new-request"','primary','plus'))}
      <section class="panel">${this.tabs('rq',T,k=>pick(k).length)}${filterBar('rq',fo)}
      ${tableHTML([{h:'Name',cls:'name',v:r=>`${esc(r.title)}<small>${esc((r.items||[]).map(i=>i.qty+' × '+i.description).join('; ').slice(0,90))}</small>`},{h:'Number',cls:'mono',v:r=>esc(r.number)},{h:'Type',v:r=>esc(r.type)},{h:'Status',v:r=>pill(...(REQ_STATUS[r.status]||[r.status,'t-grey']))+(r.status==='scheduled'?`<br><small class="faint">${esc(RECURRENCE[r.recurrence])} · next ${fmtDate(r.next_run)}</small>`:'')},
        {h:'Requester',v:r=>`${esc(Store.user(r.created_by).name)}<br><small class="faint">${esc(r.department||'')}</small>`},{h:'Branch',v:r=>esc(branchName(r.branch_id))},{h:'Assigned to',v:r=>r.assigned_to?esc(Store.user(r.assigned_to).name):'—'},
        {h:'Needed by',cls:'nw',v:r=>`<span class="${r.needed_by&&r.needed_by<todayStr()&&['pending','open'].includes(r.status)?'over':''}">${fmtDate(r.needed_by)}</span>`},{h:'Priority',v:r=>pill(r.priority,r.priority==='Urgent'||r.priority==='High'?'t-red':r.priority==='Low'?'t-grey':'t-blue')},
        {h:'Actions',r:1,fixed:1,v:r=>`<span class="acts">${ibtn('copy','Duplicate',`data-act="rq-dup" data-id="${r.id}"`)}</span>`}], rows, {key:'rq', open:r=>'request:'+r.id, empty:'No requests in this view.'})}</section>`;
  },

  /* ---------------- plan & budgets ---------------- */
  planPage(){
    const yr = +S().fiscal_year || new Date().getFullYear();
    const rows = Store.all('plan_lines').filter(p=>+p.year===yr).sort((a,b)=>(a.quarter+a.department).localeCompare(b.quarter+b.department));
    const q = k => rows.filter(p=>p.quarter===k);
    const st = {planned:['Planned','t-grey'], requisitioned:['Requisitioned','t-blue'], completed:['Completed','t-green'], cancelled:['Cancelled','t-grey']};
    this._export = ['plan',rows];
    return `${pageHead('Procurement plan · FY'+yr,'What each department expects to buy this year, when, and how it will be sourced. Raise requisitions straight from the plan.', (can.master(me())?btn('Add plan line','data-act="plan-new"','primary','plus'):'')+btn('Export CSV','data-act="export"','','down'))}
      <div class="stats">${['Q1','Q2','Q3','Q4'].map(k=>`<div class="stat static"><span class="k">${k}</span><span class="v">${q(k).length}</span><span class="s">${baseCur()} ${num(baseSum(q(k),p=>p.est_cost))} estimated</span></div>`).join('')}</div>
      <section class="panel">${tableHTML([
        {h:'Quarter',cls:'mono',v:p=>esc(p.quarter)},{h:'Need',cls:'name',v:p=>`${esc(p.description)}<small>${esc(Store.catName(p.category_id))}</small>`},{h:'Department',v:p=>esc(p.department)},
        {h:'Method',v:p=>esc(p.method)},{h:'Qty',r:1,cls:'num',v:p=>p.qty},{h:'Estimate',r:1,cls:'num',v:p=>fmtMoney(p.currency,p.est_cost)},
        {h:'Status',v:p=>{const s=st[p.status]||st.planned; return pill(s[0],s[1])+(p.req_id?` <button class="link mono" data-open="requisition:${p.req_id}">${esc((Store.byId('requisitions',p.req_id)||{}).number||'')}</button>`:'');}},
        {h:'Actions',r:1,fixed:1,v:p=>`${p.status==='planned'?btn('Raise requisition',`data-act="plan-req" data-id="${p.id}"`,'sm'):''} ${can.master(me())?ibtn('edit','Edit',`data-act="plan-edit" data-id="${p.id}"`):''}`}
      ], rows, {key:'plan', empty:'No plan lines for this year yet.', summary:'Total planned '+baseCur()+' '+num(baseSum(rows,p=>p.est_cost))})}</section>`;
  },
  budgetsPage(){
    const rows = Store.all('budgets').filter(inBranch).sort((a,b)=>a.code.localeCompare(b.code));
    const tot = rows.reduce((t,b)=>{const x=budgetUse(b); t.a+=+b.amount; t.s+=x.spent; t.c+=x.committed; return t;},{a:0,s:0,c:0});
    this._export = ['budgets',rows];
    const stat = (k,v,s) => `<div class="stat static"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    return `${pageHead('Budgets · FY'+(S().fiscal_year||''),'Each requisition and expense is tagged to a budget line. Committed = pending, in review or approved but not yet paid. All amounts in '+baseCur()+'.', (can.finance(me())?btn('Add budget line','data-act="budget-new"','primary','plus'):'')+btn('Export CSV','data-act="export"','','down'))}
      <div class="stats">${stat('Total budget',fmtK(tot.a),baseCur()+' '+num(tot.a))}${stat('Spent',fmtK(tot.s),(tot.a?(tot.s/tot.a*100).toFixed(1):0)+'% of budget')}${stat('Committed',fmtK(tot.c),'Pending or approved, not paid')}${stat('Available',fmtK(tot.a-tot.s-tot.c),baseCur()+' '+num(tot.a-tot.s-tot.c))}</div>
      <section class="panel">${tableHTML([
        {h:'Code',cls:'mono',v:b=>esc(b.code)},{h:'Budget line',cls:'name',v:b=>`${esc(b.name)}<small>${esc(b.department)} · ${esc(Store.catName(b.category_id))}</small>`},{h:'Branch',v:b=>esc(branchName(b.branch_id))},
        {h:'Budget',r:1,cls:'num',v:b=>num(b.amount)},{h:'Spent',r:1,cls:'num',v:b=>num(budgetUse(b).spent)},{h:'Committed',r:1,cls:'num',v:b=>num(budgetUse(b).committed)},
        {h:'Available',r:1,cls:'num',v:b=>{const a=budgetUse(b).available; return `<span class="${a<0?'over':''}">${num(a)}</span>`;}},
        {h:'Used',v:b=>{const x=budgetUse(b); const sp=b.amount?x.spent/b.amount*100:0, cm=b.amount?x.committed/b.amount*100:0; return `<div class="meter-row" title="Spent ${sp.toFixed(0)}% · committed ${cm.toFixed(0)}%"><div class="meter"><i style="width:${Math.min(100,sp)}%;background:var(--link)"></i><i style="width:${Math.min(100-Math.min(100,sp),cm)}%;background:var(--accent)"></i></div><span class="num ${x.pct>100?'over':''}">${x.pct.toFixed(0)}%</span></div>`;}},
        {h:'Actions',r:1,fixed:1,v:b=>can.finance(me())?ibtn('edit','Edit',`data-act="budget-edit" data-id="${b.id}"`):''}
      ], rows, {key:'bud', summary:`<i class="key" style="background:var(--link)"></i> spent &nbsp;<i class="key" style="background:var(--accent)"></i> committed`})}</section>`;
  },

  /* ---------------- sourcing, ordering, delivery, invoices, payments ---------------- */
  rfqList(){
    const rows = Store.all('rfqs').slice().sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const T=[['open','Open'],['evaluate','To evaluate'],['awarded','Awarded'],['all','All']];
    const pick = k => k==='all'?rows : k==='open'?rows.filter(q=>q.status==='open'&&q.closing_at>nowISO()) : k==='evaluate'?rows.filter(q=>q.status==='open'&&q.closing_at<=nowISO()) : rows.filter(q=>q.status===k);
    const list = applyFilters(pick(this.curTab('rfq','open')),'rfq',{text:q=>[q.title,q.number,q.description].join(' ')});
    return `${pageHead('RFQs & tenders','Invite prequalified suppliers to quote, keep bids sealed until closing, compare them on price, delivery and quality, and award.', can.procure(me())?btn('New RFQ','data-act="rfq-new"','primary','plus'):'')}
      <section class="panel">${this.tabs('rfq',T,k=>pick(k).length)}${filterBar('rfq',{ph:'Search RFQs…'})}${tableHTML([
        {h:'RFQ',cls:'name',v:q=>`${esc(q.title)}<small>${esc(Store.catName(q.category_id))}${q.req_id?' · for '+esc((Store.byId('requisitions',q.req_id)||{}).number||''):''}</small>`},
        {h:'Number',cls:'mono',v:q=>esc(q.number)},{h:'Status',v:q=>pill(...rfqState(q))},
        {h:'Invited',r:1,cls:'num',v:q=>(q.invited_ids||[]).length},{h:'Bids',r:1,cls:'num',v:q=>bidsFor(q).length},
        {h:'Sealed',v:q=>q.sealed?'Yes':'No'},{h:'Closes',cls:'nw',v:q=>fmtDT(q.closing_at)},
        {h:'Awarded to',v:q=>q.awarded_bid_id?esc(Store.supName((Store.byId('bids',q.awarded_bid_id)||{}).supplier_id)):'—'}
      ], list, {key:'rfq', open:q=>'rfq:'+q.id, empty:'No RFQs in this view.'})}</section>`;
  },
  poList(){
    const u = me();
    const pos = Store.all('purchase_orders').filter(p=>inBranch(p) && (can.seeAll(u) || (Store.byId('requisitions',p.req_id)||{}).created_by===u.id)).slice().sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const toOrder = Store.all('requisitions').filter(r=>inBranch(r)&&['to_order','sourcing'].includes(reqStage(r)));
    const T=[['all','All'],['pending','Pending approval'],['review','Pending review'],['open','Open'],['drafts','Drafts'],['closed','Closed'],['toorder','Approved – to order']];
    const pick = k => k==='all'?pos : pos.filter(p=>poTab(p)===k);
    const tab = this.curTab('po','all');
    const fo = {ph:'Search PO number, supplier, item…', total:true, mine:'View my branch purchase orders', more:[{k:'sup',label:'Supplier',options:supOpts(),get:p=>p.supplier_id},{k:'status',label:'Status',options:Object.entries(POSTATE).map(([k,v])=>[k,v[0]]),get:p=>p.status},{k:'person',label:'Raised by',options:personOpts(),get:p=>p.created_by}]};
    let body;
    if (tab==='toorder') body = tableHTML([...this.reqCols().slice(0,3),{h:'Approved',cls:'nw',v:r=>fmtDate(r.decided_at)},{h:'Total',r:1,cls:'num',v:r=>fmtMoney(r.currency,r.total)},{h:'Actions',r:1,fixed:1,v:r=>can.procure(u)&&reqStage(r)==='to_order'?btn('Raise PO',`data-act="po-new" data-id="${r.id}"`,'sm primary')+' '+btn('Start RFQ',`data-act="rfq-new" data-id="${r.id}"`,'sm'):''}], toOrder, {key:'po-to', open:r=>'requisition:'+r.id, empty:'Every approved purchase has an RFQ or a PO.'});
    else { const rows = applyFilters(pick(tab),'po',Object.assign({},fo,{text:p=>[p.number,Store.supName(p.supplier_id),p.lines.map(l=>l.description).join(' '),(Store.byId('requisitions',p.req_id)||{}).number].join(' '), amount:p=>toBase(p.currency,p.total), mineFn:p=>p.branch_id===u.branch_id}));
      body = tableHTML([
        {h:'PO',cls:'mono',v:p=>esc(p.number)},{h:'Supplier',cls:'name',v:p=>`${esc(Store.supName(p.supplier_id))}<small>${esc(p.lines.map(l=>l.description).join(', ').slice(0,80))}</small>`},
        {h:'Requisition',cls:'mono',v:p=>esc((Store.byId('requisitions',p.req_id)||{}).number||'—')},{h:'Status',v:p=>pill(...(POSTATE[p.status]||[p.status,'t-grey']))},{h:'Approvals',v:p=>votes(p)},
        {h:'Branch',v:p=>esc(branchName(p.branch_id))},{h:'Created on',cls:'nw',v:p=>fmtDate(p.created_at)},{h:'Delivery',cls:'nw',v:p=>`<span class="${['issued','partially_received'].includes(p.status)&&p.delivery_date<todayStr()?'over':''}">${fmtDate(p.delivery_date)}</span>`},
        {h:'Total',r:1,cls:'num',v:p=>`<b>${fmtMoney(p.currency,p.total)}</b>`},
        {h:'Actions',r:1,fixed:1,v:p=>`<span class="acts">${ibtn('print','Print',`data-act="po-print" data-id="${p.id}"`)}${p.status==='draft'&&can.procure(u)?ibtn('edit','Edit draft',`data-act="po-edit" data-id="${p.id}"`):''}</span>`}
      ], rows, {key:'po', open:p=>'po:'+p.id, empty:'No purchase orders here.', summary:byCurText(rows)}); }
    return `${pageHead('Purchase orders','Orders to suppliers from approved requisitions and RFQ awards. Each PO is approved'+(S().review_enabled?' and reviewed':'')+' before it is issued.', btn('Smart scan','data-act="scan" data-kind="invoice"','','scan')+(can.procure(u)?btn('Create purchase order','data-act="new-po"','primary','plus'):''))}
      <section class="panel">${this.tabs('po',T,k=>k==='toorder'?toOrder.length:pick(k).length)}${tab==='toorder'?'':filterBar('po',fo)}${body}</section>`;
  },
  deliveryList(){
    const u = me();
    const vis = p => can.seeAll(u) || (Store.byId('requisitions',p.req_id)||{}).created_by===u.id;
    const pos = Store.all('purchase_orders').filter(p=>inBranch(p) && vis(p) && LIVE_PO.concat(['cancelled']).includes(p.status)).sort((a,b)=>(a.delivery_date||'').localeCompare(b.delivery_date||''));
    const tabOf = p => ({issued:'new', partially_received:'partial', received:'full'})[p.status] || 'closed';
    const T=[['all','All'],['new','New'],['partial','Partially received'],['full','Fully received'],['closed','Closed']];
    const pick = k => k==='all'?pos : pos.filter(p=>tabOf(p)===k);
    const fo = {ph:'Search PO, supplier, item…', total:true, mine:'View my own deliveries', more:[{k:'sup',label:'Supplier',options:supOpts(),get:p=>p.supplier_id}]};
    const rows = applyFilters(pick(this.curTab('dl','all')),'dl',Object.assign({},fo,{text:p=>[p.number,Store.supName(p.supplier_id),p.lines.map(l=>l.description).join(' ')].join(' '), date:p=>p.delivery_date, amount:p=>toBase(p.currency,p.total), mineFn:p=>(Store.byId('requisitions',p.req_id)||{}).created_by===u.id || receiptsFor(p).some(g=>g.received_by===u.id)}));
    const last = p => receiptsFor(p).map(g=>g.received_on).sort().pop();
    const DS = {issued:['New','t-blue'],partially_received:['Partially received','t-amber'],received:['Fully received','t-green'],closed:['Closed','t-grey'],cancelled:['Cancelled','t-grey']};
    return `${pageHead('Deliveries','Confirm what actually arrived against each purchase order. Finance pays only for what was received.')}
      <section class="panel">${this.tabs('dl',T,k=>pick(k).length)}${filterBar('dl',fo)}
      ${tableHTML([{h:'PO',cls:'mono',v:p=>esc(p.number)},{h:'Supplier',cls:'name',v:p=>`${esc(Store.supName(p.supplier_id))}<small>${esc(p.lines.map(l=>l.qty+' × '+l.description).join('; ').slice(0,90))}</small>`},{h:'Requisition',cls:'mono',v:p=>esc((Store.byId('requisitions',p.req_id)||{}).number||'—')},{h:'Status',v:p=>pill(...DS[p.status])},
        {h:'Expected',cls:'nw',v:p=>`<span class="${['issued','partially_received'].includes(p.status)&&p.delivery_date<todayStr()?'over':''}">${fmtDate(p.delivery_date)}</span>`},{h:'Last received',cls:'nw',v:p=>fmtDate(last(p))},{h:'GRNs',v:p=>esc(receiptsFor(p).map(g=>g.number).join(', ')||'—')},
        {h:'Total',r:1,cls:'num',v:p=>fmtMoney(p.currency,p.total)},{h:'Actions',r:1,fixed:1,v:p=>['issued','partially_received'].includes(p.status)&&can.receive(u,p)?btn('Record receipt',`data-act="grn-new" data-id="${p.id}"`,'sm primary'):''}], rows, {key:'dl', open:p=>'po:'+p.id, empty:'No deliveries in this view.'})}</section>`;
  },
  invoiceList(){
    const withMatch = v => { const r=Store.byId('requisitions',v.req_id); return r?matchFor(r):null; };
    const src = Store.all('invoices').slice().sort((a,b)=>b.created_at.localeCompare(a.created_at));
    const T=[['all','All'],['open','To pay'],['mismatch','Mismatch'],['paid','Paid']];
    const pick = k => k==='all'?src : k==='paid'?src.filter(v=>v.status==='paid') : k==='mismatch'?src.filter(v=>v.status!=='paid'&&withMatch(v)&&!withMatch(v).invOk) : src.filter(v=>v.status!=='paid');
    const fo = {ph:'Search invoice, supplier…', total:true, more:[{k:'sup',label:'Supplier',options:supOpts(),get:v=>v.supplier_id}]};
    const rows = applyFilters(pick(this.curTab('inv','all')),'inv',Object.assign({},fo,{text:v=>[v.number,v.supplier_invoice_no,Store.supName(v.supplier_id)].join(' '), date:v=>v.invoice_date, amount:v=>toBase(v.currency,v.amount)}));
    this._export = ['invoices',rows];
    return `${pageHead('Invoices','Supplier invoices captured against purchase orders and checked against what was ordered and received (3-way match).', btn('Smart scan','data-act="scan" data-kind="invoice"','','scan')+btn('Export CSV','data-act="export"','','down'))}
      <section class="panel">${this.tabs('inv',T,k=>pick(k).length)}${filterBar('inv',fo)}${tableHTML([
        {h:'Invoice',cls:'mono',v:v=>esc(v.number)},{h:'Supplier ref',cls:'mono',v:v=>esc(v.supplier_invoice_no)},{h:'Supplier',cls:'name',v:v=>esc(Store.supName(v.supplier_id))},
        {h:'PO',cls:'mono',v:v=>esc((Store.byId('purchase_orders',v.po_id)||{}).number||'—')},{h:'Invoice date',cls:'nw',v:v=>fmtDate(v.invoice_date)},{h:'Due',cls:'nw',v:v=>`<span class="${v.status!=='paid'&&v.due_date<todayStr()?'over':''}">${fmtDate(v.due_date)}</span>`},
        {h:'Match',v:v=>{ if (v.status==='paid') return pill('Paid','t-green'); const m=withMatch(v); return !m?'—': m.invOk?pill('Matched','t-green'):pill('Mismatch','t-red'); }},
        {h:'Amount',r:1,cls:'num',v:v=>`<b>${fmtMoney(v.currency,v.amount)}</b>`}
      ], rows, {key:'inv', open:v=>'invoice:'+v.id, empty:'No invoices here. Capture them from a purchase order once goods are received.'})}</section>`;
  },
  paymentsPage(){
    const all = Store.all('requisitions').filter(inBranch);
    const T = [['ready','Ready to pay'],['waiting','Waiting (delivery / invoice)'],['paid','Paid']];
    const pick = k => k==='ready'?all.filter(r=>reqStage(r)==='to_pay') : k==='waiting'?all.filter(r=>['ordered','received'].includes(reqStage(r))) : all.filter(r=>r.status==='paid').sort((a,b)=>(b.paid_at||'').localeCompare(a.paid_at||''));
    const tab = this.curTab('pay','ready');
    const rows = applyFilters(pick(tab),'pay',{text:r=>[r.title,r.number,Store.supName(r.supplier_id),r.payee].join(' '), amount:r=>toBase(r.currency,r.total)});
    const cols = [
      ...(tab==='ready'&&can.finance(me())?[{h:'<input type="checkbox" data-act="pay-all" aria-label="Select all">',fixed:1,v:r=>`<input type="checkbox" class="pay-sel" value="${r.id}" aria-label="Select ${esc(r.number)}" data-stop>`}]:[]),
      {h:'Requisition',cls:'name',v:r=>`${esc(r.title)}<small class="mono">${esc(r.number)} · ${r.kind==='expense'?'expense claim':r.kind==='payment'?'direct payment':'via '+esc(posFor(r).map(p=>p.number).join(', '))}</small>`},
      {h:'Payee',v:r=>esc(r.supplier_id?Store.supName(r.supplier_id):(r.payee||Store.user(r.created_by).name))},
      {h:tab==='paid'?'Paid on':'Due',cls:'nw',v:r=>tab==='paid'?fmtDate(r.payment&&r.payment.paid_on):`<span class="${isOverdue(r)?'over':''}">${fmtDate(r.due_date)}</span>`},
      {h:tab==='paid'?'Reference':'Stage',v:r=>tab==='paid'?`<span class="mono">${esc(r.payment&&r.payment.reference)}</span>`:stagePill(r)},
      {h:'Amount',r:1,cls:'num',v:r=>`<b>${fmtMoney(r.currency, tab==='paid'&&r.payment?r.payment.amount:(r.kind!=='purchase'||!invoicesFor(r).length?r.total:sum(invoicesFor(r).filter(v=>v.status!=='paid'),v=>v.amount)))}</b>`},
      ...(tab==='ready'&&can.finance(me())?[{h:'Actions',r:1,fixed:1,v:r=>btn('Record payment',`data-act="pay" data-id="${r.id}"`,'sm primary')}]:[])
    ];
    return `${pageHead('Payments','Only approved and reviewed items reach this list. Purchases also need goods received and a matched invoice.', tab==='ready'&&can.finance(me())?btn('Export payment file','data-act="pay-export"','','down'):'')}
      <section class="panel">${this.tabs('pay',T,k=>pick(k).length)}${filterBar('pay',{ph:'Search payee, number…', total:true, dates:false})}${tableHTML(cols, rows, {key:'pay', open:r=>(r.kind==='expense'?'expense':'requisition')+':'+r.id, empty:'Nothing here.', summary:byCurText(rows)})}</section>
      ${tab==='ready'&&can.finance(me())?'<p class="faint" style="margin:0;font-size:12.5px">Tick items and export a payment file (CSV with payee, bank details, amount and reference) for your bank or ERP. Exporting does not mark them paid — record each payment once the bank confirms it.</p>':''}`;
  },
