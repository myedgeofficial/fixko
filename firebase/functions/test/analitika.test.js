const test = require("node:test");
const assert = require("node:assert/strict");
const admin = require("firebase-admin");

// Lažna baza: samo collection().select().get() z dokumenti.
const doc = (id, data) => ({ id, data: () => data, get: (k) => data[k] });
const baza = {
  mojstri: [doc("m1", { ime: "Ana", firma: "Ana d.o.o.", stroke: ["vodovod"], drzava: "SI" }), doc("m2", { ime: "Hans", firma: "Hans GmbH", stroke: ["elektrika", "vodovod"], drzava: "DE" })],
  dela: [doc("d1", { status: "opravljeno", stroka: "vodovod", regija: "mb", mojster: "m1" }), doc("d2", { status: "odprto", stroka: "elektrika", regija: "de-by" }), doc("d3", { status: "prevzeto", stroka: "vodovod", regija: "lj", mojster: "m1" })],
  ponudbe: [doc("p1", { mojster: "m1", status: "sprejeto" }), doc("p2", { mojster: "m2", status: "caka" })],
  ocene: [doc("d1_M", { za: "m1", vloga: "M", zvezdice: 5, stroka: "vodovod" }), doc("d1_N", { za: "x", vloga: "N", zvezdice: 1 })],
  profili: [doc("m1", { vsota: 5, st: 1 })]
};
Object.defineProperty(admin, "firestore", { configurable: true, value: () => ({ collection: (c) => ({ select: () => ({ get: async () => ({ size: baza[c].length, docs: baza[c], forEach: (f) => baza[c].forEach(f) }) }) }) }) });

test("analitika: dela po aplikaciji in stroki, mojstri, ocene", async () => {
  const a = await require("../statistika").analitika();
  assert.deepEqual(a.dela.poAplikaciji, { Popravko: 2, Fixko: 1 });
  assert.equal(a.dela.poStroki.Vodovodar, 2);
  assert.deepEqual(a.mojstri.poAplikaciji, { Popravko: 1, Fixko: 1 });
  assert.equal(a.mojstri.poStroki.Vodovodar, 2);
  assert.equal(a.ocene.skupaj, 1, "ocene strank ne štejejo");
  assert.equal(a.ocene.povprecje, 5);
  const ana = a.seznam.find((m) => m.uid === "m1");
  assert.equal(ana.opravljena, 1); assert.equal(ana.prevzeta, 1); assert.equal(ana.sprejete, 1); assert.equal(ana.ocena, 5);
});
