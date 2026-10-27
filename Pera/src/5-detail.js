  /* ---------------- requisition detail ---------------- */
  reqDetail(){
    const r = Store.byId('requisitions',this.param);
    if (!r || !(can.seeAll(me()) || r.created_by===me().id)) return '<div class="empty">Record not found, or you don\u2019t have access to it.</div>';
    const T = r.kind==='expense'?'expense':'requisition', noun = r.kind==='expense'?'expense':'requisition';
    const u = me(), mine = r.created_by===u.id, stage = reqStage(r);
    const ids = r.approver_ids||[], yes = (r.approvals||[]).filter(a=>a.decision==='approved').length;
    const bud = Store.byId('budgets',r.budget_id), bu = bud?budgetUse(bud):null;
    const pos = posFor(r), q = rfqFor(r), invs = invoicesFor(r), m = matchFor(r);
    const support = (r.attachments||[]).filter(a=>a.kind!=='payment'), payDocs = (r.attachments||[]).filter(a=>a.kind==='payment');
    const trail = Store.all('audit_log').filter(a=>a.entity_id===r.id).sort((a,b)=>a.at.localeCompare(b.at));
    const decideOk = can.decide(u,r);

    // flow strip
    const rv = !!S().review_enabled || r.status==='review' || r.reviewed_at;
    const order = r.kind!=='purchase' ? ['draft','pending','review','to_pay','paid'] : ['draft','pending','review','to_order','sourcing','po_pending','ordered','received','to_pay','paid'];
    const idx = order.indexOf(stage);
    const steps = (r.kind!=='purchase'
      ? [[r.kind==='expense'?'Claim':'Requisition',['draft'],1],['Approval',['pending'],2],['Finance review',['review'],3],['Payment',['to_pay'],4]]
      : [['Requisition',['draft'],1],['Approval',['pending'],2],['Finance review',['review'],3],['Sourcing',['to_order','sourcing'],5],['Purchase order',['po_pending'],6],['Goods received',['ordered'],7],['Invoice',['received'],8],['Payment',['to_pay'],9]]).filter(x=>rv||x[0]!=='Finance review');
    const flow = ['rejected','withdrawn'].includes(r.status) ? '' : `<div class="flow">${steps.map(([l,now,doneAt])=>{
      const skip = l==='Sourcing' && !q && idx>=doneAt;
      const cls = skip ? 'skip' : idx>=doneAt ? 'done' : now.includes(stage) ? 'now' : '';
      return `<div class="st ${cls}"><b>${l}</b><span>${skip?'Not needed':cls==='done'?'Done':cls==='now'?'In progress':'—'}</span></div>`; }).join('')}</div>`;

    let banner='';
    const B = (tone, text, actions) => `<div class="banner ${tone}"><span class="grow">${text}</span>${actions||''}</div>`;
    if (r.status==='draft') banner = B('blue','<b>Draft.</b> Approvers are not notified until you submit.', mine?btn('Edit','data-act="req-edit"','sm')+btn('Submit for approval','data-act="req-submit"','sm primary'):'');
    else if (r.status==='pending') banner = B('amber',`<b>Waiting for approval — ${stagesOf(r).length>1&&currentStage(r)>=0?'step '+(currentStage(r)+1)+' of '+stagesOf(r).length+', '+esc(stagesOf(r)[currentStage(r)].label):yes+' of '+r.approvals_required+' required'}</b> (${esc(r.tier_label)} tier) · ${slaPill(r)} ${decideOk?'Your decision is needed.':(r.approvals||[]).some(a=>a.approver_id===u.id)?'You have recorded your decision.':''}`, mine?btn('Withdraw','data-act="req-withdraw"','sm'):'');
    else if (r.status==='review') banner = B('amber',`<b>Approved — waiting for Finance review</b> before release. Finance checks the budget line, documents and payee details.`, can.review(u)?btn('Return','data-act="review" data-ok="0" data-t="requisitions"','sm danger')+btn('Release','data-act="review" data-ok="1" data-t="requisitions"','sm primary'):'');
    else if (r.status==='rejected') banner = B('red',`<b>Rejected.</b> ${esc(((r.approvals||[]).find(a=>a.decision==='rejected')||{}).comment||'')}`, mine?btn('Revise & resubmit as new','data-act="req-revise"','sm'):'');
    else if (r.status==='withdrawn') banner = B('blue','<b>Withdrawn</b> by the requisitioner. Kept on record for audit.');
    else if (r.status==='paid') banner = B('green',`<b>Paid</b> on ${fmtDate(r.payment.paid_on)} · ref <span class="mono">${esc(r.payment.reference)}</span> · by ${esc(r.payment.paid_by_name)}`);
    else {
      const acts = [];
      const pp = posPending(r)[0];
      if (stage==='po_pending') acts.push(btn('Open '+pp.number,'data-open="po:'+pp.id+'"','sm'));
      if (stage==='to_order' && can.procure(u)){ if (mod('rfq')) acts.push(btn('Start RFQ','data-act="rfq-new" data-id="'+r.id+'"','sm')); acts.push(btn('Raise purchase order','data-act="po-new" data-id="'+r.id+'"','sm primary')); }
      if (stage==='sourcing'){ acts.push(btn('Open '+q.number,'data-open="rfq:'+q.id+'"','sm')); if (q.status==='awarded' && can.procure(u)) acts.push(btn('Raise PO from award','data-act="po-new" data-id="'+r.id+'"','sm primary')); }
      if (stage==='ordered') pos.filter(p=>can.receive(u,p)&&['issued','partially_received'].includes(p.status)).forEach(p=>acts.push(btn('Record goods received','data-act="grn-new" data-id="'+p.id+'"','sm primary')));
      if ((stage==='received' || (stage==='ordered'&&!S().require_grn)) && can.finance(u)) acts.push(btn('Capture invoice','data-act="inv-new" data-id="'+pos[0].id+'"','sm primary'));
      if (stage==='to_pay' && can.finance(u)) acts.push(btn('Record payment','data-act="pay" data-id="'+r.id+'"','sm primary'));
      const txt = {po_pending:'<b>Purchase order '+esc((pp||{}).number||'')+' is '+((POSTATE[(pp||{}).status]||[''])[0]).toLowerCase()+'.</b>', to_order:'<b>Approved.</b> Procurement to source and order.', sourcing:'<b>Approved — sourcing.</b> '+(q?esc(q.number)+' is '+rfqState(q)[0].toLowerCase()+'.':''), ordered:'<b>Ordered.</b> Waiting for delivery against '+esc(pos.map(p=>p.number).join(', '))+'.', received:'<b>Goods received.</b> Waiting for the supplier’s invoice.', to_pay: r.kind!=='purchase'?'<b>Approved.</b> Released to Finance for '+(r.kind==='expense'?'reimbursement.':'payment.'):'<b>Ready to pay.</b> Invoice captured'+(m&&m.invOk?' and matched.':' — check the match below.')}[stage];
      banner = B(stage==='to_pay'?'amber':'blue', txt, acts.join(''));
    }

    const payee = r.supplier_id ? `<button class="link" data-open="supplier:${r.supplier_id}">${esc(Store.supName(r.supplier_id))}</button>` : esc(r.payee||'—');
    const ct = Store.byId('contracts',r.contract_id);
    const pend = posPending(r);
    const linked = r.kind==='purchase' && (q || pos.length || pend.length) ? panel('Sourcing, orders & invoices','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
        ${q?`<div><b>RFQ</b> <button class="link mono" data-open="rfq:${q.id}">${esc(q.number)}</button> · ${pill(...rfqState(q))} · ${bidsFor(q).length} bid(s)${q.awarded_bid_id?' · awarded to '+esc(Store.supName(Store.byId('bids',q.awarded_bid_id).supplier_id)):''}</div>`:''}
        ${pend.concat(pos).map(p=>`<div><b>PO</b> <button class="link mono" data-open="po:${p.id}">${esc(p.number)}</button> · ${pill(...POSTATE[p.status])} · ${fmtMoney(p.currency,p.total)} · ${receiptsFor(p).map(g=>esc(g.number)).join(', ')||'no receipts yet'}</div>`).join('')}
        ${invs.map(v=>`<div><b>Invoice</b> <span class="mono">${esc(v.number)}</span> (${esc(v.supplier_invoice_no)}) · ${fmtMoney(v.currency,v.amount)} · ${pill(v.status==='paid'?'Paid':'Captured',v.status==='paid'?'t-green':'t-blue')} ${btn('View',`data-view="invoices:${v.id}:${(v.attachments[0]||{}).id}"`,'sm ghost')}</div>`).join('')}
        ${m?`<div class="match"><div class="ok"><span>Ordered (PO)</span><b>${num(m.ordered)}</b></div><div class="${m.recOk?'ok':m.received?'bad':''}"><span>Received (GRN)</span><b>${num(m.received)}</b></div><div class="${m.invoiced?(m.invOk?'ok':'bad'):''}"><span>Invoiced</span><b>${num(m.invoiced)}</b></div></div><p class="faint" style="margin:0;font-size:12.5px">3-way match: invoice must agree with ${S().require_grn?'what was received':'the PO'} within ${S().match_tolerance_pct||0}%.</p>`:''}
      </div>`) : '';
    return `
      <div>${btn('Back','data-act="back"','sm ghost','back')}</div>
      <div class="print-only print-head">${brandMark()}<div><b>${esc(S().company||'')}</b><span>${r.kind==='expense'?'Expense claim':'Requisition'} ${esc(r.number)} · ${esc((STAGE[stage]||[r.status])[0])} · printed ${fmtDT(nowISO())} by ${esc(u.name)}</span></div></div>
      ${pageHead(esc(r.title), `${esc(Store.user(r.created_by).name)} · ${esc(r.department||'')} · ${esc(branchName(r.branch_id))} · created ${fmtDT(r.created_at)}`, stagePill(r)+' '+btn('Duplicate','data-act="duplicate" data-id="'+r.id+'"','sm','copy')+' '+btn('PDF','data-act="req-print"','sm','print'), esc(r.number)+' · '+esc(r.kind==='payment'?'Direct payment':r.kind==='expense'?'Expense claim':'Purchase'))}
      ${flow}${banner}${this.reqWarnings(r)}
      <div class="detail">
        <div class="stack">
          ${panel('Details','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:16px"><div class="kv">
              <div><span>${r.kind==='expense'?'Payee (reimburse to)':'Supplier / payee'}</span><b>${payee}</b></div>${r.kind==='expense'?`<div><span>Expense date</span><b>${fmtDate(r.expense_date)}</b></div>`:''}<div><span>Category</span><b>${esc(Store.catName(r.category_id))}</b></div>
              <div><span>Budget line</span><b>${bud?esc(bud.code+' – '+bud.name):'—'}</b></div><div><span>Payment method</span><b>${esc(r.payment_method||'—')}</b></div>
              <div><span>Due date</span><b class="${isOverdue(r)?'over':''}">${fmtDate(r.due_date)}</b></div><div><span>Contract</span><b>${ct?esc(ct.number+' – '+ct.title):'—'}</b></div>
              <div><span>Submitted</span><b>${fmtDT(r.submitted_at)}</b></div><div><span>Decision</span><b>${fmtDT(r.decided_at)}</b></div>${r.reviewed_at?`<div><span>Finance review</span><b>${esc(r.reviewed_by_name||'')} · ${fmtDT(r.reviewed_at)}</b></div>`:''}
              ${r.kind==='purchase'?`<div><span>Purchaser assigned</span><b>${r.purchaser_id?esc(Store.user(r.purchaser_id).name):'<span class="faint">Not assigned</span>'}${can.procure(u)&&!RQ_CLOSED.includes(r.status)?' '+ibtn('edit','Change purchaser','data-act="purchaser-set"','no-print'):''}</b></div>`:''}
              ${r.pay_from_id||(r.payment&&r.payment.pay_from_name)?`<div><span>Pay from</span><b>${esc(r.payment&&r.payment.pay_from_name||acctLabel(payAccts().find(a=>a.id===r.pay_from_id))||'—')}</b></div>`:''}
              ${r.delivery_address?`<div><span>Delivery address</span><b class="addr">${esc(r.delivery_address)}</b></div>`:''}
              ${r.distribution_address?`<div><span>Distribution address</span><b class="addr">${esc(r.distribution_address)}</b></div>`:''}
            </div>
            ${r.description?`<div><span class="faint" style="font-size:12px;font-weight:700">Justification</span><p style="margin:4px 0 0;white-space:pre-wrap">${esc(r.description)}</p></div>`:''}</div>
            ${tableHTML([{h:'Description',v:l=>esc(l.description)},{h:'Qty',r:1,cls:'num',v:l=>l.qty},{h:'Unit price',r:1,cls:'num',v:l=>fmtMoney(r.currency,l.unit_price)},{h:'Amount',r:1,cls:'num',v:l=>fmtMoney(r.currency,l.qty*l.unit_price)}], r.lines||[])}
            <div class="total-line"><span>Total</span><span class="num">${fmtMoney(r.currency,r.total)}${r.currency!==baseCur()?` <span class="faint" style="font-size:12px">≈ ${baseCur()} ${num(toBase(r.currency,r.total))}</span>`:''}</span></div>`)}
          ${linked}
          ${panel(r.kind==='expense'?'Receipts & supporting documents':'Supporting documents','<span class="faint">'+support.length+' file'+(support.length===1?'':'s')+'</span>',`<div class="panel-b">${fileList(support,'requisitions:'+r.id)}
            ${(mine && ['draft','pending'].includes(r.status)) || can.master(u) ? `<div style="margin-top:12px"><label class="btn sm" for="add-doc">${I.up}Add document</label><input id="add-doc" type="file" multiple hidden data-act="add-doc"></div>`:''}</div>`)}
          ${r.status==='paid'?panel('Payment','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:14px"><div class="kv"><div><span>Reference</span><b class="mono">${esc(r.payment.reference)}</b></div><div><span>Paid on</span><b>${fmtDate(r.payment.paid_on)}</b></div><div><span>Amount</span><b class="num">${fmtMoney(r.currency,r.payment.amount)}</b></div><div><span>Method</span><b>${esc(r.payment.method)}</b></div></div>${r.payment.note?`<p style="margin:0">${esc(r.payment.note)}</p>`:''}${fileList(payDocs,'requisitions:'+r.id)}</div>`):''}
          ${this.commentsPanel(T, r)}
          ${panel('Audit trail','<span class="faint">Every action, time-stamped</span>',`<div class="panel-b timeline">${trail.map(a=>`<div class="ev"><time>${fmtDT(a.at)}</time><div><b>${esc(a.action)}</b> — ${esc(a.user_name)} <span class="muted">${esc(a.details)}</span></div></div>`).join('')||'<span class="faint">No entries.</span>'}</div>`)}
        </div>
        <div class="stack" style="position:sticky;top:76px">
          ${panel('Approvals', ids.length?`<span class="faint">${stagesOf(r).length>1?stagesOf(r).length+' steps':r.approvals_required+' of '+ids.length} · ${esc(r.tier_label)}</span>`:'', `<div class="panel-b" style="padding-top:4px">
            ${ids.length?this.approvalStagesHTML(r) : `<p class="faint" style="margin:10px 0 0">Approvers are assigned when submitted, based on the amount — ${esc(pickTier(r.currency,r.total).label)} tier: ${this.routeText(pickTier(r.currency,r.total), r.created_by)}.</p>`}
            ${decideOk?`<div class="decide no-print"><label class="f" for="d-comment">Comment <span class="faint" style="font-weight:400">(required to reject)</span><textarea id="d-comment" placeholder="Reason, conditions or notes for the requisitioner"></textarea></label>
              <div class="err" id="d-err" hidden></div><div class="row">${btn('Reject','data-act="decide" data-d="rejected"','danger')}${btn('Approve','data-act="decide" data-d="approved"','primary')}</div></div>`:''}
          </div>`)}
          ${bud?panel('Budget position','<span class="faint mono">'+esc(bud.code)+'</span>',`<div class="panel-b" style="display:flex;flex-direction:column;gap:8px;font-size:13px">
            <div style="display:flex;justify-content:space-between"><span class="muted">Budget</span><span class="num">${num(bud.amount)}</span></div>
            <div style="display:flex;justify-content:space-between"><span class="muted">Spent</span><span class="num">${num(bu.spent)}</span></div>
            <div style="display:flex;justify-content:space-between"><span class="muted">Committed (incl. this)</span><span class="num">${num(bu.committed)}</span></div>
            <div style="display:flex;justify-content:space-between;border-top:1px solid var(--line);padding-top:8px"><b>Available</b><b class="num ${bu.available<0?'over':''}">${baseCur()} ${num(bu.available)}</b></div>
            ${bu.available<0?'<div class="note warn">This budget line is over-committed.</div>':''}</div>`):''}
        </div>
      </div>`;
  },

  /* ---------------- RFQ detail ---------------- */
  rfqDetail(){
    const q = Store.byId('rfqs',this.param); if (!q) return '<div class="empty">RFQ not found.</div>';
    const u = me(), vis = bidsVisible(q), bids = bidsFor(q), scored = vis ? scoreBids(q) : [];
    const st = rfqState(q), req = Store.byId('requisitions',q.req_id);
    const awarded = Store.byId('bids',q.awarded_bid_id);
    const po = Store.all('purchase_orders').find(p=>p.rfq_id===q.id);
    const acts = [];
    if (can.procure(u) && q.status==='open'){ acts.push(btn('Record bid','data-act="bid-new" data-id="'+q.id+'"','sm')); if (q.closing_at>nowISO()) acts.push(btn('Close now','data-act="rfq-close"','sm')); acts.push(btn('Cancel RFQ','data-act="rfq-cancel"','sm danger')); }
    if (can.procure(u) && q.status==='awarded' && !po && req) acts.push(btn('Raise PO from award','data-act="po-new" data-id="'+req.id+'"','sm primary'));
    const c = q.criteria||{};
    return `<div>${btn('Back','data-act="back"','sm ghost','back')}</div>
      ${pageHead(esc(q.title), esc(Store.catName(q.category_id))+(req?` · for <button class="link mono" data-open="requisition:${req.id}">${esc(req.number)}</button>`:''), pill(st[0],st[1]), esc(q.number))}
      <div class="banner ${q.status==='awarded'?'green':st[0].startsWith('Closed')?'amber':'blue'}"><span class="grow">${q.status==='awarded'?`<b>Awarded to ${esc(Store.supName(awarded.supplier_id))}</b> for ${fmtMoney(awarded.currency,awarded.amount)}. ${esc(q.award_note||'')} ${po?'Purchase order <button class="link mono" data-open="po:'+po.id+'">'+esc(po.number)+'</button> issued.':''}`
        : q.status==='cancelled'?'<b>Cancelled.</b>' : vis?`<b>Bidding closed ${fmtDT(q.closing_at)}.</b> Score the technical quality of each bid, then award.` : `<b>Open for bids until ${fmtDT(q.closing_at)}.</b> ${q.sealed?'Bids are sealed: amounts stay hidden until closing.':''}`}</span>${acts.join('')}</div>
      <div class="detail">
        <div class="stack">
          ${panel('Bids','<span class="faint">'+bids.length+' of '+(q.invited_ids||[]).length+' invited</span>', bids.length ? (vis ? tableHTML([
              {h:'Supplier',cls:'name',v:x=>`${esc(Store.supName(x.b.supplier_id))}<small>${esc(x.b.notes||'')}</small>`},
              {h:'Amount',r:1,cls:'num',v:x=>fmtMoney(x.b.currency,x.b.amount)},{h:'Delivery',r:1,cls:'num',v:x=>x.b.delivery_days+' d'},
              {h:'Technical (0–100)',r:1,v:x=>can.procure(u)&&q.status!=='awarded'?`<input type="number" min="0" max="100" value="${x.b.technical_score||0}" data-tech="${x.b.id}" style="width:80px;text-align:right" aria-label="Technical score">`:`<span class="num">${x.b.technical_score||0}</span>`},
              {h:`Score <span class="faint" style="font-weight:400">(P${c.price}/D${c.delivery}/T${c.technical})</span>`,r:1,cls:'num',v:x=>`<b>${x.total.toFixed(1)}</b>`},
              {h:'',r:1,v:x=>`${btn('Quote',`data-view="bids:${x.b.id}:${(x.b.attachments[0]||{}).id}"`,'sm ghost')}${can.procure(u)&&q.status==='open'&&vis?' '+btn('Award',`data-act="award" data-id="${x.b.id}"`,'sm primary'):''}${q.awarded_bid_id===x.b.id?' '+pill('Awarded','t-green'):''}`}
            ], scored, {rowCls:x=>x===scored[0]?'best':''}) + `<div class="tfoot"><span>Highest score is highlighted. Price and delivery scores are relative to the best bid; technical is scored by the evaluation panel.</span></div>`
            : tableHTML([{h:'Supplier',cls:'name',v:b=>esc(Store.supName(b.supplier_id))},{h:'Received',cls:'nw',v:b=>fmtDT(b.submitted_at)},{h:'Amount',r:1,v:()=>'<span class="faint">Sealed</span>'}], bids))
            : '<div class="empty">No bids received yet.</div>')}
          ${panel('Requirement','',`<div class="panel-b"><p style="margin:0 0 12px;white-space:pre-wrap">${esc(q.description||'')}</p>${tableHTML([{h:'Item',v:l=>esc(l.description)},{h:'Qty',r:1,cls:'num',v:l=>l.qty}], q.lines||[])}<div style="margin-top:12px">${fileList(q.attachments||[],'rfqs:'+q.id)}</div></div>`)}
          ${this.commentsPanel('rfq',q)}
          ${panel('Audit trail','',`<div class="panel-b timeline">${Store.all('audit_log').filter(a=>a.entity_id===q.id).sort((a,b)=>a.at.localeCompare(b.at)).map(a=>`<div class="ev"><time>${fmtDT(a.at)}</time><div><b>${esc(a.action)}</b> — ${esc(a.user_name)} <span class="muted">${esc(a.details)}</span></div></div>`).join('')}</div>`)}
        </div>
        <div class="stack">
          ${panel('Invited suppliers','',`<div class="list">${(q.invited_ids||[]).map(id=>{ const b=bids.find(x=>x.supplier_id===id); return `<button class="li" data-open="supplier:${id}"><div class="t"><b>${esc(Store.supName(id))}</b><span>${b?'Bid received '+fmtDT(b.submitted_at):'No bid yet'}</span></div>${b?pill('Bid in','t-green'):pill('Waiting','t-grey')}</button>`; }).join('')}</div>`)}
          ${panel('Evaluation criteria','',`<div class="panel-b">${barRows([['Price',+c.price||0],['Delivery time',+c.delivery||0],['Technical / quality',+c.technical||0]], v=>v+'%','c')}</div>`)}
        </div>
      </div>`;
  },

  /* ---------------- PO detail (printable) ---------------- */
  poDetail(){
    const p = Store.byId('purchase_orders',this.param); if (!p) return '<div class="empty">Purchase order not found.</div>';
    const u = me(), req = Store.byId('requisitions',p.req_id), s = Store.sup(p.supplier_id) || {};
    const grns = receiptsFor(p), invs = Store.all('invoices').filter(v=>v.po_id===p.id);
    const acts = [btn('Print / save PDF','data-act="print"','sm','print')];
    if (['issued','partially_received'].includes(p.status) && can.receive(u,p)) acts.push(btn('Record goods received','data-act="grn-new" data-id="'+p.id+'"','sm primary'));
    if (['received','partially_received','issued'].includes(p.status) && can.finance(u) && (!S().require_grn || p.status!=='issued')) acts.push(btn('Capture invoice','data-act="inv-new" data-id="'+p.id+'"','sm'));
    if (['issued','draft','pending_approval','review'].includes(p.status) && can.procure(u) && !grns.length) acts.push(btn('Cancel PO','data-act="po-cancel"','sm danger'));
    const B = (tone, text, a) => `<div class="banner ${tone} no-print"><span class="grow">${text}</span>${a||''}</div>`;
    const yes = (p.approvals||[]).filter(a=>a.decision==='approved').length;
    const banner = p.status==='draft' ? B('blue','<b>Draft.</b> Not yet sent for approval — the supplier cannot see it.', can.procure(u)?btn('Edit','data-act="po-edit" data-id="'+p.id+'"','sm')+btn((S().po_approval||{}).enabled?'Submit for approval':'Issue to supplier','data-act="po-submit"','sm primary'):'')
      : p.status==='pending_approval' ? B('amber',`<b>Waiting for approval — ${yes} of ${p.approvals_required} required.</b> ${can.decide(u,p)?'Your decision is needed (see Approvals below).':''}`)
      : p.status==='review' ? B('amber','<b>Approved — waiting for Finance review</b> before it is issued to the supplier.', can.review(u)?btn('Return','data-act="review" data-ok="0" data-t="purchase_orders"','sm danger')+btn('Release & issue','data-act="review" data-ok="1" data-t="purchase_orders"','sm primary'):'')
      : p.status==='rejected' ? B('red','<b>Rejected.</b> '+esc(((p.approvals||[]).find(a=>a.decision==='rejected')||{}).comment||p.review_note||''))
      : p.status==='cancelled' ? B('blue','<b>Cancelled.</b> Kept on record for audit.') : '';
    const notIssued = ['draft','pending_approval','review','rejected'].includes(p.status);
    return `<div class="no-print">${btn('Back','data-act="back"','sm ghost','back')}</div>
      ${pageHead('Purchase order '+esc(p.number), `${esc(s.name||'')}${req?` · from <button class="link mono" data-open="requisition:${req.id}">${esc(req.number)}</button>`:''}`, pill(...(POSTATE[p.status]||[p.status,'t-grey']))+' '+acts.join(''))}
      ${banner}
      <div class="po-doc ${notIssued?'unissued':''}">${notIssued?`<div class="watermark">${esc((POSTATE[p.status]||[''])[0].toUpperCase())}</div>`:''}
        <div style="display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap"><div style="display:flex;gap:10px;align-items:center"><span style="width:40px;height:40px;border-radius:8px;background:#232F3E;color:#fff;display:grid;place-items:center;font-weight:800;font-size:18px;flex:none">${esc((S().company||'?').trim()[0]||'?')}</span><div><b style="font-size:16px">${esc(S().company||'')}</b><div style="font-size:12.5px;color:#545B64">${esc(S().delivery_address||'')}</div></div></div>
          <div style="text-align:right"><h2>PURCHASE ORDER</h2><div class="mono">${esc(p.number)}</div><div style="font-size:12.5px;color:#545B64">${notIssued?'Created':'Issued'} ${fmtDate(p.created_at)}</div></div></div>
        <div class="kv"><div><span style="color:#545B64">Supplier</span><b>${esc(s.name||'')}</b><div style="font-size:12.5px">${esc(s.address||'')}<br>${esc(s.contact||'')} · ${esc(s.phone||'')}<br>${esc(s.email||'')}</div></div>
          <div><span style="color:#545B64">Deliver to</span><b>${esc(p.delivery_address||'')}</b></div><div><span style="color:#545B64">Delivery by</span><b>${fmtDate(p.delivery_date)}</b></div>
          <div><span style="color:#545B64">Reference</span><b>${req?esc(req.number):''}${p.contract_id?' · '+esc((Store.byId('contracts',p.contract_id)||{}).number||''):''}${p.rfq_id?' · '+esc((Store.byId('rfqs',p.rfq_id)||{}).number||''):''}</b></div></div>
        ${tableHTML([{h:'#',v:l=>p.lines.indexOf(l)+1},{h:'Description',v:l=>esc(l.description)},{h:'Qty',r:1,cls:'num',v:l=>l.qty},{h:'Unit price',r:1,cls:'num',v:l=>num(l.unit_price)},{h:'Amount',r:1,cls:'num',v:l=>num(l.qty*l.unit_price)},{h:'Received',r:1,cls:'num',v:l=>{const i=p.lines.indexOf(l); return sum(grns,g=>(g.lines[i]||{}).received);}}], p.lines)}
        <div class="total-line" style="border-color:#16191F"><span>Total (${esc(p.currency)})</span><span class="num">${num(p.total)}</span></div>
        <p style="margin:0;font-size:12.5px;color:#545B64"><b>Terms.</b> ${esc(p.terms||'')}</p>
        <div style="display:flex;gap:40px;flex-wrap:wrap;font-size:12.5px;color:#545B64"><div>Authorised by: <b style="color:#16191F">${esc(Store.user(p.created_by).name)}</b></div>${req?`<div>Approved by: <b style="color:#16191F">${esc((req.approvals||[]).filter(a=>a.decision==='approved').map(a=>a.approver_name).join(', '))}</b></div>`:''}</div>
      </div>
      <div class="two no-print">
        ${panel('Goods received','',tableHTML([{h:'GRN',cls:'mono',v:g=>esc(g.number)},{h:'Date',cls:'nw',v:g=>fmtDate(g.received_on)},{h:'By',v:g=>esc(g.received_by_name)},{h:'Condition',v:g=>pill(g.condition,g.condition==='Good'?'t-green':'t-amber')},{h:'',r:1,v:g=>(g.attachments||[]).length?btn('Delivery note',`data-view="receipts:${g.id}:${g.attachments[0].id}"`,'sm ghost'):''}], grns, {empty:'Nothing received yet.'}))}
        ${panel('Invoices','',tableHTML([{h:'Invoice',cls:'mono',v:v=>esc(v.number)},{h:'Supplier ref',cls:'mono',v:v=>esc(v.supplier_invoice_no)},{h:'Amount',r:1,cls:'num',v:v=>fmtMoney(v.currency,v.amount)},{h:'Status',v:v=>pill(v.status==='paid'?'Paid':'Captured',v.status==='paid'?'t-green':'t-blue')},{h:'',r:1,v:v=>btn('View',`data-view="invoices:${v.id}:${(v.attachments[0]||{}).id}"`,'sm ghost')}], invs, {empty:'No invoices yet.'}))}
      </div>
      <div class="two no-print">${this.approvalsPanel('purchase_orders',p)}${this.commentsPanel('po',p)}</div>
      ${panel('Audit trail','',`<div class="panel-b timeline">${Store.all('audit_log').filter(a=>a.entity_id===p.id).sort((a,b)=>a.at.localeCompare(b.at)).map(a=>`<div class="ev"><time>${fmtDT(a.at)}</time><div><b>${esc(a.action)}</b> — ${esc(a.user_name)} <span class="muted">${esc(a.details)}</span></div></div>`).join('')}</div>`,'no-print')}`;
  },

  /* ---------------- shared approvals panel (POs, contracts) ---------------- */
  approvalsPanel(table, rec){
    const ids = rec.approver_ids||[], u = me();
    return panel('Approvals', ids.length?`<span class="faint">${rec.approvals_required} of ${ids.length} required</span>`:'', `<div class="panel-b" style="padding-top:4px">
      ${ids.length?ids.map(id=>{ const x=Store.user(id), a=(rec.approvals||[]).find(v=>v.approver_id===id);
        return `<div class="approver"><div class="avatar">${esc(initials(x.name))}</div><div class="t"><b>${esc(x.name)}</b><span>${esc(x.title||'')}${a?' · '+fmtDT(a.at):''}${a&&a.by_name?' · by '+esc(a.by_name)+' (delegate)':(!a&&delegActive(x)?' · delegated to '+esc(Store.user(x.delegate_to).name)+(x.delegate_until?' until '+fmtDate(x.delegate_until):''):'')}</span>${a&&a.comment?`<q>${esc(a.comment)}</q>`:''}</div>
          ${a?`<span class="stamp ${a.decision==='approved'?'t-green':'t-red'}">${a.decision}</span>`:['pending','pending_approval'].includes(rec.status)?'<span class="stamp t-grey">Waiting</span>':'<span class="stamp t-grey">—</span>'}</div>`; }).join('') : '<p class="faint" style="margin:10px 0 0">Approvers are assigned when it is submitted.</p>'}
      ${rec.reviewed_at?`<div class="approver"><div class="avatar">${esc(initials(rec.reviewed_by_name||''))}</div><div class="t"><b>${esc(rec.reviewed_by_name||'')}</b><span>Finance review · ${fmtDT(rec.reviewed_at)}</span>${rec.review_note?`<q>${esc(rec.review_note)}</q>`:''}</div><span class="stamp t-green">Reviewed</span></div>`:''}
      ${can.decide(u,rec)?`<div class="decide"><label class="f" for="d-comment">Comment <span class="faint" style="font-weight:400">(required to reject)</span><textarea id="d-comment"></textarea></label><div class="err" id="d-err" hidden></div><div class="row">${btn('Reject','data-act="decide" data-d="rejected" data-t="'+table+'"','danger')}${btn('Approve','data-act="decide" data-d="approved" data-t="'+table+'"','primary')}</div></div>`:''}
    </div>`);
  },

  /* ---------------- contract detail ---------------- */
  contractDetail(){
    const c = Store.byId('contracts',this.param); if (!c) return '<div class="empty">Contract not found.</div>';
    const u = me(), st = contractState(c);
    const reqs = Store.all('requisitions').filter(r=>r.contract_id===c.id), pos = Store.all('purchase_orders').filter(p=>p.contract_id===c.id);
    const used = baseSum(reqs.filter(r=>['approved','paid'].includes(r.status)));
    const B = (tone, text, a) => `<div class="banner ${tone}"><span class="grow">${text}</span>${a||''}</div>`;
    const yes = (c.approvals||[]).filter(a=>a.decision==='approved').length;
    const banner = c.status==='draft' ? B('blue','<b>Draft.</b> Submit it for approval before it can be used.', can.procure(u)?btn('Edit','data-act="ct-edit" data-id="'+c.id+'"','sm')+btn('Submit for approval','data-act="ct-submit"','sm primary'):'')
      : c.status==='pending' ? B('amber',`<b>Waiting for approval — ${yes} of ${c.approvals_required} required.</b> ${can.decide(u,c)?'Your decision is needed.':''}`)
      : c.status==='rejected' ? B('red','<b>Rejected.</b> '+esc(((c.approvals||[]).find(a=>a.decision==='rejected')||{}).comment||''))
      : st[0].startsWith('Expires') ? B('amber','<b>'+esc(st[0])+'.</b> Plan the renewal or re-tender now.', can.procure(u)?btn('Renew / extend','data-act="ct-edit" data-id="'+c.id+'"','sm'):'')
      : st[0]==='Expired' ? B('red','<b>Expired</b> on '+fmtDate(c.end_date)+'.', can.procure(u)?btn('Renew / extend','data-act="ct-edit" data-id="'+c.id+'"','sm'):'') : '';
    return `<div>${btn('Back','data-act="back"','sm ghost','back')}</div>
      ${pageHead(esc(c.title), `<button class="link" data-open="supplier:${c.supplier_id}">${esc(Store.supName(c.supplier_id))}</button> · ${esc(c.type)} · ${esc(branchName(c.branch_id))}`, pill(...st)+(can.procure(u)&&c.status==='active'?' '+btn('Terminate','data-act="ct-terminate"','sm danger'):''), esc(c.number))}
      ${banner}
      <div class="detail">
        <div class="stack">
          ${panel('Details','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:14px"><div class="kv">
            <div><span>Start</span><b>${fmtDate(c.start_date)}</b></div><div><span>End</span><b>${fmtDate(c.end_date)}</b></div>
            <div><span>Value</span><b class="num">${fmtMoney(c.currency,c.value)}</b></div><div><span>Used (approved + paid)</span><b class="num">${baseCur()} ${num(used)}${c.value?' · '+Math.round(used/toBase(c.currency,c.value)*100)+'%':''}</b></div>
            <div><span>Created by</span><b>${esc(Store.user(c.created_by).name)}</b></div><div><span>Created</span><b>${fmtDT(c.created_at)}</b></div></div>
            ${c.notes?`<p style="margin:0;white-space:pre-wrap">${esc(c.notes)}</p>`:''}</div>`)}
          ${panel('Documents','',`<div class="panel-b">${fileList(c.attachments||[],'contracts:'+c.id)}</div>`)}
          ${panel('Call-offs against this contract','',tableHTML([{h:'Record',cls:'mono',v:x=>esc(x.number)},{h:'Description',cls:'name',v:x=>esc(x.title||x.lines.map(l=>l.description).join(', '))},{h:'Status',v:x=>x.lines&&x.delivery_address!==undefined?pill(...POSTATE[x.status]):stagePill(x)},{h:'Amount',r:1,cls:'num',v:x=>fmtMoney(x.currency,x.total)}], reqs.concat(pos), {open:x=>(x.delivery_address!==undefined?'po':'requisition')+':'+x.id, empty:'Nothing has been called off yet.'}))}
          ${this.commentsPanel('contract',c)}
          ${panel('Audit trail','',`<div class="panel-b timeline">${Store.all('audit_log').filter(a=>a.entity_id===c.id).sort((a,b)=>a.at.localeCompare(b.at)).map(a=>`<div class="ev"><time>${fmtDT(a.at)}</time><div><b>${esc(a.action)}</b> — ${esc(a.user_name)} <span class="muted">${esc(a.details)}</span></div></div>`).join('')}</div>`)}
        </div>
        <div class="stack">${this.approvalsPanel('contracts',c)}</div>
      </div>`;
  },

  /* ---------------- request detail ---------------- */
  requestDetail(){
    const r = Store.byId('requests',this.param); if (!r) return '<div class="empty">Request not found.</div>';
    const u = me(), mine = r.created_by===u.id, staff = can.procure(u) || r.assigned_to===u.id;
    const items = (r.items||[]).map(i=>Object.assign({}, i, {it:Store.byId('items',i.item_id)}));
    const fromStock = items.length && items.every(i=>i.it && i.it.track_stock && i.it.stock_qty>=i.qty);
    const B = (tone, text, a) => `<div class="banner ${tone}"><span class="grow">${text}</span>${a||''}</div>`;
    const req = Store.byId('requisitions',r.req_id);
    let banner = '';
    if (r.status==='draft') banner = B('blue','<b>Draft.</b> Procurement is not notified until you submit.', mine?btn('Edit','data-act="rq-edit"','sm')+btn('Submit','data-act="rq-submit"','sm primary'):'');
    else if (r.status==='pending') banner = B('amber','<b>Waiting for Procurement</b> to accept and assign it.', (can.procure(u)?btn('Accept & assign','data-act="rq-accept"','sm primary'):'')+(mine||can.procure(u)?btn('Cancel request','data-act="rq-cancel"','sm danger'):''));
    else if (r.status==='open') banner = B('blue',`<b>Open</b> — assigned to ${esc(Store.user(r.assigned_to).name)}.${req?' Requisition <button class="link mono" data-open="requisition:'+req.id+'">'+esc(req.number)+'</button> is '+esc((STAGE[reqStage(req)]||[''])[0].toLowerCase())+'.':''}`,
      staff?(fromStock&&can.procure(u)?btn('Issue from stores','data-act="rq-issue"','sm primary'):'')+(!req&&can.procure(u)?btn('Convert to requisition','data-act="rq-convert"','sm'):'')+btn('Mark completed','data-act="rq-complete"','sm')+btn('Cancel','data-act="rq-cancel"','sm danger'):'');
    else if (r.status==='scheduled') banner = B('blue',`<b>Scheduled — ${esc(RECURRENCE[r.recurrence].toLowerCase())}.</b> Next request will be created on ${fmtDate(r.next_run)}.`, (mine||can.procure(u))?btn('Create one now','data-act="rq-run"','sm')+btn('Edit schedule','data-act="rq-edit"','sm')+btn('Stop schedule','data-act="rq-cancel"','sm danger'):'');
    else if (r.status==='completed') banner = B('green',`<b>Completed</b> ${fmtDT(r.completed_at)}. ${esc(r.resolution||'')}`);
    else if (r.status==='cancelled') banner = B('blue','<b>Cancelled.</b> '+esc(r.resolution||''));
    const children = Store.all('requests').filter(x=>x.parent_id===r.id);
    return `<div>${btn('Back','data-act="back"','sm ghost','back')}</div>
      ${pageHead(esc(r.title), `${esc(Store.user(r.created_by).name)} · ${esc(r.department||'')} · ${esc(branchName(r.branch_id))} · created ${fmtDT(r.created_at)}`, pill(...(REQ_STATUS[r.status]||[r.status,'t-grey']))+' '+btn('Duplicate','data-act="rq-dup" data-id="'+r.id+'"','sm','copy'), esc(r.number)+' · '+esc(r.type))}
      ${banner}
      <div class="detail">
        <div class="stack">
          ${panel('Details','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:14px"><div class="kv">
            <div><span>Type</span><b>${esc(r.type)}</b></div><div><span>Category</span><b>${esc(Store.catName(r.category_id))}</b></div><div><span>Priority</span><b>${esc(r.priority)}</b></div>
            <div><span>Needed by</span><b>${fmtDate(r.needed_by)}</b></div><div><span>Assigned to</span><b>${r.assigned_to?esc(Store.user(r.assigned_to).name):'—'}</b></div><div><span>Repeats</span><b>${esc(RECURRENCE[r.recurrence||'none'])}</b></div>
            ${r.parent_id?`<div><span>Created from schedule</span><b><button class="link mono" data-open="request:${r.parent_id}">${esc((Store.byId('requests',r.parent_id)||{}).number||'')}</button></b></div>`:''}</div>
            ${r.description?`<p style="margin:0;white-space:pre-wrap">${esc(r.description)}</p>`:''}</div>
            ${tableHTML([{h:'Item or service',v:i=>esc(i.description)},{h:'Qty',r:1,cls:'num',v:i=>i.qty},{h:'In stores',r:1,cls:'num',v:i=>i.it&&i.it.track_stock?`<span class="${i.it.stock_qty<i.qty?'over':''}">${i.it.stock_qty}</span>`:'<span class="faint">Not stocked</span>'}], items)}`)}
          ${panel('Attachments','',`<div class="panel-b">${fileList(r.attachments||[],'requests:'+r.id)}</div>`)}
          ${children.length?panel('Requests created by this schedule','',tableHTML([{h:'Number',cls:'mono',v:x=>esc(x.number)},{h:'Created',cls:'nw',v:x=>fmtDate(x.created_at)},{h:'Status',v:x=>pill(...REQ_STATUS[x.status])}], children, {open:x=>'request:'+x.id})):''}
          ${this.commentsPanel('request',r)}
          ${panel('Audit trail','',`<div class="panel-b timeline">${Store.all('audit_log').filter(a=>a.entity_id===r.id).sort((a,b)=>a.at.localeCompare(b.at)).map(a=>`<div class="ev"><time>${fmtDT(a.at)}</time><div><b>${esc(a.action)}</b> — ${esc(a.user_name)} <span class="muted">${esc(a.details)}</span></div></div>`).join('')}</div>`)}
        </div>
        <div class="stack">${panel('What happens next','',`<div class="panel-b"><ol style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px;font-size:13px"><li>Procurement accepts the request and assigns someone.</li><li>If the items are in stores, they are issued and stock is reduced.</li><li>If not, it becomes a requisition that goes through approval.</li><li>You are notified when it is completed.</li></ol></div>`)}</div>
      </div>`;
  },

  /* ---------------- supplier detail ---------------- */
  supplierDetail(){
    const s = Store.sup(this.param); if (!s) return '<div class="empty">Supplier not found.</div>';
    const u = me(), rating = supRating(s);
    const pos = Store.all('purchase_orders').filter(p=>p.supplier_id===s.id);
    const paid = Store.all('requisitions').filter(r=>r.supplier_id===s.id && r.status==='paid');
    const cts = Store.all('contracts').filter(c=>c.supplier_id===s.id);
    const avg = k => (s.reviews||[]).length ? sum(s.reviews,r=>r[k])/s.reviews.length : 0;
    const acts = [];
    if (can.procure(u)){
      if (s.status!=='approved') acts.push(btn(s.status==='pending'?'Prequalify':'Reinstate','data-act="sup-status" data-s="approved"','sm primary'));
      if (s.status==='approved') acts.push(btn('Suspend','data-act="sup-status" data-s="suspended"','sm danger'));
      if (s.status!=='blacklisted') acts.push(btn('Blacklist','data-act="sup-status" data-s="blacklisted"','sm danger'));
      if (!supConnected(s)) acts.push(btn('Invite to portal','data-act="sup-invite" data-id="'+s.id+'"','sm'));
      acts.push(btn('Edit','data-act="sup-edit"','sm'));
    }
    return `<div>${btn('Back','data-act="back"','sm ghost','back')}</div>
      ${pageHead(esc(s.name), (s.category_ids||[]).map(c=>esc(Store.catName(c))).join(' · '), pill(...(SUP_STATUS[s.status]||[s.status,'t-grey']))+' '+acts.join(''))}
      ${s.status==='pending'?'<div class="banner amber"><span class="grow"><b>Not yet prequalified.</b> Check the compliance documents below, then prequalify. Requisitions cannot use this supplier until then.</span></div>':''}
      ${supExpired(s).length?`<div class="banner red"><span class="grow"><b>Expired documents:</b> ${supExpired(s).map(d=>esc(d.type)).join(', ')}. Ask the supplier for current copies.</span></div>`:''}
      ${s.notes?`<div class="note">${esc(s.notes)}</div>`:''}
      <div class="detail">
        <div class="stack">
          ${panel('Compliance documents', can.procure(u)?btn('Add document','data-act="sup-doc"','sm',"up"):'', tableHTML([{h:'Document',v:d=>`<b>${esc(d.type)}</b>`},{h:'Status',v:d=>pill(...docState(d))},{h:'Uploaded',cls:'nw',v:d=>d.file?fmtDate(d.file.at)+' · '+esc(d.file.uploaded_by_name):'—'},{h:'',r:1,v:d=>d.file?btn('View',`data-view="suppliers:${s.id}:doc:${d.id}"`,'sm ghost'):''}], s.documents||[], {empty:'No documents yet.'}))}
          ${panel('Performance reviews', `<span>${stars(rating)}</span>`, `${(s.reviews||[]).length?`<div class="panel-b"><div class="kv"><div><span>Quality</span><b class="num">${avg('quality').toFixed(1)} / 5</b></div><div><span>Timeliness</span><b class="num">${avg('timeliness').toFixed(1)} / 5</b></div><div><span>Service</span><b class="num">${avg('service').toFixed(1)} / 5</b></div></div></div>`:''}
            ${tableHTML([{h:'Date',cls:'nw',v:r=>fmtDate(r.at)},{h:'Ref',cls:'mono',v:r=>esc(r.ref||'')},{h:'Q / T / S',cls:'num',v:r=>r.quality+' / '+r.timeliness+' / '+r.service},{h:'Comment',v:r=>esc(r.comment)},{h:'By',v:r=>esc(r.by_name)}], (s.reviews||[]).slice().reverse(), {empty:'No reviews yet. A review is asked for each time goods are received.'})}`)}
          ${panel('Orders','<span class="faint">'+pos.length+'</span>',tableHTML([{h:'PO',cls:'mono',v:p=>esc(p.number)},{h:'Status',v:p=>pill(...POSTATE[p.status])},{h:'Issued',cls:'nw',v:p=>fmtDate(p.created_at)},{h:'Total',r:1,cls:'num',v:p=>fmtMoney(p.currency,p.total)}], pos, {open:p=>'po:'+p.id, empty:'No orders yet.'}))}
        </div>
        <div class="stack">
          ${panel('Profile','',`<div class="panel-b kv" style="grid-template-columns:1fr">
            <div><span>Supplier portal</span><b>${supConnected(s)?pill('Connected','t-green')+' '+Store.all('app_users').filter(x=>x.role==='supplier'&&x.supplier_id===s.id).map(x=>esc(x.email)).join(', '):pill('Not connected','t-amber')}</b></div>
            <div><span>Supplier category</span><b>${(s.supplier_category_ids||[]).map(c=>esc(Store.catName(c))).join(', ')||'—'}</b></div>
            <div><span>Main contact</span><b>${esc(s.contact||'—')}</b></div><div><span>Phone</span><b>${esc(s.phone||'—')}</b></div><div><span>Email</span><b>${esc(s.email||'—')}</b></div>
            <div><span>Address</span><b>${esc([s.address,s.country].filter(Boolean).join(', '))}</b></div><div><span>Registration no.</span><b class="mono">${esc(s.registration_no||'—')}</b></div><div><span>Tax number</span><b class="mono">${esc(s.tax_number||'—')}</b></div>
            <div><span>Bank details</span><b>${esc(s.bank_details||'—')}</b></div><div><span>Last edited</span><b>${fmtDT(s.updated_at||s.created_at)}</b></div><div><span>Tags</span><b>${(s.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')||'—'}</b></div></div>`)}
          ${panel('Spend & contracts','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:8px"><div style="display:flex;justify-content:space-between"><span class="muted">Paid to date</span><b class="num">${baseCur()} ${num(baseSum(paid,r=>r.payment.amount))}</b></div>${cts.map(c=>`<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><span><span class="mono">${esc(c.number)}</span> ${esc(c.title)}</span>${pill(...contractState(c))}</div>`).join('')||'<span class="faint">No contracts.</span>'}</div>`)}
        </div>
      </div>`;
  },

  /* ---------------- settings ---------------- */
  settingsPage(){
    const s = S(), users = Store.all('app_users');
    const candidates = users.filter(x=>x.active && ['approver','admin','finance','procurement'].includes(x.role));
    const tiers = (s.approval_tiers||[]);
    return `${pageHead('Settings','Company details, approval rules, sourcing rules and who can use Pera.')}
      ${this.modulesPanel()}
      ${panel('Company','',`<div class="panel-b grid-form">
        <label class="f">Company name<input id="s-company" type="text" value="${esc(s.company||'')}"></label>
        <label class="f">Base (reporting) currency<input id="s-base" type="text" value="${esc(s.base_currency||'USD')}"></label>
        <label class="f">Fiscal year<input id="s-fy" type="number" value="${esc(s.fiscal_year||'')}"></label>
        <label class="f span-2">Default delivery address<input id="s-addr" type="text" value="${esc(s.delivery_address||'')}"></label>
        <label class="f span-all">Standard purchase order terms<textarea id="s-terms">${esc(s.po_terms||'')}</textarea></label>
        <div class="f span-all"><span>Departments</span><p class="muted" style="margin:0">${esc(deptList().filter(d=>d.active).map(d=>d.name+(d.code?' ('+d.code+')':'')).join(', ')||'None yet')} — ${btn('Manage departments','data-go="company" data-tab="co:depts"','sm ghost')}</p></div>
        <label class="f span-all">Branches <span class="help">One per line. Records, users, budgets and categories can belong to a branch; managers can switch between branch and company level views.</span><textarea id="s-branches">${esc((s.branches||[]).map(b=>b.name).join('\n'))}</textarea></label>
        <label class="f span-all">Currencies and exchange rates <span class="help">One per line as CODE = units per 1 ${esc(s.base_currency||'USD')}, e.g. ZWG = 26.5</span><textarea id="s-cur">${esc((s.currencies||[]).map(c=>c.code+' = '+c.rate).join('\n'))}</textarea></label>
      </div>`)}
      ${panel('Approval rules','',`<div class="panel-b" style="display:flex;flex-direction:column;gap:14px">
        <p class="muted" style="margin:0">Each requisition is routed by its value in ${esc(s.base_currency||'USD')}. A tier has one or more <b>steps</b>. In each step, the number required must approve — set it lower than the number of people to make a pool (“any 1 of Finance”). Step 2 is asked only after step 1 approves. The route is fixed at submission, so later rule changes don’t affect requisitions already in approval.</p>
        ${tiers.map((t,i)=>{ const step = (sfx, n, st) => `<div class="step-box"><div class="step-top"><b>Step ${n}</b><input type="text" id="t-slabel-${sfx}" value="${esc(st.label||'')}" placeholder="Step name, e.g. Finance" aria-label="Step ${n} name"><label class="chk">Approvals required <input type="number" id="t-req-${sfx}" min="1" value="${st.required||1}" style="width:64px"></label></div>
            <div class="checks" style="border:0;padding:0">${candidates.map(x=>`<label class="chk"><input type="checkbox" class="t-ap-${sfx}" value="${x.id}" ${(st.approver_ids||[]).includes(x.id)?'checked':''}> ${esc(x.name)}</label>`).join('')}</div></div>`;
          return `<div class="tier-card"><div class="step-top"><label class="chk"><b>Tier</b> <input type="text" id="t-label-${i}" value="${esc(t.label)}" style="width:130px"></label><label class="chk">Up to (${esc(s.base_currency||'USD')}) <input type="number" id="t-max-${i}" value="${t.max==null?'':t.max}" placeholder="No limit" style="width:130px"></label></div>
            ${step(i, 1, {label:t.step_label||'Approval', approver_ids:t.approver_ids, required:t.required})}
            ${(t.next_steps||[]).map((st,j)=>step(i+'-'+j, j+2, st)).join('')}
            <div style="display:flex;gap:8px">${btn('Add a step','data-act="step-add" data-i="'+i+'"','sm ghost','plus')}${(t.next_steps||[]).length?btn('Remove last step','data-act="step-del" data-i="'+i+'"','sm ghost'):''}</div></div>`; }).join('')}
        <div style="display:flex;gap:8px;flex-wrap:wrap">${btn('Add tier','data-act="tier-add"','sm','plus')}${tiers.length>1?btn('Remove last tier','data-act="tier-del"','sm'):''}</div>
        ${(()=>{ const box=(key,title,help)=>{ const c=s[key]||{}; return `<div class="sub-rule"><label class="chk"><input type="checkbox" id="${key}-on" ${c.enabled!==false&&c.enabled?'checked':''}> <b>${title}</b></label><span class="faint" style="font-size:12.5px">${help}</span><div class="checks" style="border:0;padding:0">${candidates.map(x=>`<label class="chk"><input type="checkbox" class="${key}-ap" value="${x.id}" ${(c.approver_ids||[]).includes(x.id)?'checked':''}> ${esc(x.name)}</label>`).join('')}</div><label class="chk">Approvals required <input type="number" id="${key}-req" min="1" value="${c.required||1}" style="width:70px"></label></div>`; };
          return box('po_approval','Purchase orders need approval','Before a PO is issued to the supplier.')+box('contract_approval','Contracts need approval','Before a contract becomes active.'); })()}
        ${this.remindersPanel()}
        <label class="chk"><input type="checkbox" id="s-review" ${s.review_enabled?'checked':''}> <b>Finance review after approval</b> — approved requisitions, expenses and POs go to “Pending review” until Finance releases them</label>
        <label class="f" style="max-width:520px">When an approver rejects<select id="s-reject"><option value="veto" ${s.reject_rule!=='count'?'selected':''}>Any single rejection rejects the requisition</option><option value="count" ${s.reject_rule==='count'?'selected':''}>Reject only when the required approvals can no longer be reached</option></select></label>
      </div>`)}
      ${panel('Sourcing, receiving & payment rules','',`<div class="panel-b grid-form">
        <label class="f">Competitive quotes needed above (${esc(s.base_currency||'USD')})<input id="s-qth" type="number" value="${esc(s.quotes_threshold||0)}"></label>
        <label class="f">Number of quotes<input id="s-qn" type="number" value="${esc(s.quotes_required||3)}"></label>
        <label class="f">Invoice match tolerance (%)<input id="s-tol" type="number" step="0.1" value="${esc(s.match_tolerance_pct||0)}"></label>
        <label class="f">Warn before expiry (days)<input id="s-exp" type="number" value="${esc(s.expiry_warning_days||60)}"></label>
        <label class="f">Default purchaser <span class="help">Assigned to purchase requisitions when they are submitted. Procurement can reassign.</span>${selectHTML('id="s-purch"', purchasers().map(u=>[u.id,u.name]), s.default_purchaser_id, 'Nobody (assign by hand)')}</label>
        <label class="f">When a requisition would exceed its budget line<select id="s-budget"><option value="warn" ${s.budget_control!=='block'?'selected':''}>Warn the requester and approvers</option><option value="block" ${s.budget_control==='block'?'selected':''}>Block submission (hard budget cap)</option></select></label>
        <label class="chk"><input type="checkbox" id="s-docs" ${s.require_documents?'checked':''}> Supporting documents required to submit</label>
        <label class="chk"><input type="checkbox" id="s-appr" ${s.approved_suppliers_only?'checked':''}> Only prequalified suppliers can be used</label>
        <label class="chk"><input type="checkbox" id="s-grn" ${s.require_grn?'checked':''}> Goods must be received before an invoice is paid</label>
        <label class="f">Support email (Help center)<input id="s-sup-email" type="text" value="${esc((s.support||{}).email||'')}"></label>
        <label class="f">Support phone<input id="s-sup-phone" type="text" value="${esc((s.support||{}).phone||'')}"></label>
        <label class="f">Support hours<input id="s-sup-hours" type="text" value="${esc((s.support||{}).hours||'')}"></label>
        <div class="span-all">${btn('Save settings','data-act="settings-save"','primary')}</div>
      </div>`)}
      ${(()=>{ const b=s.brand||{}, sso=s.sso||{}; return panel('Branding & sign-in','',`<div class="panel-b grid-form">
        <div class="f span-all"><span>Company logo <span class="help">PNG, JPG or SVG under 300 KB. Shown on the sign-in page, the menu and printed documents.</span></span>
          <div class="brand-prev"><img id="s-logo-prev" class="client-logo" src="${esc(b.logo||'')}" alt="" ${b.logo?'':'hidden'}>
          <input type="file" accept="image/png,image/jpeg,image/svg+xml" onchange="var f=this.files[0];if(!f)return;if(f.size>300000){alert('The logo must be under 300 KB');this.value='';return;}var r=new FileReader();r.onload=function(){document.getElementById('s-logo').value=r.result;var p=document.getElementById('s-logo-prev');p.src=r.result;p.hidden=false;};r.readAsDataURL(f);">
          <button type="button" class="btn sm ghost" onclick="document.getElementById('s-logo').value='';document.getElementById('s-logo-prev').hidden=true;">Remove logo</button></div>
          <input type="hidden" id="s-logo" value="${esc(b.logo||'')}"></div>
        <label class="f">Brand colour<input type="color" id="s-color" value="${esc(b.color||'#1565C0')}" style="height:38px;padding:2px"></label>
        <label class="chk"><input type="checkbox" id="s-color-def" ${b.color?'':'checked'}> Use the standard Pera colours</label>
        <label class="chk span-all"><input type="checkbox" id="s-sso-auto" ${sso.auto_provision?'checked':''}> <b>Microsoft sign-in:</b> add new staff automatically (as Requisitioners) the first time they sign in with an email from the domains below</label>
        <label class="f span-2">Allowed email domains <span class="help">Comma-separated, e.g. zimnat.co.zw. Administrators still set roles and branches.</span><input id="s-sso-domains" type="text" value="${esc((sso.domains||[]).join(', '))}"></label>
      </div>`); })()}
      ${panel('Users', btn('Manage users','data-go="company" data-tab="co:users"','sm primary'), `<div class="panel-b muted">${users.filter(x=>x.active).length} active, ${users.filter(isPendingUser).length} not signed in yet, ${users.filter(x=>!x.active).length} inactive. Add people, set roles and departments, and review dormant logins under <b>Manage company</b>.</div>`)}
      ${LIVE?'':panel('Demo data','',`<div class="panel-b" style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span class="muted" style="flex:1">Clears everything saved in this browser and reloads the sample company.</span>${btn('Reset demo data','data-act="reset-demo"','danger')}</div>`)}`;
  },

  /* ---------------- supplier portal ---------------- */
  portalPage(){
    const u = me(), s = Store.sup(u.supplier_id);
    if (!s) return '<div class="empty">This portal login is not linked to a supplier.</div>';
    const invited = Store.all('rfqs').filter(q=>(q.invited_ids||[]).includes(s.id) && q.status!=='cancelled').sort((a,b)=>b.closing_at.localeCompare(a.closing_at));
    const myBid = q => Store.all('bids').find(b=>b.rfq_id===q.id && b.supplier_id===s.id);
    const pos = Store.all('purchase_orders').filter(p=>p.supplier_id===s.id);
    const invs = Store.all('invoices').filter(v=>v.supplier_id===s.id);
    return `${pageHead('Supplier portal','Welcome, '+esc(s.name)+'. Respond to requests for quotation, track your purchase orders, submit invoices and keep your documents up to date.', pill(...(SUP_STATUS[s.status]||[s.status,'t-grey'])))}
      ${supExpired(s).length?`<div class="banner red"><span class="grow"><b>Please upload current copies:</b> ${supExpired(s).map(d=>esc(d.type)).join(', ')} expired.</span>${btn('Upload document','data-act="sup-doc"','sm')}</div>`:''}
      ${panel('Requests for quotation','',tableHTML([{h:'RFQ',cls:'name',v:q=>`${esc(q.title)}<small class="mono">${esc(q.number)}</small>`},{h:'Closes',cls:'nw',v:q=>fmtDT(q.closing_at)},{h:'Status',v:q=>{ if (q.status==='awarded') return q.awarded_bid_id&&(Store.byId('bids',q.awarded_bid_id)||{}).supplier_id===s.id?pill('You won','t-green'):pill('Awarded to another supplier','t-grey'); return q.closing_at<=nowISO()?pill('Closed','t-grey'):pill('Open','t-blue'); }},
        {h:'Your quote',v:q=>{const b=myBid(q); return b?`<span class="num">${fmtMoney(b.currency,b.amount)}</span> <span class="faint">· ${b.delivery_days} d</span>`:'<span class="faint">Not submitted</span>';}},
        {h:'',r:1,v:q=>q.status==='open'&&q.closing_at>nowISO()?btn(myBid(q)?'Revise quote':'Submit quote',`data-act="portal-bid" data-id="${q.id}"`,'sm primary'):''}], invited, {empty:'No invitations yet.'}))}
      ${panel('Your purchase orders','',tableHTML([{h:'PO',cls:'mono',v:p=>esc(p.number)},{h:'Items',v:p=>esc(p.lines.map(l=>l.qty+' × '+l.description).join('; '))},{h:'Delivery by',cls:'nw',v:p=>fmtDate(p.delivery_date)},{h:'Status',v:p=>pill(...POSTATE[p.status])},{h:'Total',r:1,cls:'num',v:p=>fmtMoney(p.currency,p.total)},{h:'',r:1,v:p=>['received','partially_received','issued'].includes(p.status)&&!invs.some(v=>v.po_id===p.id)?btn('Submit invoice',`data-act="inv-new" data-id="${p.id}"`,'sm'):''}], pos, {empty:'No purchase orders yet.'}))}
      ${panel('Your invoices','',tableHTML([{h:'Our ref',cls:'mono',v:v=>esc(v.number)},{h:'Your invoice',cls:'mono',v:v=>esc(v.supplier_invoice_no)},{h:'Date',cls:'nw',v:v=>fmtDate(v.invoice_date)},{h:'Amount',r:1,cls:'num',v:v=>fmtMoney(v.currency,v.amount)},{h:'Status',v:v=>pill(v.status==='paid'?'Paid':'Received – being processed',v.status==='paid'?'t-green':'t-blue')}], invs, {empty:'No invoices yet.'}))}
      ${panel('Your compliance documents', btn('Upload document','data-act="sup-doc"','sm','up'), tableHTML([{h:'Document',v:d=>`<b>${esc(d.type)}</b>`},{h:'Status',v:d=>pill(...docState(d))}], s.documents||[]))}`;
  }
};
