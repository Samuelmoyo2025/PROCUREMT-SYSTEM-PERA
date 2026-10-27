/* =====================================================================
   DEMO DATA — a fictional company so every screen has something to show
   ===================================================================== */
Store.seed = async function(){
  memFiles.clear();
  const D = (days,h=9) => { const d=new Date(); d.setDate(d.getDate()+days); d.setHours(h, Math.abs(days*7+13)%60,0,0); return d.toISOString(); };
  const Day = days => addDays(todayStr(), days);
  const users = [
    {id:'u-adm', name:'Rumbi Gava', email:'admin@northgate.example', role:'admin', department:'Procurement', title:'Procurement Manager', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-ceo', name:'Tafadzwa Chigumba', email:'ceo@northgate.example', role:'approver', department:'Executive', title:'Chief Executive Officer', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-cfo', name:'Rudo Mutasa', email:'cfo@northgate.example', role:'approver', department:'Executive', title:'Chief Finance Officer', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-coo', name:'Farai Ndlovu', email:'coo@northgate.example', role:'approver', department:'Executive', title:'Chief Operating Officer', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-proc', name:'Grace Mhlanga', email:'procurement@northgate.example', role:'procurement', department:'Procurement', title:'Procurement Officer', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-fin', name:'Nyasha Dube', email:'payables@northgate.example', role:'finance', department:'Finance', title:'Accounts Payable Officer', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-it', name:'Lloyd Sibanda', email:'it@northgate.example', role:'requisitioner', department:'IT', title:'IT Manager', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-ops', name:'Kuda Banda', email:'ops@northgate.example', role:'requisitioner', department:'Operations', title:'Operations Supervisor', branch_id:'br-hre', favourites:[], active:true},
    {id:'u-mkt', name:'Chipo Marufu', email:'marketing@northgate.example', role:'requisitioner', department:'Marketing', title:'Marketing Manager', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-byo', name:'Tariro Moyo', email:'bulawayo@northgate.example', role:'requisitioner', department:'Operations', title:'Branch Administrator', branch_id:'br-byo', favourites:[], active:true},
    {id:'u-s4', name:'Kestrel Computers (sales desk)', email:'bids@kestrel.example', role:'supplier', supplier_id:'s4', department:'', title:'Supplier portal user', branch_id:'br-hq', favourites:[], active:true},
    {id:'u-s10', name:'Ironwood Builders (estimating)', email:'tenders@ironwood.example', role:'supplier', supplier_id:'s10', department:'', title:'Supplier portal user', branch_id:'br-hq', favourites:[], active:true}
  ];
  const U = id => users.find(u=>u.id===id);
  const EXEC = ['u-ceo','u-cfo','u-coo'];
  this.settings = {
    company:'Northgate Holdings (demo)', base_currency:'USD',
    branches:[{id:'br-hq',name:'Head Office'},{id:'br-hre',name:'Harare Depot'},{id:'br-byo',name:'Bulawayo Branch'}],
    review_enabled:true,
    po_approval:{enabled:true, approver_ids:['u-adm'], required:1},
    contract_approval:{enabled:true, approver_ids:['u-ceo','u-cfo'], required:2},
    support:{email:'support@pera.example', phone:'+263 242 000 000', hours:'Monday to Friday, 08:00–17:00'},
    currencies:[{code:'USD',rate:1},{code:'ZWG',rate:26.5},{code:'ZAR',rate:17.8},{code:'EUR',rate:0.92}],
    departments:['Executive','Finance','Operations','IT','Human Resources','Marketing','Sales','Procurement'],
    approval_tiers:[
      {label:'Small',  max:1000,  approver_ids:EXEC.slice(), required:1},
      {label:'Medium', max:10000, approver_ids:EXEC.slice(), required:2},
      {label:'Large',  max:null,  approver_ids:EXEC.slice(), required:3}
    ],
    reject_rule:'veto', quotes_threshold:5000, quotes_required:3, require_documents:true,
    approved_suppliers_only:true, require_grn:true, match_tolerance_pct:2, expiry_warning_days:60, fiscal_year:2026,
    delivery_address:'Northgate House, 12 Samora Machel Avenue, Harare',
    po_terms:'Payment within 30 days of receiving a valid tax invoice quoting this PO number. Goods remain at the supplier’s risk until received and signed for.'
  };
  this.data = {}; TABLES.forEach(t=>this.data[t]=[]);
  this.data.app_users = users;
  this.me = U('u-adm');
  const d = this.data;

  const A = (type, ent, at, by, action, details) => d.audit_log.push({id:uid(), entity_type:type, entity_id:ent.id, entity_number:ent.number||ent.name, action, details:details||'', user_id:by, user_name:U(by).name, at});
  const N = (to, type, ent, message, at, read) => d.notifications.push({id:uid(), user_id:to, entity_type:type, entity_id:ent.id, message, read:!!read, at});
  const att = async (folder, name, title, lines, by, at, kind) => {
    const path = folder+'/'+name; const sample = {title, lines};
    await idbPut(path, makePdf(title, lines));
    return {id:uid(), path, name, size:1300+name.length*37, type:'application/pdf', kind:kind||'support', uploaded_by:by, uploaded_by_name:U(by).name, at, sample};
  };

  /* catalogue */
  d.categories = [['c-it','IT equipment & software'],['c-office','Office supplies & stationery'],['c-fac','Facilities & maintenance'],['c-travel','Travel & accommodation'],['c-fleet','Fleet & fuel'],['c-mkt','Marketing & advertising'],['c-prof','Professional services'],['c-cap','Capital projects'],['c-petty','Petty cash & sundry'],['c-sec','Security services']]
    .map(([id,name],i)=>({id, name, type:'item', parent_id:null, branch_id:null, description:'', active:true, created_at:D(-500+i*9), updated_at:D(-200+i*9)}));
  d.categories.push(
    {id:'c-it-lap', name:'Laptops & computers', type:'item', parent_id:'c-it', branch_id:null, description:'', active:true, created_at:D(-300), updated_at:D(-300)},
    {id:'c-off-print', name:'Printer consumables', type:'item', parent_id:'c-office', branch_id:null, description:'', active:true, created_at:D(-300), updated_at:D(-300)},
    {id:'c-depot', name:'Depot maintenance', type:'item', parent_id:'c-fac', branch_id:'br-hre', description:'Harare Depot only', active:true, created_at:D(-150), updated_at:D(-150)});
  SUP_CATS_DEFAULT.forEach((n,i)=>d.categories.push({id:'sc-'+i, name:n, type:'supplier', parent_id:null, branch_id:null, description:'', active:true, created_at:D(-400), updated_at:D(-400)}));
  d.items = [['Laptop – business grade','c-it','per unit',1150],['Desktop monitor 24"','c-it','per unit',210],['UPS 20kVA with batteries','c-cap','per unit',18000],['Internet connectivity (monthly)','c-it','per month',660],
    ['A4 paper (box of 5 reams)','c-office','per box',28],['Toner cartridge','c-office','per unit',85],['Diesel','c-fleet','per litre',1.6],['Vehicle service – light vehicle','c-fleet','per service',240],
    ['Interior painting','c-fac','per m²',7.5],['Hygiene services','c-fac','per month',150],['Security guarding','c-sec','per month',3000],['Hotel room – full board','c-travel','per night',165],['Newspaper advert – full page','c-mkt','per insertion',0],['Legal fees','c-prof','per matter',0]]
    .map(([name,cat,uom,price],i)=>({id:'i-'+i, item_number:'ITM-'+String(i+1).padStart(4,'0'), name, category_id:cat, uom, price, track_stock:false, stock_qty:0, reorder_level:0, active:true, created_at:D(-480), updated_at:D(-120+i*5)}));
  Object.assign(d.items[0],{category_id:'c-it-lap'});
  Object.assign(d.items[4],{track_stock:true, stock_qty:42, reorder_level:20});
  Object.assign(d.items[5],{track_stock:true, stock_qty:6, reorder_level:8, category_id:'c-off-print'});
  d.items.push({id:'i-14', item_number:'ITM-0015', name:'Cleaning supplies pack', category_id:'c-fac', uom:'per pack', price:18, track_stock:true, stock_qty:15, reorder_level:10, active:true, created_at:D(-200), updated_at:D(-30)},
               {id:'i-15', item_number:'ITM-0016', name:'Office chair – ergonomic', category_id:'c-office', uom:'per unit', price:145, track_stock:false, stock_qty:0, reorder_level:0, active:true, created_at:D(-90), updated_at:D(-90)});
  users.find(u=>u.id==='u-it').favourites=['i-0','i-1']; users.find(u=>u.id==='u-adm').favourites=['i-4','i-5'];

  /* suppliers */
  const supRows = [
    ['s1','Apex Office Supplies','Tendai Moyo','0772 111 204','sales@apex.example',['c-office'],['Local supplier','SME'],'approved',120],
    ['s2','BrightLink Telecoms','Patience Zhou','0242 700 150','corporate@brightlink.example',['c-it'],['Local supplier'],'approved',200],
    ['s3','CleanSpace Hygiene','Mercy Chari','0778 081 531','info@cleanspace.example',['c-fac'],['Local supplier','SME','Women-owned'],'approved',-10],
    ['s4','Kestrel Computers','Brian Nyoni','0242 669 783','bids@kestrel.example',['c-it','c-cap'],['Local supplier'],'approved',150],
    ['s5','Meridian Hotels & Conferences','Events desk','0772 194 969','events@meridian.example',['c-travel'],[],'approved',90],
    ['s6','Summit Motors','Service manager','0242 773 985','service@summit.example',['c-fleet'],['Local supplier'],'approved',75],
    ['s7','GreenLeaf Stationers','Ruth Phiri','0773 723 461','orders@greenleaf.example',['c-office'],['SME','Environmental certification'],'approved',240],
    ['s8','Sable Fuel Services','Accounts','0773 881 879','accounts@sable.example',['c-fleet'],['Local supplier'],'approved',180],
    ['s9','Horizon Media Group','Advertising desk','0242 704 088','ads@horizon.example',['c-mkt'],[],'approved',160],
    ['s10','Ironwood Builders','Simba Gore','0774 110 220','tenders@ironwood.example',['c-fac','c-cap'],['Local supplier','Youth-owned'],'approved',110],
    ['s11','Pinnacle Security Services','Ops manager','0242 250 400','contracts@pinnacle.example',['c-sec'],['Local supplier'],'approved',55],
    ['s12','Quantum Tech Solutions','Nokuthula Dube','0719 555 010','quotes@quantum.example',['c-it'],['SME'],'approved',95],
    ['s13','Kopje Contractors','Takudzwa Mlambo','0782 300 900','office@kopje.example',['c-fac'],['Local supplier','SME'],'approved',60],
    ['s14','Delta Paint & Décor','Anesu Kamba','0715 440 221','hello@deltapaint.example',['c-fac'],['SME','Women-owned'],'pending',null],
    ['s15','Rapid Couriers','Dispatch','0772 909 909','dispatch@rapid.example',['c-office'],[],'suspended',-40]
  ];
  for (const [id,name,contact,phone,email,cats,tags,status,taxDays] of supRows){
    const s = {id, name, contact, phone, email, country:id==='s12'?'South Africa':'Zimbabwe', address:id==='s12'?'Johannesburg':id==='s9'||id==='s13'?'Bulawayo':'Harare', registration_no:'REG/'+(1000+parseInt(id.slice(1))*37), tax_number:'TIN-'+(200450+parseInt(id.slice(1))*11),
      bank_details:'Account '+(4410000+parseInt(id.slice(1))*97)+' · Branch 21', category_ids:cats, supplier_category_ids:[({s1:'sc-1',s4:'sc-1',s7:'sc-1',s8:'sc-1',s10:'sc-3',s13:'sc-3',s14:'sc-3',s12:'sc-4'})[id]||'sc-2'], tags, status, updated_at:D(-60+parseInt(id.slice(1))*3), documents:[], reviews:[], active:status!=='suspended', created_at:D(-420), notes: status==='suspended'?'Suspended after repeated late deliveries (see reviews).':''};
    s.documents.push({id:uid(), type:'Company registration', expiry:null, file: await att('suppliers/'+id,'Certificate_of_incorporation.pdf','Certificate of incorporation – '+name,['Registration no: '+s.registration_no],'u-proc',D(-420))});
    if (taxDays!=null) s.documents.push({id:uid(), type:'Tax clearance certificate', expiry:Day(taxDays), file: await att('suppliers/'+id,'Tax_clearance.pdf','Tax clearance certificate – '+name,['TIN: '+s.tax_number,'Valid to: '+fmtDate(Day(taxDays))],'u-proc',D(-300))});
    d.suppliers.push(s);
  }
  const rev = (sid, by, day, q, t, sv, comment, ref) => d.suppliers.find(s=>s.id===sid).reviews.push({id:uid(), quality:q, timeliness:t, service:sv, comment, ref, by, by_name:U(by).name, at:D(day)});
  rev('s5','u-adm',-30,5,4,5,'Excellent venue and service for the board retreat.','R-00101');
  rev('s11','u-ops',-60,4,3,4,'Good guards; two late shift changes in August.','CT-00001');
  rev('s3','u-ops',-100,3,3,2,'Missed two scheduled visits.','Annual service');
  rev('s15','u-proc',-45,2,1,2,'Three late deliveries in a row. Supplier suspended.','—');

  /* budgets */
  d.budgets = [['b1','IT-OPEX-26','IT operating costs','IT','c-it',60000],['b2','IT-CAPEX-26','IT capital equipment','IT','c-cap',120000],['b3','FAC-26','Facilities & maintenance','Operations','c-fac',45000],
    ['b4','TRV-26','Travel & accommodation','Executive','c-travel',30000],['b5','FLT-26','Fleet & fuel','Operations','c-fleet',36000],['b6','MKT-26','Marketing & advertising','Marketing','c-mkt',50000],
    ['b7','ADM-26','Office administration','Finance','c-office',12000],['b8','SEC-26','Security services','Operations','c-sec',40000],['b9','PRO-26','Professional fees','Finance','c-prof',25000],['b10','PTY-26','Petty cash','Finance','c-petty',6000]]
    .map(([id,code,name,dept,cat,amount])=>({id, code, name, department:dept, category_id:cat, branch_id:dept==='Operations'?'br-hre':'br-hq', year:2026, amount, active:true, created_at:D(-280), updated_at:D(-280)}));

  /* contracts */
  const ct = async (id, number, title, sid, type, start, end, value, notes) => {
    const c = {id, number, title, supplier_id:sid, type, start_date:Day(start), end_date:Day(end), value, currency:'USD', status:'active', notes, branch_id:'br-hq', created_by:'u-proc', created_at:D(start-5), updated_at:D(start-3),
      approver_ids:['u-ceo','u-cfo'], approvals_required:2, approvals:[{approver_id:'u-cfo',approver_name:'Rudo Mutasa',decision:'approved',comment:'',at:D(start-4)},{approver_id:'u-ceo',approver_name:'Tafadzwa Chigumba',decision:'approved',comment:'',at:D(start-3)}], submitted_at:D(start-5), decided_at:D(start-3), attachments:[await att('contracts/'+id,'Signed_contract_'+number+'.pdf',type+' – '+title,['Supplier: '+d.suppliers.find(s=>s.id===sid).name,'Term: '+fmtDate(Day(start))+' to '+fmtDate(Day(end)),'Value: USD '+num(value)],'u-proc',D(start-5))]};
    d.contracts.push(c); A('contract',c,D(start-5),'u-proc','Contract recorded',type+' · USD '+num(value));
  };
  await ct('ct1','CT-00001','Security guarding – all sites','s11','Framework agreement',-320,45,36000,'Monthly call-offs at USD 3,000. Renewal to be tendered.');
  await ct('ct2','CT-00002','Fibre & LTE connectivity','s2','Service contract',-200,165,7920,'');
  await ct('ct3','CT-00003','Diesel supply','s8','Framework agreement',-100,265,24000,'Pump price less 3%.');
  await ct('ct4','CT-00004','Corporate hotel rates','s5','Framework agreement',-400,-35,15000,'Expired — renegotiation pending.');

  /* requisitions */
  const reqs = {};
  const mkReq = async (o) => {
    const r = {id:o.id, number:o.number, title:o.title, description:o.desc, kind:o.kind, category_id:o.cat, supplier_id:o.sup||null, department:o.dept, budget_id:o.budget, plan_line_id:null, contract_id:o.contract||null,
      currency:o.cur||'USD', payment_method:o.pm||'Bank transfer', due_date:Day(o.due), lines:o.lines.map(l=>({description:l[0], qty:l[1], unit_price:l[2]})),
      created_by:o.by, created_at:D(o.created,8), submitted_at:null, decided_at:null, approvals:[], attachments:[], status:'draft', payment:null, approver_ids:[], approvals_required:0, tier_label:'',
      branch_id:o.branch||U(o.by).branch_id, expense_date:o.expDate!=null?Day(o.expDate):null, payee:o.payee||''};
    const T = r.kind==='expense'?'expense':'requisition';
    r.total = linesTotal(r.lines);
    for (const [label,f] of (o.files||[['Quotation','Q']])){
      const nm = label.replace(/\W+/g,'_')+'_'+(o.sup?Store.supName(o.sup).replace(/\W+/g,''):'doc')+'.pdf';
      r.attachments.push(await att('requisitions/'+r.id, nm, label+' – '+(o.sup?Store.supName(o.sup):'supporting document'), ['Ref: '+r.number+'   Date: '+fmtDate(r.created_at),'For: '+this.settings.company,'',...r.lines.map(l=>l.description+'  x'+l.qty+'  @ '+fmtMoney(r.currency,l.unit_price)),'','TOTAL: '+fmtMoney(r.currency,r.total),'','Sample document generated for the Pera demo.'], o.by, D(o.created,8)));
    }
    A(T,r,D(o.created,8),o.by,'Created','Draft saved with '+r.attachments.length+' supporting document(s)');
    if (o.flow){
      const tier = pickTier(r.currency,r.total);
      Object.assign(r,{status:'pending', submitted_at:D(o.created,9), approver_ids:tier.approver_ids.slice(), approvals_required:tier.required, tier_label:tier.label});
      A(T,r,r.submitted_at,o.by,'Submitted for approval',tier.label+' tier – '+tier.required+' of '+tier.approver_ids.length+' approvals needed. Notified: '+tier.approver_ids.map(a=>U(a).name).join(', '));
      for (const a of r.approver_ids) N(a,T,r,'New '+(T==='expense'?'expense claim ':'requisition ')+r.number+' – '+r.title+' ('+fmtMoney(r.currency,r.total)+') needs your approval', r.submitted_at, o.flow.some(f=>f[0]===a));
      for (const [aid,dec,day,comment] of o.flow){
        const at = D(day,11);
        r.approvals.push({approver_id:aid, approver_name:U(aid).name, decision:dec, comment:comment||'', at});
        A(T,r,at,aid,dec==='approved'?'Approved':'Rejected',comment?'“'+comment+'”':'');
        const st = outcome(r);
        if (st!=='pending' && r.status==='pending'){ r.status=st; r.decided_at=at;
          if (st==='rejected') A(T,r,at,aid,'Rejected (final)','Rejected by '+U(aid).name);
          else {
            A(T,r,at,aid,'Fully approved','Sent to Finance for review before release');
            if (o.holdReview) r.status='review';
            else { const rt=D(day,15); Object.assign(r,{reviewed_by:'u-fin', reviewed_by_name:'Nyasha Dube', reviewed_at:rt, review_note:'Budget code and documents checked.'}); A(T,r,rt,'u-fin','Reviewed and released','Budget code and documents checked.'); A(T,r,rt,'u-fin','Released', r.kind==='purchase'?'Released to Procurement to source and raise a purchase order':'Released to Finance for payment'); }
          } }
      }
    }
    d.requisitions.push(r); reqs[r.id]=r; return r;
  };
  const pay = async (r, day, ref, invoiceIds) => {
    const at = D(day,14);
    r.attachments.push(await att('requisitions/'+r.id,'Proof_of_payment_'+ref+'.pdf','Proof of payment – '+r.number,['Paid to: '+(r.supplier_id?Store.supName(r.supplier_id):'payee'),'Amount: '+fmtMoney(r.currency,r.total),'Reference: '+ref,'Date: '+fmtDate(at)],'u-fin',at,'payment'));
    r.payment = {reference:ref, paid_on:at.slice(0,10), amount:r.total, method:r.payment_method, note:'', paid_by:'u-fin', paid_by_name:U('u-fin').name, invoice_ids:invoiceIds||[]};
    r.status='paid'; r.paid_at=at;
    A(r.kind==='expense'?'expense':'requisition',r,at,'u-fin','Payment recorded','Ref '+ref+' · '+fmtMoney(r.currency,r.total));
    N(r.created_by,r.kind==='expense'?'expense':'requisition',r,r.number+' has been paid ('+ref+')',at,true);
  };

  let r;
  r = await mkReq({id:'r101',number:'R-00101',title:'Board strategy retreat – accommodation',desc:'Two nights full board for 14 board members and executives at the annual strategy retreat.',kind:'payment',cat:'c-travel',sup:'s5',dept:'Executive',budget:'b4',by:'u-adm',created:-41,due:-30,
    lines:[['Hotel room – full board, 2 nights',28,165],['Conference room hire',2,120]],files:[['Quotation','Q'],['Board resolution','B']],flow:[['u-cfo','approved',-40],['u-coo','approved',-39,'Approved. Keep within the travel budget line.']]});
  await pay(r,-33,'EFT-0923-4471');

  r = await mkReq({id:'r102',number:'R-00102',title:'Laptops for new sales team',desc:'Ten business-grade laptops for the sales team expansion approved in the FY2026 budget. Quotes to be sourced by RFQ.',kind:'purchase',cat:'c-it',sup:null,dept:'IT',budget:'b2',by:'u-it',created:-31,due:5,
    lines:[['Laptop – business grade',10,1150]],files:[['Specification','S'],['Budget approval extract','B']],flow:[['u-cfo','approved',-30],['u-coo','approved',-29],['u-ceo','approved',-28,'Approved subject to three competitive quotes.']]});

  r = await mkReq({id:'r103',number:'R-00103',title:'Diesel – October allocation',desc:'Monthly diesel allocation for the delivery fleet under the Sable framework agreement.',kind:'purchase',cat:'c-fleet',sup:'s8',dept:'Operations',budget:'b5',contract:'ct3',by:'u-ops',created:-15,due:-2,
    lines:[['Diesel',1200,1.6]],flow:[['u-coo','approved',-14],['u-cfo','approved',-13]]});

  await mkReq({id:'r104',number:'R-00104',title:'Q4 internet connectivity – head office & branches',desc:'Quarterly fibre and backup LTE for head office and 4 branches (contract CT-00002).',kind:'purchase',cat:'c-it',sup:'s2',dept:'IT',budget:'b1',contract:'ct2',by:'u-it',created:-3,due:4,
    lines:[['Internet connectivity (monthly)',3,660]],flow:[['u-cfo','approved',-2]]});
  await mkReq({id:'r105',number:'R-00105',title:'Server room UPS replacement',desc:'The 12-year-old server room UPS failed its load test in August. Replacement 20kVA unit with batteries and installation. Three quotes attached.',kind:'purchase',cat:'c-cap',sup:'s4',dept:'IT',budget:'b2',by:'u-it',created:-1,due:14,
    lines:[['UPS 20kVA with batteries',1,17200],['Installation & commissioning',1,1300]],files:[['Quotation','Q'],['Comparative quotes','C'],['Load test report','L']],flow:[]});
  await mkReq({id:'r106',number:'R-00106',title:'Year-end campaign – newspaper adverts',desc:'Full-page adverts for the year-end campaign in two national papers.',kind:'purchase',cat:'c-mkt',sup:'s9',dept:'Marketing',budget:'b6',by:'u-mkt',created:-4,due:1,cur:'ZWG',
    lines:[['Newspaper advert – full page',2,12500],['Newspaper advert – half page',2,6750]],flow:[['u-ceo','approved',-3]]});
  await mkReq({id:'r107',number:'R-00107',title:'Petty cash replenishment – head office',desc:'Replenishment of the head office petty cash float. Signed vouchers attached.',kind:'payment',cat:'c-petty',sup:null,dept:'Finance',budget:'b10',pm:'Cash / petty cash',by:'u-fin',created:-9,due:-3,
    lines:[['Petty cash float replenishment',1,300]],files:[['Petty cash vouchers','V']],flow:[]});
  await mkReq({id:'r108',number:'R-00108',title:'Hygiene services – annual renewal',desc:'Annual sanitary and hygiene services for all offices.',kind:'purchase',cat:'c-fac',sup:'s3',dept:'Operations',budget:'b3',by:'u-ops',created:-15,due:-5,
    lines:[['Hygiene services',12,150]],flow:[['u-coo','approved',-14],['u-cfo','rejected',-13,'The quotation has expired and the supplier’s tax clearance is out of date. Attach three current quotes and resubmit.']]});
  await mkReq({id:'r109',number:'R-00109',title:'Stationery – Q4 office supplies',desc:'Paper, toner and general stationery for Q4.',kind:'purchase',cat:'c-office',sup:'s7',dept:'Procurement',budget:'b7',by:'u-adm',created:0,due:14,
    lines:[['A4 paper (box of 5 reams)',20,28],['Toner cartridge',4,85]]});
  await mkReq({id:'r110',number:'R-00110',title:'Office repainting – 2nd floor',desc:'Interior repainting of the 2nd floor open-plan office (approx. 800 m²). Sourced by sealed RFQ.',kind:'purchase',cat:'c-fac',sup:null,dept:'Operations',budget:'b3',by:'u-ops',created:-21,due:30,
    lines:[['Interior painting',800,7.5],['Surface preparation & repairs',1,200]],files:[['Floor plan','F']],flow:[['u-coo','approved',-20],['u-cfo','approved',-19]]});
  await mkReq({id:'r111',number:'R-00111',title:'Security guarding – Q4 call-off',desc:'Q4 call-off under the security framework agreement CT-00001.',kind:'purchase',cat:'c-sec',sup:'s11',dept:'Operations',budget:'b8',contract:'ct1',by:'u-ops',created:-9,due:25,
    lines:[['Security guarding',3,3000]],flow:[['u-coo','approved',-8],['u-ceo','approved',-7]]});
  r = await mkReq({id:'r112',number:'R-00112',title:'Legal fees – debt recovery matters',desc:'Fees for three debt recovery matters concluded in September. Fee notes attached.',kind:'payment',cat:'c-prof',sup:null,dept:'Finance',budget:'b9',by:'u-fin',created:-5,due:3,
    lines:[['Legal fees',3,800]],files:[['Fee notes','F']],flow:[['u-cfo','approved',-4],['u-ceo','approved',-4]],holdReview:true});
  r.payee = 'Moyo & Partners Legal Practitioners';

  /* RFQ 1 — awarded */
  const rfq1 = {id:'q1', number:'RFQ-00001', title:'Supply of 10 business laptops', description:'Core i7 / 16GB / 512GB SSD, 14-inch, 3-year onsite warranty. Delivery to head office.', req_id:'r102', category_id:'c-it', currency:'USD',
    lines:[{description:'Laptop – business grade (spec attached)', qty:10, unit_price:0}], invited_ids:['s4','s12','s2'], closing_at:D(-20,12), sealed:true, criteria:{price:60,delivery:20,technical:20},
    status:'awarded', created_by:'u-proc', created_at:D(-27,10), opened_at:D(-20,13), awarded_bid_id:'bd1', award_note:'Highest overall score: competitive price and the fastest delivery.', awarded_at:D(-18,10), attachments:[await att('rfqs/q1','Laptop_specification.pdf','Specification – business laptops',['Core i7, 16GB RAM, 512GB SSD','14-inch FHD, 3-year onsite warranty'],'u-proc',D(-27,10))]};
  d.rfqs.push(rfq1);
  A('rfq',rfq1,D(-27,10),'u-proc','RFQ created','From '+'R-00102'+' · 3 suppliers invited');
  A('rfq',rfq1,D(-27,10),'u-proc','RFQ published','Closes '+fmtDT(rfq1.closing_at)+' · sealed bids');
  const bid = async (id, rfq, sid, amount, days, tech, notes, day, by) => {
    const b = {id, rfq_id:rfq.id, supplier_id:sid, amount, currency:rfq.currency, delivery_days:days, validity_days:30, notes, technical_score:tech, submitted_at:D(day,15), submitted_by:by||'u-proc', attachments:[await att('bids/'+id,'Quotation_'+Store.supName(sid).replace(/\W+/g,'')+'.pdf','Quotation – '+Store.supName(sid),['RFQ: '+rfq.number,'Amount: '+fmtMoney(rfq.currency,amount),'Delivery: '+days+' days'],by||'u-proc',D(day,15))]};
    d.bids.push(b); A('rfq',rfq,b.submitted_at,by||'u-proc','Bid received',Store.supName(sid)+(rfq.sealed?' (sealed)':' · '+fmtMoney(rfq.currency,amount))); return b;
  };
  await bid('bd1',rfq1,'s4',11200,7,85,'Stock available locally.',-23,'u-s4');
  await bid('bd2',rfq1,'s12',10650,21,70,'Imported to order.',-22);
  await bid('bd3',rfq1,'s2',11900,10,80,'Includes carry cases.',-21);
  A('rfq',rfq1,rfq1.opened_at,'u-proc','Bids opened','3 bids unsealed after closing');
  A('rfq',rfq1,rfq1.awarded_at,'u-adm','Awarded','Kestrel Computers · USD 11,200.00 — '+rfq1.award_note);
  A('requisition',reqs.r102,rfq1.created_at,'u-proc','Sourcing started','RFQ-00001 issued to 3 suppliers');
  reqs.r102.supplier_id = 's4';

  /* RFQ 2 — open, sealed */
  const rfq2 = {id:'q2', number:'RFQ-00002', title:'Interior repainting – 2nd floor', description:'Approx. 800 m² walls and ceilings, two coats, low-VOC paint. Work after hours. Site visit available on request.', req_id:'r110', category_id:'c-fac', currency:'USD',
    lines:[{description:'Interior painting (m²)', qty:800, unit_price:0},{description:'Surface preparation & repairs', qty:1, unit_price:0}], invited_ids:['s10','s13','s3'], closing_at:D(3,12), sealed:true, criteria:{price:70,delivery:10,technical:20},
    status:'open', created_by:'u-proc', created_at:D(-17,10), attachments:[await att('rfqs/q2','Floor_plan.pdf','Floor plan – 2nd floor',['Open-plan office approx. 800 m2'],'u-proc',D(-17,10))]};
  d.rfqs.push(rfq2);
  A('rfq',rfq2,D(-17,10),'u-proc','RFQ created','From R-00110 · 3 suppliers invited');
  A('rfq',rfq2,D(-17,10),'u-proc','RFQ published','Closes '+fmtDT(rfq2.closing_at)+' · sealed bids');
  A('requisition',reqs.r110,rfq2.created_at,'u-proc','Sourcing started','RFQ-00002 issued to 3 suppliers');
  await bid('bd4',rfq2,'s10',5980,14,0,'Two-coat system, 14 working days.',-4,'u-s10');
  await bid('bd5',rfq2,'s13',6150,10,0,'',-2);

  /* purchase orders, receipts, invoices */
  const mkPO = (o) => { const p = Object.assign({currency:'USD', status:'issued', delivery_address:this.settings.delivery_address, terms:this.settings.po_terms, created_by:'u-proc', branch_id:(reqs[o.req_id]||{}).branch_id||'br-hq', approver_ids:['u-adm'], approvals_required:1, approvals:[{approver_id:'u-adm',approver_name:'Rumbi Gava',decision:'approved',comment:'',at:o.created_at}], submitted_at:o.created_at, decided_at:o.created_at, reviewed_by:'u-fin', reviewed_by_name:'Nyasha Dube', reviewed_at:o.created_at}, o); p.total=linesTotal(p.lines); d.purchase_orders.push(p);
    A('po',p,p.created_at,p.created_by,'Purchase order issued',Store.supName(p.supplier_id)+' · '+fmtMoney(p.currency,p.total)); if (p.req_id) A('requisition',reqs[p.req_id],p.created_at,p.created_by,'Purchase order issued',p.number); return p; };
  const po1 = mkPO({id:'p1', number:'PO-00001', req_id:'r102', rfq_id:'q1', supplier_id:'s4', lines:[{description:'Laptop – business grade (Core i7/16GB/512GB)', qty:10, unit_price:1120}], delivery_date:Day(-10), created_at:D(-17,11)});
  const po2 = mkPO({id:'p2', number:'PO-00002', req_id:'r103', contract_id:'ct3', supplier_id:'s8', lines:[{description:'Diesel (litres)', qty:1200, unit_price:1.6}], delivery_date:Day(-11), created_at:D(-12,10)});
  const po3 = mkPO({id:'p3', number:'PO-00003', req_id:'r111', contract_id:'ct1', supplier_id:'s11', lines:[{description:'Security guarding – October', qty:1, unit_price:3000},{description:'Security guarding – November', qty:1, unit_price:3000},{description:'Security guarding – December', qty:1, unit_price:3000}], delivery_date:Day(85), created_at:D(-6,10)});
  const grn = async (id, number, po, day, by, qtys, cond, note) => {
    const g = {id, number, po_id:po.id, lines:po.lines.map((l,i)=>({description:l.description, ordered:l.qty, received:qtys[i]})), received_on:D(day).slice(0,10), received_by:by, received_by_name:U(by).name, condition:cond, notes:note||'', created_at:D(day,15),
      attachments:[await att('receipts/'+id,'Delivery_note_'+po.number+'.pdf','Delivery note – '+po.number,po.lines.map((l,i)=>l.description+': '+qtys[i]+' received'),by,D(day,15))]};
    d.receipts.push(g); A('po',po,g.created_at,by,'Goods received',g.number+' · '+cond);
    const full = g.lines.every(l=>l.received>=l.ordered); po.status = full?'received':'partially_received';
    if (po.req_id) A('requisition',reqs[po.req_id],g.created_at,by,'Goods received',g.number+' against '+po.number);
    return g;
  };
  await grn('g1','GRN-00001',po1,-9,'u-it',[10],'Good','Serial numbers recorded on asset register.');
  await grn('g2','GRN-00002',po2,-10,'u-ops',[1200],'Good','');
  const inv = async (o) => {
    const v = Object.assign({currency:'USD', created_by:'u-fin'}, o);
    v.attachments=[await att('invoices/'+v.id,'Invoice_'+v.supplier_invoice_no+'.pdf','Tax invoice '+v.supplier_invoice_no,['Supplier: '+Store.supName(v.supplier_id),'PO: '+(Store.byId('purchase_orders',v.po_id)||{}).number,'Amount: '+fmtMoney(v.currency,v.amount)],v.created_by,v.created_at)];
    d.invoices.push(v); const po=Store.byId('purchase_orders',v.po_id);
    A('invoice',v,v.created_at,v.created_by,'Invoice captured',v.supplier_invoice_no+' · '+fmtMoney(v.currency,v.amount)+' against '+(po?po.number:'—'));
    if (po && po.req_id) A('requisition',reqs[po.req_id],v.created_at,v.created_by,'Invoice captured',v.number+' ('+v.supplier_invoice_no+')');
    return v;
  };
  await inv({id:'v1', number:'INV-00001', supplier_invoice_no:'KC-24-3391', supplier_id:'s4', po_id:'p1', req_id:'r102', amount:11200, invoice_date:Day(-8), due_date:Day(22), status:'captured', created_at:D(-8,11)});
  const v2 = await inv({id:'v2', number:'INV-00002', supplier_invoice_no:'SF-10021', supplier_id:'s8', po_id:'p2', req_id:'r103', amount:1920, invoice_date:Day(-9), due_date:Day(21), status:'paid', created_at:D(-9,11)});
  await pay(reqs.r103,-5,'EFT-1002-118',[v2.id]); po2.status='closed';
  rev('s4','u-it',-9,5,5,4,'Delivered early and well packed.','PO-00001');
  rev('s8','u-ops',-10,4,4,5,'On time.','PO-00002');

  /* procurement plan */
  const pl = (id, q, dept, desc, cat, qty, est, method, status, req) => { const p={id, year:2026, quarter:q, department:dept, description:desc, category_id:cat, qty, est_cost:est, currency:'USD', method, status, req_id:req||null, created_at:D(-270)}; d.plan_lines.push(p); if (req) reqs[req].plan_line_id=id; };
  pl('pl1','Q3','Operations','Fleet servicing contract','c-fleet',1,8000,'Request for quotation (RFQ)','completed');
  pl('pl2','Q4','IT','Laptops for sales team expansion','c-it',10,11500,'Request for quotation (RFQ)','requisitioned','r102');
  pl('pl3','Q4','IT','Server room UPS replacement','c-cap',1,18000,'Request for quotation (RFQ)','requisitioned','r105');
  pl('pl4','Q4','Operations','Office repainting – 2nd floor','c-fac',1,6500,'Request for quotation (RFQ)','requisitioned','r110');
  pl('pl5','Q4','Human Resources','Annual staff conference venue','c-travel',1,9000,'Request for quotation (RFQ)','planned');
  pl('pl6','Q4','Marketing','Branch signage refresh','c-mkt',6,7200,'Request for quotation (RFQ)','planned');
  pl('pl7','Q4','IT','ERP licence renewal','c-it',1,24000,'Open tender','planned');
  pl('pl8','Q4','Operations','Security guarding re-tender (CT-00001 expiry)','c-sec',1,38000,'Open tender','planned');

  /* a few direct notifications */
  N('u-fin','requisition',reqs.r112,'R-00112 is approved and needs your review before release',D(-4,12));

  /* ---------- more requisitions: a PO awaiting approval and a draft PO ---------- */
  await mkReq({id:'r113',number:'R-00113',title:'Toner & paper restock – stores',desc:'Restock stores below reorder level (toner at 6, reorder at 8).',kind:'purchase',cat:'c-office',sup:'s7',dept:'Procurement',budget:'b7',by:'u-proc',created:-6,due:6,
    lines:[['Toner cartridge',10,85],['A4 paper (box of 5 reams)',20,28]],flow:[['u-cfo','approved',-5],['u-coo','approved',-4]]});
  await mkReq({id:'r114',number:'R-00114',title:'Office chairs – Bulawayo branch',desc:'Replacement ergonomic chairs for the Bulawayo branch office (from request RQ-00006).',kind:'purchase',cat:'c-office',sup:'s1',dept:'Operations',budget:'b7',by:'u-byo',created:-8,due:12,
    lines:[['Office chair – ergonomic',6,145]],flow:[['u-coo','approved',-7]]});
  const po4 = mkPO({id:'p4', number:'PO-00004', req_id:'r113', supplier_id:'s7', lines:[{description:'Toner cartridge',qty:10,unit_price:85},{description:'A4 paper (box of 5 reams)',qty:20,unit_price:28}], delivery_date:Day(7), created_at:D(-1,10), status:'pending_approval', approvals:[], decided_at:null, reviewed_by:null, reviewed_by_name:null, reviewed_at:null});
  d.audit_log.pop(); d.audit_log.pop(); A('po',po4,po4.created_at,'u-proc','Submitted for approval','Approver: Rumbi Gava'); A('requisition',reqs.r113,po4.created_at,'u-proc','Purchase order drafted',po4.number+' awaiting approval');
  N('u-adm','po',po4,'Purchase order PO-00004 (GreenLeaf Stationers, USD 1,410.00) needs your approval',po4.created_at);
  const po5 = mkPO({id:'p5', number:'PO-00005', req_id:'r114', supplier_id:'s1', lines:[{description:'Office chair – ergonomic',qty:6,unit_price:142}], delivery_date:Day(10), created_at:D(0,9), status:'draft', approvals:[], approver_ids:[], approvals_required:0, submitted_at:null, decided_at:null, reviewed_by:null, reviewed_by_name:null, reviewed_at:null, branch_id:'br-byo', delivery_address:'Northgate Bulawayo, 44 Fife Street, Bulawayo'});
  d.audit_log.pop(); d.audit_log.pop(); A('po',po5,po5.created_at,'u-proc','Draft saved','');

  /* ---------- contracts in draft and pending approval ---------- */
  await ct('ct5','CT-00005','Office cleaning – all sites','s3','Service contract',10,375,7200,'Replaces monthly call-offs. Awaiting supplier tax clearance.');
  Object.assign(d.contracts.find(c=>c.id==='ct5'),{created_at:D(-3,9), updated_at:D(-3,9), status:'draft', approvals:[], approver_ids:[], approvals_required:0, submitted_at:null, decided_at:null});
  await ct('ct6','CT-00006','Courier services framework','s1','Framework agreement',5,370,12000,'Rates attached.');
  Object.assign(d.contracts.find(c=>c.id==='ct6'),{created_at:D(-2,9), updated_at:D(-1,11), status:'pending', approvals:[{approver_id:'u-cfo',approver_name:'Rudo Mutasa',decision:'approved',comment:'Rates are competitive.',at:D(-1,11)}], submitted_at:D(-2,9), decided_at:null});
  d.audit_log.splice(-2,2);
  A('contract',d.contracts.find(c=>c.id==='ct5'),D(-3,9),'u-proc','Draft saved','');
  A('contract',d.contracts.find(c=>c.id==='ct6'),D(-2,9),'u-proc','Submitted for approval','Approvers: Tafadzwa Chigumba, Rudo Mutasa');
  A('contract',d.contracts.find(c=>c.id==='ct6'),D(-1,11),'u-cfo','Approved','“Rates are competitive.”');
  N('u-ceo','contract',{id:'ct6'},'Contract CT-00006 Courier services framework needs your approval',D(-2,9));

  /* ---------- expenses ---------- */
  await mkReq({id:'x1',number:'EX-00001',title:'Mileage claim – Bulawayo client visits',desc:'Own vehicle, 640 km at the company rate for September client visits.',kind:'expense',cat:'c-travel',dept:'Operations',budget:'b4',by:'u-byo',created:-20,due:-10,expDate:-22,payee:'Tariro Moyo',
    lines:[['Mileage (km)',640,0.45]],files:[['Logbook extract','L']],flow:[['u-coo','approved',-19]]});
  await pay(reqs.x1,-12,'EFT-0916-022');
  await mkReq({id:'x2',number:'EX-00002',title:'Client lunch – broker relationship meeting',desc:'Lunch with two broker partners to discuss Q4 targets.',kind:'expense',cat:'c-mkt',dept:'Marketing',budget:'b6',by:'u-mkt',created:-2,due:5,expDate:-3,payee:'Chipo Marufu',
    lines:[['Meals – 3 people',1,86.5]],files:[['Restaurant receipt','R']],flow:[]});
  await mkReq({id:'x3',number:'EX-00003',title:'Conference registration – Procurement summit',desc:'Registration for the regional procurement summit, paid personally by card.',kind:'expense',cat:'c-prof',dept:'Procurement',budget:'b9',by:'u-proc',created:-7,due:3,expDate:-9,payee:'Grace Mhlanga',pm:'Bank transfer',
    lines:[['Conference registration',1,350]],files:[['Card slip','C'],['Invitation letter','I']],flow:[['u-cfo','approved',-6]],holdReview:true});
  await mkReq({id:'x4',number:'EX-00004',title:'Taxi fares – late shift',desc:'Taxi home after late IT maintenance windows.',kind:'expense',cat:'c-travel',dept:'IT',budget:'b1',by:'u-it',created:0,due:14,expDate:-1,payee:'Lloyd Sibanda',
    lines:[['Taxi fare',3,12]],files:[['Receipts','R']]});

  /* ---------- internal requests ---------- */
  const rq = (o) => { const r = Object.assign({attachments:[], items:[], priority:'Normal', recurrence:'none', next_run:null, parent_id:null, req_id:null, assigned_to:null, completed_at:null, resolution:'', branch_id:U(o.created_by).branch_id, updated_at:o.created_at}, o); d.requests.push(r);
    A('request',r,r.created_at,r.created_by,r.status==='draft'?'Draft saved':r.status==='scheduled'?'Schedule created':'Submitted',r.type); return r; };
  const rq1 = rq({id:'rq1',number:'RQ-00001',title:'Laptop screen repair – finance office',description:'Cracked screen on the payables laptop (asset NG-IT-0231).',type:'Service or repair',category_id:'c-it',department:'Finance',items:[{description:'Screen replacement',qty:1}],needed_by:Day(4),priority:'High',status:'open',assigned_to:'u-it',created_by:'u-fin',created_at:D(-3,9)});
  A('request',rq1,D(-3,11),'u-proc','Accepted','Assigned to Lloyd Sibanda');
  rq({id:'rq2',number:'RQ-00002',title:'Printer paper and toner – Bulawayo',description:'Monthly stationery for the Bulawayo branch.',type:'Goods from stores',category_id:'c-office',department:'Operations',items:[{item_id:'i-4',description:'A4 paper (box of 5 reams)',qty:4},{item_id:'i-5',description:'Toner cartridge',qty:1}],needed_by:Day(5),status:'pending',created_by:'u-byo',created_at:D(-1,10)});
  N('u-proc','request',{id:'rq2'},'New request RQ-00002 – Printer paper and toner – Bulawayo',D(-1,10));
  rq({id:'rq3',number:'RQ-00003',title:'Cleaning supplies – head office (monthly)',description:'Standing monthly order from stores.',type:'Goods from stores',category_id:'c-fac',department:'Operations',items:[{item_id:'i-14',description:'Cleaning supplies pack',qty:4}],needed_by:null,status:'scheduled',recurrence:'monthly',next_run:Day(3),created_by:'u-ops',created_at:D(-60,9)});
  const rq4 = rq({id:'rq4',number:'RQ-00004',title:'Cleaning supplies – head office (September)',description:'Generated from the monthly schedule RQ-00003.',type:'Goods from stores',category_id:'c-fac',department:'Operations',items:[{item_id:'i-14',description:'Cleaning supplies pack',qty:4}],needed_by:Day(-26),status:'completed',parent_id:'rq3',assigned_to:'u-proc',completed_at:D(-27,14),resolution:'Issued from stores.',created_by:'u-ops',created_at:D(-28,7)});
  A('request',rq4,D(-27,14),'u-proc','Issued from stores','4 × Cleaning supplies pack'); A('request',rq4,D(-27,14),'u-proc','Completed','Issued from stores.');
  rq({id:'rq5',number:'RQ-00005',title:'Desk lamp for reception',description:'',type:'Facilities',category_id:'c-fac',department:'Operations',items:[{description:'LED desk lamp',qty:1}],needed_by:Day(20),priority:'Low',status:'draft',created_by:'u-ops',created_at:D(0,8)});
  const rq6 = rq({id:'rq6',number:'RQ-00006',title:'Office chairs – Bulawayo branch',description:'Six chairs are broken beyond repair.',type:'Goods from stores',category_id:'c-office',department:'Operations',items:[{item_id:'i-15',description:'Office chair – ergonomic',qty:6}],needed_by:Day(12),status:'open',assigned_to:'u-proc',req_id:'r114',created_by:'u-byo',created_at:D(-9,9)});
  A('request',rq6,D(-8,9),'u-proc','Converted to requisition','Not in stores — raised R-00114');

  /* ---------- stock movements ---------- */
  const mv = (item, qty, reason, ref, by, day) => d.stock_moves.push({id:uid(), item_id:item, qty, reason, ref, user_id:by, user_name:U(by).name, at:D(day,10)});
  mv('i-4',50,'Opening balance','', 'u-proc',-90); mv('i-4',-8,'Issued','RQ-00004 area','u-proc',-40);
  mv('i-5',12,'Opening balance','','u-proc',-90); mv('i-5',-6,'Issued','Various','u-proc',-35);
  mv('i-14',19,'Opening balance','','u-proc',-90); mv('i-14',-4,'Issued','RQ-00004','u-proc',-27);

  /* ---------- comments / messages ---------- */
  const cm = (type, ent, by, day, body) => d.comments.push({id:uid(), entity_type:type, entity_id:ent.id, entity_number:ent.number, body, user_id:by, user_name:U(by).name, at:D(day,13)});
  cm('requisition',reqs.r105,'u-cfo',0,'@Lloyd is the 20kVA size confirmed by the load test, or could a 15kVA unit do?');
  cm('requisition',reqs.r105,'u-it',0,'@Rudo the load test peaked at 14.2kVA, so 15kVA leaves no headroom for the new servers. 20kVA is the right size.');
  N('u-cfo','requisition',reqs.r105,'Lloyd Sibanda replied on R-00105: the load test peaked at 14.2kVA…',D(0,13));
  cm('requisition',reqs.r102,'u-proc',-19,'Kestrel confirmed stock is in their Harare warehouse; delivery within a week of the PO.');
  cm('expense',reqs.x2,'u-coo',-1,'@Chipo please add the names of the broker guests to the justification.');
  N('u-mkt','expense',reqs.x2,'Farai Ndlovu commented on EX-00002: please add the names of the broker guests…',D(-1,13));
  cm('po',po4,'u-proc',-1,'Urgent — toner is below reorder level.');
  N('u-fin','invoice',{id:'v1'},'INV-00001 (Kestrel Computers) matched PO-00001 and GRN-00001 — ready to pay',D(-8,12));
  N('u-proc','requisition',reqs.r110,'R-00110 is fully approved — ready for sourcing / PO',D(-19,12),true);
  N('u-proc','contract',{id:'ct1'},'CT-00001 Security guarding expires in 45 days',D(0,7));
  N('u-adm','supplier',{id:'s14'},'New supplier registration: Delta Paint & Décor is waiting for prequalification',D(-2,10));
  N('u-s10','rfq',rfq2,'You are invited to quote on RFQ-00002 – Interior repainting',D(-17,10),true);
  N('u-s4','po',po1,'Purchase order PO-00001 issued to Kestrel Computers',D(-17,11),true);
  this.persist();
};
