// Tuji mojstri (Fixko): samodejni pregled podjetja.
// - preberiDokument: AI (Gemini na Vertex AI, strežnik v EU) prebere potrdilo o registraciji (Gewerbeschein, izpis iz registra ...).
// - register: DDV številka v VIES (EU) ali brezplačen nacionalni register (Norveška); vrne uradno ime podjetja.
// - oceni: dokument, register in profil se morajo ujemati, dejavnost mora biti obrt.
// Samodejno potrdimo šele, ko se z imenom ujema še plačnik 0,01 € (banka): tako tuj dokument ne zadošča.
const { ujema } = require("./banka");

const EU = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SK".split(" "));
// Modeli po vrsti; prvi, ki obstaja, prebere dokument (AI_MODEL v .env ga zamenja).
const MODELI = (process.env.AI_MODEL || "gemini-2.5-flash,gemini-2.5-flash-lite,gemini-2.0-flash").split(",").map((x) => x.trim()).filter(Boolean);
const REGIJA_AI = process.env.AI_REGIJA || "europe-west1";

const NAVODILO = `You check documents uploaded by tradespeople (plumbers, electricians, tilers, painters, carpenters, roofers, builders, cleaners, gardeners, movers, handymen ...) who register on a home-repair marketplace.
The document should prove that the business is officially registered: a trade licence or business registration (e.g. Gewerbeschein, Gewerbeanmeldung, Handwerksrolle, GISA extract, Firmenbuch or Handelsregister extract, Kbis, visura camerale, KvK uittreksel, certificado censal, VAT registration certificate, court register extract).
Read it and answer only with JSON:
- vrsta: short name of the document type in English
- jeRegistracija: true if it is an official business/trade registration or VAT registration document
- ime: the registered business name exactly as written (for a sole trader the person's name with any trade name)
- lastnik: owner or managing person if shown, else ""
- stevilka: registration, tax or VAT number shown, else ""
- drzava: ISO 3166 alpha-2 country of the issuing authority
- dejavnost: registered business activity as written (short)
- obrt: true if the activity is construction, installation, repair, renovation, cleaning, gardening, moving or similar home services
- datum: issue date as YYYY-MM-DD if shown, else ""
- sumljivo: true if it looks edited, fake, incomplete, a sample, or not a document at all
- opomba: one short sentence in English with anything the reviewer should know`;
const SHEMA = {
  type: "OBJECT",
  properties: Object.fromEntries([
    ...["vrsta", "ime", "lastnik", "stevilka", "drzava", "dejavnost", "datum", "opomba"].map((k) => [k, { type: "STRING" }]),
    ...["jeRegistracija", "obrt", "sumljivo"].map((k) => [k, { type: "BOOLEAN" }])
  ]),
  required: ["vrsta", "jeRegistracija", "ime", "stevilka", "drzava", "dejavnost", "obrt", "sumljivo"]
};
const kratko = (x, n = 200) => String(x ?? "").replace(/\s+/g, " ").trim().slice(0, n);

// Dokument (slika ali PDF) → podatki z dokumenta ali null, če ga AI ni prebral.
async function preberiDokument(vsebina, tip) {
  const { GoogleAuth } = require("google-auth-library");
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] });
  const projekt = process.env.GCLOUD_PROJECT || (await auth.getProjectId());
  const zeton = (await (await auth.getClient()).getAccessToken()).token;
  const telo = JSON.stringify({
    contents: [{ role: "user", parts: [{ inlineData: { mimeType: tip, data: Buffer.from(vsebina).toString("base64") } }, { text: NAVODILO }] }],
    generationConfig: { temperature: 0, responseMimeType: "application/json", responseSchema: SHEMA }
  });
  for (const model of MODELI) {
    const r = await fetch(`https://${REGIJA_AI}-aiplatform.googleapis.com/v1/projects/${projekt}/locations/${REGIJA_AI}/publishers/google/models/${model}:generateContent`,
      { method: "POST", headers: { Authorization: "Bearer " + zeton, "content-type": "application/json" }, body: telo });
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) { console.warn("ai model ni na voljo", model); continue; }
    if (!r.ok) throw new Error("AI " + r.status + " " + JSON.stringify(j).slice(0, 300));
    const d = JSON.parse(j.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "{}");
    return {
      vrsta: kratko(d.vrsta, 80), jeRegistracija: d.jeRegistracija === true, ime: kratko(d.ime), lastnik: kratko(d.lastnik), stevilka: kratko(d.stevilka, 40),
      drzava: kratko(d.drzava, 2).toUpperCase(), dejavnost: kratko(d.dejavnost), obrt: d.obrt === true, datum: kratko(d.datum, 10), sumljivo: d.sumljivo === true,
      opomba: kratko(d.opomba, 300), model
    };
  }
  throw new Error("AI: noben model ni na voljo");
}

// Uradni register: { vir, veljavna, ime, naslov } ali null (register ni dosegljiv ali ga za to državo ni).
async function register(cc, davcna) {
  const st = String(davcna || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  const cisto = (x) => (x && x !== "---" ? kratko(x) : "");
  if (EU.has(cc)) {
    // Grčija ima v VIES oznako EL.
    const pred = st.slice(0, 2) === "GR" ? "EL" : st.slice(0, 2);
    const r = await fetch(`https://ec.europa.eu/taxation_customs/vies/rest-api/ms/${pred}/vat/${encodeURIComponent(st.slice(2))}`, { headers: { accept: "application/json" } });
    if (!r.ok) throw new Error("VIES " + r.status);
    const j = await r.json();
    if (j.userError && j.userError !== "VALID" && j.userError !== "INVALID") throw new Error("VIES " + j.userError);
    return { vir: "VIES", veljavna: !!j.isValid, ime: cisto(j.name), naslov: cisto(j.address) };
  }
  if (cc === "NO") {
    const org = st.replace(/^NO/, "").replace(/MVA$/, "");
    const r = await fetch(`https://data.brreg.no/enhetsregisteret/api/enheter/${encodeURIComponent(org)}`, { headers: { accept: "application/json" } });
    if (r.status === 404 || r.status === 410) return { vir: "Brønnøysund", veljavna: false, ime: "", naslov: "" };
    if (!r.ok) throw new Error("Brreg " + r.status);
    const j = await r.json(), a = j.forretningsadresse || {};
    return { vir: "Brønnøysund", veljavna: !j.konkurs && !j.slettedato && !j.underAvvikling, ime: cisto(j.navn), naslov: cisto([...(a.adresse || []), a.postnummer, a.poststed].filter(Boolean).join(", ")) };
  }
  return null;
}

// Številki se ujemata, če ima krajša vsaj 6 števk in je v daljši (DE123456789 ↔ USt-IdNr. 123 456 789).
function stevilkiUjemata(a, b) {
  const x = String(a || "").replace(/\D/g, ""), y = String(b || "").replace(/\D/g, "");
  const [k, d] = x.length <= y.length ? [x, y] : [y, x];
  return k.length >= 6 && d.includes(k);
}

// Ocena brez omrežja (preizkusi): { ok, ime, razlogi } — ime je uradno ime, s katerim mora ujemati plačnik.
function oceni(md, dok, reg) {
  const cc = md.drzava || "", razlogi = [];
  if (!dok) return { ok: false, ime: reg?.ime || "", razlogi: ["AI dokumenta ni prebral, preveri ga ročno"] };
  if (!dok.jeRegistracija) razlogi.push(`dokument ni potrdilo o registraciji (${dok.vrsta || "neznano"})`);
  if (dok.sumljivo) razlogi.push("dokument je videti spremenjen ali nepopoln");
  if (!dok.obrt) razlogi.push(`dejavnost ni obrt (${dok.dejavnost || "ni navedena"})`);
  if (!dok.ime || !ujema(dok.ime, md.firma, cc || "XX")) razlogi.push(`ime na dokumentu (${dok.ime || "-"}) se ne ujema s podjetjem v profilu`);
  if (reg && !reg.veljavna) razlogi.push(`DDV številka ni veljavna v registru ${reg.vir}`);
  if (reg?.ime && dok.ime && !ujema(reg.ime, dok.ime, cc || "XX")) razlogi.push(`ime v registru ${reg.vir} (${reg.ime}) se ne ujema z dokumentom`);
  // Dokument mora biti od te DDV številke: ista številka na dokumentu ali isto ime v registru (iskanem po tej številki).
  if (!stevilkiUjemata(dok.stevilka, md.davcna) && !(reg?.veljavna && reg.ime && dok.ime && ujema(reg.ime, dok.ime, cc || "XX")))
    razlogi.push("dokumenta ni mogoče povezati z DDV številko iz profila");
  if (!reg) razlogi.push("register za to državo ni samodejno dostopen");
  return { ok: !razlogi.length, ime: reg?.ime || dok.ime || "", razlogi };
}

// Plačnik 0,01 € je ista firma kot na dokumentu in v registru.
const placnikUjema = (placnik, ocena, cc) => !!(placnik && ocena?.ok && ocena.ime && ujema(placnik, ocena.ime, cc || "XX"));

module.exports = { preberiDokument, register, oceni, stevilkiUjemata, placnikUjema, EU };
