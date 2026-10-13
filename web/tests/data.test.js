import test from "node:test";
import assert from "node:assert/strict";
import { dnevi, prosteUre, opisTermina, veljavenTel, pred } from "../src/data.js";

test("termini: danes samo ure vsaj 1 h vnaprej, jutri vse", () => {
  const now = new Date(2026, 9, 11, 17, 30);
  const [danes, jutri] = dnevi(now);
  assert.equal(danes.ime, "Danes");
  assert.deepEqual(prosteUre(danes, now), ["19:00"]);
  assert.equal(prosteUre(jutri, now).length, 13);
});

test("opis termina", () => {
  const now = new Date(2026, 9, 11, 12, 0);
  assert.equal(opisTermina(new Date(2026, 9, 12, 8).getTime(), now), "jutri ob 8:00");
  assert.equal(opisTermina(new Date(2026, 9, 11, 16).getTime(), now), "danes ob 16:00");
  assert.equal(opisTermina(new Date(2026, 9, 15, 14).getTime(), now), "v četrtek ob 14:00");
});

test("telefon", () => {
  assert.ok(veljavenTel("041 123 456"));
  assert.ok(veljavenTel("+386 41 123 456"));
  assert.ok(!veljavenTel("123"));
  assert.ok(!veljavenTel("pokliči me"));
});

test("pred", () => {
  const now = Date.now();
  assert.equal(pred(now - 30e3, now), "pravkar");
  assert.equal(pred(now - 10 * 60e3, now), "pred 10 min");
});

import { veljavnaDavcna } from "../src/data.js";
test("davčna številka", () => {
  // Kontrolna števka po modulu 11: 1234567 → vsota 8+14+18+20+20+18+14=112, 112 % 11 = 2, 11-2 = 9
  assert.equal(veljavnaDavcna("12345679"), true);
  assert.equal(veljavnaDavcna("SI 12345679"), true);
  assert.equal(veljavnaDavcna("12345678"), false);
  assert.equal(veljavnaDavcna("1234567"), false);
  assert.equal(veljavnaDavcna("01234567"), false);
});

test("testna firma sme brez davčne", async () => {
  const { testnaFirma } = await import("../src/data.js");
  assert.ok(testnaFirma("Mirko Šraufnciger s.p."));
  assert.ok(testnaFirma("mirko sraufnciger"));
  assert.ok(testnaFirma("Sraufnciger d.o.o."));
  assert.ok(!testnaFirma("Kos inštalacije"));
});
