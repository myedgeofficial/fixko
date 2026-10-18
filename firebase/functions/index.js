// Popravko strežnik:
// - novoDelo: ko stranka odda delo, obvesti mojstre te stroke v tej regiji (z aktivno naročnino).
// - ponudi / odgovori: mojster se javi s terminom, stranka ga sprejme ali zavrne; po sprejemu si izmenjata telefon.
// - prevzemi: stari neposredni prevzem (za starejše gradnje).
// - narocnina: preveri Applov podpisan nakup (JWS) in mojstru odklene dela.
// - izbrisi: izbriše uporabnikove podatke (zahteva App Store).
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const http2 = require("http2");
const crypto = require("crypto");
const { opisTermina, strokaIme, veljavnaDavcna, testnaFirma, sklicIz, jePreverjen } = require("./besedila");
const banka = require("./banka");

admin.initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });
const db = admin.firestore();

const BUNDLE_ID = process.env.APNS_TOPIC || "si.fixko.app";
const PRODUCT_ID = process.env.PRODUCT_ID || "si.fixko.app.mojster.mesecno";
const PREIZKUS_DNI = 30;
// Zaenkrat je Popravko brezplačen za vse mojstre (BREZPLACNO=0 vklopi naročnino).
const BREZPLACNO = process.env.BREZPLACNO !== "0";

/* ---------- obvestila (APNs, FCM) ---------- */
function apnsJwt() {
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: process.env.APNS_KEY_ID })).toString("base64url");
  const claims = Buffer.from(JSON.stringify({ iss: process.env.APPLE_TEAM_ID, iat: Math.floor(Date.now() / 1000) })).toString("base64url");
  const key = (process.env.APNS_KEY_P8 || "").replace(/\\n/g, "\n");
  const sig = crypto.sign("sha256", Buffer.from(header + "." + claims), { key, dsaEncoding: "ieee-p1363" }).toString("base64url");
  return header + "." + claims + "." + sig;
}
// iPhone žetoni (64 hex znakov) gredo na APNs, Android žetoni na Firebase Cloud Messaging.
// Rezultat: [{ token, status }], status 410 = žeton ne velja več (pobrišemo ga).
const jeApns = (t) => /^[0-9a-f]{64}$/i.test(t);
async function sendApns(tokens, title, body, data = {}) {
  tokens = [...new Set(tokens.filter(Boolean))];
  const [a, f] = await Promise.all([apns(tokens.filter(jeApns), title, body, data), fcm(tokens.filter((t) => !jeApns(t)), title, body, data)]);
  return [...a, ...f];
}
async function fcm(tokens, title, body, data) {
  if (!tokens.length) return [];
  const strData = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)]));
  try {
    const r = await admin.messaging().sendEachForMulticast({
      tokens, notification: { title, body }, data: strData,
      android: { priority: "high", notification: { sound: "default", channelId: "fixko" } }
    });
    return r.responses.map((x, i) => ({
      token: tokens[i],
      status: x.success ? 200 : /registration-token-not-registered|invalid-registration-token/.test(x.error?.code || "") ? 410 : 500,
      data: x.success ? "" : String(x.error?.code || "")
    }));
  } catch (e) { console.error("fcm", e); return tokens.map((token) => ({ token, status: 0, data: String(e) })); }
}
// TestFlight in App Store gradnje imajo produkcijske žetone; za Xcode gradnje bi rabili sandbox.
function apns(tokens, title, body, data = {}) {
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
  const body = [delo.kraj, delo.kdaj, delo.budget && delo.budget !== "Ne vem" ? delo.budget : ""].filter(Boolean).join(" · ");
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

/* ---------- ponudba mojstra → stranka sprejme ali zavrne ---------- */
// Mojster se javi s terminom (in okvirno ceno). Delo ostane odprto in vidno vsem, dokler stranka ne sprejme ene ponudbe.
const profilOk = (md) => md.slika && md.firma && (veljavnaDavcna(md.davcna) || testnaFirma(md.firma)) && md.pogoji;
exports.ponudi = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || "");
  const termin = Number(req.data?.termin);
  const cena = String(req.data?.cena || "").trim().slice(0, 40);
  if (!id || !Number.isFinite(termin)) throw new HttpsError("invalid-argument", "Manjka delo ali termin.");
  if (termin < Date.now() - 3600e3 || termin > Date.now() + 15 * 864e5) throw new HttpsError("invalid-argument", "Termin ni veljaven.");
  const mRef = db.doc("mojstri/" + uid), dRef = db.doc("dela/" + id), pRef = db.doc("ponudbe/" + id + "_" + uid);
  // Potrditev podjetja velja, ko je vpisan račun za nakazila (nastavitve/placilo.iban).
  const zahtevaj = !!(await db.doc("nastavitve/placilo").get()).data()?.iban;
  const { delo, kontakt, md, nova } = await db.runTransaction(async (t) => {
    const [m, d, p, k] = await Promise.all([t.get(mRef), t.get(dRef), t.get(pRef), t.get(db.doc("dela/" + id + "/zasebno/kontakt"))]);
    if (!m.exists || !(m.data().narocninaDo?.toMillis() > Date.now())) throw new HttpsError("permission-denied", "Naročnina ni aktivna.");
    const md = m.data();
    if (!profilOk(md)) throw new HttpsError("failed-precondition", "Dopolni profil: slika, podjetje in davčna številka.");
    if (zahtevaj && !jePreverjen(md)) throw new HttpsError("failed-precondition", "Najprej potrdi podjetje (nakazilo 0,01 €).");
    if (!d.exists) throw new HttpsError("not-found", "Dela ni več.");
    if (d.data().status !== "odprto") throw new HttpsError("already-exists", "Stranka je že izbrala mojstra.");
    if (d.data().lastnik === uid) throw new HttpsError("failed-precondition", "Svojega dela ne moreš prevzeti.");
    if (p.exists && p.data().status !== "caka") throw new HttpsError("failed-precondition", "Stranka je tvojo ponudbo že zavrnila.");
    t.set(pRef, {
      delo: id, mojster: uid, lastnik: d.data().lastnik, ime: md.ime, firma: md.firma, davcna: md.davcna || "", slika: md.slika, preverjen: jePreverjen(md),
      termin, cena, status: "caka", ustvarjeno: p.exists ? p.data().ustvarjeno : FieldValue.serverTimestamp(), posodobljeno: FieldValue.serverTimestamp()
    });
    if (!p.exists) t.update(dRef, { ponudb: FieldValue.increment(1) });
    return { delo: d.data(), kontakt: k.exists ? k.data() : {}, md, nova: !p.exists };
  });
  if (nova && kontakt.push) {
    await sendApns([kontakt.push], md.ime + " lahko pride " + opisTermina(termin), (delo.opis || strokaIme(delo.stroka)) + ". Odprite Popravko in potrdite mojstra.", { vloga: "N", delo: id });
  }
  return { ok: true };
});

exports.odgovori = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || ""), mojster = String(req.data?.mojster || ""), sprejmi = req.data?.sprejmi === true;
  if (!id || !mojster) throw new HttpsError("invalid-argument", "Manjka delo ali mojster.");
  const dRef = db.doc("dela/" + id), pRef = db.doc("ponudbe/" + id + "_" + mojster), kRef = db.doc("dela/" + id + "/zasebno/kontakt");
  const ostale = sprejmi ? await db.collection("ponudbe").where("delo", "==", id).get() : null;
  const { delo, md } = await db.runTransaction(async (t) => {
    const [d, p, m] = await Promise.all([t.get(dRef), t.get(pRef), t.get(db.doc("mojstri/" + mojster))]);
    if (!d.exists || d.data().lastnik !== uid) throw new HttpsError("permission-denied", "To ni vaše delo.");
    if (!p.exists || p.data().status !== "caka") throw new HttpsError("failed-precondition", "Ponudba ni več veljavna.");
    if (!sprejmi) { t.update(pRef, { status: "zavrnjeno" }); return { delo: d.data(), md: m.data() || {} }; }
    if (d.data().status !== "odprto") throw new HttpsError("already-exists", "Mojstra ste že izbrali.");
    if (!m.exists) throw new HttpsError("not-found", "Mojster ne obstaja več.");
    const pd = p.data(), md = m.data();
    t.update(dRef, {
      status: "prevzeto", mojster, mojsterIme: md.ime, mojsterFirma: md.firma, mojsterDavcna: md.davcna || "", mojsterSlika: md.slika, mojsterPreverjen: jePreverjen(md),
      termin: pd.termin, cena: pd.cena || "", prevzeto: FieldValue.serverTimestamp()
    });
    t.set(kRef, { mojsterTel: md.tel }, { merge: true });
    t.update(pRef, { status: "sprejeto" });
    // Druge ponudbe počakajo: če termin odpade, se stranki spet pokažejo.
    ostale.docs.filter((x) => x.id !== pRef.id && x.data().status === "caka").forEach((x) => t.update(x.ref, { status: "odlozeno" }));
    return { delo: d.data(), md };
  });
  if (sprejmi && md.push) {
    await sendApns([md.push], "Stranka vas je izbrala", (delo.opis || strokaIme(delo.stroka)) + ", " + delo.kraj + ". Pokličite stranko.", { vloga: "M", delo: id });
  }
  return { ok: true, tel: sprejmi ? md.tel || "" : "" };
});

// Odpoved termina: stranka ali mojster. Delo se znova odpre (stranki ga ni treba objaviti znova),
// odložene ponudbe drugih mojstrov se vrnejo. Stranka lahko z "celo" prekliče celo naročilo.
exports.odpovej = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || ""), celo = req.data?.celo === true;
  const dRef = db.doc("dela/" + id), kRef = db.doc("dela/" + id + "/zasebno/kontakt");
  const vse = await db.collection("ponudbe").where("delo", "==", id).get();
  const r = await db.runTransaction(async (t) => {
    const [d, k] = await Promise.all([t.get(dRef), t.get(kRef)]);
    if (!d.exists) throw new HttpsError("not-found", "Dela ni več.");
    const dd = d.data();
    const stranka = dd.lastnik === uid, mojster = dd.mojster && dd.mojster === uid;
    if (!stranka && !mojster) throw new HttpsError("permission-denied", "To ni vaše delo.");
    if (dd.status !== "prevzeto" && !(stranka && celo && dd.status === "odprto")) throw new HttpsError("failed-precondition", "Termina ni mogoče odpovedati.");
    const mRef = dd.mojster ? db.doc("mojstri/" + dd.mojster) : null;
    const m = mRef ? await t.get(mRef) : null;
    const izbrana = dd.mojster ? "ponudbe/" + id + "_" + dd.mojster : "";
    for (const x of vse.docs) {
      if (x.ref.path === izbrana) t.update(x.ref, { status: mojster ? "odpovedal" : "zavrnjeno" });
      else if (x.data().status === "odlozeno" || (celo && x.data().status === "caka")) t.update(x.ref, { status: celo ? "zavrnjeno" : "caka" });
    }
    const brez = { mojster: FieldValue.delete(), mojsterIme: FieldValue.delete(), mojsterFirma: FieldValue.delete(), mojsterDavcna: FieldValue.delete(),
      mojsterSlika: FieldValue.delete(), termin: FieldValue.delete(), cena: FieldValue.delete(), prevzeto: FieldValue.delete(), naPoti: FieldValue.delete(), opomnik: FieldValue.delete() };
    t.update(dRef, { ...(dd.status === "prevzeto" ? brez : {}), status: celo && stranka ? "preklicano" : "odprto", odpovedano: FieldValue.serverTimestamp() });
    if (k.exists) t.update(kRef, { mojsterTel: FieldValue.delete() });
    return { dd, kontakt: k.exists ? k.data() : {}, md: m?.exists ? m.data() : {}, stranka, ostale: vse.docs.filter((x) => x.ref.path !== izbrana && x.data().status === "odlozeno").length };
  });
  const opis = r.dd.opis || strokaIme(r.dd.stroka);
  if (r.stranka && r.dd.status === "prevzeto" && r.md.push) {
    await sendApns([r.md.push], "Stranka je odpovedala termin", opis + ", " + r.dd.kraj + ".", { vloga: "M", delo: id });
  } else if (!r.stranka && r.kontakt.push) {
    await sendApns([r.kontakt.push], (r.md.ime || "Mojster") + " je odpovedal termin", opis + ". Naročilo je znova odprto" + (r.ostale ? ", izberete lahko drugega mojstra." : ", obvestili bomo druge mojstre."), { vloga: "N", delo: id });
  }
  return { ok: true };
});

// Stranka izbriše naročilo (eno ali več) v katerem koli stanju. Mojster, ki je prišel, dobi obvestilo.
exports.izbrisiDelo = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const ids = [...new Set((Array.isArray(req.data?.ids) ? req.data.ids : [req.data?.id]).map((x) => String(x || "")).filter(Boolean))].slice(0, 50);
  if (!ids.length) throw new HttpsError("invalid-argument", "Ni naročila.");
  for (const id of ids) {
    const dRef = db.doc("dela/" + id);
    const d = await dRef.get();
    if (!d.exists) continue;
    const dd = d.data();
    if (dd.lastnik !== uid) throw new HttpsError("permission-denied", "To ni vaše naročilo.");
    if (dd.status === "prevzeto" && dd.mojster) {
      const m = await db.doc("mojstri/" + dd.mojster).get();
      if (m.exists && m.data().push) await sendApns([m.data().push], "Stranka je preklicala naročilo", (dd.opis || strokaIme(dd.stroka)) + ", " + dd.kraj + ". Ne hodite tja.", { vloga: "M", delo: id }).catch(() => {});
    }
    const pon = await db.collection("ponudbe").where("delo", "==", id).get();
    const batch = db.batch();
    pon.docs.forEach((x) => batch.delete(x.ref));
    batch.delete(dRef.collection("zasebno").doc("kontakt"));
    batch.delete(dRef);
    await batch.commit();
    await admin.storage().bucket().deleteFiles({ prefix: "slike/" + uid + "/" + id }).catch((e) => console.warn("slike", e.message));
  }
  return { ok: true };
});

// Ocena po opravljenem delu: stranka oceni mojstra (M), mojster lahko (neobvezno) oceni stranko (N). Vsak enkrat.
exports.oceni = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || ""), zvezdice = Number(req.data?.zvezdice), komentar = String(req.data?.komentar || "").trim().slice(0, 200);
  if (!id || !Number.isInteger(zvezdice) || zvezdice < 1 || zvezdice > 5) throw new HttpsError("invalid-argument", "Izberite od 1 do 5 zvezdic.");
  const dRef = db.doc("dela/" + id);
  const r = await db.runTransaction(async (t) => {
    const d = await t.get(dRef);
    if (!d.exists) throw new HttpsError("not-found", "Dela ni več.");
    const dd = d.data();
    const smer = dd.lastnik === uid ? "M" : dd.mojster && dd.mojster === uid ? "N" : "";
    if (!smer) throw new HttpsError("permission-denied", "To ni vaše delo.");
    if (dd.status !== "opravljeno" || !dd.mojster) throw new HttpsError("failed-precondition", "Oceniti je mogoče šele opravljeno delo.");
    const za = smer === "M" ? dd.mojster : dd.lastnik;
    const oRef = db.doc("ocene/" + id + "_" + smer);
    if ((await t.get(oRef)).exists) throw new HttpsError("already-exists", "Ocena je že oddana.");
    t.set(oRef, { za, vloga: smer, zvezdice, komentar, stroka: dd.stroka || "", kraj: dd.kraj || "", cas: FieldValue.serverTimestamp() });
    t.set(db.doc("profili/" + za), { vsota: FieldValue.increment(zvezdice), st: FieldValue.increment(1) }, { merge: true });
    t.update(dRef, { ["ocene." + smer]: zvezdice });
    return { smer, dd };
  });
  if (r.smer === "M") {
    const m = await db.doc("mojstri/" + r.dd.mojster).get();
    if (m.exists && m.data().push) await sendApns([m.data().push], "Stranka vas je ocenila: " + "★".repeat(zvezdice), "Če želite, v Popravku ocenite še stranko.", { vloga: "M", delo: id }).catch(() => {});
  }
  return { ok: true };
});

// Mojster sporoči, da je na poti; stranka dobi obvestilo.
exports.naPoti = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || "");
  const dRef = db.doc("dela/" + id);
  const d = await dRef.get();
  if (!d.exists || d.data().mojster !== uid || d.data().status !== "prevzeto") throw new HttpsError("failed-precondition", "To ni tvoj termin.");
  await dRef.update({ naPoti: FieldValue.serverTimestamp() });
  const k = await dRef.collection("zasebno").doc("kontakt").get();
  if (k.exists && k.data().push) await sendApns([k.data().push], (d.data().mojsterIme || "Mojster") + " je na poti", (d.data().opis || strokaIme(d.data().stroka)) + ". Kmalu bo pri vas.", { vloga: "N", delo: id });
  return { ok: true };
});

/* ---------- samodejni opomniki (vsakih 10 minut) ---------- */
// Sosednje regije: če se v 2 urah nihče ne javi, obvestimo še mojstre iz okolice.
const SOSEDNJE = {
  lj: ["kr", "za", "nm", "po"], mb: ["ms", "sg", "ce"], ce: ["mb", "sg", "za", "kk", "lj"], kr: ["lj", "ng"],
  kp: ["ng", "po"], nm: ["lj", "kk", "za", "po"], ms: ["mb"], ng: ["kr", "kp", "po"], sg: ["mb", "ce"],
  kk: ["nm", "za", "ce"], za: ["lj", "ce", "kk", "nm"], po: ["lj", "kp", "ng", "nm"]
};
const uraSlo = () => Number(new Intl.DateTimeFormat("sl-SI", { hour: "numeric", hourCycle: "h23", timeZone: "Europe/Ljubljana" }).format(new Date()));
const pushStranke = async (id) => (await db.doc("dela/" + id + "/zasebno/kontakt").get()).data()?.push;
const pushMojstra = async (uid) => (uid ? (await db.doc("mojstri/" + uid).get()).data()?.push : null);
exports.opomniki = onSchedule({ schedule: "every 10 minutes", region: "europe-west1", timeoutSeconds: 120 }, async () => {
  const now = Date.now(), H = 3600e3, mirno = uraSlo() < 8 || uraSlo() >= 21; // ponoči ne motimo
  const prevzeta = await db.collection("dela").where("status", "==", "prevzeto").get();
  for (const d of prevzeta.docs) {
    const j = d.data(), t = Number(j.termin), o = j.opomnik || {}, opis = j.opis || strokaIme(j.stroka);
    if (!t) continue;
    const ostane = t - now;
    // Dan prej (samo če je bil termin dogovorjen vsaj dan vnaprej) in uro prej.
    if (!o.dan && ostane <= 24 * H && ostane > 3 * H && (j.prevzeto?.toMillis() || now) <= t - 24 * H) {
      await d.ref.update({ "opomnik.dan": true });
      await sendApns([await pushStranke(d.id)], "Jutri pride " + (j.mojsterIme || "mojster"), opis + ", " + opisTermina(t) + ".", { vloga: "N", delo: d.id }).catch(() => {});
      await sendApns([await pushMojstra(j.mojster)], "Jutri imaš termin", opis + ", " + j.kraj + ", " + opisTermina(t) + ".", { vloga: "M", delo: d.id }).catch(() => {});
    }
    if (!o.ura && ostane <= 65 * 60e3 && ostane > 0) {
      await d.ref.update({ "opomnik.ura": true });
      await sendApns([await pushStranke(d.id)], (j.mojsterIme || "Mojster") + " pride čez dobro uro", opis + ".", { vloga: "N", delo: d.id }).catch(() => {});
      await sendApns([await pushMojstra(j.mojster)], "Termin čez dobro uro", opis + ", " + j.kraj + ".", { vloga: "M", delo: d.id }).catch(() => {});
    }
    // Dan po terminu: ali je bilo delo opravljeno? (stranka potrdi in oceni mojstra)
    if (!o.ocena && !mirno && ostane < -20 * H && ostane > -7 * 24 * H) {
      await d.ref.update({ "opomnik.ocena": true });
      await sendApns([await pushStranke(d.id)], "Je bilo delo opravljeno?", "Tapnite Delo je opravljeno in ocenite " + (j.mojsterIme || "mojstra") + ".", { vloga: "N", delo: d.id }).catch(() => {});
    }
  }
  if (mirno) return;
  const odprta = await db.collection("dela").where("status", "==", "odprto").get();
  for (const d of odprta.docs) {
    const j = d.data(), star = now - (j.ustvarjeno?.toMillis() || now);
    if (j.sosednje || j.ponudb || star < 2 * H || star > 26 * H || !SOSEDNJE[j.regija]) continue;
    const sos = SOSEDNJE[j.regija];
    await d.ref.update({ sosednje: sos });
    const snap = await db.collection("mojstri").where("stroke", "array-contains", j.stroka).get();
    const novi = snap.docs.filter((m) => {
      const md = m.data(), reg = md.regije || [];
      return m.id !== j.lastnik && md.narocninaDo?.toMillis() > now && !reg.includes("vsa") && !reg.includes(j.regija) && reg.some((r) => sos.includes(r));
    });
    if (!novi.length) continue;
    await d.ref.update({ obvesceni: FieldValue.increment(novi.length) });
    await sendApns(novi.map((m) => m.data().push), "Delo v bližini: " + (j.opis || strokaIme(j.stroka)), [j.kraj, j.kdaj].filter(Boolean).join(" · ") + ". Nihče se še ni javil.", { vloga: "M", delo: d.id }).catch(() => {});
    await sendApns([await pushStranke(d.id)], "Obvestili smo še mojstre iz okolice", (j.opis || strokaIme(j.stroka)) + ". Ko se kdo javi, dobite obvestilo.", { vloga: "N", delo: d.id }).catch(() => {});
  }
});

// Mojster prosi stranko za več slik (neobvezno z navodilom, kaj naj slika).
exports.prosiSlike = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const id = String(req.data?.id || ""), sporocilo = String(req.data?.sporocilo || "").trim().slice(0, 140);
  const [m, d] = await Promise.all([db.doc("mojstri/" + uid).get(), db.doc("dela/" + id).get()]);
  if (!m.exists || !(m.data().narocninaDo?.toMillis() > Date.now())) throw new HttpsError("permission-denied", "Naročnina ni aktivna.");
  if (!d.exists || !(d.data().status === "odprto" || d.data().mojster === uid)) throw new HttpsError("failed-precondition", "Dela ni več.");
  await d.ref.update({ prosnja: { ime: m.data().ime || "Mojster", sporocilo, cas: FieldValue.serverTimestamp() } });
  const k = await db.doc("dela/" + id + "/zasebno/kontakt").get();
  if (k.exists && k.data().push) {
    await sendApns([k.data().push], (m.data().ime || "Mojster") + " prosi za več slik", sporocilo || (d.data().opis || strokaIme(d.data().stroka)) + ". Dodajte jih v Popravku.", { vloga: "N", delo: id });
  }
  return { ok: true };
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

  // Brezplačen dostop (zaenkrat za vse) ali testni mojster lastnikov (firma Sraufnciger): eno leto, brez nakupa.
  if (req.data?.testni || req.data?.brezplacno) {
    if (!BREZPLACNO && !testnaFirma(m.data().firma)) throw new HttpsError("permission-denied", "Ni testni račun.");
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

/* ---------- potrditev podjetja z nakazilom 0,01 € ---------- */
// Mojster nakaže 0,01 € s TRR podjetja s sklicem iz aplikacije in tapne »Nakazal sem«.
// Skrbnik na izpisku preveri, da račun pripada podjetju s to davčno (AJPES), in ga potrdi v aplikaciji.
exports.nakazal = onCall(async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const mRef = db.doc("mojstri/" + uid);
  const m = await mRef.get();
  if (!m.exists || !profilOk(m.data())) throw new HttpsError("failed-precondition", "Najprej izpolni profil.");
  await mRef.update({ preverjanje: { cakam: true, sklic: sklicIz(uid), davcna: m.data().davcna || "", ob: FieldValue.serverTimestamp() } });
  return { sklic: sklicIz(uid) };
});

async function potrdiMojstra(mRef, md, kako) {
  await mRef.update({ preverjeno: { davcna: md.davcna || "", ob: FieldValue.serverTimestamp(), ...kako }, preverjanje: FieldValue.delete() });
  if (md.push) await sendApns([md.push], "Podjetje je potrjeno", "Zdaj se lahko javljaš na dela.", { vloga: "M" });
  return { ok: true };
}

// Banka: povratek s prijave v OTP (hosting /banka) in pregled prilivov vsakih 5 minut.
const stran = (naslov, besedilo) => `<!doctype html><html lang="sl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Popravko</title><style>body{font:19px -apple-system,system-ui,sans-serif;background:#F4F6F5;color:#16201D;display:grid;place-items:center;min-height:90vh;margin:0;padding:20px;text-align:center}h1{font-size:26px}</style></head><body><div><h1>${naslov}</h1><p>${besedilo}</p></div></body></html>`;
exports.bankaSeja = onRequest(async (req, res) => {
  const { code, state, error } = req.query;
  try {
    if (error || !code) throw new Error("Banka ni dovolila dostopa (" + String(error || "ni kode").slice(0, 80) + ").");
    const iban = await banka.seja(String(code), String(state || ""));
    res.send(stran("Banka je povezana ✓", `Popravko bo zdaj sam preverjal nakazila na račun ${iban.replace(/</g, "")}. To okno lahko zapreš in se vrneš v aplikacijo.`));
  } catch (e) {
    console.error("bankaSeja", e);
    res.status(400).send(stran("Povezava ni uspela", String(e.message).replace(/</g, "")));
  }
});
exports.pregledBanke = onSchedule({ schedule: "every 5 minutes", region: "europe-west1", timeoutSeconds: 120 }, async () => {
  const r = await banka.preglej(potrdiMojstra).catch((e) => ({ napaka: e.message }));
  if (r.rezultat?.length || r.napaka) console.log("pregledBanke", JSON.stringify(r));
});

// Skrbniški dostop s kodo; v bazi je samo njen SHA-256 (nastavitve/skrbnik.hash).
async function skrbnik(koda) {
  const h = (await db.doc("nastavitve/skrbnik").get()).data()?.hash;
  const moj = crypto.createHash("sha256").update(String(koda || "")).digest("hex");
  if (!h || h.length !== moj.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(moj))) throw new HttpsError("permission-denied", "Napačna koda.");
}
exports.skrbnik = onCall(async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  await skrbnik(req.data?.koda);
  const akcija = req.data?.akcija;
  if (akcija === "seznam") {
    const q = await db.collection("mojstri").where("preverjanje.cakam", "==", true).limit(100).get();
    return { mojstri: q.docs.map((d) => { const m = d.data(); return { uid: d.id, ime: m.ime, firma: m.firma, davcna: m.davcna || "", tel: m.tel || "", slika: m.slika || "", sklic: m.preverjanje?.sklic || sklicIz(d.id), placnik: m.preverjanje?.placnik || "", ob: m.preverjanje?.ob?.toMillis() || 0 }; }) };
  }
  if (akcija === "potrdi" || akcija === "zavrni") {
    const mRef = db.doc("mojstri/" + String(req.data?.uid || ""));
    const m = await mRef.get();
    if (!m.exists) throw new HttpsError("not-found", "Mojstra ni.");
    const md = m.data();
    if (akcija === "potrdi") return potrdiMojstra(mRef, md, { samodejno: false });
    await mRef.update({ preverjanje: { cakam: false, zavrnjeno: true, sklic: sklicIz(m.id), ob: FieldValue.serverTimestamp() } });
    if (md.push) await sendApns([md.push], "Nakazila nismo našli", "Preveri, da si nakazal s TRR podjetja in s pravim sklicem.", { vloga: "M" });
    return { ok: true };
  }
  if (akcija === "banka-stanje") return banka.stanje();
  if (akcija === "banka-povezi") {
    try { return { url: await banka.povezi() }; } catch (e) { throw new HttpsError("failed-precondition", e.message); }
  }
  if (akcija === "banka-preglej") {
    try { return await banka.preglej(potrdiMojstra); } catch (e) { throw new HttpsError("unavailable", e.message); }
  }
  throw new HttpsError("invalid-argument", "Neznano dejanje.");
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
  // Ponudbe (kot mojster ali stranka).
  const [p1, p2] = await Promise.all([db.collection("ponudbe").where("mojster", "==", uid).get(), db.collection("ponudbe").where("lastnik", "==", uid).get()]);
  await Promise.all([...p1.docs, ...p2.docs].map((d) => d.ref.delete()));
  // Prevzeta dela tega mojstra ostanejo strankam vidna, brez telefona mojstra.
  const prevzeta = await db.collection("dela").where("mojster", "==", uid).get();
  await Promise.all(prevzeta.docs.map((d) => d.ref.collection("zasebno").doc("kontakt").set({ mojsterTel: FieldValue.delete() }, { merge: true })));
  await Promise.all(prevzeta.docs.map((d) => d.ref.update({ mojsterSlika: FieldValue.delete(), mojsterDavcna: FieldValue.delete() })));
  const oc = await db.collection("ocene").where("za", "==", uid).get();
  await Promise.all([...oc.docs.map((d) => d.ref.delete()), db.doc("profili/" + uid).delete()]);
  await admin.storage().bucket().deleteFiles({ prefix: "slike/" + uid + "/" }).catch((e) => console.warn("slike", e.message));
  await admin.storage().bucket().deleteFiles({ prefix: "profil/" + uid + "/" }).catch((e) => console.warn("profil", e.message));
  await admin.auth().deleteUser(uid).catch(() => {});
  return { ok: true };
});
