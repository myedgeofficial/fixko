import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, connectFirestoreEmulator
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "firebase/storage";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { STROKE, REGIJE, KDAJ, DOMA, BUDGET, strokaIme, regijaIme, dnevi, prosteUre, opisTermina, pred, veljavenTel, veljavnaDavcna, cistaDavcna, testnaFirma, POGOJI_VERZIJA } from "./data.js";
import { prepoznajStroko, krajIzLokacije, regijaIzKraja } from "./pomoc.js";
import { ikona } from "./ikone.js";

const FixkoPay = registerPlugin("FixkoPay");
const FixkoKoledar = registerPlugin("FixkoKoledar");
const native = Capacitor.isNativePlatform();
const view = document.getElementById("view");
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* ---------- lokalne nastavitve (vloga, zadnji kraj in telefon) ---------- */
const prefs = { role: "N", regija: "", kraj: "", tel: "", ime: "" };
async function loadPrefs() {
  try { const { value } = await Preferences.get({ key: "fixko" }); Object.assign(prefs, JSON.parse(value || "{}")); } catch (e) {}
}
function savePrefs() { Preferences.set({ key: "fixko", value: JSON.stringify(prefs) }).catch(() => {}); }

/* ---------- Firebase ---------- */
let db, storage, fns, uid;
const cfg = window.FIXKO_FB;
function initFb() {
  const app = initializeApp(cfg);
  const auth = initializeAuth(app, { persistence: indexedDBLocalPersistence });
  db = initializeFirestore(app, { experimentalAutoDetectLongPolling: true });
  storage = getStorage(app);
  fns = getFunctions(app, "europe-west1");
  if (cfg.emulator) { // samo za lokalne preizkuse
    connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
    connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  }
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (u) => { if (u) { uid = u.uid; resolve(); } });
    signInAnonymously(auth).catch(reject);
  });
}
const call = (name, data) => httpsCallable(fns, name)(data).then((r) => r.data);

/* ---------- stanje ---------- */
const S = { ponudbe: [], moje: {}, myJobs: [], kontakti: {}, feed: [], taken: [], mojster: null, pay: null, seen: new Set(), firstFeed: true };
let draft = { cat: "", photo: null, blob: null, opis: "", kdaj: KDAJ[0], doma: [], budget: "" };
const unsub = [];

/* ---------- obvestila ---------- */
let pushToken = null;
async function enablePush() {
  if (!native) return null;
  try {
    let p = await PushNotifications.checkPermissions();
    if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PushNotifications.requestPermissions();
    if (p.receive !== "granted") return null;
    if (pushToken) return pushToken;
    return await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 10000);
      PushNotifications.addListener("registration", (r) => { clearTimeout(t); pushToken = r.value; resolve(r.value); });
      PushNotifications.addListener("registrationError", () => { clearTimeout(t); resolve(null); });
      PushNotifications.register();
    });
  } catch (e) { return null; }
}
if (native) {
  PushNotifications.addListener("pushNotificationActionPerformed", (a) => {
    const vloga = a.notification?.data?.vloga;
    if (vloga === "M" || vloga === "N") setRole(vloga);
  });
}

/* ---------- vloga ---------- */
document.getElementById("tabN").onclick = () => setRole("N");
document.getElementById("tabM").onclick = () => setRole("M");
document.getElementById("nast").onclick = () => settingsSheet();
document.getElementById("pomoc").onclick = () => pomocSheet();
function setRole(r) { prefs.role = r; prefs.uvod = true; savePrefs(); render(); window.scrollTo(0, 0); }
function render() {
  const uvod = !prefs.uvod;
  document.querySelector(".switch").hidden = uvod;
  if (uvod) { document.getElementById("oglas").hidden = true; document.body.classList.remove("z-oglasom"); if (!view.querySelector(".izbira")) renderUvod(); return; }
  document.getElementById("tabN").setAttribute("aria-pressed", prefs.role === "N");
  document.getElementById("tabM").setAttribute("aria-pressed", prefs.role === "M");
  // Oglasna pasica samo pri strankah (mojstri plačujejo naročnino).
  document.getElementById("oglas").hidden = prefs.role !== "N";
  document.body.classList.toggle("z-oglasom", prefs.role === "N");
  prefs.role === "N" ? renderN() : renderM();
}

const icon = (s = 48) => `<svg width="${s}" height="${s}" viewBox="0 0 28 28" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l2-3h8l2 3h4v13H4z"/><circle cx="14" cy="15" r="4"/></svg>`;
const pic = (j) => `<div class="pic">${j.slika ? `<img src="${esc(j.slika)}" alt="" loading="lazy">` : icon(56)}</div>${(j.slike || []).length ? `<div class="vec">${j.slike.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</div>` : ""}`;
const opt = (list, sel, prazno) => (prazno ? `<option value="">${prazno}</option>` : "") + list.map(([k, n]) => `<option value="${k}"${k === sel ? " selected" : ""}>${n}</option>`).join("");

/* =================== UVOD =================== */
// Prvi zagon: kaj je Fixko in kdo ste, z dvema velikima gumboma.
const KORAKI = {
  N: [["kamera", "Fotografirajte ali opišite", "Kaj je narobe. Fixko sam ugotovi, kateri mojster je pravi."], ["telefon", "Mojster vas pokliče", "Dogovorite se za ceno in termin."], ["dom", "Mojster pride", "V aplikaciji vidite njegovo ime, sliko in podjetje."]],
  M: [["mojster", "Uredi profil", "Slika, podjetje, stroka in kje delaš."], ["kamera", "Dobiš obvestilo", "Ko nekdo v tvoji bližini rabi tvojo stroko."], ["telefon", "Prevzemi in pokliči", "Izbereš termin, stranka te pričakuje."]]
};
const koraki = (r) => `<ol class="koraki">${KORAKI[r].map(([ik, t, m], i) => `<li><span class="kn">${ikona(ik, 26)}<i>${i + 1}</i></span><div><b>${t}</b><small>${m}</small></div></li>`).join("")}</ol>`;
function renderUvod() {
  view.innerHTML = `
  <div class="uvod">
    <img src="logo.png" width="88" height="88" alt="">
    <h1>Mojster na vašem domu</h1>
    <p class="lead">Pipa pušča, luč ne gori, vrata škripajo? Fixko poišče mojstra v vaši bližini.</p>
  </div>
  ${koraki("N")}
  <h2 class="kdo">Kdo ste?</h2>
  <button class="izbira" type="button" data-r="N"><span>${ikona("dom", 34)}</span><div><b>Rabim mojstra</b><small>Brezplačno za vas</small></div></button>
  <button class="izbira" type="button" data-r="M"><span>${ikona("orodje", 34)}</span><div><b>Sem mojster</b><small>Dobivajte nova dela v bližini</small></div></button>`;
  view.querySelectorAll(".izbira").forEach((b) => (b.onclick = () => setRole(b.dataset.r)));
}
function pomocSheet() {
  const r = prefs.uvod ? prefs.role : "N";
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="Kako deluje"><h2 style="margin-top:0">Kako deluje</h2>
    ${koraki(r)}
    ${r === "N" ? `<p class="lead">Ne veste, kateri mojster? Samo opišite težavo, Fixko izbere sam. Ne veste, kako napisati? Tapnite mikrofon na tipkovnici in povejte.</p>` : `<p class="lead">Stranka vidi tvojo sliko, ime, podjetje in davčno številko, zato ti lažje zaupa.</p>`}
    <p class="lead">Vprašanja: <a class="link" href="mailto:urska.repusic@gmail.com">urska.repusic@gmail.com</a></p>
    <button class="btn" type="button" id="x">Razumem</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
}

/* =================== STRANKA =================== */
// Preprosto za starejše: slika ali opis, stroka in kraj se prepoznata sama.
const kamera = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h3.5l1.7-2.5h7.6L17.5 8H21v11H3z"/><circle cx="12" cy="13.5" r="3.6"/></svg>`;
const pin = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
const kdo = (k) => ({ vodovod: "vodovodar", elektrika: "električar", keramika: "keramičar", pleskanje: "pleskar", mizarstvo: "mizar", montaza: "monter pohištva", ogrevanje: "serviser ogrevanja in klime", streha: "krovec", vrt: "vrtnar", ciscenje: "čistilni servis", selitve: "selitveni servis", drugo: "hišnik" }[k] || strokaIme(k));

let iscem = false;
async function najdiLokacijo(vprasaj) {
  if (iscem) return; iscem = true;
  try {
    let p = await Geolocation.checkPermissions();
    if (p.location !== "granted" && vprasaj) p = await Geolocation.requestPermissions();
    if (p.location !== "granted") throw new Error("ni dovoljenja");
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 });
    const k = krajIzLokacije(pos.coords.latitude, pos.coords.longitude);
    if (k && !prefs.krajRocno) { prefs.kraj = k.kraj; prefs.regija = k.regija; savePrefs(); }
    else if (!k && vprasaj) draft.urejamKraj = true;
  } catch (e) { if (vprasaj) draft.urejamKraj = true; }
  iscem = false;
  if (prefs.role === "N") osveziKraj();
}

function renderN() {
  if (!prefs.uvod) return render(); // posodobitve iz baze ne smejo preskočiti uvodnega zaslona
  const aktivna = S.myJobs.filter((j) => j.status === "odprto" || j.status === "prevzeto");
  const stara = S.myJobs.filter((j) => !aktivna.includes(j));
  view.innerHTML = `
  ${aktivna.length ? `<h2 class="prvi">Vaša naročila</h2><div class="list">${aktivna.map(cardN).join("")}</div><h2>Novo naročilo</h2>` : `<h1>Kaj je treba popraviti?</h1>`}
  <form id="f" novalidate>
    <div class="korak"><span>1</span>Pokažite ali opišite</div>
    <label class="shot${draft.photo ? " ima" : ""}" for="file">${draft.photo ? `<img src="${draft.photo}" alt="Vaša slika"><span class="zamenjaj">Zamenjaj sliko</span>` : `${ikona("kamera", 46, 1.6)}<b>Fotografirajte</b><small>ali izberite sliko iz telefona</small>`}</label>
    <input id="file" type="file" accept="image/*" hidden>

    <label for="opis" class="big">Na kratko opišite</label>
    <textarea id="opis" rows="2" maxlength="200" placeholder="npr. Pušča pipa v kuhinji">${esc(draft.opis)}</textarea>
    <p class="hint">Lahko tudi poveste: tapnite mikrofon na tipkovnici.</p>

    <div class="korak"><span>2</span>Kdo in kam</div>
    <div id="stroka"></div>
    <div id="kraj"></div>

    <div class="korak"><span>3</span>Kdaj naj pride</div>
    <div class="chips" id="kdaj">${KDAJ.map((k) => `<button type="button" class="chip" data-v="${k}" aria-pressed="${draft.kdaj === k}">${k}</button>`).join("")}</div>
    <label class="big">Kdaj ste doma? <span class="neobv">lahko več</span></label>
    <div class="chips" id="doma">${DOMA.map((k) => `<button type="button" class="chip" data-v="${k}" aria-pressed="${draft.doma.includes(k)}">${k}</button>`).join("")}</div>

    <div class="korak"><span>4</span>Koliko ste približno pripravljeni plačati?</div>
    <div class="chips" id="budget">${BUDGET.map((k) => `<button type="button" class="chip" data-v="${k}" aria-pressed="${draft.budget === k}">${k}</button>`).join("")}</div>
    <p class="hint">Samo okvirno, da se mojster lažje odloči. Točno ceno se dogovorite z njim.</p>

    <div class="korak"><span>5</span>Kam naj vas mojster pokliče</div>
    <input id="tel" type="tel" inputmode="tel" maxlength="20" placeholder="041 123 456" value="${esc(prefs.tel)}" autocomplete="tel" aria-label="Vaša telefonska številka">

    <div class="err" id="err" hidden></div>
    <button class="btn big" type="submit" id="send">Pošlji mojstrom</button>
    <p class="note">Mojster vas pokliče in se dogovori za termin. Za vas je Fixko brezplačen. S pošiljanjem sprejemate <a class="link" href="pogoji.html">pogoje uporabe</a> in <a class="link" href="zasebnost.html">politiko zasebnosti</a>.</p>
  </form>
  ${stara.length ? `<h2>Prejšnja naročila</h2><div class="list">${stara.map(cardN).join("")}</div>` : ""}`;

  const f = document.getElementById("f");
  const keep = () => { draft.opis = f.opis.value; prefs.tel = f.tel.value; const k = document.getElementById("krajIn"); if (k) { prefs.kraj = k.value; } };
  f.opis.oninput = () => { draft.opis = f.opis.value; if (!draft.catRocno) { draft.cat = prepoznajStroko(draft.opis); } osveziStroko(); };
  document.getElementById("file").onchange = (e) => {
    const fl = e.target.files[0]; if (!fl) return; keep();
    shrink(fl).then(({ url, blob }) => { draft.photo = url; draft.blob = blob; renderN(); }).catch(() => toast("Slike ni bilo mogoče odpreti", "Poskusite z drugo sliko."));
  };
  const izbira = (id, multi) => view.querySelectorAll(`#${id} .chip`).forEach((b) => (b.onclick = () => {
    const v = b.dataset.v;
    if (multi) { draft.doma = draft.doma.includes(v) ? draft.doma.filter((x) => x !== v) : [...draft.doma, v]; b.setAttribute("aria-pressed", draft.doma.includes(v)); return; }
    draft[id] = v; view.querySelectorAll(`#${id} .chip`).forEach((x) => x.setAttribute("aria-pressed", x.dataset.v === v));
  }));
  izbira("kdaj"); izbira("doma", true); izbira("budget");
  view.querySelectorAll("[data-sprejmi]").forEach((b) => (b.onclick = () => odgovori(b, true)));
  view.querySelectorAll("[data-vec]").forEach((inp) => (inp.onchange = () => dodajSlike(inp.dataset.vec, [...inp.files])));
  view.querySelectorAll("[data-zavrni]").forEach((b) => (b.onclick = () => odgovori(b, false)));
  view.querySelectorAll("[data-done]").forEach((b) => (b.onclick = () => setStatus(b.dataset.done, "opravljeno")));
  view.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = () => potrdiSheet("Prekličem naročilo?", "Mojstri ga ne bodo več videli.", "Da, prekliči", () => odpovej(b.dataset.cancel, true))));
  view.querySelectorAll("[data-zamenjaj]").forEach((b) => (b.onclick = () => potrdiSheet("Zamenjam mojstra?", "Temu mojstru odpoveste termin. Naročilo ostane objavljeno, druge ponudbe se vrnejo in izberete lahko drugega mojstra.", "Da, zamenjaj", () => odpovej(b.dataset.zamenjaj, false))));
  view.querySelectorAll("[data-koledar]").forEach((b) => (b.onclick = () => vKoledar(S.myJobs.find((j) => j.id === b.dataset.koledar), "N")));
  view.querySelectorAll("[data-prijavim]").forEach((b) => (b.onclick = () => prijaviSheet({ delo: b.dataset.prijavim, kdo: "mojster" })));
  osveziStroko(); osveziKraj();
  if (!prefs.kraj && !draft.urejamKraj && !draft.vprasal) { draft.vprasal = true; najdiLokacijo(true); }

  f.onsubmit = async (e) => {
    e.preventDefault(); keep();
    if (!prefs.regija) prefs.regija = regijaIzKraja(prefs.kraj);
    savePrefs();
    const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; el.scrollIntoView({ block: "center", behavior: "smooth" }); };
    if (!draft.blob && draft.opis.trim().length < 3) return err("Fotografirajte ali na kratko opišite, kaj je treba narediti.");
    if (!draft.cat) { draft.izberi = true; osveziStroko(); return err("Izberite, kdo vam lahko pomaga."); }
    if (!prefs.kraj.trim()) { draft.urejamKraj = true; osveziKraj(); return err("Vpišite kraj, kamor naj pride mojster."); }
    if (!prefs.regija) { draft.urejamKraj = true; osveziKraj(); return err("Izberite območje."); }
    if (!veljavenTel(prefs.tel)) return err("Vpišite telefonsko številko, npr. 041 123 456.");
    if (!db) return err("Fixko še ni povezan s strežnikom. Poskusite malo kasneje.");
    const btn = document.getElementById("send"); btn.disabled = true; btn.textContent = "Pošiljam ...";
    try {
      const id = doc(collection(db, "dela")).id;
      let slika = "";
      if (draft.blob) {
        const r = ref(storage, `slike/${uid}/${id}.jpg`);
        await uploadBytes(r, draft.blob, { contentType: "image/jpeg" });
        slika = await getDownloadURL(r);
      }
      const push = await enablePush();
      await setDoc(doc(db, "dela", id, "zasebno", "kontakt"), { lastnik: uid, tel: prefs.tel.trim(), push: push || null });
      await setDoc(doc(db, "dela", id), {
        lastnik: uid, stroka: draft.cat, opis: draft.opis.trim().slice(0, 200), regija: prefs.regija, kraj: prefs.kraj.trim().slice(0, 80),
        kdaj: draft.kdaj || KDAJ[0], doma: draft.doma, budget: draft.budget || "Ne vem", slika, status: "odprto", ustvarjeno: serverTimestamp()
      });
      // Učenje: če je stranka stroko izbrala sama, shranimo opis in izbiro (brez osebnih podatkov).
      const predlog = prepoznajStroko(draft.opis);
      if (draft.opis.trim() && predlog !== draft.cat) {
        setDoc(doc(collection(db, "popravki")), { opis: draft.opis.trim().slice(0, 200), predlog, izbrano: draft.cat, ustvarjeno: serverTimestamp() }).catch(() => {});
      }
      draft = { cat: "", photo: null, blob: null, opis: "", kdaj: KDAJ[0], doma: [], budget: "", vprasal: true };
      renderN();
      toast("Poslano mojstrom", "Ko se mojster javi, ga tukaj potrdite ali zavrnete.");
    } catch (x) {
      console.error(x);
      btn.disabled = false; btn.textContent = "Pošlji mojstrom";
      err("Pošiljanje ni uspelo. Preverite internet in poskusite znova.");
    }
  };
}
function osveziStroko() {
  const el = document.getElementById("stroka"); if (!el) return;
  if (draft.cat && !draft.izberi) {
    el.innerHTML = `<div class="najdeno"><span class="ik">${ikona(draft.cat, 26)}</span><div><small>Pomagal vam bo</small><b>${esc(kdo(draft.cat)[0].toUpperCase() + kdo(draft.cat).slice(1))}</b></div><button class="link" type="button" id="drug">Spremeni</button></div>`;
    el.querySelector("#drug").onclick = () => { draft.izberi = true; osveziStroko(); };
  } else if (draft.izberi || (draft.opis.trim().length > 12 && !draft.cat)) {
    el.innerHTML = `<label class="big">Kdo vam lahko pomaga?</label><div class="mreza">${STROKE.map(([k, n]) => `<button type="button" class="chip ikchip" data-k="${k}" aria-pressed="${draft.cat === k}">${ikona(k, 24)}<span>${n}</span></button>`).join("")}</div>`;
    el.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { draft.cat = b.dataset.k; draft.catRocno = true; draft.izberi = false; document.getElementById("err").hidden = true; osveziStroko(); }));
  } else el.innerHTML = "";
}
function osveziKraj() {
  const el = document.getElementById("kraj"); if (!el) return;
  if (!draft.urejamKraj && prefs.kraj) {
    el.innerHTML = `<div class="najdeno"><span class="ik">${ikona("pin", 26)}</span><div><small>Mojster pride v kraj</small><b>${esc(prefs.kraj)}</b></div><button class="link" type="button" id="ured">Spremeni</button></div>`;
    el.querySelector("#ured").onclick = () => { draft.urejamKraj = true; osveziKraj(); document.getElementById("krajIn")?.focus(); };
  } else if (iscem) {
    el.innerHTML = `<div class="najdeno"><span class="ik">${ikona("pin", 26)}</span><div><small>Iščem vašo lokacijo ...</small></div></div>`;
  } else {
    const neznana = prefs.kraj && !regijaIzKraja(prefs.kraj);
    el.innerHTML = `<label for="krajIn" class="big">Kam naj pride mojster?</label>
      <input id="krajIn" maxlength="80" placeholder="Kraj, npr. Maribor" value="${esc(prefs.kraj)}" autocomplete="address-level2">
      ${neznana || (prefs.kraj && !prefs.regija) ? `<select id="regIn" aria-label="Območje">${opt(REGIJE, prefs.regija, "Izberite območje")}</select>` : ""}
      ${native || navigator.geolocation ? `<button class="link lok" type="button" id="lok">${pin} Uporabi mojo lokacijo</button>` : ""}`;
    const inp = el.querySelector("#krajIn");
    inp.oninput = () => { prefs.kraj = inp.value; prefs.krajRocno = true; const r = regijaIzKraja(inp.value); if (r) prefs.regija = r; else prefs.regija = el.querySelector("#regIn")?.value || ""; };
    inp.onchange = () => { if (!regijaIzKraja(inp.value) && !el.querySelector("#regIn")) { osveziKraj(); } };
    el.querySelector("#regIn")?.addEventListener("change", (e) => { prefs.regija = e.target.value; });
    el.querySelector("#lok")?.addEventListener("click", () => { draft.urejamKraj = false; prefs.krajRocno = false; najdiLokacijo(true); osveziKraj(); });
  }
}
function cardN(j) {
  const k = S.kontakti[j.id] || {};
  let st;
  if (j.status === "opravljeno") st = `<div class="status"><span class="dot off"></span>Opravljeno</div>`;
  else if (j.status === "preklicano") st = `<div class="status"><span class="dot off"></span>Preklicano</div>`;
  else if (j.status === "prevzeto") st = `<div class="status"><span class="dot ok"></span>Mojster pride ${esc(opisTermina(j.termin))}</div>
    <div class="mojster">${j.mojsterSlika ? `<img src="${esc(j.mojsterSlika)}" alt="">` : ""}<div><b>${esc(j.mojsterIme || "Mojster")}</b>${j.mojsterFirma ? `<span>${esc(j.mojsterFirma)}</span>` : ""}${j.mojsterDavcna ? `<small>Davčna številka ${esc(j.mojsterDavcna)}</small>` : ""}</div></div>
    ${k.mojsterTel ? `<div class="row"><span class="phone">${esc(k.mojsterTel)}</span><a class="btn small" href="tel:${esc(k.mojsterTel.replace(/\s/g, ""))}">Pokliči</a></div>` : ""}
    <button class="btn ghost" type="button" data-koledar="${j.id}">${ikona("koledar", 22)} Dodaj v koledar in opomnike</button>
    <button class="btn ghost" type="button" data-done="${j.id}">Delo je opravljeno</button>
    <div class="row"><button class="link" type="button" data-zamenjaj="${j.id}">Zamenjaj mojstra</button><button class="link" type="button" data-cancel="${j.id}">Prekliči naročilo</button></div>
    <div class="row"><button class="link muted" type="button" data-prijavim="${j.id}">Prijavi mojstra</button></div>`;
  else {
    const pon = S.ponudbe.filter((p) => p.delo === j.id && p.status === "caka");
    st = (pon.length ? `<div class="status"><span class="dot ok"></span>${pon.length === 1 ? "Javil se je mojster. Potrdite ga ali zavrnite." : `Javilo se je ${mojstrov(pon.length).replace("mojstre", "mojstrov")}. Izberite enega.`}</div>
      ${pon.map((p) => `<div class="ponudba"><div class="mojster">${p.slika ? `<img src="${esc(p.slika)}" alt="">` : ""}<div><b>${esc(p.ime)}</b><span>${esc(p.firma)}</span>${p.davcna ? `<small>Davčna številka ${esc(p.davcna)}</small>` : ""}</div></div>
        <div class="pogoj"><span>Lahko pride</span><b>${esc(opisTermina(p.termin))}</b></div>${p.cena ? `<div class="pogoj"><span>Okvirna cena</span><b>${esc(p.cena)}</b></div>` : ""}
        <div class="row"><button class="btn small" type="button" data-sprejmi="${j.id}" data-m="${esc(p.mojster)}">Sprejmi</button><button class="btn small ghost" type="button" data-zavrni="${j.id}" data-m="${esc(p.mojster)}">Zavrni</button></div></div>`).join("")}`
      : `<div class="status"><span class="dot"></span>${j.obvesceni ? `Obvestili smo ${mojstrov(j.obvesceni)}, čakamo, da se kdo javi ...` : "Čakamo, da se javi mojster ..."}</div>`)
      + `<div class="meta">${[j.kdaj, ...(j.doma || []), j.budget && j.budget !== "Ne vem" ? j.budget : ""].filter(Boolean).map(esc).join(" · ")}</div>
      <div class="row"><button class="link" type="button" data-cancel="${j.id}">Prekliči naročilo</button></div>`;
  }
  const n = { odprto: 1, prevzeto: 2, opravljeno: 3 }[j.status] || 0;
  const aktivno = j.status === "odprto" || j.status === "prevzeto";
  const slike = aktivno ? `${j.prosnja ? `<div class="prosnja">${ikona("kamera", 22)}<div><b>${esc(j.prosnja.ime)} prosi za več slik</b>${j.prosnja.sporocilo ? `<span>»${esc(j.prosnja.sporocilo)}«</span>` : ""}</div></div>` : ""}
    <label class="btn ${j.prosnja ? "" : "ghost"}" for="vec-${j.id}">${ikona("kamera", 22)} Dodaj slike</label><input id="vec-${j.id}" data-vec="${j.id}" type="file" accept="image/*" multiple hidden>` : "";
  const pot = n ? `<ol class="pot">${["Poslano", "Mojster prihaja", "Opravljeno"].map((t, i) => `<li class="${i < n ? "da" : ""}${i === n - 1 ? " zdaj" : ""}"><span>${i < n ? ikona("kljukica", 14, 3) : ""}</span>${t}</li>`).join("")}</ol>` : "";
  return `<div class="job">${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3><div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</div>${pot}${slike}${st}</div></div>`;
}
const tag = (k) => `<span class="tag">${ikona(k, 16, 2.2)}${strokaIme(k)}</span>`;
async function dodajSlike(id, files) {
  const j = S.myJobs.find((x) => x.id === id);
  if (!j || !files.length) return;
  const prej = j.slike || [];
  if (prej.length >= 8) return toast("Dovolj slik", "Dodate lahko največ 8 slik.");
  toast("Nalagam slike ...", "");
  try {
    const nove = [];
    for (const f of files.slice(0, 8 - prej.length)) {
      const { blob } = await shrink(f);
      const r = ref(storage, `slike/${uid}/${id}-${Date.now()}-${nove.length}.jpg`);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      nove.push(await getDownloadURL(r));
    }
    await updateDoc(doc(db, "dela", id), { slike: [...prej, ...nove], prosnja: null });
    toast("Slike so dodane", "Mojstri jih že vidijo.");
  } catch (e) { console.error(e); toast("Ni uspelo", "Preverite internet in poskusite znova."); }
}
async function odgovori(b, sprejmi) {
  const id = b.dataset.sprejmi || b.dataset.zavrni, mojster = b.dataset.m;
  b.disabled = true;
  try {
    await call("odgovori", { id, mojster, sprejmi });
    toast(sprejmi ? "Mojster je potrjen" : "Ponudba je zavrnjena", sprejmi ? "Pred prihodom vas pokliče." : "Naročilo ostane odprto za druge mojstre.");
  } catch (e) { b.disabled = false; toast("Ni uspelo", e.message || "Preverite internet in poskusite znova."); }
}
const mojstrov = (n) => n + (n % 100 === 1 || n % 100 === 2 ? " mojstra" : n % 100 === 3 || n % 100 === 4 ? " mojstre" : " mojstrov");
async function setStatus(id, status) {
  try { await updateDoc(doc(db, "dela", id), { status }); } catch (e) { toast("Ni uspelo", "Preveri internet in poskusi znova."); }
}
function watchPonudbe() {
  unsub.push(onSnapshot(query(collection(db, "ponudbe"), where("lastnik", "==", uid)), (snap) => {
    S.ponudbe = snap.docs.map((d) => d.data());
    if (prefs.role === "N" && !document.activeElement?.matches("input,select,textarea")) renderN();
  }, (e) => console.error("ponudbe", e)));
  unsub.push(onSnapshot(query(collection(db, "ponudbe"), where("mojster", "==", uid)), (snap) => {
    S.moje = Object.fromEntries(snap.docs.map((d) => [d.data().delo, d.data()]));
    if (prefs.role === "M") renderM();
  }, (e) => console.error("moje ponudbe", e)));
}
function watchMine() {
  unsub.push(onSnapshot(query(collection(db, "dela"), where("lastnik", "==", uid), orderBy("ustvarjeno", "desc"), limit(30)), (snap) => {
    S.myJobs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    // kontakt mojstra (telefon) pri prevzetih delih
    S.myJobs.filter((j) => j.status === "prevzeto" && !S.kontakti[j.id]).forEach((j) => {
      getDoc(doc(db, "dela", j.id, "zasebno", "kontakt")).then((d) => { S.kontakti[j.id] = d.data() || {}; if (prefs.role === "N") renderN(); }).catch(() => {});
    });
    if (prefs.role === "N" && !document.activeElement?.matches("input,select,textarea")) renderN();
  }, (e) => console.error("moja dela", e)));
}

/* =================== MOJSTER =================== */
const aktiven = () => S.mojster?.narocninaDo && S.mojster.narocninaDo.toMillis() > Date.now();
function renderM() {
  if (!prefs.uvod) return render();
  if (!db) { view.innerHTML = `<div class="empty">Del za mojstre bo deloval, ko bo Fixko povezan s strežnikom.</div>`; return; }
  if (!S.mojster || S.urejam || !profilPopoln(S.mojster)) return renderProfil();
  if (!aktiven() && testnaFirma(S.mojster.firma) && S.testniVklop !== "napaka") {
    // Testni račun lastnikov: brez plačila.
    view.innerHTML = `<div class="spin">Vklapljam testni račun ...</div>`;
    if (!S.testniVklop) { S.testniVklop = true; call("narocnina", { testni: true }).catch((e) => { console.error(e); S.testniVklop = "napaka"; renderM(); }); }
    return;
  }
  if (!aktiven()) return renderPaywall();
  const skrita = new Set(prefs.skrita || []);
  const prosta = S.feed.filter((j) => j.status === "odprto" && !skrita.has(j.id) && !["zavrnjeno", "odpovedal"].includes(S.moje[j.id]?.status) && (S.mojster.regije || []).some((r) => r === "vsa" || r === j.regija));
  view.innerHTML = `
  <div class="bar"><span>${(S.mojster.stroke || []).map(strokaIme).join(", ")} · ${(S.mojster.regije || []).map(regijaIme).join(", ")}</span><button class="link" id="edit" type="button">Uredi</button></div>
  ${S.taken.filter((j) => j.status === "prevzeto").length ? `<h2>Moja dela</h2><div class="list">${S.taken.filter((j) => j.status === "prevzeto").map(cardTaken).join("")}</div>` : ""}
  <h2>Prosta dela</h2>
  <div class="list">${prosta.length ? prosta.map(cardM).join("") : `<div class="empty">${ikona("orodje", 40, 1.5)}<b>Trenutno ni prostih del</b>Ko nekdo v tvoji regiji rabi tvojo stroko, dobiš obvestilo.</div>`}</div>`;
  document.getElementById("edit").onclick = () => { S.urejam = true; renderM(); };
  view.querySelectorAll("[data-take]").forEach((b) => (b.onclick = () => takeSheet(prosta.find((j) => j.id === b.dataset.take))));
  view.querySelectorAll("[data-koledar]").forEach((b) => (b.onclick = () => vKoledar(S.taken.find((j) => j.id === b.dataset.koledar), "M")));
  view.querySelectorAll("[data-slike]").forEach((b) => (b.onclick = () => prosiSheet(b.dataset.slike)));
  view.querySelectorAll("[data-odpovem]").forEach((b) => (b.onclick = () => potrdiSheet("Odpovem termin?", "Stranka dobi obvestilo, delo pa se znova odpre za druge mojstre. Za to delo se ne moreš več javiti.", "Da, odpovej", () => odpovej(b.dataset.odpovem, false))));
  view.querySelectorAll("[data-prijavi]").forEach((b) => (b.onclick = () => prijaviSheet({ delo: b.dataset.prijavi, kdo: "objava" })));
}
const profilPopoln = (m) => !!(m && m.slika && m.firma && (m.davcna || testnaFirma(m.firma)) && m.pogoji === POGOJI_VERZIJA);
function cardM(j) {
  const nov = !S.seen.has(j.id) && j.ustvarjeno && Date.now() - j.ustvarjeno.toMillis() < 3600e3;
  return `<div class="job">${pic(j)}<div class="body">${tag(j.stroka)}${nov ? '<span class="new">Novo</span>' : ""}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</div>
    <div class="pogoj"><span>Stranka želi</span><b>${esc([j.kdaj, ...(j.doma || [])].filter(Boolean).join(", "))}</b></div>
    ${j.budget ? `<div class="pogoj"><span>Okvirno plačilo</span><b>${esc(j.budget)}</b></div>` : ""}
    ${j.ponudb ? `<div class="meta">Javili so se že ${mojstrov(j.ponudb).replace("mojstre", "mojstrov")}</div>` : ""}
    ${S.moje[j.id]?.status === "caka" ? `<div class="status"><span class="dot"></span>Javil si se za ${esc(opisTermina(S.moje[j.id].termin))}. Čakaš na stranko.</div><button class="btn ghost" type="button" data-take="${j.id}">Spremeni termin ali ceno</button>`
      : `<button class="btn" type="button" data-take="${j.id}" style="margin-top:12px">Javi se za to delo</button>`}
    <div class="row">${j.prosnja ? `<span class="meta">Prošnja za slike je poslana</span>` : `<button class="link" type="button" data-slike="${j.id}">${ikona("kamera", 18)} Prosi za več slik</button>`}<button class="link muted" type="button" data-prijavi="${j.id}">Prijavi ali skrij</button></div></div></div>`;
}
function cardTaken(j) {
  const k = S.kontakti[j.id] || {};
  return `<div class="job">${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)}</div>
    <div class="status"><span class="dot ok"></span>Tvoj termin: ${esc(opisTermina(j.termin))}</div>
    ${k.tel ? `<div class="row"><span class="phone">${esc(k.tel)}</span><a class="btn small" href="tel:${esc(k.tel.replace(/\s/g, ""))}">Pokliči</a></div>` : ""}
    <button class="btn ghost" type="button" data-koledar="${j.id}">${ikona("koledar", 22)} Dodaj v koledar in opomnike</button>
    <div class="row"><button class="link" type="button" data-odpovem="${j.id}">Odpovej termin</button></div></div></div>`;
}
function prosiSheet(id) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="Prosi za več slik"><h2 style="margin-top:0">Prosi za več slik</h2>
    <p class="lead">Stranka dobi obvestilo. Napiši, kaj naj slika (neobvezno).</p>
    <input id="msg" maxlength="140" placeholder="npr. Slikajte še števec in pipo od blizu">
    <div class="err" id="perr" hidden></div>
    <button class="btn" type="button" id="ok">Pošlji prošnjo</button><button class="btn ghost" type="button" id="x">Prekliči</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#ok").onclick = async () => {
    const b = d.querySelector("#ok"); b.disabled = true;
    try { await call("prosiSlike", { id, sporocilo: d.querySelector("#msg").value }); d.remove(); toast("Prošnja je poslana", "Ko stranka doda slike, jih vidiš pri objavi."); }
    catch (e) { b.disabled = false; const t = d.querySelector("#perr"); t.hidden = false; t.textContent = e.message || "Ni uspelo."; }
  };
}
// Potrditev pred nepovratnim dejanjem (odpoved, preklic).
function potrdiSheet(naslov, besedilo, gumb, akcija) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="${esc(naslov)}"><h2 style="margin-top:0">${esc(naslov)}</h2><p class="lead">${esc(besedilo)}</p>
    <button class="btn danger" type="button" id="da">${esc(gumb)}</button><button class="btn ghost" type="button" id="x">Ne</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#da").onclick = () => { d.remove(); akcija(); };
}
async function odpovej(id, celo) {
  try {
    await call("odpovej", { id, celo });
    if (prefs.role === "M") toast("Termin je odpovedan", "Stranka je dobila obvestilo.");
    else toast(celo ? "Naročilo je preklicano" : "Termin je odpovedan", celo ? "" : "Naročilo je znova odprto. Izberite drugega mojstra.");
  } catch (e) { toast("Ni uspelo", e.message || "Preverite internet in poskusite znova."); }
}
// Termin v Apple koledar (z opozorilom uro prej) in v Opomnike.
async function vKoledar(j, vloga) {
  if (!j || !j.termin) return;
  const naslov = vloga === "M" ? `Fixko: ${j.opis || strokaIme(j.stroka)}` : `Fixko: pride ${j.mojsterIme || "mojster"}`;
  const tel = vloga === "M" ? S.kontakti[j.id]?.tel : S.kontakti[j.id]?.mojsterTel;
  const opis = [j.opis || strokaIme(j.stroka), vloga === "N" ? j.mojsterFirma : "", tel ? "Telefon: " + tel : "", j.cena ? "Okvirna cena: " + j.cena : ""].filter(Boolean).join("\n");
  if (!native) return toast("Samo v aplikaciji", "Koledar deluje v aplikaciji na iPhonu.");
  try {
    const r = await FixkoKoledar.dodaj({ naslov, opis, kraj: j.kraj || "", zacetek: j.termin });
    if (r.koledar || r.opomnik) toast("Dodano", [r.koledar ? "v koledar" : "", r.opomnik ? "v opomnike" : ""].filter(Boolean).join(" in ") + ". Opozorilo dobite uro prej.");
    else toast("Ni dovoljenja", "Dovolite dostop v Nastavitve > Fixko > Koledarji in Opomniki.");
  } catch (e) { toast("Ni uspelo", "Termina ni bilo mogoče dodati."); }
}
function renderProfil() {
  // Osnutek obrazca ostane med ponovnimi izrisi (npr. ko pride posodobitev iz baze med tipkanjem).
  if (!S.pd || (!S.pd.dotaknjen && S.pd.izvor !== S.mojster)) {
    const m0 = S.mojster ? { ...S.mojster } : { stroke: [], regije: [] };
    S.pd = { izvor: S.mojster, dotaknjen: false, m: m0, sel: { stroke: new Set(m0.stroke), regije: new Set(m0.regije) }, novaSlika: null, soglasje: m0.pogoji === POGOJI_VERZIJA };
  }
  const { m, sel } = S.pd;
  const draw = () => {
    const novaSlika = S.pd.novaSlika, soglasje = S.pd.soglasje;
    const slika = novaSlika?.url || m.slika;
    view.innerHTML = `
    <h1>${S.mojster ? "Tvoj profil" : "Dela pridejo k tebi"}</h1>
    ${S.mojster ? "" : `<p class="lead">Ko nekdo v tvoji regiji rabi tvojo stroko, dobiš obvestilo s sliko. Prevzameš delo, izbereš termin in stranko pokličeš. Stranka vidi tvojo sliko, ime in podjetje.</p>`}
    <label class="avatar-up" for="pf">${slika ? `<img src="${esc(slika)}" alt="Tvoja slika">` : `<span>${kamera}</span>`}<div><b>${slika ? "Zamenjaj sliko" : "Dodaj svojo sliko"}</b><small>Obraz, da te stranka prepozna</small></div></label>
    <input id="pf" type="file" accept="image/*" hidden>
    <label for="ime">Ime in priimek</label>
    <input id="ime" maxlength="60" placeholder="npr. Marko Kos" value="${esc(m.ime || prefs.ime)}" autocomplete="name">
    <label for="firma">Podjetje</label>
    <input id="firma" maxlength="80" placeholder="npr. Kos inštalacije, Marko Kos s.p." value="${esc(m.firma || "")}" autocomplete="organization">
    <label for="davcna">Davčna številka podjetja</label>
    <input id="davcna" inputmode="numeric" maxlength="12" placeholder="12345678" value="${esc(m.davcna || "")}">
    <label for="mtel">Telefon</label>
    <input id="mtel" type="tel" inputmode="tel" maxlength="20" placeholder="041 123 456" value="${esc(m.tel || "")}">
    <label>Tvoja stroka</label>
    <div class="mreza" id="st">${STROKE.map(([k, n]) => `<button type="button" class="chip ikchip" data-k="${k}" aria-pressed="${sel.stroke.has(k)}">${ikona(k, 24)}<span>${n}</span></button>`).join("")}</div>
    <label>Kje delaš</label>
    <div class="chips" id="rg"><button type="button" class="chip" data-k="vsa" aria-pressed="${sel.regije.has("vsa")}">Vsa Slovenija</button>${REGIJE.map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${sel.regije.has(k)}">${n}</button>`).join("")}</div>
    <label class="check"><input type="checkbox" id="sog"${soglasje ? " checked" : ""}><span>Potrjujem, da dejavnost opravljam kot registriran samostojni podjetnik ali gospodarska družba, da imam potrebna dovoljenja in da sprejemam <a class="link" href="pogoji.html#mojstri">pogoje za mojstre</a>.</span></label>
    <div class="err" id="err" hidden></div>
    <button class="btn" type="button" id="save">${S.mojster ? "Shrani" : "Naprej"}</button>
    ${S.mojster ? `<button class="btn ghost" type="button" id="back">Nazaj</button>` : ""}`;
    const keep = () => {
      for (const [k, el] of [["ime", "ime"], ["firma", "firma"], ["davcna", "davcna"], ["tel", "mtel"]]) m[k] = document.getElementById(el).value;
      S.pd.soglasje = document.getElementById("sog").checked;
      S.pd.dotaknjen = true;
    };
    view.querySelectorAll("#st .chip").forEach((b) => (b.onclick = () => { keep(); const k = b.dataset.k; sel.stroke.has(k) ? sel.stroke.delete(k) : sel.stroke.add(k); draw(); }));
    view.querySelectorAll("#rg .chip").forEach((b) => (b.onclick = () => { keep(); const k = b.dataset.k; sel.regije.has(k) ? sel.regije.delete(k) : sel.regije.add(k); draw(); }));
    document.getElementById("pf").onchange = (e) => {
      const fl = e.target.files[0]; if (!fl) return; keep();
      shrink(fl, 640).then((r) => { S.pd.novaSlika = r; draw(); }).catch(() => toast("Slike ni bilo mogoče odpreti", "Poskusi z drugo sliko."));
    };
    if (S.mojster) document.getElementById("back").onclick = () => { S.urejam = false; S.pd = null; renderM(); };
    document.getElementById("save").onclick = async () => {
      keep();
      const { novaSlika, soglasje } = S.pd;
      const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; el.scrollIntoView({ block: "center", behavior: "smooth" }); };
      if (!novaSlika && !m.slika) return err("Dodaj svojo sliko. Stranke raje odprejo vrata nekomu, ki ga prepoznajo.");
      if (m.ime.trim().split(/\s+/).length < 2) return err("Vpiši ime in priimek.");
      if (m.firma.trim().length < 3) return err("Vpiši ime podjetja, kot je v poslovnem registru.");
      const brezDavcne = testnaFirma(m.firma) && !veljavnaDavcna(m.davcna); // testni mojster
      if (!brezDavcne && !veljavnaDavcna(m.davcna)) return err("Davčna številka ni pravilna. Ima 8 števk, npr. 12345678.");
      if (!veljavenTel(m.tel)) return err("Vpiši telefonsko številko, npr. 041 123 456.");
      if (!sel.stroke.size) return err("Izberi vsaj eno stroko.");
      if (!sel.regije.size) return err("Izberi, kje delaš.");
      if (!soglasje) return err("Za objavo profila potrdi pogoje za mojstre.");
      const btn = document.getElementById("save"); btn.disabled = true; btn.textContent = "Shranjujem ...";
      try {
        let slikaUrl = m.slika;
        if (novaSlika) {
          const r = ref(storage, `profil/${uid}/${Date.now()}.jpg`);
          await uploadBytes(r, novaSlika.blob, { contentType: "image/jpeg" });
          slikaUrl = await getDownloadURL(r);
        }
        const push = await enablePush();
        const data = {
          ime: m.ime.trim().replace(/\s+/g, " ").slice(0, 60), firma: m.firma.trim().replace(/\s+/g, " ").slice(0, 80), davcna: brezDavcne ? "" : cistaDavcna(m.davcna),
          slika: slikaUrl, tel: m.tel.trim(), stroke: [...sel.stroke], regije: [...sel.regije], pogoji: POGOJI_VERZIJA, posodobljeno: serverTimestamp()
        };
        if (push) data.push = push;
        await setDoc(doc(db, "mojstri", uid), data, { merge: true });
        prefs.ime = data.ime; savePrefs();
        S.urejam = false; S.pd = null;
        if (!push) toast("Obvestila so izklopljena", "Vklopi jih v Nastavitvah iPhona, sicer ne izveš za nova dela.");
      } catch (e) { console.error(e); btn.disabled = false; btn.textContent = "Shrani"; err("Shranjevanje ni uspelo. Poskusi znova."); }
    };
  };
  draw();
}
async function payStatus() {
  if (!native) return { product: false };
  try { return await FixkoPay.status(); } catch (e) { return { product: false }; }
}
async function sendJws(s) {
  if (!s?.active || !s.jws) return false;
  try { await call("narocnina", { jws: s.jws }); return true; } catch (e) { console.error(e); return false; }
}
function renderPaywall() {
  const p = S.pay || {};
  const cena = p.price || "9,99 €";
  const trial = p.trialEligible && p.trialDays ? `Prvih ${p.trialDays >= 28 ? "30" : p.trialDays} dni brezplačno` : "Začni";
  view.innerHTML = `
  <h1>Še zadnji korak</h1>
  <p class="lead">Z naročnino vidiš vsa prosta dela v svoji stroki in dobiš obvestilo za vsako novo.</p>
  <div class="plan">
    <div class="price">${esc(cena)} <small>/ mesec</small></div>
    <ul><li>Obvestila o novih delih s sliko</li><li>Termin potrdiš z enim klikom</li><li>Direkten telefon stranke</li><li>Brez provizije in brez plačila na delo</li></ul>
    <div class="err" id="err" hidden></div>
    <button class="btn" id="buy" type="button">${p.product === false ? "Začni preizkus" : esc(trial)}</button>
    <button class="btn ghost" id="restore" type="button">Obnovi nakup</button>
    <p class="note">${p.product === false ? "Naročnina v App Store še ni odprta. Med preizkusom je Fixko za mojstre brezplačen." : "Naročnina se podaljša vsak mesec, dokler je ne prekličeš v nastavitvah Apple ID. Prekličeš kadarkoli."}</p>
  </div>
  <div class="foot"><button class="link" id="edit" type="button">Uredi profil</button></div>`;
  document.getElementById("edit").onclick = () => { S.urejam = true; renderM(); };
  const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; };
  const done = async (s) => {
    S.pay = s;
    if (await sendJws(s)) { toast("Naročnina je aktivna", "Obvestila za nova dela so vklopljena."); return; }
    if (s.result === "cancelled") return;
    if (s.result === "pending") return err("Nakup čaka na potrditev.");
    err("Nakupa nismo mogli potrditi. Poskusi Obnovi nakup.");
  };
  document.getElementById("buy").onclick = async () => {
    if (p.product === false) {
      try { await call("narocnina", { preizkus: true }); toast("Preizkus je vklopljen", "Vidiš prosta dela in dobivaš obvestila."); }
      catch (e) { err(e.code === "functions/failed-precondition" ? "Preizkus ni več na voljo. Naročnina bo kmalu odprta." : "Ni uspelo. Preveri internet in poskusi znova."); }
      return;
    }
    try { await done(await FixkoPay.buy()); } catch (e) { err(e.message || "Nakup ni uspel."); }
  };
  document.getElementById("restore").onclick = async () => {
    try { const s = await FixkoPay.restore(); s.active ? await done(s) : err("Aktivne naročnine nismo našli."); } catch (e) { err("Obnova ni uspela."); }
  };
}
function takeSheet(j) {
  if (!j) return;
  const dni = dnevi();
  let dan = dni.find((d) => prosteUre(d).length) || dni[1];
  let ura = prosteUre(dan)[0];
  let cena = S.moje[j.id]?.cena || "";
  const d = document.createElement("div"); d.className = "sheet";
  const draw = () => {
    d.innerHTML = `<div role="dialog" aria-label="Izberi termin"><h2 style="margin-top:0">Kdaj lahko prideš?</h2><div class="meta">${esc(j.opis || strokaIme(j.stroka))}, ${esc(j.kraj)} · stranka želi: ${esc([j.kdaj, ...(j.doma || [])].filter(Boolean).join(", "))}${j.budget ? " · okvirno " + esc(j.budget) : ""}</div>
      <label>Dan</label><div class="chips">${dni.filter((x) => prosteUre(x).length).map((x) => `<button type="button" class="chip" data-d="${x.iso}" aria-pressed="${x.iso === dan.iso}">${x.ime} <span class="meta">${x.datum}</span></button>`).join("")}</div>
      <label>Ura</label><div class="chips">${prosteUre(dan).map((u) => `<button type="button" class="chip" data-u="${u}" aria-pressed="${u === ura}">${u}</button>`).join("")}</div>
      <label for="cena">Tvoja okvirna cena <span class="neobv">neobvezno</span></label>
      <input id="cena" maxlength="40" placeholder="npr. okoli 80 €" value="${esc(cena)}">
      <div class="err" id="terr" hidden></div>
      <button class="btn" type="button" id="ok">Pošlji stranki</button>
      <p class="note">Stranka vidi tvoj profil, termin in ceno. Ko te sprejme, dobiš njen telefon.</p><button class="btn ghost" type="button" id="x">Prekliči</button></div>`;
    d.querySelector("#cena").oninput = (e) => { cena = e.target.value; };
    d.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { dan = dni.find((x) => x.iso === b.dataset.d); ura = prosteUre(dan)[0]; draw(); }));
    d.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => { ura = b.dataset.u; draw(); }));
    d.querySelector("#x").onclick = () => d.remove();
    d.querySelector("#ok").onclick = async () => {
      const [h, m] = ura.split(":").map(Number);
      const termin = new Date(dan.d.getFullYear(), dan.d.getMonth(), dan.d.getDate(), h, m).getTime();
      const b = d.querySelector("#ok"); b.disabled = true; b.textContent = "Pošiljam ...";
      try {
        await call("ponudi", { id: j.id, termin, cena: cena.trim() });
        d.remove();
        toast("Poslano stranki", `Javil si se za ${opisTermina(termin)}. Ko te stranka sprejme, dobiš obvestilo in njen telefon.`);
        renderM();
      } catch (e) {
        b.disabled = false; b.textContent = "Pošlji stranki";
        const t = d.querySelector("#terr"); t.hidden = false;
        t.textContent = e.code === "functions/already-exists" ? "Stranka je medtem že izbrala mojstra." : e.code === "functions/permission-denied" ? "Naročnina ni aktivna." : e.code === "functions/failed-precondition" ? e.message : "Ni uspelo. Preveri internet in poskusi znova.";
      }
    };
  };
  draw(); d.onclick = (e) => { if (e.target === d) d.remove(); }; document.body.appendChild(d);
}
let feedUnsub = null, feedKey = "";
function watchMojster() {
  unsub.push(onSnapshot(doc(db, "mojstri", uid), (d) => {
    S.mojster = d.exists() ? d.data() : null;
    const key = aktiven() ? (S.mojster.stroke || []).slice(0, 30).join(",") : "";
    if (key !== feedKey) {
      feedKey = key; feedUnsub?.(); feedUnsub = null; S.feed = [];
      if (key) {
        feedUnsub = onSnapshot(query(collection(db, "dela"), where("stroka", "in", key.split(",")), where("status", "==", "odprto"), orderBy("ustvarjeno", "desc"), limit(60)), (snap) => {
          S.feed = snap.docs.map((x) => ({ id: x.id, ...x.data() }));
          if (S.firstFeed) { S.feed.forEach((j) => S.seen.add(j.id)); S.firstFeed = false; }
          if (prefs.role === "M") renderM();
          setTimeout(() => S.feed.forEach((j) => S.seen.add(j.id)), 15000);
        }, (e) => console.error("prosta dela", e));
      }
    }
    if (prefs.role === "M" && !document.activeElement?.matches("input,select,textarea")) renderM();
  }, (e) => console.error("mojster", e)));
  unsub.push(onSnapshot(query(collection(db, "dela"), where("mojster", "==", uid), orderBy("ustvarjeno", "desc"), limit(30)), (snap) => {
    S.taken = snap.docs.map((x) => ({ id: x.id, ...x.data() }));
    S.taken.filter((j) => j.status === "prevzeto" && !S.kontakti[j.id]).forEach((j) => {
      getDoc(doc(db, "dela", j.id, "zasebno", "kontakt")).then((x) => { S.kontakti[j.id] = x.data() || {}; if (prefs.role === "M") renderM(); }).catch(() => {});
    });
    if (prefs.role === "M") renderM();
  }, (e) => console.error("prevzeta dela", e)));
}

/* ---------- prijava neprimerne vsebine ---------- */
// Apple zahteva, da lahko uporabnik prijavi neprimerno vsebino in jo skrije. Prijave pregledamo v 24 urah.
const RAZLOGI = ["Lažna ali zavajajoča objava", "Žaljiva ali neprimerna vsebina", "Neprimerna slika", "Nadlegovanje ali goljufija", "Drugo"];
function prijaviSheet({ delo, kdo }) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="Prijava"><h2 style="margin-top:0">${kdo === "mojster" ? "Prijavi mojstra" : "Prijavi objavo"}</h2>
    <p class="lead">Zakaj? Prijavo pregledamo v 24 urah.${kdo === "objava" ? " Objava se ti takoj skrije." : ""}</p>
    <div class="mreza" style="grid-template-columns:1fr">${RAZLOGI.map((r) => `<button type="button" class="chip" data-r="${esc(r)}">${esc(r)}</button>`).join("")}</div>
    <button class="btn ghost" type="button" id="x">Prekliči</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelectorAll("[data-r]").forEach((b) => (b.onclick = async () => {
    d.remove();
    if (kdo === "objava") { prefs.skrita = [...new Set([...(prefs.skrita || []), delo])].slice(-200); savePrefs(); }
    try { await setDoc(doc(collection(db, "prijave")), { delo, kdo, razlog: b.dataset.r, prijavil: uid, ustvarjeno: serverTimestamp() }); } catch (e) { console.error(e); }
    toast("Hvala za prijavo", "Pregledali jo bomo v 24 urah.");
    render();
  }));
}

/* ---------- nastavitve ---------- */
function settingsSheet() {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="Nastavitve"><h2 style="margin-top:0">Nastavitve</h2>
    ${S.mojster ? `<button class="btn ghost" type="button" id="prof">Uredi profil mojstra</button>` : ""}
    ${S.mojster && native ? `<button class="btn ghost" type="button" id="man">Upravljaj naročnino</button>` : ""}
    <button class="btn ghost" type="button" id="obv">Vklopi obvestila</button>
    <a class="btn ghost" href="zasebnost.html">Zasebnost in pogoji</a>
    <button class="btn danger" type="button" id="del">Izbriši moje podatke</button>
    <div id="potrdi" hidden><p>Izbrišemo tvoj profil, tvoja dela in slike. Naročnino v App Store prekličeš posebej. Tega ni mogoče razveljaviti.</p><button class="btn danger" type="button" id="del2">Da, izbriši vse</button></div>
    <button class="btn" type="button" id="x">Zapri</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#prof")?.addEventListener("click", () => { d.remove(); S.urejam = true; setRole("M"); });
  d.querySelector("#man")?.addEventListener("click", () => FixkoPay.manage().catch(() => {}));
  d.querySelector("#obv").onclick = async () => {
    const t = await enablePush();
    if (!t) return toast("Obvestila so izklopljena", "Vklopi jih v Nastavitve > Fixko > Obvestila.");
    if (S.mojster) await setDoc(doc(db, "mojstri", uid), { push: t }, { merge: true }).catch(() => {});
    toast("Obvestila so vklopljena", "");
  };
  d.querySelector("#del").onclick = () => { d.querySelector("#potrdi").hidden = false; d.querySelector("#del").hidden = true; };
  d.querySelector("#del2").onclick = async () => {
    try { await call("izbrisi", {}); } catch (e) { return toast("Brisanje ni uspelo", "Poskusi znova."); }
    try { await Preferences.remove({ key: "fixko" }); } catch (e) {}
    location.reload();
  };
}

/* ---------- pomočniki ---------- */
let tt;
function toast(t, m) {
  document.querySelectorAll(".toast").forEach((x) => x.remove());
  const el = document.createElement("div"); el.className = "toast"; el.setAttribute("role", "status");
  el.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7"/><path d="M10 20a2 2 0 0 0 4 0"/></svg><div><b>${esc(t)}</b>${esc(m)}</div>`;
  el.onclick = () => el.remove(); document.body.appendChild(el); clearTimeout(tt); tt = setTimeout(() => el.remove(), 4500);
}
function shrink(file, max = 1280) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, max / Math.max(im.width, im.height));
      const c = document.createElement("canvas"); c.width = Math.round(im.width * s); c.height = Math.round(im.height * s);
      c.getContext("2d").drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
      c.toBlob((blob) => blob ? resolve({ blob, url: c.toDataURL("image/jpeg", 0.6) }) : reject(new Error("slika")), "image/jpeg", 0.8);
    };
    im.onerror = reject; im.src = url;
  });
}

/* ---------- zagon ---------- */
(async function start() {
  await loadPrefs();
  // Lokacija ob vsaki uporabi (če je dovoljena in kraja niste vpisali sami).
  if (!prefs.krajRocno) najdiLokacijo(false);
  if (!cfg) { render(); return; }
  try { await initFb(); } catch (e) {
    console.error(e); view.innerHTML = `<div class="empty">Ni povezave. Preverite internet in odprite Fixko znova.</div>`; return;
  }
  render();
  watchMine();
  watchMojster();
  watchPonudbe();
  // Naročnina: ob vsakem zagonu potrdimo strežniku, da velja (podaljšanja, obnovitve).
  S.pay = await payStatus();
  if (S.pay.active) await sendJws(S.pay);
  if (native) FixkoPay.addListener("change", async (s) => { S.pay = s; await sendJws(s); if (prefs.role === "M") renderM(); });
  if (prefs.role === "M") renderM();
  // Mojster: osveži žeton za obvestila (iOS ga lahko zamenja).
  if (S.mojster) enablePush().then((t) => { if (t && t !== S.mojster?.push) setDoc(doc(db, "mojstri", uid), { push: t }, { merge: true }).catch(() => {}); });
})();
