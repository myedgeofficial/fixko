import test from "node:test";
import assert from "node:assert/strict";
import { prepoznajStroko, krajIzLokacije, regijaIzKraja } from "../src/pomoc.js";

test("stroka iz opisa", () => {
  const p = {
    "Pušča pipa v kuhinji": "vodovod", "Zamašen odtok": "vodovod", "Ne dela vtičnica v dnevni sobi": "elektrika",
    "Pregorela luč na hodniku": "elektrika", "Odpadle ploščice v kopalnici": "keramika", "Prepleskati dnevno sobo": "pleskanje",
    "Vrata se ne zapirajo": "mizarstvo", "Sestaviti omaro iz Ikee": "montaza", "Radiator je mrzel": "ogrevanje",
    "Zamaka streha": "streha", "Pokositi travo": "vrt", "Pomiti okna": "ciscenje", "Selitev stanovanja": "selitve",
    "Klima ne hladi": "ogrevanje", "Žleb je odpadel": "streha", "Obrezati drevo": "vrt"
  };
  for (const [t, k] of Object.entries(p)) assert.equal(prepoznajStroko(t), k, t);
  assert.equal(prepoznajStroko("pomagajte prosim"), "");
});
test("kraj iz lokacije", () => {
  assert.deepEqual(krajIzLokacije(46.05, 14.50).kraj, "Ljubljana");
  assert.equal(krajIzLokacije(46.55, 15.64).regija, "mb");
  assert.equal(krajIzLokacije(48.2, 16.37), null);
});
test("regija iz kraja", () => {
  assert.equal(regijaIzKraja("Maribor, Tabor"), "mb");
  assert.equal(regijaIzKraja("novo mesto"), "nm");
  assert.equal(regijaIzKraja("Ulica 5, Škofja Loka"), "kr");
  assert.equal(regijaIzKraja("Neznano"), "");
});
