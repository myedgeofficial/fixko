// Jeziki: slovenščina je izvirnik (besedila v kodi so ključi), prevodi so v prevodi.js.
// Manjkajoč prevod vzame angleščino, nato slovenščino. Ime aplikacije (Popravko ali Fixko) določa izdaja (izdaja.js).
import { P, MN } from "./prevodi.js";
import { FIXKO } from "./izdaja.js";

export const JEZIKI = ["sl", "en", "de", "fr", "it", "es", "pt", "nl", "pl", "hr"];
export const IMENA_JEZIKOV = { sl: "Slovenščina", en: "English", de: "Deutsch", fr: "Français", it: "Italiano", es: "Español", pt: "Português", nl: "Nederlands", pl: "Polski", hr: "Hrvatski" };
let jezik = "sl", stolpec = -1, slovar = null;

// Prvi podprt jezik naprave (npr. »de-AT« → de); nepodprt jezik → angleščina.
export function jezikNaprave(seznam = []) {
  for (const j of seznam) { const k = String(j || "").toLowerCase().split(/[-_]/)[0]; if (JEZIKI.includes(k)) return k; }
  return seznam.length ? "en" : "sl";
}
export function nastaviJezik(j) {
  jezik = JEZIKI.includes(j) ? j : "sl";
  stolpec = JEZIKI.indexOf(jezik) - 1;
  slovar = jezik === "sl" ? null : slovar || new Map(P.map((v) => [v[0], v.slice(1)]));
}
export const jz = () => jezik;
export const jeSl = () => jezik === "sl";
// Ime je vezano na aplikacijo, ne na jezik: Popravko je vedno Popravko, Fixko vedno Fixko.
export const imeAplikacije = () => (FIXKO ? "Fixko" : "Popravko");

// t("Mojster pride {0}", "jutri ob 8:00"): v slovenščini isto besedilo, sicer prevod.
export function t(s, ...a) {
  let r = s;
  if (slovar) { const v = slovar.get(s); if (v) r = v[stolpec] || v[0] || s; }
  return a.length ? r.replace(/\{(\d)\}/g, (_, i) => a[i] ?? "") : r;
}
// Množina za druge jezike (slovenske oblike ostanejo v main.js, kot so bile).
export function mn(n, k) {
  const o = MN[k]?.[jezik] || MN[k]?.en || ["{0}"];
  const kat = new Intl.PluralRules(jezik).select(n);
  const i = kat === "one" ? 0 : kat === "few" ? 1 : kat === "many" ? 2 : o.length - 1;
  return (o[Math.min(i, o.length - 1)]).replace("{0}", n);
}
// Ime države v jeziku aplikacije (npr. DE → »Germany« / »Deutschland«).
export function imeDrzave(cc) {
  try { return new Intl.DisplayNames([jezik], { type: "region" }).of(cc) || cc; } catch (e) { return cc; }
}
// Ena decimalka: »4,5« v slovenščini, sicer po jeziku.
export const decimalka = (x) => (jezik === "sl" ? x.toFixed(1).replace(".", ",") : x.toLocaleString(jezik, { minimumFractionDigits: 1, maximumFractionDigits: 1 }));
