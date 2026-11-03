// Sporočila skrbnika mojstru (mojstri/{uid}/sporocila): prosto sporočilo, zahteva za potrditev stroke, potrjena ali odstranjena stroka.
// Predloge so v jeziku mojstra (prevodi.js); aplikacija iste predloge izriše sama iz vrste in stroke.
const { T } = require("./prevodi");
const { strokaIme } = require("./besedila");

const VRSTE = new Set(["sporocilo", "potrditev", "potrjena", "odstranjena"]);
const NASLOV = { potrditev: "Potrdi dejavnost: {0}", potrjena: "Stroka potrjena: {0}", odstranjena: "Stroka odstranjena: {0}" };
const PREDLOGA = {
  potrditev: "Za stroko »{0}« v poslovnem registru ne najdemo registrirane dejavnosti. Pošlji nam kodo dejavnosti SKD (npr. 43.220) ali naloži dokazilo (izpis iz AJPES ali obrtno dovoljenje). Do takrat stroka čaka na potrditev.",
  potrjena: "Stroko »{0}« smo potrdili. Hvala!",
  odstranjena: "Stroko »{0}« smo odstranili s tvojega profila, ker zanjo v poslovnem registru ni registrirane dejavnosti. Če jo imaš, nam odgovori s kodo SKD ali dokazilom in jo vrnemo."
};

// Besedilo sporočila v jeziku prejemnika: predloga (po stroki) in skrbnikova opomba, ali samo prosto besedilo.
function besediloSporocila({ vrsta, stroka, besedilo }, jezik) {
  const predloga = PREDLOGA[vrsta] ? T(jezik, PREDLOGA[vrsta], strokaIme(stroka, jezik)) : "";
  return [predloga, besedilo || ""].filter(Boolean).join("\n\n");
}

// Obvestilo (push) in e-pošta za mojstra. app = "Popravko" ali "Fixko".
function obvestilo(s, jezik, app) {
  const naslov = NASLOV[s.vrsta] ? T(jezik, NASLOV[s.vrsta], strokaIme(s.stroka, jezik)) : T(jezik, "Sporočilo od {0}", app);
  const celo = besediloSporocila(s, jezik);
  const telo = celo.length > 180 ? celo.slice(0, 177).trimEnd() + "…" : celo;
  const mail = { zadeva: naslov, besedilo: `${celo}\n\n${T(jezik, "Odgovoriš lahko v aplikaciji {0} (Sem mojster → Sporočila).", app)}\n\n${app} · support@remako.si` };
  return { naslov, telo, mail };
}

// Preprost preizkus e-naslova (enako kot v aplikaciji).
const veljavenEmail = (e) => /^[^\s@]{1,64}@[^\s@]+\.[a-z]{2,}$/i.test(String(e || "")) && String(e).length <= 120;

module.exports = { VRSTE, besediloSporocila, obvestilo, veljavenEmail };
