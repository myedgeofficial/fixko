const test = require("node:test");
const assert = require("node:assert/strict");
const { obvestilo, besediloSporocila, veljavenEmail } = require("../sporocila");
const { JEZIKI } = require("../prevodi");

test("zahteva za potrditev stroke v jeziku mojstra", () => {
  const s = { vrsta: "potrditev", stroka: "vodovod" };
  const sl = obvestilo(s, "sl", "Popravko");
  assert.equal(sl.naslov, "Potrdi dejavnost: Vodovodar");
  assert.match(sl.mail.besedilo, /kodo dejavnosti SKD/);
  assert.match(sl.mail.besedilo, /Popravko \(Sem mojster → Sporočila\)/);
  const de = obvestilo(s, "de", "Fixko");
  assert.equal(de.naslov, "Tätigkeit bestätigen: Installateur");
  assert.match(de.mail.besedilo, /„Installateur“/);
  // Vsaka predloga ima prevod v vse jezike aplikacije (ne ostane slovensko).
  for (const vrsta of ["potrditev", "potrjena", "odstranjena"]) {
    for (const j of JEZIKI.filter((x) => x !== "sl")) {
      const o = obvestilo({ vrsta, stroka: "selitve" }, j, "Fixko");
      assert.doesNotMatch(o.naslov + o.mail.besedilo, /Stroka|stroko|Selitve|Odgovoriš/, `${vrsta} ${j}`);
    }
  }
});

test("prosto sporočilo in opomba skrbnika", () => {
  const o = obvestilo({ vrsta: "sporocilo", besedilo: "Pokliči me, prosim." }, "en", "Fixko");
  assert.equal(o.naslov, "Message from Fixko");
  assert.equal(o.telo, "Pokliči me, prosim.");
  assert.equal(besediloSporocila({ vrsta: "odstranjena", stroka: "selitve", besedilo: "Lp, Teo" }, "sl"),
    "Stroko »Selitve in prevoz« smo odstranili s tvojega profila, ker zanjo v poslovnem registru ni registrirane dejavnosti. Če jo imaš, nam odgovori s kodo SKD ali dokazilom in jo vrnemo.\n\nLp, Teo");
  assert.ok(obvestilo({ vrsta: "sporocilo", besedilo: "x".repeat(400) }, "sl", "Popravko").telo.length <= 180);
});

test("e-naslov mojstra", () => {
  assert.ok(veljavenEmail("marko@kos.si"));
  assert.ok(!veljavenEmail("marko@kos") && !veljavenEmail("") && !veljavenEmail(undefined));
});
