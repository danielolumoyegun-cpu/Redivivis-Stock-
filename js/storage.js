(function (global) {
  'use strict';
  const DATA_KEY = 'rvs_data', SETTINGS_KEY = 'rvs_settings';
  function genRunId() {
    const d = new Date();
    const date = d.toISOString().slice(0,10).replace(/-/g,'');
    const time = d.toTimeString().slice(0,8).replace(/:/g,'');
    const rand = Math.random().toString(36).toUpperCase().slice(2,8);
    return `AUDIT-${date}-${time}-${rand}`;
  }
  function load() { try { return JSON.parse(localStorage.getItem(DATA_KEY)||'{"runs":[]}'); } catch(_){ return {runs:[]}; } }
  function save(data) { localStorage.setItem(DATA_KEY, JSON.stringify(data)); }
  function getSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)||'{}'); } catch(_){ return {}; } }
  function saveSettings(s) { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)); }
  function createRun(warehouse, operator) {
    const data = load();
    const run = { id: genRunId(), warehouse: warehouse.trim(), operator: operator.trim(), status: 'active', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), evidence: [] };
    data.runs.unshift(run); save(data); return run;
  }
  function getRun(id) { return load().runs.find(r => r.id === id) || null; }
  function getActiveRun() { return load().runs.find(r => r.status === 'active') || null; }
  function getAllRuns() { return load().runs; }
  function updateRun(id, patches) {
    const data = load(), i = data.runs.findIndex(r => r.id === id);
    if (i===-1) return null;
    data.runs[i] = {...data.runs[i], ...patches, updatedAt: new Date().toISOString()};
    save(data); return data.runs[i];
  }
  function completeRun(id) { return updateRun(id, {status:'complete', completedAt: new Date().toISOString()}); }
  function deleteRun(id) { const data=load(); data.runs=data.runs.filter(r=>r.id!==id); save(data); }
  function clearAll() { localStorage.removeItem(DATA_KEY); }
  function saveEvidence(runId, ev) {
    const data=load(), run=data.runs.find(r=>r.id===runId);
    if (!run) return null;
    const entry = {...ev, id: String(Date.now()), timestamp: new Date().toISOString()};
    run.evidence.push(entry); run.updatedAt=new Date().toISOString(); save(data); return entry;
  }
  function getRunStats(runId) {
    const run=getRun(runId); if (!run) return null;
    const ev=run.evidence||[];
    const pallets=new Set(ev.map(e=>e.palletId).filter(Boolean));
    const boxes=new Set(ev.map(e=>e.boxId).filter(Boolean));
    const assets=new Set(ev.map(e=>e.assetTag).filter(Boolean));
    const bulkUnits=ev.reduce((s,e)=>s+(Number(e.bulkQty)||0),0);
    const unknownTags=ev.filter(e=>(e.flags||[]).includes('UNKNOWN')).length;
    const duplicates=ev.filter(e=>(e.flags||[]).includes('DUPLICATE')).length;
    const flaggedIssues=ev.filter(e=>e.errorNote&&e.errorNote!=='No error / photo clear').length;
    return {captures:ev.length, pallets:pallets.size, boxes:boxes.size, assets:assets.size, bulkUnits, unknownTags, duplicates, flaggedIssues};
  }
  global.Storage = {getSettings,saveSettings,createRun,getRun,getActiveRun,getAllRuns,updateRun,completeRun,deleteRun,clearAll,saveEvidence,getRunStats};
})(window);
