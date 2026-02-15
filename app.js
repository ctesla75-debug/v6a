/* Health Tracker - Offline (UI like your screenshots)
   - IndexedDB local storage
   - Single daily log view + charts view
   - Import/Export + clear range + clear all toggle
   - No external libraries
*/
const DB_NAME="health_tracker_db";
const DB_VERSION=1;
const STORE="logs";
const STORAGE_FALLBACK_KEY="health_tracker_logs_v1";
let USE_LOCAL_STORAGE_FALLBACK=false;

const SUPPLEMENTS = [
  { id:"berberine_morning", name:"Berberine – Morning", time:"Morning" },
  { id:"vitamin_d3", name:"Vitamin D3", time:"Morning" },
  { id:"vitamin_k2", name:"Vitamin K2", time:"Morning" },
  { id:"nr", name:"NR", time:"Morning" },
  { id:"astaxanthin", name:"Astaxanthin", time:"Morning" },
  { id:"metformin", name:"Metformin", time:"Morning" },
  { id:"berberine_afternoon", name:"Berberine – Afternoon", time:"Afternoon" },
  { id:"vitamin_c", name:"Vitamin C", time:"Afternoon" },
  { id:"multivitamin", name:"Multivitamin", time:"Afternoon" },
  { id:"sugar_support", name:"Sugar Support", time:"Afternoon" },
  { id:"omega_3", name:"Omega 3", time:"Afternoon" },
  { id:"tmg", name:"TMG", time:"Afternoon" },
  { id:"nac", name:"NAC", time:"Evening" },
  { id:"magnesium", name:"Magnesium", time:"Evening" },
  { id:"taurine", name:"Taurine", time:"Evening" },
  { id:"collagen", name:"Collagen", time:"Evening" },
  { id:"protein_powder", name:"Protein Powder 84g", time:"Evening" },
  { id:"cinnamon", name:"Cinnamon", time:"Evening" },
  { id:"apple_cider_vinegar", name:"Apple Cider Vinegar", time:"Evening" },
  { id:"creatine", name:"Creatine 10g", time:"Evening" },
  { id:"probiotic", name:"Probiotic", time:"Evening" },
  { id:"ubiquinol", name:"Ubiquinol", time:"Evening" },
];

const EXERCISES = [
  { id:"treadmill", name:"Half Hour Treadmill" },
  { id:"foot_exercise", name:"Foot Exercise" },
  { id:"shoulder_exercise", name:"Shoulder Exercise" },
  { id:"weight_training", name:"Weight Training" },
];

const $ = (s)=>document.querySelector(s);

function todayISO(){
  // Use local date but format without UTC conversion issues
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,"0");
  const dd = String(d.getDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function addDays(iso, delta){
  // Do date math in UTC to prevent timezone/DST from skipping days
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  dt.setUTCDate(dt.getUTCDate() + delta);
  const yyyy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth()+1).padStart(2,"0");
  const dd = String(dt.getUTCDate()).padStart(2,"0");
  return `${yyyy}-${mm}-${dd}`;
}
function formatLong(iso){
  // Render using UTC date parts so the label never drifts
  const [y,m,d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m-1, d));
  return dt.toLocaleDateString(undefined, {weekday:"long", year:"numeric", month:"short", day:"numeric", timeZone:"UTC"});
}
function uuid(){
  return (crypto?.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(16).slice(2)}`);
}

function getMeasureInterval(){
  const mode = document.querySelector("#measureFreq")?.value || "daily";
  if(mode==="daily") return 1;
  if(mode==="weekly") return 7;
  // custom
  const raw = Number(document.querySelector("#measureInterval")?.value);
  const n = Number.isFinite(raw) ? Math.floor(raw) : 7;
  return Math.max(2, n);
}

function safeNum(v){
  if(v===""||v===null||v===undefined) return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}

/* ---------- IndexedDB ---------- */

function lsLoadAll(){
  try{
    const raw = localStorage.getItem(STORAGE_FALLBACK_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  }catch(e){ return []; }
}
function lsSaveAll(arr){
  localStorage.setItem(STORAGE_FALLBACK_KEY, JSON.stringify(arr));
}

function openDB(){
  return new Promise((resolve,reject)=>{
    let req;
    try{ req=indexedDB.open(DB_NAME, DB_VERSION); }
    catch(e){ reject(e); return; }
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(STORE)){
        const s=db.createObjectStore(STORE,{keyPath:"date"});
        s.createIndex("date","date",{unique:true});
      }
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error);
  });
}
async function putLog(log){
  if(USE_LOCAL_STORAGE_FALLBACK){
    const all = lsLoadAll();
    const idx = all.findIndex(x=>x.date===log.date);
    if(idx>=0) all[idx]=log; else all.push(log);
    lsSaveAll(all);
    return true;
  }
  let db;
  try{ db = await openDB(); }
  catch(e){ USE_LOCAL_STORAGE_FALLBACK=true; return putLog(log); }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).put(log);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}

async function getLog(date){
  if(USE_LOCAL_STORAGE_FALLBACK){
    const all = lsLoadAll();
    return all.find(x=>x.date===date) ?? null;
  }
  let db;
  try{ db = await openDB(); }
  catch(e){ USE_LOCAL_STORAGE_FALLBACK=true; return getLog(date); }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).get(date);
    req.onsuccess=()=>resolve(req.result??null);
    req.onerror=()=>reject(req.error);
  });
}

async function getAllLogs(){
  if(USE_LOCAL_STORAGE_FALLBACK){
    return lsLoadAll();
  }
  let db;
  try{ db = await openDB(); }
  catch(e){ USE_LOCAL_STORAGE_FALLBACK=true; return getAllLogs(); }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readonly");
    const req=tx.objectStore(STORE).getAll();
    req.onsuccess=()=>resolve(req.result??[]);
    req.onerror=()=>reject(req.error);
  });
}

async function deleteLog(date){
  if(USE_LOCAL_STORAGE_FALLBACK){
    const all = lsLoadAll().filter(x=>x.date!==date);
    lsSaveAll(all);
    return true;
  }
  let db;
  try{ db = await openDB(); }
  catch(e){ USE_LOCAL_STORAGE_FALLBACK=true; return deleteLog(date); }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).delete(date);
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}

async function clearAll(){
  if(USE_LOCAL_STORAGE_FALLBACK){
    lsSaveAll([]);
    return true;
  }
  let db;
  try{ db = await openDB(); }
  catch(e){ USE_LOCAL_STORAGE_FALLBACK=true; return clearAll(); }
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORE,"readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete=()=>resolve(true);
    tx.onerror=()=>reject(tx.error);
  });
}

async function clearRange(fromISO,toISO){
  const all=await getAllLogs();
  const keep=all.filter(l=>!(l.date>=fromISO && l.date<=toISO));
  await clearAll();
  for(const l of keep) await putLog(l);
}
function sortAsc(logs){ return [...logs].sort((a,b)=>a.date.localeCompare(b.date)); }

/* ---------- Model ---------- */
function makeEmptyLog(date){
  const supplements={}; SUPPLEMENTS.forEach(s=>supplements[s.id]=false);
  const exercises={}; EXERCISES.forEach(e=>exercises[e.id]=false);
  return {
    id: uuid(),
    date,
    supplements,
    custom_vitamin_name:"",
    custom_vitamin_taken:false,
    exercises,
    fasted:false,
    water_fasted:false,
    fasting_blood_sugar:null,
    pre_dinner_sugar:null,
    post_dinner_sugar:null,
    waist_size:null,
    weight:null,
    fat_percentage:null,
    blood_pressure_systolic:null,
    blood_pressure_diastolic:null,
    grip_strength_left:null,
    grip_strength_right:null
  };
}

/* ---------- Lists (supplements/exercises) ---------- */
function buildListItem(container, id, label){
  const lbl=document.createElement("label");
  lbl.className="list-item";
  lbl.innerHTML = `
    <input type="checkbox" data-id="${id}">
    <span class="cb"></span>
    <span class="li-text">${escapeHtml(label)}</span>
  `;
  container.appendChild(lbl);
}
function escapeHtml(str){
  return String(str??"").replace(/[&<>"']/g,s=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[s]));
}
function setCheckboxes(containerSel, obj){
  const c=$(containerSel);
  c.querySelectorAll("input[type=checkbox][data-id]").forEach(cb=>{
    const id=cb.dataset.id;
    cb.checked=!!obj?.[id];
  });
}
function readCheckboxes(containerSel){
  const c=$(containerSel);
  const out={};
  c.querySelectorAll("input[type=checkbox][data-id]").forEach(cb=>{
    out[cb.dataset.id]=cb.checked;
  });
  return out;
}

function countTrue(obj){ return Object.values(obj||{}).reduce((a,v)=>a+(v===true?1:0),0); }

/* ---------- View switching ---------- */
function showView(id){
  document.querySelectorAll(".view").forEach(v=>v.classList.remove("view-active"));
  $("#"+id).classList.add("view-active");
  window.scrollTo({top:0, behavior:"instant"});
}


async function measurementsAllowed(dateISO){
  const interval = getMeasureInterval();
  if(interval <= 1) return true;

  const all = await getAllLogs();
  if(!all.length) return true;

  const first = all.map(l=>l.date).sort()[0];
  const d1 = new Date(first+"T00:00:00");
  const d2 = new Date(dateISO+"T00:00:00");
  const diff = Math.floor((d2-d1)/(1000*60*60*24));
  // allow only on anchor-based intervals: 0, interval, 2*interval, ...
  return diff % interval === 0;
}

/* ---------- Load/save ---------- */
async function loadDate(dateISO){
  $("#logDate").value = dateISO;
  $("#dateLabel").textContent = formatLong(dateISO);

  let log = await getLog(dateISO);
  if(!log) log = makeEmptyLog(dateISO);

  // supplements
  setCheckboxes("#suppMorning", log.supplements);
  setCheckboxes("#suppAfternoon", log.supplements);
  setCheckboxes("#suppEvening", log.supplements);

  $("#customVitaminName").value = log.custom_vitamin_name ?? "";
  $("#customVitaminTaken").checked = !!log.custom_vitamin_taken;

  // exercises
  setCheckboxes("#exerciseChecks", log.exercises);

  // fasting
  $("#fasted").checked = !!log.fasted;
  $("#waterFasted").checked = !!log.water_fasted;

  // numbers
  $("#fastingBloodSugar").value = log.fasting_blood_sugar ?? "";
  $("#preDinnerSugar").value = log.pre_dinner_sugar ?? "";
  $("#postDinnerSugar").value = log.post_dinner_sugar ?? "";

  $("#waistSize").value = log.waist_size ?? "";
  $("#weight").value = log.weight ?? "";
  $("#fatPercentage").value = log.fat_percentage ?? "";
  $("#bpSystolic").value = log.blood_pressure_systolic ?? "";
  $("#bpDiastolic").value = log.blood_pressure_diastolic ?? "";
  $("#gripLeft").value = log.grip_strength_left ?? "";
  $("#gripRight").value = log.grip_strength_right ?? "";

  updateSummary(log);

  const allowed = await measurementsAllowed(dateISO);
  const body = document.querySelector("#measureBody");
  const locked = document.querySelector("#measureLocked");
  if(body && locked){
    body.style.display = allowed ? "block" : "none";
    locked.style.display = allowed ? "none" : "block";
  }
  // safety: disable when locked
  document.querySelectorAll("#waistSize,#weight,#fatPercentage,#bpSystolic,#bpDiastolic,#gripLeft,#gripRight")
    .forEach(el=> el.disabled = !allowed);

  await updateRecordCount();
  setSaveEnabled(false);
}

async function collectFormIntoLog(existing){
  const date = $("#logDate").value || existing?.date || todayISO();
  const base = existing ?? makeEmptyLog(date);
  base.date = date;

  const supp = {...readCheckboxes("#suppMorning"), ...readCheckboxes("#suppAfternoon"), ...readCheckboxes("#suppEvening")};
  SUPPLEMENTS.forEach(s=>{ if(typeof supp[s.id] !== "boolean") supp[s.id]=false; });
  base.supplements = supp;

  base.custom_vitamin_name = ($("#customVitaminName").value ?? "").trim();
  base.custom_vitamin_taken = !!$("#customVitaminTaken").checked;

  const ex = readCheckboxes("#exerciseChecks");
  EXERCISES.forEach(e=>{ if(typeof ex[e.id] !== "boolean") ex[e.id]=false; });
  base.exercises = ex;

  base.fasted = !!$("#fasted").checked;
  base.water_fasted = !!$("#waterFasted").checked;

  base.fasting_blood_sugar = safeNum($("#fastingBloodSugar").value);
  base.pre_dinner_sugar = safeNum($("#preDinnerSugar").value);
  base.post_dinner_sugar = safeNum($("#postDinnerSugar").value);

  base.waist_size = safeNum($("#waistSize").value);
  base.weight = safeNum($("#weight").value);
  base.fat_percentage = safeNum($("#fatPercentage").value);

  base.blood_pressure_systolic = safeNum($("#bpSystolic").value);
  base.blood_pressure_diastolic = safeNum($("#bpDiastolic").value);

  base.grip_strength_left = safeNum($("#gripLeft").value);
  base.grip_strength_right = safeNum($("#gripRight").value);

  return base;
}

function setSaveEnabled(enabled){
  const btn=$("#btnSaveTop");
  btn.classList.toggle("enabled", enabled);
}

async function saveCurrent(){
  const date=$("#logDate").value || todayISO();
  const existing=await getLog(date);
  const log=await collectFormIntoLog(existing ?? makeEmptyLog(date));
  if(!log.id) log.id = uuid();
  await putLog(log);
  updateSummary(log);

  // Re-apply measurement lock state for this date (in case mode is interval)
  const allowed = await measurementsAllowed(date);
  const body = document.querySelector("#measureBody");
  const locked = document.querySelector("#measureLocked");
  if(body && locked){
    body.style.display = allowed ? "block" : "none";
    locked.style.display = allowed ? "none" : "block";
  }
  document.querySelectorAll("#waistSize,#weight,#fatPercentage,#bpSystolic,#bpDiastolic,#gripLeft,#gripRight")
    .forEach(el=> el.disabled = !allowed);

  await updateRecordCount();
  setSaveEnabled(false);
}

function updateSummary(log){
  const suppCount = countTrue(log.supplements) + (log.custom_vitamin_name?.trim() ? 1 : 0);
  const exCount = countTrue(log.exercises);

  $("#sumSupp").textContent = String(suppCount);
  $("#sumEx").textContent = String(exCount);

  // fasting summary like screenshot: -- if none, otherwise show Yes
  const anyFast = !!log.fasted || !!log.water_fasted;
  $("#sumFast").textContent = anyFast ? "Yes" : "--";
}

/* ---------- Record count ---------- */


function isLogEmpty(l){
  if(!l) return true;
  const anySupp = Object.values(l.supplements||{}).some(v=>v===true) || (!!(l.custom_vitamin_name||"").trim() && !!l.custom_vitamin_taken);
  const anyEx = Object.values(l.exercises||{}).some(v=>v===true);
  const anyFast = !!l.fasted || !!l.water_fasted;
  const nums = [
    l.fasting_blood_sugar,l.pre_dinner_sugar,l.post_dinner_sugar,
    l.waist_size,l.weight,l.fat_percentage,
    l.blood_pressure_systolic,l.blood_pressure_diastolic,
    l.grip_strength_left,l.grip_strength_right
  ];
  const anyNum = nums.some(v=>Number.isFinite(v));
  return !(anySupp || anyEx || anyFast || anyNum);
}

async function updateRangeStats(){
  const all0 = await getAllLogs();
  const all = all0.filter(l=>!isLogEmpty(l));
  const el = document.querySelector("#recordRange");
  if(!all.length){
    el.textContent = "Days logged: 0";
    return;
  }
  const dates = all.map(l=>l.date).sort();
  const daysLogged = dates.length;

  const [y1,m1,d1] = dates[0].split("-").map(Number);
  const [y2,m2,d2] = dates[dates.length-1].split("-").map(Number);
  const start = new Date(Date.UTC(y1,m1-1,d1));
  const end = new Date(Date.UTC(y2,m2-1,d2));
  const spanDays = Math.floor((end-start)/(1000*60*60*24)) + 1;

  el.textContent = `Days logged: ${daysLogged} • Span: ${spanDays} day${spanDays===1?"":"s"}`;
}


async function updateRecordCount(){
  const all=await getAllLogs();
  $("#recordCount").textContent = `${all.length} record${all.length===1?"":"s"} stored`;
  await updateRangeStats();
}

/* ---------- Import/Export ---------- */
function downloadBlob(filename, blob){
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a);
  a.click(); a.remove();
  setTimeout(()=>URL.revokeObjectURL(url), 1500);
}
function toCSV(logs){
  const suppCols = SUPPLEMENTS.map(s=>`supp_${s.id}`);
  const exCols = EXERCISES.map(e=>`ex_${e.id}`);
  const cols = [
    "id","date",
    ...suppCols,
    "custom_vitamin_name","custom_vitamin_taken",
    ...exCols,
    "fasted","water_fasted",
    "fasting_blood_sugar","pre_dinner_sugar","post_dinner_sugar",
    "waist_size","weight","fat_percentage",
    "blood_pressure_systolic","blood_pressure_diastolic",
    "grip_strength_left","grip_strength_right",
  ];
  const esc=(v)=>{
    const s=(v??"").toString();
    if(/[,"\n]/.test(s)) return `"${s.replace(/"/g,'""')}"`;
    return s;
  };
  const lines=[cols.join(",")];
  for(const l of logs){
    const row=[];
    row.push(l.id??"");
    row.push(l.date??"");
    SUPPLEMENTS.forEach(s=>row.push(l.supplements?.[s.id]?"1":"0"));
    row.push(l.custom_vitamin_name??"");
    row.push(l.custom_vitamin_taken?"1":"0");
    EXERCISES.forEach(e=>row.push(l.exercises?.[e.id]?"1":"0"));
    row.push(l.fasted?"1":"0");
    row.push(l.water_fasted?"1":"0");
    row.push(l.fasting_blood_sugar??"");
    row.push(l.pre_dinner_sugar??"");
    row.push(l.post_dinner_sugar??"");
    row.push(l.waist_size??"");
    row.push(l.weight??"");
    row.push(l.fat_percentage??"");
    row.push(l.blood_pressure_systolic??"");
    row.push(l.blood_pressure_diastolic??"");
    row.push(l.grip_strength_left??"");
    row.push(l.grip_strength_right??"");
    lines.push(row.map(esc).join(","));
  }
  return lines.join("\n");
}
async function exportJSON(){
  const logs=sortAsc(await getAllLogs());
  downloadBlob(`health-tracker-export-${todayISO()}.json`, new Blob([JSON.stringify(logs,null,2)], {type:"application/json"}));
}
async function exportCSV(){
  const logs=sortAsc(await getAllLogs());
  downloadBlob(`health-tracker-export-${todayISO()}.csv`, new Blob([toCSV(logs)], {type:"text/csv"}));
}
async function importJSON(){
  const file=$("#importFile").files?.[0];
  if(!file){ alert("Pick a JSON file first."); return; }
  let data;
  try{
    data = JSON.parse(await file.text());
  }catch(e){
    alert("Invalid JSON file.");
    return;
  }
  const items=Array.isArray(data)?data:[data];
  let count=0;
  for(const raw of items){
    if(!raw || typeof raw!=="object") continue;
    const date=raw.date;
    if(!date || typeof date!=="string") continue;
    const base=makeEmptyLog(date);
    const merged={
      ...base,
      ...raw,
      date,
      id: raw.id ?? base.id,
      supplements: {...base.supplements, ...(raw.supplements??{})},
      exercises: {...base.exercises, ...(raw.exercises??{})},
    };
    const numFields=[
      "fasting_blood_sugar","pre_dinner_sugar","post_dinner_sugar",
      "waist_size","weight","fat_percentage",
      "blood_pressure_systolic","blood_pressure_diastolic",
      "grip_strength_left","grip_strength_right"
    ];
    for(const f of numFields){
      merged[f]=(merged[f]===""||merged[f]===undefined)?null:(Number.isFinite(Number(merged[f]))?Number(merged[f]):null);
    }
    merged.fasted=!!merged.fasted;
    merged.water_fasted=!!merged.water_fasted;
    merged.custom_vitamin_name=(merged.custom_vitamin_name??"").toString();
    merged.custom_vitamin_taken=!!merged.custom_vitamin_taken;

    await putLog(merged);
    count++;
  }
  alert(`Imported ${count} log(s).`);
  await updateRecordCount();
  await loadDate($("#logDate").value || todayISO());
}


async function importCSV(){
  const file = document.querySelector("#importCSVFile").files?.[0];
  if(!file){ alert("Pick a CSV file first."); return; }
  const text = await file.text();
  const lines = text.trim().split(/\r?\n/);
  if(lines.length<2){ alert("CSV appears empty."); return; }

  const headers = lines[0].split(",");
  let count=0;

  for(let i=1;i<lines.length;i++){
    const row = lines[i].split(",");
    const obj = {};
    headers.forEach((h,idx)=> obj[h]=row[idx]);

    if(!obj.date) continue;

    const base = makeEmptyLog(obj.date);

    // supplements
    const supp={...base.supplements};
    Object.keys(supp).forEach(k=>{
      const v=obj["supp_"+k];
      supp[k]= v==="1" || v==="true";
    });

    // exercises
    const ex={...base.exercises};
    Object.keys(ex).forEach(k=>{
      const v=obj["ex_"+k];
      ex[k]= v==="1" || v==="true";
    });

    const merged={
      ...base,
      ...obj,
      id: obj.id || base.id,
      supplements:supp,
      exercises:ex,
      custom_vitamin_name: obj.custom_vitamin_name || "",
      custom_vitamin_taken: obj.custom_vitamin_taken==="1" || obj.custom_vitamin_taken==="true",
      fasted: obj.fasted==="1" || obj.fasted==="true",
      water_fasted: obj.water_fasted==="1" || obj.water_fasted==="true",
    };

    const nums=[
      "fasting_blood_sugar","pre_dinner_sugar","post_dinner_sugar",
      "waist_size","weight","fat_percentage",
      "blood_pressure_systolic","blood_pressure_diastolic",
      "grip_strength_left","grip_strength_right"
    ];
    nums.forEach(n=>{
      merged[n] = obj[n]==="" ? null : Number(obj[n]);
      if(!Number.isFinite(merged[n])) merged[n]=null;
    });

    await putLog(merged);
    count++;
  }

  alert("Imported "+count+" rows from CSV.");
  await updateRecordCount();
  await loadDate(document.querySelector("#logDate").value);
}

/* ---------- Clear range / clear all ---------- */
function openRangeModal(){
  $("#modalRange").classList.add("show");
  $("#modalRange").setAttribute("aria-hidden","false");
}
function closeRangeModal(){
  $("#modalRange").classList.remove("show");
  $("#modalRange").setAttribute("aria-hidden","true");
}
async function clearAllWithConfirm(){
  const ok = confirm("Clear ALL data on this device? This cannot be undone.");
  if(!ok) return false;
  await clearAll();
  await updateRecordCount();
  await loadDate($("#logDate").value || todayISO());
  alert("All data cleared.");
  return true;
}

/* ---------- Charts (canvas) ---------- */
function hashToColor(str){
  let h=0; for(let i=0;i<str.length;i++) h=(h*31 + str.charCodeAt(i))>>>0;
  const hue=h%360;
  return `hsl(${hue} 78% 55%)`;
}
function setLegend(items){
  const el=$("#chartLegend");
  el.innerHTML="";
  for(const it of items){
    const d=document.createElement("div");
    d.className="item";
    d.innerHTML=`<span class="sw" style="background:${it.color}"></span>${escapeHtml(it.label)}`;
    el.appendChild(d);
  }
}
function niceMinMax(values){
  const vals=values.filter(v=>Number.isFinite(v));
  if(vals.length===0) return {min:0,max:1};
  let min=Math.min(...vals), max=Math.max(...vals);
  if(min===max){ min-=1; max+=1; }
  const pad=(max-min)*0.08;
  return {min:min-pad, max:max+pad};
}
function scaleLinear(d0,d1,r0,r1){
  const d=(d1-d0)||1;
  const r=(r1-r0);
  return (x)=> r0 + ((x-d0)/d)*r;
}
function drawAxes(ctx,w,h,pad,yMin,yMax,yLabel, startLabel, endLabel){
  ctx.clearRect(0,0,w,h);

  // grid
  ctx.save();
  ctx.strokeStyle="rgba(15,23,42,.12)";
  ctx.lineWidth=1;
  const grid=5;
  for(let i=0;i<=grid;i++){
    const y=pad+(h-2*pad)*(i/grid);
    ctx.beginPath(); ctx.moveTo(pad,y); ctx.lineTo(w-pad,y); ctx.stroke();
  }
  // axes
  ctx.strokeStyle="rgba(15,23,42,.35)";
  ctx.lineWidth=1.2;
  ctx.beginPath();
  ctx.moveTo(pad,pad); ctx.lineTo(pad,h-pad); ctx.lineTo(w-pad,h-pad);
  ctx.stroke();

  // labels
  ctx.fillStyle="rgba(15,23,42,.72)";
  ctx.font="12px system-ui,Segoe UI,Arial";
  ctx.fillText(yLabel, pad, 14);
  ctx.fillText(yMax.toFixed(1), 8, pad+4);
  ctx.fillText(yMin.toFixed(1), 8, h-pad+4);

  if(startLabel){
    ctx.fillStyle="rgba(15,23,42,.55)";
    ctx.fillText(startLabel, pad, h-10);
    const tw=ctx.measureText(endLabel).width;
    ctx.fillText(endLabel, w-pad-tw, h-10);
  }
  ctx.restore();
}
function drawLine(ctx,xScale,yScale,pts,color){
  const p=pts.filter(v=>Number.isFinite(v.y));
  if(p.length<2) return;
  ctx.save();
  ctx.strokeStyle=color;
  ctx.lineWidth=2.2;
  ctx.beginPath();
  p.forEach((pt,i)=>{
    const x=xScale(pt.x), y=yScale(pt.y);
    if(i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.fillStyle=color;
  p.forEach(pt=>{
    const x=xScale(pt.x), y=yScale(pt.y);
    ctx.beginPath(); ctx.arc(x,y,3.2,0,Math.PI*2); ctx.fill();
  });
  ctx.restore();
}
function drawBars(ctx,w,h,pad,items){
  ctx.clearRect(0,0,w,h);
  // axes
  ctx.strokeStyle="rgba(15,23,42,.35)";
  ctx.lineWidth=1.2;
  ctx.beginPath();
  ctx.moveTo(pad,pad); ctx.lineTo(pad,h-pad); ctx.lineTo(w-pad,h-pad);
  ctx.stroke();

  const max=Math.max(1,...items.map(i=>i.value));
  ctx.fillStyle="rgba(15,23,42,.72)";
  ctx.font="12px system-ui,Segoe UI,Arial";
  ctx.fillText("Count", pad, 14);
  ctx.fillStyle="rgba(15,23,42,.55)";
  ctx.fillText(String(max), 10, pad+4);
  ctx.fillText("0", 18, h-pad+4);

  const areaW=w-2*pad;
  const gap=14;
  const barW=Math.max(28, (areaW - gap*(items.length-1)) / items.length);
  const y0=h-pad;
  const yScale=scaleLinear(0,max,0,h-2*pad);

  items.forEach((it,idx)=>{
    const color=it.color;
    const x=pad + idx*(barW+gap);
    const bh=yScale(it.value);
    const y=y0-bh;
    ctx.fillStyle=color;
    ctx.globalAlpha=0.85;
    ctx.fillRect(x,y,barW,bh);
    ctx.globalAlpha=1;

    ctx.fillStyle="rgba(15,23,42,.85)";
    ctx.font="12px system-ui,Segoe UI,Arial";
    const ctext=String(it.value);
    const tw=ctx.measureText(ctext).width;
    ctx.fillText(ctext, x+(barW-tw)/2, Math.max(pad+14, y-6));

    ctx.fillStyle="rgba(15,23,42,.6)";
    ctx.font="11px system-ui,Segoe UI,Arial";
    const label=it.label;
    const lw=ctx.measureText(label).width;
    ctx.fillText(label, x+(barW-lw)/2, h-pad+18);
  });
}

async function renderChart(kind){
  const allAsc=sortAsc(await getAllLogs());
  const canvas=$("#chartCanvas");
  const ctx=canvas.getContext("2d");
  const w=canvas.width, h=canvas.height;
  const pad=54;

  const emptyEl=$("#chartEmpty");
  const legendEl=$("#chartLegend");
  const iconEl=$("#chartIcon");
  const titleEl=$("#chartTitle");

  if(allAsc.length===0){
    emptyEl.style.display="block";
    legendEl.innerHTML="";
    ctx.clearRect(0,0,w,h);
    return;
  }
  emptyEl.style.display="none";

  const pts = allAsc.map((l,i)=>({i, log:l}));

  function setHeader(icon, title){
    iconEl.textContent=icon;
    titleEl.textContent=title;
  }

  if(kind==="sugar"){
    setHeader("🩸","Blood Sugar");
    const series=[
      {label:"Fasting", get:(l)=>l.fasting_blood_sugar},
      {label:"Pre-dinner", get:(l)=>l.pre_dinner_sugar},
      {label:"Post-dinner", get:(l)=>l.post_dinner_sugar},
    ];
    const values=[];
    series.forEach(s=>pts.forEach(p=>{const v=s.get(p.log); if(Number.isFinite(v)) values.push(v);}));
    const {min:yMin,max:yMax}=niceMinMax(values);
    const xMin=0, xMax=Math.max(1, pts.length-1);
    const xScale=scaleLinear(xMin,xMax,pad,w-pad);
    const yScale=scaleLinear(yMin,yMax,h-pad,pad);
    drawAxes(ctx,w,h,pad,yMin,yMax,"mmol/L", allAsc[0].date, allAsc[allAsc.length-1].date);
    const legend=[];
    series.forEach(s=>{
      const color=hashToColor(s.label);
      drawLine(ctx,xScale,yScale, pts.map(p=>({x:p.i,y:s.get(p.log)})), color);
      legend.push({label:s.label,color});
    });
    setLegend(legend);
    return;
  }

  if(kind==="weightfat"){
    setHeader("⚖️","Weight & Body");
    const series=[
      {label:"Weight (kg)", get:(l)=>l.weight},
      {label:"Fat (%)", get:(l)=>l.fat_percentage},
    ];
    const values=[];
    series.forEach(s=>pts.forEach(p=>{const v=s.get(p.log); if(Number.isFinite(v)) values.push(v);}));
    const {min:yMin,max:yMax}=niceMinMax(values);
    const xMin=0, xMax=Math.max(1, pts.length-1);
    const xScale=scaleLinear(xMin,xMax,pad,w-pad);
    const yScale=scaleLinear(yMin,yMax,h-pad,pad);
    drawAxes(ctx,w,h,pad,yMin,yMax,"kg / %", allAsc[0].date, allAsc[allAsc.length-1].date);
    const legend=[];
    series.forEach(s=>{
      const color=hashToColor(s.label);
      drawLine(ctx,xScale,yScale, pts.map(p=>({x:p.i,y:s.get(p.log)})), color);
      legend.push({label:s.label,color});
    });
    setLegend(legend);
    return;
  }

  if(kind==="waist"){
    setHeader("📏","Waist Size");
    const series=[{label:"Waist (cm)", get:(l)=>l.waist_size}];
    const values=[];
    pts.forEach(p=>{const v=p.log.waist_size; if(Number.isFinite(v)) values.push(v);});
    const {min:yMin,max:yMax}=niceMinMax(values);
    const xMin=0, xMax=Math.max(1, pts.length-1);
    const xScale=scaleLinear(xMin,xMax,pad,w-pad);
    const yScale=scaleLinear(yMin,yMax,h-pad,pad);
    drawAxes(ctx,w,h,pad,yMin,yMax,"cm", allAsc[0].date, allAsc[allAsc.length-1].date);
    const color=hashToColor("Waist");
    drawLine(ctx,xScale,yScale, pts.map(p=>({x:p.i,y:p.log.waist_size})), color);
    setLegend([{label:"Waist (cm)", color}]);
    return;
  }

  if(kind==="bp"){
    setHeader("❤️","Blood Pressure");
    const series=[
      {label:"Systolic", get:(l)=>l.blood_pressure_systolic},
      {label:"Diastolic", get:(l)=>l.blood_pressure_diastolic},
    ];
    const values=[];
    series.forEach(s=>pts.forEach(p=>{const v=s.get(p.log); if(Number.isFinite(v)) values.push(v);}));
    const {min:yMin,max:yMax}=niceMinMax(values);
    const xMin=0, xMax=Math.max(1, pts.length-1);
    const xScale=scaleLinear(xMin,xMax,pad,w-pad);
    const yScale=scaleLinear(yMin,yMax,h-pad,pad);
    drawAxes(ctx,w,h,pad,yMin,yMax,"mmHg", allAsc[0].date, allAsc[allAsc.length-1].date);
    const legend=[];
    series.forEach(s=>{
      const color=hashToColor(s.label);
      drawLine(ctx,xScale,yScale, pts.map(p=>({x:p.i,y:s.get(p.log)})), color);
      legend.push({label:s.label,color});
    });
    setLegend(legend);
    return;
  }

  if(kind==="grip"){
    setHeader("✊","Grip Strength");
    const series=[
      {label:"Left", get:(l)=>l.grip_strength_left},
      {label:"Right", get:(l)=>l.grip_strength_right},
    ];
    const values=[];
    series.forEach(s=>pts.forEach(p=>{const v=s.get(p.log); if(Number.isFinite(v)) values.push(v);}));
    const {min:yMin,max:yMax}=niceMinMax(values);
    const xMin=0, xMax=Math.max(1, pts.length-1);
    const xScale=scaleLinear(xMin,xMax,pad,w-pad);
    const yScale=scaleLinear(yMin,yMax,h-pad,pad);
    drawAxes(ctx,w,h,pad,yMin,yMax,"kg", allAsc[0].date, allAsc[allAsc.length-1].date);
    const legend=[];
    series.forEach(s=>{
      const color=hashToColor("Grip "+s.label);
      drawLine(ctx,xScale,yScale, pts.map(p=>({x:p.i,y:s.get(p.log)})), color);
      legend.push({label:s.label,color});
    });
    setLegend(legend);
    return;
  }

  if(kind==="activity"){
    setHeader("✅","Activity");
    const items=[
      {label:"Supps", value: allAsc.reduce((a,l)=>a+countTrue(l.supplements)+(l.custom_vitamin_name?.trim()&&l.custom_vitamin_taken?1:0),0)},
      {label:"Ex", value: allAsc.reduce((a,l)=>a+countTrue(l.exercises),0)},
      {label:"Fasted", value: allAsc.reduce((a,l)=>a+(l.fasted?1:0),0)},
      {label:"Water", value: allAsc.reduce((a,l)=>a+(l.water_fasted?1:0),0)},
    ].map(it=>({...it, color:hashToColor(it.label)}));

    drawBars(ctx,w,h,pad,items);
    setLegend(items.map(it=>({label:it.label, color:it.color})));
    return;
  }
}

/* ---------- SW (offline) ---------- */
async function registerSW(){
  if(!("serviceWorker" in navigator)) return;
  try{
    const reg = await navigator.serviceWorker.register("service-worker.js");
    reg.update?.();
  }catch(e){
    console.warn("SW register failed", e);
  }
}

/* ---------- Dirty tracking ---------- */
function attachDirtyTracking(){
  const inputs = document.querySelectorAll("input, select");
  inputs.forEach(el=>{
    el.addEventListener("change", ()=> setSaveEnabled(true));
    el.addEventListener("input", ()=> setSaveEnabled(true));
  });
  // list items are checkboxes hidden; changes still fire
}

/* ---------- Init ---------- */
window.addEventListener("load", async ()=>{
  // build lists
  const m=$("#suppMorning"), a=$("#suppAfternoon"), e=$("#suppEvening");
  SUPPLEMENTS.forEach(s=>{
    const target = s.time==="Morning"?m : s.time==="Afternoon"?a : e;
    buildListItem(target, s.id, s.name);
  });
  const ex=$("#exerciseChecks");
  EXERCISES.forEach(x=>buildListItem(ex, x.id, x.name));

  // Restore measurement frequency settings
  try{
    const savedMode = localStorage.getItem("measureFreqMode");
    const savedIv = localStorage.getItem("measureIntervalDays");
    if(savedMode) document.querySelector("#measureFreq").value = savedMode;
    if(savedIv) document.querySelector("#measureInterval").value = savedIv;
  }catch(e){}


  // date
  const start = todayISO();
  $("#logDate").value = start;

  // date picker button
  $("#btnPickDate").addEventListener("click", ()=>{
    $("#logDate").showPicker?.();
    $("#logDate").focus();
  });
  $("#logDate").addEventListener("change", async ()=>{
    await loadDate($("#logDate").value || todayISO());
  });
  $("#btnPrevDay").addEventListener("click", async ()=>{
    const d = $("#logDate").value || todayISO();
    await loadDate(addDays(d, -1));
  });
  $("#btnNextDay").addEventListener("click", async ()=>{
    const d = $("#logDate").value || todayISO();
    await loadDate(addDays(d, +1));
  });

  $("#btnSaveTop").addEventListener("click", async ()=> {
    await saveCurrent();
    // small feedback flash
    $("#btnSaveTop").textContent = "Saved";
    setTimeout(()=>$("#btnSaveTop").innerHTML = '<span class="ico">💾</span><span>Save</span>', 900);
  });

  // data buttons
  $("#btnExportJSON").addEventListener("click", exportJSON);
  $("#btnExportCSV").addEventListener("click", exportCSV);
  $("#btnImport").addEventListener("click", importJSON);
  $("#btnImportCSV").addEventListener("click", importCSV);

  $("#btnViewCharts").addEventListener("click", async ()=>{
    showView("view-charts");
    // default chart
    document.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
    document.querySelector('.chip[data-chart="sugar"]').classList.add("active");
    await renderChart("sugar");
  });
  $("#btnBackFromCharts").addEventListener("click", ()=>{
    showView("view-main");
  });

  // chips
  $("#chartChips").addEventListener("click", async (ev)=>{
    const btn = ev.target.closest(".chip");
    if(!btn) return;
    document.querySelectorAll(".chip").forEach(c=>c.classList.remove("active"));
    btn.classList.add("active");
    await renderChart(btn.dataset.chart);
  });

  // clear range modal
  $("#btnClearRangeOpen").addEventListener("click", openRangeModal);
  $("#btnCancelRange").addEventListener("click", closeRangeModal);
  $("#modalRange").addEventListener("click",(e)=>{
    if(e.target?.dataset?.close==="1") closeRangeModal();
  });
  $("#btnClearRange").addEventListener("click", async ()=>{
    const from=$("#clearFrom").value;
    const to=$("#clearTo").value;
    if(!from || !to){ alert("Pick both From and To dates."); return; }
    if(from>to){ alert("From must be before To."); return; }
    if(!confirm(`Clear logs from ${from} to ${to} (inclusive)?`)) return;
    await clearRange(from,to);
    closeRangeModal();
    await updateRecordCount();
    await loadDate($("#logDate").value || todayISO());
    alert("Range cleared.");
  });

  // clear all toggle (must toggle ON to trigger)
  $("#toggleClearAll").addEventListener("change", async ()=>{
    if($("#toggleClearAll").checked){
      const done = await clearAllWithConfirm();
      $("#toggleClearAll").checked = false;
      if(done) setSaveEnabled(false);
    }
  });

  // live summary updates
  ["#suppMorning","#suppAfternoon","#suppEvening","#exerciseChecks"].forEach(sel=>{
    $(sel).addEventListener("change", async ()=>{
      const date=$("#logDate").value || todayISO();
      const log = await collectFormIntoLog(makeEmptyLog(date));
      updateSummary(log);

  const allowed = await measurementsAllowed(dateISO);
  document.querySelectorAll("#waistSize,#weight,#fatPercentage,#bpSystolic,#bpDiastolic,#gripLeft,#gripRight")
    .forEach(el=> el.disabled = !allowed);

    });
  });
  ["#customVitaminName","#customVitaminTaken","#fasted","#waterFasted"].forEach(sel=>{
    $(sel).addEventListener("change", async ()=>{
      const date=$("#logDate").value || todayISO();
      const log = await collectFormIntoLog(makeEmptyLog(date));
      updateSummary(log);

  const allowed = await measurementsAllowed(dateISO);
  document.querySelectorAll("#waistSize,#weight,#fatPercentage,#bpSystolic,#bpDiastolic,#gripLeft,#gripRight")
    .forEach(el=> el.disabled = !allowed);

    });
  });

  
  // Frequency UI (show custom interval input when needed)
  const updateFreqUI = async ()=>{
    const mode = document.querySelector("#measureFreq").value;
    const wrap = document.querySelector("#freqCustomWrap");
    if(mode==="custom") wrap.style.display="flex";
    else wrap.style.display="none";

    // Normalize custom value
    if(mode==="custom"){
      const iv = getMeasureInterval();
      document.querySelector("#measureInterval").value = String(iv);
    }
    // Re-evaluate measurement enable/disable for current day
    await loadDate(document.querySelector("#logDate").value || todayISO());
  };

  document.querySelector("#measureFreq").addEventListener("change", updateFreqUI);
  document.querySelector("#measureInterval").addEventListener("change", updateFreqUI);
  document.querySelector("#measureInterval").addEventListener("input", ()=> setSaveEnabled(true));

  attachDirtyTracking();
  await registerSW();

  await loadDate(start);
  try{ document.querySelector('#measureFreq').dispatchEvent(new Event('change')); }catch(e){}
});
