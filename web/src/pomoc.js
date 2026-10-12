// Samodejna prepoznava: stroka iz opisa in kraj/regija iz lokacije ali vpisanega kraja.
// Vse deluje na napravi, brez pošiljanja lokacije drugam.

export const brezSumnikov = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Besede po strokah (brez šumnikov, male črke). Pravila zapisa:
//   pip      začetek besede (pipa, pipe, pipo ...), 1 točka
//   pip!     močan znak za to stroko, 2 točki
//   mizar!!  ime mojstra, 4 točke (»rabim varilca za vrata« → varilec)
//   tok$     cela beseda (ne "tokrat")
//   pomit_okn  besedna zveza (pomiti okna), 3 točke
// Vključeni so knjižni, pogovorni in narečni izrazi (štajerski, gorenjski, primorski, prekmurski, dolenjski).
const BESEDE = {
  vodovod: `odtek! odteka! ne_odteka pip! pipc! armatur! mesaln! baterij spin! rubinet! slavin! odtok! odtocn! sifon! zamas! zamaš zacep! zacepl! nabasa
    pusc! puscanj! puca$! pucajo$! pucalo$ pusti$ curi! cur! curlja! curk kaplj! kapa$ kaplje$ mokr poplav! poplavl! pocil poci$ poknil pokla$ pokn
    cev cevi$ cevk rur! ror! flah slauf! crev vodovod! vodovodar!! vodoinstal! instalater!! vodar! voda$ vode$ vodo$ vodi$ vodomer! ventil! hauptn
    wc! skoljk! stranisc! stranis! klozet! kloz! hasl! hajzl! sekret! splak! splakov! spul! spula! spulat! kotlic! kotlick! kotlicek! kotlic
    umival! umivaln! lavabo! lavandin! lavor! korit! pomivaln_korit tus! tusk! tus_kabin tuskabin! kad$! kadi$! kadjo$ banj! jacuzz
    bojler! grelnik_vod grelec_vod topla_voda$ tople_vode$ ni_tople ni_vode kanaliz! jasek! greznic! fekal! odplak! smrdi_iz_odtok
    pralni_stroj_prikljuc prikljucek_za_pralni vodni_kamen filter_za_vod`,
  elektrika: `pecica_ne pecica_ne_greje elektr! elektrik! elektricar!! elektrikar!! elektro! struj! tok$! toka$! tokom$ elektrike$! ni_elektrike ni_toka vticnic! vticnc! stekdoz! steker! stekr!
    stikal! stikalo! salter! salterj! luc! luci$! lucka! lucke! lampa! lamp! luster! lestenec! lestenc! svetil! svetilk! reflektor led_trak led_luc zarnic! birn! birna!
    varovalk! varovalka! fi_stikal fid! pada_varovalk pade_varovalk izbija! izbije! kratek_stik! stik iskri! iskr! smrdi_po_zgan kabel! kabl! zic! drot! napeljav! elektroinstal!
    domofon! zvonec! zvonc! pecica! pecic! stedilnik! sporhet! indukcij! kuhalna_plosc napa$ nape$ ventilator! hladilnik! zamrzoval! pomivaln_stroj pralni susiln!
    polniln! polnilnic! soncn_elektrarn solarn_elektrarn elektrarn! antena! anten! satelit! internet wifi omaric razdelil! stevec! merilni_mest
    ne_dela_luc ni_luci ne_sveti! zatemn rolete_na_motor`,
  keramika: `silikon_okoli silikon_ob_kad silikon_v_kopalnic ploscic! ploscice! plosc! pločic ploc! fliz! flize! flise! fliesn keramik! keramicar!! fug! fugir! fugiran! silikon! silikonir! mozaik! kamnit_tla marmor! granit!
    estrih! izravnav tlakovanj_kopalnic poloz_ploscic polaganj obloz! obloga! obkladanj kopalnico_obnov prenov_kopalnic obnov_kopalnic adaptacij_kopalnic`,
  pleskanje: `plesk! pleskar!! pleskat! prepleska! oplesk! pobarv! barv! farb! farbat! farbal! malar!! malat! malal! molar! belj! belit! pobelit! prebelit! krec! kreč apnen
    stena$ stene$ steno$ sten stenah strop! stropa! plesen! plesn! vlag vlazn madez madez! razpok! razpoke! omet! ometa! glet! gletanj! gletat! spahtl! spahtlat! kitanj! kitat!
    tapet! tapeciranj fasad! fasada! fasaderst termofasad lakir! lakiranj! premaz! zascit_les impregnacij`,
  mizarstvo: `okensk! okenska_polic mizar!! mizarj! tisler!! tislar!! tislerj! vrat! vrata$! vratc! kljuk! kljucavnic! kljucavn! cilinder! tecaj! tecaji! sarnir! sarnirj! sarnirji
    okn! okno$! okna$! oknu$ polkn! rolet! rolo$ zaluzij! komarnik! mrezic_proti_komarj omar! omaric kredenc! predal! predali! parket! laminat! pod_skrip skrip! skripa! skripaj!
    lesen! lesa$ les$ desk! stopnic! stopnisc! ograja_na_stopnic pult! kuhinjsk_pult miz! mize$ stol! stoli$ postelj zatika! zatakn! se_ne_zapir! ne_zapira! ne_zapre! ne_zaprejo!
    se_ne_odpre! ne_odpre! zabojn lesn_ograj nadstresn_les brunar`,
  montaza: `pritrd_omar obes_omar pritrd_omaric sestav! sestavit! sestavlj! zloz! zlozit! montaz! montir! montirat! monter!! ike! jysk! lesnina! harvey! mebl! mebel! pohistv! garnitur! sedezn! omaro_sestav sestav_omar
    televizor! televizij! tv! tv_na_sten na_steno! obesit! obesi! obesil! obes! pritrdit! pritrd! privijac! privit! sraufat! sraufa! zasraufat! luknjo_zvrtat zvrtat! vrtat! vrtanj!
    zaves! zavese! karnis! garnis! garnisn! polic! police$! slika_na_sten ogledal! kuhinj! kuhinjo_sestav vgradn! nosilec! drzal! obesalnik! kljukic`,
  ogrevanje: `montaz_klim montir_klim namestit_klim nova_klim klimo_montir servis_klim ogrev! ogrevanj! gretj! gret! greje! ne_greje! ne_greja ni_gretja radiator! radiatorj! kalorifer! kaloriferj! rebrn grelec! grelnik! grelna
    pec$! peci$! pecjo$ kmecka_pec kamin! kaminsk! kotel! kotla$! kotlu$ kotlovnic! kurisc! kurjav! kurilnic! kurit! centraln! centralna! plin! plinsk! plinski_kotel serviser_plin
    toplotn! toplotna_crpalk crpalk! klima! klim! klimat! klimatsk! split hladi! ne_hladi! hladilni_plin freon! mrzl! mrzel! mrzlo! hladn! zmrzuj zebe! zebe$
    talno! talnega! termostat! luft! zrak_v_radiator odzracit! odzracevanj! pelet! peletk! drva$ sekanc solarn! solarni_kolektor sonc_kolektor dimn_tuljav`,
  streha: `nevihta! nevihti! neurj! streh_pusc streh_puca streh_tec streh_zamak streh_cur rina_zamas rine_zamas zleb_zamas zlebov_zamas dez! dezj! dezuje! ko_dez velux_okn streh! streha$! strehe$! strehi$! streho$! stresn! strešn ostresj! podstres zleb! zlebov! zlebi! rina$! rine$! rino$! rinah! rinn odtocn_cev_s_streh vertikal
    opek! opeka! crep! korc! kupe$ salonit! lepenk! bitumen! kritin! krov! krovec!! krovsk! klepar!! kleparsk! plocevin! zamaka! zamak! zamakanj! pusca_streh tece_skozi_streh
    curi_s_strop curi_iz_strop kaplja_s_strop dimnik! dimnika$ dimnikar!! obrob! snegolov! velux! stresno_okn stresna_okn tram! tramov! sleme! slemen! odnesl_veter veter_odnesel toca! toča`,
  vrt: `oreh! jablan! hrusk! cesnj! slive$ smrek! bor$ breza! brezo$ lipa$ lipo$ hrast! tuje$! tujo$ oljk! figo$ suho_drev suh_drev vrt! vrtnar!! vrtnarsk! vrtu$ vrta$ trav! travnik! trata! kosit! pokosit! pokos! kosnj! kosilnic! kosilnik! ktos fura_trave trimer! frez! drev! drevo$ drevje! sadn! sadovnjak!
    obrez! obrezat! obrezovanj! rezat_drev rezanj_drev posek! posekat! podret_drev podrl_drev zaga_drev ziva_mej ziv_mej zivic! zivo_mejo grm! grmovj! plevel! pleve! puliti_plevel
    listj! listje$! grabit! grabljenj! tlakov! tlakovc! kocke$ dvorisc! dvoris ograj! plot! plota$ sneg! snega$! kidat! kidanj! kidal! zemlj! humus! nasut! nasip namakal!
    zalivan! zalivanj! trta$ trte$ trto$ vinograd! vinogradnik bazen! uta$! ute$ vrtna_uta rastlin! cvetlic! gredic! gred$`,
  ciscenje: `umazan! okn_umazan zamazan! po_selitv po_preselitv cisc! ciscenj! cistil! ocist! ocistit! pocist! pocistit! cist$ cisto$ pucat! spucat! pucan! pucanj! pucal! pospravit! pospravi! pospravlj! pomit_okn umit_okn pomiv_okn
    okna_pomit okna_umit pomij! posesat! sesat! sesanj! sesal prah! prahu$ generaln! generalk! preprog! tepih! tepihe sedezne_garnitur_ocist kemicn_ciscenj globinsk!
    po_gradnj po_obnov gradbenem_prahu steklo_ocist cistilk!! cistilni! cistilec! cistilni_servis pranje_fasad visokotlacn! kercher! karcher! dezinfekcij! razkuz! moljc stenice$ scurk`,
  selitve: `znest! znesti! nadstrop selit! selitev! selitv! preselit! preseliti! selim! selimo! selil! preseljevanj! prevoz! prepelj! prepeljat! prenes! prenest! prenos! nosit! znosit! odnesti! odnest!
    odvoz! odpelj! odpeljat! kosovn! kosovni_odpad odpad! smeti! sut! odvoz_sut klavir! kombi! tovornjak! kamion! spraznit! izprazn! izpraznit! praznjenj podstresj_izprazn
    klet_izprazn stanovanje_izprazn hladilnik_prenest omaro_prenest stvari_prepelj pomoc_pri_selitv cuzat cucat`,
  drugo: `podira! podrl! zid_podir varil! varilc!! porus_sten rusit_sten podret_sten varit_ograj zvarit! hisnik!! hisnisk! popravil razna_popravil manjsa_popravil malenkost zidar!! zidat! zidan! zid$ zidu$ beton! betonir! betonaz! porus! rusit! rusenj! podret! adaptacij obnov! prenov!
    ograj_varit varit! varilec!! kovinsk! kljucavnicar!! steklar!! steklo! stekl! razbit_stekl alarm! kamer! videonadzor! garazn_vrat motor_za_vrat dvigaln! dvigalo! oglje gradbin! gradbenik`
};

// Vsaka beseda šteje enkrat (najmočnejše ujemanje), besedne zveze dodatno po 5 točk.
// Med besedami zveze sta lahko največ dve drugi besedi ("rina je zamašena").
const DELI = Object.entries(BESEDE).map(([k, niz]) => {
  const besede = [], zveze = [];
  for (let v of brezSumnikov(niz).split(/\s+/).filter(Boolean)) {
    const tock = v.endsWith("!!") ? 4 : v.endsWith("!") ? 2 : 1; v = v.replace(/!+$/, "");
    const cela = v.endsWith("$"); v = v.replace(/\$$/, "");
    const deli = v.split("_");
    if (deli.length === 1) besede.push({ w: v, cela, tock });
    else zveze.push(new RegExp(" " + deli.map((w, i) => w + (i === deli.length - 1 ? (cela ? " " : "[a-z0-9]* ") : "[a-z0-9]* (?:[a-z0-9]+ ){0,2}")).join("")));
  }
  return [k, besede, zveze];
});

const PREDPONE = ["pre", "po", "za", "na", "pri", "raz", "iz", "od", "pod", "s", "z", "o", "u", "v"];

// Vrne ključ stroke ali "" če ne prepozna.
export function prepoznajStroko(besedilo) {
  const cisto = brezSumnikov(besedilo).replace(/[^a-z0-9]+/g, " ").trim();
  if (cisto.length < 2) return "";
  const t = " " + cisto + " ", slova = cisto.split(" ");
  let naj = "", najTock = 0;
  for (const [k, besede, zveze] of DELI) {
    let tock = 0;
    for (const sl of slova) {
      // Tudi glagoli s predpono: prefarbat, zasraufat, odzracit ... ujamejo osnovo (farb, sraufat, zrac).
      const brez = PREDPONE.map((p) => (sl.startsWith(p) && sl.length - p.length >= 4 ? sl.slice(p.length) : "")).filter(Boolean);
      let m = 0;
      for (const b of besede) {
        if (b.tock <= m) continue;
        if (b.cela ? sl === b.w : sl.startsWith(b.w) || (b.w.length >= 4 && brez.some((x) => x.startsWith(b.w)))) m = b.tock;
      }
      tock += m;
    }
    for (const re of zveze) if (re.test(t)) tock += 5;
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
