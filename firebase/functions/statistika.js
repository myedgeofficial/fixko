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
  let token;
  do {
    const r = await admin.auth().listUsers(1000, token);
    for (const x of r.users) {
      const nastal = Date.parse(x.metadata.creationTime) || 0;
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
  d.stranke = stranke.size; d.strankeOdObjave = strankeOdObjave.size;
  return { uporabniki: u, mojstri: m, dela: d, objava: OBJAVA, ponudbe: ponudbe.data().count, ocene: ocene.data().count, cas: now };
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
