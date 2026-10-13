// Preizkus Fixko APK v Android emulatorju: zaslon za zaslonom, tipka Nazaj, obvestila (FCM), napake v konzoli.
// Ne piše v pravo bazo (ne shrani profila in ne pošlje dela).
const { _android } = require("playwright");
const { execSync } = require("child_process");
const fs = require("fs");
const OUT = process.env.OUT || "preizkus";
fs.mkdirSync(OUT, { recursive: true });
const sh = (c) => { try { return execSync(c, { encoding: "utf8" }); } catch (e) { return String(e.stdout || e.message); } };
const pocakaj = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const ok = (ime, pogoj, vec = "") => { log.push(`${pogoj ? "OK  " : "NAPAKA"} ${ime}${vec ? " · " + vec : ""}`); console.log(log[log.length - 1]); };
const nazaj = () => sh("adb shell input keyevent 4");
const spredaj = () => /si\.fixko\.app/.test(sh("adb shell dumpsys window | grep -E 'mCurrentFocus|mFocusedApp'"));

(async () => {
  const [d] = await _android.devices();
  const slika = async (n) => fs.writeFileSync(`${OUT}/${n}.png`, await d.screenshot());
  for (const p of ["ACCESS_FINE_LOCATION", "ACCESS_COARSE_LOCATION", "POST_NOTIFICATIONS"]) sh(`adb shell pm grant si.fixko.app android.permission.${p}`);
  sh("adb emu geo fix 15.6459 46.5547");
  sh("adb shell am start -W -n si.fixko.app/.MainActivity");
  await pocakaj(6000);
  await slika("01-zagon");
  const wv = await d.webView({ pkg: "si.fixko.app" }, { timeout: 60000 });
  const p = await wv.page();
  const napake = [];
  p.on("console", (m) => { if (m.type() === "error") napake.push(m.text()); });
  p.on("pageerror", (e) => napake.push("PAGEERROR " + e.message));
  await p.waitForSelector(".izbira", { timeout: 30000 });
  ok("uvodni zaslon z izbiro", true);
  await slika("02-uvod");

  // Stranka
  await p.click('.izbira[data-r="N"]');
  await p.waitForSelector("#opis");
  const geo = setInterval(() => sh("adb emu geo fix 15.6459 46.5547"), 2000);
  await p.waitForFunction(() => !/Iščem/.test(document.getElementById("kraj")?.textContent || ""), null, { timeout: 25000 }).catch(() => {});
  clearInterval(geo);
  await slika("03-stranka");
  ok("lokacija najde kraj", /Maribor/.test(await p.textContent("#kraj")), (await p.textContent("#kraj")).trim().replace(/\s+/g, " ").slice(0, 60));
  await p.fill("#opis", "Pušča pipa v kuhinji");
  await pocakaj(500);
  ok("prepozna stroko", /odovodar/.test(await p.textContent("#stroka")));
  await slika("04-stranka-opis");

  // Pomoč + tipka Nazaj zapre okno
  await p.evaluate(() => document.activeElement?.blur()); sh("adb shell input keyevent 111"); await pocakaj(800);
  await p.click("#pomoc"); await pocakaj(600);
  await slika("05-pomoc");
  nazaj(); await pocakaj(1200);
  ok("Nazaj zapre okno", (await p.$$(".sheet")).length === 0 && spredaj());

  // Mojster
  await p.click("#tabM"); await p.waitForSelector("#ime");
  await pocakaj(500); await slika("06-mojster-profil");
  ok("profil mojstra", true);

  // Nastavitve: obvestila (FCM žeton)
  await p.click("#nast"); await pocakaj(600);
  await slika("07-nastavitve");
  ok("ni gumba Upravljaj naročnino", !(await p.$("#man")));
  await p.click("#obv");
  const t = await p.waitForSelector(".toast", { timeout: 20000 }).then((e) => e.textContent()).catch(() => "");
  ok("obvestila vklopljena (FCM)", /vklopljena/.test(t), t.trim());
  await slika("08-obvestila");
  if ((await p.$$(".sheet")).length) { nazaj(); await pocakaj(800); }

  // Zasebnost: stran in nazaj
  await p.click("#nast"); await pocakaj(500);
  await p.click('.sheet a[href="zasebnost.html"]'); await pocakaj(2000);
  await slika("09-zasebnost");
  nazaj(); await pocakaj(2000);
  ok("Nazaj iz zasebnosti v aplikacijo", spredaj() && /index\.html|\/$/.test(p.url()), p.url());

  // Nazaj na glavnem zaslonu skrije aplikacijo
  nazaj(); await pocakaj(1000);
  ok("Nazaj na glavnem zaslonu skrije aplikacijo", !spredaj());

  // Ponovni zagon: vloga ostane
  sh("adb shell am start -W -n si.fixko.app/.MainActivity"); await pocakaj(3000);
  await slika("10-ponovno");
  ok("napake v konzoli", napake.filter((x) => !/favicon|ERR_FILE_NOT_FOUND/.test(x)).length === 0, napake.join(" | ").slice(0, 400));
  const crash = sh("adb logcat -d -b crash");
  ok("brez sesutja", !/si\.fixko\.app/.test(crash), crash.slice(0, 300));
  fs.writeFileSync(`${OUT}/rezultat.txt`, log.join("\n") + "\n");
  await d.close();
  process.exit(0);
})().catch(async (e) => { console.error(e); log.push("NAPAKA skripta: " + e.message); fs.writeFileSync(`${OUT}/rezultat.txt`, log.join("\n") + "\n"); process.exit(0); });
