const test = require("node:test");
const assert = require("node:assert/strict");
const { opisTermina, strokaIme, davcnaOk, pokriva, T } = require("../besedila");
const { ujema } = require("../banka");

test("slovenska obvestila ostanejo, kot so bila", () => {
  assert.equal(T("sl", "Novo delo: {0}", "Pušča pipa"), "Novo delo: Pušča pipa");
  assert.equal(T(undefined, "Stranka vas je izbrala"), "Stranka vas je izbrala");
  assert.equal(strokaIme("vodovod"), "Vodovodar");
  assert.equal(["vodovod"].map(strokaIme)[0], "Vodovodar");
});

test("obvestila v jeziku in času prejemnika", () => {
  const now = Date.parse("2026-10-11T15:00:00Z");
  assert.equal(T("de", "Novo delo: {0}", "x"), "Neuer Auftrag: x");
  assert.equal(T("fr", "Delo v bližini: {0}", "x"), "Job nearby: x", "manjka → angleško");
  assert.equal(opisTermina(Date.parse("2026-10-12T06:00:00Z"), now, "en", "Europe/London"), "tomorrow at 7:00");
  assert.equal(opisTermina(Date.parse("2026-10-15T12:00:00Z"), now, "de", "Europe/Berlin"), "Donnerstag um 14:00");
  assert.equal(opisTermina(Date.parse("2026-10-12T06:00:00Z"), now, "sl", "ni/pas"), "jutri ob 8:00");
});

test("tuje podjetje in regije", () => {
  assert.ok(davcnaOk({ davcna: "DE123456789", drzava: "DE" }));
  assert.ok(!davcnaOk({ davcna: "DE123456789" }), "slovenski profil rabi slovensko davčno");
  assert.ok(pokriva("vsa", "mb") && !pokriva("vsa", "de-by") && pokriva("de-vsa", "de-by"));
  assert.ok(ujema("MUELLER HAUSTECHNIK GMBH", "Müller Haustechnik GmbH", "DE"));
  assert.ok(!ujema("ACME BV", "Rossi Impianti S.r.l.", "IT"));
  assert.ok(ujema("KOS INSTALACIJE MARKO KOS SP", "Kos inštalacije, Marko Kos s.p."));
});
