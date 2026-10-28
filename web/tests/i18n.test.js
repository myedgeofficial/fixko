import test from "node:test";
import assert from "node:assert/strict";
import { P, MN } from "../src/prevodi.js";
import { t, mn, nastaviJezik, jezikNaprave, imeAplikacije, JEZIKI } from "../src/i18n.js";
import { opisTermina, dnevi, regijaIme, strokaIme, regijeDrzave, veljavnaTuja, cistaTuja } from "../src/data.js";
import { pokriva, zaznajDrzavo, jezikDrzave, TUJE_REGIJE } from "../src/drzave.js";
import { prepoznajStroko } from "../src/pomoc.js";
import { kljuci } from "./kljuci.js";

const slovar = new Map(P.map((v) => [v[0], v]));
// Ti imajo samo angleški prevod (slovenske regije, primer slovenske številke, slovenska davčna); drugi jeziki vzamejo angleščino.
const SAMO_EN = new Set(["041 123 456", "Davčna številka ni pravilna. Ima 8 števk, npr. 12345678.", "Ljubljana z okolico", "Maribor in Podravje", "Celje in Savinjska",
  "Kranj in Gorenjska", "Koper in Obala", "Novo mesto in Dolenjska", "Murska Sobota in Pomurje", "Nova Gorica in Goriška", "Koroška", "Posavje", "Zasavje", "Postojna in Notranjska"]);

test("vsako besedilo aplikacije ima prevode v vse jezike", () => {
  const manjka = kljuci().filter((k) => !slovar.has(k));
  assert.deepEqual(manjka, []);
  for (const v of P) {
    assert.ok(v.length === 10 || (v.length === 2 && SAMO_EN.has(v[0])), "stolpci: " + v[0]);
    const mesta = (s) => (s.match(/\{\d\}/g) || []).sort().join();
    for (const p of v.slice(1)) if (v[0] !== "@dan ob") assert.equal(mesta(p), mesta(v[0]), `${v[0]} → ${p}`);
  }
  assert.equal(new Set(P.map((v) => v[0])).size, P.length, "podvojeni ključi");
});

test("slovenščina ostane nespremenjena", () => {
  nastaviJezik("sl");
  assert.equal(t("Mojster pride {0}", "jutri ob 8:00"), "Mojster pride jutri ob 8:00");
  assert.equal(imeAplikacije(), "Popravko");
  assert.equal(strokaIme("vodovod"), "Vodovodar");
  assert.equal(regijaIme("vsa"), "Vsa Slovenija");
  const now = new Date(2026, 9, 11, 12, 0);
  assert.equal(opisTermina(new Date(2026, 9, 15, 14).getTime(), now), "v četrtek ob 14:00");
  assert.equal(dnevi(now)[0].ime, "Danes");
});

test("angleščina in nemščina", () => {
  nastaviJezik("en");
  assert.equal(imeAplikacije(), "Fixko");
  assert.equal(t("Rabim mojstra"), "I need a pro");
  assert.equal(strokaIme("elektrika"), "Electrician");
  assert.equal(t("Ljubljana z okolico"), "Ljubljana area");
  assert.equal(mn(3, "mojster"), "3 pros");
  const now = new Date(2026, 9, 11, 12, 0);
  assert.equal(opisTermina(new Date(2026, 9, 12, 8).getTime(), now), "tomorrow at 8:00");
  assert.equal(opisTermina(new Date(2026, 9, 15, 14).getTime(), now), "Thursday at 14:00");
  nastaviJezik("de");
  assert.equal(t("Sem mojster"), "Ich bin Handwerker");
  assert.equal(t("Ljubljana z okolico"), "Ljubljana area", "manjka → angleško");
  assert.equal(regijaIme("de-by"), "Bayern");
  assert.equal(regijaIme("de-vsa"), "Deutschland (ganzes Land)");
  nastaviJezik("pl");
  assert.equal(mn(1, "mojster"), "1 fachowiec");
  assert.equal(mn(5, "mojster"), "5 fachowców");
  nastaviJezik("sl");
});

test("jezik in država naprave", () => {
  assert.equal(jezikNaprave(["de-AT", "en"]), "de");
  assert.equal(jezikNaprave(["sv-SE"]), "en");
  assert.equal(jezikNaprave(["sl-SI"]), "sl");
  assert.equal(zaznajDrzavo(["en-GB"], "Europe/Ljubljana"), "SI");
  assert.equal(zaznajDrzavo(["de-DE"], "Europe/Vienna"), "AT");
  assert.equal(zaznajDrzavo(["en-US"], "America/Chicago"), "US");
  assert.equal(zaznajDrzavo(["fr-FR"], ""), "FR");
  for (const j of JEZIKI) assert.ok(j === "sl" || MN.mojster[j], j);
  // Angleški iPhone v Sloveniji: aplikacija je slovenska (Popravko).
  assert.equal(jezikDrzave(zaznajDrzavo(["en-GB"], "Europe/Ljubljana")), "sl");
  assert.equal(jezikDrzave("AT"), "de");
  assert.equal(jezikDrzave("SE"), "");
});

test("regije: mojster in delo v isti državi", () => {
  assert.ok(pokriva("vsa", "lj"));
  assert.ok(!pokriva("vsa", "de-by"), "vsa Slovenija ne pokriva Nemčije");
  assert.ok(pokriva("de-vsa", "de-by"));
  assert.ok(!pokriva("de-vsa", "at-w"));
  assert.ok(pokriva("at-w", "at-w"));
  assert.ok(!pokriva("lj", "mb"));
  assert.equal(regijeDrzave("SI").length, 12);
  for (const [cc, r] of Object.entries(TUJE_REGIJE)) for (const [k] of r) assert.ok(k.length <= 10 && k.startsWith(cc.toLowerCase() + "-"), k);
});

test("tuja DDV številka", () => {
  assert.equal(cistaTuja("123 456 789", "DE"), "DE123456789");
  assert.ok(veljavnaTuja("DE123456789", "DE"));
  assert.ok(veljavnaTuja("ATU12345678", "AT"));
  assert.ok(!veljavnaTuja("SI12345678", "AT"));
  assert.ok(!veljavnaTuja("abc", "DE"));
});

test("stroka v angleščini in nemščini", () => {
  const en = { "my kitchen tap is leaking": "vodovod", "the toilet is blocked": "vodovod", "socket in the living room doesn't work": "elektrika",
    "need to paint two bedrooms": "pleskanje", "assemble an ikea wardrobe": "montaza", "boiler not heating": "ogrevanje", "mow the lawn": "vrt",
    "regrout the shower tiles": "keramika", "roof is leaking after rain": "streha", "moving house next week": "selitve", "washing machine not spinning": "aparati" };
  for (const [s, k] of Object.entries(en)) assert.equal(prepoznajStroko(s, "en"), k, s);
  const de = { "Der Wasserhahn in der Küche tropft": "vodovod", "Küchenwasserhahn undicht": "vodovod", "Steckdose funktioniert nicht": "elektrika",
    "Wohnzimmer streichen": "pleskanje", "Fliesen im Bad sind gesprungen": "keramika", "Heizung wird nicht warm": "ogrevanje", "Rasen mähen und Hecke schneiden": "vrt",
    "Laminat verlegen": "tla", "Waschmaschine pumpt nicht ab": "aparati", "Dachrinne verstopft": "streha", "Umzug in eine neue Wohnung": "selitve", "Ikea Schrank aufbauen": "montaza" };
  for (const [s, k] of Object.entries(de)) assert.equal(prepoznajStroko(s, "de"), k, s);
  assert.equal(prepoznajStroko("Pušča pipa v kuhinji"), "vodovod");
});
