const API = "";
let state = {
  token: localStorage.getItem("token") || null,
  user: null,
  houses: [],
  currentHouseId: parseInt(localStorage.getItem("houseId") || "0") || null,
  view: localStorage.getItem("view") || "weekly",
  anchor: new Date(), // today
  calendar: null,
  draggingId: null,
  selectedDay: null,
  authMode: "login",
};

function headers() {
  const h = { "Content-Type": "application/json" };
  if (state.token) h["Authorization"] = "Bearer " + state.token;
  return h;
}
async function api(path, opts={}) {
  opts.headers = { ...headers(), ...(opts.headers||{}) };
  const res = await fetch(API + path, opts);
  const data = await res.json().catch(()=>({}));
  if (!res.ok) throw new Error(data.detail || data.msg || JSON.stringify(data));
  return data;
}
function saveState(){
  if(state.token) localStorage.setItem("token", state.token); else localStorage.removeItem("token");
  if(state.currentHouseId) localStorage.setItem("houseId", state.currentHouseId); else localStorage.removeItem("houseId");
  localStorage.setItem("view", state.view);
}
function fmtDate(d){ return d.toISOString().slice(0,10); }
function parseDate(s){ return new Date(s+"T12:00:00"); }
function mondayOf(d){
  const x = new Date(d);
  const day = x.getDay(); // 0 Sun
  const diff = (day===0 ? -6 : 1 - day);
  x.setDate(x.getDate()+diff);
  x.setHours(12,0,0,0);
  return x;
}
function addDays(d,n){ const x=new Date(d); x.setDate(x.getDate()+n); return x; }
function rangeForView(){
  if(state.view==="weekly"){
    const mon = mondayOf(state.anchor);
    return {from: fmtDate(mon), to: fmtDate(addDays(mon,6)), label: `Week of ${fmtDate(mon)}`};
  } else if(state.view==="monthly"){
    const y=state.anchor.getFullYear(), m=state.anchor.getMonth();
    const first=new Date(y,m,1); const last=new Date(y,m+1,0);
    return {from: fmtDate(first), to: fmtDate(last), label: first.toLocaleString('default',{month:'long',year:'numeric'})};
  } else {
    const d=fmtDate(state.anchor);
    return {from:d,to:d,label: d};
  }
}

// --- init ---
document.addEventListener("DOMContentLoaded", async ()=>{
  bindEvents();
  updateViewButtons();
  if(state.token){
    try{
      state.user = await api("/api/me");
      onLoggedIn();
    } catch(e){
      state.token=null; saveState(); showAuth();
    }
  } else showAuth();
});

function bindEvents(){
  document.getElementById("tab-login").onclick=()=>setAuthMode("login");
  document.getElementById("tab-register").onclick=()=>setAuthMode("register");
  document.getElementById("auth-form").onsubmit=handleAuth;
  document.getElementById("logout-btn").onclick=logout;
  document.getElementById("house-create-btn").onclick=createHouse;
  document.getElementById("house-join-btn").onclick=joinHouse;
  document.getElementById("house-select").onchange=e=>{ state.currentHouseId=parseInt(e.target.value); saveState(); loadCalendar(); };
  document.getElementById("buffer-toggle").onchange=toggleBuffer;
  document.querySelectorAll(".view-btn").forEach(b=> b.onclick=()=>{ state.view=b.dataset.view; saveState(); updateViewButtons(); loadCalendar(); });
  document.getElementById("prev-btn").onclick=()=>{ shift(-1); };
  document.getElementById("next-btn").onclick=()=>{ shift(1); };
  document.getElementById("today-btn").onclick=()=>{ state.anchor=new Date(); loadCalendar(); };
  document.getElementById("modal-close").onclick=closeModal;
  document.querySelector("#day-modal .modal-overlay").onclick=closeModal;
  document.getElementById("add-slot-btn").onclick=addSlot;
  document.getElementById("modal-buffer-add").onclick=()=> addPlateFromInput(document.getElementById("modal-buffer-title"), document.getElementById("modal-buffer-note"), state.selectedDay, null, document.getElementById("modal-buffer-ac"));
  // global buffer add
  const gTitle=document.querySelector("#global-buffer .plate-title-input");
  const gNote=document.querySelector("#global-buffer .plate-note-input");
  const gBtn=document.querySelector("#global-buffer .plate-add-btn");
  const gAc=document.querySelector("#global-buffer .autocomplete");
  gBtn.onclick=()=> addPlateFromInput(gTitle,gNote,null,null,gAc);
  setupAutocomplete(gTitle,gAc);
  setupAutocomplete(document.getElementById("modal-buffer-title"), document.getElementById("modal-buffer-ac"));
  // drag for global buffer
  const gb=document.getElementById("global-buffer");
  gb.addEventListener("dragover", e=>{ e.preventDefault(); gb.classList.add("drag-over"); });
  gb.addEventListener("dragleave", ()=> gb.classList.remove("drag-over"));
  gb.addEventListener("drop", e=>{ e.preventDefault(); gb.classList.remove("drag-over"); if(state.draggingId) movePlate(state.draggingId, null, null); });
}

function setAuthMode(m){
  state.authMode=m;
  document.getElementById("tab-login").classList.toggle("active", m==="login");
  document.getElementById("tab-register").classList.toggle("active", m==="register");
  document.getElementById("auth-submit").textContent=m==="login"?"Login":"Register";
}
async function handleAuth(e){
  e.preventDefault();
  const u=document.getElementById("auth-username").value.trim();
  const p=document.getElementById("auth-password").value;
  const msg=document.getElementById("auth-msg");
  msg.textContent="";
  try{
    const path = state.authMode==="login"?"/api/auth/login":"/api/auth/register";
    const data=await api(path,{method:"POST", body:JSON.stringify({username:u,password:p})});
    state.token=data.token; state.user=data.user; saveState(); onLoggedIn();
  }catch(err){ msg.textContent=err.message; }
}
function logout(){ state.token=null; state.user=null; saveState(); showAuth(); }
function showAuth(){
  document.getElementById("auth-view").style.display="flex";
  document.getElementById("houses-view").style.display="none";
  document.getElementById("app-view").style.display="none";
  document.getElementById("logout-btn").style.display="none";
  document.getElementById("user-info").textContent="";
}
async function onLoggedIn(){
  document.getElementById("auth-view").style.display="none";
  document.getElementById("logout-btn").style.display="inline-block";
  document.getElementById("user-info").textContent=state.user.username;
  await loadHouses();
}
async function loadHouses(){
  try{
    state.houses=await api("/api/houses");
  }catch(e){ state.houses=[]; }
  const list=document.getElementById("houses-list");
  const sel=document.getElementById("house-select");
  list.innerHTML=""; sel.innerHTML="";
  if(state.houses.length===0){
    list.innerHTML="<div class='card'>No houses yet — create or join one.</div>";
  } else {
    state.houses.forEach(h=>{
      const div=document.createElement("div");
      div.className="card house-card";
      div.innerHTML=`<strong>${h.name}</strong><br><small>code: ${h.invite_code} — ${h.buffer_mode}</small>`;
      div.onclick=()=>{ state.currentHouseId=h.id; saveState(); showApp(); loadCalendar(); };
      list.appendChild(div);
      const opt=document.createElement("option");
      opt.value=h.id; opt.textContent=h.name;
      if(h.id===state.currentHouseId) opt.selected=true;
      sel.appendChild(opt);
    });
    // if current not in list, pick first
    if(!state.currentHouseId || !state.houses.find(h=>h.id===state.currentHouseId)){
      state.currentHouseId=state.houses[0].id; saveState();
    }
  }
  // decide view
  if(state.houses.length>0){
    document.getElementById("houses-view").style.display="none";
    showApp();
    await loadCalendar();
  } else {
    document.getElementById("houses-view").style.display="block";
    document.getElementById("app-view").style.display="none";
  }
}
function showApp(){
  document.getElementById("houses-view").style.display="none";
  document.getElementById("app-view").style.display="block";
  updateViewButtons();
}
function updateViewButtons(){
  document.querySelectorAll(".view-btn").forEach(b=> b.classList.toggle("active", b.dataset.view===state.view));
}
async function createHouse(){
  const name=document.getElementById("house-create-name").value.trim();
  const msg=document.getElementById("house-create-msg");
  msg.textContent="";
  if(!name){ msg.textContent="name required"; return; }
  try{
    const h=await api("/api/houses",{method:"POST", body:JSON.stringify({name})});
    state.currentHouseId=h.id; saveState(); document.getElementById("house-create-name").value=""; await loadHouses();
  }catch(e){ msg.textContent=e.message; }
}
async function joinHouse(){
  const code=document.getElementById("house-join-code").value.trim();
  const msg=document.getElementById("house-join-msg");
  msg.textContent="";
  if(!code){ msg.textContent="code required"; return; }
  try{
    const h=await api("/api/houses/join",{method:"POST", body:JSON.stringify({invite_code:code})});
    state.currentHouseId=h.id; saveState(); document.getElementById("house-join-code").value=""; await loadHouses();
  }catch(e){ msg.textContent=e.message; }
}
function shift(dir){
  if(state.view==="weekly") state.anchor=addDays(state.anchor, dir*7);
  else if(state.view==="monthly"){ const d=new Date(state.anchor); d.setMonth(d.getMonth()+dir); state.anchor=d; }
  else state.anchor=addDays(state.anchor, dir);
  loadCalendar();
}
async function toggleBuffer(e){
  const mode=e.target.checked?"per_day":"global";
  try{
    await api(`/api/houses/${state.currentHouseId}/buffer`,{method:"PUT", body:JSON.stringify({mode})});
    loadCalendar();
  }catch(err){ alert(err.message); e.target.checked=!e.target.checked; }
}
async function loadCalendar(){
  if(!state.currentHouseId) return;
  const {from,to,label}=rangeForView();
  document.getElementById("range-label").textContent=label;
  try{
    const data=await api(`/api/calendar?house_id=${state.currentHouseId}&from=${from}&to=${to}`);
    state.calendar=data;
    // update house invite + buffer toggle
    document.getElementById("house-invite").textContent=`code: ${data.house.invite_code}`;
    document.getElementById("buffer-toggle").checked = data.house.buffer_mode==="per_day";
    document.getElementById("buffer-mode-label").textContent=`(${data.house.buffer_mode})`;
    // ensure select matches
    const sel=document.getElementById("house-select");
    if(sel.value!=String(state.currentHouseId)) sel.value=state.currentHouseId;
    render();
  }catch(e){
    console.error(e);
    alert("calendar load failed: "+e.message);
  }
}
function render(){
  const w=document.getElementById("weekly-view");
  const m=document.getElementById("monthly-view");
  const d=document.getElementById("daily-view");
  w.style.display= state.view==="weekly"?"grid":"none";
  m.style.display= state.view==="monthly"?"block":"none";
  d.style.display= state.view==="daily"?"block":"none";
  if(state.view==="weekly") renderWeekly();
  else if(state.view==="monthly") renderMonthly();
  else renderDaily();
  renderGlobalBuffer();
}
function renderWeekly(){
  const c=document.getElementById("weekly-view");
  c.innerHTML="";
  if(!state.calendar) return;
  state.calendar.days.forEach(day=>{
    const col=document.createElement("div");
    col.className="day-column";
    const d=parseDate(day.date);
    const header=document.createElement("div");
    header.className="day-header";
    header.innerHTML=`<strong>${d.toLocaleDateString('default',{weekday:'short'})}</strong><small>${day.date}</small>`;
    header.onclick=()=> openModal(day.date);
    col.appendChild(header);
    const slotsWrap=document.createElement("div");
    slotsWrap.className="day-slots";
    day.slots.forEach(slot=>{
      const sDiv=renderSlot(slot, day.date);
      slotsWrap.appendChild(sDiv);
    });
    col.appendChild(slotsWrap);
    // per_day buffer inside day column if mode per_day and has buffer
    if(state.calendar.house.buffer_mode==="per_day" && day.day_buffer.length>0){
      const buf=document.createElement("div");
      buf.className="buffer-zone";
      buf.style.margin="8px";
      buf.innerHTML=`<h3 style="font-size:13px">Day buffer</h3>`;
      const platesDiv=document.createElement("div");
      platesDiv.className="plates";
      day.day_buffer.forEach(p=> platesDiv.appendChild(renderPlate(p, day.date, null)));
      buf.appendChild(platesDiv);
      // drop zone for per_day buffer
      buf.addEventListener("dragover", e=>{ e.preventDefault(); buf.classList.add("drag-over"); });
      buf.addEventListener("dragleave", ()=> buf.classList.remove("drag-over"));
      buf.addEventListener("drop", e=>{ e.preventDefault(); buf.classList.remove("drag-over"); if(state.draggingId) movePlate(state.draggingId, day.date, null); });
      col.appendChild(buf);
    }
    // add plate to day buffer quick add if per_day
    if(state.calendar.house.buffer_mode==="per_day"){
      const add=document.createElement("div");
      add.className="add-plate";
      add.style.padding="8px";
      add.innerHTML=`<input class="plate-title-input" placeholder="Add to day buffer" data-date="${day.date}"><input class="plate-note-input" placeholder="note"><button class="plate-add-btn">Add</button><div class="autocomplete"></div>`;
      const titleIn=add.querySelector(".plate-title-input");
      const noteIn=add.querySelector(".plate-note-input");
      const btn=add.querySelector("button");
      const ac=add.querySelector(".autocomplete");
      btn.onclick=()=> addPlateFromInput(titleIn, noteIn, day.date, null, ac);
      setupAutocomplete(titleIn, ac);
      col.appendChild(add);
    }
    c.appendChild(col);
  });
}
function renderSlot(slot, date){
  const div=document.createElement("div");
  div.className="slot";
  div.dataset.slotId=slot.id;
  div.dataset.date=date;
  const title=document.createElement("div");
  title.className="slot-title";
  title.innerHTML=`<span>${slot.label}</span>`;
  const del=document.createElement("button");
  del.textContent="✕";
  del.title="Delete slot";
  del.onclick=async()=>{ if(confirm(`Delete ${slot.label}? Plates move to buffer`)){ await api(`/api/slots/${slot.id}`,{method:"DELETE"}); loadCalendar(); } };
  // don't allow delete if only 2 default? allow but warn
  title.appendChild(del);
  div.appendChild(title);
  const platesDiv=document.createElement("div");
  platesDiv.className="plates";
  slot.plates.forEach(p=> platesDiv.appendChild(renderPlate(p, date, slot.id)));
  div.appendChild(platesDiv);
  // add plate form
  const add=document.createElement("div");
  add.className="add-plate";
  add.innerHTML=`<input class="plate-title-input" placeholder="Add plate to ${slot.label}" data-date="${date}" data-slot="${slot.id}"><input class="plate-note-input" placeholder="note"><button class="plate-add-btn">Add</button><div class="autocomplete"></div>`;
  const titleIn=add.querySelector(".plate-title-input");
  const noteIn=add.querySelector(".plate-note-input");
  const btn=add.querySelector("button");
  const ac=add.querySelector(".autocomplete");
  btn.onclick=()=> addPlateFromInput(titleIn, noteIn, date, slot.id, ac);
  setupAutocomplete(titleIn, ac);
  div.appendChild(add);
  // DnD
  div.addEventListener("dragover", e=>{ e.preventDefault(); div.classList.add("drag-over"); });
  div.addEventListener("dragleave", ()=> div.classList.remove("drag-over"));
  div.addEventListener("drop", e=>{
    e.preventDefault(); div.classList.remove("drag-over");
    if(state.draggingId) movePlate(state.draggingId, date, slot.id);
  });
  return div;
}
function renderPlate(p, date, slotId){
  const div=document.createElement("div");
  div.className="plate";
  div.draggable=true;
  div.dataset.plateId=p.id;
  div.innerHTML=`
    <div class="plate-title">${escapeHtml(p.title)}</div>
    ${p.note?`<div class="plate-note">${escapeHtml(p.note)}</div>`:""}
    <div class="plate-meta">
      <button class="vote-btn ${p.my_vote===1?'active-up':''}" data-v="1">▲ ${p.up}</button>
      <button class="vote-btn ${p.my_vote===-1?'active-down':''}" data-v="-1">▼ ${p.down}</button>
      <span style="margin-left:6px">score ${p.score}</span>
      <span style="margin-left:auto; font-size:11px; color:#777">#${p.id} by ${p.proposed_by}</span>
    </div>
  `;
  const actions=document.createElement("div");
  actions.className="plate-actions";
  // only creator can edit/delete - check state.user.id
  if(state.user && p.proposed_by===state.user.id){
    const edit=document.createElement("button");
    edit.textContent="Edit";
    edit.onclick=async()=>{
      const nt=prompt("Edit title", p.title);
      if(nt===null) return;
      const nn=prompt("Edit note", p.note);
      if(nn===null) return;
      try{ await api(`/api/plates/${p.id}`,{method:"PUT", body:JSON.stringify({title:nt, note:nn})}); loadCalendar(); if(state.selectedDay) openModal(state.selectedDay); }catch(e){ alert(e.message); }
    };
    const del=document.createElement("button");
    del.textContent="Delete";
    del.onclick=async()=>{ if(confirm("Delete plate?")){ await api(`/api/plates/${p.id}`,{method:"DELETE"}); loadCalendar(); if(state.selectedDay) openModal(state.selectedDay); } };
    actions.appendChild(edit); actions.appendChild(del);
  }
  div.appendChild(actions);
  // vote handlers
  div.querySelectorAll(".vote-btn").forEach(btn=>{
    btn.onclick=async(e)=>{
      e.stopPropagation();
      const v=parseInt(btn.dataset.v);
      const newVal = p.my_vote===v ? 0 : v;
      try{ await api(`/api/plates/${p.id}/vote`,{method:"POST", body:JSON.stringify({value:newVal})}); loadCalendar(); if(state.selectedDay) refreshModal(); }catch(err){ alert(err.message); }
    };
  });
  div.addEventListener("dragstart", e=>{
    state.draggingId=p.id;
    div.classList.add("dragging");
    e.dataTransfer.effectAllowed="move";
  });
  div.addEventListener("dragend", ()=>{ state.draggingId=null; div.classList.remove("dragging"); });
  return div;
}
function escapeHtml(s){ return (s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }

function renderGlobalBuffer(){
  const cont=document.getElementById("global-buffer-plates");
  cont.innerHTML="";
  if(!state.calendar) return;
  // global buffer visible always, but label changes per mode
  document.querySelector("#global-buffer .buffer-desc").textContent = state.calendar.house.buffer_mode==="global"
    ? "Global shared across all days — drag plates here to keep as ideas"
    : "Global buffer (mode per_day active — this is shared, day buffers are inside each day)";
  state.calendar.global_buffer.forEach(p=>{
    const el=renderPlate(p, null, null);
    // override drop? already draggable
    cont.appendChild(el);
  });
}
function renderMonthly(){
  const c=document.getElementById("monthly-view");
  c.innerHTML="";
  if(!state.calendar) return;
  const grid=document.createElement("div");
  grid.className="month-grid";
  ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].forEach(d=>{ const h=document.createElement("div"); h.className="month-header"; h.textContent=d; grid.appendChild(h); });
  // need to pad start to Monday
  const firstDate=parseDate(state.calendar.days[0].date);
  let startPad = (firstDate.getDay()===0?6:firstDate.getDay()-1);
  for(let i=0;i<startPad;i++){ const empty=document.createElement("div"); grid.appendChild(empty); }
  state.calendar.days.forEach(day=>{
    const cell=document.createElement("div");
    cell.className="month-cell";
    const d=parseDate(day.date);
    if(fmtDate(new Date())===day.date) cell.classList.add("today");
    let mini = day.slots.map(s=> `${s.label}: ${s.plates.length}`).join(" | ");
    if(day.day_buffer.length) mini += ` | buffer:${day.day_buffer.length}`;
    cell.innerHTML=`<strong>${d.getDate()}</strong><div class="mini-plates">${mini||"empty"}</div>`;
    cell.onclick=()=> openModal(day.date);
    grid.appendChild(cell);
  });
  c.appendChild(grid);
}
function renderDaily(){
  const c=document.getElementById("daily-view");
  c.innerHTML="";
  if(!state.calendar || state.calendar.days.length===0) return;
  const day=state.calendar.days[0];
  const wrap=document.createElement("div");
  wrap.className="daily-container";
  const hdr=document.createElement("h2");
  hdr.textContent=day.date;
  hdr.style.cursor="pointer"; hdr.onclick=()=> openModal(day.date);
  wrap.appendChild(hdr);
  day.slots.forEach(slot=>{
    const sDiv=renderSlot(slot, day.date);
    wrap.appendChild(sDiv);
  });
  if(day.day_buffer.length>0){
    const buf=document.createElement("div");
    buf.className="buffer-zone";
    buf.innerHTML="<h3>Day buffer</h3>";
    const pd=document.createElement("div");
    pd.className="plates";
    day.day_buffer.forEach(p=> pd.appendChild(renderPlate(p, day.date, null)));
    buf.appendChild(pd);
    buf.addEventListener("dragover", e=>{ e.preventDefault(); buf.classList.add("drag-over"); });
    buf.addEventListener("dragleave", ()=> buf.classList.remove("drag-over"));
    buf.addEventListener("drop", e=>{ e.preventDefault(); buf.classList.remove("drag-over"); if(state.draggingId) movePlate(state.draggingId, day.date, null); });
    wrap.appendChild(buf);
  }
  // per_day add
  const addWrap=document.createElement("div");
  addWrap.className="add-slot";
  addWrap.innerHTML=`<input id="daily-new-slot" placeholder="Add new meal for ${day.date}"><button id="daily-add-slot">Add slot</button>`;
  wrap.appendChild(addWrap);
  setTimeout(()=>{
    const ib=document.getElementById("daily-new-slot");
    const bt=document.getElementById("daily-add-slot");
    if(bt) bt.onclick=async()=>{
      const label=ib.value.trim(); if(!label) return;
      await api("/api/slots",{method:"POST", body:JSON.stringify({house_id:state.currentHouseId, date:day.date, label})});
      loadCalendar();
    };
  },0);
  c.appendChild(wrap);
}

// --- modal ---
function openModal(date){
  state.selectedDay=date;
  const modal=document.getElementById("day-modal");
  modal.style.display="flex";
  document.getElementById("modal-date").textContent=date;
  refreshModal();
}
function closeModal(){ document.getElementById("day-modal").style.display="none"; state.selectedDay=null; }
function refreshModal(){
  if(!state.selectedDay || !state.calendar) return;
  let day = state.calendar.days.find(d=>d.date===state.selectedDay);
  // if modal date out of current range, fetch single day? For now reload calendar to include date
  if(!day){
    // fetch that day specifically by adjusting anchor and reloading? simple: reload if not found, keep modal
    // attempt to show fetch via temp: we can just create placeholder and fetch on demand
    // Instead, fetch calendar for that single day and update modal directly via API
    fetchDayForModal(state.selectedDay);
    return;
  }
  const slotsCont=document.getElementById("modal-slots");
  slotsCont.innerHTML="";
  day.slots.forEach(slot=>{
    const sDiv=renderSlot(slot, day.date);
    slotsCont.appendChild(sDiv);
  });
  const bufPlates=document.getElementById("modal-buffer-plates");
  bufPlates.innerHTML="";
  // show day_buffer in modal
  day.day_buffer.forEach(p=> bufPlates.appendChild(renderPlate(p, day.date, null)));
  const modalBuf=document.getElementById("modal-buffer");
  modalBuf.addEventListener("dragover", e=>{ e.preventDefault(); modalBuf.classList.add("drag-over"); });
  modalBuf.addEventListener("dragleave", ()=> modalBuf.classList.remove("drag-over"));
  modalBuf.addEventListener("drop", e=>{ e.preventDefault(); modalBuf.classList.remove("drag-over"); if(state.draggingId) movePlate(state.draggingId, day.date, null); });
}
async function fetchDayForModal(date){
  try{
    const data=await api(`/api/calendar?house_id=${state.currentHouseId}&from=${date}&to=${date}`);
    const day=data.days[0];
    if(day){
      const slotsCont=document.getElementById("modal-slots");
      slotsCont.innerHTML="";
      day.slots.forEach(slot=> slotsCont.appendChild(renderSlot(slot, day.date)));
      const buf=document.getElementById("modal-buffer-plates");
      buf.innerHTML="";
      day.day_buffer.forEach(p=> buf.appendChild(renderPlate(p, date, null)));
    }
  }catch(e){ console.error(e); }
}

// --- add plate ---
async function addPlateFromInput(titleIn, noteIn, date, slotId, acEl){
  const title=titleIn.value.trim();
  const note=noteIn.value.trim();
  if(!title){ titleIn.focus(); return; }
  const body={house_id: state.currentHouseId, title, note, date: date||null, slot_id: slotId||null};
  // if slotId but date null? handled by backend
  try{
    await api("/api/plates",{method:"POST", body:JSON.stringify(body)});
    titleIn.value=""; noteIn.value=""; if(acEl) acEl.style.display="none";
    loadCalendar();
    if(state.selectedDay) refreshModal();
  }catch(e){ alert(e.message); }
}
async function movePlate(plateId, toDate, toSlotId){
  try{
    await api(`/api/plates/${plateId}/move`,{method:"POST", body:JSON.stringify({to_date: toDate||null, to_slot_id: toSlotId||null})});
    loadCalendar();
    if(state.selectedDay) refreshModal();
  }catch(e){ alert(e.message); }
}
async function addSlot(){
  const label=document.getElementById("new-slot-label").value.trim();
  if(!label || !state.selectedDay) return;
  try{
    await api("/api/slots",{method:"POST", body:JSON.stringify({house_id: state.currentHouseId, date: state.selectedDay, label})});
    document.getElementById("new-slot-label").value="";
    loadCalendar();
    refreshModal();
  }catch(e){ alert(e.message); }
}

// --- autocomplete ---
let acTimeout=null;
function setupAutocomplete(input, acDiv){
  if(!input || !acDiv) return;
  input.addEventListener("input", ()=>{
    const q=input.value.trim();
    if(acTimeout) clearTimeout(acTimeout);
    if(!q || q.length<1){ acDiv.style.display="none"; return; }
    acTimeout=setTimeout(async()=>{
      try{
        const res=await api(`/api/plates/autocomplete?house_id=${state.currentHouseId}&query=${encodeURIComponent(q)}&limit=8`);
        if(res.length===0){ acDiv.style.display="none"; return; }
        acDiv.innerHTML="";
        res.forEach(t=>{
          const d=document.createElement("div");
          d.textContent=t;
          d.onclick=()=>{ input.value=t; acDiv.style.display="none"; };
          acDiv.appendChild(d);
        });
        acDiv.style.display="block";
      }catch(e){ acDiv.style.display="none"; }
    },200);
  });
  input.addEventListener("blur", ()=> setTimeout(()=> acDiv.style.display="none",200));
  input.addEventListener("focus", ()=>{
    if(acDiv.children.length>0) acDiv.style.display="block";
  });
}
