const API = "";
let state = {
  token: localStorage.getItem("token") || null,
  user: null,
  houses: [],
  currentHouseId: parseInt(localStorage.getItem("houseId") || "0") || null,
  view: localStorage.getItem("view") || "weekly",
  anchor: new Date(),
  calendar: null,
  draggingId: null,
  selectedDay: null,
  authMode: "login",
  history: [],
  historyVisible: true,
  draggingHistory: null,
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
function todayISO(){ return new Date().toISOString().slice(0,10); }
function isPast(dateStr){ if(!dateStr) return false; return dateStr < todayISO(); }
function mondayOf(d){
  const x = new Date(d);
  const day = x.getDay();
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
function escapeHtml(s){ return (s||"").replace(/[&<>"]/g,c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;" }[c])); }

// --- theme ---
const translations={
  en:{
    "header.title":"Lavagna Cibo",
    "header.settings":"Settings",
    "header.logout":"Logout",
    "auth.login":"Login",
    "auth.register":"Register",
    "auth.username":"Username",
    "auth.password":"Password",
    "auth.submit.login":"Login",
    "auth.submit.register":"Register",
    "houses.title":"Your Houses",
    "houses.create":"Create House",
    "houses.create.placeholder":"House name (e.g. Casa Rossi)",
    "houses.create.btn":"Create",
    "houses.join":"Join House",
    "houses.join.placeholder":"Invite code or house name",
    "houses.join.btn":"Join",
    "app.houses":"Houses",
    "app.weekly":"Weekly",
    "app.monthly":"Monthly",
    "app.daily":"Daily",
    "app.prev":"‹ Prev",
    "app.next":"Next ›",
    "app.today":"Today",
    "app.buffer":"Buffer",
    "app.buffer.desc.global":"Global shared across all days — drag plates here to keep as ideas",
    "app.buffer.desc.per_day":"Global buffer (mode per_day active — this is shared, day buffers are inside each day)",
    "app.buffer.add.plate":"Add plate to buffer (autocomplete)",
    "app.buffer.note":"note (optional)",
    "app.buffer.tags":"tags: fish, meat, dessert",
    "app.buffer.add.btn":"Add",
    "app.history.title":"History — all plates",
    "app.history.search":"search title",
    "app.history.tag":"filter tag",
    "app.history.sort.name":"Sort: name A-Z",
    "app.history.sort.recent":"Sort: recent",
    "app.history.sort.count":"Sort: most used",
    "app.history.hint":"Sortable by name — tags like fish, meat, first, dessert are editable per plate.",
    "app.day.buffer":"Buffer for this day",
    "app.day.add.slot":"Add new meal (e.g. breakfast)",
    "app.day.add.slot.btn":"Add slot",
    "settings.title":"Settings",
    "settings.user":"User",
    "settings.house":"House",
    "settings.template":"Daily Template",
    "settings.theme":"Theme",
    "settings.language":"Language",
    "settings.user.logged":"Logged as",
    "settings.user.new_username":"new username",
    "settings.user.change_username":"Change username",
    "settings.user.current_pw":"current password",
    "settings.user.new_pw":"new password",
    "settings.user.change_pw":"Change password",
    "settings.user.houses":"Your Houses — select active",
    "settings.house.attributes":"House Attributes",
    "settings.house.name.placeholder":"house name",
    "settings.house.save":"Save name",
    "settings.house.invite":"Invite code:",
    "settings.house.copy":"Copy",
    "settings.house.members":"Members:",
    "settings.house.buffer":"day-specific buffer (per_day)",
    "settings.house.add":"Add another house",
    "settings.house.create.placeholder":"new house name",
    "settings.house.create.btn":"Create",
    "settings.house.join.placeholder":"invite code or house name",
    "settings.house.join.btn":"Join",
    "settings.template.title":"Daily Template — applies to all following dates",
    "settings.template.desc":"Number of fields (meals) per day. Changes seed new dates; optionally apply to existing future dates.",
    "settings.template.add.placeholder":"new field (e.g. breakfast)",
    "settings.template.add.btn":"Add field",
    "settings.template.save":"Save template",
    "settings.template.apply":"apply to existing future dates",
    "settings.theme.title":"Theme",
    "settings.theme.bg":"Background",
    "settings.theme.fg":"Text",
    "settings.theme.card":"Card",
    "settings.theme.header":"Header",
    "settings.theme.accent":"Accent",
    "settings.theme.accentFg":"Accent text",
    "settings.theme.muted":"Muted",
    "settings.theme.border":"Border",
    "settings.theme.apply":"Apply custom",
    "settings.theme.reset":"Reset to preset",
    "settings.theme.copy":"Copy CSS",
    "settings.theme.preview":"Live preview — colors apply instantly. Stored per browser in localStorage.",
    "settings.language.title":"Language / Lingua",
    "settings.language.choose":"Choose language — stored per browser.",
    "common.daily":"daily",
    "common.edit":"Edit",
    "common.delete":"Delete",
    "common.add":"Add",
    "common.save":"Save",
    "common.cancel":"Cancel",
    "plate.note.placeholder":"note (optional)",
    "plate.tags.placeholder":"tags: fish, meat",
    "history.add.buffer":"Add to buffer",
    "history.add.today":"Add to today",
    "history.remove":"Remove from History permanently"
  },
  it:{
    "header.title":"Lavagna Cibo",
    "header.settings":"Impostazioni",
    "header.logout":"Esci",
    "auth.login":"Accedi",
    "auth.register":"Registrati",
    "auth.username":"Nome utente",
    "auth.password":"Password",
    "auth.submit.login":"Accedi",
    "auth.submit.register":"Registrati",
    "houses.title":"Le tue Case",
    "houses.create":"Crea Casa",
    "houses.create.placeholder":"Nome casa (es. Casa Rossi)",
    "houses.create.btn":"Crea",
    "houses.join":"Unisciti a Casa",
    "houses.join.placeholder":"Codice invito o nome casa",
    "houses.join.btn":"Unisciti",
    "app.houses":"Case",
    "app.weekly":"Settimanale",
    "app.monthly":"Mensile",
    "app.daily":"Giornaliero",
    "app.prev":"‹ Prec",
    "app.next":"Succ ›",
    "app.today":"Oggi",
    "app.buffer":"Buffer",
    "app.buffer.desc.global":"Condiviso tra tutti i giorni — trascina qui le idee",
    "app.buffer.desc.per_day":"Buffer globale (modalità giornaliera attiva — condiviso, i buffer giornalieri sono dentro ogni giorno)",
    "app.buffer.add.plate":"Aggiungi piatto al buffer (autocompletamento)",
    "app.buffer.note":"nota (opzionale)",
    "app.buffer.tags":"tag: pesce, carne, dolce",
    "app.buffer.add.btn":"Aggiungi",
    "app.history.title":"Cronologia — tutti i piatti",
    "app.history.search":"cerca titolo",
    "app.history.tag":"filtra tag",
    "app.history.sort.name":"Ordina: nome A-Z",
    "app.history.sort.recent":"Ordina: recente",
    "app.history.sort.count":"Ordina: più usato",
    "app.history.hint":"Ordinabile per nome — tag come pesce, carne, primo, dolce modificabili per piatto.",
    "app.day.buffer":"Buffer per questo giorno",
    "app.day.add.slot":"Aggiungi nuovo pasto (es. colazione)",
    "app.day.add.slot.btn":"Aggiungi",
    "settings.title":"Impostazioni",
    "settings.user":"Utente",
    "settings.house":"Casa",
    "settings.template":"Template Giornaliero",
    "settings.theme":"Tema",
    "settings.language":"Lingua",
    "settings.user.logged":"Accesso come",
    "settings.user.new_username":"nuovo nome utente",
    "settings.user.change_username":"Cambia nome",
    "settings.user.current_pw":"password attuale",
    "settings.user.new_pw":"nuova password",
    "settings.user.change_pw":"Cambia password",
    "settings.user.houses":"Le tue Case — seleziona attiva",
    "settings.house.attributes":"Attributi Casa",
    "settings.house.name.placeholder":"nome casa",
    "settings.house.save":"Salva nome",
    "settings.house.invite":"Codice invito:",
    "settings.house.copy":"Copia",
    "settings.house.members":"Membri:",
    "settings.house.buffer":"buffer giornaliero (per_day)",
    "settings.house.add":"Aggiungi altra casa",
    "settings.house.create.placeholder":"nome nuova casa",
    "settings.house.create.btn":"Crea",
    "settings.house.join.placeholder":"codice invito o nome",
    "settings.house.join.btn":"Unisciti",
    "settings.template.title":"Template Giornaliero — vale per tutte le date future",
    "settings.template.desc":"Numero di campi (pasti) al giorno. Le modifiche creano i nuovi giorni; opzionale applica ai futuri esistenti.",
    "settings.template.add.placeholder":"nuovo campo (es. colazione)",
    "settings.template.add.btn":"Aggiungi campo",
    "settings.template.save":"Salva template",
    "settings.template.apply":"applica ai futuri esistenti",
    "settings.theme.title":"Tema",
    "settings.theme.bg":"Sfondo",
    "settings.theme.fg":"Testo",
    "settings.theme.card":"Card",
    "settings.theme.header":"Header",
    "settings.theme.accent":"Accento",
    "settings.theme.accentFg":"Testo accento",
    "settings.theme.muted":"Attutito",
    "settings.theme.border":"Bordo",
    "settings.theme.apply":"Applica custom",
    "settings.theme.reset":"Reimposta preset",
    "settings.theme.copy":"Copia CSS",
    "settings.theme.preview":"Anteprima live — colori applicati subito. Salvato per browser in localStorage.",
    "settings.language.title":"Lingua / Lingua",
    "settings.language.choose":"Scegli lingua — salvata per browser.",
    "common.daily":"giornaliero",
    "common.edit":"Modifica",
    "common.delete":"Elimina",
    "common.add":"Aggiungi",
    "common.save":"Salva",
    "common.cancel":"Annulla",
    "plate.note.placeholder":"nota (opzionale)",
    "plate.tags.placeholder":"tag: pesce, carne",
    "history.add.buffer":"Aggiungi al buffer",
    "history.add.today":"Aggiungi a oggi",
    "history.remove":"Rimuovi dalla cronologia"
  }
};
let currentLang=localStorage.getItem("lavagna_lang")||"en";
function t(k){ return (translations[currentLang]&&translations[currentLang][k]) || translations.en[k] || k; }
function applyLanguage(lang){
  currentLang=lang||"en";
  localStorage.setItem("lavagna_lang", currentLang);
  document.documentElement.lang=currentLang;
  const sel=document.getElementById("language-select");
  if(sel) sel.value=currentLang;
  // header
  const h1=document.querySelector("header h1");
  if(h1) h1.textContent="🍝 "+t("header.title");
  const sb=document.getElementById("settings-btn");
  if(sb) sb.textContent="⚙ "+t("header.settings");
  const lb=document.getElementById("logout-btn");
  if(lb) lb.textContent=t("header.logout");
  // auth tabs
  const tl=document.getElementById("tab-login");
  if(tl) tl.textContent=t("auth.login");
  const tr=document.getElementById("tab-register");
  if(tr) tr.textContent=t("auth.register");
  const au=document.getElementById("auth-username");
  if(au) au.placeholder=t("auth.username");
  const ap=document.getElementById("auth-password");
  if(ap) ap.placeholder=t("auth.password");
  const as=document.getElementById("auth-submit");
  if(as) as.textContent=t(currentLang==="it" ? (document.getElementById("tab-login").classList.contains("active")?"auth.submit.login":"auth.submit.register") : (document.getElementById("tab-login").classList.contains("active")?"Login":"Register"));
  // fix auth submit correctly
  const isLogin=document.getElementById("tab-login")?.classList.contains("active");
  if(as) as.textContent=isLogin?t("auth.submit.login"):t("auth.submit.register");
  // houses
  const ht=document.querySelector("#houses-view h2");
  if(ht) ht.textContent=t("houses.title");
  const hc=document.querySelector("#houses-view .house-actions .card:nth-child(1) h3");
  if(hc) hc.textContent=t("houses.create");
  const hcp=document.getElementById("house-create-name");
  if(hcp) hcp.placeholder=t("houses.create.placeholder");
  const hcb=document.getElementById("house-create-btn");
  if(hcb) hcb.textContent=t("houses.create.btn");
  const hj=document.querySelector("#houses-view .house-actions .card:nth-child(2) h3");
  if(hj) hj.textContent=t("houses.join");
  const hjp=document.getElementById("house-join-code");
  if(hjp) hjp.placeholder=t("houses.join.placeholder");
  const hjb=document.getElementById("house-join-btn");
  if(hjb) hjb.textContent=t("houses.join.btn");
  // app header
  const mhb=document.getElementById("manage-houses-btn");
  if(mhb) mhb.textContent=t("app.houses");
  document.querySelectorAll(".view-btn").forEach(b=>{
    const v=b.dataset.view;
    if(v==="weekly") b.textContent=t("app.weekly");
    if(v==="monthly") b.textContent=t("app.monthly");
    if(v==="daily") b.textContent=t("app.daily");
  });
  const pb=document.getElementById("prev-btn");
  if(pb) pb.textContent=t("app.prev");
  const nb=document.getElementById("next-btn");
  if(nb) nb.textContent=t("app.next");
  const tb=document.getElementById("today-btn");
  if(tb) tb.textContent=t("app.today");
  // buffer
  const bh=document.querySelector("#global-buffer h3");
  if(bh){
    const mode=document.getElementById("buffer-mode-label")?.textContent||"";
    bh.innerHTML=`${t("app.buffer")} <small>(drag here for unassigned)</small> <small>${mode}</small>`;
  }
  const bd=document.querySelector("#global-buffer .buffer-desc");
  if(bd){
    const isPerDay=document.getElementById("buffer-toggle")?.classList.contains("active");
    bd.textContent=isPerDay?t("app.buffer.desc.per_day"):t("app.buffer.desc.global");
  }
  const btb=document.getElementById("buffer-toggle");
  if(btb) btb.textContent=t("common.daily");
  const gTitle=document.querySelector("#global-buffer .plate-title-input");
  if(gTitle) gTitle.placeholder=t("app.buffer.add.plate");
  const gNote=document.querySelector("#global-buffer .plate-note-input");
  if(gNote) gNote.placeholder=t("app.buffer.note");
  const gTags=document.querySelector("#global-buffer .plate-tags-input");
  if(gTags) gTags.placeholder=t("app.buffer.tags");
  const gBtn=document.querySelector("#global-buffer .plate-add-btn");
  if(gBtn) gBtn.textContent=t("app.buffer.add.btn");
  // history
  const hh=document.querySelector("#history-section h3");
  if(hh) hh.innerHTML=`${t("app.history.title")} <small id="history-count">${document.getElementById("history-count")?.textContent||""}</small>`;
  const hq=document.getElementById("history-q");
  if(hq) hq.placeholder=t("app.history.search");
  const ht2=document.getElementById("history-tag");
  if(ht2) ht2.placeholder=t("app.history.tag");
  const hs=document.getElementById("history-sort");
  if(hs){
    const opts=hs.options;
    if(opts[0]) opts[0].textContent=t("app.history.sort.name");
    if(opts[1]) opts[1].textContent=t("app.history.sort.recent");
    if(opts[2]) opts[2].textContent=t("app.history.sort.count");
  }
  const hh2=document.getElementById("history-hint");
  if(hh2) hh2.textContent=t("app.history.hint");
  // day modal
  const dh=document.querySelector("#day-modal .add-slot input");
  if(dh) dh.placeholder=t("app.day.add.slot");
  const db=document.getElementById("add-slot-btn");
  if(db) db.textContent=t("app.day.add.slot.btn");
  const mbh=document.querySelector("#modal-buffer h3");
  if(mbh) mbh.textContent=t("app.day.buffer");
  // settings tabs
  document.querySelectorAll("#settings-tabs .tab").forEach(b=>{
    const tab=b.dataset.tab;
    if(tab==="user") b.textContent=t("settings.user");
    if(tab==="house") b.textContent=t("settings.house");
    if(tab==="template") b.textContent=t("settings.template");
    if(tab==="theme") b.textContent=t("settings.theme");
    if(tab==="language") b.textContent=t("settings.language");
  });
  const st=document.querySelector("#settings-modal h2");
  if(st) st.textContent=t("settings.title");
  // settings user
  const su=document.querySelector("#settings-user .card:nth-child(1) h3");
  if(su) su.textContent=t("settings.user");
  const sul=document.querySelector("#settings-user .card:nth-child(1) div");
  if(sul && sul.textContent.includes("Logged as")) sul.innerHTML=`${t("settings.user.logged")} <strong id="settings-username">${document.getElementById("settings-username")?.textContent||""}</strong>`;
  const sun=document.getElementById("settings-new-username");
  if(sun) sun.placeholder=t("settings.user.new_username");
  const sub=document.getElementById("settings-save-username");
  if(sub) sub.textContent=t("settings.user.change_username");
  const sop=document.getElementById("settings-old-pw");
  if(sop) sop.placeholder=t("settings.user.current_pw");
  const snp=document.getElementById("settings-new-pw");
  if(snp) snp.placeholder=t("settings.user.new_pw");
  const spb=document.getElementById("settings-save-pw");
  if(spb) spb.textContent=t("settings.user.change_pw");
  const suh=document.querySelector("#settings-user .card:nth-child(2) h3");
  if(suh) suh.textContent=t("settings.user.houses");
  // settings house
  const sh=document.querySelector("#settings-house .card:nth-child(1) h3");
  if(sh) sh.textContent=t("settings.house.attributes");
  const shp=document.getElementById("settings-house-name");
  if(shp) shp.placeholder=t("settings.house.name.placeholder");
  const shb=document.getElementById("settings-save-house");
  if(shb) shb.textContent=t("settings.house.save");
  const sci=document.querySelector("#settings-house .card:nth-child(1) div:nth-child(2)");
  if(sci && sci.innerHTML.includes("Invite code")) sci.innerHTML=`${t("settings.house.invite")} <code id="settings-invite">${document.getElementById("settings-invite")?.textContent||""}</code> <button id="copy-invite" style="padding:2px 6px; font-size:12px">${t("settings.house.copy")}</button>`;
  // rebind copy after innerHTML
  const ci2=document.getElementById("copy-invite");
  if(ci2) ci2.onclick=()=>{ const code=document.getElementById("settings-invite").textContent; navigator.clipboard.writeText(code).then(()=> alert("copied "+code)); };
  const sm=document.querySelector("#settings-house .card:nth-child(1) div:nth-child(3)");
  if(sm && sm.textContent.includes("Members")) sm.innerHTML=`${t("settings.house.members")} <span id="settings-members">${document.getElementById("settings-members")?.textContent||""}</span>`;
  const sbt=document.getElementById("settings-buffer-toggle");
  if(sbt && sbt.parentElement) sbt.parentElement.lastChild.textContent=" "+t("settings.house.buffer");
  const sha=document.querySelector("#settings-house .card:nth-child(2) h3");
  if(sha) sha.textContent=t("settings.house.add");
  const scn=document.getElementById("settings-create-name");
  if(scn) scn.placeholder=t("settings.house.create.placeholder");
  const scb=document.getElementById("settings-create-btn");
  if(scb) scb.textContent=t("settings.house.create.btn");
  const sjc=document.getElementById("settings-join-code");
  if(sjc) sjc.placeholder=t("settings.house.join.placeholder");
  const sjb=document.getElementById("settings-join-btn");
  if(sjb) sjb.textContent=t("settings.house.join.btn");
  // template
  const th=document.querySelector("#settings-template .card h3");
  if(th) th.textContent=t("settings.template.title");
  const td=document.querySelector("#settings-template .card div");
  if(td) td.textContent=t("settings.template.desc");
  const tnp=document.getElementById("template-new-label");
  if(tnp) tnp.placeholder=t("settings.template.add.placeholder");
  const tab=document.getElementById("template-add-btn");
  if(tab) tab.textContent=t("settings.template.add.btn");
  const tsb=document.getElementById("template-save");
  if(tsb) tsb.textContent=t("settings.template.save");
  const tap=document.getElementById("template-apply-future");
  if(tap && tap.parentElement) tap.parentElement.lastChild.textContent=" "+t("settings.template.apply");
  // theme
  const th2=document.querySelector("#settings-theme .card h3");
  if(th2) th2.textContent=t("settings.theme.title");
  const thg=document.querySelectorAll("#theme-custom-grid label");
  const tkeys=["settings.theme.bg","settings.theme.fg","settings.theme.card","settings.theme.header","settings.theme.accent","settings.theme.accentFg","settings.theme.muted","settings.theme.border"];
  thg.forEach((lab,idx)=>{
    const key=tkeys[idx];
    if(!key) return;
    const txt=t(key);
    // label text is before input, keep input
    const input=lab.querySelector("input");
    if(input) lab.childNodes[0].textContent=txt+" ";
  });
  const tap2=document.getElementById("theme-apply");
  if(tap2) tap2.textContent=t("settings.theme.apply");
  const tr=document.getElementById("theme-reset");
  if(tr) tr.textContent=t("settings.theme.reset");
  const te=document.getElementById("theme-export");
  if(te) te.textContent=t("settings.theme.copy");
  const tp=document.querySelector("#theme-preview div:last-child");
  if(tp) tp.textContent=t("settings.theme.preview");
  // language pane
  const lh=document.querySelector("#settings-language .card h3");
  if(lh) lh.textContent=t("settings.language.title");
  const lc=document.querySelector("#settings-language .card div");
  if(lc) lc.textContent=t("settings.language.choose");
}
const themePresets={
function applyTheme(){
  const th = localStorage.getItem("lavagna_theme") || "light";
  document.body.classList.remove("theme-dark","theme-warm","theme-light","theme-custom");
  document.body.classList.add("theme-"+th);
  // reset custom inline vars on both html and body (body inline overrides class)
  const vars=["bg","fg","card","header","accent","accent-fg","muted","border"];
  vars.forEach(v=>{
    document.documentElement.style.removeProperty("--"+v);
    document.body.style.removeProperty("--"+v);
  });
  if(th==="custom"){
    vars.forEach(v=>{
      const val=localStorage.getItem("lavagna_custom_"+v);
      if(val){
        document.documentElement.style.setProperty("--"+v, val);
        document.body.style.setProperty("--"+v, val);
      }
    });
  } else {
    const accentOverride=localStorage.getItem("lavagna_custom_accent");
    if(accentOverride && th!=="custom"){
      document.documentElement.style.setProperty("--accent", accentOverride);
      document.body.style.setProperty("--accent", accentOverride);
      const cfg=localStorage.getItem("lavagna_custom_accent-fg");
      if(cfg){
        document.documentElement.style.setProperty("--accent-fg", cfg);
        document.body.style.setProperty("--accent-fg", cfg);
      } else {
        // auto contrast for accent
        const hex=accentOverride.replace("#","").trim();
        if(hex.length===6){
          const r=parseInt(hex.slice(0,2),16), g=parseInt(hex.slice(2,4),16), b=parseInt(hex.slice(4,6),16);
          const lum=(0.299*r+0.587*g+0.114*b)/255;
          const fg=lum>0.5?"#222222":"#ffffff";
          document.documentElement.style.setProperty("--accent-fg", fg);
          document.body.style.setProperty("--accent-fg", fg);
        }
      }
    }
  }
  // sync UI
  const sel=document.getElementById("theme-select");
  if(sel) sel.value=th;
  const map={bg:"theme-bg",fg:"theme-fg",card:"theme-card",header:"theme-header",accent:"theme-accent","accent-fg":"theme-accent-fg",muted:"theme-muted",border:"theme-border"};
  Object.entries(map).forEach(([cssId,domId])=>{
    const el=document.getElementById(domId);
    if(!el) return;
    const thVal=th==="custom" ? (localStorage.getItem("lavagna_custom_"+cssId) || themePresets.light[cssId]) : (localStorage.getItem("lavagna_custom_"+cssId) && th!=="custom" && cssId==="accent" ? localStorage.getItem("lavagna_custom_"+cssId) : (themePresets[th]||themePresets.light)[cssId]);
    // For custom, show stored custom, else show preset value (or accent override)
    if(th==="custom"){
      el.value=localStorage.getItem("lavagna_custom_"+cssId) || themePresets.light[cssId];
    } else {
      if(cssId==="accent" && localStorage.getItem("lavagna_custom_accent")){
        el.value=localStorage.getItem("lavagna_custom_accent");
      } else {
        el.value=(themePresets[th]||themePresets.light)[cssId];
      }
    }
  });
  const grid=document.getElementById("theme-custom-grid");
  if(grid) grid.style.opacity= th==="custom" ? "1" : "0.6";
}
function saveTheme(th, accent){
  localStorage.setItem("lavagna_theme", th);
  if(accent) localStorage.setItem("lavagna_custom_accent", accent);
  applyTheme();
}
function saveCustomTheme(){
  const vars=["bg","fg","card","header","accent","accent-fg","muted","border"];
  vars.forEach(v=>{
    const el=document.getElementById("theme-"+v);
    if(el) localStorage.setItem("lavagna_custom_"+v, el.value);
  });
  localStorage.setItem("lavagna_theme","custom");
  applyTheme();
  const msg=document.getElementById("theme-msg");
  if(msg) { msg.textContent="Custom theme applied"; setTimeout(()=>msg.textContent="",2000); }
}

// --- init ---
document.addEventListener("DOMContentLoaded", async ()=>{
  applyTheme();
  applyLanguage(localStorage.getItem("lavagna_lang")||"en");
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
  const sb=document.getElementById("settings-btn");
  if(sb) sb.onclick=openSettings;
  document.getElementById("house-create-btn").onclick=createHouse;
  document.getElementById("house-join-btn").onclick=joinHouse;
  const scb=document.getElementById("settings-create-btn");
  if(scb) scb.onclick=settingsCreateHouse;
  const sjb=document.getElementById("settings-join-btn");
  if(sjb) sjb.onclick=settingsJoinHouse;
  const mhb=document.getElementById("manage-houses-btn");
  if(mhb) mhb.onclick=()=>{
    openSettings();
    document.querySelectorAll("#settings-tabs .tab").forEach(x=>x.classList.remove("active"));
    const ht=document.querySelector("#settings-tabs .tab[data-tab='house']");
    if(ht) ht.classList.add("active");
    document.querySelectorAll(".settings-pane").forEach(p=>p.style.display="none");
    const pane=document.getElementById("settings-house");
    if(pane) pane.style.display="block";
    refreshSettingsHouse();
  };
  document.getElementById("house-select").onchange=e=>{ state.currentHouseId=parseInt(e.target.value); saveState(); loadCalendar(); loadHistory(); };
  const btb=document.getElementById("buffer-toggle");
  if(btb) btb.onclick=toggleBuffer;
  document.querySelectorAll(".view-btn").forEach(b=> b.onclick=()=>{ state.view=b.dataset.view; saveState(); updateViewButtons(); loadCalendar(); });
  document.getElementById("prev-btn").onclick=()=>{ shift(-1); };
  document.getElementById("next-btn").onclick=()=>{ shift(1); };
  document.getElementById("today-btn").onclick=()=>{ state.anchor=new Date(); loadCalendar(); };
  document.getElementById("modal-close").onclick=closeModal;
  document.querySelector("#day-modal .modal-overlay").onclick=closeModal;
  document.getElementById("add-slot-btn").onclick=addSlot;
  document.getElementById("modal-buffer-add").onclick=()=> {
    const t=document.getElementById("modal-buffer-title");
    const n=document.getElementById("modal-buffer-note");
    const tg=document.getElementById("modal-buffer-tags");
    addPlateFromInput(t,n,state.selectedDay,null,document.getElementById("modal-buffer-ac"),tg);
  };
  const gTitle=document.querySelector("#global-buffer .plate-title-input");
  const gNote=document.querySelector("#global-buffer .plate-note-input");
  const gTags=document.querySelector("#global-buffer .plate-tags-input");
  const gBtn=document.querySelector("#global-buffer .plate-add-btn");
  const gAc=document.querySelector("#global-buffer .autocomplete");
  if(gBtn) gBtn.onclick=()=> addPlateFromInput(gTitle,gNote,null,null,gAc,gTags);
  setupAutocomplete(gTitle,gAc);
  setupTagsAutocomplete(gTags);
  setupAutocomplete(document.getElementById("modal-buffer-title"), document.getElementById("modal-buffer-ac"));
  setupTagsAutocomplete(document.getElementById("modal-buffer-tags"));
  const gb=document.getElementById("global-buffer");
  gb.addEventListener("dragover", e=>{ e.preventDefault(); gb.classList.add("drag-over"); });
  gb.addEventListener("dragleave", ()=> gb.classList.remove("drag-over"));
  gb.addEventListener("drop", e=>{ e.preventDefault(); gb.classList.remove("drag-over"); handleDrop(null, null); });
  // history
  const hq=document.getElementById("history-q");
  const ht=document.getElementById("history-tag");
  const hs=document.getElementById("history-sort");
  const hr=document.getElementById("history-refresh");
  const hg=document.getElementById("history-toggle");
  if(hq) hq.addEventListener("input", debounce(loadHistory,300));
  if(ht) { ht.addEventListener("input", debounce(loadHistory,300)); setupTagsAutocomplete(ht); }
  if(hs) hs.addEventListener("change", loadHistory);
  if(hr) hr.onclick=loadHistory;
  if(hg) hg.onclick=()=>{
    state.historyVisible=!state.historyVisible;
    const list=document.getElementById("history-list");
    list.style.display=state.historyVisible?"block":"none";
    hg.textContent=state.historyVisible?"Collapse":"Expand";
    if(state.historyVisible) loadHistory();
  };
  // settings
  const so=document.getElementById("settings-overlay");
  const sc=document.getElementById("settings-close");
  if(so) so.onclick=closeSettings;
  if(sc) sc.onclick=closeSettings;
  document.querySelectorAll("#settings-tabs .tab").forEach(b=>{
    b.onclick=()=>{
      document.querySelectorAll("#settings-tabs .tab").forEach(x=>x.classList.remove("active"));
      b.classList.add("active");
      document.querySelectorAll(".settings-pane").forEach(p=>p.style.display="none");
      const tab=b.dataset.tab;
      const pane=document.getElementById("settings-"+tab);
      if(pane) pane.style.display="block";
      if(tab==="template") renderTemplateEditor();
      if(tab==="house") refreshSettingsHouse();
      if(tab==="user") refreshSettingsUser();
    };
  });
  const su=document.getElementById("settings-save-username");
  const sp=document.getElementById("settings-save-pw");
  if(su) su.onclick=saveUsername;
  if(sp) sp.onclick=savePassword;
  const sh=document.getElementById("settings-save-house");
  if(sh) sh.onclick=saveHouseName;
  const bt=document.getElementById("settings-buffer-toggle");
  if(bt) bt.onchange=e=>{
    const v=e.target.checked?"per_day":"global";
    api(`/api/houses/${state.currentHouseId}/buffer`,{method:"PUT", body:JSON.stringify({mode:v})}).then(loadCalendar).catch(alert);
    const btb=document.getElementById("buffer-toggle");
    if(btb && btb.tagName==="BUTTON"){
      const isDaily=v==="per_day";
      btb.classList.toggle("active", isDaily);
      btb.style.background=isDaily?"#22c55e":"#e5e7eb";
      btb.style.color=isDaily?"#fff":"#555";
      btb.style.borderColor=isDaily?"#16a34a":"#d1d5db";
    }
  };
  const ci=document.getElementById("copy-invite");
  if(ci) ci.onclick=()=>{
    const code=document.getElementById("settings-invite").textContent;
    navigator.clipboard.writeText(code).then(()=> alert("copied "+code));
  };
  const ta=document.getElementById("template-add-btn");
  if(ta) ta.onclick=templateAddField;
  const ts=document.getElementById("template-save");
  if(ts) ts.onclick=saveTemplate;
  const thsel=document.getElementById("theme-select");
  if(thsel) thsel.onchange=e=>{
    const v=e.target.value;
    if(v==="custom"){
      // ensure custom vars exist, init from current preset if missing
      const preset=themePresets.light;
      ["bg","fg","card","header","accent","accent-fg","muted","border"].forEach(k=>{
        if(!localStorage.getItem("lavagna_custom_"+k)){
          const cur=getComputedStyle(document.documentElement).getPropertyValue("--"+k).trim() || preset[k];
          if(cur) localStorage.setItem("lavagna_custom_"+k, cur);
        }
      });
      localStorage.setItem("lavagna_theme","custom");
      applyTheme();
    } else {
      saveTheme(v, localStorage.getItem("lavagna_custom_accent")||undefined);
    }
  };
  // custom pickers
  ["bg","fg","card","header","accent","accent-fg","muted","border"].forEach(k=>{
    const el=document.getElementById("theme-"+k);
    if(!el) return;
    el.addEventListener("input", e=>{
      localStorage.setItem("lavagna_custom_"+k, e.target.value);
      // if not custom, switch to custom for bg/fg etc, but for accent allow preset override too
      const curTh=localStorage.getItem("lavagna_theme")||"light";
      if(curTh!=="custom" && k!=="accent"){
        localStorage.setItem("lavagna_theme","custom");
      }
      // for accent, if not custom still apply accent override
      applyTheme();
    });
  });
  const thApply=document.getElementById("theme-apply");
  if(thApply) thApply.onclick=()=> saveCustomTheme();
  const thReset=document.getElementById("theme-reset");
  if(thReset) thReset.onclick=()=>{
    ["bg","fg","card","header","accent","accent-fg","muted","border"].forEach(k=> localStorage.removeItem("lavagna_custom_"+k));
    localStorage.setItem("lavagna_theme","light");
    // also clear old accent key
    localStorage.removeItem("lavagna_custom_accent");
    localStorage.removeItem("lavagna_accent");
    applyTheme();
    const msg=document.getElementById("theme-msg");
    if(msg){ msg.textContent="Reset to light"; setTimeout(()=>msg.textContent="",2000); }
  };
  const thExport=document.getElementById("theme-export");
  if(thExport) thExport.onclick=()=>{
    const vars=["bg","fg","card","header","accent","accent-fg","muted","border"];
    let css=":root {\n";
    vars.forEach(v=>{
      const val=getComputedStyle(document.documentElement).getPropertyValue("--"+v).trim() || localStorage.getItem("lavagna_custom_"+v) || themePresets.light[v];
      css+=`  --${v}: ${val};\n`;
    });
    css+="}";
    navigator.clipboard.writeText(css).then(()=> {
      const msg=document.getElementById("theme-msg");
      if(msg){ msg.textContent="CSS copied"; setTimeout(()=>msg.textContent="",2000); }
    });
  };
  const langSel=document.getElementById("language-select");
  if(langSel){
    langSel.value=localStorage.getItem("lavagna_lang")||"en";
    langSel.onchange=e=>{
      applyLanguage(e.target.value);
      loadCalendar(); loadHistory();
      const msg=document.getElementById("language-msg");
      if(msg){ msg.textContent=t("settings.language.choose"); setTimeout(()=>msg.textContent="",2000); }
    };
  }
}
function debounce(fn,ms){ let t; return (...a)=>{ clearTimeout(t); t=setTimeout(()=>fn(...a),ms); }; }

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
  const sb=document.getElementById("settings-btn");
  if(sb) sb.style.display="none";
  document.getElementById("user-info").textContent="";
}
async function onLoggedIn(){
  document.getElementById("auth-view").style.display="none";
  document.getElementById("logout-btn").style.display="inline-block";
  const sb=document.getElementById("settings-btn");
  if(sb) sb.style.display="inline-block";
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
      div.innerHTML=`<strong>${escapeHtml(h.name)}</strong><br><small>code: ${escapeHtml(h.invite_code)} — ${escapeHtml(h.buffer_mode)} — template: ${escapeHtml((h.daily_template||[]).join(", "))}</small>`;
      div.onclick=()=>{ state.currentHouseId=h.id; saveState(); showApp(); loadCalendar(); loadHistory(); };
      list.appendChild(div);
      const opt=document.createElement("option");
      opt.value=h.id; opt.textContent=h.name;
      if(h.id===state.currentHouseId) opt.selected=true;
      sel.appendChild(opt);
    });
    if(!state.currentHouseId || !state.houses.find(h=>h.id===state.currentHouseId)){
      state.currentHouseId=state.houses[0].id; saveState();
    }
  }
  if(state.houses.length>0){
    document.getElementById("houses-view").style.display="none";
    showApp();
    await loadCalendar();
    await loadHistory();
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
async function settingsCreateHouse(){
  const inp=document.getElementById("settings-create-name");
  const msg=document.getElementById("settings-create-msg");
  if(!inp||!msg) return;
  const name=inp.value.trim();
  msg.textContent="";
  if(!name){ msg.textContent="name required"; return; }
  try{
    const h=await api("/api/houses",{method:"POST", body:JSON.stringify({name})});
    state.currentHouseId=h.id; saveState(); inp.value=""; await loadHouses(); refreshSettingsHouse(); refreshSettingsUser();
    msg.textContent="created "+h.name; setTimeout(()=>msg.textContent="",2000);
  }catch(e){ msg.textContent=e.message; }
}
async function settingsJoinHouse(){
  const inp=document.getElementById("settings-join-code");
  const msg=document.getElementById("settings-join-msg");
  if(!inp||!msg) return;
  const code=inp.value.trim();
  msg.textContent="";
  if(!code){ msg.textContent="code required"; return; }
  try{
    const h=await api("/api/houses/join",{method:"POST", body:JSON.stringify({invite_code:code})});
    state.currentHouseId=h.id; saveState(); inp.value=""; await loadHouses(); refreshSettingsHouse(); refreshSettingsUser();
    msg.textContent="joined "+h.name; setTimeout(()=>msg.textContent="",2000);
  }catch(e){ msg.textContent=e.message; }
}
function shift(dir){
  if(state.view==="weekly") state.anchor=addDays(state.anchor, dir*7);
  else if(state.view==="monthly"){ const d=new Date(state.anchor); d.setMonth(d.getMonth()+dir); state.anchor=d; }
  else state.anchor=addDays(state.anchor, dir);
  loadCalendar();
}
async function toggleBuffer(e){
  const isButton = e.target.tagName==="BUTTON";
  const current = state.calendar?.house?.buffer_mode || "global";
  const newMode = isButton ? (current==="global"?"per_day":"global") : (e.target.checked?"per_day":"global");
  try{
    await api(`/api/houses/${state.currentHouseId}/buffer`,{method:"PUT", body:JSON.stringify({mode:newMode})});
    await loadCalendar();
    const sb=document.getElementById("settings-buffer-toggle");
    if(sb) sb.checked=newMode==="per_day";
  }catch(err){
    alert(err.message);
    if(!isButton) e.target.checked=!e.target.checked;
  }
}
async function loadCalendar(){
  if(!state.currentHouseId) return;
  const {from,to,label}=rangeForView();
  document.getElementById("range-label").textContent=label;
  try{
    const data=await api(`/api/calendar?house_id=${state.currentHouseId}&from=${from}&to=${to}`);
    state.calendar=data;
    document.getElementById("house-invite").textContent=`code: ${data.house.invite_code}`;
    const bt=document.getElementById("buffer-toggle");
    if(bt){
      const isDaily=data.house.buffer_mode==="per_day";
      if(bt.tagName==="BUTTON"){
        bt.classList.toggle("active", isDaily);
        bt.textContent=t("common.daily");
        bt.style.background = isDaily ? "#22c55e" : "#e5e7eb";
        bt.style.color = isDaily ? "#fff" : "#555";
        bt.style.borderColor = isDaily ? "#16a34a" : "#d1d5db";
      } else {
        bt.checked=isDaily;
      }
    }
    const sbt=document.getElementById("settings-buffer-toggle");
    if(sbt) sbt.checked = data.house.buffer_mode==="per_day";
    document.getElementById("buffer-mode-label").textContent=`(${data.house.buffer_mode})`;
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

// history
async function loadHistory(){
  if(!state.currentHouseId) return;
  const q=document.getElementById("history-q")?.value.trim()||"";
  const tag=document.getElementById("history-tag")?.value.trim()||"";
  const sort=document.getElementById("history-sort")?.value||"name";
  try{
    const data=await api(`/api/plates/history?house_id=${state.currentHouseId}&sort=${encodeURIComponent(sort)}&limit=100&q=${encodeURIComponent(q)}&tag=${encodeURIComponent(tag)}`);
    state.history=data;
    renderHistory();
  }catch(e){ console.error("history",e); }
}
function renderHistory(){
  const list=document.getElementById("history-list");
  const cnt=document.getElementById("history-count");
  if(!list) return;
  list.innerHTML="";
  if(cnt) cnt.textContent=`(${state.history.length})`;
  if(state.history.length===0){
    list.innerHTML="<div style='font-size:13px;color:#666'>No plates yet.</div>";
    return;
  }
  state.history.forEach(entry=>{
    const div=document.createElement("div");
    div.className="history-item";
    div.draggable=true;
    div.title="Drag to duplicate to any meal/buffer (history stays)";
    div.style.cursor="grab";
    const tagsHtml=entry.tags.map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("");
    div.innerHTML=`<div><strong>${escapeHtml(entry.title)}</strong> <span style="font-size:11px;color:#777">×${entry.count}</span><div style="font-size:11px;color:#555">${tagsHtml} ${entry.example_note?escapeHtml(entry.example_note):""}</div></div>`;
    div.addEventListener("dragstart", e=>{
      state.draggingHistory=entry;
      state.draggingId=null;
      div.classList.add("dragging");
      e.dataTransfer.effectAllowed="copy";
      e.dataTransfer.setData("text/plain", entry.title);
    });
    div.addEventListener("dragend", ()=>{ state.draggingHistory=null; div.classList.remove("dragging"); });
    const btn=document.createElement("button");
    btn.textContent=t("history.add.buffer");
    btn.onclick=async()=>{
      try{ await api("/api/plates",{method:"POST", body:JSON.stringify({house_id:state.currentHouseId, title:entry.title, tags: entry.tags.join(","), date:null})}); loadCalendar(); loadHistory(); }catch(e){ alert(e.message); }
    };
    const btn2=document.createElement("button");
    btn2.textContent=t("history.add.today");
    btn2.style.marginLeft="6px";
    btn2.onclick=async()=>{
      const today=todayISO();
      try{ await api("/api/plates",{method:"POST", body:JSON.stringify({house_id:state.currentHouseId, title:entry.title, tags: entry.tags.join(","), date:today})}); loadCalendar(); }catch(e){ alert(e.message); }
    };
    const btn3=document.createElement("button");
    btn3.textContent="✕";
    btn3.title=t("history.remove");
    btn3.style.marginLeft="6px";
    btn3.style.background="#fee";
    btn3.style.color="#c00";
    btn3.style.borderColor="#fcc";
    btn3.onclick=async(e)=>{
      e.stopPropagation();
      if(!confirm(`${t("history.remove")} "${entry.title}"?`)) return;
      try{ await api(`/api/plates/history?house_id=${state.currentHouseId}&title=${encodeURIComponent(entry.title)}`,{method:"DELETE"}); loadHistory(); loadCalendar(); }catch(err){ alert(err.message); }
    };
    btn3.addEventListener("mousedown", e=>e.stopPropagation());
    const wrap=document.createElement("div");
    wrap.style.display="flex"; wrap.style.alignItems="center";
    wrap.appendChild(btn); wrap.appendChild(btn2); wrap.appendChild(btn3);
    div.appendChild(wrap);
    list.appendChild(div);
  });
}
async function handleDrop(targetDate, targetSlotId){
  if(state.draggingHistory){
    const entry=state.draggingHistory;
    state.draggingHistory=null;
    if(targetDate && isPast(targetDate)){ alert("past days not modifiable"); return; }
    try{
      await api("/api/plates",{method:"POST", body:JSON.stringify({house_id:state.currentHouseId, title:entry.title, note:entry.example_note||"", tags:entry.tags.join(","), date:targetDate||null, slot_id:targetSlotId||null})});
      loadCalendar(); loadHistory();
      if(state.selectedDay) refreshModal();
    }catch(e){ alert(e.message); }
  } else if(state.draggingId){
    await movePlate(state.draggingId, targetDate, targetSlotId);
  }
}

function renderWeekly(){
  const c=document.getElementById("weekly-view");
  c.innerHTML="";
  if(!state.calendar) return;
  state.calendar.days.forEach(day=>{
    const past = isPast(day.date);
    const col=document.createElement("div");
    col.className="day-column" + (past ? " past" : "");
    const d=parseDate(day.date);
    const header=document.createElement("div");
    header.className="day-header";
    header.innerHTML=`<strong>${d.toLocaleDateString('default',{weekday:'short'})}</strong><small>${day.date}</small>` + (past ? ` <span class="past-label">— past (locked)</span>` : "");
    header.onclick=()=> openModal(day.date);
    col.appendChild(header);
    const slotsWrap=document.createElement("div");
    slotsWrap.className="day-slots";
    day.slots.forEach(slot=>{
      const sDiv=renderSlot(slot, day.date);
      slotsWrap.appendChild(sDiv);
    });
    col.appendChild(slotsWrap);
    if(state.calendar.house.buffer_mode==="per_day" && day.day_buffer.length>0){
      const buf=document.createElement("div");
      buf.className="buffer-zone";
      buf.style.margin="8px";
      buf.innerHTML=`<h3 style="font-size:13px">Day buffer ${past?'<span class="past-label">(locked)</span>':''}</h3>`;
      const platesDiv=document.createElement("div");
      platesDiv.className="plates";
      day.day_buffer.forEach(p=> platesDiv.appendChild(renderPlate(p, day.date, null)));
      buf.appendChild(platesDiv);
      if(!past){
        buf.addEventListener("dragover", e=>{ e.preventDefault(); buf.classList.add("drag-over"); });
        buf.addEventListener("dragleave", ()=> buf.classList.remove("drag-over"));
        buf.addEventListener("drop", e=>{ e.preventDefault(); buf.classList.remove("drag-over"); handleDrop(day.date, null); });
      }
      col.appendChild(buf);
    }
    if(state.calendar.house.buffer_mode==="per_day" && !past){
      const add=document.createElement("div");
      add.className="add-plate";
      add.style.padding="8px";
      add.innerHTML=`<input class="plate-title-input" placeholder="Add to day buffer" data-date="${day.date}"><input class="plate-note-input" placeholder="note"><input class="plate-tags-input" placeholder="tags"><button class="plate-add-btn">Add</button><div class="autocomplete"></div>`;
      const titleIn=add.querySelector(".plate-title-input");
      const noteIn=add.querySelector(".plate-note-input");
      const tagsIn=add.querySelector(".plate-tags-input");
      const btn=add.querySelector("button");
      const ac=add.querySelector(".autocomplete");
      btn.onclick=()=> addPlateFromInput(titleIn, noteIn, day.date, null, ac, tagsIn);
      setupAutocomplete(titleIn, ac);
      setupTagsAutocomplete(tagsIn);
      col.appendChild(add);
    }
    c.appendChild(col);
  });
}
function renderSlot(slot, date){
  const past = isPast(date);
  const div=document.createElement("div");
  div.className="slot" + (past ? " past" : "");
  div.dataset.slotId=slot.id;
  div.dataset.date=date;
  const title=document.createElement("div");
  title.className="slot-title";
  title.innerHTML=`<span>${escapeHtml(slot.label)}</span>` + (past ? ` <span class="past-label">locked</span>` : "");
  if(!past){
    const del=document.createElement("button");
    del.textContent="✕";
    del.title="Delete slot";
    del.onclick=async()=>{ if(confirm(`Delete ${slot.label}? Plates move to buffer`)){ try{ await api(`/api/slots/${slot.id}`,{method:"DELETE"}); loadCalendar(); }catch(e){ alert(e.message);} } };
    title.appendChild(del);
  }
  div.appendChild(title);
  const platesDiv=document.createElement("div");
  platesDiv.className="plates";
  slot.plates.forEach(p=> platesDiv.appendChild(renderPlate(p, date, slot.id)));
  div.appendChild(platesDiv);
  if(!past){
    const add=document.createElement("div");
    add.className="add-plate";
    add.innerHTML=`<input class="plate-title-input" placeholder="Add plate to ${escapeHtml(slot.label)}" data-date="${date}" data-slot="${slot.id}"><input class="plate-note-input" placeholder="note"><input class="plate-tags-input" placeholder="tags: fish, meat"><button class="plate-add-btn">Add</button><div class="autocomplete"></div>`;
    const titleIn=add.querySelector(".plate-title-input");
    const noteIn=add.querySelector(".plate-note-input");
    const tagsIn=add.querySelector(".plate-tags-input");
    const btn=add.querySelector("button");
    const ac=add.querySelector(".autocomplete");
    btn.onclick=()=> addPlateFromInput(titleIn, noteIn, date, slot.id, ac, tagsIn);
    setupAutocomplete(titleIn, ac);
    setupTagsAutocomplete(tagsIn);
    div.appendChild(add);
    div.addEventListener("dragover", e=>{ e.preventDefault(); div.classList.add("drag-over"); });
    div.addEventListener("dragleave", ()=> div.classList.remove("drag-over"));
    div.addEventListener("drop", e=>{
      e.preventDefault(); div.classList.remove("drag-over");
      handleDrop(date, slot.id);
    });
  }
  return div;
}
function renderPlate(p, date, slotId){
  const past = isPast(p.date);
  const div=document.createElement("div");
  div.className="plate" + (past ? " past" : "");
  div.draggable = !past;
  div.dataset.plateId=p.id;
  const tagsHtml=(p.tags||[]).map(t=>`<span class="tag">${escapeHtml(t)}</span>`).join("");
  const canEdit = state.user && p.proposed_by===state.user.id && !past;
  const actionsHtml = canEdit
    ? `<div class="plate-title-actions"><button class="icon-btn edit-btn" title="Edit">✎</button><button class="icon-btn del-btn" title="Delete">✕</button></div>`
    : past ? `<span class="past-label">locked (past)</span>` : ``;
  div.innerHTML=`
    <div class="plate-title-row"><div class="plate-title">${escapeHtml(p.title)}${past? ' <span class="past-label">(past)</span>':''}</div>${actionsHtml}</div>
    ${p.note?`<div class="plate-note">${escapeHtml(p.note)}</div>`:""}
    ${tagsHtml?`<div class="plate-tags">${tagsHtml}</div>`:""}
    <div class="plate-meta">
      <button class="vote-btn ${p.my_vote===1?'active-up':''}" data-v="1" ${past?'disabled title="past locked"':''}>▲ ${p.up}</button>
      <button class="vote-btn ${p.my_vote===-1?'active-down':''}" data-v="-1" ${past?'disabled title="past locked"':''}>▼ ${p.down}</button>
      <span style="margin-left:6px">score ${p.score}</span>
      <span style="margin-left:auto; font-size:11px; color:#777">#${p.id} by ${p.proposed_by}</span>
    </div>
  `;
  if(canEdit){
    const editBtn=div.querySelector(".edit-btn");
    const delBtn=div.querySelector(".del-btn");
    editBtn.onclick=async(e)=>{
      e.stopPropagation();
      const nt=prompt("Edit title", p.title);
      if(nt===null) return;
      const nn=prompt("Edit note", p.note);
      if(nn===null) return;
      const ng=prompt("Edit tags (comma separated: fish, meat, dessert)", (p.tags||[]).join(", "));
      if(ng===null) return;
      try{ await api(`/api/plates/${p.id}`,{method:"PUT", body:JSON.stringify({title:nt, note:nn, tags:ng})}); loadCalendar(); loadHistory(); if(state.selectedDay) openModal(state.selectedDay); }catch(err){ alert(err.message); }
    };
    delBtn.onclick=async(e)=>{
      e.stopPropagation();
      if(confirm("Delete plate?")){ try{ await api(`/api/plates/${p.id}`,{method:"DELETE"}); loadCalendar(); loadHistory(); if(state.selectedDay) openModal(state.selectedDay); }catch(err){ alert(err.message);} }
    };
    editBtn.addEventListener("mousedown", e=>e.stopPropagation());
    delBtn.addEventListener("mousedown", e=>e.stopPropagation());
  }
  if(!past){
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
      state.draggingHistory=null;
      div.classList.add("dragging");
      e.dataTransfer.effectAllowed="move";
    });
    div.addEventListener("dragend", ()=>{ state.draggingId=null; div.classList.remove("dragging"); });
  }
  return div;
}

function renderGlobalBuffer(){
  const cont=document.getElementById("global-buffer-plates");
  cont.innerHTML="";
  if(!state.calendar) return;
  document.querySelector("#global-buffer .buffer-desc").textContent = state.calendar.house.buffer_mode==="global"
    ? "Global shared across all days — drag plates here to keep as ideas"
    : "Global buffer (mode per_day active — this is shared, day buffers are inside each day)";
  state.calendar.global_buffer.forEach(p=>{
    const el=renderPlate(p, null, null);
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
  const firstDate=parseDate(state.calendar.days[0].date);
  let startPad = (firstDate.getDay()===0?6:firstDate.getDay()-1);
  for(let i=0;i<startPad;i++){ const empty=document.createElement("div"); grid.appendChild(empty); }
  state.calendar.days.forEach(day=>{
    const cell=document.createElement("div");
    const past = isPast(day.date);
    cell.className="month-cell" + (past ? " past" : "");
    const d=parseDate(day.date);
    if(fmtDate(new Date())===day.date) cell.classList.add("today");
    let mini = day.slots.map(s=> `${escapeHtml(s.label)}: ${s.plates.length}`).join(" | ");
    if(day.day_buffer.length) mini += ` | buffer:${day.day_buffer.length}`;
    if(past) mini += ` <span class="past-label">(locked)</span>`;
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
  const past = isPast(day.date);
  const wrap=document.createElement("div");
  wrap.className="daily-container";
  const hdr=document.createElement("h2");
  hdr.textContent=day.date + (past ? " — past (locked)" : "");
  hdr.style.cursor="pointer"; hdr.onclick=()=> openModal(day.date);
  wrap.appendChild(hdr);
  day.slots.forEach(slot=>{
    const sDiv=renderSlot(slot, day.date);
    wrap.appendChild(sDiv);
  });
  if(day.day_buffer.length>0){
    const buf=document.createElement("div");
    buf.className="buffer-zone";
    buf.innerHTML=`<h3>Day buffer ${past?'<span class="past-label">(locked)</span>':''}</h3>`;
    const pd=document.createElement("div");
    pd.className="plates";
    day.day_buffer.forEach(p=> pd.appendChild(renderPlate(p, day.date, null)));
    buf.appendChild(pd);
    if(!past){
      buf.addEventListener("dragover", e=>{ e.preventDefault(); buf.classList.add("drag-over"); });
      buf.addEventListener("dragleave", ()=> buf.classList.remove("drag-over"));
      buf.addEventListener("drop", e=>{ e.preventDefault(); buf.classList.remove("drag-over"); handleDrop(day.date, null); });
    }
    wrap.appendChild(buf);
  }
  if(!past){
    const addWrap=document.createElement("div");
    addWrap.className="add-slot";
    addWrap.innerHTML=`<input id="daily-new-slot" placeholder="Add new meal for ${day.date}"><button id="daily-add-slot">Add slot</button>`;
    wrap.appendChild(addWrap);
    setTimeout(()=>{
      const ib=document.getElementById("daily-new-slot");
      const bt=document.getElementById("daily-add-slot");
      if(bt) bt.onclick=async()=>{
        const label=ib.value.trim(); if(!label) return;
        try{ await api("/api/slots",{method:"POST", body:JSON.stringify({house_id:state.currentHouseId, date:day.date, label})}); loadCalendar(); }catch(e){ alert(e.message); }
      };
    },0);
  }
  c.appendChild(wrap);
}

// --- settings ---
function openSettings(){
  document.getElementById("settings-modal").style.display="flex";
  refreshSettingsUser();
  refreshSettingsHouse();
  renderTemplateEditor();
  applyTheme();
  // default tab user
  document.querySelectorAll("#settings-tabs .tab").forEach(x=>x.classList.remove("active"));
  document.querySelector("#settings-tabs .tab[data-tab='user']").classList.add("active");
  document.querySelectorAll(".settings-pane").forEach(p=>p.style.display="none");
  document.getElementById("settings-user").style.display="block";
}
function closeSettings(){ document.getElementById("settings-modal").style.display="none"; }
function refreshSettingsUser(){
  if(!state.user) return;
  document.getElementById("settings-username").textContent=state.user.username;
  const cont=document.getElementById("settings-houses");
  cont.innerHTML="";
  state.houses.forEach(h=>{
    const row=document.createElement("div");
    row.style.display="flex"; row.style.justifyContent="space-between"; row.style.alignItems="center"; row.style.padding="6px"; row.style.border="1px solid #eee"; row.style.borderRadius="6px"; row.style.margin="4px 0";
    row.innerHTML=`<span>${escapeHtml(h.name)} <small>(${escapeHtml(h.invite_code)}) ${h.id===state.currentHouseId?"— active":""}</small></span>`;
    const btn=document.createElement("button");
    btn.textContent=h.id===state.currentHouseId?"Active":"Switch";
    btn.disabled=h.id===state.currentHouseId;
    btn.onclick=()=>{ state.currentHouseId=h.id; saveState(); loadCalendar(); loadHistory(); refreshSettingsUser(); refreshSettingsHouse(); renderTemplateEditor(); alert("switched to "+h.name); };
    row.appendChild(btn);
    cont.appendChild(row);
  });
}
function refreshSettingsHouse(){
  if(!state.calendar) return;
  const h=state.calendar.house;
  document.getElementById("settings-house-name").value=h.name;
  document.getElementById("settings-invite").textContent=h.invite_code;
  const memSpan=document.getElementById("settings-members");
  if(memSpan){
    // fetch members via get_house
    api(`/api/houses/${h.id}`).then(data=>{
      memSpan.textContent=(data.members||[]).map(m=>m.username).join(", ")||"—";
    }).catch(()=> memSpan.textContent="—");
  }
  const bt=document.getElementById("settings-buffer-toggle");
  if(bt) bt.checked=(h.buffer_mode==="per_day");
}
async function saveUsername(){
  const inp=document.getElementById("settings-new-username");
  const msg=document.getElementById("settings-user-msg");
  const val=inp.value.trim();
  if(!val){ msg.textContent="username required"; return; }
  try{ const r=await api("/api/me",{method:"PUT", body:JSON.stringify({username:val})}); state.user.username=r.username; state.token=r.token; saveState(); document.getElementById("user-info").textContent=r.username; document.getElementById("settings-username").textContent=r.username; msg.textContent="username updated"; inp.value=""; }catch(e){ msg.textContent=e.message; }
}
async function savePassword(){
  const oldp=document.getElementById("settings-old-pw").value;
  const newp=document.getElementById("settings-new-pw").value;
  const msg=document.getElementById("settings-user-msg");
  if(!oldp||!newp){ msg.textContent="both passwords required"; return; }
  try{ const r=await api("/api/me",{method:"PUT", body:JSON.stringify({password:oldp,new_password:newp})}); state.token=r.token; saveState(); msg.textContent="password updated"; document.getElementById("settings-old-pw").value=""; document.getElementById("settings-new-pw").value=""; }catch(e){ msg.textContent=e.message; }
}
async function saveHouseName(){
  const inp=document.getElementById("settings-house-name");
  const msg=document.getElementById("settings-house-msg");
  const val=inp.value.trim();
  if(!val){ msg.textContent="name required"; return; }
  try{ await api(`/api/houses/${state.currentHouseId}`,{method:"PUT", body:JSON.stringify({name:val})}); msg.textContent="saved"; loadHouses(); loadCalendar(); }catch(e){ msg.textContent=e.message; }
}
// template
function renderTemplateEditor(){
  const cont=document.getElementById("template-list");
  if(!cont||!state.calendar) return;
  cont.innerHTML="";
  const labels=state.calendar.house.daily_template || ["lunch","dinner"];
  labels.forEach((lb,idx)=>{
    const row=document.createElement("div");
    row.className="template-row";
    const inp=document.createElement("input");
    inp.value=lb;
    inp.dataset.idx=idx;
    const up=document.createElement("button"); up.textContent="↑"; up.onclick=()=> moveTemplate(idx,-1);
    const down=document.createElement("button"); down.textContent="↓"; down.onclick=()=> moveTemplate(idx,1);
    const del=document.createElement("button"); del.textContent="✕"; del.onclick=()=> removeTemplate(idx);
    inp.onchange=e=>{ labels[idx]=e.target.value.trim()||labels[idx]; };
    row.appendChild(inp); row.appendChild(up); row.appendChild(down); row.appendChild(del);
    cont.appendChild(row);
  });
}
function templateAddField(){
  const inp=document.getElementById("template-new-label");
  const val=inp.value.trim();
  if(!val) return;
  const labels=state.calendar.house.daily_template || [];
  if(labels.length>=8){ alert("max 8 fields"); return; }
  labels.push(val);
  state.calendar.house.daily_template=labels;
  inp.value="";
  renderTemplateEditor();
}
function removeTemplate(idx){
  const labels=state.calendar.house.daily_template;
  labels.splice(idx,1);
  renderTemplateEditor();
}
function moveTemplate(idx,dir){
  const labels=state.calendar.house.daily_template;
  const n=idx+dir;
  if(n<0||n>=labels.length) return;
  const tmp=labels[idx]; labels[idx]=labels[n]; labels[n]=tmp;
  renderTemplateEditor();
}
async function saveTemplate(){
  const msg=document.getElementById("template-msg");
  const cont=document.getElementById("template-list");
  // read current inputs
  const inputs=cont.querySelectorAll("input");
  const labels=[];
  inputs.forEach(i=>{ const v=i.value.trim(); if(v) labels.push(v); });
  if(labels.length===0){ msg.textContent="at least one field"; return; }
  const apply=document.getElementById("template-apply-future").checked;
  try{
    const res=await api(`/api/houses/${state.currentHouseId}/template?apply_future=${apply}`,{method:"PUT", body:JSON.stringify({labels})});
    state.calendar.house.daily_template=res.daily_template;
    msg.textContent="saved"+(apply?" + applied to future":"");
    loadCalendar();
  }catch(e){ msg.textContent=e.message; }
}

// --- modal ---
function openModal(date){
  state.selectedDay=date;
  const modal=document.getElementById("day-modal");
  modal.style.display="flex";
  const past=isPast(date);
  document.getElementById("modal-date").textContent=date + (past ? " — past (read-only)" : "");
  document.getElementById("modal-buffer-add").disabled=past;
  document.getElementById("modal-buffer-title").disabled=past;
  document.getElementById("modal-buffer-note").disabled=past;
  const mt=document.getElementById("modal-buffer-tags");
  if(mt) mt.disabled=past;
  document.getElementById("new-slot-label").disabled=past;
  document.getElementById("add-slot-btn").disabled=past;
  if(past){
    document.getElementById("modal-buffer").classList.add("past");
  } else {
    document.getElementById("modal-buffer").classList.remove("past");
  }
  refreshModal();
}
function closeModal(){ document.getElementById("day-modal").style.display="none"; state.selectedDay=null; }
function refreshModal(){
  if(!state.selectedDay || !state.calendar) return;
  let day = state.calendar.days.find(d=>d.date===state.selectedDay);
  const past = isPast(state.selectedDay);
  if(!day){
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
  day.day_buffer.forEach(p=> bufPlates.appendChild(renderPlate(p, day.date, null)));
  const modalBuf=document.getElementById("modal-buffer");
  modalBuf.replaceWith(modalBuf.cloneNode(true));
  const newBuf=document.getElementById("modal-buffer");
  if(!past){
    newBuf.addEventListener("dragover", e=>{ e.preventDefault(); newBuf.classList.add("drag-over"); });
    newBuf.addEventListener("dragleave", ()=> newBuf.classList.remove("drag-over"));
    newBuf.addEventListener("drop", e=>{ e.preventDefault(); newBuf.classList.remove("drag-over"); handleDrop(day.date, null); });
  }
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
async function addPlateFromInput(titleIn, noteIn, date, slotId, acEl, tagsIn){
  if(date && isPast(date)){ alert("past days not modifiable"); return; }
  const title=titleIn.value.trim();
  const note=noteIn?noteIn.value.trim():"";
  const tags=tagsIn?tagsIn.value.trim():"";
  if(!title){ titleIn.focus(); return; }
  const body={house_id: state.currentHouseId, title, note, tags, date: date||null, slot_id: slotId||null};
  try{
    await api("/api/plates",{method:"POST", body:JSON.stringify(body)});
    titleIn.value=""; if(noteIn) noteIn.value=""; if(tagsIn) tagsIn.value=""; if(acEl) acEl.style.display="none";
    loadCalendar(); loadHistory();
    if(state.selectedDay) refreshModal();
  }catch(e){ alert(e.message); }
}
async function movePlate(plateId, toDate, toSlotId){
  const dragging = state.calendar ? findPlateDate(plateId) : null;
  if(dragging && isPast(dragging)){ alert("past days not modifiable (source)"); return; }
  if(toDate && isPast(toDate)){ alert("past days not modifiable (target)"); return; }
  try{
    await api(`/api/plates/${plateId}/move`,{method:"POST", body:JSON.stringify({to_date: toDate||null, to_slot_id: toSlotId||null})});
    loadCalendar(); loadHistory();
    if(state.selectedDay) refreshModal();
  }catch(e){ alert(e.message); }
}
function findPlateDate(plateId){
  if(!state.calendar) return null;
  for(const day of state.calendar.days){
    for(const slot of day.slots){
      if(slot.plates.some(p=>p.id===plateId)) return day.date;
    }
    if(day.day_buffer.some(p=>p.id===plateId)) return day.date;
  }
  for(const p of state.calendar.global_buffer) if(p.id===plateId) return null;
  return null;
}
async function addSlot(){
  if(isPast(state.selectedDay)){ alert("past days not modifiable"); return; }
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
let tagsAcTimeout=null;
function setupTagsAutocomplete(input, acDiv){
  if(!input) return;
  // create ac div if not provided
  if(!acDiv){
    acDiv=document.createElement("div");
    acDiv.className="autocomplete";
    acDiv.style.display="none";
    // ensure parent is relative for absolute positioning
    const parent=input.parentElement;
    if(parent && getComputedStyle(parent).position==="static"){
      parent.style.position="relative";
    }
    parent.appendChild(acDiv);
  }
  input.addEventListener("input", ()=>{
    // last fragment after comma
    const val=input.value;
    const parts=val.split(",");
    const q=parts[parts.length-1].trim();
    if(tagsAcTimeout) clearTimeout(tagsAcTimeout);
    if(!q){ acDiv.style.display="none"; return; }
    tagsAcTimeout=setTimeout(async()=>{
      try{
        const res=await api(`/api/tags/autocomplete?house_id=${state.currentHouseId}&query=${encodeURIComponent(q)}&limit=8`);
        if(res.length===0){ acDiv.style.display="none"; return; }
        acDiv.innerHTML="";
        res.forEach(t=>{
          const d=document.createElement("div");
          d.textContent=t;
          d.onclick=()=>{
            parts[parts.length-1]=" "+t;
            // rebuild comma separated, trim leading spaces
            let newVal=parts.map((p,i)=> i===parts.length-1 ? t : p.trim()).join(", ");
            // keep trailing comma space for next tag?
            if(!newVal.endsWith(", ")) newVal+=", ";
            input.value=newVal;
            acDiv.style.display="none";
            input.focus();
          };
          acDiv.appendChild(d);
        });
        acDiv.style.display="block";
      }catch(e){ acDiv.style.display="none"; }
    },200);
  });
  input.addEventListener("blur", ()=> setTimeout(()=> acDiv.style.display="none",250));
  input.addEventListener("focus", ()=>{
    const val=input.value; const parts=val.split(","); const q=parts[parts.length-1].trim();
    if(q && acDiv.children.length>0) acDiv.style.display="block";
  });
}
