// Besedila obvestil; čas termina v časovnem pasu prejemnika (privzeto slovenskem; strežnik teče v UTC).
const { T } = require("./prevodi");
const STROKE = {
  vodovod: "Vodovodar", elektrika: "Električar", keramika: "Keramičar", pleskanje: "Pleskar", mizarstvo: "Mizar",
  montaza: "Montaža pohištva", ogrevanje: "Ogrevanje in klima", streha: "Krovec", vrt: "Vrtnar", ciscenje: "Čiščenje",
  selitve: "Selitve in prevoz", drugo: "Hišnik", tla: "Talne obloge", zidar: "Zidar in fasade",
  okna: "Okna, vrata, senčila", aparati: "Gospodinjski aparati"
};
const strokaIme = (k, jezik = "sl") => T(jezik, STROKE[k] || k);

function deli(ms, tz = "Europe/Ljubljana") {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { dan: `${o.year}-${o.month}-${o.day}`, ura: `${Number(o.hour)}:${o.minute}`, dt: Number(o.day), mes: Number(o.month), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
}
const V_DAN = ["v nedeljo", "v ponedeljek", "v torek", "v sredo", "v četrtek", "v petek", "v soboto"];
function opisTermina(ms, now = Date.now(), jezik = "sl", tz = "") {
  tz = veljavenPas(tz) ? tz : "Europe/Ljubljana";
  const t = deli(ms, tz), d0 = deli(now, tz);
  const razlika = Math.round((Date.parse(t.dan) - Date.parse(d0.dan)) / 864e5);
  if (razlika === 0) return T(jezik, "danes ob {0}", t.ura);
  if (razlika === 1) return T(jezik, "jutri ob {0}", t.ura);
  if (jezik !== "sl") {
    const dan = new Intl.DateTimeFormat(jezik, razlika > 1 && razlika < 7 ? { weekday: "long", timeZone: tz } : { day: "numeric", month: "numeric", timeZone: tz }).format(new Date(ms));
    return T(jezik, "@dan ob", t.ura, dan);
  }
  if (razlika > 1 && razlika < 7) return `${V_DAN[t.wd]} ob ${t.ura}`;
  return `${t.dt}. ${t.mes}. ob ${t.ura}`;
}
function veljavenPas(tz) {
  if (!tz) return false;
  try { new Intl.DateTimeFormat("en", { timeZone: tz }); return true; } catch (e) { return false; }
}
// Slovenska davčna številka: 8 števk, kontrolna števka po modulu 11 (enako kot v aplikaciji).
// Testni mojster (samo za preizkušanje lastnikov): sme brez davčne številke.
const TESTNA_FIRMA = "sraufnciger";
function testnaFirma(f) {
  return String(f || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "").includes(TESTNA_FIRMA);
}
function veljavnaDavcna(v) {
  const s = String(v || "");
  if (!/^[1-9]\d{7}$/.test(s)) return false;
  let vsota = 0;
  for (let i = 0; i < 7; i++) vsota += Number(s[i]) * (8 - i);
  let k = 11 - (vsota % 11);
  if (k === 11) return false;
  if (k === 10) k = 0;
  return k === Number(s[7]);
}

// Sklic za potrditveno nakazilo 0,01 €: SI00 + 8 števk iz uid (enako kot v aplikaciji).
function sklicIz(uid) {
  let h = 2166136261;
  for (const c of String(uid)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return "SI00 " + String(h % 1e8).padStart(8, "0");
}
// Mojster je preverjen, če je potrdil nakazilo s TRR podjetja s to davčno (ali je testni račun).
const jePreverjen = (m) => !!m && (testnaFirma(m.firma) || (!!m.preverjeno && m.preverjeno.davcna === (m.davcna || "")));
// Tuja DDV ali davčna številka (s predpono države, ne slovenska); preverja jo aplikacija enako.
const veljavnaTuja = (s) => /^[A-Z]{2}[0-9A-Z]{4,14}$/.test(String(s || "")) && !String(s).startsWith("SI") && (String(s).match(/\d/g) || []).length >= 4;
// Profil je popoln: slovenski mojster s pravo davčno (kot doslej), tuji z DDV številko, ali testni račun.
const davcnaOk = (md) => veljavnaDavcna(md.davcna) || testnaFirma(md.firma) || (!!md.drzava && md.drzava !== "SI" && veljavnaTuja(md.davcna));
// Regije: slovenski ključi brez »-« (vsa = vsa Slovenija), tuji »de-by«, cela država »de-vsa«.
const drzavaRegije = (k) => (String(k || "").includes("-") ? String(k).split("-")[0].toUpperCase() : "SI");
function pokriva(r, delo) {
  if (r === delo) return true;
  if (r === "vsa") return !String(delo || "").includes("-");
  return String(r || "").endsWith("-vsa") && drzavaRegije(r) === drzavaRegije(delo);
}
module.exports = { opisTermina, strokaIme, veljavnaDavcna, veljavnaTuja, davcnaOk, testnaFirma, sklicIz, jePreverjen, pokriva, drzavaRegije, T };
