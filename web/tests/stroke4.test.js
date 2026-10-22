import test from "node:test";
import assert from "node:assert/strict";
import { prepoznajStroko } from "../src/pomoc.js";

// Celi stavki, kot jih pišejo stranke (2026-10-22). Dovolimo nekaj zgrešenih, a ne več kot 3 %.
const SKUPINE = [{
vodovod: ["Iz pipe v kuhinji ves čas kaplja","V kopalnici se je zamašil odtok od umivalnika","Wc ves čas teče voda","Rabim nekoga da zamenja pipo","Pod pomivalnim koritom je mokro","Kotliček ne neha teči","Voda ne odteka iz kadi","Počila je cev v kleti","Potrebujem montažo novega tuša","Bojler pušča","Menjava sifona pod umivalnikom","Iz stropa kaplja voda od soseda","Ni tople vode","Straniščna školjka je počena","Slab pritisk vode pri tušu","Montaža pralnega stroja na vodo","Zamenjava kotlička za wc","Odtok v kuhinji smrdi","Zamenjava ventila pod umivalnikom","Montaža nove kopalniške pipe","Kanalizacija je zamašena","Pušča tuš","Kapljanje iz tuša","Nova pipa za kuhinjo","Wc školjka se maje","Montaža podometnega wc-ja","Zamenjava cevi","Vodovodna napeljava v novi kopalnici","Voda teče po steni","odtok v tušu je počasen"],
elektrika: ["Ne dela mi vtičnica v dnevni sobi","Pada varovalka ko vklopim pečico","Rabim električarja za nove vtičnice","Luč v kopalnici ne gori več","Montaža lestenca","Zamenjava stikal v celem stanovanju","Iz vtičnice je iskrilo","Nimam elektrike v polovici hiše","Priklop indukcijske plošče","Nova elektro napeljava","Namestitev zunanje luči","LED trak pod kuhinjo","Zamenjava varovalk z avtomatskimi","Polnilnica za električni avto","Domofon ne dela","Zvonec ne zvoni","Vtičnica je razmajana","Dodatna vtičnica v kuhinji","Utripa luč v hodniku","Montaža reflektorja s senzorjem","Ventilator v kopalnici ropota","Zmanjkuje elektrike","Električna omarica brni","Napeljati kabel do garaže","Montaža stropne luči","Elektrika v garaži","Luči ne delajo","Stikalo za luč je zlomljeno","Montaža svetil","Inštalacije za novo hišo"],
keramika: ["Polaganje ploščic v kopalnici","Ploščice v kuhinji so počene","Fuge v tušu so črne","Obnova kopalnice","Nove ploščice na balkonu","Zamenjava nekaj počenih ploščic","Polaganje keramike v kuhinji","Fugiranje tuša","Silikon okoli kadi je plesniv","Odstopile so ploščice na terasi","Polaganje talnih ploščic v hodniku","Stenske ploščice nad pultom","Keramičar za celo kopalnico","Ploščice za stopnice","Nova keramika na tleh"],
pleskanje: ["Prebeliti dnevno sobo","Pleskanje celega stanovanja","Pobarvati fasado","Beljenje stropa v kuhinji","Plesen na steni v spalnici","Pobarvati ograjo","Lakiranje lesenih oken","Popravilo razpok in beljenje","Prepleskati otroško sobo","Farbanje sten","Rabim pleskarja","Odstranitev tapet in beljenje","Madeži na stropu od vode","Pleskanje hodnika in stopnišča","Barvanje lesenega balkona"],
tla: ["Polaganje laminata v dveh sobah","Brušenje in lakiranje parketa","Parket škripa","Laminat se je napihnil","Polaganje vinila","Nova talna obloga","Zamenjava parketa","Polaganje vinilnih plošč","Letvice ob laminatu","Talna obloga v pisarni","Laminat v spalnici","Izravnava tal pred polaganjem","Popravilo parketa","Tla v dnevni sobi","Tapison odstranit in položit laminat"],
zidar: ["Zidanje predelne stene","Ometavanje garaže","Popravilo fasade","Razpoka v zidu","Betoniranje dvorišča","Vlaga v kleti","Izolacija fasade","Rušenje stene med kuhinjo in dnevno","Postavitev mavčne stene","Spuščen strop iz knaufa","Zidar za manjša dela","Odpadel omet na hiši","Betonska plošča za uto","Temelji za ograjo","Sanacija vlage v zidu","Zidanje škarpe","Gradnja garaže","Popravilo stopnic iz betona","Nova fasada na hiši","Prezidava kopalnice"],
mizarstvo: ["Izdelava omare po meri","Kuhinja po meri","Lesene stopnice škripajo","Popravilo predala","Vrata omare se ne zapirajo","Nov kuhinjski pult","Izdelava lesene mize","Lesena ograja na terasi","Popravilo lesenega stola","Vgradna omara v predsobi","Mizar za kuhinjske fronte","Lesen nadstrešek","Obnova starih lesenih vrat","Izdelava police iz lesa","Lesena pergola"],
montaza: ["Sestavit omaro iz Ikee","Montaža kuhinje","Obesit televizor na steno","Sestava postelje","Pritrditi police na steno","Montaža garderobne omare","Sestavljanje pohištva","Obesiti ogledalo v kopalnici","Montaža karnis za zavese","Sestaviti predalnik","Montaža omaric v kuhinji","Sestavit otroško posteljo","Pritrdit omarico nad wc","Obešanje slik","Montaža pisalne mize"],
ogrevanje: ["Radiator ne greje","Servis plinskega kotla","Montaža klime","Klima ne hladi","Čiščenje klime","Toplotna črpalka javlja napako","Peč na pelete ne dela","Zamenjava radiatorjev","Talno gretje ne greje","Odzračevanje radiatorjev","Termostat ne dela","Servis toplotne črpalke","Kamin ne vleče","Montaža klimatske naprave v spalnici","Centralna kurjava ne dela","Kotel je ugasnil","Peč na drva","Klima kaplja","Montaža nove peči","Ogrevanje ne deluje"],
aparati: ["Pralni stroj ne ožame","Hladilnik ne hladi","Pomivalni stroj ne izčrpa vode","Pečica ne greje","Sušilni stroj ne suši","Mikrovalovka ne dela","Popravilo pralnega stroja","Štedilnik ne dela","Zamrzovalnik je zaledenel","Pralni stroj ropota","Pomivalka pušča","Napa ne vleče","Kuhalna plošča ne dela","Hladilnik brni","Pralni stroj ne centrifugira"],
streha: ["Streha pušča","Zamenjava strešnikov","Žleb je zamašen","Čiščenje žlebov","Popravilo strehe po toči","Veter je odnesel strešnike","Zamaka ob dimniku","Nova streha na garaži","Zamenjava žlebov","Pušča strešno okno","Kleparska dela","Snegobrani na streho","Obroba dimnika","Pregled strehe","Kaplja s podstrešja"],
okna: ["Okno se ne zapre","Roleta se je zataknila","Zamenjava oken","Vhodna vrata se težko zaklenejo","Mreže proti komarjem","Nastavitev balkonskih vrat","Zamenjava ključavnice","Zaklenil sem se ven","Garažna vrata ne delajo","Steklo na oknu je počilo","Montaža žaluzij","Okno pušča zrak","Menjava tesnil na oknih","Nova notranja vrata","Montaža senčil"],
vrt: ["Košnja trave","Obrezovanje dreves","Rezanje žive meje","Podiranje drevesa","Urejanje vrta","Grabljenje listja","Polaganje tlakovcev","Postavitev ograje okoli vrta","Kidanje snega","Odstranitev grmovja","Sajenje dreves","Namakalni sistem za trato","Pokositi travnik","Obrezovanje sadnega drevja","Čiščenje plevela"],
ciscenje: ["Čiščenje stanovanja po selitvi","Pomivanje oken","Generalno čiščenje hiše","Čiščenje po gradnji","Čiščenje sedežne garniture","Pranje preprog","Tedensko čiščenje stanovanja","Čiščenje pisarne","Pranje fasade","Čiščenje stopnišča v bloku","Globinsko čiščenje","Pospravljanje stanovanja","Umiti okna in balkon","Čiščenje kopalnice","Čiščenje po zabavi"],
selitve: ["Selitev stanovanja","Prevoz kavča","Odvoz kosovnih odpadkov","Prenesti klavir v drugo nadstropje","Pomoč pri selitvi","Prevoz pralnega stroja","Izpraznitev kleti","Odvoz starega pohištva","Prevoz omare","Selitev pisarne","Odvoz šute","Prevoz stvari s kombijem","Izpraznitev podstrešja","Odvoz smeti iz hiše","Prevoz hladilnika"],
drugo: ["Varjenje ograje","Montaža alarma","Namestitev kamer","Manjša popravila po hiši","Hišnik za blok","Popravilo kovinske ograje","Razna drobna popravila"]
}, {
vodovod:["kuhinjska pipa ne zapre do konca","iz odtoka v kleti prihaja voda","v kopalnici je pod umivalnikom luža","rabim nov sifon","zamenjat tuš baterijo","straniščni kotliček ne napolni vode","voda v wcju kar teče","menjava wc deske in kotlička","zamašena cev od pomivalnega korita","montaža pralnega korita v kleti"],
elektrika:["v spalnici ne dela nobena vtičnica","ko prižgem luč, izbije varovalko","rabim nekoga za priklop luči na terasi","namestit pametna stikala","stikalo v hodniku iskri","napeljava za klimo elektrika","kabel za internet do sobe","nova razdelilna omarica","montaža lučke nad ogledalom","zamenjat dotrajano vtičnico"],
keramika:["odpadla je ploščica nad kadjo","polaganje ploščic na terasi","ponovno fugirat kuhinjo","nove stenske ploščice v wc","nova keramika v kopalnici","silikon v tuš kabini je črn","položit ploščice v kleti","počena ploščica v hodniku"],
pleskanje:["prebelit dve sobi in kuhinjo","stene bi rad prebarval v sivo","na stropu so rjavi madeži","plesen za omaro na steni","pleskanje lesenega opaža","pobarvat kovinsko ograjo","osvežit stene v stanovanju","beljenje stopnišča"],
tla:["laminat je odstopil ob vratih","položit parket v dnevni","brušenje starega parketa","vinil v kuhinji","talne letvice pritrdit","zamenjat laminat v hodniku","nova tla v otroški sobi"],
zidar:["zazidat okno","prebiti steno za vrata","omet na fasadi odpada","razpoke na fasadi","betonirat pot do hiše","zidar za zid okoli vrta","sanacija vlažnih zidov","mavčnokartonska stena v podstrešju"],
mizarstvo:["izdelava lesene garderobe","nova kuhinja iz masivnega lesa","škripajo lesene stopnice","predal se je zlomil","vrata od omare visijo","lesena miza po naročilu","izdelava lesene klopi"],
montaza:["sestavit kuhinjo iz ikee","sestavljanje omare jysk","obesit televizijo na zid","montaža police in ogledala","sestaviti sedežno","montaža kuhinjskih omaric","pritrdit omaro na steno da se ne prevrne"],
ogrevanje:["radiatorji so mrzli","klima piska in ne dela","servis klime pred poletjem","plinski kotel kaže napako","nova toplotna črpalka","talno ogrevanje v kopalnici ne greje","peč za centralno ugaša","kamin dimi v sobo"],
aparati:["pralni stroj ne spusti vode","hladilnik dela led","pečica se ne segreje","pomivalni stroj ne pomije dobro","sušilni stroj ropota","štedilnik ena plošča ne greje","mikrovalovna ne greje"],
streha:["streha zamaka ob dežju","žlebovi so polni listja","odpadel je strešnik","popravilo strehe na garaži","menjava kritine","zamakanje ob strešnem oknu","kaplja s stropa ko dežuje"],
okna:["okno se ne da odpret","rolete se ne spustijo","zamenjava stekla na oknu","balkonska vrata se ne zaprejo dobro","nova vhodna vrata","menjava cilindra na vratih","komarnik za balkonska vrata","montaža zunanjih žaluzij"],
vrt:["pokosit travo okoli hiše","obrezat živo mejo","podret staro drevo","urediti vrt pred hišo","položit tlakovce na dvorišču","posekat grmovje","obrezovanje trte"],
ciscenje:["generalno čiščenje stanovanja","pomit okna v hiši","čiščenje po prenovi","oprati sedežno garnituro","čiščenje preprog na domu","redno čiščenje pisarne","počistit klet"],
selitve:["preselit stanovanje v drug kraj","prevoz pohištva","pomoč pri selitvi v drugo nadstropje","odpeljat staro kuhinjo","odvoz odpadkov po prenovi","prenest omaro v klet","prevoz pralnega stroja do novega stanovanja"],
drugo:["zavarit kovinsko ograjo","namestitev videonadzora","hišnik za razna dela","drobna popravila v stanovanju"]
}, {
vodovod:["teče iz pipe tudi ko je zaprta","v tušu stoji voda","odtok pri pralnem stroju je zamašen","počila cev pod umivalnikom","wc se ne splakne"],
elektrika:["v kuhinji nimam toka","luč v sobi utripa in brni","rabim nove vtičnice v garaži","izpada elektrika","priklop štedilnika na elektriko"],
keramika:["ploščice so se odlepile","flize v kopalnici počene","položit keramiko v predsobi","fugirat ploščice na balkonu"],
pleskanje:["pobelit spalnico","plesniv strop v kopalnici","prepleskat ograjo na balkonu","stene so polne madežev"],
tla:["parket je razpokan","polaganje laminata 40 m2","nov pod v sobi"],
zidar:["ometat steno v kleti","porušit predelno steno","nova fasada"],
mizarstvo:["popravit vrata od kuhinjske omarice","lesena ograja na stopnicah se maje","omara po meri za podstrešje"],
montaza:["sestavit garderobno omaro","obesit police v dnevni","montaža postelje iz jyska"],
ogrevanje:["radiator v kopalnici je mrzel","klima smrdi","peč ne vžge"],
aparati:["pralni stroj ne dela","hladilnik je tiho in ne hladi","pomivalni stroj javlja napako"],
streha:["po nevihti teče skozi streho","žleb je odpadel"],
okna:["okno ne tesni","roleta je padla dol","vrata se ne zaklenejo"],
vrt:["košnja vrta 500 m2","obrezat sadno drevje"],
ciscenje:["čiščenje hiše pred prodajo","umit okna"],
selitve:["prevoz kavča v Ljubljano","selim se, rabim pomoč"]
}];
test("prepoznava stroke v celih stavkih strank", () => {
  let n = 0; const napake = [];
  for (const P of SKUPINE) for (const [k, l] of Object.entries(P)) for (const s of l) { n++; const r = prepoznajStroko(s); if (r !== k) napake.push(`${s} → ${r || "nič"} (pričakovano ${k})`); }
  console.log(`# pravilno ${n - napake.length}/${n}`);
  assert.ok(napake.length <= n * 0.03, napake.join("\n"));
});
