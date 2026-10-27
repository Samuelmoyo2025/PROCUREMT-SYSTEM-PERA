/* =====================================================================
   ACCOUNT — notifications centre, my profile, company users & departments
   ===================================================================== */
const RECOVERY = /type=recovery/.test(location.hash);          // arrived from a password-reset email
try{ const t = localStorage.getItem('pera-theme'); if (t==='light'||t==='dark') document.documentElement.dataset.theme = t; }catch(e){}
const THEMES = [['system','Match my computer'],['light','Light'],['dark','Dark']];
const NOTE_CATS = [
  ['approvals','Approvals waiting for me','Requisitions, expenses, purchase orders and contracts that need your decision or review'],
  ['mine','Updates on what I raised','Approved, rejected, returned, withdrawn or completed'],
  ['messages','Messages and @mentions','Comments on records you are part of'],
  ['purchasing','Purchasing','Orders, deliveries, quotes, suppliers, requests and stock alerts'],
  ['payments','Invoices and payments','Invoice matching and payments']];
const NOTE_CAT_LABEL = Object.assign({security:'Security'}, Object.fromEntries(NOTE_CATS.map(([k,l])=>[k,l])));
const DORMANT_DAYS = 90;
function noteCat(n){
  const m = n.message||'';
  if (/Bank details|delegated their approvals|supplier portal/i.test(m)) return 'security';
  if (/needs your (approval|review)|^Reminder:|^Escalated:/i.test(m)) return 'approvals';
  if (/mentioned you|commented on/i.test(m)) return 'messages';
  if (n.entity_type==='invoice' || /has been paid|ready for payment|ready to pay/i.test(m)) return 'payments';
  if (['po','receipt','rfq','request','item','supplier'].includes(n.entity_type)) return 'purchasing';
  return 'mine';
}
const myNotes = () => Store.all('notifications').filter(n=>n.user_id===me().id && !n.dismissed).sort((a,b)=>b.at.localeCompare(a.at));
const unreadCount = () => myNotes().filter(n=>!n.read).length;
const prefsOf = u => { const p = Object.assign({theme:'system', email:{}, browser:false, doc_reminder:0, dash_view:''}, (u&&u.prefs)||{}); p.email = Object.assign({}, p.email); return p; };
const deptsOf = u => [...new Set([u.department].concat(u.departments||[]).filter(Boolean))];
const avatarHTML = (u, cls) => u && u.avatar ? `<img class="avatar ${cls||''}" src="${esc(u.avatar)}" alt="">` : `<span class="avatar ${cls||''}">${esc(initials(u&&u.name))}</span>`;
const isPendingUser = x => x.active && !x.last_login_at;
const isDormant = x => x.active && x.last_login_at && daysBetween(x.last_login_at.slice(0,10), todayStr()) >= DORMANT_DAYS;

/* departments: Settings keeps `departments` (active names, used by every form) in step with `dept_list` (name, code, added, active) */
const deptList = () => S().dept_list || (S().departments||[]).map(n=>({name:n, code:'', added:null, active:true}));
async function saveDepts(list){ await Store.saveSettings({dept_list:list, departments:list.filter(d=>d.active).map(d=>d.name)}); }
function deptUse(name){
  const is = r => r.department===name;
  return {users:Store.all('app_users').filter(u=>deptsOf(u).includes(name)).length,
    records:Store.all('requisitions').filter(is).length + Store.all('budgets').filter(is).length + Store.all('plan_lines').filter(is).length + Store.all('requests').filter(is).length};
}

function applyTheme(){
  const t = Store.me ? prefsOf(Store.me).theme : 'system';
  if (t==='light'||t==='dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  try{ localStorage.setItem('pera-theme', t); }catch(e){}
}
/* desktop pop-ups for notifications that arrive while Pera is open */
function notifyBrowser(){
  const fresh = myNotes().filter(n=>!n.read).map(n=>n.id);
  const seen = App._seenNotes; App._seenNotes = new Set(fresh);
  if (!seen || !prefsOf(me()).browser || !('Notification' in window) || Notification.permission!=='granted') return;
  myNotes().filter(n=>!n.read && !seen.has(n.id)).slice(0,3).forEach(n=>{
    try{ const pop = new Notification('Pera', {body:n.message, tag:n.id}); pop.onclick = ()=>{ window.focus(); App.open(n.entity_type+':'+n.entity_id); pop.close(); }; }catch(e){}
  });
}
function resizeImage(file, size){
  return new Promise((res,rej)=>{
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = ()=>{ const c=document.createElement('canvas'); c.width=c.height=size; const s=Math.min(img.width,img.height);
      c.getContext('2d').drawImage(img,(img.width-s)/2,(img.height-s)/2,s,s,0,0,size,size); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg',0.85)); };
    img.onerror = ()=>{ URL.revokeObjectURL(url); rej(new Error('That file is not an image Pera can read')); };
    img.src = url;
  });
}
function pwProblem(pw, email){
  if (pw.length < 10) return 'Use at least 10 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'Use at least one letter and one number.';
  const local = String(email||'').split('@')[0].toLowerCase();
  if (local.length>3 && pw.toLowerCase().includes(local)) return 'Don’t include your email name in the password.';
  return '';
}
const pwStrength = pw => { let s=0; if (pw.length>=10) s++; if (pw.length>=14) s++; if (/[a-z]/.test(pw)&&/[A-Z]/.test(pw)) s++; if (/\d/.test(pw)) s++; if (/[^A-Za-z0-9]/.test(pw)) s++; return Math.min(4,s); };
async function noteBulk(ids, patch){
  ids.forEach(id=>Object.assign(Store.byId('notifications',id)||{}, patch));
  if (LIVE){ for (let i=0;i<ids.length;i+=200){ const {error}=await Store.sb.from('notifications').update(patch).in('id',ids.slice(i,i+200)); if (error) throw error; } }
  else Store.persist();
}

/* sample data for the demo company: department codes, phones, sign-in history, one pending invitation */
function demoAccountData(){
  if (LIVE || S()._acct) return;
  const codes = {Finance:'001','Human Resources':'002',Operations:'003',IT:'007',Marketing:'005',Sales:'006',Procurement:'004',Executive:''};
  S().dept_list = (S().departments||[]).map((n,i)=>({name:n, code:codes[n]!=null?codes[n]:String(i+1).padStart(3,'0'), added:addDays(todayStr(),-400+i*30), active:true}));
  S().dept_list.push({name:'Legal and Compliance', code:'009', added:addDays(todayStr(),-200), active:false});
  const users = Store.all('app_users');
  users.forEach((u,i)=>{ if (!u.last_login_at) u.last_login_at = new Date(Date.now()-(i%5)*36e5*7).toISOString(); if (!u.created_at) u.created_at = addDays(todayStr(),-420)+'T08:00:00Z'; });
  const cfo = users.find(u=>u.id==='u-cfo'); if (cfo){ cfo.departments = ['Finance','Human Resources']; cfo.phone = '+263 77 300 0724'; }
  const ceo = users.find(u=>u.id==='u-ceo'); if (ceo) ceo.departments = (S().departments||[]).filter(d=>d!=='Executive');
  const old = users.find(u=>u.role==='requisitioner' && u.id!=='u-adm'); if (old) old.last_login_at = new Date(Date.now()-120*864e5).toISOString();
  if (!users.some(u=>u.id==='u-new')) users.push({id:'u-new', name:'Tendai Moyo', email:'tendai.moyo@northgate.example', role:'requisitioner', department:'Marketing', title:'Marketing Officer', branch_id:(S().branches||[])[0]?S().branches[0].id:'', favourites:[], active:true, created_at:addDays(todayStr(),-2)+'T09:00:00Z'});
  S()._acct = 1; Store.persist();
}
const _storeSeed = Store.seed;
Store.seed = async function(){ const r = await _storeSeed.apply(this, arguments); demoAccountData(); return r; };
const _storeInit = Store.init;
Store.init = async function(){
  const ok = await _storeInit.apply(this, arguments);
  if (!ok || !this.me) return ok;
  demoAccountData();
  const u = this.me;
  if (!u.last_login_at || Date.now()-new Date(u.last_login_at).getTime() > 36e5){ try{ await this.update('app_users', u.id, {last_login_at:nowISO()}); }catch(e){ console.warn('Could not record sign-in time', e); } }
  try{ await docReminders(); }catch(e){ console.warn(e); }
  return ok;
};
/* personal reminder before a supplier's compliance document expires (Profile → Email & alerts) */
async function docReminders(){
  const u = me(), days = +prefsOf(u).doc_reminder || 0;
  if (!days || !can.procure(u)) return;
  const until = addDays(todayStr(), days), have = new Set(Store.all('notifications').filter(n=>n.user_id===u.id).map(n=>n.message));
  for (const s of Store.all('suppliers').filter(s=>s.status!=='blacklisted')) for (const d of (s.documents||[])){
    if (!d.expiry || d.expiry > until) continue;
    const msg = s.name+': '+d.type+(d.expiry<todayStr()?' expired on ':' expires on ')+fmtDate(d.expiry);
    if (!have.has(msg)) await Store.notify([u.id], 'supplier', s, msg);
  }
}

Object.assign(App, {
  /* ---------------- notifications centre ---------------- */
  notesBody(compact){
    const f = App.f.nt = App.f.nt || {}, all = myNotes(), show = this.curTab('nt','all');
    const q = (f.q||'').trim().toLowerCase();
    let rows = all.filter(n=>show==='unread'?!n.read:show==='read'?n.read:true);
    if (f.cat) rows = rows.filter(n=>noteCat(n)===f.cat);
    if (q) rows = rows.filter(n=>n.message.toLowerCase().includes(q));
    const limit = App._ntLimit || 50, shown = rows.slice(0, limit);
    const unread = all.filter(n=>!n.read), byCat = {};
    unread.forEach(n=>{ const c=noteCat(n); byCat[c]=(byCat[c]||0)+1; });
    const dayLabel = d => { const k=d.slice(0,10), t=todayStr(); return k===t?'Today':k===addDays(t,-1)?'Yesterday':fmtDate(k); };
    const local = n => { const d=new Date(n.at); return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'); };
    let last = '', list = '';
    shown.forEach(n=>{ const d = local(n); if (d!==last){ list += `<div class="ngroup">${dayLabel(d)}</div>`; last = d; }
      list += `<div class="nrow ${n.read?'':'unread'}"><button class="nmsg" data-note="${n.id}">${n.read?'':pill('New','t-amber')}<span class="ntxt">${esc(n.message)}</span><span class="nmeta">${esc(NOTE_CAT_LABEL[noteCat(n)])} · ${new Date(n.at).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'})}</span></button>
        <div class="nact">${(()=>{ const tb = TYPE_TABLE[n.entity_type], r = tb && Store.byId(tb, n.entity_id); return r && can.decide(me(), r) ? `<span class="nquick">${btn('Review','data-act="note-review" data-id="'+n.id+'"','sm ghost')}${btn('Reject','data-act="note-approve" data-d="rejected" data-id="'+n.id+'"','sm')}${btn('Approve','data-act="note-approve" data-d="approved" data-id="'+n.id+'"','sm primary')}</span>` : ''; })()}${ibtn(n.read?'eye':'check', n.read?'Mark as unread':'Mark as read', `data-act="note-read" data-id="${n.id}"`)}${ibtn('x','Remove','data-act="note-dismiss" data-id="'+n.id+'"')}</div></div>`; });
    const summary = Object.keys(byCat).length ? `<div class="nsum">${['approvals','security','messages','mine','purchasing','payments'].filter(c=>byCat[c]).map(c=>`<button class="chip ${f.cat===c?'on':''}" data-act="note-cat" data-c="${c}">${esc(NOTE_CAT_LABEL[c])} <b>${byCat[c]}</b></button>`).join('')}${f.cat?`<button class="chip" data-act="note-cat" data-c="">Show all</button>`:''}${byCat.approvals?btn('Open my approvals','data-go="approvals"','sm primary'):''}</div>` : '';
    return `${summary}
      <div class="ntools">${this.tabs('nt',[['all','All'],['unread','Unread'],['read','Viewed']],k=>k==='all'?all.length:k==='unread'?unread.length:all.length-unread.length)}
        <div class="filters">${searchBox('nt.q', f.q, 'Search notifications')}${selectHTML('data-filter="nt.cat" aria-label="Type"', NOTE_CATS.map(([k,l])=>[k,l]).concat([['security','Security']]), f.cat, 'All types')}</div></div>
      <div class="nlist ${compact?'compact':''}">${list || `<div class="empty">${all.length?'No notifications match.':'You’re all caught up — no notifications.'}</div>`}</div>
      ${rows.length>limit?`<div style="text-align:center;padding:10px">${btn('Show '+Math.min(50,rows.length-limit)+' more','data-act="note-more"','sm')}</div>`:''}
      <div class="nfoot">${unread.length?btn('Mark all as read','data-act="read-all"','sm'):''}${all.some(n=>n.read)?btn('Remove viewed notifications','data-act="note-clear-read"','sm ghost','trash'):''}${all.length?btn('Remove all notifications','data-act="note-clear-all"','sm ghost','trash'):''}</div>`;
  },
  notificationsPage(){
    return `${pageHead('Notifications','Everything Pera has told you, grouped by day. Removing a notification only hides it from your list — the record and its audit trail are untouched.', btn('Email & alert settings','data-go="profile" data-tab="prof:alerts"','sm ghost'))}
      ${panel('Your notifications','',`<div class="panel-b">${this.notesBody(false)}</div>`)}`;
  },

  /* ---------------- my profile ---------------- */
  profilePage(){
    const u = me(), p = prefsOf(u), tab = this.curTab('prof', RECOVERY&&!App._recovered?'security':'profile');
    const side = `<section class="panel prof-card"><div class="prof-id">${avatarHTML(u,'xl')}<div><b>${esc(u.name)}</b><span>${esc(S().company||'')}${u.role==='supplier'?' · '+esc(Store.supName(u.supplier_id)):''}</span><span>${esc(ROLE_LABEL[u.role]||u.role)}</span></div></div>
      <dl class="kvl"><dt>Job title</dt><dd>${esc(u.title||'—')}</dd><dt>Phone</dt><dd>${esc(u.phone||'—')}</dd><dt>Email</dt><dd>${esc(u.email)}</dd>
        ${u.role!=='supplier'?`<dt>Departments</dt><dd>${esc(deptsOf(u).join(', ')||'—')}</dd><dt>Branch</dt><dd>${esc(branchName(u.branch_id))}</dd>`:''}
        <dt>Registered</dt><dd>${fmtDate(u.created_at)}</dd><dt>Last sign-in</dt><dd>${u.last_login_at?fmtDT(u.last_login_at):'—'}</dd></dl>
      <nav class="prof-nav">${[['profile','Profile','edit'],['alerts','Email & alerts','bell'],['security','Password & security','audit']].map(([k,l,i])=>`<button class="${tab===k?'on':''}" data-tab="prof:${k}">${I[i]}${l}</button>`).join('')}
        <button data-go="messages">${I.chat}Messages</button>${u.role!=='supplier'?`<button data-act="delegate">${I.check}Out of office</button>`:''}${LIVE?`<button data-act="logout">${I.back}Sign out</button>`:''}</nav></section>`;
    let body;
    if (tab==='alerts'){
      const perm = 'Notification' in window ? Notification.permission : 'unsupported';
      body = panel('Email & alerts','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
        <p class="muted" style="margin:0">Every notification always appears in Pera. Choose which ones are also emailed to <b>${esc(u.email)}</b>.</p>
        <div class="pref-list">${NOTE_CATS.map(([k,l,h])=>`<label class="chk"><input type="checkbox" class="p-mail" value="${k}" ${p.email[k]!==false?'checked':''}> <span><b>${esc(l)}</b><br><small class="faint">${esc(h)}</small></span></label>`).join('')}
          <label class="chk"><input type="checkbox" checked disabled> <span><b>Security alerts</b><br><small class="faint">Supplier bank-detail changes, delegation and portal access — always emailed</small></span></label></div>
        <hr class="sep">
        <label class="chk"><input type="checkbox" id="p-browser" ${p.browser?'checked':''} ${perm==='denied'||perm==='unsupported'?'disabled':''}> <span><b>Desktop pop-ups</b> while Pera is open in a browser tab<br><small class="faint">${perm==='denied'?'Blocked in this browser — allow notifications for this site in the browser settings first.':perm==='unsupported'?'This browser does not support desktop notifications.':'Your browser will ask for permission the first time.'}</small></span></label>
        ${can.procure(u)?`<label class="f" style="max-width:420px">Remind me before a supplier document expires${selectHTML('id="p-docrem"',[['0','No reminder'],['7','7 days before'],['14','14 days before'],['30','30 days before'],['60','60 days before']],String(p.doc_reminder||0))}<span class="help">Tax clearance, registration, insurance and other compliance documents.</span></label>`:''}
        <div>${btn('Save alert settings','data-act="prof-alerts-save"','primary')}</div></div>`);
    } else if (tab==='security'){
      const pwOk = CONFIG.PASSWORD_LOGIN!==false;
      body = `${RECOVERY&&!App._recovered?'<div class="banner blue"><span class="grow"><b>Set a new password</b> to finish resetting your password.</span></div>':''}
        ${panel('Change password','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:12px;max-width:520px">
          ${pwOk?`<label class="f" for="p-pw1">New password<span class="pw-wrap"><input id="p-pw1" type="password" autocomplete="new-password"><button type="button" class="btn sm ghost" data-act="pw-show" data-for="p-pw1">Show</button></span></label>
          <div class="pw-meter" aria-hidden="true"><i id="pw-bar"></i></div>
          <label class="f" for="p-pw2">Confirm new password<span class="pw-wrap"><input id="p-pw2" type="password" autocomplete="new-password"><button type="button" class="btn sm ghost" data-act="pw-show" data-for="p-pw2">Show</button></span></label>
          <p class="faint" style="margin:0;font-size:12.5px">At least 10 characters with a letter and a number. Any symbols are allowed — a long phrase is stronger than a short complicated word.</p>
          <div class="err" id="pw-err" hidden></div><div>${btn('Change password','data-act="pw-save"','primary')}</div>`
          :'<p class="muted" style="margin:0">Your organisation signs in with Microsoft, so your password is managed in your Microsoft account.</p>'}</div>`)}
        ${panel('Sessions','',`<div class="panel-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="muted grow" style="flex:1;min-width:220px">Last sign-in: <b>${u.last_login_at?fmtDT(u.last_login_at):'—'}</b>. If you signed in on a shared or lost device, sign out everywhere.</span>${LIVE?btn('Sign out on all devices','data-act="logout-all"','danger'):'<span class="faint">Available when Pera is live.</span>'}</div>`)}`;
    } else {
      const all = can.seeAll(u);
      body = panel('Edit profile','',`<div class="panel-b grid-form">
        <div class="f span-all"><span>Profile picture <span class="help">JPG or PNG. It is cropped to a square.</span></span>
          <div class="brand-prev">${u.avatar?`<img class="avatar lg" id="p-av-prev" src="${esc(u.avatar)}" alt="">`:`<span class="avatar lg" id="p-av-prev">${esc(initials(u.name))}</span>`}
            <input type="file" id="p-av-file" accept="image/png,image/jpeg,image/webp" aria-label="Choose picture">
            ${btn('Remove picture','type="button" data-act="prof-av-clear"','sm ghost')}</div><input type="hidden" id="p-av" value="${esc(u.avatar||'')}"></div>
        <label class="f">Name<input id="p-name" type="text" value="${esc(u.name)}" ${can.admin(u)?'':'disabled'}>${can.admin(u)?'':'<span class="help">Ask an administrator to change your name or email.</span>'}</label>
        <label class="f">Email<input type="email" value="${esc(u.email)}" disabled></label>
        <label class="f">Job title<input id="p-title" type="text" value="${esc(u.title||'')}"></label>
        <label class="f">Phone number<input id="p-phone" type="tel" value="${esc(u.phone||'')}" placeholder="+263 …"></label>
        <label class="f">Colour theme${selectHTML('id="p-theme"', THEMES, p.theme)}</label>
        ${u.role!=='supplier'?`<label class="f">Dashboard opens on${selectHTML('id="p-dash"',[['','Default for my role'],['mine','My view']].concat(all?[['purchasing','Purchasing view'],['finance','Finance view'],['approver','Approver view']]:[]), p.dash_view)}</label>`:''}
        <div class="span-all">${btn('Save profile','data-act="prof-save"','primary')}</div></div>`);
    }
    return `${pageHead('My profile','Your details, how Pera contacts you, and your sign-in.')}<div class="prof-grid">${side}<div class="stack">${body}</div></div>`;
  },

  /* ---------------- company: users & departments ---------------- */
  companyPage(){
    const tab = this.curTab('co','users'), all = Store.all('app_users');
    const head = `<section class="panel co-card"><div><h2>${esc(S().company||'Company')}</h2><p class="faint" style="margin:2px 0 0">${esc(S().delivery_address||'')}</p></div>
      <dl class="kvl inline"><dt>Users</dt><dd>${all.filter(x=>x.active).length} active</dd><dt>Departments</dt><dd>${deptList().filter(d=>d.active).length}</dd><dt>Branches</dt><dd>${(S().branches||[]).length||1}</dd></dl></section>`;
    return `${pageHead('Manage company','People, departments, addresses and the accounts the company pays from.', btn('Company settings','data-go="settings"','sm ghost','cog'))}${head}
      ${this.tabs('co',[['users','Users'],['depts','Departments'],['addresses','Addresses'],['accounts','Paying accounts']])}
      ${tab==='depts'?this.companyDepts():tab==='addresses'?this.companyAddresses():tab==='accounts'?this.companyAccounts():this.companyUsers()}`;
  },
  companyUsers(){
    const all = Store.all('app_users');
    const groups = {active:all.filter(x=>x.active && x.last_login_at), pending:all.filter(isPendingUser), inactive:all.filter(x=>!x.active)};
    const t = this.curTab('cou','active');
    const fo = {ph:'Search name, email, title, department…', dates:false, more:[{k:'role',label:'Role',options:Object.entries(ROLE_LABEL),get:x=>x.role},{k:'dept',label:'Department',options:deptOpts(),get:x=>deptsOf(x).includes(App.f.cou.dept)?App.f.cou.dept:''},...((S().branches||[]).length>1?[{k:'branch',label:'Branch',options:branchOpts(),get:x=>x.branch_id}]:[])]};
    const rows = applyFilters(groups[t]||[], 'cou', Object.assign({}, fo, {text:x=>[x.name,x.email,x.title,x.phone,deptsOf(x).join(' '),ROLE_LABEL[x.role]].join(' ')})).sort((a,b)=>a.name.localeCompare(b.name));
    const dormant = groups.active.filter(isDormant);
    App._export = ['users', rows];
    return `${dormant.length&&t==='active'?`<div class="banner amber"><span class="grow"><b>${dormant.length} account${dormant.length===1?' has':'s have'} not signed in for ${DORMANT_DAYS}+ days.</b> Review them and deactivate anyone who has left — dormant logins are a common way in for fraud.</span></div>`:''}
      ${panel('Users', `<div style="display:flex;gap:8px">${btn('Export to CSV','data-act="export"','sm ghost','down')}${btn('Add user','data-act="user-new"','sm primary','plus')}</div>`,
      `${this.tabs('cou',[['active','Active'],['pending','Pending'],['inactive','Inactive']],k=>groups[k].length)}
      <div class="panel-b" style="padding-bottom:0">${filterBar('cou', fo)}</div>
      ${t==='pending'?'<p class="faint" style="margin:0;padding:0 18px 8px;font-size:12.5px">Added to Pera but has not signed in yet.</p>':''}
      ${tableHTML([
        {h:'Name',cls:'name',fixed:1,v:x=>`<div class="who-cell">${avatarHTML(x)}<div>${esc(x.name)}<small>${esc(x.title||'')}</small></div></div>`},
        {h:'Email',v:x=>esc(x.email)},
        {h:'Role',v:x=>esc(ROLE_LABEL[x.role]||x.role)+(x.supplier_id?`<br><small class="faint">${esc(Store.supName(x.supplier_id))}</small>`:'')},
        {h:'Departments',v:x=>{ const d=deptsOf(x); return d.length?`<b>${esc(d[0])}</b>${d.length>1?`<br><small class="faint" title="${esc(d.slice(1).join(', '))}">also ${esc(d.slice(1,4).join(', '))}${d.length>4?' +'+(d.length-4):''}</small>`:''}`:'<span class="faint">—</span>'; }},
        {h:'Branch',v:x=>esc(x.role==='supplier'?'—':branchName(x.branch_id))},
        {h:'Phone',v:x=>esc(x.phone||'')},
        {h:'Last sign-in',cls:'nw',v:x=>!x.last_login_at?'<span class="faint">Never</span>':isDormant(x)?pill('Dormant · '+fmtDate(x.last_login_at),'t-amber'):fmtDT(x.last_login_at)},
        {h:'Actions',r:1,fixed:1,v:x=>ibtn('edit','Edit',`data-act="user-edit" data-id="${x.id}"`)+(x.id===me().id?'':x.active?ibtn('power','Deactivate',`data-act="user-deact" data-id="${x.id}"`):ibtn('power','Reactivate',`data-act="user-react" data-id="${x.id}"`,'on'))}
      ], rows, {key:'cou', empty:t==='pending'?'Everyone you added has signed in.':'No users here.'})}
      ${LIVE?'<div class="tfoot">Each person also needs a login in Supabase → Authentication with the same email address (or Microsoft sign-in with automatic joining).</div>':''}`)}`;
  },
  companyDepts(){
    const list = deptList(), t = this.curTab('cod','active');
    const q = ((App.f.cod||{}).q||'').trim().toLowerCase();
    const rows = list.filter(d=>t==='active'?d.active:!d.active).filter(d=>!q || (d.name+' '+(d.code||'')).toLowerCase().includes(q)).sort((a,b)=>a.name.localeCompare(b.name));
    App._export = ['departments', rows];
    return panel('Departments', `<div style="display:flex;gap:8px">${btn('Export to CSV','data-act="export"','sm ghost','down')}${btn('Add department','data-act="dept-new"','sm primary','plus')}</div>`,
      `${this.tabs('cod',[['active','Active'],['inactive','Inactive']],k=>list.filter(d=>k==='active'?d.active:!d.active).length)}
      <div class="panel-b" style="padding-bottom:0"><div class="filters">${searchBox('cod.q', (App.f.cod||{}).q, 'Search name or code')}</div></div>
      ${tableHTML([
        {h:'Department',cls:'name',fixed:1,v:d=>esc(d.name)},
        {h:'Code',cls:'mono',v:d=>d.code?esc(d.code):'<span class="faint">—</span>'},
        {h:'People',r:1,v:d=>deptUse(d.name).users},
        {h:'Records',r:1,v:d=>deptUse(d.name).records},
        {h:'Added on',cls:'nw',v:d=>d.added?fmtDate(d.added):'<span class="faint">—</span>'},
        {h:'Actions',r:1,fixed:1,v:d=>ibtn('edit','Edit',`data-act="dept-edit" data-n="${esc(d.name)}"`)+(d.active?ibtn('power','Deactivate',`data-act="dept-toggle" data-n="${esc(d.name)}"`):ibtn('power','Reactivate',`data-act="dept-toggle" data-n="${esc(d.name)}"`,'on')+(deptUse(d.name).users+deptUse(d.name).records?'':ibtn('trash','Delete',`data-act="dept-del" data-n="${esc(d.name)}"`)))}
      ], rows, {key:'cod', empty:t==='active'?'No departments yet.':'No inactive departments.'})}`);
  },
  deptForm(d){
    formModal({title:d?'Edit '+esc(d.name):'Add department', values:d||{}, save:'Save',
      intro:d&&deptUse(d.name).records?`<p class="faint" style="margin:0 0 8px;font-size:12.5px">${esc(d.name)} is used on ${deptUse(d.name).records} records, so its name is fixed for the audit trail. You can change its code.</p>`:'',
      fields:[{k:'name',label:'Department name',req:1,span:2},{k:'code',label:'Code',ph:'e.g. 001'}],
      onSave: async v=>{
        const list = deptList().map(x=>Object.assign({},x)), low = s=>String(s||'').trim().toLowerCase();
        if (list.some(x=>low(x.name)===low(v.name) && (!d || x.name!==d.name))) throw new Error('There is already a department called '+v.name+'.');
        if (v.code && list.some(x=>low(x.code)===low(v.code) && (!d || x.name!==d.name))) throw new Error('Code '+v.code+' is already used by another department.');
        if (d){
          const i = list.findIndex(x=>x.name===d.name);
          if (v.name!==d.name && deptUse(d.name).records) throw new Error('This department is used on records, so it can’t be renamed. Deactivate it and add a new one instead.');
          if (v.name!==d.name){ for (const u of Store.all('app_users').filter(u=>deptsOf(u).includes(d.name))) await Store.update('app_users',u.id,{department:u.department===d.name?v.name:u.department, departments:(u.departments||[]).map(x=>x===d.name?v.name:x)}); }
          list[i] = Object.assign(list[i], {name:v.name, code:v.code});
        } else list.push({name:v.name, code:v.code, added:todayStr(), active:true});
        await saveDepts(list);
        await Store.log('department',{id:'dept-'+v.name,number:v.name},d?'Department updated':'Department added',(v.code?'Code '+v.code:''));
        return d?'Department updated':'Department added'; }});
  }
});

Object.assign(ACT, {
  'note-dismiss': async (t)=>{ await noteBulk([t.dataset.id],{dismissed:true, read:true}); App.render(); },
  'note-read': async (t)=>{ const n=Store.byId('notifications',t.dataset.id); await noteBulk([n.id],{read:!n.read}); App.render(); },
  'note-cat':(t)=>{ App.f.nt = App.f.nt||{}; App.f.nt.cat = t.dataset.c; App.render(); },
  'note-more':()=>{ App._ntLimit = (App._ntLimit||50)+50; App.render(); },
  'note-clear-read': async ()=>{ const ids=myNotes().filter(n=>n.read).map(n=>n.id); await noteBulk(ids,{dismissed:true}); App.render(); App.toast(ids.length+' viewed notification'+(ids.length===1?'':'s')+' removed'); },
  'note-clear-all':()=>M.open(`${M.head('Remove all notifications?')}<div class="modal-b"><p style="margin:0">All ${myNotes().length} notifications are cleared from your list, including unread ones. Nothing waiting for your approval is lost — it stays in My approvals.</p></div><div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" data-act="note-clear-all-ok">Remove all</button></div>`,true),
  'note-clear-all-ok': async ()=>{ await noteBulk(myNotes().map(n=>n.id),{dismissed:true, read:true}); M.close(); App.render(); App.toast('Notifications cleared'); },
  'read-all': async ()=>{ await noteBulk(myNotes().filter(n=>!n.read).map(n=>n.id),{read:true}); App.render(); },
  'my-profile':()=>{ App.menu=null; App.go('profile'); },
  'prof-av-clear':()=>{ $('#p-av').value=''; const p=$('#p-av-prev'); if (p.tagName==='IMG') p.outerHTML=`<span class="avatar lg" id="p-av-prev">${esc(initials(me().name))}</span>`; },
  'prof-save': async ()=>{
    const u = me(), p = prefsOf(u);
    const patch = {title:$('#p-title').value.trim(), phone:$('#p-phone').value.trim(), avatar:$('#p-av').value||null, prefs:Object.assign(p,{theme:$('#p-theme').value, dash_view:$('#p-dash')?$('#p-dash').value:''})};
    if (can.admin(u)){ const n=$('#p-name').value.trim(); if (!n) return App.toast('Your name can’t be empty'); patch.name=n; }
    await Store.update('app_users', u.id, patch); Object.assign(u, patch);
    await Store.log('user',{id:u.id,number:u.name},'Profile updated',[patch.title,patch.phone].filter(Boolean).join(' · '));
    App.dashView = null; App.render(); App.toast('Profile saved'); },
  'prof-alerts-save': async ()=>{
    const u = me(), p = prefsOf(u), want = $('#p-browser').checked;
    NOTE_CATS.forEach(([k])=>{ p.email[k] = $$('.p-mail').some(x=>x.value===k && x.checked); });
    if (want && 'Notification' in window && Notification.permission==='default'){ try{ await Notification.requestPermission(); }catch(e){} }
    p.browser = want && 'Notification' in window && Notification.permission==='granted';
    if ($('#p-docrem')) p.doc_reminder = +$('#p-docrem').value||0;
    await Store.update('app_users', u.id, {prefs:p}); u.prefs = p;
    await docReminders();
    App.render(); App.toast(want&&!p.browser?'Saved — desktop pop-ups were not allowed by the browser':'Alert settings saved'); },
  'pw-show':(t)=>{ const i=$('#'+t.dataset.for); const show=i.type==='password'; i.type=show?'text':'password'; t.textContent=show?'Hide':'Show'; },
  'pw-save': async (t)=>{
    const a=$('#p-pw1').value, b=$('#p-pw2').value, err=$('#pw-err'), fail=m=>{ err.hidden=false; err.textContent=m; };
    const bad = pwProblem(a, me().email); if (bad) return fail(bad);
    if (a!==b) return fail('The two passwords don’t match.');
    if (!LIVE){ err.hidden=true; App.toast('Demo mode: passwords are set when Pera is connected to Supabase'); return; }
    t.disabled=true;
    const {error} = await Store.sb.auth.updateUser({password:a});
    if (error){ t.disabled=false; return fail('Could not change the password: '+error.message); }
    await Store.log('user',{id:me().id,number:me().name},'Password changed','');
    App._recovered = true; App.tab.prof='profile'; App.render(); App.toast('Password changed'); },
  logout: async ()=>{ try{ sessionStorage.setItem('pera-out','1'); }catch(e){} await Store.sb.auth.signOut(); location.reload(); },
  'logout-all':()=>M.open(`${M.head('Sign out on all devices?')}<div class="modal-b"><p style="margin:0">You will be signed out here and on every other computer or phone where you are signed in to Pera.</p></div><div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" data-act="logout-all-ok">Sign out everywhere</button></div>`,true),
  'logout-all-ok': async ()=>{ try{ sessionStorage.setItem('pera-out','all'); }catch(e){} await Store.log('user',{id:me().id,number:me().name},'Signed out on all devices',''); await Store.sb.auth.signOut({scope:'global'}); location.reload(); },
  /* company */
  'manage-company':()=>{ App.menu=null; App.go('company'); },
  'user-deact':(t)=>{ const x=Store.byId('app_users',t.dataset.id);
    const owns = Store.all('requisitions').concat(Store.all('purchase_orders'),Store.all('contracts')).filter(r=>['pending','pending_approval'].includes(r.status) && (r.approver_ids||[]).includes(x.id) && !(r.approvals||[]).some(a=>a.approver_id===x.id)).length;
    M.open(`${M.head('Deactivate '+esc(x.name)+'?')}<div class="modal-b"><p style="margin:0">They can no longer sign in or be chosen on new records. Everything they did stays in the audit trail, and you can reactivate them later.</p>${owns?`<div class="note warn" style="margin-top:10px">${owns} record${owns===1?' is':'s are'} still waiting for their approval. Set up delegation or change the approval tiers so those don’t get stuck.</div>`:''}</div><div class="modal-f"><button class="btn ghost" data-close>Cancel</button><button class="btn danger" data-act="user-deact-ok" data-id="${x.id}">Deactivate</button></div>`,true); },
  'user-deact-ok': async (t)=>{ const x=Store.byId('app_users',t.dataset.id); await Store.update('app_users',x.id,{active:false}); await Store.log('user',{id:x.id,number:x.name},'User deactivated',x.email); M.close(); App.render(); App.toast(x.name+' deactivated'); },
  'user-react': async (t)=>{ const x=Store.byId('app_users',t.dataset.id); await Store.update('app_users',x.id,{active:true}); await Store.log('user',{id:x.id,number:x.name},'User reactivated',x.email); App.render(); App.toast(x.name+' reactivated'); },
  _user:(rec)=>App.simpleForm('app_users',rec,'user',[{k:'name',label:'Full name',req:1},{k:'email',label:'Email (used to sign in)',type:'email',req:1},{k:'title',label:'Job title'},{k:'phone',label:'Phone',type:'tel'},
    {k:'department',label:'Main department',type:'select',options:deptOpts()},...((S().branches||[]).length?[{k:'branch_id',label:'Branch',type:'select',options:branchOpts()}]:[]),{k:'role',label:'Role',type:'select',blank:false,options:Object.entries(ROLE_LABEL)},{k:'supplier_id',label:'Supplier (portal users only)',type:'select',options:opt('suppliers')},
    {k:'departments',label:'Also covers these departments',type:'checks',options:deptOpts(),help:'For approvers and managers who look after more than one department. Their “my department” filters include all of them.'}],'user'),
  'dept-new':()=>App.deptForm(),
  'dept-edit':(t)=>App.deptForm(deptList().find(d=>d.name===t.dataset.n)),
  'dept-toggle': async (t)=>{ const list=deptList().map(x=>Object.assign({},x)), d=list.find(x=>x.name===t.dataset.n); d.active=!d.active; await saveDepts(list);
    await Store.log('department',{id:'dept-'+d.name,number:d.name},d.active?'Department reactivated':'Department deactivated','');
    const left = d.active?0:Store.all('app_users').filter(u=>u.active && u.department===d.name).length;
    App.render(); App.toast(d.active?d.name+' reactivated':d.name+' deactivated'+(left?' — '+left+' active user'+(left===1?' still has':'s still have')+' it as their main department':'')); },
  'dept-del': async (t)=>{ const n=t.dataset.n; if (deptUse(n).users+deptUse(n).records) return App.toast('It is in use, so it can only be deactivated'); await saveDepts(deptList().filter(x=>x.name!==n)); await Store.log('department',{id:'dept-'+n,number:n},'Department deleted',''); App.render(); App.toast('Deleted'); },
  export:()=>{ const [kind, rows] = App._export||[], d=todayStr();
    if (kind==='users') return App.csv('users-'+d+'.csv',['Name','Email','Job title','Phone','Role','Main department','Other departments','Branch','Status','Last sign-in','Registered'],rows.map(x=>[x.name,x.email,x.title,x.phone,ROLE_LABEL[x.role]||x.role,x.department,(x.departments||[]).filter(y=>y!==x.department).join('; '),x.role==='supplier'?'':branchName(x.branch_id),!x.active?'Inactive':isPendingUser(x)?'Pending':isDormant(x)?'Dormant':'Active',x.last_login_at||'',x.created_at||'']));
    if (kind==='departments') return App.csv('departments-'+d+'.csv',['Department','Code','Status','People','Records','Added on'],rows.map(x=>[x.name,x.code,x.active?'Active':'Inactive',deptUse(x.name).users,deptUse(x.name).records,x.added||'']));
    App.exportCurrent(); }
});

document.addEventListener('change', async e=>{
  const t = e.target;
  if (t.id==='p-av-file' && t.files[0]){
    try{ const url = await resizeImage(t.files[0], 192); $('#p-av').value = url; $('#p-av-prev').outerHTML = `<img class="avatar lg" id="p-av-prev" src="${url}" alt="">`; }
    catch(err){ App.toast(err.message); }
    t.value = '';
  }
  if (t.dataset.act==='switch-user' && Store.me && !LIVE){ Store.me.last_login_at = nowISO(); Store.persist(); App._seenNotes = null; }
});
document.addEventListener('input', e=>{
  if (e.target.id==='p-pw1'){ const bar=$('#pw-bar'); if (bar){ const s=pwStrength(e.target.value); bar.style.width=(e.target.value?25+s*18.75:0)+'%'; bar.className='s'+s; } }
});
