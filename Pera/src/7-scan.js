/* =====================================================================
   SMART SCAN — reads a quote, invoice or receipt (PDF or photo) in the
   browser and pre-fills a requisition, expense or invoice. Rule-based:
   no data leaves the browser and no paid AI service is used.
   ===================================================================== */
const SCAN_LIBS = {
  pdf:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  pdfWorker:'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  ocr:'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js'
};
function loadScript(src){ return new Promise((res,rej)=>{ if ([...document.scripts].some(s=>s.src===src)) return res(); const s=document.createElement('script'); s.src=src; s.onload=res; s.onerror=()=>rej(new Error('Could not load the document reader. Check the internet connection.')); document.head.appendChild(s); }); }
async function extractText(file, progress){
  const isPdf = /pdf/.test(file.type) || /\.pdf$/i.test(file.name);
  const isImg = /^image\//.test(file.type) || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
  if (/^text\//.test(file.type) || /\.(txt|csv)$/i.test(file.name)) return await file.text();
  if (isPdf){
    await loadScript(SCAN_LIBS.pdf);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = SCAN_LIBS.pdfWorker;
    const pdf = await window.pdfjsLib.getDocument({data: new Uint8Array(await file.arrayBuffer())}).promise;
    const out = [];
    for (let p=1; p<=Math.min(pdf.numPages,5); p++){
      progress && progress('Reading page '+p+' of '+pdf.numPages+'…');
      const tc = await (await pdf.getPage(p)).getTextContent();
      // rebuild lines from text items by their vertical position
      const rows = {};
      tc.items.forEach(it=>{ const y = Math.round(it.transform[5]/3); (rows[y]=rows[y]||[]).push([it.transform[4], it.str]); });
      Object.keys(rows).sort((a,b)=>b-a).forEach(y=>out.push(rows[y].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join(' ').replace(/\s+/g,' ').trim()));
    }
    const text = out.filter(Boolean).join('\n');
    if (text.replace(/\s/g,'').length > 20) return text;
    throw new Error('This PDF has no readable text (it is probably a scanned image). Upload a photo or image of it instead so it can be read with text recognition.');
  }
  if (isImg){
    progress && progress('Loading text recognition (first time can take a moment)…');
    await loadScript(SCAN_LIBS.ocr);
    const r = await window.Tesseract.recognize(file, 'eng', {logger: m=>{ if (m.status==='recognizing text') progress && progress('Recognising text… '+Math.round(m.progress*100)+'%'); }});
    return r.data.text;
  }
  throw new Error('Smart scan reads PDF files and images (JPG, PNG).');
}
const MONTHS = {jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,sept:9,oct:10,nov:11,dec:12};
function toISO(d){
  let m = d.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/); if (m) return `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`;
  m = d.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/); if (m){ const y = m[3].length===2 ? '20'+m[3] : m[3]; return `${y}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  m = d.match(/(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})/); if (m && MONTHS[m[2].slice(0,4).toLowerCase()]||m&&MONTHS[m[2].slice(0,3).toLowerCase()]){ const mo = MONTHS[m[2].slice(0,4).toLowerCase()]||MONTHS[m[2].slice(0,3).toLowerCase()]; return `${m[3]}-${String(mo).padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  m = d.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/); if (m && MONTHS[m[1].slice(0,3).toLowerCase()]) return `${m[3]}-${String(MONTHS[m[1].slice(0,3).toLowerCase()]).padStart(2,'0')}-${m[2].padStart(2,'0')}`;
  return '';
}
const AMOUNT = /(?:[A-Z]{3}|US\$|\$|R)?\s?(\d{1,3}(?:[ ,]\d{3})*(?:\.\d{2})|\d+\.\d{2})\b/g;
const toNum = s => +String(s).replace(/[ ,]/g,'');
function parseDoc(text, suppliers, currencies){
  const lines = text.split(/\n/).map(l=>l.replace(/\s+/g,' ').trim()).filter(Boolean);
  const low = text.toLowerCase();
  const out = {supplier_id:'', supplier_text:'', reference:'', date:'', due_date:'', currency:'', total:0, lines:[], kind: /invoice|tax invoice/.test(low) ? 'invoice' : /receipt|till|cash sale/.test(low) ? 'receipt' : /quot|proforma|estimate/.test(low) ? 'quote' : 'document'};
  // supplier: best name match from the supplier list, else the first line with letters
  let best = null;
  suppliers.forEach(s=>{ const n=s.name.toLowerCase(); const words=n.split(/[^a-z0-9]+/).filter(w=>w.length>2); const hit = low.includes(n) ? 100 : words.filter(w=>low.includes(w)).length/Math.max(1,words.length)*80; if (hit>=60 && (!best||hit>best[1])) best=[s,hit]; });
  if (best){ out.supplier_id = best[0].id; out.supplier_text = best[0].name; } else out.supplier_text = (lines.find(l=>/[A-Za-z]{3}/.test(l) && !/invoice|quotation|receipt|tax|date|page/i.test(l))||'').slice(0,80);
  // reference number
  const refs = [...text.matchAll(/(?:invoice|inv|quotation|quote|receipt|ref(?:erence)?|document)[ \t]*(?:no\.?|number|num|#)?[ \t]*[:#\-]?[ \t]*([A-Z0-9][A-Z0-9\-\/]{2,})/gi)].map(m=>m[1]).filter(x=>/\d/.test(x));
  if (refs.length) out.reference = refs[0];
  // dates
  const dateRe = /(\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}|\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}|\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]{3,9}\.?,?\s+\d{4}|[A-Za-z]{3,9}\.?\s+\d{1,2},?\s+\d{4})/g;
  const dueLine = lines.find(l=>/due|payable by|valid until|expiry/i.test(l) && dateRe.test(l)); dateRe.lastIndex=0;
  if (dueLine){ const m = dueLine.match(dateRe); if (m) out.due_date = toISO(m[m.length-1]); }
  const dateLine = lines.find(l=>/date/i.test(l) && !/due|valid/i.test(l) && dateRe.test(l)); dateRe.lastIndex=0;
  const allDates = (text.match(dateRe)||[]).map(toISO).filter(Boolean);
  out.date = dateLine ? toISO((dateLine.match(dateRe)||[''])[0]) : (allDates[0]||'');
  // currency
  const codes = currencies.map(c=>c.code);
  const cm = text.match(new RegExp('\\b('+codes.join('|')+')\\b')); out.currency = cm ? cm[1] : /US\$|\$/.test(text) ? 'USD' : /\bZ[WI]G\b/.test(text) ? 'ZWG' : '';
  // total: prefer "grand total / amount due / total due / balance due", then "total", else the largest amount
  const tl = [/grand total|amount due|total due|balance due|total payable|amount payable/i, /\btotal\b/i];
  for (const re of tl){ const cands = lines.filter(l=>re.test(l) && !/sub\s*-?total|vat|tax total/i.test(l)); for (const l of cands.reverse()){ const a=[...l.matchAll(AMOUNT)].map(x=>toNum(x[1])); if (a.length){ out.total = a[a.length-1]; break; } } if (out.total) break; }
  if (!out.total){ const a=[...text.matchAll(AMOUNT)].map(x=>toNum(x[1])); if (a.length) out.total = Math.max(...a); }
  // line items: "<description> <qty> <unit price> <amount>" with qty*unit ≈ amount
  lines.forEach(l=>{
    const m = l.match(/^(.*?[A-Za-z].*?)\s+(\d+(?:\.\d+)?)\s+(?:[A-Z]{3}\s?|\$)?(\d[\d ,]*\.\d{2})\s+(?:[A-Z]{3}\s?|\$)?(\d[\d ,]*\.\d{2})$/);
    if (m){ const q=+m[2], u=toNum(m[3]), amt=toNum(m[4]); if (q>0 && Math.abs(q*u-amt) <= Math.max(0.05, amt*0.01) && !/total|vat|tax/i.test(m[1])) out.lines.push({description:m[1].replace(/^\d+[.)]\s*/,'').trim(), qty:q, unit_price:u}); }
  });
  if (!out.lines.length && out.total) out.lines.push({description:(out.kind==='receipt'?'Purchase':'As per '+out.kind)+(out.supplier_text?' – '+out.supplier_text:''), qty:1, unit_price:out.total});
  return out;
}

Object.assign(App, {
  scan(kind){
    this._scan = {kind: kind||'requisition', file:null, data:null};
    M.open(`${M.head('Smart scan')}<div class="modal-b">
      <p class="muted" style="margin:0">Upload a quotation, invoice or receipt. Pera reads it in your browser and fills in the supplier, reference, dates, amounts and lines for you to check. Typed PDFs read best; photos are read with text recognition.</p>
      <div class="seg" role="tablist">${[['requisition','Requisition'],['expense','Expense'],['invoice','Supplier invoice']].map(([k,l])=>`<button class="${this._scan.kind===k?'on':''}" data-scankind="${k}">${l}</button>`).join('')}</div>
      <label class="drop" id="scan-drop" for="scan-file">Drop a PDF or photo here, or <u>browse</u><input id="scan-file" type="file" accept=".pdf,image/*,.txt"></label>
      <div id="scan-out"></div><div class="err" id="m-err" hidden></div></div>
      <div class="modal-f"><button class="btn ghost" data-close>Cancel</button><span class="grow"></span><button class="btn primary" id="scan-go" disabled data-act="scan-use">Continue</button></div>`);
    const run = async f => {
      this._scan.file = f; M.err('');
      const out = $('#scan-out'); out.innerHTML = `<div class="note">Reading ${esc(f.name)}…</div>`;
      try{
        const text = await extractText(f, msg=>{ out.innerHTML = `<div class="note">${esc(msg)}</div>`; });
        const d = parseDoc(text, Store.all('suppliers'), S().currencies||[]);
        this._scan.data = d; this._scan.text = text;
        out.innerHTML = this.scanReview(d, text); $('#scan-go').disabled = false;
      }catch(e){ console.error(e); out.innerHTML=''; M.err(e.message||String(e)); }
    };
    $('#scan-file').addEventListener('change', e=>{ const f=e.target.files[0]; if (f) run(f); });
    const drop = $('#scan-drop');
    ['dragover','dragenter'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.add('over');}));
    ['dragleave','drop'].forEach(ev=>drop.addEventListener(ev,e=>{e.preventDefault();drop.classList.remove('over');}));
    drop.addEventListener('drop', e=>{ const f=e.dataTransfer.files[0]; if (f) run(f); });
  },
  scanReview(d, text){
    const found = [d.supplier_id?'supplier':'', d.reference?'reference':'', d.date?'date':'', d.total?'total':'', d.lines.length&&d.lines[0].qty!==1?d.lines.length+' line(s)':''].filter(Boolean);
    return `<div class="note">Found ${found.length?found.join(', '):'very little'} — check and correct below.</div>
      <div class="grid-form">
        <label class="f">Supplier${selectHTML('id="sc-sup"', supOpts(), d.supplier_id, d.supplier_text?'Not matched: '+d.supplier_text:'Not matched')}</label>
        <label class="f">Reference / invoice no.<input id="sc-ref" type="text" value="${esc(d.reference)}"></label>
        <label class="f">Document date<input id="sc-date" type="date" value="${esc(d.date)}"></label>
        <label class="f">Due / valid until<input id="sc-due" type="date" value="${esc(d.due_date)}"></label>
        <label class="f">Currency${selectHTML('id="sc-cur"', (S().currencies||[]).map(c=>[c.code,c.code]), d.currency||baseCur())}</label>
        <label class="f">Total<input id="sc-total" type="number" step="0.01" value="${d.total||''}"></label>
      </div>
      ${d.lines.length?tableHTML([{h:'Description',v:l=>esc(l.description)},{h:'Qty',r:1,cls:'num',v:l=>l.qty},{h:'Unit price',r:1,cls:'num',v:l=>num(l.unit_price)},{h:'Amount',r:1,cls:'num',v:l=>num(l.qty*l.unit_price)}], d.lines):''}
      <details><summary class="faint">Text read from the document</summary><pre class="scan-text">${esc(text.slice(0,4000))}</pre></details>`;
  },
  scanUse(){
    const s = this._scan, d = s.data; if (!d) return;
    const vals = {}; ['sc-sup','sc-ref','sc-date','sc-due','sc-cur','sc-total'].forEach(id=>{ const el=$('#'+id); vals[id]= el ? (el.value||'').trim() : ''; });
    const v = id => vals[id]||'';
    const sup = v('sc-sup'), total = +v('sc-total')||d.total, cur = v('sc-cur')||baseCur();
    let lines = d.lines.length ? d.lines : [{description:'As per document', qty:1, unit_price:total}];
    if (total && Math.abs(linesTotal(lines)-total) > 0.05 && lines.length===1) lines = [{description:lines[0].description, qty:1, unit_price:total}];
    const note = 'Filled from '+s.file.name+' by Smart scan — check every field before submitting.';
    const cat = sup ? ((Store.sup(sup)||{}).category_ids||[])[0] : '';
    const budget = cat ? (Store.all('budgets').find(b=>b.category_id===cat&&b.active)||{}).id : '';
    M.close();
    if (s.kind==='invoice'){
      const pos = Store.all('purchase_orders').filter(p=>(!sup||p.supplier_id===sup) && ['issued','partially_received','received'].includes(p.status));
      if (!pos.length) return this.toast('No open purchase order'+(sup?' for '+Store.supName(sup):'')+' to match this invoice to. Raise or receive the PO first.');
      const open = p => { this.invForm(p, {supplier_invoice_no:v('sc-ref')||d.reference, amount:total, invoice_date:v('sc-date')||todayStr(), due_date:v('sc-due')||addDays(todayStr(),30)}); fileBins['fm-files'].push(s.file); fileBins['fm-files']._draw(); };
      if (pos.length===1) return open(pos[0]);
      this._scanPos = open;
      M.open(`${M.head('Which purchase order is this invoice for?')}<div class="modal-b"><div class="list">${pos.map(p=>`<button class="li" data-act="scan-po" data-id="${p.id}"><div class="t"><b class="mono">${esc(p.number)}</b><span>${esc(Store.supName(p.supplier_id))} · ${esc(p.lines.map(l=>l.description).join(', ').slice(0,80))}</span></div><span class="num">${fmtMoney(p.currency,p.total)}</span></button>`).join('')}</div></div>`, true);
      return;
    }
    const preset = {kind:s.kind==='expense'?'expense':'purchase', supplier_id:s.kind==='expense'?'':sup, payee:s.kind==='expense'?me().name:'', currency:cur, category_id:cat||'', budget_id:budget||'', lines,
      title:(s.kind==='expense'?(d.kind==='receipt'?'Receipt':'Expense'):'Purchase')+' – '+(sup?Store.supName(sup):(d.supplier_text||'scanned document')), description:(d.reference?'Supplier reference '+d.reference+'. ':'')+'Scanned from '+s.file.name+'.',
      due_date:v('sc-due')||addDays(todayStr(),14), expense_date:s.kind==='expense'?(v('sc-date')||todayStr()):'', _files:[s.file], _scanNote:note, _from:'Created with Smart scan from '+s.file.name};
    this.reqForm(null, preset);
  }
});
Object.assign(ACT, {
  scan:(t)=>{ App.menu=null; App.render(); App.scan(t.dataset.kind); },
  'scan-use':()=>App.scanUse(),
  'scan-po':(t)=>{ M.close(); App._scanPos(Store.byId('purchase_orders',t.dataset.id)); }
});
document.addEventListener('click', e=>{ const b=e.target.closest('[data-scankind]'); if (!b) return; App._scan.kind=b.dataset.scankind; $$('[data-scankind]').forEach(x=>x.classList.toggle('on',x===b)); });
