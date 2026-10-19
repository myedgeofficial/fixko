// Oglasi (AdMob, REMAKO): pasica na dnu in oglas čez cel zaslon ob vsakem 3. odprtju.
// Zaenkrat samo Android; iPhone dobi oglase v posodobitvi 1.1.
import { Capacitor } from "@capacitor/core";
import { AdMob, BannerAdSize, BannerAdPosition, BannerAdPluginEvents, InterstitialAdPluginEvents } from "@capacitor-community/admob";

const android = Capacitor.getPlatform() === "android";
export const oglasiVklopljeni = android;

// ID-ji oglasnih enot (REMAKO AdMob).
const PASICA = window.POPRAVKO_PASICA || "ca-app-pub-2170388618811750/6926831924";
const CEZ_ZASLON = window.POPRAVKO_CEZ_ZASLON || "ca-app-pub-2170388618811750/1670635819";

// Odprtje = zagon ali vrnitev v aplikacijo po 3+ minutah. Prvi dan po namestitvi oglasa čez cel zaslon ni.
const KLJUC = "popravko-odprtja", ODSOTNOST = 3 * 60 * 1000, VSAKO = 3, PO_ODPRTJU = 4000, PRVI_DAN = 24 * 3600 * 1000;

let zagon = null, pasica = false, zasebnost = false;
const visina = (h) => {
  document.documentElement.style.setProperty("--oglas", (h > 0 ? Math.round(h) : 0) + "px");
  document.body.classList.toggle("z-oglasom", h > 0);
};

function zacni() {
  if (zagon) return zagon;
  AdMob.addListener(BannerAdPluginEvents.SizeChanged, (s) => visina(pasica && s ? s.height : 0));
  AdMob.addListener(BannerAdPluginEvents.FailedToLoad, () => visina(0));
  // Privolitev (EU): Googlov obrazec se pokaže samo, če ga zakon zahteva in še ni odgovora.
  return (zagon = AdMob.initialize()
    .then(() => AdMob.requestConsentInfo())
    .then((i) => (i.status === "REQUIRED" && i.isConsentFormAvailable ? AdMob.showConsentForm() : i))
    .then((i) => { zasebnost = i?.privacyOptionsRequirementStatus === "REQUIRED"; })
    .catch((e) => console.warn("AdMob", e)));
}

// Pasica: pokaže se, ko je uporabnik izbral vlogo (ne na uvodnem zaslonu).
export function pasicaOglasa(prikazi) {
  if (!oglasiVklopljeni || prikazi === pasica) return;
  pasica = prikazi;
  zacni().then(() => prikazi
    ? AdMob.showBanner({ adId: PASICA, adSize: BannerAdSize.ADAPTIVE_BANNER, position: BannerAdPosition.BOTTOM_CENTER, margin: 0 })
    : AdMob.removeBanner().then(() => visina(0))
  ).catch(() => visina(0));
}

// Nastavitve: »Nastavitve oglasov« (sprememba privolitve), samo kjer jih zakon zahteva.
export const imaNastavitveOglasov = () => oglasiVklopljeni && zasebnost;
export const nastavitveOglasov = () => zacni().then(() => AdMob.showPrivacyOptionsForm()).catch(() => {});

/* ---------- oglas čez cel zaslon ---------- */
const beri = () => {
  let o = null;
  try { o = JSON.parse(localStorage.getItem(KLJUC) || "null"); } catch { o = null; }
  if (!o || typeof o.n !== "number") o = { n: 0, prvic: Date.now(), caka: false };
  return o;
};
const shrani = (o) => { try { localStorage.setItem(KLJUC, JSON.stringify(o)); } catch { /* nič */ } };
let pripravljen = false, nalaga = false, odprto = 0, skrito = 0, casovnik = 0;

function pripravi() {
  if (pripravljen || nalaga || !beri().caka) return;
  nalaga = true;
  zacni()
    .then(() => AdMob.prepareInterstitial({ adId: CEZ_ZASLON }))
    .then(() => { pripravljen = true; }, () => { pripravljen = false; })
    .then(() => { nalaga = false; if (pripravljen) casovnik = setTimeout(pokazi, Math.max(0, PO_ODPRTJU - (Date.now() - odprto))); });
}
function pokazi() {
  // Ne čez odprto okno (npr. pisanje naročila) ali sredi tipkanja.
  if (!pripravljen || document.querySelector(".sheet") || document.activeElement?.matches?.("input,textarea")) { casovnik = setTimeout(pokazi, 3000); return; }
  const o = beri(); o.caka = false; shrani(o);
  pripravljen = false;
  AdMob.showInterstitial().catch(() => {});
}
function odprtje() {
  const o = beri();
  o.n++;
  if (o.n % VSAKO === 0 && Date.now() - o.prvic > PRVI_DAN) o.caka = true;
  shrani(o);
  odprto = Date.now();
  clearTimeout(casovnik);
  pripravi();
}

export function zacniOglase() {
  if (!oglasiVklopljeni) return;
  AdMob.addListener(InterstitialAdPluginEvents.Dismissed, () => { pripravljen = false; });
  AdMob.addListener(InterstitialAdPluginEvents.FailedToShow, () => { pripravljen = false; });
  odprtje();
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { skrito = Date.now(); clearTimeout(casovnik); return; }
    if (skrito && Date.now() - skrito > ODSOTNOST) odprtje();
    else if (pripravljen) casovnik = setTimeout(pokazi, PO_ODPRTJU);
  });
}
