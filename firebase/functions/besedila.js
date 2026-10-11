// Besedila obvestil; čas termina v slovenskem časovnem pasu (strežnik teče v UTC).
const STROKE = {
  vodovod: "Vodovodar", elektrika: "Električar", keramika: "Keramičar", pleskanje: "Pleskar", mizarstvo: "Mizar",
  montaza: "Montaža pohištva", ogrevanje: "Ogrevanje in klima", streha: "Krovec", vrt: "Vrtnar", ciscenje: "Čiščenje",
  selitve: "Selitve in prevoz", drugo: "Hišnik"
};
const strokaIme = (k) => STROKE[k] || k;

function deli(ms) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Ljubljana", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
  const o = Object.fromEntries(f.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  return { dan: `${o.year}-${o.month}-${o.day}`, ura: `${Number(o.hour)}:${o.minute}`, dt: Number(o.day), mes: Number(o.month), wd: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(o.weekday) };
}
const V_DAN = ["v nedeljo", "v ponedeljek", "v torek", "v sredo", "v četrtek", "v petek", "v soboto"];
function opisTermina(ms, now = Date.now()) {
  const t = deli(ms), d0 = deli(now);
  const razlika = Math.round((Date.parse(t.dan) - Date.parse(d0.dan)) / 864e5);
  if (razlika === 0) return `danes ob ${t.ura}`;
  if (razlika === 1) return `jutri ob ${t.ura}`;
  if (razlika > 1 && razlika < 7) return `${V_DAN[t.wd]} ob ${t.ura}`;
  return `${t.dt}. ${t.mes}. ob ${t.ura}`;
}
module.exports = { opisTermina, strokaIme };
