// Države in regije zunaj Slovenije. Slovenija ostane, kot je (REGIJE v data.js, ključi brez »-«).
// Ključ tuje regije je »država-regija« (npr. de-by), »država-vsa« pomeni celo državo. Ključi se shranjujejo v bazo.
const R = (cc, s) => s.split("|").map((x) => { const [k, ...n] = x.split(":"); return [cc + "-" + k, n.join(":")]; });
export const TUJE_REGIJE = {
  HR: R("hr", "zg:Grad Zagreb|zgz:Zagrebačka|kz:Krapinsko-zagorska|sm:Sisačko-moslavačka|ka:Karlovačka|vz:Varaždinska|kk:Koprivničko-križevačka|bb:Bjelovarsko-bilogorska|pg:Primorsko-goranska|ls:Ličko-senjska|vp:Virovitičko-podravska|ps:Požeško-slavonska|bp:Brodsko-posavska|zd:Zadarska|ob:Osječko-baranjska|sk:Šibensko-kninska|vs:Vukovarsko-srijemska|st:Splitsko-dalmatinska|is:Istarska|du:Dubrovačko-neretvanska|mi:Međimurska"),
  AT: R("at", "w:Wien|no:Niederösterreich|oo:Oberösterreich|s:Salzburg|t:Tirol|v:Vorarlberg|k:Kärnten|st:Steiermark|b:Burgenland"),
  DE: R("de", "bw:Baden-Württemberg|by:Bayern|be:Berlin|bb:Brandenburg|hb:Bremen|hh:Hamburg|he:Hessen|mv:Mecklenburg-Vorpommern|ni:Niedersachsen|nw:Nordrhein-Westfalen|rp:Rheinland-Pfalz|sl:Saarland|sn:Sachsen|st:Sachsen-Anhalt|sh:Schleswig-Holstein|th:Thüringen"),
  CH: R("ch", "zh:Zürich|be:Bern|lu:Luzern|ur:Uri|sz:Schwyz|ow:Obwalden|nw:Nidwalden|gl:Glarus|zg:Zug|fr:Fribourg|so:Solothurn|bs:Basel-Stadt|bl:Basel-Landschaft|sh:Schaffhausen|ar:Appenzell Ausserrhoden|ai:Appenzell Innerrhoden|sg:St. Gallen|gr:Graubünden|ag:Aargau|tg:Thurgau|ti:Ticino|vd:Vaud|vs:Valais|ne:Neuchâtel|ge:Genève|ju:Jura"),
  IT: R("it", "pie:Piemonte|vda:Valle d'Aosta|lom:Lombardia|taa:Trentino-Alto Adige|ven:Veneto|fvg:Friuli Venezia Giulia|lig:Liguria|emr:Emilia-Romagna|tos:Toscana|umb:Umbria|mar:Marche|laz:Lazio|abr:Abruzzo|mol:Molise|cam:Campania|pug:Puglia|bas:Basilicata|cal:Calabria|sic:Sicilia|sar:Sardegna"),
  FR: R("fr", "idf:Île-de-France|ara:Auvergne-Rhône-Alpes|bfc:Bourgogne-Franche-Comté|bre:Bretagne|cvl:Centre-Val de Loire|cor:Corse|ges:Grand Est|hdf:Hauts-de-France|nor:Normandie|naq:Nouvelle-Aquitaine|occ:Occitanie|pdl:Pays de la Loire|pac:Provence-Alpes-Côte d'Azur|om:Outre-mer"),
  ES: R("es", "an:Andalucía|ar:Aragón|as:Asturias|ib:Illes Balears|cn:Canarias|cb:Cantabria|cl:Castilla y León|cm:Castilla-La Mancha|ct:Cataluña|vc:Comunitat Valenciana|ex:Extremadura|ga:Galicia|md:Madrid|mc:Murcia|nc:Navarra|pv:País Vasco|ri:La Rioja|cym:Ceuta y Melilla"),
  PT: R("pt", "nor:Norte|cen:Centro|lis:Área Metropolitana de Lisboa|ale:Alentejo|alg:Algarve|aco:Açores|mad:Madeira"),
  NL: R("nl", "dr:Drenthe|fl:Flevoland|fr:Friesland|ge:Gelderland|gr:Groningen|li:Limburg|nb:Noord-Brabant|nh:Noord-Holland|ov:Overijssel|ut:Utrecht|ze:Zeeland|zh:Zuid-Holland"),
  BE: R("be", "bru:Bruxelles / Brussel|van:Antwerpen|vli:Limburg|vov:Oost-Vlaanderen|vwv:West-Vlaanderen|vbr:Vlaams-Brabant|wbr:Brabant wallon|wht:Hainaut|wlg:Liège|wlx:Luxembourg|wna:Namur"),
  PL: R("pl", "ds:Dolnośląskie|kp:Kujawsko-pomorskie|lu:Lubelskie|lb:Lubuskie|ld:Łódzkie|ma:Małopolskie|mz:Mazowieckie|op:Opolskie|pk:Podkarpackie|pd:Podlaskie|pm:Pomorskie|sl:Śląskie|sk:Świętokrzyskie|wn:Warmińsko-mazurskie|wp:Wielkopolskie|zp:Zachodniopomorskie"),
  CZ: R("cz", "pha:Praha|stc:Středočeský|jhc:Jihočeský|plk:Plzeňský|kvk:Karlovarský|ulk:Ústecký|lbk:Liberecký|hkk:Královéhradecký|pak:Pardubický|vys:Vysočina|jhm:Jihomoravský|olk:Olomoucký|zlk:Zlínský|msk:Moravskoslezský"),
  SK: R("sk", "ba:Bratislavský|tt:Trnavský|tc:Trenčiansky|ni:Nitriansky|zi:Žilinský|bc:Banskobystrický|po:Prešovský|ki:Košický"),
  HU: R("hu", "bud:Budapest|pe:Pest|kd:Közép-Dunántúl|nyd:Nyugat-Dunántúl|dd:Dél-Dunántúl|em:Észak-Magyarország|ea:Észak-Alföld|da:Dél-Alföld"),
  GB: R("gb", "lon:London|se:South East|sw:South West|ee:East of England|em:East Midlands|wm:West Midlands|yh:Yorkshire and the Humber|nw:North West|ne:North East|wal:Wales|sco:Scotland|ni:Northern Ireland"),
  IE: R("ie", "dub:Dublin|lei:Leinster|mun:Munster|con:Connacht|uls:Ulster"),
  US: R("us", "al:Alabama|ak:Alaska|az:Arizona|ar:Arkansas|ca:California|co:Colorado|ct:Connecticut|de:Delaware|dc:District of Columbia|fl:Florida|ga:Georgia|hi:Hawaii|id:Idaho|il:Illinois|in:Indiana|ia:Iowa|ks:Kansas|ky:Kentucky|la:Louisiana|me:Maine|md:Maryland|ma:Massachusetts|mi:Michigan|mn:Minnesota|ms:Mississippi|mo:Missouri|mt:Montana|ne:Nebraska|nv:Nevada|nh:New Hampshire|nj:New Jersey|nm:New Mexico|ny:New York|nc:North Carolina|nd:North Dakota|oh:Ohio|ok:Oklahoma|or:Oregon|pa:Pennsylvania|ri:Rhode Island|sc:South Carolina|sd:South Dakota|tn:Tennessee|tx:Texas|ut:Utah|vt:Vermont|va:Virginia|wa:Washington|wv:West Virginia|wi:Wisconsin|wy:Wyoming")
};
// Vse države (ISO 3166-1); tiste brez seznama regij imajo samo »cela država«.
export const DRZAVE = ("SI HR AT DE CH IT FR ES PT NL BE LU PL CZ SK HU GB IE US " +
  "AD AE AF AG AL AM AO AR AU AZ BA BB BD BG BH BN BO BR BS BW BY BZ CA CL CN CO CR CY DK DO DZ EC EE EG FI GE GH GR GT HK HN " +
  "ID IL IN IQ IS JM JO JP KE KR KW KZ LB LI LK LT LV MA MC MD ME MK MT MU MX MY NG NI NO NZ OM PA PE PH PK PR PY QA RO RS SA SE SG SM SN SV TH TN TR TT TW TZ UA UG UY UZ VE VN XK ZA").split(" ");
// Evro (SEPA nakazilo 0,01 € brez menjave) in EU (preverjanje DDV številke v VIES).
export const EVRO = new Set("SI AT BE BG CY DE EE ES FI FR GR HR IE IT LT LU LV MT NL PT SK AD MC SM VA ME XK".split(" "));
export const EU = new Set("AT BE BG CY CZ DE DK EE ES FI FR GR HR HU IE IT LT LU LV MT NL PL PT RO SE SI SK".split(" "));

// Država iz ključa regije: slovenski ključi nimajo »-«.
export const drzavaRegije = (k) => (String(k || "").includes("-") ? String(k).split("-")[0].toUpperCase() : "SI");
export const vsaKljuc = (cc) => (cc === "SI" ? "vsa" : cc.toLowerCase() + "-vsa");
export const jeVsa = (k) => k === "vsa" || String(k || "").endsWith("-vsa");
// Ali mojster z regijo r pokriva delo v regiji delo (»vsa« = vsa Slovenija, »de-vsa« = vsa Nemčija).
export function pokriva(r, delo) {
  if (r === delo) return true;
  if (r === "vsa") return !String(delo || "").includes("-");
  return jeVsa(r) && drzavaRegije(r) === drzavaRegije(delo);
}

// Jezik aplikacije po državi (kjer ga podpiramo); drugod "" = jezik telefona.
const DRZAVA_JEZIK = { SI: "sl", HR: "hr", BA: "hr", DE: "de", AT: "de", CH: "de", LI: "de", FR: "fr", MC: "fr", LU: "fr", IT: "it", SM: "it", VA: "it",
  ES: "es", AD: "es", PT: "pt", NL: "nl", PL: "pl", GB: "en", IE: "en", US: "en", CA: "en", AU: "en", NZ: "en", MT: "en" };
export const jezikDrzave = (cc) => DRZAVA_JEZIK[cc] || "";

// Država iz časovnega pasu naprave (zanesljivejše od jezika), nato iz jezika.
const PASOVI = {
  Ljubljana: "SI", Zagreb: "HR", Vienna: "AT", Berlin: "DE", Busingen: "DE", Zurich: "CH", Rome: "IT", Paris: "FR", Madrid: "ES", Canary: "ES",
  Lisbon: "PT", Madeira: "PT", Azores: "PT", Amsterdam: "NL", Brussels: "BE", Luxembourg: "LU", Warsaw: "PL", Prague: "CZ", Bratislava: "SK",
  Budapest: "HU", London: "GB", Dublin: "IE", Belgrade: "RS", Sarajevo: "BA", Podgorica: "ME", Skopje: "MK", Monaco: "MC", Vaduz: "LI",
  Stockholm: "SE", Copenhagen: "DK", Oslo: "NO", Helsinki: "FI", Athens: "GR", Bucharest: "RO", Sofia: "BG", Malta: "MT", Tallinn: "EE",
  Riga: "LV", Vilnius: "LT", Nicosia: "CY", Istanbul: "TR", Kyiv: "UA", Kiev: "UA", Chisinau: "MD", Tirane: "AL", Reykjavik: "IS"
};
const JEZIK_DRZAVA = { sl: "SI", hr: "HR", de: "DE", it: "IT", fr: "FR", es: "ES", pt: "PT", nl: "NL", pl: "PL", en: "GB", cs: "CZ", sk: "SK", hu: "HU" };
export function zaznajDrzavo(jeziki = [], pas = "") {
  const mesto = String(pas).split("/").pop();
  if (String(pas).startsWith("America/") && !PASOVI[mesto]) {
    const r = jeziki.map((j) => String(j).split("-")[1]).find(Boolean);
    return r && DRZAVE.includes(r.toUpperCase()) ? r.toUpperCase() : "US";
  }
  if (PASOVI[mesto]) return PASOVI[mesto];
  for (const j of jeziki) {
    const [jz, reg] = String(j).split("-");
    if (reg && DRZAVE.includes(reg.toUpperCase())) return reg.toUpperCase();
    if (JEZIK_DRZAVA[jz]) return JEZIK_DRZAVA[jz];
  }
  return "SI";
}
