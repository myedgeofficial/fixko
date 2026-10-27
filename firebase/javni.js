// Poskrbi, da so klicljive funkcije javno dosegljive (Cloud Run: allUsers → roles/run.invoker). Preverjanje prijave naredi funkcija sama.
// Uporaba: NODE_PATH=functions/node_modules node javni.js <projekt> <regija> <funkcija> [<funkcija> ...]
const { GoogleAuth } = require("google-auth-library");
const [projekt, regija, ...funkcije] = process.argv.slice(2);

(async () => {
  const client = await new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"] }).getClient();
  for (const f of funkcije) {
    const url = `https://run.googleapis.com/v2/projects/${projekt}/locations/${regija}/services/${f.toLowerCase()}`;
    const g = await client.request({ url: url + ":getIamPolicy", validateStatus: () => true });
    if (g.status >= 300) { console.log(`::warning::${f}: ${g.status} ${JSON.stringify(g.data).slice(0, 200)}`); continue; }
    const pol = g.data, b = (pol.bindings || []).find((x) => x.role === "roles/run.invoker");
    if (b?.members?.includes("allUsers")) { console.log(`${f}: že javna`); continue; }
    if (b) b.members.push("allUsers"); else (pol.bindings = pol.bindings || []).push({ role: "roles/run.invoker", members: ["allUsers"] });
    const s = await client.request({ url: url + ":setIamPolicy", method: "POST", data: { policy: pol }, validateStatus: () => true });
    console.log(s.status < 300 ? `${f}: zdaj javna` : `::warning::${f}: ${s.status} ${JSON.stringify(s.data).slice(0, 300)}`);
  }
})().catch((e) => { console.log("::warning::" + e.message); });
