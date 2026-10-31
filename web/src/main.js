import { Capacitor, registerPlugin } from "@capacitor/core";
import { zacniSnemanje } from "./glas.js";
import { zacniOglase, pasicaOglasa, imaNastavitveOglasov, nastavitveOglasov } from "./oglasi.js";
import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { Geolocation } from "@capacitor/geolocation";
import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore, doc, getDoc, getDocs, setDoc, updateDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, deleteField, connectFirestoreEmulator
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "firebase/storage";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { STROKE, REGIJE, KDAJ, BUDGET, strokaIme, regijaIme, regijeDrzave, dnevi, prosteUre, opisTermina, pred, veljavenTel, veljavnaDavcna, cistaDavcna, veljavnaTuja, cistaTuja, testnaFirma, POGOJI_VERZIJA, BREZPLACNO, sklicIz, jePreverjen, imaPovrsino, m2Iz } from "./data.js";
import { t, mn, jz, jeSl, nastaviJezik, jezikNaprave, imeAplikacije, imeDrzave, decimalka, JEZIKI, IMENA_JEZIKOV } from "./i18n.js";
import { DRZAVE, TUJE_REGIJE, EVRO, EU, vsaKljuc, jeVsa, pokriva, drzavaRegije, zaznajDrzavo, jezikDrzave } from "./drzave.js";
import { FIXKO } from "./izdaja.js";
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
  const dodaj = () => { const d = n.firstElementChild; if (d && !d.querySelector(":scope > .zapri")) { const x = document.createElement("button"); x.type = "button"; x.className = "zapri"; x.setAttribute("aria-label", t("Zapri")); x.textContent = "✕"; x.onclick = () => n.remove(); d.prepend(x); } };
  dodaj(); new MutationObserver(dodaj).observe(n, { childList: true });
}))).observe(document.body, { childList: true });
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
// Ime aplikacije (Popravko v slovenščini, drugje Fixko), država uporabnika in strani s pogoji v njegovem jeziku.
const IME = () => imeAplikacije();
const drzava = () => prefs.drzava || "SI";
const tuja = () => drzava() !== "SI";
const stran = (f) => (jeSl() ? f : f.replace(".html", "-en.html"));
// Napaka s strežnika: slovensko besedilo prevedemo, če ga poznamo, sicer splošno sporočilo.
const napaka = (e, privzeto) => (jeSl() ? e?.message || privzeto : (e?.message && t(e.message) !== e.message ? t(e.message) : privzeto));

/* ---------- lokalne nastavitve (vloga, zadnji kraj in telefon) ---------- */
const prefs = { role: "N", regija: "", kraj: "", tel: "", ime: "" };
async function loadPrefs() {
  try { const { value } = await Preferences.get({ key: "fixko" }); Object.assign(prefs, JSON.parse(value || "{}")); } catch (e) {}
  // Jezik iz naprave (ali izbran v nastavitvah). Država: obstoječi uporabniki so iz Slovenije, novi iz časovnega pasu in jezika.
  const jeziki = navigator.languages?.length ? navigator.languages : [navigator.language || "sl"];
  if (!FIXKO) {
    // Popravko: Slovenija in slovenščina, kot doslej.
    prefs.drzava = "SI"; prefs.jezik = "";
    nastaviJezik("sl");
  } else {
    // Fixko: država iz časovnega pasu (ali izbrana), jezik države, sicer jezik telefona (ali izbran).
    const zdaj = zaznajDrzavo(jeziki, Intl.DateTimeFormat().resolvedOptions().timeZone || "");
    if (!prefs.drzava) { prefs.drzava = zdaj; prefs.vprasano = zdaj; savePrefs(); }
    // Telefon je v drugi državi (potovanje): enkrat vprašamo, ali preklopimo; sami ne preklopimo.
    else if (zdaj !== prefs.drzava && zdaj !== prefs.vprasano) S.novaDrzava = zdaj;
    nastaviJezik(prefs.jezik || jezikDrzave(prefs.drzava) || jezikNaprave(jeziki));
  }
  prevediStran();
}
// Stalni deli strani (glava, preklop vlog) v jeziku aplikacije.
function prevediStran() {
  document.documentElement.lang = jz();
  document.title = IME();
  document.querySelector(".logo span").textContent = IME();
  document.querySelector(".pomoc span").textContent = t("Pomoč");
  document.getElementById("pomoc").setAttribute("aria-label", t("Kako deluje"));
  document.getElementById("nast").setAttribute("aria-label", t("Nastavitve"));
  document.querySelector(".switch").setAttribute("aria-label", t("Kdo ste"));
  document.getElementById("tabN").textContent = t("Rabim mojstra");
  document.getElementById("tabM").textContent = t("Sem mojster");
  const f = document.querySelector(".foot a"); f.textContent = t("Zasebnost in pogoji"); f.href = stran("zasebnost.html");
}
// Okvirni zneski: v državah brez evra pokažemo domačo valuto (£, $), številke ostanejo.
const VALUTA = { GB: "£", US: "$", CA: "$", AU: "$", NZ: "$" };
const znesek = (s) => (VALUTA[prefs.drzava] ? t(s).replace(/€/g, VALUTA[prefs.drzava]) : t(s));
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
const S = { ponudbe: [], moje: {}, myJobs: [], kontakti: {}, feed: [], taken: [], mojster: null, pay: null, seen: new Set(), firstFeed: true, profili: {} };
let draft = { cat: "", photo: null, blob: null, opis: "", kdaj: KDAJ[0], doma: [], budget: "", m2: "" };
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
    if (android) await PushNotifications.createChannel({ id: "fixko", name: t("Nova dela in termini"), importance: 5, visibility: 1, vibration: true }).catch(() => {});
    return await new Promise((resolve) => {
      const t = setTimeout(() => resolve(null), 10000);
      // Fixko je druga aplikacija (drug bundle): iPhone žeton označimo, da ga strežnik pošlje na pravo aplikacijo.
      PushNotifications.addListener("registration", (r) => { clearTimeout(t); pushToken = (FIXKO && ios ? "fixko:" : "") + r.value; resolve(pushToken); });
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
function render() {
  const uvod = !prefs.uvod;
  document.querySelector(".switch").hidden = uvod;
  // Oglasna pasica (AdMob) na dnu, a ne na uvodnem zaslonu.
  pasicaOglasa(!uvod);
  if (uvod) { if (!view.querySelector(".izbira")) renderUvod(); return; }
  document.getElementById("tabN").setAttribute("aria-pressed", prefs.role === "N");
  document.getElementById("tabM").setAttribute("aria-pressed", prefs.role === "M");
  prefs.role === "N" ? renderN() : renderM();
}

const icon = (s = 48) => `<svg width="${s}" height="${s}" viewBox="0 0 28 28" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l2-3h8l2 3h4v13H4z"/><circle cx="14" cy="15" r="4"/></svg>`;
// Slike dela: ena velika, več jih je v vrtiljaku (podrsaš levo, kot na Instagramu).
const pic = (j) => {
  const s = [j.slika, ...(j.slike || [])].filter(Boolean);
  if (!s.length) return `<div class="pic brez">${ikona(j.stroka, 44, 1.6)}<p>${esc(j.opis || strokaIme(j.stroka))}</p></div>`;
  return `<div class="pw-in"><div class="pic${s.length > 1 ? " vrti" : ""}">${s.map((u) => `<img src="${esc(u)}" alt="" loading="lazy">`).join("")}</div>${s.length > 1 ? `<span class="stevec">1/${s.length}</span>` : ""}</div>`;
};
const opt = (list, sel, prazno) => (prazno ? `<option value="">${prazno}</option>` : "") + list.map(([k, n]) => `<option value="${k}"${k === sel ? " selected" : ""}>${esc(n)}</option>`).join("");

/* =================== UVOD =================== */
// Prvi zagon: kaj je Popravko in kdo ste, z dvema velikima gumboma.
const KORAKI = {
  N: [["kamera", "Fotografirajte ali opišite", "Kaj je narobe. {0} sam ugotovi, kateri mojster je pravi."], ["telefon", "Mojster vas pokliče", "Dogovorite se za ceno in termin."], ["dom", "Mojster pride", "V aplikaciji vidite njegovo ime, sliko in podjetje."]],
  M: [["mojster", "Uredi profil", "Slika, podjetje, stroka in kje delaš."], ["kamera", "Dobiš obvestilo", "Ko nekdo v tvoji bližini rabi tvojo stroko."], ["telefon", "Prevzemi in pokliči", "Izbereš termin, stranka te pričakuje."]]
};
const koraki = (r) => `<ol class="koraki">${KORAKI[r].map(([ik, tt, m], i) => `<li><span class="kn">${ikona(ik, 26)}<i>${i + 1}</i></span><div><b>${t(tt)}</b><small>${t(m, IME())}</small></div></li>`).join("")}</ol>`;
function renderUvod() {
  view.innerHTML = `
  <div class="uvod">
    <img src="logo-velik.png" width="150" height="150" alt="${IME()}">
    <h1>${t("Mojster na vašem domu")}</h1>
    <p class="lead">${t("Pipa pušča, luč ne gori, vrata škripajo? {0} poišče mojstra v vaši bližini.", IME())}</p>
  </div>
  ${koraki("N")}
  <h2 class="kdo">${t("Kdo ste?")}</h2>
  <button class="izbira" type="button" data-r="N"><span>${ikona("dom", 34)}</span><div><b>${t("Rabim mojstra")}</b><small>${t("Brezplačno za vas")}</small></div></button>
  <button class="izbira" type="button" data-r="M"><span>${ikona("orodje", 34)}</span><div><b>${t("Sem mojster")}</b><small>${t("Dobivajte nova dela v bližini")}</small></div></button>`;
  view.querySelectorAll(".izbira").forEach((b) => (b.onclick = () => setRole(b.dataset.r)));
}
function pomocSheet() {
  const r = prefs.uvod ? prefs.role : "N";
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="${t("Kako deluje")}"><h2 style="margin-top:0">${t("Kako deluje")}</h2>
    ${koraki(r)}
    ${r === "N" ? `<p class="lead">${t("Ne veste, kateri mojster? Samo opišite težavo, {0} izbere sam. Ne veste, kako napisati? Tapnite Povejte in opišite z glasom.", IME())}</p>` : `<p class="lead">${t("Stranka vidi tvojo sliko, ime, podjetje in davčno številko, zato ti lažje zaupa.")}</p>`}
    <p class="lead">${t("Vprašanja:")} <a class="link" href="mailto:support@remako.si">support@remako.si</a></p>
    <button class="btn" type="button" id="x">${t("Razumem")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
}

/* =================== STRANKA =================== */
// Preprosto za starejše: slika ali opis, stroka in kraj se prepoznata sama.
const kamera = `<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8h3.5l1.7-2.5h7.6L17.5 8H21v11H3z"/><circle cx="12" cy="13.5" r="3.6"/></svg>`;
const pin = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>`;
const kdo = (k) => t({ vodovod: "vodovodar", elektrika: "električar", keramika: "keramičar", pleskanje: "pleskar", mizarstvo: "mizar", montaza: "monter pohištva", ogrevanje: "serviser ogrevanja in klime", streha: "krovec", vrt: "vrtnar", ciscenje: "čistilni servis", selitve: "selitveni servis", drugo: "hišnik", tla: "polagalec talnih oblog", zidar: "zidar", okna: "monter oken in vrat", aparati: "serviser aparatov" }[k] || strokaIme(k));
// Pri tuji državi kraj vpiše stranka (lokacija pozna samo slovenske kraje).

let iscem = false;
async function najdiLokacijo(vprasaj) {
  if (iscem || tuja()) return; iscem = true;
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
  const prejsnja = stara.length ? `<details class="stara"><summary>${t("Prejšnja naročila ({0})", stara.length)}</summary><div class="list">${stara.map(cardN).join("")}</div><button class="link muted" type="button" data-pocisti>${t("Izbriši vsa prejšnja")}</button></details>` : "";
  if (!k) {
    view.innerHTML = `<h1>${t("Vaša naročila")}</h1><div class="list">${aktivna.map(cardN).join("")}</div>
      <button class="btn big" type="button" id="novo">+ ${t("Novo naročilo")}</button>${prejsnja}`;
    document.getElementById("novo").onclick = () => { draft.korak = 1; renderN(); window.scrollTo(0, 0); };
    vezi(view); osveziDet();
    return;
  }
  const nazaj = k > 1 || aktivna.length;
  const vrh = `<div class="wiz">${nazaj ? `<button class="link" type="button" id="nazaj">‹ ${t("Nazaj")}</button>` : "<span></span>"}<div class="pike" aria-label="${t("Korak {0} od {1}", k, KORAKOV)}">${Array.from({ length: KORAKOV }, (_, i) => `<i class="${i < k ? "da" : ""}"></i>`).join("")}</div></div>`;
  const naprej = (tx = t("Naprej")) => `<div class="err" id="err" hidden></div><button class="btn big" type="button" id="naprej">${tx}</button>`;
  const chipi = (id, list, sel) => `<div class="mreza ena" id="${id}">${list.map((v) => `<button type="button" class="chip velik" data-v="${v}" aria-pressed="${sel === v}">${id === "budget" ? znesek(v) : t(v)}</button>`).join("")}</div>`;
  let html;
  if (k === 1) html = `<h1>${t("Kaj je treba popraviti?")}</h1>
    <label class="shot${draft.photo ? " ima" : ""}" for="file">${draft.photo ? `<img src="${draft.photo}" alt="${t("Vaša slika")}"><span class="zamenjaj">${t("Zamenjaj sliko")}</span>` : `${ikona("kamera", 46, 1.6)}<b>${t("Fotografirajte")}</b><small>${t("ali izberite sliko iz telefona")}</small>`}</label>
    <input id="file" type="file" accept="image/*" hidden>
    <label for="opis" class="big">${t("Na kratko opišite")}</label>
    <textarea id="opis" rows="2" maxlength="200" placeholder="${t("npr. Pušča pipa v kuhinji")}">${esc(draft.opis)}</textarea>
    <p class="note" id="zaznano" aria-live="polite"></p>
    <button class="btn ghost glas" type="button" id="glas">${ikona("mikrofon", 22)} ${t("Povejte z glasom")}</button>${naprej()}${aktivna.length ? "" : prejsnja}`;
  else if (k === 2) { if (!draft.cat) draft.izberi = true; html = `<h1>${t("Kdo in kam?")}</h1><div id="stroka"></div><div id="kraj"></div>${naprej()}`; }
  else if (k === 3) html = `<h1>${t("Kdaj naj pride mojster?")}</h1>${chipi("kdaj", KDAJ, draft.kdaj)}`;
  else if (k === 4) {
    // Pri pleskanju, ploščicah, tleh ... neobvezno še približna površina (predlog iz opisa, če jo je stranka že napisala).
    if (imaPovrsino(draft.cat) && !draft.m2 && m2Iz(draft.opis)) draft.m2 = String(m2Iz(draft.opis));
    const povrsina = imaPovrsino(draft.cat) ? `<label class="m2" for="m2"><span>${t("Približno koliko m²?")} <small>${t("neobvezno")}</small></span><span class="m2v"><input id="m2" type="text" inputmode="decimal" maxlength="6" placeholder="${t("npr. 25")}" value="${esc(draft.m2)}"><b>m²</b></span></label>` : "";
    html = `<h1>${t("Koliko približno želite plačati?")}</h1><p class="lead">${t("Samo okvirno, da se mojster lažje odloči. Točno ceno se dogovorite z njim.")}</p>${povrsina}${chipi("budget", BUDGET, draft.budget)}`;
  }
  else html = `<h1>${t("Kam naj vas mojster pokliče?")}</h1>
    <input id="tel" type="tel" inputmode="tel" maxlength="20" placeholder="${telPrimer()}" value="${esc(prefs.tel)}" autocomplete="tel" aria-label="${t("Vaša telefonska številka")}">
    <div class="povzetek">${draft.photo ? `<img src="${draft.photo}" alt="">` : `<span>${ikona(draft.cat, 30)}</span>`}<div><b>${esc(draft.opis || strokaIme(draft.cat))}</b><small>${esc([kdo(draft.cat), prefs.kraj, t(draft.kdaj), kvadratura(), draft.budget && draft.budget !== "Ne vem" ? znesek(draft.budget) : ""].filter(Boolean).join(" · "))}</small></div></div>
    ${naprej(t("Pošlji mojstrom"))}
    <p class="note">${t("Za vas je {0} brezplačen. S pošiljanjem sprejemate", IME())} <a class="link" href="${stran("pogoji.html")}">${t("pogoje uporabe")}</a> ${t("in")} <a class="link" href="${stran("zasebnost.html")}">${t("politiko zasebnosti")}</a>.</p>`;
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
    // Stroka se prepozna sproti; ko jo najde, na 2. koraku ne kažemo več izbire (tudi če se je stranka vrnila nazaj).
    const zaznano = document.getElementById("zaznano");
    const pokazi = () => { zaznano.textContent = draft.cat ? t("Pomagal vam bo: {0}", kdo(draft.cat)) : ""; };
    opis.oninput = () => {
      draft.opis = opis.value;
      if (!draft.catRocno) { draft.cat = prepoznajStroko(draft.opis, jz()); if (draft.cat) draft.izberi = false; }
      pokazi();
    };
    pokazi();
    // Glas: tap začne snemanje, drugi tap ustavi, besedilo se samo izpiše v polje.
    const gb = document.getElementById("glas");
    let ustavi = null;
    const gumb = (html, cls) => { gb.innerHTML = html; gb.className = "btn glas " + cls; };
    gb.onclick = async () => {
      if (ustavi) { ustavi(); ustavi = null; return; }
      try {
        ustavi = await zacniSnemanje(async ({ b64, sekund }) => {
          ustavi = null;
          if (sekund < 0.6) return gumb(`${ikona("mikrofon", 22)} ${t("Povejte z glasom")}`, "ghost");
          gumb(t("Prepisujem ..."), "ghost"); gb.disabled = true;
          try {
            const r = await call("prepisi", jeSl() ? { zvok: b64 } : { zvok: b64, jezik: jz() });
            if (r.besedilo) { opis.value = (opis.value.trim() ? opis.value.trim() + " " : "") + r.besedilo; opis.dispatchEvent(new Event("input")); }
            else toast(t("Nisem razumel"), t("Poskusite znova bližje telefonu."));
          } catch (e) { toast(t("Prepis ni uspel"), napaka(e, t("Preverite internet in poskusite znova."))); }
          gb.disabled = false; gumb(`${ikona("mikrofon", 22)} ${t("Povejte z glasom")}`, "ghost");
        });
        gumb(`<span class="rec"></span> ${t("Govorite ... tapnite za konec")}`, "snema");
      } catch (e) { toast(t("Mikrofon ni dovoljen"), t("Dovolite ga v Nastavitve > {0} > Mikrofon.", IME())); }
    };
    document.getElementById("file").onchange = (e) => {
      const fl = e.target.files[0]; if (!fl) return;
      shrink(fl).then(({ url, blob }) => { draft.photo = url; draft.blob = blob; renderN(); }).catch(() => toast(t("Slike ni bilo mogoče odpreti"), t("Poskusite z drugo sliko.")));
    };
    document.getElementById("naprej").onclick = () => {
      if (!draft.blob && draft.opis.trim().length < 3) return err(t("Fotografirajte ali na kratko opišite, kaj je treba narediti."));
      pojdi(2);
    };
    vezi(view);
    if (!prefs.kraj && !draft.urejamKraj && !draft.vprasal) { draft.vprasal = true; najdiLokacijo(true); }
  }
  if (k === 2) {
    osveziStroko(); osveziKraj();
    document.getElementById("naprej").onclick = () => {
      const ki = document.getElementById("krajIn"); if (ki) prefs.kraj = ki.value;
      if (tuja()) { const ri = document.getElementById("regIn"); if (ri) prefs.regija = ri.value; if (drzavaRegije(prefs.regija) !== drzava()) prefs.regija = ""; }
      else if (!prefs.regija) prefs.regija = regijaIzKraja(prefs.kraj);
      savePrefs();
      if (!draft.cat) { draft.izberi = true; osveziStroko(); return err(t("Izberite, kdo vam lahko pomaga.")); }
      if (!prefs.kraj.trim()) { draft.urejamKraj = true; osveziKraj(); return err(t("Vpišite kraj, kamor naj pride mojster.")); }
      if (!prefs.regija) { draft.urejamKraj = true; osveziKraj(); return err(t("Izberite območje.")); }
      pojdi(3);
    };
  }
  if (k === 4) document.getElementById("m2")?.addEventListener("input", (e) => { draft.m2 = e.target.value; });
  if (k === 5) {
    const tel = document.getElementById("tel");
    tel.oninput = () => { prefs.tel = tel.value; };
    document.getElementById("naprej").onclick = () => poslji(err);
  }
  osveziDet();
}
// »~25 m²« za povzetek, kadar je stranka vpisala površino.
const kvadratura = (m2 = imaPovrsino(draft.cat) && m2Iz(draft.m2)) => m2 ? `~${m2} m²` : "";
async function poslji(err) {
  savePrefs();
  if (!veljavenTel(prefs.tel)) return err(t("Vpišite telefonsko številko, npr. {0}.", telPrimer()));
  if (!db) return err(t("{0} še ni povezan s strežnikom. Poskusite malo kasneje.", IME()));
  const btn = document.getElementById("naprej"); btn.disabled = true; btn.textContent = t("Pošiljam ...");
  try {
    const id = doc(collection(db, "dela")).id;
    let slika = "";
    if (draft.blob) {
      const r = ref(storage, `slike/${uid}/${id}.jpg`);
      await uploadBytes(r, draft.blob, { contentType: "image/jpeg" });
      slika = await getDownloadURL(r);
    }
    const push = await enablePush();
    await setDoc(doc(db, "dela", id, "zasebno", "kontakt"), { lastnik: uid, tel: prefs.tel.trim(), push: push || null, ...jezikInPas() });
    await setDoc(doc(db, "dela", id), {
      lastnik: uid, stroka: draft.cat, opis: draft.opis.trim().slice(0, 200), regija: prefs.regija, kraj: prefs.kraj.trim().slice(0, 80),
      kdaj: draft.kdaj || KDAJ[0], doma: [], budget: draft.budget || "Ne vem", slika, status: "odprto", ustvarjeno: serverTimestamp(),
      ...(imaPovrsino(draft.cat) && m2Iz(draft.m2) ? { m2: m2Iz(draft.m2) } : {}), ...(tuja() ? { drzava: drzava() } : {})
    });
    // Učenje: če je stranka stroko izbrala sama, shranimo opis in izbiro (brez osebnih podatkov).
    const predlog = prepoznajStroko(draft.opis, jz());
    if (draft.opis.trim() && predlog !== draft.cat && jeSl()) {
      setDoc(doc(collection(db, "popravki")), { opis: draft.opis.trim().slice(0, 200), predlog, izbrano: draft.cat, ustvarjeno: serverTimestamp() }).catch(() => {});
    }
    draft = { cat: "", photo: null, blob: null, opis: "", kdaj: KDAJ[0], doma: [], budget: "", m2: "", vprasal: true, korak: 0 };
    renderN(); window.scrollTo(0, 0);
    toast(t("Poslano mojstrom"), t("Ko se mojster javi, ga tukaj potrdite ali zavrnete."));
  } catch (x) {
    console.error(x);
    btn.disabled = false; btn.textContent = t("Pošlji mojstrom");
    err(t("Pošiljanje ni uspelo. Preverite internet in poskusite znova."));
  }
}
function osveziStroko() {
  const el = document.getElementById("stroka"); if (!el) return;
  if (draft.cat && !draft.izberi) {
    el.innerHTML = `<div class="najdeno"><span class="ik">${ikona(draft.cat, 26)}</span><div><small>${t("Pomagal vam bo")}</small><b>${esc(kdo(draft.cat)[0].toUpperCase() + kdo(draft.cat).slice(1))}</b></div><button class="link" type="button" id="drug">${t("Spremeni")}</button></div>`;
    el.querySelector("#drug").onclick = () => { draft.izberi = true; osveziStroko(); };
  } else if (draft.izberi || (draft.opis.trim().length > 12 && !draft.cat)) {
    el.innerHTML = `<label class="big">${t("Kdo vam lahko pomaga?")}</label><div class="mreza">${STROKE.map(([k, n]) => `<button type="button" class="chip ikchip" data-k="${k}" aria-pressed="${draft.cat === k}">${ikona(k, 24)}<span>${t(n)}</span></button>`).join("")}</div>`;
    el.querySelectorAll(".chip").forEach((b) => (b.onclick = () => { draft.cat = b.dataset.k; draft.catRocno = true; draft.izberi = false; document.getElementById("err").hidden = true; osveziStroko(); }));
  } else el.innerHTML = "";
}
function osveziKraj() {
  const el = document.getElementById("kraj"); if (!el) return;
  if (tuja()) return osveziKrajTuji(el);
  if (!draft.urejamKraj && prefs.kraj) {
    el.innerHTML = `<div class="najdeno"><span class="ik">${ikona("pin", 26)}</span><div><small>${t("Mojster pride v kraj")}</small><b>${esc(prefs.kraj)}</b></div><button class="link" type="button" id="ured">${t("Spremeni")}</button></div>`;
    el.querySelector("#ured").onclick = () => { draft.urejamKraj = true; osveziKraj(); document.getElementById("krajIn")?.focus(); };
  } else if (iscem) {
    el.innerHTML = `<div class="najdeno"><span class="ik">${ikona("pin", 26)}</span><div><small>${t("Iščem vašo lokacijo ...")}</small></div></div>`;
  } else {
    const neznana = prefs.kraj && !regijaIzKraja(prefs.kraj);
    el.innerHTML = `<label for="krajIn" class="big">${t("Kam naj pride mojster?")}</label>
      <input id="krajIn" maxlength="80" placeholder="${t("Kraj, npr. Maribor")}" value="${esc(prefs.kraj)}" autocomplete="address-level2">
      ${neznana || (prefs.kraj && !prefs.regija) ? `<select id="regIn" aria-label="${t("Območje")}">${opt(regijeDrzave("SI"), prefs.regija, t("Izberite območje"))}</select>` : ""}
      ${native || navigator.geolocation ? `<button class="link lok" type="button" id="lok">${pin} ${t("Uporabi mojo lokacijo")}</button>` : ""}`;
    const inp = el.querySelector("#krajIn");
    inp.oninput = () => { prefs.kraj = inp.value; prefs.krajRocno = true; const r = regijaIzKraja(inp.value); if (r) prefs.regija = r; else prefs.regija = el.querySelector("#regIn")?.value || ""; };
    inp.onchange = () => { if (!regijaIzKraja(inp.value) && !el.querySelector("#regIn")) { osveziKraj(); } };
    el.querySelector("#regIn")?.addEventListener("change", (e) => { prefs.regija = e.target.value; });
    el.querySelector("#lok")?.addEventListener("click", () => { draft.urejamKraj = false; prefs.krajRocno = false; najdiLokacijo(true); osveziKraj(); });
  }
}
// Tuja država: kraj in regija (izbira iz seznama, ali cela država, če regij ne poznamo).
function osveziKrajTuji(el) {
  const regije = regijeDrzave(drzava());
  if (drzavaRegije(prefs.regija) !== drzava()) prefs.regija = regije.length ? "" : vsaKljuc(drzava());
  el.innerHTML = `<label for="krajIn" class="big">${t("Kam naj pride mojster?")}</label>
    <input id="krajIn" maxlength="80" placeholder="${t("Kraj in naslov")}" value="${esc(prefs.kraj)}" autocomplete="address-level2">
    ${regije.length ? `<select id="regIn" aria-label="${t("Območje")}">${opt(regije, prefs.regija, t("Izberite območje"))}</select>` : ""}
    <p class="note">${esc(imeDrzave(drzava()))} · <button class="link" type="button" id="drz">${t("Spremeni državo")}</button></p>`;
  const inp = el.querySelector("#krajIn");
  inp.oninput = () => { prefs.kraj = inp.value; prefs.krajRocno = true; };
  el.querySelector("#regIn")?.addEventListener("change", (e) => { prefs.regija = e.target.value; savePrefs(); });
  el.querySelector("#drz").onclick = () => settingsSheet();
}
const telPrimer = () => t(tuja() ? "npr. +49 151 2345678" : "041 123 456");
const jezikInPas = () => (jeSl() && !tuja() ? {} : { jezik: jz(), tz: Intl.DateTimeFormat().resolvedOptions().timeZone || "" });
// Kratka kartica naročila; vse podrobnosti (ponudbe, mojster, dejanja) so v oknu ob tapu.
function cardN(j) {
  const pon = S.ponudbe.filter((p) => p.delo === j.id && p.status === "caka").length;
  const st = j.status === "opravljeno" ? t("Opravljeno") : j.status === "preklicano" ? t("Preklicano")
    : j.status === "prevzeto" ? t("Mojster pride {0}", opisTermina(j.termin))
    : j.prosnja ? t("Mojster prosi za več slik")
    : pon ? (pon === 1 ? t("Javil se je mojster") : t("Javilo se je {0}", mojstrovRod(pon)))
    : t("Čakamo, da se javi mojster");
  const pika = j.status === "prevzeto" || pon ? "ok" : j.status === "odprto" ? "" : "off";
  return `<button type="button" class="nar" data-odpri="N:${j.id}"><span class="th">${j.slika ? `<img src="${esc(j.slika)}" alt="" loading="lazy">` : ikona(j.stroka, 30)}</span>
    <div><b>${esc(j.opis || strokaIme(j.stroka))}</b><small><span class="dot ${pika}"></span>${esc(st)}</small></div>
    ${pon && j.status === "odprto" ? `<span class="znacka">${pon}</span>` : j.prosnja && j.status !== "opravljeno" ? `<span class="znacka">!</span>` : ""}<span class="pusc">›</span></button>`;
}
// Podrobnosti naročila (v oknu).
const preverjenoZnak = () => `<em class="prev">${ikona("kljukica", 14, 3)} ${t("Podjetje preverjeno")}</em>`;
function detN(j) {
  const k = S.kontakti[j.id] || {};
  let st;
  if (j.status === "opravljeno") st = `<div class="status"><span class="dot off"></span>${t("Opravljeno")}${j.mojsterIme ? `: ${esc(j.mojsterIme)}` : ""}</div>`
    + (!j.mojster ? "" : j.ocene?.M ? `<div class="vasa">${t("Vaša ocena")} <span class="zv">${zvezde(j.ocene.M)}</span></div>` : `<button class="btn" type="button" data-oceni="${j.id}">${ikona("zvezda", 22)} ${t("Ocenite mojstra")}</button>`);
  else if (j.status === "preklicano") st = `<div class="status"><span class="dot off"></span>${t("Preklicano")}</div>`;
  else if (j.status === "prevzeto") st = `<div class="status"><span class="dot ok"></span>${j.naPoti ? t("Mojster je na poti") : t("Mojster pride {0}", esc(opisTermina(j.termin)))}</div>
    <div class="mojster">${j.mojsterSlika ? `<img src="${esc(j.mojsterSlika)}" alt="">` : ""}<div><b>${esc(j.mojsterIme || t("Mojster"))}</b>${ocenaZnak(j.mojster)}${j.mojsterFirma ? `<span>${esc(j.mojsterFirma)}</span>` : ""}${j.mojsterDavcna ? `<small>${t("Davčna številka {0}", esc(j.mojsterDavcna))}</small>` : ""}${j.mojsterPreverjen ? preverjenoZnak() : ""}</div></div>
    ${k.mojsterTel ? `<div class="row"><span class="phone">${esc(k.mojsterTel)}</span><a class="btn small" href="tel:${esc(k.mojsterTel.replace(/\s/g, ""))}">${t("Pokliči")}</a></div>` : ""}
    <button class="btn ghost" type="button" data-koledar="${j.id}">${ikona("koledar", 22)} ${t("Dodaj v koledar in opomnike")}</button>
    <button class="btn ghost" type="button" data-done="${j.id}">${t("Delo je opravljeno")}</button>
    <div class="row"><button class="link" type="button" data-zamenjaj="${j.id}">${t("Zamenjaj mojstra")}</button></div>
    <div class="row"><button class="link muted" type="button" data-prijavim="${j.id}">${t("Prijavi mojstra")}</button></div>`;
  else {
    const pon = S.ponudbe.filter((p) => p.delo === j.id && p.status === "caka");
    st = (pon.length ? `<div class="status"><span class="dot ok"></span>${pon.length === 1 ? t("Javil se je mojster. Potrdite ga ali zavrnite.") : t("Javilo se je {0}. Izberite enega.", mojstrovRod(pon.length))}</div>
      ${pon.map((p) => `<div class="ponudba"><div class="mojster">${p.slika ? `<img src="${esc(p.slika)}" alt="">` : ""}<div><b>${esc(p.ime)}</b>${ocenaZnak(p.mojster)}<span>${esc(p.firma)}</span>${p.davcna ? `<small>${t("Davčna številka {0}", esc(p.davcna))}</small>` : ""}${p.preverjen ? preverjenoZnak() : ""}</div></div>
        <div class="pogoj"><span>${t("Lahko pride")}</span><b>${esc(opisTermina(p.termin))}</b></div>${p.cena ? `<div class="pogoj"><span>${t("Okvirna cena")}</span><b>${esc(p.cena)}</b></div>` : ""}
        <div class="row"><button class="btn small" type="button" data-sprejmi="${j.id}" data-m="${esc(p.mojster)}">${t("Sprejmi")}</button><button class="btn small ghost" type="button" data-zavrni="${j.id}" data-m="${esc(p.mojster)}">${t("Zavrni")}</button></div></div>`).join("")}`
      : `<div class="status"><span class="dot"></span>${j.obvesceni ? t("Obvestili smo {0}, čakamo, da se kdo javi ...", mojstrovTož(j.obvesceni)) : t("Čakamo, da se javi mojster ...")}</div>`)
      ;
  }
  const n = { odprto: 1, prevzeto: 2, opravljeno: 3 }[j.status] || 0;
  const aktivno = j.status === "odprto" || j.status === "prevzeto";
  const slike = aktivno ? `${j.prosnja ? `<div class="prosnja">${ikona("kamera", 22)}<div><b>${t("{0} prosi za več slik", esc(j.prosnja.ime))}</b>${j.prosnja.sporocilo ? `<span>»${esc(j.prosnja.sporocilo)}«</span>` : ""}</div></div>` : ""}
    <label class="btn ${j.prosnja ? "" : "ghost"}" for="vec-${j.id}">${ikona("kamera", 22)} ${t("Dodaj slike")}</label><input id="vec-${j.id}" data-vec="${j.id}" type="file" accept="image/*" multiple hidden>` : "";
  const pot = n ? `<ol class="pot">${["Poslano", "Mojster prihaja", "Opravljeno"].map((x, i) => `<li class="${i < n ? "da" : ""}${i === n - 1 ? " zdaj" : ""}"><span>${i < n ? ikona("kljukica", 14, 3) : ""}</span>${t(x)}</li>`).join("")}</ol>` : "";
  return `${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3><div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : t("pravkar")}</div>${pot}${st}${slike}<button class="btn izbrisi" type="button" data-cancel="${j.id}" data-s="${j.status}">${ikona("smeti", 20)} ${t("Izbriši naročilo")}</button></div>`;
}
const tag = (k) => `<span class="tag">${ikona(k, 16, 2.2)}${strokaIme(k)}</span>`;
async function dodajSlike(id, files) {
  const j = S.myJobs.find((x) => x.id === id);
  if (!j || !files.length) return;
  const prej = j.slike || [];
  if (prej.length >= 8) return toast(t("Dovolj slik"), t("Dodate lahko največ 8 slik."));
  toast(t("Nalagam slike ..."), "");
  try {
    const nove = [];
    for (const f of files.slice(0, 8 - prej.length)) {
      const { blob } = await shrink(f);
      const r = ref(storage, `slike/${uid}/${id}-${Date.now()}-${nove.length}.jpg`);
      await uploadBytes(r, blob, { contentType: "image/jpeg" });
      nove.push(await getDownloadURL(r));
    }
    await updateDoc(doc(db, "dela", id), { slike: [...prej, ...nove], prosnja: null });
    toast(t("Slike so dodane"), t("Mojstri jih že vidijo."));
  } catch (e) { console.error(e); toast(t("Ni uspelo"), t("Preverite internet in poskusite znova.")); }
}
async function odgovori(b, sprejmi) {
  const id = b.dataset.sprejmi || b.dataset.zavrni, mojster = b.dataset.m;
  b.disabled = true;
  try {
    await call("odgovori", { id, mojster, sprejmi });
    toast(sprejmi ? t("Mojster je potrjen") : t("Ponudba je zavrnjena"), sprejmi ? t("Pred prihodom vas pokliče.") : t("Naročilo ostane odprto za druge mojstre."));
  } catch (e) { b.disabled = false; toast(t("Ni uspelo"), napaka(e, t("Preverite internet in poskusite znova."))); }
}
const mojstrov = (n) => n + (n % 100 === 1 || n % 100 === 2 ? " mojstra" : n % 100 === 3 || n % 100 === 4 ? " mojstre" : " mojstrov");
// »Javilo se je 3 mojstrov« / »Obvestili smo 3 mojstre«; v drugih jezikih ena oblika z množino jezika.
const mojstrovRod = (n) => (jeSl() ? mojstrov(n).replace("mojstre", "mojstrov") : mn(n, "mojster"));
const mojstrovTož = (n) => (jeSl() ? mojstrov(n) : mn(n, "mojster"));
async function setStatus(id, status) {
  try { await updateDoc(doc(db, "dela", id), { status }); } catch (e) { toast(t("Ni uspelo"), t("Preveri internet in poskusi znova.")); }
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
  if (!db) { view.innerHTML = `<div class="empty">${t("Del za mojstre bo deloval, ko bo {0} povezan s strežnikom.", IME())}</div>`; return; }
  if (!S.mojster || S.urejam || !profilPopoln(S.mojster)) return renderProfil();
  if (!aktiven() && (BREZPLACNO || testnaFirma(S.mojster.firma)) && S.testniVklop !== "napaka") {
    // Brezplačen dostop (zaenkrat za vse) ali testni račun lastnikov.
    view.innerHTML = `<div class="spin">${t("Pripravljam prosta dela ...")}</div>`;
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
  const zaOceno = S.taken.filter((j) => j.status === "opravljeno" && !j.ocene?.N && !(prefs.neOcenim || []).includes(j.id)).slice(0, 3);
  view.innerHTML = `
  ${profilKartica(S.mojster, moja.length)}
  ${zaOceno.map((j) => `<div class="oceni-kartica"><div><b>${t("Delo je opravljeno")}</b><span>${esc(j.opis || strokaIme(j.stroka))}, ${esc(j.kraj)}. ${t("Želiš oceniti stranko? Ni obvezno.")}</span></div>
    <div class="row"><button class="btn small" type="button" data-oceni="${j.id}">${t("Oceni stranko")}</button><button class="btn small ghost" type="button" data-neocenim="${j.id}">${t("Ne, hvala")}</button></div></div>`).join("")}
  ${moja.length ? `<h2 class="mali">${t("Moji termini")}</h2><div class="zgodbe" aria-label="${t("Moji termini")}">${moja.map((j) => `<button type="button" class="zgodba" data-odpri="T:${j.id}"><span class="kr">${j.slika ? `<img src="${esc(j.slika)}" alt="">` : ikona(j.stroka, 30)}</span><small>${esc(opisTermina(j.termin))}</small></button>`).join("")}</div>` : ""}
  <h2 class="mali">${t("Prosta dela")}</h2>
  <div class="feed">${prosta.length ? prosta.map(postM).join("") : `<div class="empty">${ikona("orodje", 40, 1.5)}<b>${t("Trenutno ni prostih del")}</b>${t("Ko nekdo v tvoji regiji rabi tvojo stroko, dobiš obvestilo.")}</div>`}</div>`;
  document.getElementById("edit").onclick = () => { S.urejam = true; renderM(); };
  document.getElementById("potrdiPodj")?.addEventListener("click", preveriSheet);
  vezi(view); osveziDet();
}
// Moj profil na vrhu strani mojstra: slika, ime, podjetje, stroke in kje dela.
function profilKartica(m, terminov) {
  const reg = (m.regije || []).includes("vsa") ? t("Vsa Slovenija") : (m.regije || []).map(regijaIme).join(", ");
  const nacin = nacinPotrditve(m), cakam = m.preverjanje?.cakam, rocno = cakam && m.preverjanje?.nacin && m.preverjanje.nacin !== "nakazilo" && !(m.preverjanje.nacin === "dokument" && nacin === "sepa" && !m.preverjanje.placnik);
  return `<section class="profil">
    <div class="pv">${m.slika ? `<img src="${esc(m.slika)}" alt="">` : `<span>${ikona("mojster", 34)}</span>`}
      <div><b>${esc(m.ime || t("Mojster"))}</b>${ocenaZnak(uid)}<span>${esc(m.firma || "")}</span>${m.davcna ? `<small>${t("Davčna {0}", esc(m.davcna))}</small>` : ""}</div>
      <button class="uredi" id="edit" type="button">${t("Uredi")}</button></div>
    <div class="ps">${(m.stroke || []).map((k) => `<span>${ikona(k, 18, 2)}${esc(strokaIme(k))}</span>`).join("")}</div>
    <div class="pr">${ikona("pin", 18, 2)}<span>${esc(reg)}</span></div>
    ${jePreverjen(m) ? `<div class="prev">${ikona("kljukica", 16, 3)} ${t("Podjetje preverjeno")}</div>`
      : S.placilo?.iban ? `<button class="potrdi" type="button" id="potrdiPodj">${ikona("kljukica", 20, 2.4)}<div><b>${rocno ? t("Čakamo na pregled") : cakam ? t("Čakamo na tvoje nakazilo") : t("Potrdi podjetje")}</b><small>${rocno ? t("Podjetje pregledamo v 1 do 2 delovnih dneh. Ko je potrjeno, dobiš obvestilo.") : cakam ? t("Ko prispe, te potrdimo (običajno v nekaj minutah) in se lahko javljaš.") : m.preverjanje?.zavrnjeno ? (m.preverjanje.razlog === "dokument" ? t("Potrdila nismo mogli potrditi. Naloži jasnejše potrdilo.") : t("Nakazila nismo našli. Poskusi znova.")) : nacin === "upn" ? t("Enkratno nakazilo 1 centa s TRR podjetja dokaže, da je podjetje res tvoje. Potem se lahko javljaš na dela.") : nacin === "sepa" ? t("Enkratno nakazilo 1 centa (SEPA) z računa podjetja dokaže, da je podjetje res tvoje. Potem se lahko javljaš na dela.") : t("Pošlji podjetje v pregled. Ko je potrjeno, se lahko javljaš na dela.")}</small></div><span class="pusc">›</span></button>` : ""}
    <div class="pst"><div><b>${prostaDela().length}</b><small>${t("prostih del")}</small></div><div><b>${terminov}</b><small>${jeSl() ? (terminov === 1 ? "termin" : terminov === 2 ? "termina" : terminov === 3 || terminov === 4 ? "termini" : "terminov") : mn(terminov, "termin").replace(/^\d+\s*/, "")}</small></div><div><b>${Object.values(S.moje).filter((p) => p.status === "caka").length}</b><small>${t("čaka na stranko")}</small></div></div>
  </section>`;
}
const prostaDela = () => {
  const skrita = new Set(prefs.skrita || []);
  return S.feed.filter((j) => j.status === "odprto" && !skrita.has(j.id) && !["zavrnjeno", "odpovedal"].includes(S.moje[j.id]?.status) && (S.mojster?.regije || []).some((r) => pokriva(r, j.regija) || (j.sosednje || []).includes(r)));
};
// Kako mojster potrdi podjetje: Slovenija UPN, evro države SEPA nakazilo, drugje pregled (EU z VIES).
const nacinPotrditve = (m) => { const d = m?.drzava || "SI"; return d === "SI" ? "upn" : EVRO.has(d) ? "sepa" : "rocno"; };
const profilPopoln = (m) => !!(m && m.slika && m.firma && (m.davcna || testnaFirma(m.firma)) && m.pogoji === POGOJI_VERZIJA);
// Objava v viru (kot na Instagramu): glava, velika slika, gumb in opis. Podrobnosti ob tapu.
function postM(j) {
  const nov = !S.seen.has(j.id) && j.ustvarjeno && Date.now() - j.ustvarjeno.toMillis() < 3600e3;
  const moja = S.moje[j.id]?.status === "caka";
  return `<article class="post">
    <div class="ph"><span class="av">${ikona(j.stroka, 22)}</span><div><b>${strokaIme(j.stroka)}</b><small>${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : t("pravkar")}</small></div>${nov ? `<span class="new">${t("Novo")}</span>` : ""}<button class="tri" type="button" data-prijavi="${j.id}" aria-label="${t("Prijavi ali skrij")}">•••</button></div>
    <div class="pw" data-odpri="M:${j.id}">${pic(j)}</div>
    <div class="pa">${moja ? `<button class="btn small ghost" type="button" data-take="${j.id}">${ikona("kljukica", 18, 2.6)} ${t("Javil si se")}</button>` : `<button class="btn small" type="button" data-take="${j.id}">${t("Javi se")}</button>`}
      ${j.prosnja ? "" : `<button class="ikb" type="button" data-slike="${j.id}" aria-label="${t("Prosi za več slik")}">${ikona("kamera", 24)}</button>`}</div>
    ${j.slika ? `<p class="po" data-odpri="M:${j.id}">${esc(j.opis || strokaIme(j.stroka))}</p>` : ""}
    <div class="meta pm">${esc([t(j.kdaj), j.m2 ? `~${j.m2} m²` : "", j.budget && j.budget !== "Ne vem" ? znesek(j.budget) : ""].filter(Boolean).join(" · "))}${ocenaZnak(j.lastnik, " · " + t("Stranka"))}</div>
  </article>`;
}
// Podrobnosti prostega dela.
function detM(j) {
  const moja = S.moje[j.id];
  return `${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : t("pravkar")}</div>
    <div class="pogoj"><span>${t("Kdaj")}</span><b>${esc([j.kdaj, ...(j.doma || [])].filter(Boolean).map((x) => t(x)).join(", "))}</b></div>
    ${ocenaZnak(j.lastnik) ? `<div class="pogoj"><span>${t("Stranka")}</span><b>${ocenaZnak(j.lastnik)}</b></div>` : ""}
    ${j.m2 ? `<div class="pogoj"><span>${t("Površina")}</span><b>${t("približno {0} m²", j.m2)}</b></div>` : ""}
    ${j.budget ? `<div class="pogoj"><span>${t("Okvirno plačilo")}</span><b>${esc(znesek(j.budget))}</b></div>` : ""}
    ${j.ponudb ? `<div class="meta">${t("Javili so se že {0}", mojstrovRod(j.ponudb))}</div>` : ""}
    ${moja?.status === "caka" ? `<div class="status"><span class="dot"></span>${t("Javil si se za {0}. Čakaš na stranko.", esc(opisTermina(moja.termin)))}</div><button class="btn ghost" type="button" data-take="${j.id}">${t("Spremeni termin ali ceno")}</button>`
      : `<button class="btn" type="button" data-take="${j.id}">${t("Javi se za to delo")}</button>`}
    <div class="row">${j.prosnja ? `<span class="meta">${t("Prošnja za slike je poslana")}</span>` : `<button class="link" type="button" data-slike="${j.id}">${ikona("kamera", 18)} ${t("Prosi za več slik")}</button>`}<button class="link muted" type="button" data-prijavi="${j.id}">${t("Prijavi ali skrij")}</button></div></div>`;
}
// Podrobnosti mojega termina.
function detT(j) {
  const k = S.kontakti[j.id] || {};
  return `${pic(j)}<div class="body">${tag(j.stroka)}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)}</div>
    <div class="status"><span class="dot ok"></span>${t("Tvoj termin: {0}", esc(opisTermina(j.termin)))}</div>
    ${ocenaZnak(j.lastnik) ? `<div class="pogoj"><span>${t("Stranka")}</span><b>${ocenaZnak(j.lastnik)}</b></div>` : ""}
    ${k.tel ? `<div class="row"><span class="phone">${esc(k.tel)}</span><a class="btn small" href="tel:${esc(k.tel.replace(/\s/g, ""))}">${t("Pokliči")}</a></div>` : ""}
    <button class="btn ghost" type="button" data-koledar="${j.id}">${ikona("koledar", 22)} ${t("Dodaj v koledar in opomnike")}</button>
    ${j.naPoti ? `<div class="vasa">${ikona("kljukica", 18, 3)} ${t("Stranka ve, da si na poti")}</div>` : `<button class="btn" type="button" data-napoti="${j.id}">${t("Na poti sem")}</button>`}
    <div class="row"><button class="link" type="button" data-odpovem="${j.id}">${t("Odpovej termin")}</button></div></div>`;
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
  const [tip, id] = S.det.split(":");
  const j = najdi(tip, id);
  if (!j) { d.remove(); return; }
  const sc = d.firstElementChild?.scrollTop || 0;
  d.innerHTML = `<div role="dialog" aria-label="${t("Podrobnosti")}" class="det"><button class="zapri" type="button" aria-label="${t("Zapri")}">✕</button><div class="job">${tip === "N" ? detN(j) : tip === "M" ? detM(j) : detT(j)}</div></div>`;
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
  na("[data-done]", async (b) => { await setStatus(b.dataset.done, "opravljeno"); ocenaSheet(b.dataset.done, "M"); });
  na("[data-napoti]", async (b) => {
    b.disabled = true;
    try { await call("naPoti", { id: b.dataset.napoti }); toast(t("Stranka je obveščena"), t("Ve, da si na poti.")); }
    catch (e) { b.disabled = false; toast(t("Ni uspelo"), napaka(e, t("Preveri internet in poskusi znova."))); }
  });
  na("[data-oceni]", (b) => ocenaSheet(b.dataset.oceni, prefs.role === "M" ? "N" : "M"));
  na("[data-neocenim]", (b) => { prefs.neOcenim = [...(prefs.neOcenim || []), b.dataset.neocenim].slice(-50); savePrefs(); renderM(); });
  na("[data-ocene]", (b) => oceneSheet(b.dataset.ocene));
  na("[data-cancel]", (b) => potrdiSheet(t("Izbrišem naročilo?"), b.dataset.s === "prevzeto" ? t("Mojster dobi obvestilo, da naj ne pride. Naročilo izgine.") : b.dataset.s === "odprto" ? t("Mojstri ga ne bodo več videli. Naročilo izgine.") : t("Naročilo izgine s seznama."), t("Da, izbriši"), () => izbrisiDela([b.dataset.cancel])));
  na("[data-pocisti]", () => { const ids = S.myJobs.filter((j) => j.status !== "odprto" && j.status !== "prevzeto").map((j) => j.id); potrdiSheet(t("Izbrišem vsa prejšnja naročila?"), t("Izbrisanih bo {0}.", ids.length), t("Da, izbriši vse"), () => izbrisiDela(ids)); });
  na("[data-zamenjaj]", (b) => potrdiSheet(t("Zamenjam mojstra?"), t("Temu mojstru odpoveste termin. Naročilo ostane objavljeno, druge ponudbe se vrnejo in izberete lahko drugega mojstra."), t("Da, zamenjaj"), () => odpovej(b.dataset.zamenjaj, false)));
  na("[data-koledar]", (b) => vKoledar(vsaDela(b.dataset.koledar), prefs.role));
  na("[data-prijavim]", (b) => prijaviSheet({ delo: b.dataset.prijavim, kdo: "mojster" }));
  na("[data-take]", (b) => (S.placilo?.iban && !jePreverjen(S.mojster) ? preveriSheet() : takeSheet(vsaDela(b.dataset.take))));
  na("[data-slike]", (b) => prosiSheet(b.dataset.slike));
  na("[data-odpovem]", (b) => potrdiSheet(t("Odpovem termin?"), t("Stranka dobi obvestilo, delo pa se znova odpre za druge mojstre. Za to delo se ne moreš več javiti."), t("Da, odpovej"), () => odpovej(b.dataset.odpovem, false)));
  na("[data-prijavi]", (b) => prijaviSheet({ delo: b.dataset.prijavi, kdo: "objava" }));
  // števec slik pri vrtiljaku
  root.querySelectorAll(".pic.vrti").forEach((p) => p.addEventListener("scroll", () => {
    const s = p.parentElement.querySelector(".stevec"); if (s) s.textContent = `${Math.round(p.scrollLeft / p.clientWidth) + 1}/${p.children.length}`;
  }, { passive: true }));
}
function prosiSheet(id) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="${t("Prosi za več slik")}"><h2 style="margin-top:0">${t("Prosi za več slik")}</h2>
    <p class="lead">${t("Stranka dobi obvestilo. Napiši, kaj naj slika (neobvezno).")}</p>
    <input id="msg" maxlength="140" placeholder="${t("npr. Slikajte še števec in pipo od blizu")}">
    <div class="err" id="perr" hidden></div>
    <button class="btn" type="button" id="ok">${t("Pošlji prošnjo")}</button><button class="btn ghost" type="button" id="x">${t("Prekliči")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#ok").onclick = async () => {
    const b = d.querySelector("#ok"); b.disabled = true;
    try { await call("prosiSlike", { id, sporocilo: d.querySelector("#msg").value }); d.remove(); toast(t("Prošnja je poslana"), t("Ko stranka doda slike, jih vidiš pri objavi.")); }
    catch (e) { b.disabled = false; const el = d.querySelector("#perr"); el.hidden = false; el.textContent = napaka(e, t("Ni uspelo.")); }
  };
}
/* ---------- ocene ---------- */
// Povprečje se naloži ob prvi potrebi in ostane v spominu; ob prihodu se zaslon osveži.
const zvezde = (n) => "★".repeat(n) + "☆".repeat(5 - n);
function ocenaZnak(kdo, pred = "") {
  if (!kdo) return "";
  const p = S.profili[kdo];
  if (p === undefined) {
    S.profili[kdo] = null;
    getDoc(doc(db, "profili", kdo)).then((d) => { S.profili[kdo] = d.data() || {}; if (d.data()?.st) osveziZaslon(); }).catch(() => { S.profili[kdo] = {}; });
    return "";
  }
  if (!p?.st) return "";
  return `${esc(pred)}<button class="ocena" type="button" data-ocene="${esc(kdo)}">★ ${decimalka(p.vsota / p.st)} <small>(${p.st})</small></button>`;
}
function osveziZaslon() {
  if (document.activeElement?.matches("input,select,textarea")) return;
  if (prefs.role === "N") renderN(); else if (prefs.role === "M" && S.mojster) renderM();
}
function ocenaSheet(id, smer) {
  let n = 0;
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="${t("Ocena")}"><h2 style="margin-top:0">${smer === "M" ? t("Kako ste zadovoljni z mojstrom?") : t("Kako je bilo s stranko?")}</h2>
    <p class="lead">${smer === "M" ? t("Ocena pomaga drugim izbrati dobrega mojstra.") : t("Neobvezno. Ocena pomaga drugim mojstrom.")}</p>
    <div class="zvezdice" role="radiogroup">${[1, 2, 3, 4, 5].map((i) => `<button type="button" data-z="${i}" aria-label="${t("{0} od 5", i)}">★</button>`).join("")}</div>
    <textarea id="kom" maxlength="200" rows="3" placeholder="${smer === "M" ? t("Kaj bi povedali drugim? (neobvezno)") : t("Komentar (neobvezno)")}"></textarea>
    <div class="err" id="oerr" hidden></div>
    <button class="btn" type="button" id="ok" disabled>${t("Pošlji oceno")}</button><button class="btn ghost" type="button" id="x">${smer === "M" ? t("Kasneje") : t("Ne, hvala")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelectorAll("[data-z]").forEach((b) => b.onclick = () => {
    n = +b.dataset.z;
    d.querySelectorAll("[data-z]").forEach((x) => x.classList.toggle("da", +x.dataset.z <= n));
    d.querySelector("#ok").disabled = false;
  });
  d.querySelector("#ok").onclick = async () => {
    const b = d.querySelector("#ok"); b.disabled = true;
    try {
      await call("oceni", { id, zvezdice: n, komentar: d.querySelector("#kom").value });
      d.remove(); toast(t("Hvala za oceno"), "");
      delete S.profili[smer === "M" ? vsaDela(id)?.mojster : vsaDela(id)?.lastnik];
    } catch (e) { b.disabled = false; const el = d.querySelector("#oerr"); el.hidden = false; el.textContent = napaka(e, t("Ni uspelo.")); }
  };
}
async function oceneSheet(kdo) {
  const d = document.createElement("div"); d.className = "sheet";
  const p = S.profili[kdo] || {};
  d.innerHTML = `<div role="dialog" aria-label="${t("Ocene")}"><h2 style="margin-top:0">★ ${p.st ? decimalka(p.vsota / p.st) : ""} <small class="meta">${jeSl() ? `${p.st || 0} ${p.st === 1 ? "ocena" : p.st === 2 ? "oceni" : p.st === 3 || p.st === 4 ? "ocene" : "ocen"}` : mn(p.st || 0, "ocena")}</small></h2><div id="sez" class="ocene"><div class="spin">${t("Nalagam ...")}</div></div>
    <button class="btn ghost" type="button" id="x">${t("Zapri")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  try {
    const snap = await getDocs(query(collection(db, "ocene"), where("za", "==", kdo), limit(100)));
    const sez = snap.docs.map((x) => x.data()).sort((a, b) => (b.cas?.toMillis() || 0) - (a.cas?.toMillis() || 0));
    d.querySelector("#sez").innerHTML = sez.map((o) => `<div class="ocena-v"><span class="zv">${zvezde(o.zvezdice)}</span>${o.komentar ? `<p>»${esc(o.komentar)}«</p>` : ""}<small>${esc([o.vloga === "M" ? strokaIme(o.stroka) : "", o.kraj, o.cas ? pred(o.cas.toMillis()) : ""].filter(Boolean).join(" · "))}</small></div>`).join("") || `<p class="lead">${t("Še ni ocen.")}</p>`;
  } catch (e) { d.querySelector("#sez").innerHTML = `<p class="lead">${t("Ocen ni bilo mogoče naložiti.")}</p>`; }
}
// Potrditev pred nepovratnim dejanjem (odpoved, preklic).
function potrdiSheet(naslov, besedilo, gumb, akcija) {
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="${esc(naslov)}"><h2 style="margin-top:0">${esc(naslov)}</h2><p class="lead">${esc(besedilo)}</p>
    <button class="btn danger" type="button" id="da">${esc(gumb)}</button><button class="btn ghost" type="button" id="x">${t("Ne")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#da").onclick = () => { d.remove(); akcija(); };
}
async function izbrisiDela(ids) {
  try {
    await call("izbrisiDelo", { ids });
    S.myJobs = S.myJobs.filter((j) => !ids.includes(j.id));
    document.querySelectorAll(".sheet").forEach((d) => d.remove());
    toast(ids.length > 1 ? t("Naročila so izbrisana") : t("Naročilo je izbrisano"), "");
    renderN();
  } catch (e) { toast(t("Ni uspelo"), napaka(e, t("Preverite internet in poskusite znova."))); }
}
async function odpovej(id, celo) {
  try {
    await call("odpovej", { id, celo });
    if (prefs.role === "M") toast(t("Termin je odpovedan"), t("Stranka je dobila obvestilo."));
    else toast(celo ? t("Naročilo je preklicano") : t("Termin je odpovedan"), celo ? "" : t("Naročilo je znova odprto. Izberite drugega mojstra."));
  } catch (e) { toast(t("Ni uspelo"), napaka(e, t("Preverite internet in poskusite znova."))); }
}
// Termin v Apple koledar (z opozorilom uro prej) in v Opomnike.
async function vKoledar(j, vloga) {
  if (!j || !j.termin) return;
  const naslov = vloga === "M" ? `${IME()}: ${j.opis || strokaIme(j.stroka)}` : `${IME()}: ${t("pride {0}", j.mojsterIme || t("mojster"))}`;
  const tel = vloga === "M" ? S.kontakti[j.id]?.tel : S.kontakti[j.id]?.mojsterTel;
  const opis = [j.opis || strokaIme(j.stroka), vloga === "N" ? j.mojsterFirma : "", tel ? t("Telefon: ") + tel : "", j.cena ? t("Okvirna cena: ") + j.cena : ""].filter(Boolean).join("\n");
  if (!native) return toast(t("Samo v aplikaciji"), t("Koledar deluje v aplikaciji na iPhonu."));
  try {
    const r = await FixkoKoledar.dodaj({ naslov, opis, kraj: j.kraj || "", zacetek: j.termin });
    if (r.odprto) return toast(t("Shranite termin"), t("Odprl se je koledar. Tapnite Shrani."));
    if (r.koledar || r.opomnik) toast(t("Dodano"), (r.koledar && r.opomnik ? t("v koledar in v opomnike") : r.koledar ? t("v koledar") : t("v opomnike")) + t(". Opozorilo dobite uro prej."));
    else toast(t("Ni dovoljenja"), t("Dovolite dostop v Nastavitve > {0} > Koledarji in Opomniki.", IME()));
  } catch (e) { toast(t("Ni uspelo"), t("Termina ni bilo mogoče dodati.")); }
}
function renderProfil() {
  // Osnutek obrazca ostane med ponovnimi izrisi (npr. ko pride posodobitev iz baze med tipkanjem).
  if (!S.pd || (!S.pd.dotaknjen && S.pd.izvor !== S.mojster)) {
    const m0 = S.mojster ? { ...S.mojster } : { stroke: [], regije: [] };
    S.pd = { izvor: S.mojster, dotaknjen: false, m: m0, sel: { stroke: new Set(m0.stroke), regije: new Set(m0.regije) }, novaSlika: null, soglasje: m0.pogoji === POGOJI_VERZIJA };
  }
  const { m, sel } = S.pd;
  // Država profila: Slovenija kot doslej (8-mestna davčna, slovenske regije), tuje države z DDV številko in svojimi regijami.
  const cc = drzava(), tu = cc !== "SI";
  const regije = tu ? TUJE_REGIJE[cc] || [] : regijeDrzave("SI");
  const draw = () => {
    const novaSlika = S.pd.novaSlika, soglasje = S.pd.soglasje;
    const slika = novaSlika?.url || m.slika;
    view.innerHTML = `
    ${S.mojster ? `<div class="wiz"><button class="link" type="button" id="back0">‹ ${t("Nazaj")}</button></div>` : ""}
    <h1>${S.mojster ? t("Tvoj profil") : t("Dela pridejo k tebi")}</h1>
    ${S.mojster ? "" : `<p class="lead">${t("Ko nekdo v tvoji regiji rabi tvojo stroko, dobiš obvestilo s sliko. Prevzameš delo, izbereš termin in stranko pokličeš. Stranka vidi tvojo sliko, ime in podjetje.")}</p>`}
    <label class="avatar-up" for="pf">${slika ? `<img src="${esc(slika)}" alt="${t("Tvoja slika")}">` : `<span>${kamera}</span>`}<div><b>${slika ? t("Zamenjaj sliko") : t("Dodaj svojo sliko")}</b><small>${t("Obraz, da te stranka prepozna")}</small></div></label>
    <input id="pf" type="file" accept="image/*" hidden>
    <label for="ime">${t("Ime in priimek")}</label>
    <input id="ime" maxlength="60" placeholder="${t("npr. Marko Kos")}" value="${esc(m.ime || prefs.ime)}" autocomplete="name">
    <label for="firma">${t("Podjetje")}</label>
    <input id="firma" maxlength="80" placeholder="${t("npr. Kos inštalacije, Marko Kos s.p.")}" value="${esc(m.firma || "")}" autocomplete="organization">
    ${tu ? `<label for="davcna">${t("DDV ali davčna številka podjetja")}</label>
    <input id="davcna" maxlength="20" autocapitalize="characters" placeholder="${cc === "GR" ? "EL" : cc}123456789" value="${esc(m.davcna || "")}">`
    : `<label for="davcna">${t("Davčna številka podjetja")}</label>
    <input id="davcna" inputmode="numeric" maxlength="12" placeholder="12345678" value="${esc(m.davcna || "")}">`}
    <label for="mtel">${t("Telefon")}</label>
    <input id="mtel" type="tel" inputmode="tel" maxlength="20" placeholder="${telPrimer()}" value="${esc(m.tel || "")}">
    <label>${t("Tvoja stroka")}</label>
    <div class="mreza" id="st">${STROKE.map(([k, n]) => `<button type="button" class="chip ikchip" data-k="${k}" aria-pressed="${sel.stroke.has(k)}">${ikona(k, 24)}<span>${t(n)}</span></button>`).join("")}</div>
    <label>${t("Kje delaš")}${tu ? ` <span class="neobv">${esc(imeDrzave(cc))}</span>` : ""}</label>
    <div class="chips" id="rg"><button type="button" class="chip" data-k="${vsaKljuc(cc)}" aria-pressed="${sel.regije.has(vsaKljuc(cc))}">${esc(regijaIme(vsaKljuc(cc)))}</button>${regije.map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${sel.regije.has(k)}">${esc(n)}</button>`).join("")}</div>
    <label class="check"><input type="checkbox" id="sog"${soglasje ? " checked" : ""}><span>${t("Potrjujem, da dejavnost opravljam kot registriran samostojni podjetnik ali gospodarska družba, da imam potrebna dovoljenja in da sprejemam")} <a class="link" href="${stran("pogoji.html")}#mojstri">${t("pogoje za mojstre")}</a>.</span></label>
    <div class="err" id="err" hidden></div>
    <button class="btn" type="button" id="save">${S.mojster ? t("Shrani") : t("Naprej")}</button>
    ${S.mojster ? `<button class="btn ghost" type="button" id="back">${t("Nazaj")}</button>` : ""}`;
    const keep = () => {
      for (const [k, el] of [["ime", "ime"], ["firma", "firma"], ["davcna", "davcna"], ["tel", "mtel"]]) m[k] = document.getElementById(el).value;
      S.pd.soglasje = document.getElementById("sog").checked;
      S.pd.dotaknjen = true;
    };
    view.querySelectorAll("#st .chip").forEach((b) => (b.onclick = () => { keep(); const k = b.dataset.k; sel.stroke.has(k) ? sel.stroke.delete(k) : sel.stroke.add(k); draw(); }));
    view.querySelectorAll("#rg .chip").forEach((b) => (b.onclick = () => { keep(); const k = b.dataset.k; sel.regije.has(k) ? sel.regije.delete(k) : sel.regije.add(k); draw(); }));
    document.getElementById("pf").onchange = (e) => {
      const fl = e.target.files[0]; if (!fl) return; keep();
      shrink(fl, 640).then((r) => { S.pd.novaSlika = r; draw(); }).catch(() => toast(t("Slike ni bilo mogoče odpreti"), t("Poskusi z drugo sliko.")));
    };
    if (S.mojster) for (const id of ["back", "back0"]) document.getElementById(id).onclick = () => { S.urejam = false; S.pd = null; renderM(); window.scrollTo(0, 0); };
    document.getElementById("save").onclick = async () => {
      keep();
      const { novaSlika, soglasje } = S.pd;
      const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; el.scrollIntoView({ block: "center", behavior: "smooth" }); };
      const regijeOk = [...sel.regije].filter((k) => drzavaRegije(k) === cc);
      const davcnaOk = (v) => (tu ? veljavnaTuja(v, cc) : veljavnaDavcna(v));
      if (!novaSlika && !m.slika) return err(t("Dodaj svojo sliko. Stranke raje odprejo vrata nekomu, ki ga prepoznajo."));
      if (m.ime.trim().split(/\s+/).length < 2) return err(t("Vpiši ime in priimek."));
      if (m.firma.trim().length < 3) return err(t("Vpiši ime podjetja, kot je v poslovnem registru."));
      const brezDavcne = testnaFirma(m.firma) && !davcnaOk(m.davcna); // testni mojster
      if (!brezDavcne && !davcnaOk(m.davcna)) return err(tu ? t("DDV številka ni pravilna, npr. {0}123456789.", cc === "GR" ? "EL" : cc) : t("Davčna številka ni pravilna. Ima 8 števk, npr. 12345678."));
      if (!veljavenTel(m.tel)) return err(t("Vpiši telefonsko številko, npr. {0}.", telPrimer()));
      if (!sel.stroke.size) return err(t("Izberi vsaj eno stroko."));
      if (!regijeOk.length) return err(t("Izberi, kje delaš."));
      if (!soglasje) return err(t("Za objavo profila potrdi pogoje za mojstre."));
      const btn = document.getElementById("save"); btn.disabled = true; btn.textContent = t("Shranjujem ...");
      try {
        let slikaUrl = m.slika;
        if (novaSlika) {
          const r = ref(storage, `profil/${uid}/${Date.now()}.jpg`);
          await uploadBytes(r, novaSlika.blob, { contentType: "image/jpeg" });
          slikaUrl = await getDownloadURL(r);
        }
        const push = await enablePush();
        const data = {
          ime: m.ime.trim().replace(/\s+/g, " ").slice(0, 60), firma: m.firma.trim().replace(/\s+/g, " ").slice(0, 80), davcna: brezDavcne ? "" : tu ? cistaTuja(m.davcna, cc) : cistaDavcna(m.davcna),
          slika: slikaUrl, tel: m.tel.trim(), stroke: [...sel.stroke], regije: regijeOk, pogoji: POGOJI_VERZIJA, posodobljeno: serverTimestamp()
        };
        if (push) data.push = push;
        // Tuji mojster: država, jezik in časovni pas za obvestila; slovenski profil ostane brez teh polj.
        if (tu) data.drzava = cc; else if (S.mojster?.drzava) data.drzava = deleteField();
        Object.assign(data, jezikInPas());
        await setDoc(doc(db, "mojstri", uid), data, { merge: true });
        prefs.ime = data.ime; savePrefs();
        S.urejam = false; S.pd = null;
        if (!push) toast(t("Obvestila so izklopljena"), t("Vklopi jih v nastavitvah telefona, sicer ne izveš za nova dela."));
      } catch (e) { console.error(e); btn.disabled = false; btn.textContent = t("Shrani"); err(t("Shranjevanje ni uspelo. Poskusi znova.")); }
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
  const trial = p.trialEligible && p.trialDays ? t("Prvih {0} dni brezplačno", p.trialDays >= 28 ? "30" : p.trialDays) : t("Začni");
  view.innerHTML = `
  <h1>${t("Še zadnji korak")}</h1>
  <p class="lead">${t("Z naročnino vidiš vsa prosta dela v svoji stroki in dobiš obvestilo za vsako novo.")}</p>
  <div class="plan">
    <div class="price">${esc(cena)} <small>${t("/ mesec")}</small></div>
    <ul><li>${t("Obvestila o novih delih s sliko")}</li><li>${t("Termin potrdiš z enim klikom")}</li><li>${t("Direkten telefon stranke")}</li><li>${t("Brez provizije in brez plačila na delo")}</li></ul>
    <div class="err" id="err" hidden></div>
    <button class="btn" id="buy" type="button">${p.product === false ? t("Začni preizkus") : esc(trial)}</button>
    ${ios ? `<button class="btn ghost" id="restore" type="button">${t("Obnovi nakup")}</button>` : ""}
    <p class="note">${p.product === false ? (ios ? t("Naročnina v App Store še ni odprta.") : t("Naročnina še ni odprta.")) + " " + t("Med preizkusom je {0} za mojstre brezplačen.", IME()) : t("Naročnina se podaljša vsak mesec, dokler je ne prekličeš v nastavitvah Apple ID. Prekličeš kadarkoli.")}</p>
  </div>
  <div class="foot"><button class="link" id="edit" type="button">${t("Uredi profil")}</button></div>`;
  document.getElementById("edit").onclick = () => { S.urejam = true; renderM(); };
  const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; };
  const done = async (s) => {
    S.pay = s;
    if (await sendJws(s)) { toast(t("Naročnina je aktivna"), t("Obvestila za nova dela so vklopljena.")); return; }
    if (s.result === "cancelled") return;
    if (s.result === "pending") return err(t("Nakup čaka na potrditev."));
    err(t("Nakupa nismo mogli potrditi. Poskusi Obnovi nakup."));
  };
  document.getElementById("buy").onclick = async () => {
    if (p.product === false) {
      try { await call("narocnina", { preizkus: true }); toast(t("Preizkus je vklopljen"), t("Vidiš prosta dela in dobivaš obvestila.")); }
      catch (e) { err(e.code === "functions/failed-precondition" ? t("Preizkus ni več na voljo. Naročnina bo kmalu odprta.") : t("Ni uspelo. Preveri internet in poskusi znova.")); }
      return;
    }
    try { await done(await FixkoPay.buy()); } catch (e) { err(jeSl() ? e.message || "Nakup ni uspel." : t("Nakup ni uspel.")); }
  };
  document.getElementById("restore")?.addEventListener("click", async () => {
    try { const s = await FixkoPay.restore(); s.active ? await done(s) : err(t("Aktivne naročnine nismo našli.")); } catch (e) { err(t("Obnova ni uspela.")); }
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
    d.innerHTML = `<div role="dialog" aria-label="${t("Izberi termin")}"><h2 style="margin-top:0">${t("Kdaj lahko prideš?")}</h2><div class="meta">${t("Stranka želi: {0}", esc([j.kdaj, ...(j.doma || [])].filter(Boolean).map((x) => t(x)).join(", ")))}</div>
      <label>${t("Dan")}</label><div class="chips">${dni.filter((x) => prosteUre(x).length).map((x) => `<button type="button" class="chip" data-d="${x.iso}" aria-pressed="${x.iso === dan.iso}">${x.ime} <span class="meta">${x.datum}</span></button>`).join("")}</div>
      <label>${t("Ura")}</label><div class="chips">${prosteUre(dan).map((u) => `<button type="button" class="chip" data-u="${u}" aria-pressed="${u === ura}">${u}</button>`).join("")}</div>
      ${zCeno || cena ? `<label for="cena">${t("Tvoja okvirna cena")} <span class="neobv">${t("neobvezno")}</span></label>
      <input id="cena" maxlength="40" placeholder="${t("npr. okoli 80 €")}" value="${esc(cena)}">` : `<button class="link lok" type="button" id="zc">+ ${t("Dodaj okvirno ceno")}</button>`}
      <div class="err" id="terr" hidden></div>
      <button class="btn" type="button" id="ok">${t("Pošlji stranki")}</button>
      <button class="btn ghost" type="button" id="x">${t("Prekliči")}</button><p class="note">${t("Ko te stranka sprejme, dobiš njen telefon.")}</p></div>`;
    const ci = d.querySelector("#cena"); if (ci) ci.oninput = (e) => { cena = e.target.value; };
    d.querySelector("#zc")?.addEventListener("click", () => { zCeno = true; draw(); d.querySelector("#cena").focus(); });
    d.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { dan = dni.find((x) => x.iso === b.dataset.d); ura = prosteUre(dan)[0]; draw(); }));
    d.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => { ura = b.dataset.u; draw(); }));
    d.querySelector("#x").onclick = () => d.remove();
    d.querySelector("#ok").onclick = async () => {
      const [h, m] = ura.split(":").map(Number);
      const termin = new Date(dan.d.getFullYear(), dan.d.getMonth(), dan.d.getDate(), h, m).getTime();
      const b = d.querySelector("#ok"); b.disabled = true; b.textContent = t("Pošiljam ...");
      try {
        await call("ponudi", { id: j.id, termin, cena: cena.trim() });
        d.remove();
        toast(t("Poslano stranki"), t("Javil si se za {0}. Ko te stranka sprejme, dobiš obvestilo in njen telefon.", opisTermina(termin)));
        renderM();
      } catch (e) {
        b.disabled = false; b.textContent = t("Pošlji stranki");
        const el = d.querySelector("#terr"); el.hidden = false;
        el.textContent = e.code === "functions/already-exists" ? t("Stranka je medtem že izbrala mojstra.") : e.code === "functions/permission-denied" ? t("Naročnina ni aktivna.") : e.code === "functions/failed-precondition" ? napaka(e, t("Ni uspelo.")) : t("Ni uspelo. Preveri internet in poskusi znova.");
      }
    };
  };
  draw(); d.onclick = (e) => { if (e.target === d) d.remove(); }; document.body.appendChild(d);
}
let feedUnsub = null, feedKey = "";
function watchMojster() {
  // Račun za potrditveno nakazilo; dokler ni vpisan, potrditev podjetja ni potrebna.
  unsub.push(onSnapshot(doc(db, "nastavitve", "placilo"), (d) => { S.placilo = d.data() || null; if (prefs.role === "M" && !document.activeElement?.matches("input,select,textarea")) renderM(); }, () => {}));
  unsub.push(onSnapshot(doc(db, "profili", uid), (d) => { S.profili[uid] = d.data() || {}; if (prefs.role === "M" && S.mojster && d.data()?.st) osveziZaslon(); }, () => {}));
  unsub.push(onSnapshot(doc(db, "mojstri", uid), (d) => {
    S.mojster = d.exists() ? d.data() : null;
    // Tuji mojster vidi samo dela svoje države; slovenski kot doslej.
    const md = S.mojster?.drzava || "SI";
    const key = aktiven() ? (S.mojster.stroke || []).slice(0, 30).join(",") + (md === "SI" ? "" : "|" + md) : "";
    if (key !== feedKey) {
      feedKey = key; feedUnsub?.(); feedUnsub = null; S.feed = [];
      if (key) {
        const [str, dz] = key.split("|");
        const pogoji = [where("stroka", "in", str.split(",")), where("status", "==", "odprto"), ...(dz ? [where("drzava", "==", dz)] : [])];
        feedUnsub = onSnapshot(query(collection(db, "dela"), ...pogoji, orderBy("ustvarjeno", "desc"), limit(60)), (snap) => {
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
  d.innerHTML = `<div role="dialog" aria-label="${t("Prijava")}"><h2 style="margin-top:0">${kdo === "mojster" ? t("Prijavi mojstra") : t("Prijavi objavo")}</h2>
    <p class="lead">${t("Zakaj? Prijavo pregledamo v 24 urah.")}${kdo === "objava" ? " " + t("Objava se ti takoj skrije.") : ""}</p>
    <div class="mreza" style="grid-template-columns:1fr">${RAZLOGI.map((r) => `<button type="button" class="chip" data-r="${esc(r)}">${esc(t(r))}</button>`).join("")}</div>
    <button class="btn ghost" type="button" id="x">${t("Prekliči")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelectorAll("[data-r]").forEach((b) => (b.onclick = async () => {
    d.remove();
    if (kdo === "objava") { prefs.skrita = [...new Set([...(prefs.skrita || []), delo])].slice(-200); savePrefs(); }
    try { await setDoc(doc(collection(db, "prijave")), { delo, kdo, razlog: b.dataset.r, prijavil: uid, ustvarjeno: serverTimestamp() }); } catch (e) { console.error(e); }
    toast(t("Hvala za prijavo"), t("Pregledali jo bomo v 24 urah."));
    render();
  }));
}

/* ---------- nastavitve ---------- */
function settingsSheet() {
  const d = document.createElement("div"); d.className = "sheet";
  // Jezik (privzeto iz naprave) in država (regije, davčna, potrditev podjetja).
  const drzave = [...DRZAVE].sort((a, b) => (a === drzava() ? -1 : b === drzava() ? 1 : imeDrzave(a).localeCompare(imeDrzave(b), jz())));
  d.innerHTML = `<div role="dialog" aria-label="${t("Nastavitve")}"><h2 style="margin-top:0">${t("Nastavitve")}</h2>
    ${FIXKO ? `<label for="jzk">${t("Jezik")}</label>
    <select id="jzk"><option value="">${t("Samodejno (po državi)")}</option>${JEZIKI.map((j) => `<option value="${j}"${prefs.jezik === j ? " selected" : ""}>${IMENA_JEZIKOV[j]}</option>`).join("")}</select>
    <label for="drz">${t("Država")}</label>
    <select id="drz">${drzave.map((c) => `<option value="${c}"${c === drzava() ? " selected" : ""}>${esc(imeDrzave(c))}</option>`).join("")}</select>` : ""}
    ${S.mojster ? `<button class="btn ghost" type="button" id="prof">${t("Uredi profil mojstra")}</button>` : ""}
    ${S.mojster && ios && !BREZPLACNO ? `<button class="btn ghost" type="button" id="man">${t("Upravljaj naročnino")}</button>` : ""}
    <button class="btn ghost" type="button" id="obv">${t("Vklopi obvestila")}</button>
    <a class="btn ghost" href="${stran("zasebnost.html")}">${t("Zasebnost in pogoji")}</a>
    ${imaNastavitveOglasov() ? `<button class="btn ghost" type="button" id="ogl">${t("Nastavitve oglasov")}</button>` : ""}
    <button class="btn danger" type="button" id="del">${t("Izbriši moje podatke")}</button>
    <div id="potrdi" hidden><p>${t("Izbrišemo tvoj profil, tvoja dela in slike. Naročnino v App Store prekličeš posebej. Tega ni mogoče razveljaviti.")}</p><button class="btn danger" type="button" id="del2">${t("Da, izbriši vse")}</button></div>
    <button class="btn" type="button" id="x">${t("Zapri")}</button>
    <p class="note"><button class="link muted" type="button" id="skrb">${t("Za skrbnike")}</button></p></div>`;
  d.querySelector("#jzk")?.addEventListener("change", (e) => { prefs.jezik = e.target.value; Preferences.set({ key: "fixko", value: JSON.stringify(prefs) }).finally(() => location.reload()); });
  d.querySelector("#drz")?.addEventListener("change", (e) => {
    prefs.drzava = e.target.value; prefs.regija = ""; prefs.kraj = ""; prefs.krajRocno = false; draft.urejamKraj = true;
    // Samodejni jezik sledi državi: naložimo znova v jeziku nove države.
    if (!prefs.jezik) { Preferences.set({ key: "fixko", value: JSON.stringify(prefs) }).finally(() => location.reload()); return; }
    savePrefs();
    S.pd = null; d.remove(); render();
    toast(t("Država je spremenjena"), imeDrzave(prefs.drzava));
  });
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  d.querySelector("#x").onclick = () => d.remove();
  d.querySelector("#skrb").onclick = () => { d.remove(); skrbnikSheet(); };
  d.querySelector("#prof")?.addEventListener("click", () => { d.remove(); S.urejam = true; setRole("M"); });
  d.querySelector("#man")?.addEventListener("click", () => FixkoPay.manage().catch(() => {}));
  d.querySelector("#ogl")?.addEventListener("click", () => { d.remove(); nastavitveOglasov(); });
  d.querySelector("#obv").onclick = async () => {
    const tk = await enablePush();
    if (!tk) return toast(t("Obvestila so izklopljena"), android && !window.FIXKO_PUSH ? t("Na Androidu bodo obvestila na voljo v naslednji verziji.") : t("Vklopi jih v nastavitvah telefona: {0} > Obvestila.", IME()));
    if (S.mojster) await setDoc(doc(db, "mojstri", uid), { push: tk }, { merge: true }).catch(() => {});
    toast(t("Obvestila so vklopljena"), "");
  };
  d.querySelector("#del").onclick = () => { d.querySelector("#potrdi").hidden = false; d.querySelector("#del").hidden = true; };
  d.querySelector("#del2").onclick = async () => {
    try { await call("izbrisi", {}); } catch (e) { return toast(t("Brisanje ni uspelo"), t("Poskusi znova.")); }
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
// EPC QR (GiroCode, SEPA): bančne aplikacije v evro državah iz njega izpolnijo nakazilo.
function epcQr(pl, sklic) {
  return ["BCD", "002", "1", "SCT", pl.bic || "", ascii(pl.prejemnik, 70), pl.iban.replace(/\s/g, ""), "EUR0.01", "", "", `${sklic} Popravko`].join("\n");
}
async function preveriSheet() {
  const pl = S.placilo; if (!pl?.iban) return;
  const nacin = nacinPotrditve(S.mojster);
  if (nacin !== "upn") return preveriTujeSheet(nacin);
  const m = S.mojster || {}, sklic = sklicIz(uid);
  const d = document.createElement("div"); d.className = "sheet";
  const vrstica = (n, v) => `<div class="pogoj kopiraj" data-kopiraj="${esc(v)}"><span>${n}</span><b>${esc(v)}</b></div>`;
  d.innerHTML = `<div role="dialog" aria-label="${t("Potrdi podjetje")}"><h2 style="margin-top:0">${t("Potrdi podjetje")}</h2>
    <div class="zakaj"><b>${t("Zakaj 1 cent?")}</b>
      <p>${t("Davčno številko lahko vpiše kdorkoli, tudi tujo. Z računa podjetja pa lahko nakaže samo njegov lastnik. Ko na izpisku vidimo, da je cent prišel s TRR podjetja {0}, vemo, da je podjetje res tvoje.", `<b>${esc(m.firma)}</b>`)}</p>
      <p>${t("Tako stranke dobijo samo prave mojstre, ti pa oznako <b>»Podjetje preverjeno«</b>, ki ji stranke bolj zaupajo. To ni plačilo za Popravko, ampak samo enkratna potrditev.")}</p></div>
    <p class="lead">${t("Nakaži <b>0,01 €</b> z računa podjetja, ne z osebnega. Nakažeš lahko tudi ob vikendu, izberi takojšnje plačilo.")}</p>
    <div class="qr"><canvas id="qr"></canvas><small>${t("Skeniraj v svoji banki (UPN QR)")}</small></div>
    ${vrstica(t("Prejemnik"), pl.prejemnik)}${vrstica("IBAN", pl.iban)}${vrstica(t("Znesek"), "0,01 €")}${vrstica(t("Sklic"), sklic)}${vrstica(t("Namen"), "Potrditev podjetja Popravko")}
    <p class="hint">${t("Tapni vrstico, da jo kopiraš. Sklic je pomemben, po njem nakazilo povežemo s tvojim profilom.")}</p>
    <div class="err" id="perr" hidden></div>
    <button class="btn" type="button" id="ok">${m.preverjanje?.cakam ? t("Nakazal sem znova") : t("Nakazal sem")}</button></div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  QRCode.toCanvas(d.querySelector("#qr"), [{ data: new TextEncoder().encode(upnQr(pl, sklic)), mode: "byte" }], { version: 15, errorCorrectionLevel: "M", margin: 2, width: 240 }).catch((e) => { console.error(e); d.querySelector(".qr").hidden = true; });
  d.querySelectorAll("[data-kopiraj]").forEach((r) => (r.onclick = () => { navigator.clipboard?.writeText(r.dataset.kopiraj.replace(" €", "")).then(() => toast(t("Kopirano"), r.dataset.kopiraj)).catch(() => {}); }));
  d.querySelector("#ok").onclick = async () => {
    const b = d.querySelector("#ok"); b.disabled = true;
    try { await call("nakazal", {}); d.remove(); toast(t("Hvala"), t("Ko nakazilo prispe, te potrdimo in dobiš obvestilo. Običajno v nekaj minutah.")); }
    catch (e) { b.disabled = false; const el = d.querySelector("#perr"); el.hidden = false; el.textContent = napaka(e, t("Ni uspelo.")); }
  };
}
// Tuje podjetje: v evro državah nakazilo 0,01 € (SEPA, sklic v namen plačila), drugje pregled (EU z DDV številko v VIES).
function preveriTujeSheet(nacin) {
  const pl = S.placilo, m = S.mojster || {}, sklic = sklicIz(uid), cc = m.drzava || drzava();
  const d = document.createElement("div"); d.className = "sheet";
  const vrstica = (n, v) => `<div class="pogoj kopiraj" data-kopiraj="${esc(v)}"><span>${n}</span><b>${esc(v)}</b></div>`;
  const nakazilo = `<p class="lead">${t("Nakaži <b>0,01 €</b> z računa podjetja, ne z osebnega (SEPA nakazilo v evrih).")}</p>
    <div class="qr"><canvas id="qr"></canvas><small>${t("Skeniraj v svoji banki (EPC QR / GiroCode)")}</small></div>
    ${vrstica(t("Prejemnik"), pl.prejemnik)}${vrstica("IBAN", pl.iban)}${pl.bic ? vrstica("BIC", pl.bic) : ""}${vrstica(t("Znesek"), "0,01 €")}${vrstica(t("Namen plačila"), sklic + " Popravko")}
    <p class="hint">${t("Tapni vrstico, da jo kopiraš. V namen plačila obvezno napiši {0}, po tem nakazilo povežemo s tvojim profilom.", `<b>${esc(sklic)}</b>`)}</p>`;
  const vies = EU.has(cc);
  // Potrdilo o registraciji (obrtno dovoljenje, izpis iz registra): strežnik ga samodejno prebere in primerja z registrom.
  const dokument = `<div class="dok"><b>${t("1. Potrdilo o registraciji")}</b>
      <p class="hint">${t("Slikaj ali naloži obrtno dovoljenje ali izpis iz poslovnega registra (npr. Gewerbeschein). Preberemo ga samodejno in preverimo v registru.")}</p>
      <label class="btn ${m.dokument ? "ghost" : ""}" for="dokf">${ikona("kamera", 22)} ${m.dokument ? t("Naloži drugo potrdilo") : t("Naloži potrdilo")}</label><input id="dokf" type="file" accept="image/*,application/pdf" hidden>
      <p class="hint" id="dokst">${m.dokument ? ikona("kljukica", 16, 3) + " " + t("Potrdilo je naloženo.") : ""}</p></div>`;
  d.innerHTML = `<div role="dialog" aria-label="${t("Potrdi podjetje")}"><h2 style="margin-top:0">${t("Potrdi podjetje")}</h2>
    <div class="zakaj"><b>${t("Zakaj potrditev?")}</b>
      <p>${t("DDV številko lahko vpiše kdorkoli. Zato preverimo, da je podjetje {0} res tvoje.", `<b>${esc(m.firma)}</b>`)}</p>
      <p>${t("Tako stranke dobijo samo prave mojstre, ti pa oznako <b>»Podjetje preverjeno«</b>, ki ji stranke bolj zaupajo. Potrditev je brezplačna.")}</p></div>
    ${dokument}
    ${nacin === "sepa" ? `<b class="korak">${t("2. Nakazilo 0,01 €")}</b>` + nakazilo + `<div class="err" id="perr" hidden></div><button class="btn" type="button" id="ok">${m.preverjanje?.cakam ? t("Nakazal sem znova") : t("Nakazal sem")}</button>`
      : `<p class="lead">${vies ? t("Preverimo tvojo DDV številko {0} v evropskem sistemu VIES in podatke podjetja. Morda te pokličemo na {1}.", `<b>${esc(m.davcna)}</b>`, esc(m.tel)) : t("Podjetje {0} pregledamo ročno v poslovnem registru. Morda te pokličemo na {1}.", `<b>${esc(m.firma)}</b>`, esc(m.tel))}</p>
        <p class="note">${t("Običajno v 1 do 2 delovnih dneh.")}</p>
        <div class="err" id="perr" hidden></div>
        <details class="stara"><summary>${t("Ima podjetje račun v evrih? Potrdi takoj z nakazilom 0,01 €")}</summary>${nakazilo}<button class="btn ghost" type="button" id="ok">${t("Nakazal sem")}</button></details>`}</div>`;
  document.body.appendChild(d);
  d.onclick = (e) => { if (e.target === d) d.remove(); };
  QRCode.toCanvas(d.querySelector("#qr"), epcQr(pl, sklic), { errorCorrectionLevel: "M", margin: 2, width: 240 }).catch((e) => { console.error(e); d.querySelector(".qr").hidden = true; });
  d.querySelectorAll("[data-kopiraj]").forEach((r) => (r.onclick = () => { navigator.clipboard?.writeText(r.dataset.kopiraj.replace(" €", "")).then(() => toast(t("Kopirano"), r.dataset.kopiraj)).catch(() => {}); }));
  const poslji = (ime, uspeh) => async (e) => {
    const b = e.target; b.disabled = true;
    try { await call(ime, {}); d.remove(); toast(t("Hvala"), uspeh); }
    catch (x) { b.disabled = false; const el = d.querySelector("#perr"); el.hidden = false; el.textContent = napaka(x, t("Ni uspelo.")); }
  };
  d.querySelector("#ok").onclick = poslji("nakazal", t("Ko nakazilo prispe, te potrdimo in dobiš obvestilo. Iz tujine lahko traja do 2 delovna dneva."));
  d.querySelector("#pregled")?.addEventListener("click", poslji("pregledPodjetja", t("Podjetje pregledamo v 1 do 2 delovnih dneh. Ko je potrjeno, dobiš obvestilo.")));
  d.querySelector("#dokf").onchange = async (e) => {
    const f = e.target.files?.[0], st = d.querySelector("#dokst"), el = d.querySelector("#perr"), lbl = d.querySelector("label[for=dokf]");
    if (!f) return;
    el.hidden = true; lbl.classList.add("dis"); st.textContent = t("Nalagam in preverjam potrdilo …");
    try {
      // Slike pomanjšamo (besedilo ostane berljivo), PDF naložimo, kot je.
      const pdf = f.type === "application/pdf";
      if (pdf && f.size > 10 * 1024 * 1024) throw new Error(t("Datoteka je prevelika (največ 10 MB)."));
      const blob = pdf ? f : (await shrink(f, 2200)).blob;
      const pot = `dokumenti/${uid}/${Date.now()}.${pdf ? "pdf" : "jpg"}`, r = ref(storage, pot);
      await uploadBytes(r, blob, { contentType: pdf ? "application/pdf" : "image/jpeg" });
      const x = await call("dokumentPodjetja", { pot, url: await getDownloadURL(r) });
      d.remove();
      toast(t("Hvala"), x.potrjen ? t("Podjetje je potrjeno. Zdaj se lahko javljaš na dela.")
        : nacin === "sepa" ? t("Potrdilo je naloženo. Ko prispe še nakazilo 0,01 €, te potrdimo.") : t("Podjetje pregledamo v 1 do 2 delovnih dneh. Ko je potrjeno, dobiš obvestilo."));
    } catch (x) { lbl.classList.remove("dis"); st.textContent = ""; el.hidden = false; el.textContent = napaka(x, t("Ni uspelo.")); }
    e.target.value = "";
  };
}
// Fixko zazna drugo državo kot v nastavitvah: enkrat vpraša, ali preklopi (država, regija, kraj in samodejni jezik).
function vprasajDrzavo() {
  const nova = S.novaDrzava, stara = drzava();
  S.novaDrzava = "";
  if (!nova || nova === stara) return;
  prefs.vprasano = nova; savePrefs();
  const d = document.createElement("div"); d.className = "sheet";
  d.innerHTML = `<div role="dialog" aria-label="${t("Nova država")}"><h2 style="margin-top:0">${t("Nova država")}</h2>
    <p class="lead">${t("Telefon je zdaj v drugi državi. Preklopim Fixko na {0}?", `<b>${esc(imeDrzave(nova))}</b>`)}</p>
    <button class="btn" type="button" id="da">${t("Preklopi na {0}", esc(imeDrzave(nova)))}</button>
    <button class="btn ghost" type="button" id="ne">${t("Ostani: {0}", esc(imeDrzave(stara)))}</button></div>`;
  document.body.appendChild(d);
  const zapri = () => d.remove();
  d.onclick = (e) => { if (e.target === d) zapri(); };
  d.querySelector("#ne").onclick = zapri;
  d.querySelector("#da").onclick = () => {
    prefs.drzava = nova; prefs.regija = ""; prefs.kraj = ""; prefs.krajRocno = false;
    Preferences.set({ key: "fixko", value: JSON.stringify(prefs) }).finally(() => location.reload());
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
        ${m.drzava && m.drzava !== "SI" ? `<div class="pogoj"><span>Država</span><b>${esc(m.drzava)}${m.nacin === "vies" || m.nacin === "rocno" ? " · ročni pregled" : " · nakazilo"}</b></div>` : ""}
        ${m.vies ? `<div class="pogoj"><span>VIES</span><b>${m.vies.veljavna ? "veljavna" : "NI veljavna"}${m.vies.ime ? ": " + esc(m.vies.ime) : ""}${m.vies.naslov ? ", " + esc(m.vies.naslov) : ""}</b></div>` : ""}
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
  zacniOglase();
  if (S.novaDrzava) setTimeout(vprasajDrzavo, 900);
  // Lokacija ob vsaki uporabi (če je dovoljena in kraja niste vpisali sami).
  if (!prefs.krajRocno) najdiLokacijo(false);
  if (!cfg) { render(); return; }
  try { await initFb(); } catch (e) {
    console.error(e); view.innerHTML = `<div class="empty">${t("Ni povezave. Preverite internet in odprite {0} znova.", IME())}</div>`; return;
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
