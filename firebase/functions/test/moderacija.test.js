const test = require("node:test");
const assert = require("node:assert/strict");
const { neprimerno, gsIz, potIz } = require("../moderacija");

test("SafeSearch pragovi", () => {
  assert.equal(neprimerno({ adult: "LIKELY", racy: "LIKELY", violence: "UNLIKELY" }), "adult");
  assert.equal(neprimerno({ adult: "POSSIBLE", racy: "LIKELY", violence: "LIKELY", medical: "POSSIBLE" }), "");
  assert.equal(neprimerno({ adult: "UNLIKELY", racy: "VERY_LIKELY" }), "racy");
  assert.equal(neprimerno({ violence: "VERY_LIKELY" }), "violence");
  assert.equal(neprimerno(null), "");
});

test("povezava za prenos → gs:// pot", () => {
  const u = "https://firebasestorage.googleapis.com/v0/b/fixko-app.firebasestorage.app/o/slike%2Fabc%2Fxyz-1.jpg?alt=media&token=t";
  assert.equal(gsIz(u), "gs://fixko-app.firebasestorage.app/slike/abc/xyz-1.jpg");
  assert.equal(potIz(u), "slike/abc/xyz-1.jpg");
  assert.equal(gsIz("http://127.0.0.1:9199/v0/b/x/o/y"), "");
});
