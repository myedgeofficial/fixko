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
import { STROKE, REGIJE, KDAJ, BUDGET, strokaIme, regijaIme, dnevi, prosteUre, opisTermina, pred, veljavenTel, veljavnaDavcna, cistaDavcna, testnaFirma, POGOJI_VERZIJA, BREZPLACNO, sklicIz, jePreverjen } from "./data.js";
import QRCode from "qrcode";
import { prepoznajStroko, krajIzLokacije, regijaIzKraja } from "./pomoc.js";
import { ikona } from "./ikone.js";

const FixkoPay = registerPlugin("FixkoPay");
const FixkoKoledar = registerPlugin("FixkoKoledar");
const native = Capacitor.isNativePlatform();
const ios = Capacitor.getPlatform() === "ios";
const android = Capacitor.getPlatform() === "android";
// Android: tipka Nazaj najprej zapre odprto okno, nato gre nazaj po straneh (kliče MainActivity).
window.fixkoNazaj = () => {
  const sheets = document.querySelectorAll(".sheet");
  if (sheets.length) { sheets[sheets.length - 1].remove(); return true; }
  if (!/index\.html$|\/$/.test(location.pathname)) { history.back(); return true; }
  return false;
};
const view = document.getElementById("view");
// Vsako okno dobi zgoraj gumb ✕, da ni treba drsati do gumba na dnu.
new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
  if (!n.classList?.contains("sheet")) return;
  const dodaj = () => { const d = n.firstElementChild; if (d && !d.querySelector(":scope > .zapri")) { const x = document.createElement("button"); x.type = "button"; x.className = "zapri"; x.setAttribute("aria-label", "Zapri"); x.textContent = "✕"; x.onclick = () => n.remove(); d.prepend(x); } };
  dodaj(); new MutationObserver(dodaj).observe(n, { childList: true });
}))).observe(document.body, { childList: true });
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
  // Android brez Firebase nastavitev (google-services.json) bi se ob prijavi za obvestila zrušil.
  if (android && !window.FIXKO_PUSH) return null;
  try {
    let p = await PushNotifications.checkPermissions();
    if (p.receive === "prompt" || p.receive === "prompt-with-rationale") p = await PushNotifications.requestPermissions();
    if (p.receive !== "granted") return null;
    if (pushToken) return pushToken;
    if (android) await PushNotifications.createChannel({ id: "fixko", name: "Nova dela in termini", importance: 5, visibility: 1, vibration: true }).catch(() => {});
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
function setRole(r) { document.getElementById("det")?.remove(); prefs.role = r; prefs.uvod = true; savePrefs(); render(); window.scrollTo(0, 0); }
const OGLASI = false;
function render() {
  const uvod = !prefs.uvod;
  document.querySelector(".switch").hidden = uvod;
  if (uvod) { document.getElementById("oglas").hidden = true; document.body.classList.remove("z-oglasom"); if (!view.querySelector(".izbira")) renderUvod(); return; }
  document.getElementById("tabN").setAttribute("aria-pressed", prefs.role === "N");
  document.getElementById("tabM").setAttribute("aria-pressed", prefs.role === "M");
  // Oglasna pasica: prazen prostor bi Apple zavrnil, zato je skrita, dokler ni pravega oglasa (AdMob).
  document.getElementById("oglas").hidden = !OGLASI;
  document.body.classList.toggle("z-oglasom", OGLASI);
  prefs.role === "N" ? renderN() : renderM();
}

const icon = (s = 48) => `<svg width="${s}" height="${s}" viewBox="0 0 28 28" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l2-3h8l2 3h4v13H4z"/><circle cx="14" cy="15" r="4"/></svg>`;
// Slike dela: ena velika, več jih je v vrtiljaku (podrsaš levo, kot na Instagramu).
const pic = (j) => {
  const s = [j.slika, ...(j.slike || [])].filter(Boolean);
  if (!s.length) return `<div class="pic brez">${ikona(j.stroka, 44, 1.6)}<p>${esc(j.opis || strokaIme(j.stroka))}</p></div>`;
  return `<div class="pw-in"><div class="pic${s.length > 1 ? " vrti" : ""}">${s.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</div>${s.length > 1 ? `<span class="stevec">1/${s.length}</span>` : ""}</div>`;
};
const opt = (list, sel, prazno) => (prazno ? `<option value="">${prazno}</option>` : "") + list.map(([k, n]) => `<option value="${k}"${k === sel ? " selected" : ""}>${n}</option>`).join("");

/* =================== UVOD =================== */
// Prvi zagon: kaj je Popravko in kdo ste, z dvema velikima gumboma.
const KORAKI = {
  N: [["kamera", "Fotografirajte ali opišite", "Kaj je narobe. Popravko sam ugotovi, kateri mojster je pravi."], ["telefon", "Mojster vas pokliče", "Dogovorite se za ceno in termin."], ["dom", "Mojster pride", "V aplikaciji vidite njegovo ime, sliko in podjetje."]],
  M: [["mojster", "Uredi profil", "Slika, podjetje, stroka in kje delaš."], ["kamera", "Dobiš obvestilo", "Ko nekdo v tvoji bližini rabi tvojo stroko."], ["telefon", "Prevzemi in pokliči", "Izbereš termin, stranka te pričakuje."]]
};
const koraki = (r) => `<ol class="koraki">${KORAKI[r].map(([ik, t, m], i) => `<li><span class="kn">${ikona(ik, 26)}<i>${i + 1}</i></span><div><b>${t}</b><small>${m}</small></div></li>`).join("")}</ol>`;
function renderUvod() {
  view.innerHTML = `
  <div class="uvod">
    <img src="logo.png" width="88" height="88" alt="">
    <h1>Mojster na vašem domu</h1>
    <p class="lead">Pipa pušča, luč ne gori, vrata škripajo? Popravko poišče mojstra v vaši bližini.</p>
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
    ${r === "N" ? `<p class="lead">Ne veste, kateri mojster? Samo opišite težavo, Popravko izbere sam. Ne veste, kako napisati? Tapnite mikrofon na tipkovnici in povejte.</p>` : `<p class="lead">Stranka vidi tvojo sliko, ime, podjetje in davčno številko, zato ti lažje zaupa.</p>`}
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
const kdo = (k) => ({ vodovod: "vodovodar", elektrika: "električar", keramika: "keramičar", pleskanje: "pleskar", mizarstvo: "mizar", montaza: "monter pohištva", ogrevanje: "serviser ogrevanja in klime", streha: "krovec", vrt: "vrtnar", ciscenje: "čistilni servis", selitve: "selitveni servis", drugo: "hišnik", tla: "polagalec talnih oblog", zidar: "zidar", okna: "monter oken in vrat", aparati: "serviser aparatov" }[k] || strokaIme(k));

let iscem = false;
async function najdiLokacijo(vprasaj) {
  if (iscem) return; iscem = true;
  try {
    let p = await Geolocation.checkPermissions();
    if (p.location !== "granted" && vprasaj) p = await Geolocation.requestPermissions();
    if (p.location !== "granted") throw new Error("ni dovoljenja");
    // Najprej hitra lokacija (omrežje); če je ni, še GPS (nekateri Android telefoni brez omrežne lokacije).
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 })
      .catch(() => Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 600000 }));
    const k = krajIzLokacije(pos.coords.latitude, pos.coords.longitude);
    if (k && !prefs.krajRocno) { prefs.kraj = k.kraj; prefs.regija = k.regija; savePrefs(); }
    else if (!k && vprasaj) draft.urejamKraj = true;
  } catch (e) { if (vprasaj) draft.urejamKraj = true; }
  iscem = false;
  if (prefs.role === "N") osveziKraj();
}

// Stranka: seznam naročil (kratke kartice) ali novo naročilo korak za korakom, en zaslon naenkrat.
const KORAKOV = 5;
function renderN() {
  if (!prefs.uvod) return render(); // posodobitve iz baze ne smejo preskočiti uvodnega zaslona
  const aktivna = S.myJobs.filter((j) => j.status === "odprto" || j.status === "prevzeto");
  const stara = S.myJobs.filter((j) => !aktivna.includes(j));
  const k = draft.korak || (aktivna.length ? 0 : 1);
  const prejsnja = stara.length ? `<details class="stara"><summary>Prejšnja naročila (${stara.length})</summary><div class="list">${stara.map(cardN).join("")}</div></details>` : "";
  if (!k) {
    view.innerHTML = `<h1>Vaša naročila</h1><div class="list">${aktivna.map(cardN).join("")}</div>
      <button class="btn big" type="button" id="novo">+ Novo naročilo</button>${prejsnja}`;
    document.getElementById("novo").onclick = () => { draft.korak = 1; renderN(); window.scrollTo(0, 0); };
    vezi(view); osveziDet();
    return;
  }
  const nazaj = k > 1 || aktivna.length;
  const vrh = `<div class="wiz">${nazaj ? `<button class="link" type="button" id="nazaj">‹ Nazaj</button>` : "<span></span>"}<div class="pike" aria-label="Korak ${k} od ${KORAKOV}">${Array.from({ length: KORAKOV }, (_, i) => `<i class="${i < k ? "da" : ""}"></i>`).join("")}</div></div>`;
  const naprej = (t = "Naprej") => `<div class="err" id="err" hidden></div><button class="btn big" type="button" id="naprej">${t}</button>`;
  const chipi = (id, list, sel) => `<div class="mreza ena" id="${id}">${list.map((v) => `<button type="button" class="chip velik" data-v="${v}" aria-pressed="${sel === v}">${v}</button>`).join("")}</div>`;
  let html;
  if (k === 1) html = `<h1>Kaj je treba popraviti?</h1>
    <label class="shot${draft.photo ? " ima" : ""}" for="file">${draft.photo ? `<img src="${draft.photo}" alt="Vaša slika"><span class="zamenjaj">Zamenjaj sliko</span>` : `${ikona("kamera", 46, 1.6)}<b>Fotografirajte</b><small>ali izberite sliko iz telefona</small>`}</label>
    <input id="file" type="file" accept="image/*" hidden>
    <label for="opis" class="big">Na kratko opišite</label>
    <textarea id="opis" rows="2" maxlength="200" placeholder="npr. Pušča pipa v kuhinji">${esc(draft.opis)}</textarea>
    <p class="hint">Lahko tudi poveste: tapnite mikrofon na tipkovnici.</p>${naprej()}${aktivna.length ? "" : prejsnja}`;
  else if (k === 2) { if (!draft.cat) draft.izberi = true; html = `<h1>Kdo in kam?</h1><div id="stroka"></div><div id="kraj"></div>${naprej()}`; }
  else if (k === 3) html = `<h1>Kdaj naj pride mojster?</h1>${chipi("kdaj", KDAJ, draft.kdaj)}`;
  else if (k === 4) html = `<h1>Koliko približno želite plačati?</h1><p class="lead">Samo okvirno, da se mojster lažje odloči. Točno ceno se dogovorite z njim.</p>${chipi("budget", BUDGET, draft.budget)}`;
  else html = `<h1>Kam naj vas mojster pokliče?</h1>
    <input id="tel" type="tel" inputmode="tel" maxlength="20" placeholder="041 123 456" value="${esc(prefs.tel)}" autocomplete="tel" aria-label="Vaša telefonska številka">
    <div class="povzetek">${draft.photo ? `<img src="${draft.photo}" alt="">` : `<span>${ikona(draft.cat, 30)}</span>`}<div><b>${esc(draft.opis || strokaIme(draft.cat))}</b><small>${esc([kdo(draft.cat), prefs.kraj, draft.kdaj, draft.budget && draft.budget !== "Ne vem" ? draft.budget : ""].filter(Boolean).join(" · "))}</small></div></div>
    ${naprej("Pošlji mojstrom")}
    <p class="note">Za vas je Popravko brezplačen. S pošiljanjem sprejemate <a class="link" href="pogoji.html">pogoje uporabe</a> in <a class="link" href="zasebnost.html">politiko zasebnosti</a>.</p>`;
  view.innerHTML = vrh + html;
  const pojdi = (n) => { draft.korak = n; renderN(); window.scrollTo(0, 0); };
  const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; el.scrollIntoView({ block: "center", behavior: "smooth" }); };
  document.getElementById("nazaj")?.addEventListener("click", () => pojdi(k - 1));
  view.querySelectorAll("#kdaj .chip,#budget .chip").forEach((b) => (b.onclick = () => {
    draft[b.parentElement.id] = b.dataset.v;
    view.querySelectorAll(`#${b.parentElement.id} .chip`).forEach((x) => x.setAttribute("aria-pressed", x === b));
    setTimeout(() => pojdi(k + 1), 180);
  }));
  if (k === 1) {
    const opis = document.getElementById("opis");
    opis.oninput = () => { draft.opis = opis.value; if (!draft.catRocno) draft.cat = prepoznajStroko(draft.opis); };
    document.getElementById("file").onchange = (e) => {
      const fl = e.target.files[0]; if (!fl) return;
      shrink(fl).then(({ url, blob }) => { draft.photo = url; draft.blob = blob; renderN(); }).catch(() => toast("Slike ni bilo mogoče odpreti", "Poskusite z drugo sliko."));
    };
    document.getElementById("naprej").onclick = () => {
      if (!draft.blob && draft.opis.trim().length < 3) return err("Fotografirajte ali na kratko opišite, kaj je treba narediti.");
      pojdi(2);
    };
    vezi(view);
    if (!prefs.kraj && !draft.urejamKraj && !draft.vprasal) { draft.vprasal = true; najdiLokacijo(true); }
  }
  if (k === 2) {
    osveziStroko(); osveziKraj();
    document.getElementById("naprej").onclick = () => {
      const ki = document.getElementById("krajIn"); if (ki) prefs.kraj = ki.value;
      if (!prefs.regija) prefs.regija = regijaIzKraja(prefs.kraj);
      savePrefs();
      if (!draft.cat) { draft.izberi = true; osveziStroko(); return err("Izberite, kdo vam lahko pomaga."); }
      if (!prefs.kraj.trim()) { draft.urejamKraj = true; osveziKraj(); return err("Vpišite kraj, kamor naj pride mojster."); }
      if (!prefs.regija) { draft.urejamKraj = true; osveziKraj(); return err("Izberite območje."); }
      pojdi(3);
    };
  }
  if (k === 5) {
    const tel = document.getElementById("tel");
    tel.oninput = () => { prefs.tel = tel.value; };
    document.getElementById("naprej").onclick = () => poslji(err);
  }
  osveziDet();
}
async function poslji(err) {
  savePrefs();
  if (!veljavenTel(prefs.tel)) return err("Vpišite telefonsko številko, npr. 041 123 456.");
  if (!db) return err("Popravko še ni povezan s strežnikom. Poskusite malo kasneje.");
  const btn = document.getElementById("naprej"); btn.disabled = true; btn.textContent = "Pošiljam ...";
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
      kdaj: draft.kdaj || KDAJ[0], doma: [], budget: draft.budget || "Ne vem", slika, status: "odprto", ustvarjeno: serverTimestamp()
    });
    // Učenje: če je stranka stroko izbrala sama, shranimo opis in izbiro (brez osebnih podatkov).
    const predlog = prepoznajStroko(draft.opis);
    if (draft.opis.trim() && predlog !== draft.cat) {
      setDoc(doc(collection(db, "popravki")), { opis: draft.opis.trim().slice(0, 200), predlog, izbrano: draft.cat, ustvarjeno: serverTimestamp() }).catch(() => {});
    }
    draft = { cat: "", photo: null, blob: null, opis: "", kdaj: KDAJ[0], doma: [], budget: "", vprasal: true, korak: 0 };
    renderN(); window.scrollTo(0, 0);
    toast("Poslano mojstrom", "Ko se mojster javi, ga tukaj potrdite ali zavrnete.");
  } catch (x) {
    console.error(x);
    btn.disabled = false; btn.textContent = "Pošlji mojstrom";
    err("Pošiljanje ni uspelo. Preverite internet in poskusite znova.");
  }
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
// Kratka kartica naročila; vse podrobnosti (ponudbe, mojster, dejanja) so v oknu ob tapu.
function cardN(j) {
  const pon = S.ponudbe.filter((p) => p.delo === j.id && p.status === "caka").length;
  const st = j.status === "opravljeno" ? "Opravljeno" : j.status === "preklicano" ? "Preklicano"
    : j.status === "prevzeto" ? `Mojster pride ${opisTermina(j.termin)}`
    : j.prosnja ? "Mojster prosi za več slik"
    : pon ? (pon === 1 ? "Javil se je mojster" : `Javilo se je ${mojstrov(pon).replace("mojstre", "mojstrov")}`)
    : "Čakamo, da se javi mojster";
  const pika = j.status === "prevzeto" || pon ? "ok" : j.status === "odprto" ? "" : "off";
  return `<button type="button" class="nar" data-odpri="N:${j.id}"><span class="th">${j.slika ? `<img src="${esc(j.slika)}" alt="" loading="lazy">` : ikona(j.stroka, 30)}</span>
    <div><b>${esc(j.opis || strokaIme(j.stroka))}</b><small><span class="dot ${pika}"></span>${esc(st)}</small></div>
    ${pon && j.status === "odprto" ? `<span class="znacka">${pon}</span>` : j.prosnja && j.status !== "opravljeno" ? `<span class="znacka">!</span>` : ""}<span class="pusc">›</span></button>`;
}
// Podrobnosti naročila (v oknu).
const preverjenoZnak = `<em class="prev">${ikona("kljukica", 14, 3)} Podjetje preverjeno</em>`;
function detN(j) {
  const k = S.kontakti[j.id] || {};
  let st;
  if (j.status === "opravljeno") st = `<div class="status"><span class="dot off"></span>Opravljeno</div>`;
  else if (j.status === "preklicano") st = `<div class="status"><span class="dot off"></span>Preklicano</div>`;
  else if (j.status === "prevzeto") st = `<div class="status"><span class="dot ok"></span>Mojster pride ${esc(opisTermina(j.termin))}</div>
    <div class="mojster">${j.mojsterSlika ? `<img src="${esc(j.mojsterSlika)}" alt="">` : ""}<div><b>${esc(j.mojsterIme || "Mojster")}</b>${j.mojsterFirma ? `<span>${esc(j.mojsterFirma)}</span>` : ""}${j.mojsterDavcna ? `<small>Davčna številka ${esc(j.mojsterDavcna)}</small>` : ""}${j.mojsterPreverjen ? preverjenoZnak : ""}</div></div>
    ${k.mojsterTel ? `<div class="row"><span class="phone">${esc(k.mojsterTel)}</span><a class="btn small" href="tel:${esc(k.mojsterTel.replace(/\s/g, ""))}">Pokliči</a></div>` : ""}
    <button class="btn ghost" type="button" data-koledar="${j.id}">${ikona("koledar", 22)} Dodaj v koledar in opomnike</button>
    <button class="btn ghost" type="button" data-done="${j.id}">Delo je opravljeno</button>
    <div class="row"><button class="link" type="button" data-zamenjaj="${j.id}">Zamenjaj mojstra</button><button class="link" type="button" data-cancel="${j.id}">Prekliči naročilo</button></div>
    <div class="row"><button class="link muted" type="button" data-prijavim="${j.id}">Prijavi mojstra</button></div>`;
  else {
    const pon = S.ponudbe.filter((p) => p.delo === j.id && p.status === "caka");
    st = (pon.length ? `<div class="status"><span class="dot ok"></span>${pon.length === 1 ? "Javil se je mojster. Potrdite ga ali zavrnite." : `Javilo se je ${mojstrov(pon.length).replace("mojstre", "mojstrov")}. Izberite enega.`}</div>
      ${pon.map((p) => `<div class="ponudba"><div class="mojster">${p.slika ? `<img src="${esc(p.slika)}" alt="">` : ""}<div><b>${esc(p.ime)}</b><span>${esc(p.firma)}</span>${p.davcna ? `<small>Davčna številka ${esc(p.davcna)}</small>` : ""}${p.preverjen ? preverjenoZnak : ""}</div></div>
        <div class="pogoj"><span>Lahko pride</span><b>${esc(opisTermina(p.termin))}</b></div>${p.cena ? `<div class="pogoj"><span>Okvirna cena</span><b>${esc(p.cena)}</b></div>` : ""}
        <div class="row"><button class="btn small" type="button" data-sprejmi="${j.id}" data-m="${esc(p.mojster)}">Sprejmi</button><button class="btn small ghost" type="button" data-zavrni="${j.id}" data-m="${esc(p.mojster)}">Zavrni</button></div></div>`).join("")}`
      : `<div class="status"><span class="dot"></span>${j.obvesceni ? `Obvestili smo ${mojstrov(j.obvesceni)}, čakamo, da se kdo javi ...` : "Čakamo, da se javi mojster ..."}</div>`)
      + `<div class="row"><button class="link" type="button" data-cancel="${j.id}">Prekliči naročilo</button></div>`;
  }
  const n = { odprto: 1, prevzeto: 2, opravljeno: 3 }[j.status] || 0;
  const aktivno = j.status === "odprto" || j.status === "prevzeto";
  const slike = aktivno ? `${j.prosnja ? `<div class="prosnja">${ikona("kamera", 22)}<div><b>${esc(j.prosnja.ime)} prosi za več slik</b>${j.prosnja.sporocilo ? `<span>»${esc(j.prosnja.sporocilo)}«</span>` : ""}</div></div>` : ""}
    <label class="btn ${j.prosnja ? "" : "ghost"}" for="vec-${j.id}">${ikona("kamera", 22)} Dodaj slike</label><input id="vec-${j.id}" data-vec="${j.id}" type="file" accept="image/*" multiple hidden>` : "";
  const pot = n ? `<ol class="pot">${["Poslano", "Mojster prihaja", "Opravljeno"].map((t, i) => `<li class="${i < n ? "da" : ""}${i === n - 1 ? " zdaj" : ""}"><span>${i < n ? ikona("kljukica", 14, 3) : ""}</span>${t}</li>`).join("")}</ol>` : "";
  return `${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3><div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</div>${pot}${st}${slike}</div>`;
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
  if (!db) { view.innerHTML = `<div class="empty">Del za mojstre bo deloval, ko bo Popravko povezan s strežnikom.</div>`; return; }
  if (!S.mojster || S.urejam || !profilPopoln(S.mojster)) return renderProfil();
  if (!aktiven() && (BREZPLACNO || testnaFirma(S.mojster.firma)) && S.testniVklop !== "napaka") {
    // Brezplačen dostop (zaenkrat za vse) ali testni račun lastnikov.
    view.innerHTML = `<div class="spin">Pripravljam prosta dela ...</div>`;
    // Profil se morda še shranjuje na strežnik, zato nekajkrat poskusimo znova.
    const poskus = (n) => call("narocnina", BREZPLACNO ? { brezplacno: true } : { testni: true }).catch((e) => {
      if (n < 5) return setTimeout(() => poskus(n + 1), 1500);
      console.error(e); S.testniVklop = "napaka"; renderM();
    });
    if (!S.testniVklop) { S.testniVklop = true; poskus(1); }
    return;
  }
  if (!aktiven()) return renderPaywall();
  const prosta = prostaDela();
  const moja = S.taken.filter((j) => j.status === "prevzeto");
  // Kot Instagram: zgoraj krogci z mojimi termini, spodaj objave prostih del.
  view.innerHTML = `
  ${profilKartica(S.mojster, moja.length)}
  ${moja.length ? `<h2 class="mali">Moji termini</h2><div class="zgodbe" aria-label="Moji termini">${moja.map((j) => `<button type="button" class="zgodba" data-odpri="T:${j.id}"><span class="kr">${j.slika ? `<img src="${esc(j.slika)}" alt="">` : ikona(j.stroka, 30)}</span><small>${esc(opisTermina(j.termin))}</small></button>`).join("")}</div>` : ""}
  <h2 class="mali">Prosta dela</h2>
  <div class="feed">${prosta.length ? prosta.map(postM).join("") : `<div class="empty">${ikona("orodje", 40, 1.5)}<b>Trenutno ni prostih del</b>Ko nekdo v tvoji regiji rabi tvojo stroko, dobiš obvestilo.</div>`}</div>`;
  document.getElementById("edit").onclick = () => { S.urejam = true; renderM(); };
  document.getElementById("potrdiPodj")?.addEventListener("click", preveriSheet);
  vezi(view); osveziDet();
}
// Moj profil na vrhu strani mojstra: slika, ime, podjetje, stroke in kje dela.
function profilKartica(m, terminov) {
  const reg = (m.regije || []).includes("vsa") ? "Vsa Slovenija" : (m.regije || []).map(regijaIme).join(", ");
  return `<section class="profil">
    <div class="pv">${m.slika ? `<img src="${esc(m.slika)}" alt="">` : `<span>${ikona("mojster", 34)}</span>`}
      <div><b>${esc(m.ime || "Mojster")}</b><span>${esc(m.firma || "")}</span>${m.davcna ? `<small>Davčna ${esc(m.davcna)}</small>` : ""}</div>
      <button class="uredi" id="edit" type="button">Uredi</button></div>
    <div class="ps">${(m.stroke || []).map((k) => `<span>${ikona(k, 18, 2)}${esc(strokaIme(k))}</span>`).join("")}</div>
    <div class="pr">${ikona("pin", 18, 2)}<span>${esc(reg)}</span></div>
    ${jePreverjen(m) ? `<div class="prev">${ikona("kljukica", 16, 3)} Podjetje preverjeno</div>`
      : S.placilo?.iban ? `<button class="potrdi" type="button" id="potrdiPodj">${ikona("kljukica", 20, 2.4)}<div><b>${m.preverjanje?.cakam ? "Čakamo na tvoje nakazilo" : "Potrdi podjetje"}</b><small>${m.preverjanje?.cakam ? "Ko prispe, te potrdimo (običajno v nekaj minutah) in se lahko javljaš." : m.preverjanje?.zavrnjeno ? "Nakazila nismo našli. Poskusi znova." : "Enkratno nakazilo 1 centa s TRR podjetja dokaže, da je podjetje res tvoje. Potem se lahko javljaš na dela."}</small></div><span class="pusc">›</span></button>` : ""}
    <div class="pst"><div><b>${prostaDela().length}</b><small>prostih del</small></div><div><b>${terminov}</b><small>${terminov === 1 ? "termin" : terminov === 2 ? "termina" : terminov === 3 || terminov === 4 ? "termini" : "terminov"}</small></div><div><b>${Object.values(S.moje).filter((p) => p.status === "caka").length}</b><small>čaka na stranko</small></div></div>
  </section>`;
}
const prostaDela = () => {
  const skrita = new Set(prefs.skrita || []);
  return S.feed.filter((j) => j.status === "odprto" && !skrita.has(j.id) && !["zavrnjeno", "odpovedal"].includes(S.moje[j.id]?.status) && (S.mojster?.regije || []).some((r) => r === "vsa" || r === j.regija));
};
const profilPopoln = (m) => !!(m && m.slika && m.firma && (m.davcna || testnaFirma(m.firma)) && m.pogoji === POGOJI_VERZIJA);
// Objava v viru (kot na Instagramu): glava, velika slika, gumb in opis. Podrobnosti ob tapu.
function postM(j) {
  const nov = !S.seen.has(j.id) && j.ustvarjeno && Date.now() - j.ustvarjeno.toMillis() < 3600e3;
  const moja = S.moje[j.id]?.status === "caka";
  return `<article class="post">
    <div class="ph"><span class="av">${ikona(j.stroka, 22)}</span><div><b>${strokaIme(j.stroka)}</b><small>${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</small></div>${nov ? '<span class="new">Novo</span>' : ""}<button class="tri" type="button" data-prijavi="${j.id}" aria-label="Prijavi ali skrij">•••</button></div>
    <div class="pw" data-odpri="M:${j.id}">${pic(j)}</div>
    <div class="pa">${moja ? `<button class="btn small ghost" type="button" data-take="${j.id}">${ikona("kljukica", 18, 2.6)} Javil si se</button>` : `<button class="btn small" type="button" data-take="${j.id}">Javi se</button>`}
      ${j.prosnja ? "" : `<button class="ikb" type="button" data-slike="${j.id}" aria-label="Prosi za več slik">${ikona("kamera", 24)}</button>`}</div>
    ${j.slika ? `<p class="po" data-odpri="M:${j.id}">${esc(j.opis || strokaIme(j.stroka))}</p>` : ""}
    <div class="meta pm">${esc([j.kdaj, j.budget && j.budget !== "Ne vem" ? j.budget : ""].filter(Boolean).join(" · "))}</div>
  </article>`;
}
// Podrobnosti prostega dela.
function detM(j) {
  const moja = S.moje[j.id];
  return `${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</div>
    <div class="pogoj"><span>Kdaj</span><b>${esc([j.kdaj, ...(j.doma || [])].filter(Boolean).join(", "))}</b></div>
    ${j.budget ? `<div class="pogoj"><span>Okvirno plačilo</span><b>${esc(j.budget)}</b></div>` : ""}
    ${j.ponudb ? `<div class="meta">Javili so se že ${mojstrov(j.ponudb).replace("mojstre", "mojstrov")}</div>` : ""}
    ${moja?.status === "caka" ? `<div class="status"><span class="dot"></span>Javil si se za ${esc(opisTermina(moja.termin))}. Čakaš na stranko.</div><button class="btn ghost" type="button" data-take="${j.id}">Spremeni termin ali ceno</button>`
      : `<button class="btn" type="button" data-take="${j.id}">Javi se za to delo</button>`}
    <div class="row">${j.prosnja ? `<span class="meta">Prošnja za slike je poslana</span>` : `<button class="link" type="button" data-slike="${j.id}">${ikona("kamera", 18)} Prosi za več slik</button>`}<button class="link muted" type="button" data-prijavi="${j.id}">Prijavi ali skrij</button></div></div>`;
}
// Podrobnosti mojega termina.
function detT(j) {
  const k = S.kontakti[j.id] || {};
  return `${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)}</div>
    <div class="status"><span class="dot ok"></span>Tvoj termin: ${esc(opisTermina(j.termin))}</div>
    ${k.tel ? `<div class="row"><span class="phone">${esc(k.tel)}</span><a class="btn small" href="tel:${esc(k.tel.replace(/\s/g, ""))}">Pokliči</a></div>` : ""}
    <button class="btn ghost" type="button" data-koledar="${j.id}">${ikona("koledar", 22)} Dodaj v koledar in opomnike</button>
    <div class="row"><button class="link" type="button" data-odpovem="${j.id}">Odpovej termin</button></div></div>`;
}
/* ---------- okno s podrobnostmi ---------- */
// Ostane odprto ob posodobitvah iz baze (npr. nova ponudba) in se samo osveži.
const najdi = (t, id) => (t === "N" ? S.myJobs : t === "M" ? prostaDela() : S.taken.filter((j) => j.status === "prevzeto")).find((j) => j.id === id);
function odpriDet(kljuc) {
  document.getElementById("det")?.remove();
  const d = document.createElement("div"); d.className = "sheet"; d.id = "det";
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  S.det = kljuc; document.body.appendChild(d); osveziDet();
}
function osveziDet() {
  const d = document.getElementById("det"); if (!d || !S.det) return;
  if (d.contains(document.activeElement) && document.activeElement.matches("input,textarea")) return;
  const [t, id] = S.det.split(":");
  const j = najdi(t, id);
  if (!j) { d.remove(); return; }
  const sc = d.firstElementChild?.scrollTop || 0;
  d.innerHTML = `<div role="dialog" aria-label="Podrobnosti" class="det"><button class="zapri" type="button" aria-label="Zapri">✕</button><div class="job">${t === "N" ? detN(j) : t === "M" ? detM(j) : detT(j)}</div></div>`;
  d.firstElementChild.scrollTop = sc;
  d.querySelector(".zapri").onclick = () => d.remove();
  vezi(d);
}
// Vsi gumbi z data-* (v seznamu in v oknu).
const vsaDela = (id) => S.myJobs.find((j) => j.id === id) || S.taken.find((j) => j.id === id) || S.feed.find((j) => j.id === id);
function vezi(root) {
  const na = (sel, fn) => root.querySelectorAll(sel).forEach((b) => b.addEventListener(b.matches("input") ? "change" : "click", (e) => { e.stopPropagation(); fn(b); }));
  na("[data-odpri]", (b) => odpriDet(b.dataset.odpri));
  na("[data-sprejmi]", (b) => odgovori(b, true));
  na("[data-zavrni]", (b) => odgovori(b, false));
  na("[data-vec]", (b) => dodajSlike(b.dataset.vec, [...b.files]));
  na("[data-done]", (b) => setStatus(b.dataset.done, "opravljeno"));
  na("[data-cancel]", (b) => potrdiSheet("Prekličem naročilo?", "Mojstri ga ne bodo več videli.", "Da, prekliči", () => odpovej(b.dataset.cancel, true)));
  na("[data-zamenjaj]", (b) => potrdiSheet("Zamenjam mojstra?", "Temu mojstru odpoveste termin. Naročilo ostane objavljeno, druge ponudbe se vrnejo in izberete lahko drugega mojstra.", "Da, zamenjaj", () => odpovej(b.dataset.zamenjaj, false)));
  na("[data-koledar]", (b) => vKoledar(vsaDela(b.dataset.koledar), prefs.role));
  na("[data-prijavim]", (b) => prijaviSheet({ delo: b.dataset.prijavim, kdo: "mojster" }));
  na("[data-take]", (b) => (S.placilo?.iban && !jePreverjen(S.mojster) ? preveriSheet() : takeSheet(vsaDela(b.dataset.take))));
  na("[data-slike]", (b) => prosiSheet(b.dataset.slike));
  na("[data-odpovem]", (b) => potrdiSheet("Odpovem termin?", "Stranka dobi obvestilo, delo pa se znova odpre za druge mojstre. Za to delo se ne moreš več javiti.", "Da, odpovej", () => odpovej(b.dataset.odpovem, false)));
  na("[data-prijavi]", (b) => prijaviSheet({ delo: b.dataset.prijavi, kdo: "objava" }));
  // števec slik pri vrtiljaku
  root.querySelectorAll(".pic.vrti").forEach((p) => p.addEventListener("scroll", () => {
    const s = p.parentElement.querySelector(".stevec"); if (s) s.textContent = `${Math.round(p.scrollLeft / p.clientWidth) + 1}/${p.children.length}`;
  }, { passive: true }));
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
  const naslov = vloga === "M" ? `Popravko: ${j.opis || strokaIme(j.stroka)}` : `Popravko: pride ${j.mojsterIme || "mojster"}`;
  const tel = vloga === "M" ? S.kontakti[j.id]?.tel : S.kontakti[j.id]?.mojsterTel;
  const opis = [j.opis || strokaIme(j.stroka), vloga === "N" ? j.mojsterFirma : "", tel ? "Telefon: " + tel : "", j.cena ? "Okvirna cena: " + j.cena : ""].filter(Boolean).join("\n");
  if (!native) return toast("Samo v aplikaciji", "Koledar deluje v aplikaciji na iPhonu.");
  try {
    const r = await FixkoKoledar.dodaj({ naslov, opis, kraj: j.kraj || "", zacetek: j.termin });
    if (r.odprto) return toast("Shranite termin", "Odprl se je koledar. Tapnite Shrani.");
    if (r.koledar || r.opomnik) toast("Dodano", [r.koledar ? "v koledar" : "", r.opomnik ? "v opomnike" : ""].filter(Boolean).join(" in ") + ". Opozorilo dobite uro prej.");
    else toast("Ni dovoljenja", "Dovolite dostop v Nastavitve > Popravko > Koledarji in Opomniki.");
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
    ${S.mojster ? `<div class="wiz"><button class="link" type="button" id="back0">‹ Nazaj</button></div>` : ""}
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
    if (S.mojster) for (const id of ["back", "back0"]) document.getElementById(id).onclick = () => { S.urejam = false; S.pd = null; renderM(); window.scrollTo(0, 0); };
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
        if (!push) toast("Obvestila so izklopljena", "Vklopi jih v nastavitvah telefona, sicer ne izveš za nova dela.");
      } catch (e) { console.error(e); btn.disabled = false; btn.textContent = "Shrani"; err("Shranjevanje ni uspelo. Poskusi znova."); }
    };
  };
  draw();
}
async function payStatus() {
  if (!ios) return { product: false };
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
    ${ios ? `<button class="btn ghost" id="restore" type="button">Obnovi nakup</button>` : ""}
    <p class="note">${p.product === false ? (ios ? "Naročnina v App Store še ni odprta." : "Naročnina še ni odprta.") + " Med preizkusom je Popravko za mojstre brezplačen." : "Naročnina se podaljša vsak mesec, dokler je ne prekličeš v nastavitvah Apple ID. Prekličeš kadarkoli."}</p>
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
  document.getElementById("restore")?.addEventListener("click", async () => {
    try { const s = await FixkoPay.restore(); s.active ? await done(s) : err("Aktivne naročnine nismo našli."); } catch (e) { err("Obnova ni uspela."); }
  });
}
function takeSheet(j) {
  if (!j) return;
  const dni = dnevi();
  let dan = dni.find((d) => prosteUre(d).length) || dni[1];
  let ura = prosteUre(dan)[0];
  let cena = S.moje[j.id]?.cena || "", zCeno = false;
  const d = document.createElement("div"); d.className = "sheet";
  const draw = () => {
    d.innerHTML = `<div role="dialog" aria-label="Izberi termin"><h2 style="margin-top:0">Kdaj lahko prideš?</h2><div class="meta">Stranka želi: ${esc([j.kdaj, ...(j.doma || [])].filter(Boolean).join(", "))}</div>
      <label>Dan</label><div class="chips">${dni.filter((x) => prosteUre(x).length).map((x) => `<button type="button" class="chip" data-d="${x.iso}" aria-pressed="${x.iso === dan.iso}">${x.ime} <span class="meta">${x.datum}</span></button>`).join("")}</div>
      <label>Ura</label><div class="chips">${prosteUre(dan).map((u) => `<button type="button" class="chip" data-u="${u}" aria-pressed="${u === ura}">${u}</button>`).join("")}</div>
      ${zCeno || cena ? `<label for="cena">Tvoja okvirna cena <span class="neobv">neobvezno</span></label>
      <input id="cena" maxlength="40" placeholder="npr. okoli 80 €" value="${esc(cena)}">` : `<button class="link lok" type="button" id="zc">+ Dodaj okvirno ceno</button>`}
      <div class="err" id="terr" hidden></div>
      <button class="btn" type="button" id="ok">Pošlji stranki</button>
      <button class="btn ghost" type="button" id="x">Prekliči</button><p class="note">Ko te stranka sprejme, dobiš njen telefon.</p></div>`;
    const ci = d.querySelector("#cena"); if (ci) ci.oninput = (e) => { cena = e.target.value; };
    d.querySelector("#zc")?.addEventListener("click", () => { zCeno = true; draw(); d.querySelector("#cena").focus(); });
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
  // Račun za potrditveno nakazilo; dokler ni vpisan, potrditev podjetja ni potrebna.
  unsub.push(onSnapshot(doc(db, "nastavitve", "placilo"), (d) => { S.placilo = d.data() || null; if (prefs.role === "M" && !document.activeElement?.matches("input,select,textarea")) renderM(); }, () => {}));
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
    ${S.mojster && ios && !BREZPLACNO ? `<button class="btn ghost" type="button" id="man">Upravljaj naročnino</button>` : ""}
    <button class="btn ghost" type="button" id="obv">Vklopi obvestila</button>
    <a class="btn ghost" href="zasebnost.html">Zasebnost in pogoji</a>
    <button class="btn danger" type="button" id="del">Izbriši moje podatke</button>
    <div id="potrdi" hidden><p>Izbrišemo tvoj profil, tvoja dela in slike. Naročnino v App Store prekličeš posebej. Tega ni mogoče razveljaviti.</p><button class="btn danger" type="button" id="del2">Da, izbriši vse</button></div>
    <button class="btn" type="button" id="x">Zapri</button>
    <p class="note"><button class="link muted" type="button" id="skrb">Za skrbnike</button></p></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#skrb").onclick = () => { d.remove(); skrbnikSheet(); };
  d.querySelector("#prof")?.addEventListener("click", () => { d.remove(); S.urejam = true; setRole("M"); });
  d.querySelector("#man")?.addEventListener("click", () => FixkoPay.manage().catch(() => {}));
  d.querySelector("#obv").onclick = async () => {
    const t = await enablePush();
    if (!t) return toast("Obvestila so izklopljena", android && !window.FIXKO_PUSH ? "Na Androidu bodo obvestila na voljo v naslednji verziji." : "Vklopi jih v nastavitvah telefona: Popravko > Obvestila.");
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

/* ---------- potrditev podjetja z nakazilom 0,01 € ---------- */
// UPN QR (standard ZBS): 19 polj, vsako v svoji vrstici, nato dolžina; samo ASCII, da ni težav s kodiranjem.
const ascii = (t, n) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^\x20-\x7E]/g, "").slice(0, n);
function upnQr(pl, sklic) {
  const rok = new Date(Date.now() + 7 * 864e5);
  const polja = ["UPNQR", "", "", "", "", "", "", "", "00000000001", "", "", "OTHR", ascii("Potrditev podjetja Popravko", 42),
    `${String(rok.getDate()).padStart(2, "0")}.${String(rok.getMonth() + 1).padStart(2, "0")}.${rok.getFullYear()}`,
    pl.iban.replace(/\s/g, ""), sklic.replace(/\s/g, ""), ascii(pl.prejemnik, 33), ascii(pl.ulica, 33), ascii(pl.kraj, 33)];
  const besedilo = polja.join("\n") + "\n";
  return besedilo + String(besedilo.length).padStart(3, "0") + "\n";
}
async function preveriSheet() {
  const pl = S.placilo; if (!pl?.iban) return;
  const m = S.mojster || {}, sklic = sklicIz(uid);
  const d = document.createElement("div"); d.className = "sheet";
  const vrstica = (n, v) => `<div class="pogoj kopiraj" data-kopiraj="${esc(v)}"><span>${n}</span><b>${esc(v)}</b></div>`;
  d.innerHTML = `<div role="dialog" aria-label="Potrdi podjetje"><h2 style="margin-top:0">Potrdi podjetje</h2>
    <div class="zakaj"><b>Zakaj 1 cent?</b>
      <p>Davčno številko lahko vpiše kdorkoli, tudi tujo. Z računa podjetja pa lahko nakaže samo njegov lastnik. Ko na izpisku vidimo, da je cent prišel s TRR podjetja <b>${esc(m.firma)}</b>, vemo, da je podjetje res tvoje.</p>
      <p>Tako stranke dobijo samo prave mojstre, ti pa oznako <b>»Podjetje preverjeno«</b>, ki ji stranke bolj zaupajo. To ni plačilo za Popravko, ampak samo enkratna potrditev.</p></div>
    <p class="lead">Nakaži <b>0,01 €</b> z računa podjetja, ne z osebnega. Nakažeš lahko tudi ob vikendu, izberi takojšnje plačilo.</p>
    <div class="qr"><canvas id="qr"></canvas><small>Skeniraj v svoji banki (UPN QR)</small></div>
    ${vrstica("Prejemnik", pl.prejemnik)}${vrstica("IBAN", pl.iban)}${vrstica("Znesek", "0,01 €")}${vrstica("Sklic", sklic)}${vrstica("Namen", "Potrditev podjetja Popravko")}
    <p class="hint">Tapni vrstico, da jo kopiraš. Sklic je pomemben, po njem nakazilo povežemo s tvojim profilom.</p>
    <div class="err" id="perr" hidden></div>
    <button class="btn" type="button" id="ok">${m.preverjanje?.cakam ? "Nakazal sem znova" : "Nakazal sem"}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  QRCode.toCanvas(d.querySelector("#qr"), [{ data: new TextEncoder().encode(upnQr(pl, sklic)), mode: "byte" }], { version: 15, errorCorrectionLevel: "M", margin: 2, width: 240 }).catch((e) => { console.error(e); d.querySelector(".qr").hidden = true; });
  d.querySelectorAll("[data-kopiraj]").forEach((r) => (r.onclick = () => { navigator.clipboard?.writeText(r.dataset.kopiraj.replace(" €", "")).then(() => toast("Kopirano", r.dataset.kopiraj)).catch(() => {}); }));
  d.querySelector("#ok").onclick = async () => {
    const b = d.querySelector("#ok"); b.disabled = true;
    try { await call("nakazal", {}); d.remove(); toast("Hvala", "Ko nakazilo prispe, te potrdimo in dobiš obvestilo. Običajno v nekaj minutah."); }
    catch (e) { b.disabled = false; const t = d.querySelector("#perr"); t.hidden = false; t.textContent = e.message || "Ni uspelo."; }
  };
}
// Skrbnik (Urška, Teo): seznam mojstrov, ki so nakazali; na izpisku preveri sklic in da je TRR podjetja s to davčno.
async function skrbnikSheet() {
  const d = document.createElement("div"); d.className = "sheet";
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  const prijava = (napaka) => {
    d.innerHTML = `<div role="dialog" aria-label="Skrbnik"><h2 style="margin-top:0">Za skrbnike</h2><input id="koda" type="password" placeholder="Koda skrbnika" autocomplete="off">
      ${napaka ? `<div class="err">${esc(String(napaka).replace(/\s*\[\d+\]$/, ""))}</div>` : ""}<button class="btn" type="button" id="ok">Naprej</button></div>`;
    d.querySelector("#ok").onclick = () => { prefs.skrbnik = d.querySelector("#koda").value.trim(); savePrefs(); seznam(); };
  };
  const seznam = async () => {
    d.innerHTML = `<div role="dialog"><div class="spin">Nalagam ...</div></div>`;
    let r;
    try { r = await call("skrbnik", { koda: prefs.skrbnik, akcija: "seznam" }); } catch (e) { prefs.skrbnik = ""; savePrefs(); return prijava(e.message); }
    const bs = await call("skrbnik", { koda: prefs.skrbnik, akcija: "banka-stanje" }).catch(() => ({}));
    const dni = bs.veljaDo ? Math.ceil((bs.veljaDo - Date.now()) / 864e5) : 0;
    const banka = !bs.nastavljeno ? `<div class="prosnja">${ikona("vprasaj", 22)}<div><b>Samodejno preverjanje ni nastavljeno</b><span>Manjkata Application ID in ključ Enable Banking. Nakazila potrjuj ročno.</span></div></div>`
      : bs.povezano && dni > 0 ? `<div class="banka ${dni <= 14 ? "kmalu" : ""}">${ikona("kljukica", 20, 2.6)}<div><b>Banka povezana${bs.iban ? " · " + esc(bs.iban) : ""}</b><span>${bs.napaka ? "Zadnji pregled ni uspel: " + esc(bs.napaka) : `Prilive pregledam vsakih 5 minut${bs.zadnji ? ", nazadnje " + esc(pred(bs.zadnji)) : ""}.`} Dostop velja še ${dni} ${dni === 1 ? "dan" : "dni"}.</span></div></div>${dni <= 14 ? `<button class="btn" type="button" id="banka">Obnovi povezavo z banko</button>` : `<button class="link" type="button" id="preglej">Preglej prilive zdaj</button>`}`
      : `<div class="prosnja">${ikona("vprasaj", 22)}<div><b>Banka ni povezana</b><span>Poveži OTP račun REMAKO, da Popravko sam potrjuje nakazila. Prijaviš se z OTP mobilno aplikacijo.</span></div></div><button class="btn" type="button" id="banka">Poveži banko</button>`;
    d.innerHTML = `<div role="dialog" aria-label="Potrjevanje podjetij"><h2 style="margin-top:0">Potrjevanje podjetij</h2>
      ${banka}
      <p class="lead" style="margin-top:16px">${bs.povezano ? "Spodaj so samo nakazila, kjer se ime plačnika ni ujemalo s podjetjem, in mojstri, katerih nakazila še ni." : "Na izpisku poišči nakazilo 0,01 € s tem sklicem."} Preveri, da je plačnik to podjetje (račun lahko preveriš v registru TRR na AJPES).</p>
      ${r.mojstri.length ? r.mojstri.map((m) => `<div class="ponudba"><div class="mojster">${m.slika ? `<img src="${esc(m.slika)}" alt="">` : ""}<div><b>${esc(m.firma)}</b><span>${esc(m.ime)} · ${esc(m.tel)}</span><small>Davčna ${esc(m.davcna || "ni vpisana")}</small></div></div>
        <div class="pogoj"><span>Sklic</span><b>${esc(m.sklic)}</b></div>${m.placnik ? `<div class="pogoj"><span>Plačnik</span><b>${esc(m.placnik)}</b></div>` : ""}
        <div class="row"><button class="btn small" type="button" data-p="${m.uid}">Potrdi</button><button class="btn small ghost" type="button" data-z="${m.uid}">Ni nakazila</button></div></div>`).join("")
        : `<div class="empty"><b>Ni čakajočih</b>Ko mojster nakaže in tapne »Nakazal sem«, se pokaže tukaj.</div>`}</div>`;
    d.querySelector("#banka")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { const r = await call("skrbnik", { koda: prefs.skrbnik, akcija: "banka-povezi" }); window.open(r.url, "_blank"); toast("Prijavi se v OTP", "Ko končaš, se vrni sem in odpri to okno znova."); }
      catch (x) { toast("Ni uspelo", x.message || ""); }
      e.target.disabled = false;
    });
    d.querySelector("#preglej")?.addEventListener("click", async (e) => {
      e.target.disabled = true;
      try { const r = await call("skrbnik", { koda: prefs.skrbnik, akcija: "banka-preglej" }); toast("Pregledano", `Prilivov 0,01 €: ${r.prilivov || 0}, potrjenih: ${(r.rezultat || []).filter((x) => x.izid === "potrjen").length}.`); seznam(); }
      catch (x) { e.target.disabled = false; toast("Ni uspelo", x.message || ""); }
    });
    d.querySelectorAll("[data-p],[data-z]").forEach((b) => (b.onclick = async () => {
      b.disabled = true;
      try { await call("skrbnik", { koda: prefs.skrbnik, akcija: b.dataset.p ? "potrdi" : "zavrni", uid: b.dataset.p || b.dataset.z }); toast(b.dataset.p ? "Potrjeno" : "Zavrnjeno", "Mojster je dobil obvestilo."); seznam(); }
      catch (e) { b.disabled = false; toast("Ni uspelo", e.message || ""); }
    }));
  };
  prefs.skrbnik ? seznam() : prijava();
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
    console.error(e); view.innerHTML = `<div class="empty">Ni povezave. Preverite internet in odprite Popravko znova.</div>`; return;
  }
  render();
  watchMine();
  watchMojster();
  watchPonudbe();
  // Naročnina: ob vsakem zagonu potrdimo strežniku, da velja (podaljšanja, obnovitve).
  S.pay = await payStatus();
  if (S.pay.active) await sendJws(S.pay);
  if (ios) FixkoPay.addListener("change", async (s) => { S.pay = s; await sendJws(s); if (prefs.role === "M") renderM(); });
  if (prefs.role === "M") renderM();
  // Mojster: osveži žeton za obvestila (iOS ga lahko zamenja).
  if (S.mojster) enablePush().then((t) => { if (t && t !== S.mojster?.push) setDoc(doc(db, "mojstri", uid), { push: t }, { merge: true }).catch(() => {}); });
})();
