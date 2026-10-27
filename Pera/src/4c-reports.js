  /* ---------------- reports ---------------- */
  reportsPage(){
    const rs = Store.all('requisitions');
    const paid = rs.filter(r=>r.status==='paid');
    const P = r => toBase(r.currency, r.payment?r.payment.amount:r.total);
    const total = sum(paid,P);
    const decided = rs.filter(r=>r.submitted_at && r.decided_at);
    const avgApprove = decided.length ? sum(decided,r=>(new Date(r.decided_at)-new Date(r.submitted_at))/864e5)/decided.length : 0;
    const cycle = paid.filter(r=>r.submitted_at);
    const avgCycle = cycle.length ? sum(cycle,r=>(new Date(r.paid_at)-new Date(r.submitted_at))/864e5)/cycle.length : 0;
    const committedAll = rs.filter(r=>['approved','paid'].includes(r.status));
    const cv = sum(committedAll,r=>toBase(r.currency,r.total))||1;
    const underContract = sum(committedAll.filter(r=>r.contract_id),r=>toBase(r.currency,r.total))/cv*100;
    const competitive = sum(committedAll.filter(r=>rfqFor(r) || (r.attachments||[]).filter(a=>/quot/i.test(a.name)).length>=+S().quotes_required),r=>toBase(r.currency,r.total))/cv*100;
    const local = sum(committedAll.filter(r=>{const s=Store.sup(r.supplier_id); return s && (s.tags||[]).some(t=>['Local supplier','SME','Women-owned','Youth-owned'].includes(t));}),r=>toBase(r.currency,r.total))/cv*100;
    const group = (arr, key) => { const m={}; arr.forEach(r=>{ const k=key(r); m[k]=(m[k]||0)+P(r); }); return Object.entries(m).sort((a,b)=>b[1]-a[1]); };
    const months = []; for (let i=11;i>=0;i--){ const d=new Date(); d.setDate(1); d.setMonth(d.getMonth()-i); months.push(d.toISOString().slice(0,7)); }
    const mv = months.map(m=>[m, sum(paid.filter(r=>(r.paid_at||'').slice(0,7)===m),P)]);
    const mmax = Math.max(1,...mv.map(x=>x[1]));
    const sups = Store.all('suppliers').filter(s=>(s.reviews||[]).length || rs.some(r=>r.supplier_id===s.id)).map(s=>({s, spend:sum(paid.filter(r=>r.supplier_id===s.id),P), rating:supRating(s), orders:Store.all('purchase_orders').filter(p=>p.supplier_id===s.id).length, ontime:(()=>{ const g=Store.all('receipts').filter(x=>{const p=Store.byId('purchase_orders',x.po_id); return p&&p.supplier_id===s.id;}); return g.length? g.filter(x=>x.received_on<=(Store.byId('purchase_orders',x.po_id).delivery_date||x.received_on)).length/g.length*100 : null; })()})).sort((a,b)=>b.spend-a.spend);
    const kpi = (k,v,s) => `<div class="stat" style="cursor:default"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${s}</span></div>`;
    return `${pageHead('Reports','Spend analysis, process speed and supplier performance. Paid amounts converted to '+baseCur()+' at the rates in Settings.', btn('Export spend CSV','data-act="export-spend"','','down'))}
      <div class="stats">
        ${kpi('Total paid spend',fmtK(total),baseCur()+' '+num(total)+' · '+paid.length+' payments')}
        ${kpi('Average approval time',avgApprove.toFixed(1)+' d','From submission to final decision')}
        ${kpi('Average request-to-pay',avgCycle.toFixed(1)+' d','From submission to payment')}
        ${kpi('Spend under contract',underContract.toFixed(0)+'%','Competitively sourced: '+competitive.toFixed(0)+'% · local/SME: '+local.toFixed(0)+'%')}
      </div>
      ${panel('Paid spend by month','<span class="faint">'+baseCur()+', last 12 months</span>',`<div class="panel-b"><div class="cols" role="img" aria-label="Monthly paid spend">${mv.map(([m,v])=>`<div class="c" title="${new Date(m+'-01T00:00:00').toLocaleDateString('en-GB',{month:'long',year:'numeric'})}: ${baseCur()} ${num(v)}"><b>${v?fmtK(v):''}</b><i style="height:${v/mmax*100}%"></i><span>${new Date(m+'-01T00:00:00').toLocaleDateString('en-GB',{month:'short'})}</span></div>`).join('')}</div></div>`)}
      <div class="two">
        ${panel('By department','',`<div class="panel-b">${barRows(group(paid,r=>r.department||'—'),v=>baseCur()+' '+num(v))}</div>`)}
        ${panel('By category','',`<div class="panel-b">${barRows(group(paid,r=>Store.catName(r.category_id)),v=>baseCur()+' '+num(v))}</div>`)}
      </div>
      ${panel('Supplier performance','',tableHTML([{h:'Supplier',cls:'name',v:x=>esc(x.s.name)},{h:'Status',v:x=>pill(...SUP_STATUS[x.s.status])},{h:'Orders',r:1,cls:'num',v:x=>x.orders},{h:'On-time delivery',r:1,cls:'num',v:x=>x.ontime==null?'—':x.ontime.toFixed(0)+'%'},{h:'Rating',v:x=>stars(x.rating)},{h:'Paid spend',r:1,cls:'num',v:x=>num(x.spend)}], sups, {open:x=>'supplier:'+x.s.id}))}`;
  },

  /* ---------------- audit ---------------- */
  auditPage(){
    const f=this.f.audit||{}, q=(f.q||'').toLowerCase();
    const rows = Store.all('audit_log').filter(a=>(!q||[a.entity_number,a.action,a.user_name,a.details].join(' ').toLowerCase().includes(q)) && (!f.type||a.entity_type===f.type)).sort((a,b)=>b.at.localeCompare(a.at));
    this._export = ['audit',rows];
    const types = [...new Set(Store.all('audit_log').map(a=>a.entity_type))].sort();
    return `${pageHead('Audit trail','An append-only record of every create, submit, decision, award, order, receipt, invoice, payment and settings change. Entries cannot be edited or deleted.', btn('Verify integrity','data-act="audit-verify"','')+' '+btn('Export CSV','data-act="export"','','down'))}${this._auditCheck?`<div class="banner ${this._auditCheck.ok?'green':'red'}"><span class="grow">${esc(this._auditCheck.msg)}</span></div>`:''}
      <section class="panel"><div class="filters">${searchBox('audit.q',f.q,'Search number, person or action…')}<select data-filter="audit.type" aria-label="Record type"><option value="">All record types</option>${types.map(t=>`<option ${f.type===t?'selected':''}>${esc(t)}</option>`).join('')}</select><span class="faint">${rows.length} entries</span></div>
      ${tableHTML([{h:'When',cls:'mono nw',v:a=>fmtDT(a.at)},{h:'Record',v:a=>`<span class="faint">${esc(a.entity_type)}</span> <span class="mono">${esc(a.entity_number||'')}</span>`},{h:'Action',v:a=>`<b>${esc(a.action)}</b>`},{h:'By',v:a=>esc(a.user_name)},{h:'Details',v:a=>`<span class="muted">${esc(a.details)}</span>`}], rows, {key:'audit', size:50, open:a=>a.entity_id&&a.entity_number?a.entity_type+':'+a.entity_id:''})}
      </section>`;
  },
