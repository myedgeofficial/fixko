// Doda lastno domeno na Firebase Hosting stran (če je še ni) in izpiše DNS zapise, ki jih je treba dodati.
// Uporaba: NODE_PATH=functions/node_modules node domena.js <projekt> <stran> <domena>
const { GoogleAuth } = require("google-auth-library");
const [projekt, stran, domena] = process.argv.slice(2);

(async () => {
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  const osnova = `https://firebasehosting.googleapis.com/v1beta1/projects/${projekt}/sites/${stran}/customDomains`;
  const klic = (url, method = "GET", data) => client.request({ url, method, data, validateStatus: () => true });
  let r = await klic(`${osnova}/${domena}`);
  if (r.status === 404) {
    r = await klic(`${osnova}?customDomainId=${domena}`, "POST", {});
    if (r.status >= 300) throw new Error("dodajanje domene: " + r.status + " " + JSON.stringify(r.data));
    r = await klic(`${osnova}/${domena}`);
  }
  if (r.status >= 300) throw new Error("domena: " + r.status + " " + JSON.stringify(r.data));
  const d = r.data;
  console.log(`Domena ${domena}: host=${d.hostState} lastništvo=${d.ownershipState} certifikat=${d.cert?.state || "-"}`);
  for (const skupina of d.requiredDnsUpdates?.desired || []) {
    for (const z of skupina.records || []) console.log(`::notice::DNS ${z.requiredAction || "ADD"} ${z.domainName} ${z.type} ${z.rdata}`);
  }
  for (const skupina of d.requiredDnsUpdates?.discovered || []) {
    for (const z of skupina.records || []) console.log(`trenutno: ${z.domainName} ${z.type} ${z.rdata}`);
  }
})().catch((e) => { console.log("::warning::" + e.message); });
