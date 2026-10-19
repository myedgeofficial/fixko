// Moderacija slik in objav:
// - pregledSlik: Google Cloud Vision (SafeSearch, strežnik v EU) oceni slike del; gole, nasilne in krvave zavrnemo.
// - posljiSkrbniku: e-pošta skrbniku (support@remako.si), če sta nastavljena MAIL_USER in MAIL_PASS (Gmail z geslom za aplikacije).
const STOPNJE = { UNKNOWN: 0, VERY_UNLIKELY: 1, UNLIKELY: 2, POSSIBLE: 3, LIKELY: 4, VERY_LIKELY: 5 };
// Pragovi: gola telesa že pri LIKELY, izzivalno (racy) in nasilje šele pri VERY_LIKELY, da ne zavrnemo kopalnic in polomljenih stvari.
const PRAGOVI = { adult: 4, racy: 5, violence: 5, medical: 5 };
// Vrne razlog ("adult", "violence" ...) ali "" za primerno sliko.
function neprimerno(ss) {
  if (!ss) return "";
  for (const [k, prag] of Object.entries(PRAGOVI)) if ((STOPNJE[ss[k]] || 0) >= prag) return k;
  return "";
}

// Povezava za prenos (getDownloadURL) → gs://vedro/pot. Druge povezave (emulator) vrnejo "".
function gsIz(url) {
  const m = /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/([^/]+)\/o\/([^?]+)/.exec(String(url || ""));
  return m ? "gs://" + m[1] + "/" + decodeURIComponent(m[2]) : "";
}
const potIz = (url) => gsIz(url).replace(/^gs:\/\/[^/]+\//, "");

// Pregleda do 16 slik naenkrat. Vrne [{ url, razlog }] samo za neprimerne.
// Ob napaki Visiona slike spustimo naprej (prijave jih še vedno ujamejo) in napako zapišemo v dnevnik.
async function pregledSlik(urls) {
  const slike = [...new Set(urls.filter(Boolean))].map((url) => ({ url, gs: gsIz(url) })).filter((s) => s.gs).slice(0, 16);
  if (!slike.length) return [];
  try {
    const { GoogleAuth } = require("google-auth-library");
    const zeton = await (await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient()).getAccessToken();
    const r = await fetch("https://eu-vision.googleapis.com/v1/images:annotate", {
      method: "POST", headers: { Authorization: "Bearer " + zeton.token, "content-type": "application/json" },
      body: JSON.stringify({ requests: slike.map((s) => ({ image: { source: { imageUri: s.gs } }, features: [{ type: "SAFE_SEARCH_DETECTION" }] })) })
    });
    const j = await r.json();
    if (!r.ok) { console.error("vision", r.status, JSON.stringify(j).slice(0, 500)); return []; }
    return (j.responses || []).map((x, i) => {
      if (x.error) console.warn("vision slika", slike[i].gs, x.error.message);
      return { url: slike[i].url, razlog: neprimerno(x.safeSearchAnnotation), ocena: x.safeSearchAnnotation || null };
    }).filter((x) => x.razlog);
  } catch (e) { console.error("vision", e); return []; }
}

async function posljiSkrbniku(zadeva, besedilo) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASS) { console.log("skrbnik (e-pošta ni nastavljena):", zadeva); return; }
  try {
    const nodemailer = require("nodemailer");
    const t = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } });
    await t.sendMail({ from: `Popravko <${process.env.MAIL_USER}>`, to: process.env.MAIL_TO || "support@remako.si", subject: zadeva, text: besedilo });
  } catch (e) { console.error("e-pošta", e.message); }
}

module.exports = { neprimerno, gsIz, potIz, pregledSlik, posljiSkrbniku };
