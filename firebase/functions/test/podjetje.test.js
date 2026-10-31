const test = require("node:test");
const assert = require("node:assert/strict");
const { oceni, stevilkiUjemata, placnikUjema } = require("../podjetje");

const md = { firma: "Strel Bau GmbH", davcna: "DE123456789", drzava: "DE" };
const dok = { vrsta: "Gewerbeanmeldung", jeRegistracija: true, ime: "Strel Bau GmbH", stevilka: "USt-IdNr. 123 456 789", dejavnost: "Fliesenleger", obrt: true, sumljivo: false };
const vies = { vir: "VIES", veljavna: true, ime: "", naslov: "" };

test("številka z dokumenta in DDV", () => {
  assert.ok(stevilkiUjemata("USt-IdNr. 123 456 789", "DE123456789"));
  assert.ok(!stevilkiUjemata("12345", "DE123456789"), "premalo števk");
  assert.ok(!stevilkiUjemata("987654321", "DE123456789"));
});

test("dokument, register in profil se ujemajo", () => {
  const o = oceni(md, dok, vies);
  assert.deepEqual(o.razlogi, []);
  assert.ok(o.ok);
  assert.ok(placnikUjema("STREL BAU GMBH", o, "DE"));
  assert.ok(!placnikUjema("JANEZ NOVAK", o, "DE"), "tuj plačnik ne potrdi");
});

test("Janez Strel brez firme ne gre skozi", () => {
  assert.ok(!oceni(md, { ...dok, jeRegistracija: false, vrsta: "Personalausweis" }, vies).ok, "osebna izkaznica ni registracija");
  assert.ok(!oceni(md, { ...dok, obrt: false, dejavnost: "Softwareentwicklung" }, vies).ok, "dejavnost ni obrt");
  assert.ok(!oceni(md, { ...dok, ime: "Huber Haustechnik GmbH", stevilka: "" }, vies).ok, "dokument druge firme");
  assert.ok(!oceni(md, { ...dok, sumljivo: true }, vies).ok);
  assert.ok(!oceni(md, null, vies).ok, "AI ni prebral");
  assert.ok(!oceni(md, dok, null).ok, "brez registra samo ročno");
  assert.ok(!placnikUjema("STREL BAU GMBH", oceni(md, dok, { ...vies, veljavna: false }), "DE"));
});

test("ime iz registra poveže dokument brez številke", () => {
  const reg = { vir: "VIES", veljavna: true, ime: "STREL BAU GMBH", naslov: "Berlin" };
  const o = oceni(md, { ...dok, stevilka: "" }, reg);
  assert.ok(o.ok, o.razlogi.join("; "));
  assert.equal(o.ime, "STREL BAU GMBH");
  assert.ok(!oceni(md, dok, { ...reg, ime: "HUBER GMBH" }).ok, "register pravi drugo ime");
});
