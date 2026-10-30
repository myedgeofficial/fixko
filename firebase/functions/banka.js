// Samodejna potrditev podjetja: Enable Banking (PSD2, samo branje) pregleda prilive na računu REMAKO.
// Ko najde 0,01 € s sklicem mojstra in se ime plačnika ujema s podjetjem, mojstra potrdi.
// Nastavitve in seja so v nastavitve/banka (berejo jih samo funkcije): appId, kljuc (PEM), seja, racun, veljaDo.
const crypto = require("crypto");
const admin = require("firebase-admin");
const { FieldValue, Timestamp } = require("firebase-admin/firestore");
const { sklicIz } = require("./besedila");

const API = process.env.EB_API || "https://api.enablebanking.com";
const IBAN = "SI56040000281806669";
const db = () => admin.firestore();
const ref = () => db().doc("nastavitve/banka");

function jwt(appId, kljuc) {
  const b = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const glava = b({ typ: "JWT", alg: "RS256", kid: appId }) + "." + b({ iss: "enablebanking.com", aud: "api.enablebanking.com", iat: now, exp: now + 3600 });
  return glava + "." + crypto.sign("RSA-SHA256", Buffer.from(glava), kljuc).toString("base64url");
}
async function eb(nast, method, pot, body) {
  const r = await fetch(API + pot, { method, headers: { Authorization: "Bearer " + jwt(nast.appId, nast.kljuc), "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text();
  if (!r.ok) throw new Error(`${method} ${pot}: ${r.status} ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : {};
}

// Skrbnik: začne povezavo z OTP (vrne naslov za prijavo v banko).
async function povezi() {
  const nast = (await ref().get()).data();
  if (!nast?.appId || !nast?.kljuc) throw new Error("Banka še ni nastavljena (manjka Application ID ali ključ).");
  const sez = await eb(nast, "GET", "/aspsps?country=SI");
  const otp = (sez.aspsps || []).find((a) => /otp/i.test(a.name));
  if (!otp) throw new Error("OTP banke ni na seznamu.");
  const dni = Math.min(180, Math.floor((otp.maximum_consent_validity || 15552000) / 86400));
  const state = crypto.randomBytes(16).toString("hex");
  const r = await eb(nast, "POST", "/auth", {
    access: { valid_until: new Date(Date.now() + dni * 864e5).toISOString() }, aspsp: { name: otp.name, country: "SI" },
    state, redirect_url: nast.redirect || "https://popravko.web.app/banka", psu_type: "business", language: "sl"
  });
  await ref().update({ state, stateOb: Date.now() });
  return r.url;
}
// Povratek iz banke (hosting /banka → ta funkcija): koda → seja, izberemo račun REMAKO.
async function seja(code, state) {
  const nast = (await ref().get()).data();
  if (!nast?.state || state !== nast.state || Date.now() - nast.stateOb > 30 * 60e3) throw new Error("Povezava je potekla, začni znova v aplikaciji.");
  const s = await eb(nast, "POST", "/sessions", { code });
  const racun = (s.accounts || []).find((a) => (a.account_id?.iban || "").replace(/\s/g, "") === IBAN) || (s.accounts || [])[0];
  if (!racun) throw new Error("Banka ni vrnila nobenega računa.");
  await ref().update({ seja: s.session_id, racun: racun.uid, iban: racun.account_id?.iban || "", veljaDo: Timestamp.fromDate(new Date(s.access?.valid_until || Date.now() + 90 * 864e5)), state: FieldValue.delete(), napaka: FieldValue.delete() });
  return racun.account_id?.iban || "";
}

const cisto = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  .replace(/\b(d\s*\.?\s*o\s*\.?\s*o|s\s*\.?\s*p|d\s*\.?\s*d|k\s*\.?\s*d|d\s*\.?\s*n\s*\.?\s*o)\b\.?/g, " ").replace(/[^a-z0-9]+/g, " ").trim();
// Ime plačnika na izpisku se ujema s podjetjem, če se ujema vsaj ena pomembna beseda (npr. »KOS INSTALACIJE MARKO KOS SP« ↔ »Kos inštalacije, Marko Kos s.p.«).
// Splošne besede ne štejejo; ujemati se morata vsaj dve pomembni besedi (ali edina, če ima ime samo eno).
const SPLOSNE = new Set("storitve storitev servis instalacije inst gradnje gradbenistvo gradbeni gradbena trgovina podjetje druzba inzeniring montaza montaze vodovod elektro zakljucna dela obrt obrtnik the and sistemi tehnika team group".split(" "));
// Tuja podjetja (drzava ≠ SI): odstranimo še tuje pravne oblike in pogoste splošne besede; slovensko ujemanje ostane, kot je.
const TUJE_OBLIKE = /\b(gmbh|ag|kg|ohg|ug|e\s*k|e\s*u|ltd|limited|llc|inc|plc|llp|sarl|sas|sasu|eurl|sa|srl|s\s*r\s*l|spa|s\s*p\s*a|snc|sas|sl|s\s*l|slu|bv|b\s*v|nv|n\s*v|vof|bvba|sprl|lda|unipessoal|sp\s*z\s*o\s*o|sp\s*j|j\s*d\s*o\s*o|obrt|zoo|s\s*r\s*o|kft|bt|zrt|ab|as|oy|aps)\b\.?/g;
const TUJE_SPLOSNE = new Set("bau bauunternehmen haustechnik sanitar heizung elektrotechnik malerbetrieb handwerk service services building construction plumbing electrical solutions company group home homes renovation renovations batiment travaux plomberie impianti edilizia costruzioni servizi construcciones reformas instalaciones servicios construcoes servicos bouw installatie installaties techniek usługi uslugi budownictwo instalacje gradnja usluge".split(" "));
function ujema(placnik, firma, drzava) {
  const tuje = !!drzava && drzava !== "SI";
  // Banke pišejo »MUELLER« za »Müller«: pri tujih poenotimo ue/oe/ae.
  const pom = (t) => (tuje ? cisto(t).replace(TUJE_OBLIKE, " ").replace(/ue/g, "u").replace(/oe/g, "o").replace(/ae/g, "a") : cisto(t)).split(" ").filter((w) => w.length >= 3 && !SPLOSNE.has(w) && !(tuje && TUJE_SPLOSNE.has(w)));
  const a = new Set(pom(placnik)), f = [...new Set(pom(firma))];
  if (!f.length) return false;
  return f.filter((w) => a.has(w)).length >= Math.min(2, f.length);
}
const sklicV = (t) => { const m = String(t || "").replace(/\s/g, "").match(/SI00(\d{8})/i); return m ? "SI00 " + m[1] : ""; };
// Tuje banke sklic včasih spremenijo (»SI00-1234 5678«, brez SI00): če SI00 ni, vzamemo 8-mestno število, ki ga potem poiščemo med mojstri.
const sklicTuj = (t) => { const m = String(t || "").replace(/[\s.-]/g, "").match(/(?:SI0{2}|SIOO)?(\d{8})(?!\d)/i); return m ? "SI00 " + m[1] : ""; };

// Vsakih 5 minut: novi prilivi 0,01 € → potrditev ali ročni pregled.
async function preglej(potrdi) {
  const nast = (await ref().get()).data();
  if (!nast?.seja || !nast?.racun) return { preskok: "ni seje" };
  if (nast.veljaDo && nast.veljaDo.toMillis() < Date.now()) return { preskok: "seja potekla" };
  const od = new Date(Date.now() - 5 * 864e5).toISOString().slice(0, 10);
  let tx = [], kljuc = "";
  try {
    do {
      const r = await eb(nast, "GET", `/accounts/${nast.racun}/transactions?date_from=${od}` + (kljuc ? `&continuation_key=${encodeURIComponent(kljuc)}` : ""));
      tx = tx.concat(r.transactions || []); kljuc = r.continuation_key || "";
    } while (kljuc && tx.length < 2000);
  } catch (e) { await ref().update({ napaka: String(e.message).slice(0, 300), zadnji: Date.now() }); throw e; }
  const obdelani = new Set(nast.obdelani || []);
  const nova = tx.filter((t) => t.credit_debit_indicator === "CRDT" && Number(t.transaction_amount?.amount) === 0.01 && t.transaction_amount?.currency === "EUR");
  const kandidati = nova.map((t) => ({ id: t.entry_reference || t.transaction_id || crypto.createHash("sha1").update(JSON.stringify(t)).digest("hex"), t,
    sklic: sklicV(t.reference_number) || sklicV((t.remittance_information || []).join(" ")) || "", tuj: sklicTuj((t.remittance_information || []).join(" ")) || sklicTuj(t.reference_number) }))
    .map((k) => (k.sklic ? k : { ...k, sklic: k.tuj, samoTuji: true })).filter((k) => k.sklic && !obdelani.has(k.id));
  const rezultat = [];
  if (kandidati.length) {
    const mojstri = await db().collection("mojstri").select("firma", "davcna", "preverjeno", "preverjanje", "ocena", "push", "drzava", "jezik").get();
    const poSklicu = new Map(mojstri.docs.map((d) => [sklicIz(d.id), d]));
    for (const k of kandidati) {
      const d = poSklicu.get(k.sklic);
      // Sklic brez »SI00« velja samo za tuje mojstre (slovenski tok ostane, kot je bil).
      if (k.samoTuji && (!d || (d.data().drzava || "SI") === "SI")) continue;
      obdelani.add(k.id);
      const placnik = k.t.debtor?.name || "", iban = k.t.debtor_account?.iban || "";
      if (!d) { rezultat.push({ sklic: k.sklic, izid: "ni mojstra", placnik, iban }); continue; }
      const m = d.data(), o = { sklic: k.sklic, placnik, iban, uid: d.id, firma: m.firma || "", davcna: m.davcna || "" };
      if (m.preverjeno && m.preverjeno.davcna === (m.davcna || "")) { rezultat.push({ ...o, izid: "že potrjen" }); continue; }
      // Tuji mojster: plačnik se mora ujemati z imenom s potrdila in iz registra (dokumentPodjetja), ne samo s profilom.
      const tuj = !!m.drzava && m.drzava !== "SI";
      const ocena = m.ocena && m.ocena.firma === (m.firma || "") ? m.ocena : null;
      if (tuj ? !!(ocena?.ok && ocena.ime && ujema(placnik, ocena.ime, m.drzava)) : ujema(placnik, m.firma, m.drzava)) {
        await potrdi(d.ref, m, { samodejno: true, placnik, iban });
        rezultat.push({ ...o, izid: "potrjen" });
      } else {
        // Ime se ne ujema (ali tuj mojster še nima potrdila): ostane skrbniku, ki vidi ime plačnika.
        await d.ref.update({ preverjanje: { cakam: true, ...(m.preverjanje?.nacin ? { nacin: m.preverjanje.nacin } : {}), sklic: k.sklic, davcna: m.davcna || "", placnik, iban, ob: FieldValue.serverTimestamp() } });
        rezultat.push({ ...o, izid: "ročno" });
      }
    }
  }
  await ref().update({ obdelani: [...obdelani].slice(-500), zadnji: Date.now(), napaka: FieldValue.delete() });
  return { prilivov: nova.length, rezultat };
}
async function stanje() {
  const n = (await ref().get()).data() || {};
  return { nastavljeno: !!(n.appId && n.kljuc), povezano: !!n.seja, iban: n.iban || "", veljaDo: n.veljaDo?.toMillis() || 0, zadnji: n.zadnji || 0, napaka: n.napaka || "" };
}
module.exports = { povezi, seja, preglej, stanje, ujema, sklicV };
