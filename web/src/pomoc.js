// Samodejna prepoznava: stroka iz opisa in kraj/regija iz lokacije ali vpisanega kraja.
// Vse deluje na napravi, brez pošiljanja lokacije drugam.

export const brezSumnikov = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Začetki besed (brez šumnikov) po strokah. Besedna zveza šteje dvojno.
const KLJUCI = {
  vodovod: ["pip", "odtok", "wc", "stranis", "skoljk", "kotlick", "umival", "tus", "kad", "korit", "cev", "pusc", "puscanj", "kaplj", "vod", "vodovod", "bojler", "sifon", "zamas", "ventil", "splakov", "kanalizacij", "pomivaln"],
  elektrika: ["elektr", "vticnic", "stikal", "luc", "lucka", "zarnic", "varovalk", "kabl", "kabel", "tok", "napeljav", "lestenec", "svetil", "kratek stik", "stik", "pecic", "stedilnik", "elektricar", "omaric", "fi stikal", "luci"],
  keramika: ["ploscic", "keramik", "fug", "fugir", "polaganj ploscic"],
  pleskanje: ["plesk", "barv", "belj", "belit", "prepleska", "oplesk", "plesen", "tapet", "fasad", "stena", "sten", "strop", "razpok", "omet"],
  mizarstvo: ["mizar", "vrat", "okn", "omar", "parket", "laminat", "stopnic", "predal", "tecaj", "kljuk", "les", "lesen", "polic", "rolet", "zaluzij", "polkn"],
  montaza: ["sestav", "montaz", "ike", "pohistv", "televizor", "tv", "karnis", "zaves", "postelj", "kuhinj", "obes", "pritrd", "zloz"],
  ogrevanje: ["ogrev", "radiator", "pec", "kotel", "klim", "toplotn", "crpalk", "mrzl", "hladn", "gretj", "gret", "talno", "plin", "termostat", "kurjav"],
  streha: ["streh", "zleb", "opek", "krov", "zamak", "stresn", "dimnik", "kritin", "snegolov"],
  vrt: ["vrt", "trav", "kosit", "kosnj", "drev", "ziv mej", "ziva mej", "grm", "obrez", "plevel", "listj", "tlakovc", "ograj", "sneg", "zivic"],
  ciscenje: ["cisc", "pocist", "ocist", "pomit okn", "umit okn", "pomiv okn", "prah", "generaln", "preprog", "pospravi", "pospravlj", "sesanj"],
  selitve: ["selit", "selitev", "preselit", "prevoz", "prenes", "odvoz", "kosovn", "odpad", "klavir", "prepelj", "kombi"]
};

// "pomit okn" ujame "pomiti okna": vsaka beseda je začetek besede.
const vzorci = new Map();
const VZOREC = (c) => vzorci.get(c) || vzorci.set(c, new RegExp(" " + c.split(" ").join("[a-z0-9]* "))).get(c);

// Vrne ključ stroke ali "" če ne prepozna.
export function prepoznajStroko(besedilo) {
  const t = " " + brezSumnikov(besedilo).replace(/[^a-z0-9]+/g, " ") + " ";
  if (t.trim().length < 2) return "";
  let naj = "", najTock = 0;
  for (const [k, seznam] of Object.entries(KLJUCI)) {
    let tock = 0;
    for (const c of seznam) if (VZOREC(c).test(t)) tock += c.includes(" ") ? 2 : 1;
    if (tock > najTock) { naj = k; najTock = tock; }
  }
  return naj;
}

// Kraji z regijo (približne koordinate središča). Najbližji kraj = kraj stranke.
export const KRAJI = [
  ["Ljubljana", 46.0569, 14.5058, "lj"], ["Domžale", 46.1378, 14.5936, "lj"], ["Kamnik", 46.2259, 14.6121, "lj"], ["Grosuplje", 45.9556, 14.6589, "lj"],
  ["Vrhnika", 45.9667, 14.2958, "lj"], ["Medvode", 46.1422, 14.4114, "lj"], ["Logatec", 45.9144, 14.2258, "po"], ["Litija", 46.0583, 14.8225, "lj"],
  ["Ivančna Gorica", 45.9383, 14.8044, "lj"], ["Škofljica", 45.9833, 14.5764, "lj"], ["Ig", 45.9603, 14.5289, "lj"], ["Mengeš", 46.1647, 14.5750, "lj"],
  ["Trzin", 46.1333, 14.5667, "lj"], ["Brezovica", 46.0333, 14.4000, "lj"], ["Dol pri Ljubljani", 46.0886, 14.6008, "lj"], ["Horjul", 46.0228, 14.2992, "lj"],
  ["Velike Lašče", 45.8322, 14.6364, "lj"], ["Moravče", 46.1361, 14.7450, "lj"], ["Komenda", 46.2039, 14.5383, "lj"], ["Šmartno pri Litiji", 46.0447, 14.8442, "lj"],
  ["Maribor", 46.5547, 15.6459, "mb"], ["Ptuj", 46.4200, 15.8700, "mb"], ["Slovenska Bistrica", 46.3925, 15.5728, "mb"], ["Lenart", 46.5761, 15.8311, "mb"],
  ["Ruše", 46.5397, 15.5158, "mb"], ["Rače", 46.4519, 15.6797, "mb"], ["Hoče", 46.4994, 15.6464, "mb"], ["Miklavž na Dravskem polju", 46.5064, 15.6972, "mb"],
  ["Ormož", 46.4067, 16.1544, "mb"], ["Kidričevo", 46.4036, 15.7911, "mb"], ["Pesnica", 46.6069, 15.6767, "mb"], ["Selnica ob Dravi", 46.5514, 15.4931, "mb"],
  ["Celje", 46.2309, 15.2604, "ce"], ["Velenje", 46.3592, 15.1103, "ce"], ["Žalec", 46.2511, 15.1650, "ce"], ["Šentjur", 46.2172, 15.3975, "ce"],
  ["Slovenske Konjice", 46.3378, 15.4211, "ce"], ["Rogaška Slatina", 46.2375, 15.6397, "ce"], ["Laško", 46.1547, 15.2361, "ce"], ["Šoštanj", 46.3794, 15.0486, "ce"],
  ["Mozirje", 46.3394, 14.9631, "ce"], ["Šmarje pri Jelšah", 46.2275, 15.5192, "ce"], ["Vojnik", 46.2919, 15.3036, "ce"], ["Štore", 46.2208, 15.3139, "ce"],
  ["Polzela", 46.2803, 15.0717, "ce"], ["Prebold", 46.2369, 15.0925, "ce"], ["Zreče", 46.3739, 15.3867, "ce"],
  ["Kranj", 46.2389, 14.3556, "kr"], ["Škofja Loka", 46.1656, 14.3069, "kr"], ["Jesenice", 46.4364, 14.0525, "kr"], ["Radovljica", 46.3444, 14.1744, "kr"],
  ["Bled", 46.3683, 14.1146, "kr"], ["Tržič", 46.3633, 14.3094, "kr"], ["Bohinj", 46.2775, 13.8858, "kr"], ["Kranjska Gora", 46.4847, 13.7856, "kr"],
  ["Žiri", 46.0478, 14.1078, "kr"], ["Cerklje na Gorenjskem", 46.2539, 14.4886, "kr"], ["Šenčur", 46.2433, 14.4194, "kr"], ["Naklo", 46.2742, 14.3164, "kr"],
  ["Železniki", 46.2244, 14.1725, "kr"], ["Gorenja vas", 46.1067, 14.1494, "kr"], ["Žirovnica", 46.4044, 14.1397, "kr"],
  ["Koper", 45.5481, 13.7302, "kp"], ["Izola", 45.5394, 13.6603, "kp"], ["Piran", 45.5283, 13.5683, "kp"], ["Portorož", 45.5142, 13.5903, "kp"],
  ["Ankaran", 45.5786, 13.7364, "kp"], ["Sežana", 45.7092, 13.8733, "kp"], ["Divača", 45.6847, 13.9703, "kp"], ["Ilirska Bistrica", 45.5678, 14.2406, "po"],
  ["Novo mesto", 45.8030, 15.1689, "nm"], ["Trebnje", 45.9042, 15.0214, "nm"], ["Črnomelj", 45.5711, 15.1889, "nm"], ["Metlika", 45.6472, 15.3142, "nm"],
  ["Kočevje", 45.6431, 14.8633, "nm"], ["Ribnica", 45.7386, 14.7275, "nm"], ["Šentjernej", 45.8436, 15.3364, "nm"], ["Mirna Peč", 45.8603, 15.0878, "nm"],
  ["Žužemberk", 45.8339, 14.9292, "nm"], ["Dolenjske Toplice", 45.7567, 15.0594, "nm"], ["Straža", 45.7797, 15.0725, "nm"], ["Mokronog", 45.9425, 15.1408, "nm"],
  ["Murska Sobota", 46.6625, 16.1664, "ms"], ["Lendava", 46.5650, 16.4517, "ms"], ["Ljutomer", 46.5208, 16.1975, "ms"], ["Gornja Radgona", 46.6733, 15.9922, "ms"],
  ["Beltinci", 46.6058, 16.2406, "ms"], ["Radenci", 46.6436, 16.0414, "ms"], ["Moravske Toplice", 46.6847, 16.2214, "ms"], ["Turnišče", 46.6278, 16.3150, "ms"],
  ["Nova Gorica", 45.9560, 13.6481, "ng"], ["Ajdovščina", 45.8869, 13.9097, "ng"], ["Tolmin", 46.1833, 13.7333, "ng"], ["Idrija", 46.0028, 14.0306, "ng"],
  ["Šempeter pri Gorici", 45.9275, 13.6411, "ng"], ["Kanal", 46.0886, 13.6372, "ng"], ["Bovec", 46.3378, 13.5522, "ng"], ["Kobarid", 46.2475, 13.5792, "ng"],
  ["Cerkno", 46.1281, 13.9894, "ng"], ["Vipava", 45.8464, 13.9622, "ng"], ["Renče", 45.8939, 13.6703, "ng"], ["Brda", 46.0033, 13.5333, "ng"],
  ["Slovenj Gradec", 46.5103, 15.0806, "sg"], ["Ravne na Koroškem", 46.5439, 14.9692, "sg"], ["Dravograd", 46.5889, 15.0192, "sg"], ["Radlje ob Dravi", 46.6136, 15.2267, "sg"],
  ["Prevalje", 46.5469, 14.9206, "sg"], ["Mežica", 46.5214, 14.8522, "sg"], ["Muta", 46.6114, 15.1661, "sg"],
  ["Krško", 45.9592, 15.4919, "kk"], ["Brežice", 45.9033, 15.5911, "kk"], ["Sevnica", 46.0081, 15.3156, "kk"], ["Kostanjevica na Krki", 45.8464, 15.4247, "kk"],
  ["Trbovlje", 46.1550, 15.0533, "za"], ["Zagorje ob Savi", 46.1342, 14.9964, "za"], ["Hrastnik", 46.1461, 15.0814, "za"],
  ["Postojna", 45.7744, 14.2153, "po"], ["Cerknica", 45.7964, 14.3633, "po"], ["Pivka", 45.6797, 14.1964, "po"], ["Loška dolina", 45.6464, 14.4983, "po"]
];

function razdalja(a1, o1, a2, o2) {
  const r = Math.PI / 180, x = (o2 - o1) * r * Math.cos(((a1 + a2) / 2) * r), y = (a2 - a1) * r;
  return Math.sqrt(x * x + y * y) * 6371;
}
// Najbližji kraj; zunaj Slovenije (več kot 40 km od vseh krajev) vrne null.
export function krajIzLokacije(lat, lon) {
  let naj = null, d0 = Infinity;
  for (const k of KRAJI) { const d = razdalja(lat, lon, k[1], k[2]); if (d < d0) { d0 = d; naj = k; } }
  return naj && d0 <= 40 ? { kraj: naj[0], regija: naj[3], km: d0 } : null;
}
// Regija iz vpisanega kraja (npr. "Maribor, Tabor" → mb). Če kraja ne pozna, vrne "".
export function regijaIzKraja(besedilo) {
  const t = brezSumnikov(besedilo).replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return "";
  let naj = "", dolz = 0;
  for (const [ime, , , reg] of KRAJI) {
    const n = brezSumnikov(ime);
    if ((t === n || t.startsWith(n + " ") || t.includes(" " + n)) && n.length > dolz) { naj = reg; dolz = n.length; }
  }
  return naj;
}
