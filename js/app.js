(function(){'use strict';
const STEPS=[{n:1,key:'address',label:'Address',desc:'Scan the address label at this location'},{n:2,key:'pallet',label:'Pallet',desc:'Scan the pallet barcode, or skip if none'},{n:3,key:'box',label:'Box',desc:'Scan the box barcode and select box type'},{n:4,key:'quantity',label:'Qty / Tag',desc:'Enter quantity or scan product / asset tag'},{n:5,key:'save',label:'Save',desc:'Review all captured data and save'}];
const ERROR_NOTES=['No error / photo clear','Photo blurry','Label damaged / unreadable','Wrong address','Unexpected item found','Item missing from expected location','Pallet damaged','Box damaged','Quantity mismatch','Other issue'];
const S={view:'home',activeRun:null,viewingRun:null,auditStep:1,cameraOn:false,lastCode:null,debounce:{},capture:{address:'',palletId:'',boxId:'',assetTag:'',boxStatus:'UNKNOWN',errorNote:'No error / photo clear',isBulkBox:false,bulkQty:0,photo:null,flags:[]}};
async function boot(){await Camera.init();S.activeRun=Storage.getActiveRun();render();}
function go(view,opts={}){if(S.cameraOn){Camera.stop();S.cameraOn=false;S.lastCode=null;}Object.assign(S,{view},opts);render();window.scrollTo(0,0);}
function render(){
  const app=document.getElementById('app');
  switch(S.view){
    case 'home':app.innerHTML=viewHome();break;
    case 'setup':app.innerHTML=viewSetup();break;
    case 'audit':app.innerHTML=viewAudit();break;
    case 'history':app.innerHTML=viewHistory();break;
    case 'detail':app.innerHTML=viewDetail();break;
    case 'settings':app.innerHTML=viewSettings();break;
    default:app.innerHTML=viewHome();
  }
  bindCamera();
}
function viewHome(){
  const run=S.activeRun,recent=Storage.getAllRuns().filter(r=>r.status==='complete').slice(0,3);
  return `${hdr({title:'📦 Stock Count',right:btnH('⚙️ Settings',"go('settings')",'header-action')})}
<div class="page fade-in">
  ${run?activeBanner(run):heroBanner()}
  <div class="card">
    <div class="label" style="margin-bottom:14px">How guided audit works</div>
    <div class="how-steps">${STEPS.map(s=>`<div class="how-row"><div class="how-num">${s.n}</div><div><div class="how-info-name">${s.label}</div><div class="how-info-desc">${s.desc}</div></div></div>`).join('')}</div>
  </div>
  ${recent.length>0?`<div><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px"><div class="h3">Recent Audits</div><button class="btn btn-ghost btn-sm" onclick="go('history')">View all</button></div><div style="display:flex;flex-direction:column;gap:8px">${recent.map(runRow).join('')}</div></div>`:''}
</div>
${bottomNav('home')}`;
}
function activeBanner(run){
  const st=Storage.getRunStats(run.id);
  return `<div class="active-banner"><div><div class="run-id">${run.id}</div><div class="warehouse">${esc(run.warehouse)}</div><div class="operator">👤 ${esc(run.operator)}</div></div><div class="stats-grid" style="grid-template-columns:repeat(3,1fr)">${statC(st.captures,'Captures','accent')}${statC(st.pallets,'Pallets')}${statC(st.boxes,'Boxes')}</div><button class="btn btn-accent btn-lg btn-full" onclick="continueAudit()">▶  Continue Active Audit</button><button class="btn btn-ghost btn-sm" onclick="showModal('endAudit')" style="color:rgba(255,255,255,.65);border-color:rgba(255,255,255,.25)">Mark audit as complete</button></div>`;
}
function heroBanner(){return `<div class="hero-card"><div><div class="hero-title">Ready to count?</div><div class="hero-sub" style="margin-top:8px">Start a guided stock audit. The app walks you through each address — scan barcodes with your camera at every step.</div></div><button class="btn btn-accent btn-lg btn-full" onclick="go('setup')">+ Start New Audit</button></div>`;}
function viewSetup(){
  const cfg=Storage.getSettings();
  return `${hdr({back:"go('home')",title:'New Audit'})}
<div class="page no-nav fade-in"><div class="card">
<div class="h2" style="margin-bottom:20px">Set up your audit</div>
<div style="display:flex;flex-direction:column;gap:18px">
<div class="form-group"><label class="form-label" for="s-warehouse">Warehouse / Location <span class="req">*</span></label><input type="text" id="s-warehouse" class="form-input" placeholder="e.g. V120A.16C" value="${esc(cfg.lastWarehouse||'')}" autocomplete="off" autocapitalize="characters"><span class="form-hint">Enter the zone or location code for this audit</span></div>
<div class="form-group"><label class="form-label" for="s-operator">Your name <span class="req">*</span></label><input type="text" id="s-operator" class="form-input" placeholder="e.g. Jane Smith" value="${esc(cfg.operator||'')}" autocomplete="name"></div>
<div class="alert alert-info">ℹ️ <span>The system guides you address by address. Follow <strong>one step at a time</strong>.</span></div>
<button class="btn btn-primary btn-lg btn-full" onclick="startAudit()">Start Guided Audit →</button>
<button class="btn btn-ghost btn-full" onclick="go('home')">Cancel</button>
</div></div></div>`;
}
function viewAudit(){
  if(!S.activeRun){go('home');return '';}
  const run=S.activeRun,step=S.auditStep,st=Storage.getRunStats(run.id);
  return `${hdr({back:'confirmExit()',title:esc(run.warehouse),right:btnH(`📋 ${st.captures} saved`,"go('detail',{viewingRun:S.activeRun})",'header-action')})}
${stepBar(step)}
<div class="page no-nav fade-in" id="audit-page">${renderStep(step)}</div>`;
}
function stepBar(cur){
  const pct=Math.round((cur/STEPS.length)*100);
  return `<div class="step-bar-wrap"><div class="step-meta"><span class="step-meta-label">Step ${cur} of ${STEPS.length}: ${STEPS[cur-1].label}</span><span class="step-meta-count">${pct}%</span></div><div class="step-track"><div class="step-fill" style="width:${pct}%"></div></div><div class="step-dots">${STEPS.map(s=>`<div class="step-dot ${s.n<cur?'done':s.n===cur?'active':'pending'}" title="${s.label}">${s.n<cur?'✓':s.n}</div>`).join('')}</div></div>`;
}
function renderStep(n){switch(n){case 1:return stepAddress();case 2:return stepPallet();case 3:return stepBox();case 4:return stepQuantity();case 5:return stepReview();default:return '';}}
function stepAddress(){
  const v=S.capture.address;
  return `<div class="step-header"><div class="step-num-badge">1</div><div class="step-title">Scan Address Label</div></div><p class="hint" style="margin-bottom:16px">Point the camera at the rack or shelf label, or type the address manually.</p>${camSection('address label',v)}<div class="form-group"><label class="form-label" for="f-address">Address code</label><input type="text" id="f-address" class="form-input ${v?'filled':''}" placeholder="e.g. C22" value="${esc(v)}" oninput="updateField('address',this.value)" autocomplete="off" autocapitalize="characters"><span class="form-hint">Auto-filled by camera scan, or type here</span></div><div style="display:flex;flex-direction:column;gap:10px;margin-top:8px"><button class="btn btn-primary btn-lg btn-full ${!v?'disabled':''}" ${!v?'disabled':''} onclick="nextStep()">Confirm Address →</button>${!v?'<button class="btn btn-ghost btn-full btn-sm" onclick="skipField(&#39;address&#39;,&#39;UNREADABLE&#39;)">Skip — label not readable</button>':''}</div>`;
}
function stepPallet(){
  const addr=S.capture.address,v=S.capture.palletId;
  return `<div class="step-header"><div class="step-num-badge">2</div><div class="step-title">Scan Pallet or Shelf</div></div><p class="hint" style="margin-bottom:12px">Scan the pallet barcode or shelf tag. Tap <strong>No pallet here</strong> if none.</p>${addr?`<div class="address-card" style="margin-bottom:16px"><div class="address-icon">📍</div><div><div class="address-code">${esc(addr)}</div><div class="address-confirmed">Address confirmed</div></div></div>`:''}
${camSection('pallet barcode',v)}<div class="form-group"><label class="form-label" for="f-pallet">Pallet ID</label><input type="text" id="f-pallet" class="form-input ${v?'filled':''}" placeholder="not scanned" value="${esc(v)}" oninput="updateField('palletId',this.value)" autocomplete="off"></div><div style="margin-top:8px"><button class="btn btn-primary btn-lg btn-full" onclick="nextStep()">${v?'Confirm Pallet →':'No pallet here →'}</button></div>`;
}
function stepBox(){
  const v=S.capture.boxId,isBulk=S.capture.isBulkBox;
  return `<div class="step-header"><div class="step-num-badge">3</div><div class="step-title">Scan Box</div></div><p class="hint" style="margin-bottom:16px">Scan the box barcode, then select the box type.</p>${camSection('box barcode',v)}<div class="form-group" style="margin-bottom:16px"><label class="form-label" for="f-box">Box ID</label><input type="text" id="f-box" class="form-input ${v?'filled':''}" placeholder="not scanned" value="${esc(v)}" oninput="updateField('boxId',this.value)" autocomplete="off"></div><div class="form-group"><label class="form-label">Box type</label><div class="btn-toggle-pair"><button class="btn ${!isBulk?'selected':''}" onclick="setField('isBulkBox',false);renderInPlace()">📦 Normal box</button><button class="btn ${isBulk?'selected':''}" onclick="setField('isBulkBox',true);renderInPlace()">🗃️ Bulk box</button></div>${isBulk?'<span class="form-hint">Bulk box: items do not have individual asset tags.</span>':''}</div><div style="margin-top:16px"><button class="btn btn-primary btn-lg btn-full" onclick="nextStep()">${v?'Confirm Box →':'No box here →'}</button></div>`;
}
function stepQuantity(){
  const isBulk=S.capture.isBulkBox,qty=S.capture.bulkQty,tag=S.capture.assetTag;
  return `<div class="step-header"><div class="step-num-badge">4</div><div class="step-title">${isBulk?'Bulk Quantity':'Scan Asset / Product Tag'}</div></div><p class="hint" style="margin-bottom:16px">${isBulk?'Count the items in this bulk box and enter the total.':'Scan the product or asset barcode/QR code.'}</p>${isBulk?`<div class="card" style="margin-bottom:16px"><label class="form-label" style="margin-bottom:12px">Number of items in this bulk box</label><div class="qty-row"><button class="qty-btn" onclick="adjustQty(-1)" aria-label="Decrease">−</button><input type="number" class="qty-num-input" id="f-qty" value="${qty}" min="0" oninput="setField('bulkQty',Math.max(0,parseInt(this.value)||0))" aria-label="Quantity"><button class="qty-btn" onclick="adjustQty(1)" aria-label="Increase">+</button></div></div>`:`${camSection('product / asset tag',tag)}<div class="form-group"><label class="form-label" for="f-asset">Product / Asset Tag</label><input type="text" id="f-asset" class="form-input ${tag?'filled':''}" placeholder="not scanned" value="${esc(tag)}" oninput="updateField('assetTag',this.value)" autocomplete="off"></div>`}<div style="margin-top:16px"><button class="btn btn-primary btn-lg btn-full" onclick="nextStep()">Continue to Review →</button></div>`;
}
function stepReview(){
  const c=S.capture;
  return `<div class="step-header"><div class="step-num-badge">5</div><div class="step-title">Review &amp; Save</div></div><p class="hint" style="margin-bottom:16px">Check the captured data, flag any issue, then save to move to the next address.</p><div class="card" style="margin-bottom:16px"><div class="label" style="margin-bottom:12px">Captured at this address</div>${revRow('📍 Address',c.address||'—')}${revRow('🏗️ Pallet ID',c.palletId||'—')}${revRow('📦 Box ID',c.boxId||'—')}${revRow('🏷️ Asset / Tag',c.assetTag||'—')}${revRow('📊 Box type',c.isBulkBox?`Bulk box (qty: ${c.bulkQty})`:'Normal box')}</div><div class="form-group" style="margin-bottom:20px"><label class="form-label" for="f-note">Issue flag</label><select id="f-note" class="form-input form-select" onchange="setField('errorNote',this.value)">${ERROR_NOTES.map(n=>`<option value="${esc(n)}" ${c.errorNote===n?'selected':''}>${esc(n)}</option>`).join('')}</select><span class="form-hint">Select an issue if something is wrong at this location</span></div><button class="btn btn-success btn-lg btn-full" onclick="saveCapture()">✓  Save &amp; Go to Next Address</button>`;
}
function revRow(label,value){const empty=!value||value==='—';return `<div class="review-row"><span class="review-label">${label}</span><span class="review-value ${empty?'empty':''}">${esc(value)}</span></div>`;}
function camSection(hint,currentVal){
  return `<div style="margin-bottom:16px"><div class="camera-wrap" id="cam-wrap"><video id="cam-video" class="camera-video" playsinline autoplay muted></video><canvas id="cam-canvas" class="camera-canvas"></canvas>${S.cameraOn?`<div class="scan-overlay"><div class="scan-box"><div class="scan-bl"></div><div class="scan-br"></div><div class="scan-line"></div></div></div><div class="camera-status" id="cam-status">${S.lastCode?`✓ Detected: ${esc(S.lastCode)}`:`Point camera at ${hint}`}</div>`:`<div class="camera-idle"><div class="camera-idle-icon">📷</div><div class="camera-idle-text">Tap <strong>Start Camera</strong> to scan ${hint}</div></div>`}</div><div class="camera-controls">${S.cameraOn?'<button class="btn btn-success" onclick="capturePhoto()">📸 Save Photo</button><button class="btn btn-ghost btn-sm" onclick="stopCam()">Stop Camera</button>':'<button class="btn btn-accent" onclick="startCam()">📷 Start Camera</button>'}</div><div id="scan-pill-wrap">${S.lastCode?`<div class="scan-pill found"><div class="pill-dot"></div>Code detected: <strong>${esc(S.lastCode)}</strong></div>`:S.cameraOn?`<div class="scan-pill scanning"><div class="pill-dot"></div>Scanning for ${hint}…</div>`:'<div class="scan-pill idle"><div class="pill-dot"></div>Camera not started</div>'}</div></div>`;
}
function bindCamera(){if(S.cameraOn){const v=document.getElementById('cam-video'),c=document.getElementById('cam-canvas');if(v&&c&&!Camera.isStarted())Camera.start(v,c).catch(err=>toast(err.message,'err'));}}
function startCam(){
  const v=document.getElementById('cam-video'),c=document.getElementById('cam-canvas');
  if(!v||!c)return;
  Camera.start(v,c).then(()=>{
    S.cameraOn=true;const step=S.auditStep;
    Camera.startDetection((code)=>{
      if(S.debounce[code])return;
      S.debounce[code]=setTimeout(()=>delete S.debounce[code],3500);
      S.lastCode=code;
      const fieldMap={1:'address',2:'palletId',3:'boxId',4:'assetTag'};
      const field=fieldMap[step];
      if(field){S.capture[field]=code;const inp=document.getElementById({address:'f-address',palletId:'f-pallet',boxId:'f-box',assetTag:'f-asset'}[field]);if(inp){inp.value=code;inp.classList.add('filled');}}
      const st=document.getElementById('cam-status');if(st)st.textContent=`✓ Detected: ${code}`;
      const pw=document.getElementById('scan-pill-wrap');if(pw)pw.innerHTML=`<div class="scan-pill found"><div class="pill-dot"></div>Code detected: <strong>${esc(code)}</strong></div>`;
      const idle=document.querySelector('.camera-idle');if(idle)idle.style.display='none';
      toast(`Scanned: ${code}`,'ok');
    });
    const idle=document.querySelector('.camera-idle');if(idle)idle.style.display='none';
    const ctrl=document.querySelector('.camera-controls');if(ctrl)ctrl.innerHTML='<button class="btn btn-success" onclick="capturePhoto()">📸 Save Photo</button><button class="btn btn-ghost btn-sm" onclick="stopCam()">Stop Camera</button>';
  }).catch(err=>toast(err.message,'err'));
}
function stopCam(){Camera.stop();S.cameraOn=false;S.lastCode=null;const idle=document.querySelector('.camera-idle');if(idle)idle.style.display='flex';const ctrl=document.querySelector('.camera-controls');if(ctrl)ctrl.innerHTML='<button class="btn btn-accent" onclick="startCam()">📷 Start Camera</button>';const pill=document.getElementById('scan-pill-wrap');if(pill)pill.innerHTML='<div class="scan-pill idle"><div class="pill-dot"></div>Camera not started</div>';}
function capturePhoto(){const p=Camera.capture();if(p){S.capture.photo=p;toast('Photo saved!','ok');}}
function viewHistory(){
  const runs=Storage.getAllRuns();
  return `${hdr({back:"go('home')",title:'Audit History'})}<div class="page fade-in">${runs.length===0?`<div class="empty-state"><div class="empty-icon">📋</div><div class="empty-title">No audits yet</div><div class="empty-body">Start your first stock audit from the home screen.</div><button class="btn btn-primary" onclick="go('home')">Go to Home</button></div>`:`<div style="display:flex;flex-direction:column;gap:8px">${runs.map(runRow).join('')}</div>`}</div>${bottomNav('history')}`;
}
function runRow(run){
  const st=Storage.getRunStats(run.id),isActive=run.status==='active';
  return `<div class="run-row" onclick="openRun('${esc(run.id)}')" role="button" tabindex="0" onkeydown="if(event.key==='Enter'||event.key===' ')openRun('${esc(run.id)}')"><div class="run-icon">${isActive?'🟢':'📋'}</div><div class="run-info"><div class="run-name">${esc(run.warehouse)}</div><div class="run-meta">${fmtDate(run.createdAt)} · ${esc(run.operator)} · ${st.captures} captures</div></div><span class="chip ${isActive?'chip-active':'chip-done'}">${isActive?'Active':'Done'}</span></div>`;
}
function viewDetail(){
  const run=S.viewingRun||S.activeRun;if(!run){go('home');return '';}
  const st=Storage.getRunStats(run.id),ev=run.evidence||[],fromAudit=run.status==='active';
  return `${hdr({back:fromAudit?"go('audit')":"go('history')",title:'Audit Detail'})}<div class="page no-nav fade-in"><div class="run-id-badge">${esc(run.id)}</div><div class="card card-sm" style="display:flex;gap:12px;align-items:center"><div style="flex:1"><div style="font-weight:800;font-size:1.0625rem">${esc(run.warehouse)}</div><div class="hint">👤 ${esc(run.operator)} · ${fmtDate(run.createdAt)}</div></div><span class="chip ${run.status==='active'?'chip-active':'chip-done'}">${run.status==='active'?'Active':'Complete'}</span></div><div class="stats-grid">${statC(st.captures,'Captures saved','accent')}${statC(st.pallets,'Pallets')}${statC(st.boxes,'Boxes')}${statC(st.assets,'Asset tags')}${statC(st.bulkUnits,'Bulk units')}${statC(st.unknownTags,'Unknown tags',st.unknownTags?'warn':'')}${statC(st.duplicates,'Duplicates',st.duplicates?'err':'')}${statC(st.flaggedIssues,'Flagged issues',st.flaggedIssues?'warn':'')}</div><div class="card card-flush"><div style="padding:16px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between"><div class="h3">Evidence Log</div><div class="hint">${ev.length} rows</div></div>${ev.length===0?'<div class="empty-state" style="padding:32px 16px"><div class="empty-icon" style="font-size:2rem">📭</div><div class="empty-title">No captures yet</div></div>':`<div class="ledger-scroll"><table class="ledger" aria-label="Evidence log"><thead><tr><th>Time</th><th>Address</th><th>Pallet</th><th>Box</th><th>Asset / Tag</th><th>Qty</th><th>Flag</th></tr></thead><tbody>${ev.map(e=>`<tr><td class="mono">${fmtTime(e.timestamp)}</td><td><strong>${esc(e.address||'—')}</strong></td><td>${esc(e.palletId||'—')}</td><td>${esc(e.boxId||'—')}</td><td>${esc(e.assetTag||'—')}</td><td>${e.isBulkBox?e.bulkQty:'—'}</td><td class="flag-cell">${e.errorNote!=='No error / photo clear'?esc(e.errorNote):''}</td></tr>`).join('')}</tbody></table></div>`}</div>${run.status==='active'?`<button class="btn btn-primary btn-full" onclick="go('audit')">← Back to Audit</button><button class="btn btn-danger btn-full" onclick="showModal('endAudit')">Complete Audit</button>`:`<button class="btn btn-ghost btn-full" onclick="go('history')">← Back to History</button><button class="btn btn-danger btn-sm" onclick="showModal('deleteRun','${esc(run.id)}')">Delete this audit</button>`}</div>`;
}
function viewSettings(){
  const cfg=Storage.getSettings();
  return `${hdr({back:"go('home')",title:'Settings'})}<div class="page fade-in"><div class="card" style="margin-bottom:4px"><div class="label" style="margin-bottom:14px">Your profile</div><div class="form-group"><label class="form-label" for="cfg-name">Your name</label><input type="text" id="cfg-name" class="form-input" placeholder="Enter your name" value="${esc(cfg.operator||'')}" oninput="saveSetting('operator',this.value)" autocomplete="name"><span class="form-hint">Pre-filled when you start a new audit</span></div></div><div class="card card-flush" style="margin-top:8px"><div class="setting-row" onclick="showModal('clearData')"><div class="setting-ico">🗑️</div><div class="setting-text"><div class="setting-name">Clear all audit data</div><div class="setting-desc">Delete all history from this device</div></div><div class="setting-arrow">›</div></div></div><div class="alert alert-info">ℹ️ <span>All data is stored locally on this device.</span></div><div style="text-align:center;margin-top:8px"><p class="hint">Redivivis Stock Count v1.0</p></div></div>${bottomNav('settings')}`;
}
function hdr({back,title,right}={}){
  return `<header class="app-header" role="banner">${back?`<button class="header-back" onclick="${back}" aria-label="Go back">←</button>`:''}<div class="header-title">${title||''}</div>${right||''}</header>`;
}
function bottomNav(active){
  const items=[{id:'home',icon:'🏠',label:'Home',action:"go('home')"},{id:'history',icon:'📋',label:'History',action:"go('history')"},{id:'settings',icon:'⚙️',label:'Settings',action:"go('settings')"}];
  return `<nav class="bottom-nav" aria-label="Main navigation">${items.map(it=>`<button class="nav-btn ${it.id===active?'active':''}" onclick="${it.action}" aria-label="${it.label}" aria-current="${it.id===active?'page':'false'}"><span class="nav-icon" aria-hidden="true">${it.icon}</span>${it.label}</button>`).join('')}</nav>`;
}
function statC(value,label,mod=''){return `<div class="stat-card"><div class="stat-val ${mod}">${value}</div><div class="stat-lbl">${label}</div></div>`;}
function btnH(text,onclick,cls='btn btn-ghost btn-sm'){return `<button class="${cls}" onclick="${onclick}">${text}</button>`;}
function startAudit(){
  const warehouse=document.getElementById('s-warehouse')?.value?.trim(),operator=document.getElementById('s-operator')?.value?.trim();
  if(!warehouse){toast('Please enter a warehouse or location code.','err');return;}
  if(!operator){toast('Please enter your name.','err');return;}
  const cfg=Storage.getSettings();cfg.operator=operator;cfg.lastWarehouse=warehouse;Storage.saveSettings(cfg);
  const run=Storage.createRun(warehouse,operator);S.activeRun=run;S.auditStep=1;resetCapture();go('audit');toast('Audit started!','ok');
}
function continueAudit(){go('audit');}
function resetCapture(){S.capture={address:'',palletId:'',boxId:'',assetTag:'',boxStatus:'UNKNOWN',errorNote:'No error / photo clear',isBulkBox:false,bulkQty:0,photo:null,flags:[]};S.lastCode=null;}
function nextStep(){if(S.cameraOn){Camera.stop();S.cameraOn=false;}if(S.auditStep<STEPS.length){S.auditStep++;render();}}
function saveCapture(){
  if(!S.activeRun)return;
  Storage.saveEvidence(S.activeRun.id,{...S.capture});
  S.activeRun=Storage.getActiveRun();
  toast('✓ Saved! Next address ready.','ok');
  Camera.stop();S.cameraOn=false;S.auditStep=1;resetCapture();
  setTimeout(render,600);
}
function updateField(field,value){
  S.capture[field]=value;
  const map={address:'f-address',palletId:'f-pallet',boxId:'f-box',assetTag:'f-asset'};
  const el=document.getElementById(map[field]);if(el)el.classList.toggle('filled',!!value);
  if(field==='address'){const btn=document.querySelector('.btn-primary.btn-lg');if(btn)btn.disabled=!value;}
}
function setField(field,value){S.capture[field]=value;}
function skipField(field,value){S.capture[field]=value;nextStep();}
function adjustQty(delta){const nv=Math.max(0,(S.capture.bulkQty||0)+delta);S.capture.bulkQty=nv;const el=document.getElementById('f-qty');if(el)el.value=nv;}
function renderInPlace(){const p=document.getElementById('audit-page');if(!p)return;p.innerHTML=renderStep(S.auditStep);p.classList.add('fade-in');}
function openRun(id){const run=Storage.getRun(id);if(!run)return;if(run.status==='active'){S.activeRun=run;S.viewingRun=run;}else{S.viewingRun=run;}go('detail');}
function saveSetting(key,value){const cfg=Storage.getSettings();cfg[key]=value;Storage.saveSettings(cfg);}
function showModal(type,arg){
  let title,body,actions;
  if(type==='confirmExit'){title='Exit audit?';body='Saved captures are kept. Unsaved step data will be lost.';actions=[{label:'Keep Auditing',style:'btn-primary',fn:'closeModal()'},{label:'Exit to Home',style:'btn-ghost',fn:'exitToHome()'}];}
  else if(type==='endAudit'){const st=Storage.getRunStats(S.activeRun?.id);title='Complete audit?';body=`${st?.captures||0} capture(s) saved. This cannot be undone.`;actions=[{label:'Yes, Complete Audit',style:'btn-success',fn:'endAudit()'},{label:'Cancel',style:'btn-ghost',fn:'closeModal()'}];}
  else if(type==='deleteRun'){title='Delete audit?';body='This will permanently remove all data for this audit.';actions=[{label:'Delete',style:'btn-danger',fn:`deleteRun('${esc(arg)}')`},{label:'Cancel',style:'btn-ghost',fn:'closeModal()'}];}
  else if(type==='clearData'){title='Clear all data?';body='This will permanently delete ALL audit history from this device.';actions=[{label:'Delete Everything',style:'btn-danger',fn:'clearAllData()'},{label:'Cancel',style:'btn-ghost',fn:'closeModal()'}];}
  const ex=document.getElementById('modal-root');if(ex)ex.remove();
  const div=document.createElement('div');div.id='modal-root';div.className='modal-bg';div.setAttribute('role','dialog');div.setAttribute('aria-modal','true');div.setAttribute('aria-labelledby','modal-title');
  div.innerHTML=`<div class="modal-box"><div class="modal-title" id="modal-title">${title}</div><div class="modal-body">${body}</div><div class="modal-btns">${actions.map(a=>`<button class="btn ${a.style} btn-full" onclick="${a.fn}">${a.label}</button>`).join('')}</div></div>`;
  div.addEventListener('click',e=>{if(e.target===div)closeModal();});document.body.appendChild(div);
}
function closeModal(){document.getElementById('modal-root')?.remove();}
function confirmExit(){showModal('confirmExit');}
function exitToHome(){closeModal();Camera.stop();S.cameraOn=false;go('home');}
function endAudit(){closeModal();if(S.activeRun){Storage.completeRun(S.activeRun.id);S.activeRun=null;}Camera.stop();S.cameraOn=false;go('home');toast('Audit completed! 🎉','ok');}
function deleteRun(id){closeModal();Storage.deleteRun(id);go('history');toast('Audit deleted.','warn');}
function clearAllData(){closeModal();Storage.clearAll();S.activeRun=null;go('home');toast('All data cleared.','warn');}
function toast(msg,type='',duration=3200){const c=document.getElementById('toast-container');if(!c)return;const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=msg;c.appendChild(el);setTimeout(()=>el.remove(),duration);}
function esc(str){if(str===null||str===undefined)return '';return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function fmtDate(iso){if(!iso)return '';return new Date(iso).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});}
function fmtTime(iso){if(!iso)return '';return new Date(iso).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});}
const exports={go,startAudit,continueAudit,nextStep,saveCapture,updateField,setField,skipField,adjustQty,renderInPlace,startCam,stopCam,capturePhoto,confirmExit,showModal,closeModal,exitToHome,endAudit,deleteRun,clearAllData,openRun,saveSetting,S};
Object.assign(window,exports);
document.addEventListener('DOMContentLoaded',boot);
})();
