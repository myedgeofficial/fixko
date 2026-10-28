// Pripravi app/www iz web/: združi JavaScript (Firebase, Capacitor) v eno datoteko in doda nastavitve strežnika.
// Nastavitve Firebase pridejo iz okolja FIXKO_FB_CONFIG (JSON) ali iz datoteke app/fb-config.json.
const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

const web = path.resolve(__dirname, "..", "..", "web");
const out = path.resolve(__dirname, "..", "www");
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

esbuild.buildSync({
  entryPoints: [path.join(web, "src", "main.js")],
  bundle: true, minify: true, format: "iife", target: ["safari17"],
  outfile: path.join(out, "app.js"), legalComments: "none", logLevel: "warning",
  nodePaths: [path.resolve(__dirname, "..", "node_modules")]
});
for (const f of ["index.html", "app.css", "zasebnost.html", "pogoji.html", "zasebnost-en.html", "pogoji-en.html", "logo.png", "logo-velik.png"]) fs.copyFileSync(path.join(web, f), path.join(out, f));

// Android: obvestila (FCM) delujejo samo, če je zraven google-services.json.
const gs = path.resolve(__dirname, "..", "android", "app", "google-services.json");
const push = fs.existsSync(gs) && fs.readFileSync(gs, "utf8").trim() ? "window.FIXKO_PUSH=true;\n" : "";

// Izdaja: Popravko (privzeto, Slovenija) ali Fixko (tujina, FIXKO_IZDAJA=fixko). Ime na iPhonu (Info.plist in vsi jeziki) mora ustrezati izdaji.
const izdaja = process.env.FIXKO_IZDAJA === "fixko" ? "fixko" : "popravko";
const ime = izdaja === "fixko" ? "Fixko" : "Popravko";
const iosApp = path.resolve(__dirname, "..", "ios", "App", "App");
for (const f of [path.join(iosApp, "Info.plist"), ...fs.readdirSync(iosApp).filter((d) => d.endsWith(".lproj")).map((d) => path.join(iosApp, d, "InfoPlist.strings"))]) {
  if (!fs.existsSync(f)) continue;
  const prej = fs.readFileSync(f, "utf8"), zdaj = prej.replace(/\b(Popravko|Fixko)\b/g, ime);
  if (zdaj !== prej) fs.writeFileSync(f, zdaj);
}
if (izdaja === "fixko") fs.copyFileSync(path.join(web, "logo-velik-fixko.png"), path.join(out, "logo-velik.png"));
fs.writeFileSync(path.join(out, "izdaja.js"), `window.FIXKO_IZDAJA=${JSON.stringify(izdaja)};\n`);
const ip = path.join(out, "index.html");
fs.writeFileSync(ip, fs.readFileSync(ip, "utf8").replace("<title>Popravko</title>", `<title>${ime}</title>`).replace('<script src="app.js">', '<script src="izdaja.js"></script>\n  <script src="app.js">'));
console.log("Izdaja:", ime);

let cfg = process.env.FIXKO_FB_CONFIG || "";
const file = path.resolve(__dirname, "..", "fb-config.json");
if (!cfg && fs.existsSync(file)) cfg = fs.readFileSync(file, "utf8");
if (cfg) {
  const json = JSON.parse(cfg);
  fs.writeFileSync(path.join(out, "fb-config.js"), "window.FIXKO_FB=" + JSON.stringify(json) + ";\n" + push);
  const p = path.join(out, "index.html");
  fs.writeFileSync(p, fs.readFileSync(p, "utf8").replace('<script src="app.js">', '<script src="fb-config.js"></script>\n  <script src="app.js">'));
  console.log("Strežnik:", json.projectId);
} else {
  console.log("::warning::Ni nastavitev Firebase (FIXKO_FB_CONFIG). Pošiljanje del ne bo delovalo.");
}
console.log("www pripravljen:", fs.readdirSync(out).join(", "));
