import test from "node:test";
import assert from "node:assert/strict";
import { prepoznajStroko } from "../src/pomoc.js";

// Dodatni stavki: pogovorno, narečno, brez šumnikov, s tipkarskimi napakami.
const PRIMERI = {
  vodovod: [
    "pipa v kopalni kaplja cel dan", "pusca pod koritom v kuhni", "zamasil se je odtok v tusu", "voda ne gre dol v lijaku", "lijak je zamašen",
    "odtok smrdi", "rabim vodoinstalaterja", "vodovodar za menjavo pipe", "pocena cev v kleti", "cev je zmrznila in pocla", "ventil pušča",
    "glavni ventil ne zapre", "ne morem zapret vode", "hasl se ne splakne", "wc kotlicek tece non stop", "školka je zamašena", "skolka puca",
    "stranisce je zamaseno", "kopalnca pusca", "tuš se ne odteka", "tus kabina zamasena", "voda curi iz stene", "mokri madez na stropu od soseda",
    "bojler ne greje vode", "grelnik vode pušča", "menjava bojlerja", "montaža umivalnika", "nov wc", "namestitev tuš kadi", "pomivalno korito pušča",
    "pipa se trese", "slab pritisk vode", "nimam vode v hisi", "hidrofor ne dela", "vodomer pušča", "čistilna naprava smrdi", "greznica je polna",
    "odtocna cev je zamasena", "pralni stroj pusca vodo po tleh", "zamasena kanalizacija", "kopalnico poplavilo", "kapljanje pipe", "puscajoca pipa",
    "pipo zamenjat", "pusa pipa", "zamasn odtok", "odtk zamasen", "ne odteka voda", "kad pušča ob robu", "bide pušča", "pisoar ne dela", "spulanje ne dela"
  ],
  elektrika: [
    "nimam elektrike", "elektrika je zmanjkala samo v eni sobi", "varovalke mi padajo", "vtičnica se je stalila", "vticnca ne dela", "ne dela luc v kopalnici",
    "luc utripa", "luči brlijo", "zamenjat stikalo", "nova razsvetljava v kuhinji", "led luci pod omaricami", "montaza lestenca", "obesit lestenec",
    "elektricar za hiso", "potrebujem električarja", "iskri iz vtičnice", "smrdi po zažganem iz vtičnice", "kabel je počen", "vtikač se je stopil",
    "ni toka", "zmanjkalo toka v pol hiše", "razdelilna omarica", "električna omarica", "fi stikalo pada", "rcd izklaplja", "podaljšek za vtičnico",
    "polnilnica za avto", "polnilnica za električni avto", "sončna elektrarna servis", "postavitev sončnih panelov", "zvonec je tiho", "pametna hiša stikala",
    "ventilator v kopalnici ne dela", "zunanja luč s senzorjem", "senzor gibanja za luč", "nov štedilnik priklop", "priklopit indukcijo", "elektro instalacije",
    "vticnice v garazi", "luc na balkonu", "zamenjava žarnice na visokem stropu", "lucka v hodniku ne gori", "ne gori luč", "lampa ne sveti", "kratek stik v kuhinji",
    "lustr se ne prizge", "šalter je zlomljen", "elektrka ne dela", "elektricna napeljava stara"
  ],
  keramika: [
    "polagat ploščice v kopalnici", "ploscice so pocile", "fuge so plesnive", "fugirat kopalnico", "nove flize v kuhni", "flizar", "keramicar za kopalnico",
    "obloga nad kuhinjskim pultom", "ploščice nad pultom", "polaganje keramike", "ploščičar", "plosce na balkonu so odstopile", "keramika na terasi poka",
    "kopalnica obnova kompletna", "prenova kopalnice", "silikonirat kad", "nov silikon v tušu", "keramika je odpadla", "plocice v wcju", "plosice so se dvignile",
    "mozaik v kopalnici", "terasa ploščice", "stopnice obložit s ploščicami", "pločice kuhinja"
  ],
  pleskanje: [
    "prebelit stanovanje", "beljenje sob", "pobelit hodnik", "farbanje stanovanja", "pleskanje fasade", "rabim pleskarja", "pleskar za dve sobi",
    "stene so umazane, treba prebelit", "plesen v kotu sobe", "črna plesen na stropu", "madeži na steni od vode", "steno pofarbat", "lakiranje ograje",
    "lakirat okna", "pobarvat lesena okna", "prefarbat vrata", "gletanje in beljenje", "zakrpat luknje v steni in prebelit", "tapeciranje stene",
    "odstranitev tapet", "dekorativni omet", "pobarvat fasado", "malanje stanovanja", "beljenje stropa", "rumene lise na stropu"
  ],
  mizarstvo: [
    "omara po meri", "vgradna omara po meri", "kuhinja po meri", "mizar za kuhinjo", "lesene stopnice škripajo", "popravilo lesenih vrat",
    "vrata drsajo po tleh", "notranja vrata se ne zaprejo", "vrata se zatikajo", "predali se ne zapirajo", "tečaji na omari", "omarica visi",
    "lesena ograja na balkonu", "lesen nadstrešek", "lesena terasa", "brunarica", "mizarska dela", "polica iz lesa", "tisljar", "šrank je razpadel",
    "kredenca je razpadla", "nova miza iz masivnega lesa", "postelja škripa", "popravit stol"
  ],
  montaza: [
    "sestavit omaro iz ikee", "zložit pohištvo", "montaža kuhinje iz ikee", "sestavljanje pohištva", "obesit tv", "televizor na zid", "obesit slike na steno",
    "montirat police", "obesit karnise", "pritrdit omaro na steno da ne pade", "obesit zavese", "monter pohištva", "sestavit otroško posteljico",
    "sestavit mizo", "privit kljuke na omarice", "zvrtat luknje za police", "obesit ogledalo", "montaža garderobne omare", "sestavit sedežno",
    "rabim nekoga z vrtalnikom", "sestavit regal", "postavit omaro", "montaza nosilca za tv"
  ],
  ogrevanje: [
    "peč na drva ne vleče", "kotel kaže napako", "plinska peč ne vžge", "radiator pušča", "radiatorji so hladni zgoraj", "odzracit radiatorje",
    "termostat ne dela", "talno ogrevanje ne greje", "toplotna črpalka piska", "klima kaplja v stanovanje", "klima smrdi", "čiščenje klime",
    "nova klima v spalnico", "montaža klimatske naprave", "servis toplotne črpalke", "servis peči", "servis kotla", "peč na pelete ne vžge",
    "pelet peč", "kamin ne vleče", "zamenjat radiator", "ni gretja", "nimamo ogrevanja", "v stanovanju je mrzlo", "klimatska naprava ne hladi",
    "kaminska peč", "centralna ne greje", "pumpa pri centralni ne dela", "ogrevanje ne dela", "klima ne dela", "klima piska", "bojler na toplotno črpalko"
  ],
  streha: [
    "streha pušča ko dežuje", "streha zamaka", "zamaka s stropa", "voda kaplja s stropa ko dežuje", "žleb pušča", "žlebovi so zamašeni",
    "očistit žlebove", "zamenjat žlebove", "popravilo strehe", "nova streha", "prekrivanje strehe", "salonitne plošče odstranit", "strešnik je počil",
    "strešna okna puščajo", "dimnik je treba popravit", "obrobe na dimniku", "veter je odkril streho", "toča je razbila streho", "krovec za hišo",
    "klepar za žlebove", "strešna kritina", "pločevinasta streha pušča", "snegobrani", "nadstrešek pušča", "rine so polne", "rina puca"
  ],
  vrt: [
    "pokosit travnik", "kosit travo okoli hise", "košnja zelenice", "trava je previsoka", "porezat grmovje", "obrezat sadno drevje", "obrezovanje sadnega drevja",
    "podret smreko", "posekat drevo ob hiši", "žaganje drevesa", "odstranit štor", "frezanje štorov", "rezat živo mejo", "striženje žive meje",
    "urejanje vrta", "vrtnar za urejanje okolice", "zasaditev grmovnic", "nov travnik", "polaganje travne ruše", "namakalni sistem", "plevel med tlakovci",
    "grabljenje listja", "skidat sneg", "plužit sneg", "posipat dovoz", "ograja okoli vrta", "postavit plot", "tlakovanje dvorišča", "tlakovci",
    "robot kosilnica", "kosilnico popravit", "škropljenje sadnega drevja", "trimat travo", "zarasel vrt", "čiščenje zaraščene parcele"
  ],
  ciscenje: [
    "čiščenje stanovanja enkrat na teden", "pospravljanje hiše", "čistilka za hišo", "rabim čistilko", "pomit okna in okvirje", "pranje oken",
    "čiščenje po prenovi", "čiščenje po selitvi", "čiščenje kopalnice", "zlikat perilo", "likanje", "čiščenje sedežne garniture", "pranje preprog",
    "globinsko čiščenje vzmetnice", "čiščenje pisarne", "čiščenje stopnišča v bloku", "pranje fasade", "čiščenje terase", "pranje tlakovcev",
    "pucat okna", "spucat kopalnico", "generalno ciscenje hise", "čiščenje kuhinje", "pomit tla", "temeljito čiščenje", "dezinsekcija ščurki", "mravlje v hiši"
  ],
  selitve: [
    "selitev iz ljubljane v maribor", "preselitev hiše", "preseljevanje", "rabim kombi in dva fanta", "prevoz kavča", "prevoz pohištva", "prevoz pralnega stroja",
    "znest omaro v tretje nadstropje", "znosit pohištvo", "odnest staro pohištvo", "odvoz starega pohištva", "odvoz kosovnih odpadkov", "praznjenje stanovanja",
    "izpraznit klet", "odvoz gradbenega materiala", "odvoz šuta", "prenos klavirja", "selitev pisarne", "prevoz stvari", "transport hladilnika", "odpeljat smeti",
    "dostava in prenos sedežne", "pomoč pri selitvi", "nosači za selitev"
  ],
  tla: [
    "položit laminat", "polaganje laminata", "parket je treba prebrusit", "brušenje parketa", "lakiranje parketa", "parket škripa", "laminat se dviguje",
    "pvc talna obloga", "vinil tla", "polaganje vinila", "nova tla v dnevni sobi", "talne letvice", "obrobne letvice", "tapison", "itison odstranit",
    "lesena tla", "ladijski pod", "estrih je treba izravnat", "parket je nabreknil", "pod škripa"
  ],
  zidar: [
    "zidat steno", "zidarska dela", "rabim zidarja", "ometavanje sten", "omet odpada", "fasada je počila", "nova fasada", "izolacija fasade",
    "betoniranje plošče", "betonirat temelj", "zabetonirat stebre", "vlažne stene v kleti", "sanacija vlage", "predelna stena iz mavčnih plošč",
    "knauf strop", "spuščen strop", "suhomontažna dela", "zidanje ograje", "razpoke v fasadi", "betonska plošča za garažo", "porušit steno in zidat novo",
    "adaptacija stanovanja", "gradnja hiše"
  ],
  okna: [
    "vhodna vrata se ne zaklenejo", "ključavnica je zataknjena", "zamenjat cilinder na vratih", "zaklenil sem se ven iz stanovanja", "izgubil sem ključe",
    "okno ne tesni", "okno pušča zrak", "nastavit okna", "regulacija oken", "nova okna", "menjava oken", "pvc okna", "alu okna", "roleta se ne dvigne",
    "roleta je zataknjena", "trak na roleti je počil", "zamenjat jermen na roleti", "žaluzije so pokvarjene", "komarnik po meri", "mreže proti komarjem",
    "senčila na balkonu", "tenda", "markiza na terasi", "garažna vrata ne odpirajo", "razbito steklo na oknu", "steklar", "termopan steklo počilo",
    "balkonska vrata ne zapirajo", "kljuka na oknu je zlomljena", "okno se ne odpre"
  ],
  aparati: [
    "pralni stroj ne dela", "pralni stroj ne centrifugira", "pralni ne vrti", "pralni stroj ne izčrpa vode", "pralni stroj ropota", "pomivalka ne pomiva",
    "pomivalni stroj pušča", "hladilnik ne hladi več", "hladilnik ropota", "zamrzovalnik se ne ohladi", "skrinja ne zmrzuje", "pečica ne peče",
    "štedilnik ne greje", "indukcijska plošča ne dela", "steklokeramična plošča počila", "mikrovalovna pečica ne greje", "sušilni stroj ne suši",
    "napa ne vleče", "kavni aparat pokvarjen", "popravilo pralnega stroja", "serviser gospodinjskih aparatov", "veš mašina ne dela", "masina za suđe ne dela",
    "frižider ne hladi", "frizider ropota", "pomivalni ne izčrpa", "sesalnik ne vleče"
  ],
  drugo: [
    "varjenje železne ograje", "zvarit kovinska vrata", "popravilo kovinske ograje", "hišnik za blok", "hišniška dela", "manjša popravila po hiši",
    "razna drobna popravila", "mož za vse", "montaža alarma", "videonadzor kamere", "namestitev kamer", "brusit nože"
  ]
};

test("prepoznava stroke na dodatnih primerih", () => {
  const napake = [];
  let vse = 0;
  for (const [k, stavki] of Object.entries(PRIMERI)) for (const s of stavki) { vse++; const r = prepoznajStroko(s); if (r !== k) napake.push(`${s} → ${r || "(nič)"} (pričakovano ${k})`); }
  console.log(`pravilno ${vse - napake.length}/${vse}`);
  assert.deepEqual(napake, []);
});
