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
