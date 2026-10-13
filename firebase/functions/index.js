// Fixko strežnik:
// - novoDelo: ko stranka odda delo, obvesti mojstre te stroke v tej regiji (z aktivno naročnino).
// - prevzemi: mojster prevzame delo in potrdi termin; stranka dobi obvestilo, mojster njen telefon.
// - narocnina: preveri Applov podpisan nakup (JWS) in mojstru odklene dela.
// - izbrisi: izbriše uporabnikove podatke (zahteva App Store).
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const http2 = require("http2");
const crypto = require("crypto");
const { opisTermina, strokaIme, veljavnaDavcna, testnaFirma } = require("./besedila");

admin.initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });
const db = admin.firestore();

const BUNDLE_ID = process.env.APNS_TOPIC || "si.fixko.app";
const PRODUCT_ID = process.env.PRODUCT_ID || "si.fixko.app.mojster.mesecno";
const PREIZKUS_DNI = 30;

/* ---------- obvestila (APNs) ---------- */
function apnsJwt() {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const key = (process.env.APNS_KEY_P8 || "").replace(/\\n/g, "\n");
  const sig = crypto.sign("sha256", Buffer.from(header + "." + claims), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return header + "." + claims + "." + sig;
}
// TestFlight in App Store gradnje imajo produkcijske žetone; za Xcode gradnje bi rabili sandbox.
function sendApns(tokens, title, body, data = {}) {
  tokens = [...new Set(tokens.filter(Boolean))];
  if (!tokens.length || !process.env.APNS_KEY_P8) return Promise.resolve([]);
  const jwt = apnsJwt();
  const client = http2.connect("https://api.push.apple.com");
  client.on("error", () => {});
  const payload = JSON.stringify({ aps: { alert: { title, body }, sound: "default" }, ...data });
  const one = (token) => new Promise((resolve) => {
    const req = client.request({
      ":method": "POST", ":path": "/3/device/" + token,
      authorization: "bearer " + jwt, "apns-topic": BUNDLE_ID, "apns-push-type": "alert", "apns-priority": "10"
    });
    let status = 0, out = "";
    req.on("response", (h) => { status = h[":status"]; });
    req.on("data", (c) => { out += c; });
    req.on("end", () => resolve({ token, status, data: out }));
    req.on("error", (e) => resolve({ token, status: 0, data: String(e) }));
    req.end(payload);
  });
  return Promise.all(tokens.map(one)).finally(() => client.close());
}

/* ---------- novo delo → obvestila mojstrom ---------- */
exports.novoDelo = onDocumentCreated("dela/{id}", async (event) => {
  const delo = event.data?.data();
  if (!delo) return;
  const now = Timestamp.now();
  const snap = await db.collection("mojstri").where("stroke", "array-contains", delo.stroka).get();
  const ujemajo = snap.docs.filter((d) => {
    const m = d.data();
    return d.id !== delo.lastnik && m.narocninaDo && m.narocninaDo.toMillis() > now.toMillis()
      && (m.regije || []).some((r) => r === "vsa" || r === delo.regija);
  });
  await event.data.ref.update({ obvesceni: ujemajo.length });
  const title = "Novo delo: " + (delo.opis || strokaIme(delo.stroka));
  const body = delo.kraj + " · " + delo.kdaj;
  const res = await sendApns(ujemajo.map((d) => d.data().push), title, body, { vloga: "M", delo: event.params.id });
  // Neveljavne žetone (aplikacija izbrisana) pobrišemo.
  const slabi = res.filter((r) => r.status === 410 || (r.status === 400 && /BadDeviceToken/.test(r.data))).map((r) => r.token);
  await Promise.all(ujemajo.filter((d) => slabi.includes(d.data().push)).map((d) => d.ref.update({ push: FieldValue.delete() })));
  console.log("novo delo", event.params.id, delo.stroka, delo.regija, "mojstrov", ujemajo.length, "poslano", res.map((r) => r.status).join(","));
});

/* ---------- prevzem dela ---------- */
exports.prevzemi = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || "");
  const termin = Number(req.data?.termin);
  if (!id || !Number.isFinite(termin)) throw new HttpsError("invalid-argument", "Manjka delo ali termin.");
  if (termin < Date.now() - 3600e3 || termin > Date.now() + 15 * 864e5) throw new HttpsError("invalid-argument", "Termin ni veljaven.");
  const mRef = db.doc("mojstri/" + uid);
  const dRef = db.doc("dela/" + id);
  const kRef = db.doc("dela/" + id + "/zasebno/kontakt");
  const { delo, kontakt, mojster } = await db.runTransaction(async (t) => {
    const [m, d, k] = await Promise.all([t.get(mRef), t.get(dRef), t.get(kRef)]);
    if (!m.exists || !(m.data().narocninaDo?.toMillis() > Date.now())) throw new HttpsError("permission-denied", "Naročnina ni aktivna.");
    const md = m.data();
    if (!md.slika || !md.firma || !(veljavnaDavcna(md.davcna) || testnaFirma(md.firma)) || !md.pogoji) throw new HttpsError("failed-precondition", "Dopolni profil: slika, podjetje in davčna številka.");
    if (!d.exists) throw new HttpsError("not-found", "Dela ni več.");
    if (d.data().status !== "odprto") throw new HttpsError("already-exists", "Delo je že prevzeto.");
    if (d.data().lastnik === uid) throw new HttpsError("failed-precondition", "Svojega dela ne moreš prevzeti.");
    t.update(dRef, {
      status: "prevzeto", mojster: uid, mojsterIme: md.ime, mojsterFirma: md.firma, mojsterDavcna: md.davcna, mojsterSlika: md.slika,
      termin, prevzeto: FieldValue.serverTimestamp()
    });
    t.set(kRef, { mojsterTel: m.data().tel }, { merge: true });
    return { delo: d.data(), kontakt: k.exists ? k.data() : {}, mojster: m.data() };
  });
  if (kontakt.push) {
    await sendApns([kontakt.push], mojster.ime + " pride " + opisTermina(termin), (delo.opis || strokaIme(delo.stroka)) + ". Pred prihodom vas pokliče.", { vloga: "N", delo: id });
  }
  return { tel: kontakt.tel || "" };
});

/* ---------- naročnina ---------- */
// Applov korenski certifikat (Apple Root CA - G3), s katerim je podpisana veriga vsakega nakupa.
let appleRoot = null;
async function korenski() {
  if (appleRoot) return appleRoot;
  const r = await fetch("https://www.apple.com/certificateauthority/AppleRootCA-G3.cer");
  if (!r.ok) throw new Error("Apple Root CA: " + r.status);
  appleRoot = new crypto.X509Certificate(Buffer.from(await r.arrayBuffer()));
  return appleRoot;
}
// OID-ja, ki ju ima Applova veriga za App Store nakupe (list in vmesni certifikat).
const OID_LIST = Buffer.from("060a2a864886f76364060b01", "hex"); // 1.2.840.113635.100.6.11.1
const OID_VMESNI = Buffer.from("060a2a864886f76364060201", "hex"); // 1.2.840.113635.100.6.2.1
async function preveriJws(jws) {
  const [h, p, s] = String(jws).split(".");
  if (!h || !p || !s) throw new Error("JWS ni pravilne oblike");
  const header = JSON.parse(Buffer.from(h, "base64url"));
  if (header.alg !== "ES256" || !Array.isArray(header.x5c) || header.x5c.length !== 3) throw new Error("glava JWS");
  const [leaf, mid, root] = header.x5c.map((c) => new crypto.X509Certificate(Buffer.from(c, "base64")));
  const apple = await korenski();
  if (!root.raw.equals(apple.raw)) throw new Error("koren ni Applov");
  if (!mid.verify(root.publicKey) || !leaf.verify(mid.publicKey)) throw new Error("veriga ni veljavna");
  if (!mid.checkIssued(root) || !leaf.checkIssued(mid)) throw new Error("izdajatelj");
  if (!leaf.raw.includes(OID_LIST) || !mid.raw.includes(OID_VMESNI)) throw new Error("certifikat ni za App Store");
  const zdaj = Date.now();
  for (const c of [leaf, mid]) if (new Date(c.validTo).getTime() < zdaj - 365 * 864e5) throw new Error("certifikat potekel");
  const ok = crypto.verify("sha256", Buffer.from(h + "." + p), { key: leaf.publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url"));
  if (!ok) throw new Error("podpis ni veljaven");
  return JSON.parse(Buffer.from(p, "base64url"));
}

exports.narocnina = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const mRef = db.doc("mojstri/" + uid);
  const m = await mRef.get();
  if (!m.exists) throw new HttpsError("failed-precondition", "Najprej izpolni profil.");

  // Testni mojster lastnikov (firma Sraufnciger): brezplačno za eno leto, brez nakupa.
  if (req.data?.testni) {
    if (!testnaFirma(m.data().firma)) throw new HttpsError("permission-denied", "Ni testni račun.");
    const narocninaDo = Timestamp.fromMillis(Date.now() + 365 * 864e5);
    await mRef.update({ narocninaDo });
    return { do: narocninaDo.toMillis(), testni: true };
  }

  // Preizkus med TestFlight testiranjem (dokler naročnina v App Store ni odprta).
  if (req.data?.preizkus) {
    if (process.env.PREIZKUS !== "1") throw new HttpsError("failed-precondition", "Preizkus ni na voljo.");
    if (m.data().preizkusPorabljen && !(m.data().narocninaDo?.toMillis() > Date.now())) throw new HttpsError("failed-precondition", "Preizkus je že porabljen.");
    const narocninaDo = Timestamp.fromMillis(Date.now() + PREIZKUS_DNI * 864e5);
    await mRef.update({ narocninaDo, preizkusPorabljen: true });
    return { do: narocninaDo.toMillis(), preizkus: true };
  }

  let t;
  try { t = await preveriJws(req.data?.jws); } catch (e) {
    console.warn("jws", uid, e.message);
    throw new HttpsError("invalid-argument", "Nakupa ni bilo mogoče preveriti.");
  }
  if (t.bundleId !== BUNDLE_ID || t.productId !== PRODUCT_ID) throw new HttpsError("invalid-argument", "Napačen izdelek.");
  if (t.revocationDate) throw new HttpsError("permission-denied", "Naročnina je preklicana.");
  const doMs = Number(t.expiresDate);
  if (!(doMs > Date.now())) throw new HttpsError("permission-denied", "Naročnina je potekla.");
  // Ena naročnina (Apple ID) velja za enega mojstra; ob novi namestitvi se prenese na nov račun.
  const nRef = db.doc("narocnine/" + t.originalTransactionId);
  await db.runTransaction(async (tx) => {
    const n = await tx.get(nRef);
    const prej = n.exists ? n.data().uid : null;
    if (prej && prej !== uid) tx.set(db.doc("mojstri/" + prej), { narocninaDo: Timestamp.fromMillis(0) }, { merge: true });
    tx.set(nRef, { uid, do: doMs, okolje: t.environment || "", posodobljeno: FieldValue.serverTimestamp() });
    tx.update(mRef, { narocninaDo: Timestamp.fromMillis(doMs), transakcija: t.originalTransactionId });
  });
  return { do: doMs };
});

/* ---------- brisanje podatkov ---------- */
exports.izbrisi = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const dela = await db.collection("dela").where("lastnik", "==", uid).get();
  const batch = db.batch();
  for (const d of dela.docs) {
    batch.delete(d.ref.collection("zasebno").doc("kontakt"));
    batch.delete(d.ref);
  }
  batch.delete(db.doc("mojstri/" + uid));
  await batch.commit();
  // Prevzeta dela tega mojstra ostanejo strankam vidna, brez telefona mojstra.
  const prevzeta = await db.collection("dela").where("mojster", "==", uid).get();
  await Promise.all(prevzeta.docs.map((d) => d.ref.collection("zasebno").doc("kontakt").set({ mojsterTel: FieldValue.delete() }, { merge: true })));
  await Promise.all(prevzeta.docs.map((d) => d.ref.update({ mojsterSlika: FieldValue.delete(), mojsterDavcna: FieldValue.delete() })));
  await admin.storage().bucket().deleteFiles({ prefix: "slike/" + uid + "/" }).catch((e) => console.warn("slike", e.message));
  await admin.storage().bucket().deleteFiles({ prefix: "profil/" + uid + "/" }).catch((e) => console.warn("profil", e.message));
  await admin.auth().deleteUser(uid).catch(() => {});
  return { ok: true };
});
