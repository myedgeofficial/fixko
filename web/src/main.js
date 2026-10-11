import { Capacitor, registerPlugin } from "@capacitor/core";
import { PushNotifications } from "@capacitor/push-notifications";
import { Preferences } from "@capacitor/preferences";
import { initializeApp } from "firebase/app";
import { initializeAuth, indexedDBLocalPersistence, signInAnonymously, onAuthStateChanged, connectAuthEmulator } from "firebase/auth";
import {
  initializeFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit,
  onSnapshot, serverTimestamp, connectFirestoreEmulator
} from "firebase/firestore";
import { getStorage, ref, uploadBytes, getDownloadURL, connectStorageEmulator } from "firebase/storage";
import { getFunctions, httpsCallable, connectFunctionsEmulator } from "firebase/functions";
import { STROKE, REGIJE, KDAJ, strokaIme, regijaIme, dnevi, prosteUre, opisTermina, pred, veljavenTel } from "./data.js";

const FixkoPay = registerPlugin("FixkoPay");
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
const S = { myJobs: [], kontakti: {}, feed: [], taken: [], mojster: null, pay: null, seen: new Set(), firstFeed: true };
let draft = { cat: "", kdaj: KDAJ[0], photo: null, blob: null, opis: "" };
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
function setRole(r) { prefs.role = r; savePrefs(); render(); }
function render() {
  document.getElementById("tabN").setAttribute("aria-pressed", prefs.role === "N");
  document.getElementById("tabM").setAttribute("aria-pressed", prefs.role === "M");
  prefs.role === "N" ? renderN() : renderM();
}

const icon = (s = 48) => `<svg width="${s}" height="${s}" viewBox="0 0 28 28" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 9h4l2-3h8l2 3h4v13H4z"/><circle cx="14" cy="15" r="4"/></svg>`;
const pic = (j) => `<div class="pic">${j.slika ? `<img src="${esc(j.slika)}" alt="" loading="lazy">` : icon(56)}</div>`;
const opt = (list, sel, prazno) => (prazno ? `<option value="">${prazno}</option>` : "") + list.map(([k, n]) => `<option value="${k}"${k === sel ? " selected" : ""}>${n}</option>`).join("");

/* =================== STRANKA =================== */
function renderN() {
  view.innerHTML = `
  <h1>Poslikaj, kaj je treba narediti</h1>
  <p class="lead">Mojster v tvoji okolici dobi obvestilo, izbere termin in te pokliče. Za stranke je Fixko brezplačen.</p>
  <form id="f" novalidate>
    <label class="shot" for="file">${draft.photo ? `<img src="${draft.photo}" alt="Tvoja slika">` : `${icon()}<span>Poslikaj</span><small>ali izberi sliko iz galerije</small>`}</label>
    <input id="file" type="file" accept="image/*" hidden>
    <label>Kdo ti pomaga?</label>
    <div class="chips" id="cats">${STROKE.map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${draft.cat === k}">${n}</button>`).join("")}</div>
    <label for="opis">Kaj je narobe <span class="meta">(ni obvezno)</span></label>
    <input id="opis" maxlength="200" placeholder="npr. Menjava tuš kabine" value="${esc(draft.opis)}">
    <label for="regija">Regija</label>
    <select id="regija">${opt(REGIJE, prefs.regija, "Izberi regijo")}</select>
    <label for="kraj">Kraj ali naslov</label>
    <input id="kraj" maxlength="80" placeholder="npr. Maribor, Tabor" value="${esc(prefs.kraj)}" autocomplete="address-level2">
    <label for="tel">Tvoja telefonska</label>
    <input id="tel" type="tel" inputmode="tel" maxlength="20" placeholder="041 123 456" value="${esc(prefs.tel)}" autocomplete="tel">
    <label>Kdaj ti paše?</label>
    <div class="chips" id="kdaj">${KDAJ.map((k) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${draft.kdaj === k}">${k}</button>`).join("")}</div>
    <div class="err" id="err" hidden></div>
    <button class="btn" type="submit" id="send">Pošlji mojstrom</button>
    <p class="note">Številko vidi samo mojster, ki delo prevzame.</p>
  </form>
  <h2>Moja dela</h2>
  <div class="list">${S.myJobs.length ? S.myJobs.map(cardN).join("") : `<div class="empty">Tu vidiš, kateri mojster pride in kdaj.</div>`}</div>`;

  const f = document.getElementById("f");
  const keep = () => { draft.opis = f.opis.value; prefs.regija = f.regija.value; prefs.kraj = f.kraj.value; prefs.tel = f.tel.value; };
  f.querySelectorAll("#cats .chip").forEach((b) => (b.onclick = () => { keep(); draft.cat = b.dataset.k; renderN(); }));
  f.querySelectorAll("#kdaj .chip").forEach((b) => (b.onclick = () => { keep(); draft.kdaj = b.dataset.k; renderN(); }));
  document.getElementById("file").onchange = (e) => {
    const fl = e.target.files[0]; if (!fl) return; keep();
    shrink(fl).then(({ url, blob }) => { draft.photo = url; draft.blob = blob; renderN(); }).catch(() => toast("Slike ni bilo mogoče odpreti", "Poskusi z drugo sliko."));
  };
  view.querySelectorAll("[data-done]").forEach((b) => (b.onclick = () => setStatus(b.dataset.done, "opravljeno")));
  view.querySelectorAll("[data-cancel]").forEach((b) => (b.onclick = () => setStatus(b.dataset.cancel, "preklicano")));
  f.onsubmit = async (e) => {
    e.preventDefault(); keep(); savePrefs();
    const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; };
    if (!draft.blob) return err("Dodaj sliko, da mojster vidi, za kaj gre.");
    if (!draft.cat) return err("Izberi, kdo ti pomaga.");
    if (!prefs.regija) return err("Izberi regijo.");
    if (!prefs.kraj.trim()) return err("Vpiši kraj ali naslov.");
    if (!veljavenTel(prefs.tel)) return err("Vpiši telefonsko številko, npr. 041 123 456.");
    const btn = document.getElementById("send"); btn.disabled = true; btn.textContent = "Pošiljam ...";
    try {
      const id = doc(collection(db, "dela")).id;
      const r = ref(storage, `slike/${uid}/${id}.jpg`);
      await uploadBytes(r, draft.blob, { contentType: "image/jpeg" });
      const slika = await getDownloadURL(r);
      const push = await enablePush();
      await setDoc(doc(db, "dela", id, "zasebno", "kontakt"), { lastnik: uid, tel: prefs.tel.trim(), push: push || null });
      await setDoc(doc(db, "dela", id), {
        lastnik: uid, stroka: draft.cat, opis: draft.opis.trim().slice(0, 200), regija: prefs.regija, kraj: prefs.kraj.trim().slice(0, 80),
        kdaj: draft.kdaj, slika, status: "odprto", ustvarjeno: serverTimestamp()
      });
      draft = { cat: draft.cat, kdaj: draft.kdaj, photo: null, blob: null, opis: "" };
      renderN();
      toast("Poslano mojstrom", "Ko delo kdo prevzame, ti pokažemo, kdo pride in kdaj.");
    } catch (x) {
      console.error(x);
      btn.disabled = false; btn.textContent = "Pošlji mojstrom";
      err("Pošiljanje ni uspelo. Preveri internet in poskusi znova.");
    }
  };
}
function cardN(j) {
  const k = S.kontakti[j.id] || {};
  let st;
  if (j.status === "opravljeno") st = `<div class="status"><span class="dot off"></span>Opravljeno</div>`;
  else if (j.status === "preklicano") st = `<div class="status"><span class="dot off"></span>Preklicano</div>`;
  else if (j.status === "prevzeto") st = `<div class="status"><span class="dot ok"></span>${esc(j.mojsterIme || "Mojster")} pride ${esc(opisTermina(j.termin))}</div>
    ${k.mojsterTel ? `<div class="row"><span class="phone">${esc(k.mojsterTel)}</span><a class="btn small" href="tel:${esc(k.mojsterTel.replace(/\s/g, ""))}">Pokliči</a></div>` : ""}
    <div class="row"><button class="btn small ghost" type="button" data-done="${j.id}">Delo je opravljeno</button></div>`;
  else st = `<div class="status"><span class="dot"></span>${j.obvesceni ? `Obvestili smo ${mojstrov(j.obvesceni)}, čakam ...` : "Čakam, da se oglasi mojster ..."}</div>
    <div class="row"><button class="link" type="button" data-cancel="${j.id}">Prekliči</button></div>`;
  return `<div class="job">${pic(j)}<div class="body"><span class="tag">${strokaIme(j.stroka)}</span><h3>${esc(j.opis || strokaIme(j.stroka))}</h3><div class="meta">${esc(j.kraj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</div>${st}</div></div>`;
}
const mojstrov = (n) => n + (n % 100 === 1 || n % 100 === 2 ? " mojstra" : n % 100 === 3 || n % 100 === 4 ? " mojstre" : " mojstrov");
async function setStatus(id, status) {
  try { await updateDoc(doc(db, "dela", id), { status }); } catch (e) { toast("Ni uspelo", "Preveri internet in poskusi znova."); }
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
  if (!S.mojster || S.urejam) return renderProfil();
  if (!aktiven()) return renderPaywall();
  const prosta = S.feed.filter((j) => j.status === "odprto" && (S.mojster.regije || []).some((r) => r === "vsa" || r === j.regija));
  view.innerHTML = `
  <div class="bar"><span>${(S.mojster.stroke || []).map(strokaIme).join(", ")} · ${(S.mojster.regije || []).map(regijaIme).join(", ")}</span><button class="link" id="edit" type="button">Uredi</button></div>
  ${S.taken.filter((j) => j.status === "prevzeto").length ? `<h2>Moja dela</h2><div class="list">${S.taken.filter((j) => j.status === "prevzeto").map(cardTaken).join("")}</div>` : ""}
  <h2>Prosta dela</h2>
  <div class="list">${prosta.length ? prosta.map(cardM).join("") : `<div class="empty">Ta hip ni prostih del v tvoji stroki in regiji. Ko se kaj sprosti, dobiš obvestilo.</div>`}</div>`;
  document.getElementById("edit").onclick = () => { S.urejam = true; renderM(); };
  view.querySelectorAll("[data-take]").forEach((b) => (b.onclick = () => takeSheet(prosta.find((j) => j.id === b.dataset.take))));
}
function cardM(j) {
  const nov = !S.seen.has(j.id) && j.ustvarjeno && Date.now() - j.ustvarjeno.toMillis() < 3600e3;
  return `<div class="job">${pic(j)}<div class="body"><span class="tag">${strokaIme(j.stroka)}</span>${nov ? '<span class="new">Novo</span>' : ""}<h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)} · ${esc(j.kdaj)} · ${j.ustvarjeno ? pred(j.ustvarjeno.toMillis()) : "pravkar"}</div>
    <button class="btn" type="button" data-take="${j.id}" style="margin-top:12px">Prevzemi delo</button></div></div>`;
}
function cardTaken(j) {
  const k = S.kontakti[j.id] || {};
  return `<div class="job">${pic(j)}<div class="body"><span class="tag">${strokaIme(j.stroka)}</span><h3>${esc(j.opis || strokaIme(j.stroka))}</h3>
    <div class="meta">${esc(j.kraj)}</div>
    <div class="status"><span class="dot ok"></span>Tvoj termin: ${esc(opisTermina(j.termin))}</div>
    ${k.tel ? `<div class="row"><span class="phone">${esc(k.tel)}</span><a class="btn small" href="tel:${esc(k.tel.replace(/\s/g, ""))}">Pokliči</a></div>` : ""}</div></div>`;
}
function renderProfil() {
  const m = S.mojster || { stroke: [], regije: [] };
  const sel = { stroke: new Set(m.stroke), regije: new Set(m.regije) };
  const draw = () => {
    view.innerHTML = `
    <h1>${S.mojster ? "Tvoj profil" : "Dela pridejo k tebi"}</h1>
    ${S.mojster ? "" : `<p class="lead">Ko nekdo v tvoji regiji rabi tvojo stroko, dobiš obvestilo s sliko. Prevzameš delo, izbereš termin in stranko pokličeš.</p>`}
    <label for="ime">Ime ali podjetje</label>
    <input id="ime" maxlength="60" placeholder="npr. Marko Kos, s.p." value="${esc(m.ime || prefs.ime)}">
    <label for="mtel">Telefon</label>
    <input id="mtel" type="tel" inputmode="tel" maxlength="20" placeholder="041 123 456" value="${esc(m.tel || "")}">
    <label>Tvoja stroka</label>
    <div class="chips" id="st">${STROKE.map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${sel.stroke.has(k)}">${n}</button>`).join("")}</div>
    <label>Kje delaš</label>
    <div class="chips" id="rg"><button type="button" class="chip" data-k="vsa" aria-pressed="${sel.regije.has("vsa")}">Vsa Slovenija</button>${REGIJE.map(([k, n]) => `<button type="button" class="chip" data-k="${k}" aria-pressed="${sel.regije.has(k)}">${n}</button>`).join("")}</div>
    <div class="err" id="err" hidden></div>
    <button class="btn" type="button" id="save">${S.mojster ? "Shrani" : "Naprej"}</button>
    ${S.mojster ? `<button class="btn ghost" type="button" id="back">Nazaj</button>` : ""}`;
    const keep = () => { m.ime = document.getElementById("ime").value; m.tel = document.getElementById("mtel").value; };
    view.querySelectorAll("#st .chip").forEach((b) => (b.onclick = () => { keep(); const k = b.dataset.k; sel.stroke.has(k) ? sel.stroke.delete(k) : sel.stroke.add(k); draw(); }));
    view.querySelectorAll("#rg .chip").forEach((b) => (b.onclick = () => { keep(); const k = b.dataset.k; sel.regije.has(k) ? sel.regije.delete(k) : sel.regije.add(k); draw(); }));
    if (S.mojster) document.getElementById("back").onclick = () => { S.urejam = false; renderM(); };
    document.getElementById("save").onclick = async () => {
      keep();
      const err = (t) => { const el = document.getElementById("err"); el.textContent = t; el.hidden = false; };
      if (!m.ime.trim()) return err("Vpiši ime ali podjetje.");
      if (!veljavenTel(m.tel)) return err("Vpiši telefonsko številko, npr. 041 123 456.");
      if (!sel.stroke.size) return err("Izberi vsaj eno stroko.");
      if (!sel.regije.size) return err("Izberi, kje delaš.");
      const push = await enablePush();
      try {
        const data = { ime: m.ime.trim().slice(0, 60), tel: m.tel.trim(), stroke: [...sel.stroke], regije: [...sel.regije], posodobljeno: serverTimestamp() };
        if (push) data.push = push;
        await setDoc(doc(db, "mojstri", uid), data, { merge: true });
        prefs.ime = data.ime; savePrefs();
        S.urejam = false;
        if (!push) toast("Obvestila so izklopljena", "Vklopi jih v Nastavitvah iPhona, sicer ne izveš za nova dela.");
      } catch (e) { console.error(e); err("Shranjevanje ni uspelo. Poskusi znova."); }
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
  const d = document.createElement("div"); d.className = "sheet";
  const draw = () => {
    d.innerHTML = `<div role="dialog" aria-label="Izberi termin"><h2 style="margin-top:0">Kdaj prideš?</h2><div class="meta">${esc(j.opis || strokaIme(j.stroka))}, ${esc(j.kraj)} · stranki paše: ${esc(j.kdaj)}</div>
      <label>Dan</label><div class="chips">${dni.filter((x) => prosteUre(x).length).map((x) => `<button type="button" class="chip" data-d="${x.iso}" aria-pressed="${x.iso === dan.iso}">${x.ime} <span class="meta">${x.datum}</span></button>`).join("")}</div>
      <label>Ura</label><div class="chips">${prosteUre(dan).map((u) => `<button type="button" class="chip" data-u="${u}" aria-pressed="${u === ura}">${u}</button>`).join("")}</div>
      <div class="err" id="terr" hidden></div>
      <button class="btn" type="button" id="ok">Prevzemi in potrdi termin</button><button class="btn ghost" type="button" id="x">Prekliči</button></div>`;
    d.querySelectorAll("[data-d]").forEach((b) => (b.onclick = () => { dan = dni.find((x) => x.iso === b.dataset.d); ura = prosteUre(dan)[0]; draw(); }));
    d.querySelectorAll("[data-u]").forEach((b) => (b.onclick = () => { ura = b.dataset.u; draw(); }));
    d.querySelector("#x").onclick = () => d.remove();
    d.querySelector("#ok").onclick = async () => {
      const [h, m] = ura.split(":").map(Number);
      const termin = new Date(dan.d.getFullYear(), dan.d.getMonth(), dan.d.getDate(), h, m).getTime();
      const b = d.querySelector("#ok"); b.disabled = true; b.textContent = "Potrjujem ...";
      try {
        const r = await call("prevzemi", { id: j.id, termin });
        S.kontakti[j.id] = { tel: r.tel };
        d.remove();
        toast("Delo je tvoje", `Stranka vidi, da prideš ${opisTermina(termin)}. Pokliči jo.`);
        renderM();
      } catch (e) {
        b.disabled = false; b.textContent = "Prevzemi in potrdi termin";
        const t = d.querySelector("#terr"); t.hidden = false;
        t.textContent = e.code === "functions/already-exists" ? "To delo je medtem prevzel drug mojster." : e.code === "functions/permission-denied" ? "Naročnina ni aktivna." : "Ni uspelo. Preveri internet in poskusi znova.";
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
function shrink(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      const s = Math.min(1, 1280 / Math.max(im.width, im.height));
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
  if (!cfg) { view.innerHTML = `<div class="empty">Strežnik še ni povezan.</div>`; return; }
  try { await initFb(); } catch (e) {
    console.error(e); view.innerHTML = `<div class="empty">Ni povezave. Preveri internet in odpri Fixko znova.</div>`; return;
  }
  render();
  watchMine();
  watchMojster();
  // Naročnina: ob vsakem zagonu potrdimo strežniku, da velja (podaljšanja, obnovitve).
  S.pay = await payStatus();
  if (S.pay.active) await sendJws(S.pay);
  if (native) FixkoPay.addListener("change", async (s) => { S.pay = s; await sendJws(s); if (prefs.role === "M") renderM(); });
  if (prefs.role === "M") renderM();
  // Mojster: osveži žeton za obvestila (iOS ga lahko zamenja).
  if (S.mojster) enablePush().then((t) => { if (t && t !== S.mojster?.push) setDoc(doc(db, "mojstri", uid), { push: t }, { merge: true }).catch(() => {}); });
})();
