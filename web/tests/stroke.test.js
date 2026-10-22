import test from "node:test";
import assert from "node:assert/strict";
import { prepoznajStroko } from "../src/pomoc.js";

// Stavki, kot bi jih napisala ali povedala stranka (tudi narečno, brez šumnikov, z napakami).
const PRIMERI = {
  vodovod: [
    "iz pipe ves cas tece voda", "umivalnik se pocas prazni", "v kopalnici smrdi iz odtoka", "školjka se maje", "pralni stroj ne odteka",
    "Pušča pipa v kuhinji", "pipa kaplja", "puca pipa", "pipa puca ze tri dni", "zamašen odtok", "odtok se je zamasil", "voda ne odteka iz korita",
    "wc ne splakuje", "skoljka pusca", "straniščna školjka je počila", "kotliček stalno teče", "spula ne dela", "hasl je zamasen", "klozet zamasen",
    "tuš kabina pušča", "kad je zamasena", "počila cev v kopalnici", "rura je pocila", "curi izpod umivalnika", "lavandin je zamasen", "spina kaplja",
    "bojler pušča", "ni tople vode", "menjava pipe", "nova mešalna baterija", "sifon pod koritom pušča", "kanalizacija smrdi", "voda na tleh v kopalnici"
  ],
  elektrika: [
    "v dnevni sobi ne dela nobena luč", "ko prižgem kuhalno ploščo vrže varovalko", "rabim novo vtičnico na balkonu", "lampa utripa",
    "Ne dela vtičnica", "stekdoza ne dela", "pregorela luč na hodniku", "menjava zarnice na stropu", "birna je pregorela", "salter ne dela", "stikalo iskri",
    "varovalka stalno pada", "izbija fi stikalo", "nimamo elektrike v kuhinji", "ni toka v garaži", "priklop štedilnika", "nov lestenec v dnevni sobi",
    "montaža luči", "domofon ne dela", "zvonec ne zvoni", "napeljava za klimo elektrika", "kabel je pregrizen", "vticnica je crna"
  ],
  keramika: [
    "v kuhinji so odstopile ploščice nad pultom", "fuge so črne",
    "Odpadle ploščice v kopalnici", "polaganje ploščic", "flize so počile", "nove fuge v kopalnici", "silikon okoli kadi je plesniv", "obnova kopalnice ploscice", "keramičar za kuhinjo"
  ],
  pleskanje: [
    "po poplavi so stene vlažne in plesnive", "rabim nekoga da prefarba spalnico", "strop je rumen od dima",
    "prepleskati dnevno sobo", "pobeliti stanovanje", "farbat stene", "malat sobo", "plesen na steni", "strop je umazan, treba prebelit", "razpoke v steni",
    "gletanje sten", "nova barva v otroški sobi", "tapete odstraniti", "pleskar za hodnik", "pobarvat ograjo"
  ],
  mizarstvo: [
    "okenska polica je gnila", "vrata od omare so padla dol",
    "vrata se ne zapirajo", "vrata skripajo", "kljuka je odpadla", "polkna so trohnela",
    "nova kuhinja po meri mizar", "stopnice skripajo", "predal se zatika", "tisler za omaro po meri", "šarnir na omarici je počil"
  ],
  montaza: [
    "kupila sem posteljo v jysku pa je ne znam sestavit", "rabim nekoga da mi obesi slike", "pritrdit omarico v kopalnici",
    "Sestaviti omaro iz Ikee", "sestavit posteljo", "montaža pohištva", "obesiti televizor na steno", "tv na steno", "zložit omaro iz jyska",
    "obesit police", "privijač karnise", "nova garnišna", "obesit ogledalo v kopalnici", "sraufat mebl"
  ],
  ogrevanje: [
    "v hiši je mraz, peč ne gre", "klimo bi rad očistil in servisiral", "radiator v kopalnici je hladen",
    "radiator je mrzel", "radiatorji ne grejejo", "kalorifer ne greje", "peč ne dela", "kotel ne vžge", "plinski kotel servis", "klima ne hladi",
    "servis klime", "montaža klime", "toplotna črpalka ne dela", "talno gretje ne greje", "odzračiti radiatorje", "luft v radiatorju", "mrzlo v stanovanju", "zebe nas"
  ],
  streha: [
    "po nevihti teče voda na podstrešje", "nekaj strešnikov je zdrsnilo", "žlebovi so polni listja",
    "zamaka streha", "streha pušča", "žleb je odpadel", "rina je zamasena", "rine so polne listja", "zamenjati opeko", "crep je padel s strehe",
    "dimnik razpadel", "veter odnesel streho", "curi s stropa ko dezuje", "salonitka streha", "klepar za obrobe", "velux okno pušča", "toča je razbila strešnike"
  ],
  vrt: [
    "trava je visoka do kolen", "oreh je treba podret ker je suh", "porezat živo mejo okoli hiše", "sneg je treba skidat z dovoza",
    "pokositi travo", "kosnja trave", "obrezati drevo", "podreti drevo", "živa meja je prerasla", "obrezat zivo mejo", "plevel na dvorišču",
    "pograbiti listje", "kidanje snega", "zalivanje vrta", "nova ograja", "polaganje tlakovcev", "kosilnica ne dela", "obrezovanje trte", "grmovje odstranit"
  ],
  ciscenje: [
    "po prenovi je vse v prahu, rabim čistilko", "okna so umazana", "temeljito očistit kopalnico",
    "Pomiti okna", "umit okna", "čiščenje stanovanja", "generalno čiščenje", "pucat hišo", "spucat stanovanje po selitvi", "čiščenje po gradnji",
    "očistiti preproge", "kemično čiščenje sedežne", "pospravit klet", "posesat in pobrisat prah", "cistilni servis za pisarno"
  ],
  selitve: [
    "selimo se iz bloka v hišo", "rabim nekoga da odpelje staro omaro na odpad", "iz tretjega nadstropja znest pralni stroj",
    "selitev stanovanja", "preselit se v hišo", "prevoz pralnega stroja", "prepeljat kavč", "odvoz kosovnih odpadkov", "izprazniti podstrešje",
    "prenesti klavir", "kombi za selitev", "odpeljat stare stvari", "odvoz šuta"
  ],
  tla: [
    "parket je dvignjen", "laminat poškodovan", "Laminat se je napihnil", "treba prebrusit parket", "položit vinil v dnevni sobi", "zamenjat talne letvice", "tapison bi zamenjal"
  ],
  zidar: [
    "zid na vrtu se podira", "zidar za ograjo iz betona", "fasada odpada", "odpada omet", "razpoka v zidu", "predelna stena iz knaufa", "vlaga v zidu"
  ],
  okna: [
    "vhodna vrata težko zaklenem", "rolete ne delajo", "komarnik za okno", "okno se ne zapre", "ključar", "razbito okno", "okno ne tesni", "zamenjat žaluzije", "zaklenil sem se ven"
  ],
  aparati: [
    "pečica ne greje", "pralni stroj ne ožame", "hladilnik ne hladi", "pomivalni stroj ne črpa vode", "sušilni stroj ne dela", "mikrovalovka ne greje"
  ],
  drugo: [
    "rabim varilca za vrata","porušit steno", "varit ograjo", "hišnik za manjša popravila", "zamenjati razbito steklo"]
};

test("prepoznava stroke na primerih", () => {
  const napake = [];
  let vse = 0;
  for (const [k, stavki] of Object.entries(PRIMERI)) for (const s of stavki) { vse++; const r = prepoznajStroko(s); if (r !== k) napake.push(`${s} → ${r || "(nič)"} (pričakovano ${k})`); }
  console.log(`pravilno ${vse - napake.length}/${vse}`);
  assert.deepEqual(napake, []);
});
test("splošni stavki ne izberejo stroke", () => {
  for (const s of ["pomagajte prosim", "rabim nekoga", "kdaj lahko pridete", ""]) assert.equal(prepoznajStroko(s), "", s);
});
