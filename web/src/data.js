import { t, jeSl, jz, imeDrzave } from "./i18n.js";
import { TUJE_REGIJE, drzavaRegije, jeVsa } from "./drzave.js";
// Stroke, regije in termini. Ključi stroke in regij se shranjujejo v bazo, zato jih ne preimenuj.
export const STROKE = [
  ["vodovod", "Vodovodar"], ["elektrika", "Električar"], ["keramika", "Keramičar"], ["pleskanje", "Pleskar"],
  ["tla", "Talne obloge"], ["zidar", "Zidar in fasade"], ["mizarstvo", "Mizar"], ["okna", "Okna, vrata, senčila"],
  ["montaza", "Montaža pohištva"], ["ogrevanje", "Ogrevanje in klima"], ["aparati", "Gospodinjski aparati"],
  ["streha", "Krovec"], ["vrt", "Vrtnar"], ["ciscenje", "Čiščenje"], ["selitve", "Selitve in prevoz"], ["drugo", "Hišnik, drugo"]
];
export const REGIJE = [
  ["lj", "Ljubljana z okolico"], ["mb", "Maribor in Podravje"], ["ce", "Celje in Savinjska"], ["kr", "Kranj in Gorenjska"],
  ["kp", "Koper in Obala"], ["nm", "Novo mesto in Dolenjska"], ["ms", "Murska Sobota in Pomurje"], ["ng", "Nova Gorica in Goriška"],
  ["sg", "Koroška"], ["kk", "Posavje"], ["za", "Zasavje"], ["po", "Postojna in Notranjska"]
];
export const KDAJ = ["Čim prej", "Ta teden", "Naslednji teden", "Kadarkoli"];
// Kdaj je stranka doma (neobvezno, več izbir) in okvirni znesek, da se mojster lažje odloči.
export const DOMA = ["Dopoldne", "Popoldne", "Zvečer", "Ob vikendih"];
export const BUDGET = ["Do 50 €", "50 do 150 €", "150 do 500 €", "500 do 1.500 €", "Nad 1.500 €", "Ne vem"];
export const URE = ["7:00", "8:00", "9:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00", "17:00", "18:00", "19:00"];

// Imena se prikažejo v jeziku aplikacije; v bazi ostanejo slovenski ključi in besedila (npr. kdaj »Čim prej«).
export const strokaIme = (k) => t((STROKE.find((s) => s[0] === k) || [k, k])[1]);
// Regije države: Slovenija kot doslej, tuje države iz drzave.js.
export const regijeDrzave = (cc) => (cc === "SI" ? REGIJE.map(([k, n]) => [k, t(n)]) : TUJE_REGIJE[cc] || []);
export function regijaIme(k) {
  if (k === "vsa") return t("Vsa Slovenija");
  if (jeVsa(k)) return t("Vsa država ({0})", imeDrzave(drzavaRegije(k)));
  if (!String(k).includes("-")) return t((REGIJE.find((r) => r[0] === k) || [k, k])[1]);
  return ((TUJE_REGIJE[drzavaRegije(k)] || []).find((r) => r[0] === k) || [k, k])[1];
}

const DNEVI = ["nedelja", "ponedeljek", "torek", "sreda", "četrtek", "petek", "sobota"];
// Naslednjih 7 dni za izbiro termina: Danes, Jutri, nato imena dni.
export function dnevi(now = new Date()) {
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const dan = jeSl() ? DNEVI[d.getDay()] : d.toLocaleDateString(jz(), { weekday: "long" });
    const ime = i === 0 ? t("Danes") : i === 1 ? t("Jutri") : dan[0].toUpperCase() + dan.slice(1);
    out.push({ ime, datum: jeSl() ? `${d.getDate()}. ${d.getMonth() + 1}.` : d.toLocaleDateString(jz(), { day: "numeric", month: "numeric" }), iso: d.toISOString().slice(0, 10), d });
  }
  return out;
}
// Ure, ki so na izbrani dan še v prihodnosti (vsaj 1 h od zdaj).
export function prosteUre(dan, now = new Date()) {
  return URE.filter((u) => {
    const [h, m] = u.split(":").map(Number);
    const t = new Date(dan.d.getFullYear(), dan.d.getMonth(), dan.d.getDate(), h, m);
    return t - now >= 3600e3;
  });
}
// »jutri ob 8:00« / »v četrtek ob 14:00« iz časa termina.
export function opisTermina(ms, now = new Date()) {
  const d = new Date(ms);
  const dan0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const razlika = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()) - dan0) / 864e5);
  const ura = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  if (razlika === 0) return t("danes ob {0}", ura);
  if (razlika === 1) return t("jutri ob {0}", ura);
  if (!jeSl()) return t("@dan ob", ura, razlika > 1 && razlika < 7 ? d.toLocaleDateString(jz(), { weekday: "long" }) : d.toLocaleDateString(jz(), { day: "numeric", month: "numeric" }));
  if (razlika > 1 && razlika < 7) return `${["v nedeljo", "v ponedeljek", "v torek", "v sredo", "v četrtek", "v petek", "v soboto"][d.getDay()]} ob ${ura}`;
  return `${d.getDate()}. ${d.getMonth() + 1}. ob ${ura}`;
}
export function pred(ms, now = Date.now()) {
  const s = Math.max(0, (now - ms) / 1000);
  if (s < 90) return t("pravkar");
  if (s < 3600) return t("pred {0} min", Math.round(s / 60));
  if (s < 86400) return t("pred {0} h", Math.round(s / 3600));
  const d = Math.round(s / 86400);
  return d === 1 ? t("včeraj") : t("pred {0} dnevi", d);
}
// Telefon: dovolimo +, številke in presledke; vsaj 8 številk.
export function veljavenTel(t) {
  const st = String(t || "").replace(/[^\d]/g, "");
  return /^[+\d][\d\s/-]*$/.test(String(t || "").trim()) && st.length >= 8 && st.length <= 15;
}
// Slovenska davčna številka: 8 števk, zadnja je kontrolna (modul 11, uteži 8..2). Sprejme tudi "SI 12345678".
// Testni mojster (samo za preizkušanje lastnikov): sme brez davčne številke.
const TESTNA_FIRMA = "sraufnciger";
export function testnaFirma(f) {
  return String(f || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "").includes(TESTNA_FIRMA);
}
export function veljavnaDavcna(v) {
  const s = String(v || "").toUpperCase().replace(/^SI/, "").replace(/\s/g, "");
  if (!/^[1-9]\d{7}$/.test(s)) return false;
  let vsota = 0;
  for (let i = 0; i < 7; i++) vsota += Number(s[i]) * (8 - i);
  let k = 11 - (vsota % 11);
  if (k === 11) return false;
  if (k === 10) k = 0;
  return k === Number(s[7]);
}
export const cistaDavcna = (v) => String(v || "").toUpperCase().replace(/^SI/, "").replace(/\s/g, "");
// Tuja DDV ali davčna številka: s predpono države (DE123456789; Grčija EL). Slovenske tu ne sprejmemo.
export function cistaTuja(v, cc) {
  const s = String(v || "").toUpperCase().replace(/[^0-9A-Z]/g, "");
  return /^[A-Z]{2}/.test(s) ? s : (cc === "GR" ? "EL" : cc) + s;
}
export function veljavnaTuja(v, cc) {
  const s = cistaTuja(v, cc);
  return /^[A-Z]{2}[0-9A-Z]{4,14}$/.test(s) && !s.startsWith("SI") && (s.match(/\d/g) || []).length >= 4;
}
// Verzija pogojev, ki jih mojster sprejme (ob spremembi pogojev jo povečaj, da jih sprejme znova).
export const POGOJI_VERZIJA = "2026-10-12";
// Zaenkrat je Popravko brezplačen za vse, tudi za mojstre (samo oglasna pasica). Naročnino vklopimo kasneje.
export const BREZPLACNO = true;

// Sklic za potrditveno nakazilo 0,01 € (enako kot na strežniku).
export function sklicIz(uid) {
  let h = 2166136261;
  for (const c of String(uid)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return "SI00 " + String(h % 1e8).padStart(8, "0");
}
export const jePreverjen = (m) => !!m && (testnaFirma(m.firma) || (!!m.preverjeno && m.preverjeno.davcna === (m.davcna || "")));

// Dela, kjer je pomembna velikost površine: stranka lahko neobvezno vpiše približno m², da mojster ve, kaj ga čaka.
export const S_POVRSINO = ["pleskanje", "keramika", "tla", "zidar", "streha", "ciscenje", "vrt"];
export const imaPovrsino = (k) => S_POVRSINO.includes(k);
// Približno m² iz besedila (vpis ali opis, npr. »dnevna soba 25 m2«); prazno, če ni smiselne številke.
export function m2Iz(t) {
  const s = String(t || "").replace(",", ".");
  const m = s.match(/(\d+(?:\.\d+)?)\s*(?:m2|m²|kvadrat|kv\.?\s*m)/i) || (/^\s*\d+(?:\.\d+)?\s*$/.test(s) ? [0, s] : null);
  const n = m ? Math.round(Number(m[1])) : 0;
  return n >= 1 && n <= 100000 ? n : 0;
}
