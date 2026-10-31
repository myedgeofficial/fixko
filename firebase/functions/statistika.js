// Statistika za zasebno nadzorno ploščo (nakupko-8ad19.web.app): samo seštevki, brez imen in telefonov.
// Dostop: Firebase ID žeton projekta nakupko-8ad19 z enim od lastniških e-naslovov.
const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { jePreverjen } = require("./besedila");

const LASTNIKA = ["teo.simonic7@gmail.com", "urska.repusic@gmail.com"];
const IZVORI = ["https://nakupko-8ad19.web.app", "https://nakupko-8ad19.firebaseapp.com"];
const DAN = 86400000;
// Popravko je v App Storu od 27. 10. 2026; prej so bili samo testni računi (TestFlight, preizkusi).
const OBJAVA = Date.parse("2026-10-27T00:00:00+01:00");

// Žeton preverimo z javnimi ključi projekta nakupko-8ad19 (poverilnice tega projekta niso potrebne).
const nakupko = () => admin.apps.find((a) => a.name === "nakupko") || admin.initializeApp({ projectId: "nakupko-8ad19" }, "nakupko");
const ljDan = (ms) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Europe/Ljubljana" });
const ms = (t) => (t && t.toMillis ? t.toMillis() : 0);

async function zberi() {
  const db = admin.firestore(), now = Date.now();
  const u = { skupaj: 0, novi7: 0, novi30: 0, aktivni1: 0, aktivni7: 0, aktivni30: 0, noviNaDan: {}, aktivniNaDan: {}, odObjave: 0 };
  const nastali = new Map();
  let token;
  do {
    const r = await admin.auth().listUsers(1000, token);
    for (const x of r.users) {
      if (x.email) continue; // skrbniki (prijava z e-pošto na strani pregled) niso uporabniki aplikacije
      const nastal = Date.parse(x.metadata.creationTime) || 0;
      nastali.set(x.uid, nastal);
      const zadnjic = Date.parse(x.metadata.lastRefreshTime || x.metadata.lastSignInTime || x.metadata.creationTime) || 0;
      u.skupaj++;
      if (nastal >= OBJAVA) u.odObjave++;
      if (now - nastal < 7 * DAN) u.novi7++;
      if (now - nastal < 30 * DAN) { u.novi30++; const d = ljDan(nastal); u.noviNaDan[d] = (u.noviNaDan[d] || 0) + 1; }
      if (now - zadnjic < DAN) u.aktivni1++;
      if (now - zadnjic < 7 * DAN) u.aktivni7++;
      if (now - zadnjic < 30 * DAN) u.aktivni30++;
    }
    token = r.pageToken;
  } while (token);

  const [mojstri, dela, ponudbe, ocene] = await Promise.all([
    db.collection("mojstri").select("firma", "davcna", "preverjeno").get(),
    db.collection("dela").select("status", "ustvarjeno", "lastnik").get(),
    db.collection("ponudbe").count().get(),
    db.collection("ocene").count().get()
  ]);
  const m = { skupaj: mojstri.size, preverjeni: 0, odObjave: 0 };
  mojstri.forEach((d) => { if (jePreverjen(d.data())) m.preverjeni++; if (ms(d.createTime) >= OBJAVA) m.odObjave++; });
  const d = { skupaj: dela.size, po: {}, novi30: 0, naDan: {}, odObjave: 0 };
  const stranke = new Set(), strankeOdObjave = new Set();
  dela.forEach((x) => {
    stranke.add(x.get("lastnik"));
    if (ms(x.get("ustvarjeno")) >= OBJAVA) { d.odObjave++; strankeOdObjave.add(x.get("lastnik")); }
    const s = x.get("status") || "odprto";
    d.po[s] = (d.po[s] || 0) + 1;
    const t = ms(x.get("ustvarjeno"));
    if (t && now - t < 30 * DAN) { d.novi30++; const k = ljDan(t); d.naDan[k] = (d.naDan[k] || 0) + 1; }
  });
  // Ljudje, ki so v aplikaciji kaj naredili (oddali delo ali izpolnili profil mojstra); anonimni računi brez dejanj (odprtja, ponovne namestitve, testi) ne štejejo.
  const ljudje = new Set([...stranke, ...mojstri.docs.map((x) => x.id)].filter(Boolean));
  u.ljudje = ljudje.size;
  u.ljudjeOdObjave = [...ljudje].filter((id) => (nastali.get(id) || 0) >= OBJAVA).length;
  d.stranke = stranke.size; d.strankeOdObjave = strankeOdObjave.size;
  return { uporabniki: u, mojstri: m, dela: d, objava: OBJAVA, ponudbe: ponudbe.data().count, ocene: ocene.data().count, cas: now };
}

// Podrobna analitika za stats.remako.si: dela po aplikaciji, stroki in stanju, mojstri po stroki, opravljena dela in ocene po mojstrih.
// Fixko = delo ali mojster v tuji državi (regija »de-by«, drzava ≠ SI), Popravko = Slovenija.
async function analitika() {
  const db = admin.firestore(), { strokaIme } = require("./besedila");
  const [mojstri, dela, ponudbe, ocene, profili] = await Promise.all([
    db.collection("mojstri").select("ime", "firma", "davcna", "preverjeno", "stroke", "drzava", "slika").get(),
    db.collection("dela").select("status", "ustvarjeno", "stroka", "regija", "mojster", "budget").get(),
    db.collection("ponudbe").select("mojster", "status").get(),
    db.collection("ocene").select("za", "vloga", "zvezdice", "stroka").get(),
    db.collection("profili").select("vsota", "st").get()
  ]);
  const app = (tuja) => (tuja ? "Fixko" : "Popravko");
  const pristej = (o, k, n = 1) => { o[k] = (o[k] || 0) + n; };
  const D = { skupaj: dela.size, poAplikaciji: {}, poStroki: {}, poStanju: {}, strokaAplikacija: {} };
  const poMojstru = new Map();
  const mj = (uid) => poMojstru.get(uid) || poMojstru.set(uid, { prevzeta: 0, opravljena: 0, ponudbe: 0, sprejete: 0, stroke: {} }).get(uid);
  dela.forEach((x) => {
    const d = x.data(), a = app(String(d.regija || "").includes("-")), s = strokaIme(d.stroka || "drugo"), st = d.status || "odprto";
    pristej(D.poAplikaciji, a); pristej(D.poStroki, s); pristej(D.poStanju, st);
    D.strokaAplikacija[s] = D.strokaAplikacija[s] || {}; pristej(D.strokaAplikacija[s], a);
    if (d.mojster) { const m = mj(d.mojster); if (st === "opravljeno") { m.opravljena++; pristej(m.stroke, s); } else if (st === "prevzeto") m.prevzeta++; }
  });
  ponudbe.forEach((x) => { const p = x.data(); if (!p.mojster) return; const m = mj(p.mojster); m.ponudbe++; if (["sprejeto", "sprejeta"].includes(p.status)) m.sprejete++; });
  const O = { skupaj: 0, vsota: 0, porazdelitev: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }, poStroki: {} };
  ocene.forEach((x) => {
    const o = x.data();
    if (o.vloga !== "M" || !(o.zvezdice >= 1)) return; // samo ocene mojstrov (stranka oceni mojstra)
    O.skupaj++; O.vsota += o.zvezdice; pristej(O.porazdelitev, o.zvezdice);
    const s = strokaIme(o.stroka || "drugo"); O.poStroki[s] = O.poStroki[s] || { st: 0, vsota: 0 }; O.poStroki[s].st++; O.poStroki[s].vsota += o.zvezdice;
  });
  const ocena = new Map(profili.docs.map((p) => [p.id, p.data()]));
  const M = { skupaj: mojstri.size, poAplikaciji: {}, poStroki: {}, preverjeni: 0 };
  const seznam = mojstri.docs.map((x) => {
    const m = x.data(), a = app(!!m.drzava && m.drzava !== "SI"), st = poMojstru.get(x.id) || { prevzeta: 0, opravljena: 0, ponudbe: 0, sprejete: 0 }, p = ocena.get(x.id) || {};
    pristej(M.poAplikaciji, a); if (jePreverjen(m)) M.preverjeni++;
    for (const k of m.stroke || []) pristej(M.poStroki, strokaIme(k));
    return { uid: x.id, ime: m.ime || "", firma: m.firma || "", slika: m.slika || "", aplikacija: a, drzava: m.drzava || "SI", preverjen: jePreverjen(m),
      stroke: (m.stroke || []).map((k) => strokaIme(k)), ...st, ocen: p.st || 0, ocena: p.st ? Math.round((p.vsota / p.st) * 10) / 10 : null };
  });
  return { dela: D, mojstri: M, ocene: { ...O, povprecje: O.skupaj ? Math.round((O.vsota / O.skupaj) * 100) / 100 : null }, seznam, cas: Date.now() };
}

exports.statistika = onRequest({ cors: IZVORI, region: "europe-west1", timeoutSeconds: 120, memory: "512MiB" }, async (req, res) => {
  try {
    const t = String(req.get("authorization") || "").replace(/^Bearer /, "");
    const z = await nakupko().auth().verifyIdToken(t);
    if (!z.email_verified || !LASTNIKA.includes(String(z.email || "").toLowerCase())) return res.status(403).json({ napaka: "ni dostopa" });
    res.json(await zberi());
  } catch (e) {
    console.error("statistika", e.message);
    res.status(e.code && String(e.code).startsWith("auth/") ? 401 : 500).json({ napaka: e.message });
  }
});
exports.zberi = zberi;
exports.analitika = analitika;
