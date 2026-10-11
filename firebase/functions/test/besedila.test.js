const test = require("node:test");
const assert = require("node:assert/strict");
const { opisTermina } = require("../besedila");

test("termin v slovenskem času (poletni in zimski čas)", () => {
  const now = Date.parse("2026-10-11T15:00:00Z");
  assert.equal(opisTermina(Date.parse("2026-10-12T06:00:00Z"), now), "jutri ob 8:00");
  assert.equal(opisTermina(Date.parse("2026-10-11T16:00:00Z"), now), "danes ob 18:00");
  assert.equal(opisTermina(Date.parse("2026-10-15T12:00:00Z"), now), "v četrtek ob 14:00");
  assert.equal(opisTermina(Date.parse("2026-10-27T12:00:00Z"), now), "27. 10. ob 13:00");
});
