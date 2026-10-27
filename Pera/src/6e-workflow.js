/* =====================================================================
   WORKFLOW — approval reminders & escalation, quick / bulk approval, links from email,
   modules on/off, first-run setup wizard
   ===================================================================== */

/* ---------- modules ---------- */
const MODULES = [
  ['expenses','Expense claims','Staff claim back money they have already spent'],
  ['requests','Requests','Ask stores, IT, facilities or transport for something'],
  ['contracts','Contracts','Supplier agreements, renewals, amendments and call-offs'],
  ['rfq','RFQs & tenders','Sealed bids, weighted scoring and awards'],
  ['plan','Procurement plan','What each department plans to buy, by quarter'],
  ['budgets','Budgets','Budget lines, headroom and budget control'],
  ['inventory','Inventory','Stock on hand, reorder levels and issuing from stores'],
  ['scan','Smart scan','Read quotes, invoices and receipts into forms'],
  ['portal','Supplier portal','Suppliers quote, see their orders and send invoices online']];
const CORE_MODULES = 'Requisitions, approvals, purchase orders, deliveries, invoices, payments, suppliers, items, reports and the audit trail';
const mod = k => ((S()||{}).modules||{})[k] !== false;
const MOD_VIEWS = {expenses:['expenses'], requests:['requests','request'], contracts:['contracts','contract'], rfq:['rfqs','rfq'], plan:['plan'], budgets:['budgets']};
const MOD_ACTS = {'new-expense':'expenses', 'new-request':'requests', 'new-contract':'contracts', 'ct-new':'contracts', 'rfq-new':'rfq', scan:'scan', 'sup-invite':'portal', 'stock-adj':'inventory', 'budget-new':'budgets', 'plan-new':'plan'};

/* ---------- approval reminders & escalation ---------- */
const remCfg = () => Object.assign({enabled:true, reminder_hours:24, escalate_hours:72, escalate_to:[]}, S().reminders||{});
const hoursSince = iso => (Date.now() - new Date(iso).getTime()) / 36e5;
const ageText = h => h < 1 ? Math.max(1, Math.round(h*60))+' min' : h < 48 ? Math.round(h)+' h' : Math.round(h/24)+' days';
/* when the step now waiting started: submission for step 1, the last approval of the step before for later steps */
function stepStart(r){
  const cur = currentStage(r), base = r.submitted_at || r.created_at;
  if (cur <= 0) return base;
  const prev = (r.approvals||[]).filter(a=>(a.stage||0)===cur-1 && a.decision==='approved').map(a=>a.at).sort();
  return prev[prev.length-1] || base;
}
function slaPill(r){
  const c = remCfg(), h = hoursSince(stepStart(r));
  const tone = c.enabled && c.escalate_hours && h >= c.escalate_hours ? 't-red' : c.enabled && c.reminder_hours && h >= c.reminder_hours ? 't-amber' : 't-grey';
  return `<span title="Waiting at this approval step since ${esc(fmtDT(stepStart(r)))}">${pill('Waiting '+ageText(h), tone)}</span>`;
}
const pendingApprovals = () => [].concat(
  Store.all('requisitions').filter(r=>r.status==='pending').map(r=>({t:'requisitions', type:r.kind==='expense'?'expense':'requisition', r})),
  Store.all('purchase_orders').filter(r=>r.status==='pending_approval').map(r=>({t:'purchase_orders', type:'po', r})),
  Store.all('contracts').filter(r=>r.status==='pending').map(r=>({t:'contracts', type:'contract', r})));
const recLabel = r => r.number+' – '+(r.title || 'Purchase order to '+Store.supName(r.supplier_id));
async function runReminders(){
  const c = remCfg(); if (!c.enabled) return 0;
  if (LIVE){ try{ const {data, error} = await Store.sb.rpc('run_reminders'); if (error) throw error; if (data) await Store.reloadTables(['notifications','audit_log']); return data||0; }catch(e){ console.warn('Reminders not run:', e.message||e); return 0; } }
  let sent = 0;
  for (const {type, r} of pendingApprovals()){
    const cur = currentStage(r); if (cur < 0) continue;
    const s = stagesOf(r)[cur], start = stepStart(r), h = hoursSince(start);
    if (c.reminder_hours && h >= c.reminder_hours){
      const waiting = s.ids.filter(id=>!(r.approvals||[]).some(a=>a.approver_id===id && (a.stage||0)===cur));
      for (const id of waiting){
        const last = Store.all('notifications').filter(n=>n.user_id===id && n.entity_id===r.id && /^Reminder:/.test(n.message) && n.at>=start).map(n=>n.at).sort().pop();
        if (last && hoursSince(last) < c.reminder_hours) continue;
        await Store.notify(withDelegates([id]), type, r, 'Reminder: '+recLabel(r)+' has been waiting '+ageText(h)+' for your approval'); sent++;
      }
    }
    if (c.escalate_hours && h >= c.escalate_hours){
      const key = 'Escalated: '+r.number+' step '+(cur+1);
      if (!Store.all('notifications').some(n=>n.entity_id===r.id && n.message.startsWith(key))){
        const to = (c.escalate_to||[]).length ? c.escalate_to : Store.all('app_users').filter(u=>u.active && u.role==='admin').map(u=>u.id);
        await Store.notify(to.concat([r.created_by]), type, r, key+' – '+recLabel(r)+' has waited '+ageText(h)+' for '+s.ids.map(a=>Store.user(a).name).join(', '));
        Store.data.audit_log.push({id:uid(), entity_type:type, entity_id:r.id, entity_number:r.number, action:'Escalated', details:'Step '+(cur+1)+' ('+s.label+') waited '+ageText(h), user_id:null, user_name:'Pera (automatic)', at:nowISO()});
        Store.persist(); sent++;
      }
    }
  }
  return sent;
}

/* ---------- links from email: #approve/<type>/<id> and #open/<type>/<id> ---------- */
const TYPE_TABLE = {requisition:'requisitions', expense:'requisitions', po:'purchase_orders', contract:'contracts'};
function readDeepLink(){
  const m = /^#(approve|open)\/(requisition|expense|po|contract|rfq|supplier|request)\/([\w-]+)$/.exec(location.hash||'');
  if (m){ try{ sessionStorage.setItem('pera-link', location.hash); }catch(e){} return m; }
  let saved = ''; try{ saved = sessionStorage.getItem('pera-link')||''; }catch(e){}
  return saved ? /^#(approve|open)\/(\w+)\/([\w-]+)$/.exec(saved) : null;
}
function applyDeepLink(){
  const m = readDeepLink(); if (!m) return false;
  try{ sessionStorage.removeItem('pera-link'); }catch(e){}
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  const [, verb, type, id] = m;
  if (verb==='approve' && TYPE_TABLE[type]){ App.view = 'quick'; App.param = TYPE_TABLE[type]+':'+id; return true; }
  const R = {requisition:'req', expense:'req', po:'po', contract:'contract', rfq:'rfq', supplier:'supplier', request:'request'};
  if (R[type]){ App.view = R[type]; App.param = id; return true; }
  return false;
}

/* ---------- wrap start-up: reminders after loading, and the first-run wizard ---------- */
const _init3 = Store.init;
Store.init = async function(){
  const ok = await _init3.apply(this, arguments);
  if (ok && this.me){ try{ await runReminders(); }catch(e){ console.warn(e); } }
  return ok;
};

Object.assign(App, {
  /* one-screen approval, opened from an email button or a notification */
  quickPage(){
    const [t, id] = String(this.param||'').split(':'), r = Store.byId(t, id), u = me();
    if (!r) return `<div class="empty">That record was not found, or you don’t have access to it.</div>`;
    const type = t==='requisitions' ? (r.kind==='expense'?'expense':'requisition') : t==='purchase_orders' ? 'po' : 'contract';
    const open = btn('Open full record', `data-open="${type}:${r.id}"`, 'sm ghost');
    const queue = awaitingMe().filter(x=>x.r.id!==r.id);
    const next = queue.length ? btn('Next waiting ('+queue.length+')', `data-act="qa-next"`, 'sm primary') : btn('My approvals','data-go="approvals"','sm');
    if (!can.decide(u, r)){
      const a = (r.approvals||[]).find(x=>x.approver_id===u.id || x.by_id===u.id);
      const why = a ? 'You '+a.decision+' this on '+fmtDT(a.at)+'.' : r.created_by===u.id ? 'You raised this, so you can’t approve it.' : !['pending','pending_approval'].includes(r.status) ? 'It is no longer waiting for approval.' : 'It isn’t waiting for your decision at this step.';
      return `<div class="qa-wrap">${panel(esc(r.number)+' · '+esc(r.title||Store.supName(r.supplier_id)), '', `<div class="panel-b"><p style="margin:0 0 12px">${why}</p><div style="display:flex;gap:8px;flex-wrap:wrap">${open}${next}</div></div>`)}</div>`;
    }
    const st = stagesOf(r), cur = currentStage(r), amt = r.total!=null ? r.total : r.value;
    const who = r.supplier_id ? Store.supName(r.supplier_id) : (r.payee||'');
    const lines = (r.lines||[]).slice(0,6);
    return `<div class="qa-wrap">
      <div>${btn('Back','data-act="back"','sm ghost','back')}</div>
      <section class="panel qa-card">
        <div class="qa-top"><div><p class="crumb">${esc(r.number)} · ${esc({requisition:'Requisition',expense:'Expense claim',po:'Purchase order',contract:'Contract'}[type])}${st.length>1?' · step '+(cur+1)+' of '+st.length+' ('+esc(st[cur].label)+')':''}</p>
          <h1>${esc(r.title||'Purchase order – '+who)}</h1><p class="muted" style="margin:4px 0 0">${esc(Store.user(r.created_by).name)}${r.department?' · '+esc(r.department):''}${who?' · '+esc(who):''}</p></div>
          <div class="qa-amt"><b class="num">${fmtMoney(r.currency, amt)}</b>${slaPill(r)}</div></div>
        ${t==='requisitions'?this.reqWarnings(r):''}
        ${r.description?`<p class="qa-desc">${esc(r.description)}</p>`:''}
        ${lines.length?`<div class="qa-lines">${lines.map(l=>`<div><span>${esc(l.qty)} × ${esc(l.description)}</span><span class="num">${fmtMoney(r.currency,(+l.qty||0)*(+l.unit_price||0))}</span></div>`).join('')}${(r.lines||[]).length>6?`<div class="faint">+ ${(r.lines.length-6)} more lines</div>`:''}</div>`:''}
        ${(r.attachments||[]).length?`<div><b style="font-size:12.5px">Documents</b>${fileList((r.attachments||[]).filter(a=>a.kind!=='payment'), t+':'+r.id)}</div>`:''}
        ${t==='requisitions'&&r.budget_id?(()=>{ const b=Store.byId('budgets',r.budget_id), bu=b&&budgetUse(b); return b?`<p class="faint" style="margin:0;font-size:12.5px">Budget ${esc(b.code)}: ${baseCur()} ${num(bu.available)} available after commitments${bu.available<0?' — <b class="over">over budget</b>':''}</p>`:''; })():''}
        <label class="f" for="qa-comment">Comment <span class="faint" style="font-weight:400">(required to reject)</span><textarea id="qa-comment" placeholder="Reason, conditions or notes"></textarea></label>
        <div class="err" id="qa-err" hidden></div>
        <div class="qa-btns">${btn('Reject','data-act="qa-decide" data-d="rejected"','danger')}${btn('Approve','data-act="qa-decide" data-d="approved"','primary')}</div>
        <div style="display:flex;gap:8px;justify-content:center">${open}</div>
      </section></div>`;
  },
  qaDone(r, d){
    const queue = awaitingMe();
    const body = `<div class="qa-wrap"><section class="panel qa-card qa-done"><div class="qa-tick ${d==='approved'?'ok':'no'}">${d==='approved'?'✓':'✕'}</div><h1>${d==='approved'?'Approved':'Rejected'}</h1><p class="muted" style="margin:0">${esc(r.number)} – ${esc(r.title||'')}</p>
      <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:12px">${queue.length?btn('Next waiting ('+queue.length+')','data-act="qa-next"','primary'):'<span class="faint">Nothing else is waiting for you.</span>'}${btn('My approvals','data-go="approvals"','')}</div></section></div>`;
    $('#page').innerHTML = body;
  },
  /* small approve / reject dialog used from notifications */
  decideModal(t, r, d){
    const amt = r.total!=null ? r.total : r.value;
    formModal({title:(d==='approved'?'Approve ':'Reject ')+esc(r.number), narrow:true, save:d==='approved'?'Approve':'Reject',
      intro:`<p style="margin:0 0 6px"><b>${esc(r.title||'Purchase order – '+Store.supName(r.supplier_id))}</b><br><span class="muted">${esc(Store.user(r.created_by).name)} · ${fmtMoney(r.currency, amt)}</span></p>${t==='requisitions'?this.reqWarnings(r):''}`,
      fields:[{k:'comment',label:d==='approved'?'Comment (optional)':'Reason for rejecting',type:'textarea',req:d!=='approved'}],
      onSave: async v=>{ await Store.decide(t, r, d, v.comment); return d==='approved'?'Approved':'Rejected — requester notified'; }});
  },
  /* modules: switch optional parts of Pera on or off */
  modulesPanel(){
    return panel('Modules', btn('Save modules','data-act="modules-save"','sm primary'), `<div class="panel-b" style="display:flex;flex-direction:column;gap:12px">
      <p class="muted" style="margin:0">Always on: ${esc(CORE_MODULES)}. Switch the rest on as the organisation needs them — switching one off hides it, and nothing already recorded is deleted.</p>
      <div class="mod-grid">${MODULES.map(([k,l,h])=>`<label class="mod-card ${mod(k)?'on':''}"><input type="checkbox" class="m-mod" value="${k}" ${mod(k)?'checked':''}><span><b>${esc(l)}</b><small>${esc(h)}</small></span></label>`).join('')}</div></div>`);
  },
  remindersPanel(){
    const c = remCfg(), staff = Store.all('app_users').filter(x=>x.active && x.role!=='supplier' && x.role!=='requisitioner');
    return `<div class="sub-rule"><label class="chk"><input type="checkbox" id="rm-on" ${c.enabled?'checked':''}> <b>Approval reminders & escalation</b></label>
      <span class="faint" style="font-size:12.5px">Approvers are reminded while a step waits for them. If it is still waiting, it is escalated: the people below and the requester are told, and the audit trail records it.</span>
      <div class="step-top"><label class="chk">Remind approvers every <input type="number" id="rm-h" min="1" value="${c.reminder_hours||24}" style="width:70px"> hours</label>
        <label class="chk">Escalate after <input type="number" id="rm-e" min="1" value="${c.escalate_hours||72}" style="width:70px"> hours at one step</label></div>
      <span class="faint" style="font-size:12.5px">Escalate to (none ticked = all administrators):</span>
      <div class="checks" style="border:0;padding:0">${staff.map(x=>`<label class="chk"><input type="checkbox" class="rm-to" value="${x.id}" ${(c.escalate_to||[]).includes(x.id)?'checked':''}> ${esc(x.name)}</label>`).join('')}</div></div>`;
  },

  /* ---------- first-run setup wizard ---------- */
  setupPage(){
    const W = App._setup = App._setup || this.setupDefaults(), u = me(), step = W.step;
    const steps = ['Your account','Company','Users & modules','Activate'];
    const bar = `<ol class="wiz-steps">${steps.map((s,i)=>`<li class="${i<step?'done':i===step?'now':''}"><span>${i<step?'✓':i+1}</span>${s}</li>`).join('')}</ol>`;
    let body = '';
    if (step===0) body = `<h2>Welcome to Pera${S().company&&S().company!=='Your Company Ltd'?', '+esc(S().company):''}</h2><p class="muted">Set up your organisation in four short steps. You can change everything later in Settings and Manage company.</p>
      <div class="grid-form"><label class="f">Your name<input id="w-name" type="text" value="${esc(W.me.name)}"></label><label class="f">Email<input type="email" value="${esc(u.email)}" disabled></label>
        <label class="f">Job title<input id="w-title" type="text" value="${esc(W.me.title)}" placeholder="e.g. Procurement Manager"></label><label class="f">Phone<input id="w-phone" type="tel" value="${esc(W.me.phone)}"></label></div>`;
    else if (step===1) body = `<h2>Your company</h2><div class="grid-form">
        <label class="f span-2">Company name <span class="req">*</span><input id="w-co" type="text" value="${esc(W.company)}"></label>
        <label class="f">Reporting currency<input id="w-base" type="text" value="${esc(W.base)}" maxlength="3"></label>
        <label class="f">Fiscal year<input id="w-fy" type="number" value="${esc(W.fy)}"></label>
        <label class="f span-all">Head office address <span class="help">Used as the default delivery and distribution address.</span><textarea id="w-addr">${esc(W.address)}</textarea></label>
        <label class="f span-all">Departments <span class="help">One per line. Add a code after a comma if you use them, e.g. Finance, 001</span><textarea id="w-depts">${esc(W.depts)}</textarea></label>
        <label class="f span-all">Branches <span class="help">One per line. Leave just one if you have a single office.</span><textarea id="w-br">${esc(W.branches)}</textarea></label>
        <label class="f span-all">Other currencies <span class="help">One per line as CODE = units per 1 ${esc(W.base)}, e.g. ZWG = 26.5</span><textarea id="w-cur">${esc(W.currencies)}</textarea></label></div>`;
    else if (step===2) body = `<h2>People and modules</h2>
      <p class="muted" style="margin:0">Add the people who will use Pera. They sign in with Microsoft, or choose <b>Create account</b> on the sign-in page using this email.</p>
      <div class="tw"><table class="wiz-users"><thead><tr><th>Name</th><th>Work email</th><th>Role</th><th>Department</th><th></th></tr></thead><tbody>
        ${W.users.map((x,i)=>`<tr><td><input type="text" class="wu-name" value="${esc(x.name)}" aria-label="Name"></td><td><input type="email" class="wu-email" value="${esc(x.email)}" aria-label="Email"></td>
          <td>${selectHTML('class="wu-role" aria-label="Role"', Object.entries(ROLE_LABEL).filter(([k])=>k!=='supplier'), x.role)}</td><td>${selectHTML('class="wu-dept" aria-label="Department"', this.setupDepts().map(d=>[d.name,d.name]), x.department, '—')}</td>
          <td>${ibtn('x','Remove','data-act="wiz-user-del" data-i="'+i+'"')}</td></tr>`).join('')}</tbody></table></div>
      <div>${btn('Add person','data-act="wiz-user-add"','sm','plus')}</div>
      <hr class="sep"><h3 style="margin:0">Who approves requisitions?</h3>
      <p class="faint" style="margin:0;font-size:12.5px">One approval step to start with. Add amount tiers and further steps (e.g. “then the CFO”) later in Settings.</p>
      <div class="checks" style="border:0;padding:0" id="w-appr">${this.setupPeople().filter(p=>['approver','admin','finance'].includes(p.role)).map(p=>`<label class="chk"><input type="checkbox" value="${esc(p.key)}" ${W.approvers.includes(p.key)?'checked':''}> ${esc(p.name)}</label>`).join('')||'<span class="faint">Give at least one person the Approver role above.</span>'}</div>
      <label class="chk">Approvals required <input type="number" id="w-req" min="1" value="${W.required}" style="width:64px"></label>
      <hr class="sep"><h3 style="margin:0">Modules</h3><p class="faint" style="margin:0;font-size:12.5px">Always included: ${esc(CORE_MODULES)}.</p>
      <div class="mod-grid">${MODULES.map(([k,l,h])=>`<label class="mod-card ${W.modules[k]?'on':''}"><input type="checkbox" class="w-mod" value="${k}" ${W.modules[k]?'checked':''}><span><b>${esc(l)}</b><small>${esc(h)}</small></span></label>`).join('')}</div>`;
    else {
      const on = MODULES.filter(([k])=>W.modules[k]).map(m=>m[1]);
      body = `<h2>Ready to activate</h2><dl class="kvl wiz-sum"><dt>Company</dt><dd>${esc(W.company)}</dd><dt>Currency</dt><dd>${esc(W.base)}${W.currencies.trim()?' + '+esc(W.currencies.split('\n').map(l=>l.split('=')[0].trim()).filter(Boolean).join(', ')):''}</dd>
        <dt>Departments</dt><dd>${this.setupDepts().length}</dd><dt>Branches</dt><dd>${W.branches.split('\n').filter(x=>x.trim()).length||1}</dd><dt>People</dt><dd>${W.users.filter(x=>x.email).length+1} including you</dd>
        <dt>Approval</dt><dd>${W.required} of ${W.approvers.length}: ${esc(this.setupPeople().filter(p=>W.approvers.includes(p.key)).map(p=>p.name).join(', '))}</dd><dt>Modules</dt><dd>${esc(on.join(', ')||'Core only')}</dd></dl>
        ${LIVE?'':'<div class="note warn">Demo mode: activating replaces the sample company in this browser with your new, empty company. Use Settings → Reset demo data to bring the sample back.</div>'}
        <div class="err" id="w-err" hidden></div>`;
    }
    return `<div class="wiz">${bar}<section class="panel"><div class="panel-b wiz-body">${body}<div class="err" id="w-err2" hidden></div></div>
      <div class="modal-f">${step>0?btn('Back','data-act="wiz-back"','ghost'):(LIVE?'':btn('Cancel','data-act="wiz-cancel"','ghost'))}<span class="grow"></span>${step<3?btn('Continue','data-act="wiz-next"','primary'):btn('Activate Pera','data-act="wiz-activate"','primary')}</div></section></div>`;
  },
  setupDefaults(){
    const u = me(), s = S();
    return {step:0, me:{name:u.name, title:u.title||'', phone:u.phone||''}, company:s.company&&s.company!=='Your Company Ltd'?s.company:'', base:s.base_currency||'USD', fy:s.fiscal_year||new Date().getFullYear(),
      address:s.delivery_address||'', depts:(s.departments||[]).join('\n'), branches:(s.branches||[]).map(b=>b.name).join('\n')||'Head Office',
      currencies:(s.currencies||[]).filter(c=>c.code!==(s.base_currency||'USD')).map(c=>c.code+' = '+c.rate).join('\n'),
      users:[{name:'',email:'',role:'approver',department:''},{name:'',email:'',role:'requisitioner',department:''}], approvers:['me'], required:1,
      modules:Object.fromEntries(MODULES.map(([k])=>[k, !['plan','inventory','portal'].includes(k)]))};
  },
  setupDepts(){ return (App._setup.depts||'').split('\n').map(l=>l.split(',')).filter(p=>p[0].trim()).map(([n,c])=>({name:n.trim(), code:(c||'').trim()})); },
  setupPeople(){ const W = App._setup; return [{key:'me', name:W.me.name+' (you)', role:me().role}].concat(W.users.map((x,i)=>({key:'u'+i, name:x.name||x.email||'Person '+(i+1), role:x.role})).filter((p,i)=>W.users[i].email)); },
  setupRead(){
    const W = App._setup, v = id => ($('#'+id)||{value:''}).value;
    if (W.step===0) Object.assign(W.me, {name:v('w-name').trim()||W.me.name, title:v('w-title').trim(), phone:v('w-phone').trim()});
    if (W.step===1) Object.assign(W, {company:v('w-co').trim(), base:(v('w-base').trim()||'USD').toUpperCase(), fy:+v('w-fy')||new Date().getFullYear(), address:v('w-addr').trim(), depts:v('w-depts'), branches:v('w-br'), currencies:v('w-cur')});
    if (W.step===2){
      W.users = $$('.wiz-users tbody tr').map(tr=>({name:$('.wu-name',tr).value.trim(), email:$('.wu-email',tr).value.trim().toLowerCase(), role:$('.wu-role',tr).value, department:$('.wu-dept',tr).value}));
      W.approvers = $$('#w-appr input:checked').map(x=>x.value); W.required = Math.max(1, +v('w-req')||1);
      W.modules = Object.fromEntries(MODULES.map(([k])=>[k, $$('.w-mod').some(x=>x.value===k && x.checked)]));
    }
  },
  setupCheck(){
    const W = App._setup;
    if (W.step===1){ if (!W.company) return 'Enter the company name.'; if (!/^[A-Z]{3}$/.test(W.base)) return 'The reporting currency is a 3-letter code such as USD.'; if (!this.setupDepts().length) return 'Add at least one department.'; }
    if (W.step===2){
      const emails = W.users.filter(x=>x.email).map(x=>x.email);
      if (emails.some(e=>!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))) return 'Check the email addresses — one is not valid.';
      if (new Set(emails.concat([me().email.toLowerCase()])).size !== emails.length+1) return 'Each person needs a different email address.';
      if (emails.some(e=>Store.all('app_users').some(u=>u.id!==me().id && (u.email||'').toLowerCase()===e) && LIVE)) return 'One of these people already has a Pera login.';
      if (W.users.some(x=>x.email && !x.name)) return 'Add a name for everyone with an email.';
      const appr = W.approvers.filter(k=>this.setupPeople().some(p=>p.key===k));
      if (!appr.length) return 'Choose at least one approver.';
      if (!appr.some(k=>k!=='me')) return 'Add at least one approver other than yourself — nobody can approve their own requisitions.';
      W.required = Math.min(W.required, appr.length);
    }
    return '';
  },
  async setupActivate(){
    const W = App._setup, u = me(), old = S();
    const cur = W.currencies.split('\n').map(l=>l.split('=')).filter(p=>p[0]&&p[0].trim()).map(([c,r])=>({code:c.trim().toUpperCase(), rate:+(r||'1').trim()||1})).filter(c=>c.code!==W.base);
    const branches = W.branches.split('\n').map(x=>x.trim()).filter(Boolean).map((n,i)=>({id:i===0&&(old.branches||[])[0]?old.branches[0].id:'br-'+uid().slice(0,6), name:n}));
    const depts = this.setupDepts().map(d=>({name:d.name, code:d.code, added:todayStr(), active:true}));
    const people = W.users.filter(x=>x.email).map(x=>Object.assign({id:uid(), active:true, favourites:[], created_at:nowISO(), branch_id:branches[0]?branches[0].id:null}, x, {department:x.department||null}));
    const idOf = k => k==='me' ? u.id : people[+k.slice(1)] && people[+k.slice(1)].id;
    const approvers = W.approvers.map(idOf).filter(Boolean);
    const addr = W.address ? [{id:'addr-hq', name:'Head office', lines:W.address, kind:'both', active:true, def_delivery:true, def_distribution:true}] : [];
    const settings = Object.assign({}, old, {company:W.company, base_currency:W.base, fiscal_year:W.fy, currencies:[{code:W.base, rate:1}].concat(cur), departments:depts.map(d=>d.name), dept_list:depts, branches,
      delivery_address:W.address, addresses:addr, modules:W.modules,
      approval_tiers:[{label:'All amounts', max:null, step_label:'Approval', approver_ids:approvers, required:Math.min(W.required, approvers.length)}],
      po_approval:{enabled:false, approver_ids:[], required:1}, contract_approval:{enabled:true, approver_ids:approvers, required:1},
      default_purchaser_id:(people.find(p=>p.role==='procurement')||{}).id||(u.role==='admin'?u.id:null), brand:Object.assign({}, old.brand||{}, {client:W.company}), setup_done:true, setup_at:nowISO(), _acct:1, _p2:1});
    if (!LIVE){
      TABLES.forEach(t=>Store.data[t]=[]);
      Store.data.app_users = [Object.assign({}, u, {name:W.me.name, title:W.me.title, phone:W.me.phone, department:depts[0]?depts[0].name:null, branch_id:branches[0]?branches[0].id:null, last_login_at:nowISO()})].concat(people);
      Store.me = Store.data.app_users[0]; Store.settings = settings; Store.persist();
    } else {
      await Store.update('app_users', u.id, {name:W.me.name, title:W.me.title, phone:W.me.phone, branch_id:branches[0]?branches[0].id:u.branch_id});
      for (const p of people) await Store.insert('app_users', p);
      await Store.saveSettings(settings);
    }
    await Store.log('settings',{id:'setup',number:'Setup'},'Pera activated', W.company+' · '+people.length+' people invited · modules: '+(MODULES.filter(([k])=>W.modules[k]).map(m=>m[1]).join(', ')||'core only'));
    App._setup = null; App.back = []; App.go('dashboard'); App.toast('Pera is ready for '+W.company);
  }
});

Object.assign(ACT, {
  'qa-decide': async (t)=>{ const [tb, id] = App.param.split(':'), r = Store.byId(tb, id), c = $('#qa-comment').value.trim(), d = t.dataset.d;
    if (d==='rejected' && !c){ const e=$('#qa-err'); e.hidden=false; e.textContent='Give a reason so the requester knows what to fix.'; return; }
    $$('.qa-btns .btn').forEach(b=>b.disabled=true);
    try{ await Store.decide(tb, r, d, c); App.qaDone(Store.byId(tb,id), d); }
    catch(e){ const el=$('#qa-err'); el.hidden=false; el.textContent='Could not record the decision: '+(e.message||e); $$('.qa-btns .btn').forEach(b=>b.disabled=false); } },
  'qa-open':(t)=>App.go('quick', t.dataset.id),
  'qa-next':()=>{ const x = awaitingMe()[0]; if (!x) return App.go('approvals'); App.go('quick', x.t+':'+x.r.id); },
  'note-approve':(t)=>{ const n = Store.byId('notifications', t.dataset.id), tb = TYPE_TABLE[n.entity_type], r = Store.byId(tb, n.entity_id); App.menu=null; App.decideModal(tb, r, t.dataset.d); },
  'note-review':(t)=>{ const n = Store.byId('notifications', t.dataset.id); App.menu=null; App.go('quick', TYPE_TABLE[n.entity_type]+':'+n.entity_id); },
  'ap-all':(t)=>$$('.ap-sel').forEach(x=>x.checked=t.checked),
  'ap-bulk':()=>{
    const picked = $$('.ap-sel:checked').map(x=>x.value.split(':')).map(([tb,id])=>({tb, r:Store.byId(tb,id)})).filter(x=>x.r && can.decide(me(), x.r));
    if (!picked.length) return App.toast('Tick the records to approve first');
    const flag = x => x.tb==='requisitions' && (findDuplicates(x.r).length || (bankCheck(x.r.description, x.r.supplier_id, x.r.payee)||{}).tone==='red' || (bankCheck(x.r.description, x.r.supplier_id, x.r.payee)||{}).tone==='amber');
    const totals = {}; picked.forEach(x=>{ totals[x.r.currency]=(totals[x.r.currency]||0)+(+(x.r.total!=null?x.r.total:x.r.value)||0); });
    App._bulk = picked;
    M.open(`${M.head('Approve '+picked.length+' record'+(picked.length===1?'':'s'))}<div class="modal-b">
      <ul class="bulk-list">${picked.map((x,i)=>`<li><label class="chk"><input type="checkbox" class="bulk-inc" value="${i}" ${flag(x)?'':'checked'}> <span class="mono">${esc(x.r.number)}</span> ${esc(x.r.title||Store.supName(x.r.supplier_id))} · <b class="num">${fmtMoney(x.r.currency, x.r.total!=null?x.r.total:x.r.value)}</b>${flag(x)?' '+pill('Check first','t-amber'):''}</label></li>`).join('')}</ul>
      <p class="muted" style="margin:8px 0 0">Total: ${Object.entries(totals).map(([c,v])=>fmtMoney(c,v)).join(' · ')}. Records flagged “Check first” (possible duplicate or unverified bank details) are left out unless you tick them.</p>
      <label class="f" for="bulk-c" style="margin-top:10px">Comment for all (optional)<textarea id="bulk-c"></textarea></label><div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn primary" data-act="ap-bulk-ok">Approve ticked</button></div>`);
  },
  'ap-bulk-ok': async (t)=>{
    const items = $$('.bulk-inc:checked').map(x=>App._bulk[+x.value]), c = $('#bulk-c').value.trim();
    if (!items.length) return M.err('Tick at least one record.');
    t.disabled = true; let ok = 0; const failed = [];
    for (const x of items){ try{ await Store.decide(x.tb, Store.byId(x.tb, x.r.id), 'approved', c); ok++; }catch(e){ failed.push(x.r.number+': '+(e.message||e)); } }
    M.close(); App.render(); App.toast(ok+' approved'+(failed.length?' · '+failed.length+' could not be: '+failed.join('; '):''));
  },
  'modules-save': async ()=>{ const m = Object.fromEntries(MODULES.map(([k])=>[k, $$('.m-mod').some(x=>x.value===k && x.checked)]));
    await Store.saveSettings({modules:m}); await Store.log('settings',{id:'modules',number:'Modules'},'Modules changed', MODULES.map(([k,l])=>l+(m[k]?' on':' off')).join(', ')); App.render(); App.toast('Modules saved'); },
  'wiz-start':()=>{ App.menu=null; App._setup=null; App.go('setup'); },
  'wiz-cancel':()=>{ App._setup=null; App.go('dashboard'); },
  'wiz-back':()=>{ App.setupRead(); App._setup.step--; App.render(); window.scrollTo(0,0); },
  'wiz-next':()=>{ App.setupRead(); const bad = App.setupCheck(); if (bad){ const e=$('#w-err2'); e.hidden=false; e.textContent=bad; return; } App._setup.step++; App.render(); window.scrollTo(0,0); },
  'wiz-user-add':()=>{ App.setupRead(); App._setup.users.push({name:'',email:'',role:'requisitioner',department:''}); App.render(); },
  'wiz-user-del':(t)=>{ App.setupRead(); App._setup.users.splice(+t.dataset.i,1); App.render(); },
  'wiz-activate': async (t)=>{ t.disabled = true; try{ await App.setupActivate(); }catch(e){ console.error(e); const el=$('#w-err'); el.hidden=false; el.textContent='Could not activate: '+(e.message||e); t.disabled=false; } }
});

/* keep switched-off modules out of reach, even from old links */
document.addEventListener('click', e=>{
  const t = e.target.closest('[data-act]'); if (!t) return;
  const k = MOD_ACTS[t.dataset.act];
  if (k && !mod(k)){ e.stopImmediatePropagation(); e.preventDefault(); App.toast('That module is switched off — an administrator can switch it on under Settings → Modules'); }
}, true);
document.addEventListener('change', e=>{ if (e.target.classList && (e.target.classList.contains('m-mod') || e.target.classList.contains('w-mod'))) e.target.closest('.mod-card').classList.toggle('on', e.target.checked); });
window.addEventListener('hashchange', ()=>{ if (Store.me && applyDeepLink()) App.render(); });
document.addEventListener('change', e=>{ const c = e.target.classList; if (App.view==='setup' && c && (c.contains('wu-name')||c.contains('wu-email')||c.contains('wu-role'))){ App.setupRead(); App.render(); } });
