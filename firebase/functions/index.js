// Popravko strežnik:
// - novoDelo: ko stranka odda delo, obvesti mojstre te stroke v tej regiji (z aktivno naročnino).
// - ponudi / odgovori: mojster se javi s terminom, stranka ga sprejme ali zavrne; po sprejemu si izmenjata telefon.
// - prevzemi: stari neposredni prevzem (za starejše gradnje).
// - narocnina: preveri Applov podpisan nakup (JWS) in mojstru odklene dela.
// - izbrisi: izbriše uporabnikove podatke (zahteva App Store).
// - moderacija: Vision pregleda slike pred obvestili, 2 prijavi skrijeta objavo, skrbnik odloča na fixko-app.web.app/moderacija.
// - pregled: zasebna stran vseh mojstrov in potrditev podjetij (popravko.pregled.nakupko.com), e-pošta ob novem mojstru in nakazilu.
// - statistika: seštevki za zasebno nadzorno ploščo nakupko-8ad19.web.app.
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const http2 = require("http2");
const crypto = require("crypto");
const { opisTermina, strokaIme, davcnaOk, testnaFirma, sklicIz, jePreverjen, pokriva, T } = require("./besedila");
const banka = require("./banka");
const mod = require("./moderacija");

admin.initializeApp();
setGlobalOptions({ region: "europe-west1", maxInstances: 10 });
const db = admin.firestore();

const BUNDLE_ID = process.env.APNS_TOPIC || "si.fixko.app";
// Aplikacija Fixko (tujina) ima svoj bundle; njeni iPhone žetoni imajo predpono »fixko:«.
const FIXKO_BUNDLE_ID = process.env.FIXKO_APNS_TOPIC || "com.remako.fixko";
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
const jeApns = (t) => /^(fixko:)?[0-9a-f]{64}$/i.test(t);
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
      ":method": "POST", ":path": "/3/device/" + token.replace(/^fixko:/, ""),
      authorization: "bearer " + jwt, "apns-topic": token.startsWith("fixko:") ? FIXKO_BUNDLE_ID : BUNDLE_ID, "apns-push-type": "alert", "apns-priority": "10"
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

// Jezik in časovni pas prejemnika (mojster ali kontakt stranke); slovenski uporabniki jih nimajo shranjenih.
const jzk = (x) => (x && typeof x.jezik === "string" && x.jezik) || "sl";
const termin = (ms, x) => opisTermina(ms, Date.now(), jzk(x), x?.tz || "");
const opisDela = (d, x) => d.opis || strokaIme(d.stroka, jzk(x));

/* ---------- novo delo → obvestila mojstrom ---------- */
exports.novoDelo = onDocumentCreated({ document: "dela/{id}", secrets: ["MAIL_PASS"] }, async (event) => {
  const delo = event.data?.data();
  if (!delo) return;
  // Najprej moderacija: blokirani uporabnik ali neprimerna slika → objavo skrijemo, mojstrov ne obvestimo.
  if ((await db.doc("blokirani/" + delo.lastnik).get()).exists) return skrij(event.data.ref, delo, "blokiran", "Uporabnik je blokiran.");
  const slabe = await mod.pregledSlik([delo.slika, ...(delo.slike || [])]);
  if (slabe.length) {
    await opozori(delo.lastnik);
    return skrij(event.data.ref, delo, "slika", "Vision: " + slabe.map((x) => x.razlog).join(", "), "Slika ni primerna", "Objava ni bila objavljena, ker slika ni primerna. Fotografirajte samo okvaro ali prostor.");
  }
  const now = Timestamp.now();
  const snap = await db.collection("mojstri").where("stroke", "array-contains", delo.stroka).get();
  const ujemajo = snap.docs.filter((d) => {
    const m = d.data();
    return d.id !== delo.lastnik && m.narocninaDo && m.narocninaDo.toMillis() > now.toMillis()
      && (m.regije || []).some((r) => pokriva(r, delo.regija));
  });
  await event.data.ref.update({ obvesceni: ujemajo.length });
  // Obvestila po jeziku mojstrov (slovenski kot doslej).
  const poJeziku = new Map();
  for (const d of ujemajo) { const j = jzk(d.data()); poJeziku.set(j, [...(poJeziku.get(j) || []), d.data().push]); }
  const res = [];
  for (const [j, zetoni] of poJeziku) {
    const title = T(j, "Novo delo: {0}", opisDela(delo, { jezik: j }));
    const body = [delo.kraj, T(j, delo.kdaj || ""), delo.m2 ? `~${delo.m2} m²` : "", delo.budget && delo.budget !== "Ne vem" ? T(j, delo.budget) : ""].filter(Boolean).join(" · ");
    res.push(...await sendApns(zetoni, title, body, { vloga: "M", delo: event.params.id }));
  }
  // Neveljavne žetone (aplikacija izbrisana) pobrišemo.
  const slabi = res.filter((r) => r.status === 410 || (r.status === 400 && /BadDeviceToken/.test(r.data))).map((r) => r.token);
  await Promise.all(ujemajo.filter((d) => slabi.includes(d.data().push)).map((d) => d.ref.update({ push: FieldValue.delete() })));
  console.log("novo delo", event.params.id, delo.stroka, delo.regija, "mojstrov", ujemajo.length, "poslano", res.map((r) => r.status).join(","));
});

/* ---------- moderacija ---------- */
const PRIJAV_ZA_SKRITJE = 2; // toliko različnih mojstrov mora prijaviti objavo, da se skrije vsem
const OPOZORIL_ZA_BLOKADO = 2; // po toliko zavrnjenih slikah uporabnik ne more več oddajati del
const MODERACIJA_URL = "https://fixko-app.web.app/moderacija";
const PREGLED_URL = "https://stats.remako.si"; // zavihek Popravko (prej popravko.pregled.nakupko.com)

async function obvestiStranko(id, naslov, besedilo, pritozba = "") {
  const k = await db.doc("dela/" + id + "/zasebno/kontakt").get();
  const j = jzk(k.data());
  if (k.exists && k.data().push) await sendApns([k.data().push], T(j, naslov), T(j, besedilo) + (pritozba ? T(j, pritozba) : ""), { vloga: "N", delo: id }).catch(() => {});
}
// Skrije objavo vsem mojstrom (status preklicano), shrani zapis za skrbnika in ga obvesti. Slike ostanejo, dokler skrbnik ne odloči.
async function skrij(ref, delo, razlog, opis, naslov, besedilo) {
  await ref.update({ status: "preklicano", moderacija: { razlog, prej: delo.status || "odprto", ob: FieldValue.serverTimestamp() } });
  await db.doc("moderacija/" + ref.id).set({
    delo: ref.id, lastnik: delo.lastnik, razlog, opis, stanje: "skrito", ob: FieldValue.serverTimestamp(),
    stroka: delo.stroka || "", besedilo: delo.opis || "", kraj: delo.kraj || "", slike: [delo.slika, ...(delo.slike || [])].filter(Boolean)
  }, { merge: true });
  if (naslov) await obvestiStranko(ref.id, naslov, besedilo, " Pritožba: support@remako.si");
  await mod.posljiSkrbniku("Popravko: skrita objava (" + razlog + ")", `${opis}\n\n${strokaIme(delo.stroka)}, ${delo.kraj}: ${delo.opis || ""}\n\nOdloči tukaj: ${MODERACIJA_URL}`);
  console.log("skrito", ref.id, razlog, opis);
}
async function opozori(uid) {
  const n = await db.runTransaction(async (t) => {
    const ref = db.doc("kazni/" + uid), st = ((await t.get(ref)).data()?.st || 0) + 1;
    t.set(ref, { st, zadnja: FieldValue.serverTimestamp() }, { merge: true });
    return st;
  });
  if (n >= OPOZORIL_ZA_BLOKADO) await db.doc("blokirani/" + uid).set({ ob: FieldValue.serverTimestamp(), razlog: "neprimerne slike (" + n + "x)" }, { merge: true });
}

// Dodatne slike (ko mojster prosi zanje): neprimerne odstranimo, ostale ostanejo.
exports.noveSlike = onDocumentUpdated({ document: "dela/{id}", secrets: ["MAIL_PASS"] }, async (event) => {
  const prej = event.data.before.data()?.slike || [], zdaj = event.data.after.data()?.slike || [];
  const nove = zdaj.filter((u) => !prej.includes(u));
  if (!nove.length) return;
  const slabe = (await mod.pregledSlik(nove)).map((x) => x.url);
  if (!slabe.length) return;
  const delo = event.data.after.data();
  await event.data.after.ref.update({ slike: FieldValue.arrayRemove(...slabe) });
  await Promise.all(slabe.map((u) => admin.storage().bucket().file(mod.potIz(u)).delete().catch(() => {})));
  await opozori(delo.lastnik);
  await obvestiStranko(event.params.id, "Slika ni primerna", "Neprimerno sliko smo odstranili. Fotografirajte samo okvaro ali prostor.");
  await mod.posljiSkrbniku("Popravko: odstranjena dodatna slika", `Delo ${event.params.id} (${strokaIme(delo.stroka)}, ${delo.kraj}), uporabnik ${delo.lastnik}. Slike so izbrisane.`);
});

// Prijava objave ali mojstra: skrbnika obvestimo; ko objavo prijavita 2 različna mojstra, jo skrijemo vsem.
exports.novaPrijava = onDocumentCreated({ document: "prijave/{id}", secrets: ["MAIL_PASS"] }, async (event) => {
  const p = event.data?.data();
  if (!p) return;
  const dRef = db.doc("dela/" + p.delo), d = await dRef.get();
  const delo = d.exists ? d.data() : null;
  const kje = delo ? `${strokaIme(delo.stroka)}, ${delo.kraj}: ${delo.opis || ""}` : "delo ne obstaja več";
  if (p.kdo === "objava" && delo && delo.status === "odprto") {
    const vse = await db.collection("prijave").where("delo", "==", p.delo).where("kdo", "==", "objava").get();
    // Štejejo samo prijave različnih mojstrov (ena naprava ne more sama skriti tuje objave).
    const kandidati = [...new Set(vse.docs.map((x) => x.data().prijavil))];
    const prijavili = new Set((await Promise.all(kandidati.map((u) => db.doc("mojstri/" + u).get()))).filter((x) => x.exists).map((x) => x.id));
    if (prijavili.size >= PRIJAV_ZA_SKRITJE) {
      const razlogi = [...new Set(vse.docs.map((x) => x.data().razlog))].join(", ");
      return skrij(dRef, delo, "prijave", prijavili.size + " prijave: " + razlogi, "Objava je skrita", "Mojstri so objavo prijavili kot neprimerno, zato je skrita.");
    }
  }
  await mod.posljiSkrbniku("Popravko: nova prijava (" + (p.kdo === "mojster" ? "mojster" : "objava") + ")", `Razlog: ${p.razlog}\nDelo: ${kje}\n\nPregled: ${MODERACIJA_URL}`);
});

// Skrbnik: seznam skritih objav in prijav; obnovi, odstrani (izbriše slike), blokiraj/odblokiraj uporabnika.
exports.moderacija = onCall({ secrets: ["MAIL_PASS"] }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  await dostop(req);
  const akcija = req.data?.akcija, id = String(req.data?.id || "");
  const ms = (t) => t?.toMillis?.() || 0;
  if (akcija === "seznam") {
    const [sk, pr, bl] = await Promise.all([
      db.collection("moderacija").orderBy("ob", "desc").limit(60).get(),
      db.collection("prijave").orderBy("ustvarjeno", "desc").limit(40).get(),
      db.collection("blokirani").limit(100).get()
    ]);
    return {
      skrite: sk.docs.map((x) => ({ ...x.data(), ob: ms(x.data().ob) })),
      prijave: pr.docs.map((x) => ({ delo: x.data().delo, kdo: x.data().kdo, razlog: x.data().razlog, ob: ms(x.data().ustvarjeno) })),
      blokirani: bl.docs.map((x) => ({ uid: x.id, razlog: x.data().razlog || "", ob: ms(x.data().ob) }))
    };
  }
  if (akcija === "testna-posta") return { poslano: await mod.posljiSkrbniku("Popravko: testno sporočilo", "E-pošta za prijave in skrite objave deluje.\n\nPregled: " + MODERACIJA_URL) };
  if (akcija === "blokiraj" || akcija === "odblokiraj") {
    const uid = String(req.data?.uid || "");
    if (!uid) throw new HttpsError("invalid-argument", "Ni uporabnika.");
    if (akcija === "odblokiraj") { await Promise.all([db.doc("blokirani/" + uid).delete(), db.doc("kazni/" + uid).delete()]); return { ok: true }; }
    await db.doc("blokirani/" + uid).set({ ob: FieldValue.serverTimestamp(), razlog: "skrbnik" });
    const odprta = await db.collection("dela").where("lastnik", "==", uid).get();
    for (const d of odprta.docs) if (d.data().status === "odprto") await skrij(d.ref, d.data(), "blokiran", "Skrbnik je blokiral uporabnika.");
    return { ok: true };
  }
  const mRef = db.doc("moderacija/" + id), m = await mRef.get();
  if (!m.exists) throw new HttpsError("not-found", "Zapisa ni.");
  if (akcija === "obnovi") {
    const dRef = db.doc("dela/" + id), d = await dRef.get();
    if (!d.exists) throw new HttpsError("not-found", "Dela ni več.");
    if (d.data().status === "preklicano" && d.data().moderacija) await dRef.update({ status: d.data().moderacija.prej || "odprto", moderacija: FieldValue.delete() });
    await mRef.update({ stanje: "obnovljeno" });
    return { ok: true };
  }
  if (akcija === "odstrani") {
    await admin.storage().bucket().deleteFiles({ prefix: "slike/" + m.data().lastnik + "/" + id }).catch((e) => console.warn("slike", e.message));
    await db.doc("dela/" + id).update({ slika: "", slike: [] }).catch(() => {});
    await mRef.update({ stanje: "odstranjeno", slike: [] });
    return { ok: true };
  }
  throw new HttpsError("invalid-argument", "Neznano dejanje.");
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
    if (!md.slika || !md.firma || !davcnaOk(md) || !md.pogoji) throw new HttpsError("failed-precondition", "Dopolni profil: slika, podjetje in davčna številka.");
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
    const j = jzk(kontakt);
    await sendApns([kontakt.push], T(j, "{0} pride {1}", mojster.ime, opisTermina(termin, Date.now(), j, kontakt.tz)), T(j, "{0}. Pred prihodom vas pokliče.", opisDela(delo, kontakt)), { vloga: "N", delo: id });
  }
  return { tel: kontakt.tel || "" };
});

/* ---------- ponudba mojstra → stranka sprejme ali zavrne ---------- */
// Mojster se javi s terminom (in okvirno ceno). Delo ostane odprto in vidno vsem, dokler stranka ne sprejme ene ponudbe.
const profilOk = (md) => md.slika && md.firma && davcnaOk(md) && md.pogoji;
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
    await sendApns([kontakt.push], T(jzk(kontakt), "{0} lahko pride {1}", md.ime, opisTermina(termin, Date.now(), jzk(kontakt), kontakt.tz)), T(jzk(kontakt), "{0}. Odprite Popravko in potrdite mojstra.", opisDela(delo, kontakt)), { vloga: "N", delo: id });
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
    await sendApns([md.push], T(jzk(md), "Stranka vas je izbrala"), T(jzk(md), "{0}, {1}. Pokličite stranko.", opisDela(delo, md), delo.kraj), { vloga: "M", delo: id });
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
  if (r.stranka && r.dd.status === "prevzeto" && r.md.push) {
    const j = jzk(r.md);
    await sendApns([r.md.push], T(j, "Stranka je odpovedala termin"), T(j, "{0}, {1}.", opisDela(r.dd, r.md), r.dd.kraj), { vloga: "M", delo: id });
  } else if (!r.stranka && r.kontakt.push) {
    const j = jzk(r.kontakt);
    await sendApns([r.kontakt.push], T(j, "{0} je odpovedal termin", r.md.ime || T(j, "Mojster")), T(j, r.ostale ? "{0}. Naročilo je znova odprto, izberete lahko drugega mojstra." : "{0}. Naročilo je znova odprto, obvestili bomo druge mojstre.", opisDela(r.dd, r.kontakt)), { vloga: "N", delo: id });
  }
  return { ok: true };
});

// Stranka izbriše naročilo (eno ali več) v katerem koli stanju. Mojster, ki je prišel, dobi obvestilo.
// Izbriše delo s ponudbami, kontaktom in slikami; mojstra, ki ga je prevzel, obvesti.
async function pobrisiDelo(dRef, dd) {
  const id = dRef.id;
  if (dd.status === "prevzeto" && dd.mojster) {
    const m = await db.doc("mojstri/" + dd.mojster).get();
    if (m.exists && m.data().push) await sendApns([m.data().push], T(jzk(m.data()), "Stranka je preklicala naročilo"), T(jzk(m.data()), "{0}, {1}. Ne hodite tja.", opisDela(dd, m.data()), dd.kraj), { vloga: "M", delo: id }).catch(() => {});
  }
  const pon = await db.collection("ponudbe").where("delo", "==", id).get();
  const batch = db.batch();
  pon.docs.forEach((x) => batch.delete(x.ref));
  batch.delete(dRef.collection("zasebno").doc("kontakt"));
  batch.delete(dRef);
  await batch.commit();
  await admin.storage().bucket().deleteFiles({ prefix: "slike/" + dd.lastnik + "/" + id }).catch((e) => console.warn("slike", e.message));
}
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
    await pobrisiDelo(dRef, dd);
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
    if (m.exists && m.data().push) await sendApns([m.data().push], T(jzk(m.data()), "Stranka vas je ocenila: {0}", "★".repeat(zvezdice)), T(jzk(m.data()), "Če želite, v Popravku ocenite še stranko."), { vloga: "M", delo: id }).catch(() => {});
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
  if (k.exists && k.data().push) { const j = jzk(k.data()); await sendApns([k.data().push], T(j, "{0} je na poti", d.data().mojsterIme || T(j, "Mojster")), T(j, "{0}. Kmalu bo pri vas.", opisDela(d.data(), k.data())), { vloga: "N", delo: id }); }
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
// Kontakt stranke in mojster (žeton, jezik, časovni pas).
const kontaktStranke = async (id) => (await db.doc("dela/" + id + "/zasebno/kontakt").get()).data() || {};
const podatkiMojstra = async (uid) => (uid ? (await db.doc("mojstri/" + uid).get()).data() || {} : {});
exports.opomniki = onSchedule({ schedule: "every 10 minutes", region: "europe-west1", timeoutSeconds: 120 }, async () => {
  const now = Date.now(), H = 3600e3, mirno = uraSlo() < 8 || uraSlo() >= 21; // ponoči ne motimo
  const prevzeta = await db.collection("dela").where("status", "==", "prevzeto").get();
  for (const d of prevzeta.docs) {
    const j = d.data(), t = Number(j.termin), o = j.opomnik || {};
    if (!t) continue;
    const ostane = t - now;
    // Dan prej (samo če je bil termin dogovorjen vsaj dan vnaprej) in uro prej.
    if (!o.dan && ostane <= 24 * H && ostane > 3 * H && (j.prevzeto?.toMillis() || now) <= t - 24 * H) {
      await d.ref.update({ "opomnik.dan": true });
      const s = await kontaktStranke(d.id), m = await podatkiMojstra(j.mojster);
      await sendApns([s.push], T(jzk(s), "Jutri pride {0}", j.mojsterIme || T(jzk(s), "mojster")), T(jzk(s), "{0}, {1}.", opisDela(j, s), termin(t, s)), { vloga: "N", delo: d.id }).catch(() => {});
      await sendApns([m.push], T(jzk(m), "Jutri imaš termin"), T(jzk(m), "{0}, {1}, {2}.", opisDela(j, m), j.kraj, termin(t, m)), { vloga: "M", delo: d.id }).catch(() => {});
    }
    if (!o.ura && ostane <= 65 * 60e3 && ostane > 0) {
      await d.ref.update({ "opomnik.ura": true });
      const s = await kontaktStranke(d.id), m = await podatkiMojstra(j.mojster);
      await sendApns([s.push], T(jzk(s), "{0} pride čez dobro uro", j.mojsterIme || T(jzk(s), "Mojster")), T(jzk(s), "{0}.", opisDela(j, s)), { vloga: "N", delo: d.id }).catch(() => {});
      await sendApns([m.push], T(jzk(m), "Termin čez dobro uro"), T(jzk(m), "{0}, {1}.", opisDela(j, m), j.kraj), { vloga: "M", delo: d.id }).catch(() => {});
    }
    // Dan po terminu: ali je bilo delo opravljeno? (stranka potrdi in oceni mojstra)
    if (!o.ocena && !mirno && ostane < -20 * H && ostane > -7 * 24 * H) {
      await d.ref.update({ "opomnik.ocena": true });
      const s = await kontaktStranke(d.id);
      await sendApns([s.push], T(jzk(s), "Je bilo delo opravljeno?"), T(jzk(s), "Tapnite Delo je opravljeno in ocenite {0}.", j.mojsterIme || T(jzk(s), "mojstra")), { vloga: "N", delo: d.id }).catch(() => {});
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
    for (const m of novi) {
      const x = m.data();
      await sendApns([x.push], T(jzk(x), "Delo v bližini: {0}", opisDela(j, x)), T(jzk(x), "{0}. Nihče se še ni javil.", [j.kraj, T(jzk(x), j.kdaj || "")].filter(Boolean).join(" · ")), { vloga: "M", delo: d.id }).catch(() => {});
    }
    const s = await kontaktStranke(d.id);
    await sendApns([s.push], T(jzk(s), "Obvestili smo še mojstre iz okolice"), T(jzk(s), "{0}. Ko se kdo javi, dobite obvestilo.", opisDela(j, s)), { vloga: "N", delo: d.id }).catch(() => {});
  }
});

// Jezik prepisa po jeziku aplikacije (privzeto slovenščina).
const GOVOR = { en: "en-GB", de: "de-DE", fr: "fr-FR", it: "it-IT", es: "es-ES", pt: "pt-PT", nl: "nl-NL", pl: "pl-PL", hr: "hr-HR" };
// Prepis glasu v besedilo (Google Speech-to-Text, slovenščina). Največ 30 s, omejeno na 30 prepisov na dan na uporabnika.
exports.prepisi = onCall({ memory: "512MiB" }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const zvok = String(req.data?.zvok || "");
  if (!zvok || zvok.length > 1400000) throw new HttpsError("invalid-argument", "Posnetek je predolg (največ 30 sekund).");
  const dan = new Date().toISOString().slice(0, 10), oRef = db.doc("omejitve/" + uid);
  await db.runTransaction(async (t) => {
    const o = (await t.get(oRef)).data() || {};
    const st = o.dan === dan ? o.prepisov || 0 : 0;
    if (st >= 30) throw new HttpsError("resource-exhausted", "Danes ste porabili vse prepise. Napišite z roko.");
    t.set(oRef, { dan, prepisov: st + 1 }, { merge: true });
  });
  const { GoogleAuth } = require("google-auth-library");
  const zeton = await (await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient()).getAccessToken();
  const r = await fetch("https://eu-speech.googleapis.com/v1/speech:recognize", {
    method: "POST", headers: { Authorization: "Bearer " + zeton.token, "content-type": "application/json" },
    body: JSON.stringify({ config: { encoding: "LINEAR16", sampleRateHertz: 16000, languageCode: GOVOR[req.data?.jezik] || "sl-SI", maxAlternatives: 1 }, audio: { content: zvok } })
  });
  const j = await r.json();
  if (!r.ok) { console.error("prepis", r.status, JSON.stringify(j).slice(0, 500)); throw new HttpsError("internal", "Prepis trenutno ne deluje."); }
  let besedilo = (j.results || []).map((x) => x.alternatives?.[0]?.transcript || "").join(" ").replace(/\s+/g, " ").trim();
  if (besedilo) besedilo = besedilo[0].toUpperCase() + besedilo.slice(1);
  return { besedilo: besedilo.slice(0, 200) };
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
    const j = jzk(k.data());
    await sendApns([k.data().push], T(j, "{0} prosi za več slik", m.data().ime || T(j, "Mojster")), sporocilo || T(j, "{0}. Dodajte jih v Popravku.", opisDela(d.data(), k.data())), { vloga: "N", delo: id });
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
  if (![BUNDLE_ID, FIXKO_BUNDLE_ID].includes(t.bundleId) || t.productId !== PRODUCT_ID) throw new HttpsError("invalid-argument", "Napačen izdelek.");
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
exports.nakazal = onCall({ secrets: ["MAIL_PASS"] }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const mRef = db.doc("mojstri/" + uid);
  const m = await mRef.get();
  if (!m.exists || !profilOk(m.data())) throw new HttpsError("failed-precondition", "Najprej izpolni profil.");
  const md = m.data();
  await mRef.update({ preverjanje: { cakam: true, sklic: sklicIz(uid), davcna: md.davcna || "", ob: FieldValue.serverTimestamp() } });
  await obvestiOMojstru(uid, md, "Mojster čaka na potrditev", "mojster pravi, da je nakazal (banka ga še ni našla)");
  await mod.posljiSkrbniku("Popravko: mojster pravi, da je nakazal 0,01 €", `${md.ime || ""}, ${md.firma || ""} (davčna ${md.davcna || "-"})
Sklic: ${sklicIz(uid)}

Pregled: ${PREGLED_URL}`);
  return { sklic: sklicIz(uid) };
});

// Tuje podjetje brez evrskega računa: pregled skrbnika; za EU podjetja prej preverimo DDV številko v VIES (Evropska komisija).
const EU = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SK".split(" "));
async function vies(davcna) {
  const cc = davcna.slice(0, 2), st = davcna.slice(2);
  const r = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${cc}/vat/${encodeURIComponent(st)}`, { headers: { accept: "application/json" } });
  if (!r.ok) throw new Error("VIES " + r.status);
  const j = await r.json();
  if (j.userError && j.userError !== "VALID" && j.userError !== "INVALID") throw new Error("VIES " + j.userError);
  const cisto = (x) => (x && x !== "---" ? String(x).replace(/\s+/g, " ").trim().slice(0, 200) : "");
  return { veljavna: !!j.isValid, ime: cisto(j.name), naslov: cisto(j.address) };
}
exports.pregledPodjetja = onCall({ secrets: ["MAIL_PASS"] }, async (req) => {
  const uid = req.auth?.uid;
  if (!uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  const mRef = db.doc("mojstri/" + uid);
  const m = await mRef.get();
  if (!m.exists || !profilOk(m.data())) throw new HttpsError("failed-precondition", "Najprej izpolni profil.");
  const md = m.data(), cc = md.drzava || "SI";
  if (cc === "SI") throw new HttpsError("failed-precondition", "Najprej potrdi podjetje (nakazilo 0,01 €).");
  let v = null;
  if (EU.has(cc)) {
    try { v = await vies(String(md.davcna || "")); } catch (e) { console.warn("vies", uid, e.message); }
    if (v && !v.veljavna) throw new HttpsError("failed-precondition", "DDV številka v sistemu VIES ni veljavna. Preveri jo v profilu.");
  }
  await mRef.update({ preverjanje: { cakam: true, nacin: v ? "vies" : "rocno", sklic: sklicIz(uid), davcna: md.davcna || "", ...(v ? { vies: v } : {}), ob: FieldValue.serverTimestamp() } });
  await mod.posljiSkrbniku("Popravko: tuje podjetje čaka na pregled (" + cc + ")", `${md.ime || ""}, ${md.firma || ""}
DDV: ${md.davcna || "-"} · Telefon: ${md.tel || "-"}
VIES: ${v ? (v.veljavna ? "veljavna" : "NI veljavna") + (v.ime ? ", " + v.ime : "") + (v.naslov ? ", " + v.naslov : "") : EU.has(cc) ? "ni odgovora, preveri ročno" : "ni EU, preveri v registru države"}

Pregled: ${PREGLED_URL}`);
  return { ok: true, vies: v };
});

async function potrdiMojstra(mRef, md, kako) {
  await mRef.update({ preverjeno: { davcna: md.davcna || "", ob: FieldValue.serverTimestamp(), ...kako }, preverjanje: FieldValue.delete() });
  if (md.push) await sendApns([md.push], T(jzk(md), "Podjetje je potrjeno"), T(jzk(md), "Zdaj se lahko javljaš na dela."), { vloga: "M" });
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
/* ---------- spletna obvestila skrbniku (stran pregled, tudi kot aplikacija na iPhonu) ---------- */
// Ključa VAPID nastane ob prvi uporabi (nastavitve/webpush, bere samo strežnik); naročnine so v skrbnikPush.
async function vapid() {
  const ref = db.doc("nastavitve/webpush"), d = await ref.get();
  if (d.exists && d.data().javni) return d.data();
  const k = require("web-push").generateVAPIDKeys(), v = { javni: k.publicKey, zasebni: k.privateKey };
  await ref.set(v);
  return v;
}
async function pushSkrbniku(naslov, besedilo, pot = "/") {
  const q = await db.collection("skrbnikPush").get();
  if (q.empty) return 0;
  const webpush = require("web-push"), v = await vapid();
  webpush.setVapidDetails("mailto:support@remako.si", v.javni, v.zasebni);
  let ok = 0;
  await Promise.all(q.docs.map(async (d) => {
    try { await webpush.sendNotification(d.data().sub, JSON.stringify({ naslov, besedilo, url: PREGLED_URL + pot }), { TTL: 86400, urgency: "high" }); ok++; }
    catch (e) { if (e.statusCode === 404 || e.statusCode === 410) await d.ref.delete(); else console.warn("webpush", e.statusCode, e.body || e.message); }
  }));
  return ok;
}
// Mojster čaka na potrditev: obvestilo na telefon skrbnika (in e-pošta, ki pride vedno).
async function obvestiOMojstru(uid, m, dogodek, nakazilo) {
  const kje = [(m.stroke || []).map(strokaIme).join(", "), (m.regije || []).join(", ")].filter(Boolean).join(" · ");
  await pushSkrbniku(dogodek + ": " + (m.firma || m.ime || "mojster"), [m.ime, kje, "0,01 €: " + nakazilo].filter(Boolean).join("\n"), "/?popravko=" + encodeURIComponent(uid))
    .catch((e) => console.warn("pushSkrbniku", e.message));
}

// Vsako novo nakazilo 0,01 € s sklicem: e-pošta skrbniku.
const IZID = { potrjen: "samodejno potrjen", "ročno": "ime plačnika se ne ujema, potrdi ročno", "že potrjen": "že potrjen", "ni mojstra": "ni mojstra s tem sklicem" };
async function preglejInSporoci() {
  const r = await banka.preglej(potrdiMojstra);
  for (const x of r.rezultat || []) {
    if (x.uid && x.izid !== "že potrjen") {
      const m = (await db.doc("mojstri/" + x.uid).get()).data() || {};
      await obvestiOMojstru(x.uid, m, x.izid === "potrjen" ? "Mojster samodejno potrjen" : "Mojster čaka na potrditev", "prispelo" + (x.izid === "ročno" ? " (ime plačnika " + (x.placnik || "-") + " se ne ujema)" : ""));
    }
    await mod.posljiSkrbniku(`Popravko: nakazilo 0,01 € (${IZID[x.izid] || x.izid})`,
      `Plačnik: ${x.placnik || "-"}
IBAN: ${x.iban || "-"}
Sklic: ${x.sklic}
Podjetje: ${x.firma || "-"} (davčna ${x.davcna || "-"})

Pregled: ${PREGLED_URL}`);
  }
  return r;
}
exports.pregledBanke = onSchedule({ schedule: "every 5 minutes", region: "europe-west1", timeoutSeconds: 120, secrets: ["MAIL_PASS"] }, async () => {
  const r = await preglejInSporoci().catch((e) => ({ napaka: e.message }));
  if (r.rezultat?.length || r.napaka) console.log("pregledBanke", JSON.stringify(r));
});

// Nov mojster (profil ustvarjen v aplikaciji): e-pošta skrbniku.
exports.novMojster = onDocumentCreated({ document: "mojstri/{uid}", secrets: ["MAIL_PASS"] }, async (event) => {
  const m = event.data?.data();
  if (!m) return;
  await obvestiOMojstru(event.params.uid, m, "Nov mojster", "še ni nakazano");
  await mod.posljiSkrbniku("Popravko: nov mojster " + (m.firma || m.ime || ""),
    `${m.ime || ""}
Podjetje: ${m.firma || "-"}
Davčna: ${m.davcna || "-"}
Telefon: ${m.tel || "-"}
Stroke: ${(m.stroke || []).map(strokaIme).join(", ") || "-"}
Regije: ${(m.regije || []).join(", ") || "-"}

Pregled: ${PREGLED_URL}`);
});

// Skrbniški dostop: prijava z e-naslovom lastnikov (povezava v e-pošti) ali koda; v bazi je samo njen SHA-256 (nastavitve/skrbnik.hash).
const SKRBNIKI = ["teo.simonic7@gmail.com", "urska.repusic@gmail.com", "myedgeofficial@gmail.com"];
const jeLastnik = (req) => !!req.auth?.token?.email_verified && SKRBNIKI.includes(String(req.auth.token.email || "").toLowerCase());
// Naprava (npr. stran pregled na začetnem zaslonu iPhona, ki ne vidi prijave iz Safarija): lastnik jo potrdi s povezavo v e-pošti,
// v bazi je samo SHA-256 njene skrivnosti (skrbnikNaprave/{hash}).
const hashNaprave = (x) => crypto.createHash("sha256").update(String(x)).digest("hex");
async function dostop(req) {
  if (jeLastnik(req)) return;
  const n = String(req.data?.naprava || "");
  if (n.length >= 32 && (await db.doc("skrbnikNaprave/" + hashNaprave(n)).get()).exists) return;
  await skrbnik(req.data?.koda);
}
async function skrbnik(koda) {
  const h = (await db.doc("nastavitve/skrbnik").get()).data()?.hash;
  const moj = crypto.createHash("sha256").update(String(koda || "")).digest("hex");
  if (!h || h.length !== moj.length || !crypto.timingSafeEqual(Buffer.from(h), Buffer.from(moj))) throw new HttpsError("permission-denied", "Napačna koda.");
}
exports.skrbnik = onCall({ secrets: ["MAIL_PASS"], memory: "512MiB", timeoutSeconds: 120 }, async (req) => {
  if (!req.auth?.uid) throw new HttpsError("unauthenticated", "Ni prijave.");
  await dostop(req);
  return skrbnikAkcija(req);
});

// Popravko na stats.remako.si (repozitorij remako-trezor): ista dejanja kot zgoraj, prijava z Google računom projekta byurska-studio
// (Teo še s kodo 2FA, enako kot stats.remako.si), tudi obvestila na telefon.
const STATS_IZVORI = ["https://stats.remako.si", "https://remako-stats.web.app", "https://remako-stats.firebaseapp.com"];
const STATS_SKRBNIKI = { "teo.simonic7@gmail.com": true, "urska.repusic@gmail.com": false, "repusicurska@gmail.com": false };
const STATS_DEJANJA = new Set(["vsi", "statistika", "dela", "izbrisi-delo", "izbrisi-mojstra", "potrdi", "zavrni", "banka-stanje", "banka-povezi", "banka-preglej", "push-kljuc", "push-naroci", "push-test"]);
const studio = () => admin.apps.find((a) => a.name === "studio") || admin.initializeApp({ projectId: "byurska-studio" }, "studio");
exports.pregledStats = onRequest({ cors: STATS_IZVORI, secrets: ["MAIL_PASS"], memory: "512MiB", timeoutSeconds: 120 }, async (req, res) => {
  try {
    if (req.method !== "POST") return res.status(405).json({ napaka: "samo POST" });
    const z = await studio().auth().verifyIdToken(String(req.get("authorization") || "").replace(/^Bearer /, ""));
    const email = String(z.email || "").toLowerCase();
    if (!z.email_verified || !(email in STATS_SKRBNIKI)) return res.status(403).json({ napaka: "ni dostopa" });
    if (STATS_SKRBNIKI[email] && z.firebase?.sign_in_second_factor !== "totp") return res.status(403).json({ napaka: "potrebna koda 2FA" });
    const data = req.body || {};
    if (!STATS_DEJANJA.has(data.akcija)) return res.status(400).json({ napaka: "Neznano dejanje." });
    res.json(await skrbnikAkcija({ data, auth: { uid: "stats:" + email, token: { email } } }));
  } catch (e) {
    console.warn("pregledStats", e.message);
    res.status(e.httpErrorCode?.status || (String(e.code || "").startsWith("auth/") ? 401 : 500)).json({ napaka: e.message });
  }
});

async function skrbnikAkcija(req) {
  const akcija = req.data?.akcija;
  if (akcija === "seznam") {
    const q = await db.collection("mojstri").where("preverjanje.cakam", "==", true).limit(100).get();
    return { mojstri: q.docs.map((d) => { const m = d.data(); return { uid: d.id, ime: m.ime, firma: m.firma, davcna: m.davcna || "", tel: m.tel || "", slika: m.slika || "", sklic: m.preverjanje?.sklic || sklicIz(d.id), placnik: m.preverjanje?.placnik || "", ob: m.preverjanje?.ob?.toMillis() || 0, drzava: m.drzava || "SI", nacin: m.preverjanje?.nacin || "nakazilo", vies: m.preverjanje?.vies || null }; }) };
  }
  if (akcija === "ping") return { ok: true };
  if (akcija === "pari") {
    const par = String(req.data?.par || "");
    if (!jeLastnik(req) || !/^[0-9a-f]{64}$/.test(par)) throw new HttpsError("permission-denied", "Potrditev naprave ni uspela.");
    await db.doc("skrbnikNaprave/" + par).set({ kdo: req.auth.token.email, ob: FieldValue.serverTimestamp() });
    return { ok: true };
  }
  // Spletna obvestila skrbniku: javni ključ, prijava naprave, preizkus.
  if (akcija === "push-kljuc") return { kljuc: (await vapid()).javni };
  if (akcija === "push-naroci") {
    const sub = req.data?.sub;
    if (!sub?.endpoint || !/^https:\/\//.test(sub.endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new HttpsError("invalid-argument", "Napačna naročnina.");
    const id = crypto.createHash("sha256").update(sub.endpoint).digest("hex").slice(0, 40);
    await db.doc("skrbnikPush/" + id).set({ sub: { endpoint: sub.endpoint, keys: { p256dh: String(sub.keys.p256dh), auth: String(sub.keys.auth) } }, kdo: req.auth.token?.email || "koda", ob: FieldValue.serverTimestamp() });
    return { ok: true };
  }
  if (akcija === "push-test") return { poslano: await pushSkrbniku("Popravko: obvestila delujejo", "Ko se registrira nov mojster, dobiš obvestilo sem.") };
  if (akcija === "statistika") return require("./statistika").zberi();
  // Vsa dela (zadnjih 300) in brisanje kateregakoli dela, za stran pregled.
  if (akcija === "dela") {
    const ms = (t) => t?.toMillis?.() || 0;
    const q = await db.collection("dela").orderBy("ustvarjeno", "desc").limit(300).get();
    return { dela: q.docs.map((d) => { const j = d.data(); return {
      id: d.id, opis: j.opis || "", stroka: strokaIme(j.stroka), kraj: j.kraj || "", regija: j.regija || "", kdaj: j.kdaj || "", status: j.status || "odprto",
      ustvarjeno: ms(j.ustvarjeno), slika: j.slika || "", slik: (j.slike || []).length, obvesceni: j.obvesceni || 0, mojster: !!j.mojster, lastnik: j.lastnik || ""
    }; }) };
  }
  if (akcija === "izbrisi-delo") {
    const ids = (Array.isArray(req.data?.ids) ? req.data.ids : [req.data?.id]).map((x) => String(x || "")).filter(Boolean).slice(0, 100);
    for (const id of ids) {
      const dRef = db.doc("dela/" + id), d = await dRef.get();
      if (d.exists) await pobrisiDelo(dRef, d.data());
    }
    return { ok: true, izbrisanih: ids.length };
  }
  if (akcija === "izbrisi-mojstra") {
    const uid = String(req.data?.uid || "");
    if (!uid || !(await db.doc("mojstri/" + uid).get()).exists) throw new HttpsError("not-found", "Mojstra ni.");
    await pobrisiMojstra(uid);
    return { ok: true };
  }
  // Vsi mojstri za stran pregled (popravko.pregled.nakupko.com).
  if (akcija === "vsi") {
    const ms = (t) => t?.toMillis?.() || 0;
    const [q, b] = await Promise.all([db.collection("mojstri").get(), banka.stanje()]);
    const mojstri = q.docs.map((d) => {
      const m = d.data(), p = m.preverjanje || {}, v = m.preverjeno;
      const potrjen = !!v && v.davcna === (m.davcna || "");
      return {
        uid: d.id, ime: m.ime || "", firma: m.firma || "", davcna: m.davcna || "", tel: m.tel || "", slika: m.slika || "",
        stroke: (m.stroke || []).map(strokaIme), regije: m.regije || [], ustvarjen: ms(d.createTime), posodobljen: ms(m.posodobljeno),
        narocninaDo: ms(m.narocninaDo), preizkus: !!m.preizkusPorabljen, transakcija: !!m.transakcija, testni: testnaFirma(m.firma),
        stanje: potrjen ? "potrjen" : p.cakam ? "caka" : p.zavrnjeno ? "zavrnjen" : "ni",
        preverjeno: v ? { samodejno: !!v.samodejno, placnik: v.placnik || "", iban: v.iban || "", ob: ms(v.ob), davcna: v.davcna || "" } : null,
        sklic: p.sklic || sklicIz(d.id), placnik: p.placnik || "", iban: p.iban || "", cakaOd: ms(p.ob),
        ujema: p.placnik ? banka.ujema(p.placnik, m.firma) : null
      };
    }).sort((a, b) => b.ustvarjen - a.ustvarjen);
    return { mojstri, banka: b };
  }
  if (akcija === "potrdi" || akcija === "zavrni") {
    const mRef = db.doc("mojstri/" + String(req.data?.uid || ""));
    const m = await mRef.get();
    if (!m.exists) throw new HttpsError("not-found", "Mojstra ni.");
    const md = m.data();
    if (akcija === "potrdi") return potrdiMojstra(mRef, md, { samodejno: false });
    await mRef.update({ preverjanje: { cakam: false, zavrnjeno: true, sklic: sklicIz(m.id), ob: FieldValue.serverTimestamp() } });
    if (md.push) await sendApns([md.push], T(jzk(md), "Nakazila nismo našli"), T(jzk(md), "Preveri, da si nakazal s TRR podjetja in s pravim sklicem."), { vloga: "M" });
    return { ok: true };
  }
  if (akcija === "banka-stanje") return banka.stanje();
  if (akcija === "banka-povezi") {
    try { return { url: await banka.povezi() }; } catch (e) { throw new HttpsError("failed-precondition", e.message); }
  }
  if (akcija === "banka-preglej") {
    try { return await preglejInSporoci(); } catch (e) { throw new HttpsError("unavailable", e.message); }
  }
  throw new HttpsError("invalid-argument", "Neznano dejanje.");
}

/* ---------- brisanje podatkov ---------- */
// Skrbnik izbriše mojstra: profil, ponudbe, ocene, slike. Dela, ki jih je imel prevzeta, se znova odprejo in stranka dobi obvestilo.
async function pobrisiMojstra(uid) {
  const brez = { mojster: FieldValue.delete(), mojsterIme: FieldValue.delete(), mojsterFirma: FieldValue.delete(), mojsterDavcna: FieldValue.delete(), mojsterPreverjen: FieldValue.delete(),
    mojsterSlika: FieldValue.delete(), termin: FieldValue.delete(), cena: FieldValue.delete(), prevzeto: FieldValue.delete(), naPoti: FieldValue.delete(), opomnik: FieldValue.delete() };
  const dela = await db.collection("dela").where("mojster", "==", uid).get();
  for (const d of dela.docs) {
    const dd = d.data(), kRef = d.ref.collection("zasebno").doc("kontakt");
    if (dd.status === "prevzeto") {
      await d.ref.update({ ...brez, status: "odprto", odpovedano: FieldValue.serverTimestamp() });
      const ost = await db.collection("ponudbe").where("delo", "==", d.id).get();
      await Promise.all(ost.docs.filter((x) => x.data().status === "odlozeno").map((x) => x.ref.update({ status: "caka" })));
      const k = await kRef.get();
      if (k.exists) await kRef.update({ mojsterTel: FieldValue.delete() });
      if (k.data()?.push) await sendApns([k.data().push], "Mojster ni več na voljo", (dd.opis || strokaIme(dd.stroka)) + ". Naročilo je znova odprto.", { vloga: "N", delo: d.id }).catch(() => {});
    } else {
      await d.ref.update({ mojsterSlika: FieldValue.delete(), mojsterDavcna: FieldValue.delete() });
      await kRef.set({ mojsterTel: FieldValue.delete() }, { merge: true });
    }
  }
  const [pon, oc] = await Promise.all([db.collection("ponudbe").where("mojster", "==", uid).get(), db.collection("ocene").where("za", "==", uid).get()]);
  await Promise.all([...pon.docs, ...oc.docs].map((x) => x.ref.delete()));
  await Promise.all([db.doc("mojstri/" + uid).delete(), db.doc("profili/" + uid).delete()]);
  await admin.storage().bucket().deleteFiles({ prefix: "profil/" + uid + "/" }).catch((e) => console.warn("profil", e.message));
  console.log("skrbnik izbrisal mojstra", uid, "del", dela.size, "ponudb", pon.size);
}
// Javno klicljiva (aplikacija); brez tega je Cloud Run zavrnil klic in brisanje računa ni delovalo.
exports.izbrisi = onCall({ invoker: "public" }, async (req) => {
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

// Statistika za nadzorno ploščo Nakupko.
exports.statistika = require("./statistika").statistika;
