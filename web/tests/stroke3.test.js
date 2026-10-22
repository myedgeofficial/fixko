import test from "node:test";
import assert from "node:assert/strict";
import { prepoznajStroko } from "../src/pomoc.js";

// Kratki in površni opisi (tipkarske napake, ena beseda, brez šumnikov).
const P = {
 vodovod:["pipa v kuhinji mi kapa","zamasu se je lavabo","v kopalnici tece voda iz pod kadi","wc school puscaa","kotlicek ne napolni","rabim nekoga za odtok","odtok v tušu počasi odteka","odtokje zamasen","zamenjava sifona","pipa je odpadla","tuš glava pušča","voda smrdi iz jaška","menjava kotlička","nova kopalniska pipa","vodovodna napeljava stara","pomoč curi voda"],
 elektrika:["vtičnica iskri","ne dela mi nobena vticnica","lučka v kopalnici crkne","elektrika mi pada","vrže varovalke","rabim elektricarja","zamenjat luč","namestit led trakove","nova vticnica v kuhinji","menjava stikal","polnilnica za tesla","zarnica pregorela","senzor za luč na hodniku","elekticar"],
 keramika:["ploščice v kuhinji","polaganje plošic v kopalnici","flize odpadle","fuge so umazane in črne","prenova kopalnice komplet","kermičar","keramičar za teraso","polozit ploscice na balkon"],
 pleskanje:["prepleskat sobo","prebelit hiso","beljenje stanovanja","stene so polne madezev","pleskarska dela","farbanje fasade","plesen v kopalnici na stropu","prebarvati stene"],
 mizarstvo:["popravilo omare","vrata od kredence visijo","tečaj na omarici je strgan","nova lesena vrata","stopnice iz lesa","mizar za omaro","predal je zlomljen"],
 montaza:["sestavljanje omare","montaža ikea kuhinje","pritrdit tv","obesit lestev","montaža police","sestavljanje postelje","obesiti zavese in karnise","montirati omarico"],
 ogrevanje:["radiatorji ne grejejo","peč ne greje","kotel ne dela","toplotna ne greje","klima ne piha hladno","servis klime pred poletjem","plinski kotel kaže napako","termostat ne dela prav","odzračevanje radiatorjev","nimamo tople sobe, gretje ne dela"],
 streha:["streha pušča","zamenjat strešnike","žleb odpadel","čiščenje žlebov","streha zamaka po dežju","popravit streho","dimnik pušča","krovska dela","rine zamasene z listjem"],
 vrt:["pokositi vrt","košnja trave","obrezat drevje","podret drevo","živa meja","trava","posekat grmovje","vrtnar","odvoz vej in porezat grmovje","kosnja"],
 ciscenje:["čiščenje hiše","pomit okna","generalno","ciscenje stanovanja po najemnikih","pospravit stanovanje","čistilni servis","posesat"],
 selitve:["selitev","preselitev stanovanja","prevoz omare","odvoz starih stvari","znest pralni stroj v klet","prenos pohištva","pomagat pri selitvi"],
 tla:["laminat","polaganje parketa","brušenje parketa","nova talna obloga","parket je poškodovan","vinil talna obloga"],
 zidar:["zidar","omet","fasada","beton","zidanje","razpoke na fasadi","knauf"],
 okna:["roleta ne dela","okno ne zapira","ključavnica","vrata se ne zaklenejo","zaluzije","komarniki","steklo počilo na oknu","nova vhodna vrata","senčila"],
 aparati:["pralni stroj","pomivalni stroj ne dela","hladilnik","pečica","sušilni stroj","mikrovalovka","pralni stroj ne izpusti vode","štedilnik ne dela"],
 drugo:["varilec","hisnik","manjša popravila","varjenje"]
};

test("prepoznava kratkih in površnih opisov", () => {
  const napake = [];
  for (const [k, stavki] of Object.entries(P)) for (const s of stavki) { const r = prepoznajStroko(s); if (r !== k) napake.push(`${s} → ${r || "(nič)"} (pričakovano ${k})`); }
  assert.deepEqual(napake, []);
});
test("vljudnostni stavki ne izberejo stroke", () => {
  for (const s of ["hvala", "nujno", "dober dan, prosim za ponudbo", "imam problem"]) assert.equal(prepoznajStroko(s), "", s);
});
