// Vklopi prijavo s povezavo v e-pošti (za stran pregled) in doda domene strani med dovoljene za prijavo.
// Uporaba: NODE_PATH=functions/node_modules node prijava.js <projekt> <domena> [<domena> ...]
const { GoogleAuth } = require("google-auth-library");
const [projekt, ...domene] = process.argv.slice(2);

(async () => {
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  const url = `https://identitytoolkit.googleapis.com/admin/v2/projects/${projekt}/config`;
  const klic = (u, method = "GET", data) => client.request({ url: u, method, data, validateStatus: () => true, headers: { "x-goog-user-project": projekt } });
  const r = await klic(url);
  if (r.status >= 300) throw new Error("nastavitve prijave: " + r.status + " " + JSON.stringify(r.data).slice(0, 300));
  const zdaj = r.data.authorizedDomains || [];
  const vse = [...new Set([...zdaj, ...domene])];
  const email = r.data.signIn?.email || {};
  if (vse.length === zdaj.length && email.enabled && email.passwordRequired === false) return console.log("Prijava z e-pošto: že nastavljeno.");
  const p = await klic(`${url}?updateMask=authorizedDomains,signIn.email.enabled,signIn.email.passwordRequired`, "PATCH",
    { authorizedDomains: vse, signIn: { email: { enabled: true, passwordRequired: false } } });
  if (p.status >= 300) throw new Error("prijava z e-pošto: " + p.status + " " + JSON.stringify(p.data).slice(0, 300));
  console.log("Prijava z e-pošto vklopljena, domene:", vse.join(", "));
})().catch((e) => { console.log("::warning::" + e.message); });
