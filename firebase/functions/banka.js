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
function ujema(placnik, firma) {
  const pom = (t) => cisto(t).split(" ").filter((w) => w.length >= 3 && !SPLOSNE.has(w));
  const a = new Set(pom(placnik)), f = [...new Set(pom(firma))];
  if (!f.length) return false;
  return f.filter((w) => a.has(w)).length >= Math.min(2, f.length);
}
const sklicV = (t) => { const m = String(t || "").replace(/\s/g, "").match(/SI00(\d{8})/i); return m ? "SI00 " + m[1] : ""; };

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
    sklic: sklicV(t.reference_number) || sklicV((t.remittance_information || []).join(" ")) })).filter((k) => k.sklic && !obdelani.has(k.id));
  const rezultat = [];
  if (kandidati.length) {
    const mojstri = await db().collection("mojstri").select("firma", "davcna", "preverjeno", "push").get();
    const poSklicu = new Map(mojstri.docs.map((d) => [sklicIz(d.id), d]));
    for (const k of kandidati) {
      const d = poSklicu.get(k.sklic);
      obdelani.add(k.id);
      if (!d) { rezultat.push({ sklic: k.sklic, izid: "ni mojstra" }); continue; }
      const m = d.data(), placnik = k.t.debtor?.name || "";
      if (m.preverjeno && m.preverjeno.davcna === (m.davcna || "")) { rezultat.push({ sklic: k.sklic, izid: "že potrjen" }); continue; }
      if (ujema(placnik, m.firma)) {
        await potrdi(d.ref, m, { samodejno: true, placnik, iban: k.t.debtor_account?.iban || "" });
        rezultat.push({ sklic: k.sklic, izid: "potrjen" });
      } else {
        // Ime se ne ujema: ostane skrbniku, ki vidi ime plačnika.
        await d.ref.update({ preverjanje: { cakam: true, sklic: k.sklic, davcna: m.davcna || "", placnik, iban: k.t.debtor_account?.iban || "", ob: FieldValue.serverTimestamp() } });
        rezultat.push({ sklic: k.sklic, izid: "ročno" });
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
