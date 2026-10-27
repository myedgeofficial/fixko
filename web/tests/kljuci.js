// Vsa besedila, ki jih aplikacija prevaja (za preizkus, da ima vsak jezik vse prevode).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { STROKE, REGIJE, KDAJ, DOMA, BUDGET } from "../src/data.js";

const mapa = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "src");
export function kljuci() {
  const m = fs.readFileSync(path.join(mapa, "main.js"), "utf8");
  const src = m + fs.readFileSync(path.join(mapa, "data.js"), "utf8");
  const k = new Set();
  for (const x of src.matchAll(/(?<![\w.$])t\("([^"]*)"/g)) k.add(x[1]);
  for (const [, n] of [...STROKE, ...REGIJE]) k.add(n);
  [...KDAJ, ...DOMA, ...BUDGET].forEach((x) => k.add(x));
  for (const x of m.match(/const kdo = \(k\) => t\(\{([^}]*)\}/)[1].matchAll(/: "([^"]+)"/g)) k.add(x[1]);
  for (const x of m.match(/const KORAKI = \{([\s\S]*?)\n\};/)[1].matchAll(/"([^"]+)"/g)) if (!/^[a-z]+$/.test(x[1])) k.add(x[1]);
  for (const x of m.match(/const RAZLOGI = \[([^\]]*)\]/)[1].matchAll(/"([^"]+)"/g)) k.add(x[1]);
  ["Poslano", "Mojster prihaja", "Opravljeno"].forEach((x) => k.add(x));
  return [...k];
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(kljuci(), null, 0));
