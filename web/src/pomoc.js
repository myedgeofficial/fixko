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
    pralni_stroj_prikljuc prikljucek_za_pralni vodni_kamen filter_za_vod
    glavni_ventil glavn_ventil zapret_vod zapreti_vod zaprem_vod hidrofor! pisoar! bide! bidej! pritisk_vod slab_pritisk tlak_vod lijak! lijaka$ odtocn_cev
    mokr_madez_na_strop pralni_stroj_pusc pralni_pusc pomivalni_pusc_vod pusc_vod pusca_vod  bojler_ne_greje bojler_pusc greje_vod
    cistilna_naprav malo_komunaln vodoinstalater!! vodoinstalaterj!! inštalater kopalnc kopaln vodovodn! cevovod! cevovodar!! hidroizol zmrznil_cev zamrznil_cev
    vodn_kamen zamenjat_pip menjav_pip nov_pip nova_pipa pipo_zamenj spulanj! spulat! splakovanj! odtocni_jasek revizijsk_jask crpaln! vodnjak! kapnic!`,
  elektrika: `elektr! elektrik! elektricar!! elektrikar!! elektro! struj! tok$! toka$! tokom$ elektrike$! ni_elektrike ni_toka vticnic! vticnc! stekdoz! steker! stekr! stikal! stikalo! salter! salterj! luc! luci$! lucka! lucke! lampa! lamp! luster! lestenec! lestenc! svetil! svetilk! reflektor led_trak led_luc zarnic! birn! birna! varovalk! varovalka! fi_stikal fid! pada_varovalk pade_varovalk izbija! izbije! kratek_stik! stik iskri! iskr! smrdi_po_zgan kabel! kabl! zic! drot! napeljav! elektroinstal! domofon! zvonec! zvonc! sporhet! indukcij! kuhalna_plosc napa$ nape$ ventilator! zamrzoval! polniln! polnilnic! soncn_elektrarn solarn_elektrarn elektrarn! antena! anten! satelit! internet wifi omaric razdelil! stevec! merilni_mest ne_dela_luc ni_luci ne_sveti! zatemn rolete_na_motor priklop_stedil priklop_pecic prikljuc_stedil prikljuc_pecic
    razsvetljav! osvetljav! svetlob! vtikac! vtikac$ rcd! fid_stikal diferencial! stikaln_blok varovaln! panel! panelov! fotovoltaik! soncn_panel soncni_panel soncne_celic
    soncn_elektrar ventilator_v_kopalnic priklop! priklopit! priklopi! odklop! izklaplja! izklopi! izpada! izpadl! izpad_elektrik lustr! lustra! lestenc! prizge! ne_prizge ne_gori ne_sveti
    gori_luc ne_gori_luc senzor_gibanj senzor! pametn_his pametn_stikal podaljsek! razdelilec! elektricn_omar elektro_omar elektro_instalacij elektroinstalater!! elektricarj!! elektrikarj!!
    zica! zice$ kabli! kablov! utica! uticnic! prekidac! sijalic! sijalk! halogen! spot$ spoti$ spotov! led$ trafo! transformator! tokokrog! ozemljitev! strelovod!
    nov_stedilnik_priklop priklop_indukcij priklopit_indukcij priklop_stedilnik priklop_plosc vticnic_v ups$`,
  keramika: `silikon_okoli silikon_ob_kad silikon_v_kopalnic ploscic!! ploscice!! plosc! pločic ploc! fliz! flize! flise! fliesn keramik! keramicar!! fug! fugir! fugiran! silikon!! silikonir! mozaik! kamnit_tla marmor! granit! izravnav tlakovanj_kopalnic poloz_ploscic polaganj obloz! obloga! obkladanj kopalnico_obnov prenov_kopalnic obnov_kopalnic adaptacij_kopalnic
    ploscicar!! ploscicarj!! flizar!! flizarj!! fliesar! keramicarj!! plosice!! plosic!! plocic!! plocice!! pločice obloga_nad oblogo_nad nad_pultom nad_kuhinjskim_pult
    keramik_na_teras ploscice_na_teras ploscice_na_balkon obnov_kopalnic kopalnic_obnov kopalnica_obnov kopalnica_prenov prenova_kopalnic kopalnico_prenov kompletna_kopalnic
    silikon_v_tus silikon_v_kad silikonirat! silikonira! nov_silikon fug_plesn fuge! fugiranj! ploscice_dvig plosc_odstop terakot! klinker! gres$ porcelanat! kamen_na_sten`,
  pleskanje: `plesk! pleskar!! pleskat! prepleska! oplesk! pobarv! barv! farb! farbat! farbal! malar!! malat! malal! molar! belj! belit! pobelit! prebelit! krec! kreč apnen stena$ stene$ steno$ sten stenah strop! stropa! plesen! plesn! vlag vlazn madez madez! razpok! razpoke! glet! gletanj! gletat! spahtl! spahtlat! kitanj! kitat! tapet! tapeciranj termofasad lakir! lakiranj! premaz! zascit_les impregnacij
    pleskanj_fasad pleskat_fasad barvanj_fasad pobarvat_fasad pobarv_fasad prebarv_fasad dekorativn! dekorativni_omet strukturn_omet beneski_omet
    malanj! malanje! malat! malal! molat! farbanj! farbal! farbanj_fasad farbat_fasad pofarbat! prefarbat! belezen! beljenj! belejo pobelim pleskarj!! pleskarski! slikopleskar!! slikar_pleskar
    lise_na_strop lise$ rumen_strop madez_na_sten lakiranj_ograj lakirat_ograj lakirat_okn lazur! lazurn! zakrpat_luknj krpanj zakitat! disperzij! jupol! baleks`,
  mizarstvo: `okensk! okenska_polic mizar!! mizarj! tisler!! tislar!! tislerj! kljuk! cilinder! tecaj! tecaji! sarnir! sarnirj! sarnirji polkn! rolo$ omar! omaric kredenc! predal! predali! skrip! skripa! skripaj! lesen! lesa$ les$ desk! stopnic! stopnisc! ograja_na_stopnic pult! kuhinjsk_pult miz! mize$ stol! stoli$ postelj zatika! zatakn! se_ne_zapir! ne_zapira! ne_zapre! ne_zaprejo! se_ne_odpre! ne_odpre! zabojn lesn_ograj nadstresn_les brunar
    kuhinja_po_mer kuhinjo_po_mer omara_po_mer omaro_po_mer po_meri$! pohistvo_po_mer pohistv_po_mer vgradn_omar_po_mer mizarsk! mizarsko! tisljar!! tisljarj!! stolar!!
    srank! sranka$ sranki$ omar_razpad lesen_vrat lesena_vrat vrata_drs vrata_drgn vrata_se_ne_zapr notranj_vrat sobn_vrat lesen_ograj lesena_ogra lesen_teras lesena_teras
    masiv! masivn! iz_lesa iz_les$ iz_masiv hrast_mi postelj_skrip stol_popravi popravit_stol popravil_stol popravit_miz kredenc_razpad leseno_okn leseni_okn obnov_lesen restavrir! restavracij_pohist`,
  montaza: `pritrd_omar obes_omar pritrd_omaric sestav! sestavit! sestavlj! zloz! zlozit! montaz montir montirat monter!! ike! jysk! lesnina! harvey! mebl! mebel! pohistv! garnitur! sedezn! omaro_sestav sestav_omar
    televizor! televizij! tv! tv_na_sten na_steno! obesit! obesi! obesil! obes! pritrdit! pritrd! privijac! privit! sraufat! sraufa! zasraufat! luknjo_zvrtat zvrtat! vrtat! vrtanj!
    zaves! zavese! karnis! garnis! garnisn! polic! police$! slika_na_sten ogledal! kuhinj! kuhinjo_sestav vgradn! nosilec! drzal! obesalnik! kljukic
    sestavit_miz sestaviti_miz zlozit_miz sestav_miz sestavit_postelj sestavit_regal regal! garderob! garderobn_omar montaz_garderob montaz_omar montaz_kuhinj montaza_kuhinj
    postavit_omar postavit_omaro privit_kljuk privit_rocaj rocaj! rocaje vrtalnik! vrtalnikom bormasin! bohrmasin! luknje_v_sten luknjo_v_sten zvrtat_luknj
    televizor_na_zid tv_na_zid na_zid$ obesit_tv obesi_tv nosilec_za_tv stenski_nosil sedezno_sestav sestavit_sedez otrosk_postelj posteljic! nosilc obesanj!
    montir_polic montaz_polic montir_omaric montirat_omaric montaz_omaric montira! monterj!! montazer!! mebl! omaro_iz_ikee ikea! ikee$ ikei$ xxxlutz! lutz$ momax! merkur_pohist emmezeta! jysk!`,
  ogrevanje: `montaz_klim montir_klim namestit_klim nova_klim klimo_montir servis_klim ogrev! ogrevanj! gretj! gret! greje! ne_greje! ne_greja ni_gretja radiator! radiatorj! kalorifer! kaloriferj! rebrn grelec! grelnik! grelna
    pec$! peci$! pecjo$ kmecka_pec kamin! kaminsk! kotel! kotla$! kotlu$ kotlovnic! kurisc! kurjav! kurilnic! kurit! centraln! centralna! plin! plinsk! plinski_kotel serviser_plin
    toplotn! toplotna_crpalk crpalk! klima! klim! klimat! klimatsk! split hladi! ne_hladi! hladilni_plin freon! mrzl! mrzel! mrzlo! hladn! zmrzuj zebe! zebe$
    talno! talnega! termostat! luft! zrak_v_radiator odzracit! odzracevanj! pelet! peletk! drva$ sekanc solarn! solarni_kolektor sonc_kolektor dimn_tuljav
    radiator_pusc radiatorj_pusc radiator_kaplj klima_kaplj klima_curi klima_pusc klima_smrdi klim_smrdi klima_pisk klima_ne_dela klima_ne klimo_ocist ciscenj_klim
    ociscenj_klim klimatsk! klimatske! klimatizer! inverter! kaminsk_pec kamin_ne_vlec pec_ne_vlec pec_na_drv pec_na_pelet peletn! pelet! pumpa_pri_central obtocn_crpalk
    centraln_ne_gre centralno_ogrevanj centralna_ne kotel_napak kotel_ne kotel_kaze plinsk_pec plinsk_kotel kondenzacijsk! etazn! etaz! toplovod! daljinsk_ogrevanj
    termostat! ni_gretja gretje_ne_dela gretje_ne nimamo_ogrevanj nimam_ogrevanj ogrevanje_ne_dela servis_pec servis_kotl servis_toplotn bojler_na_toplotn dimnikar! oljn_gorilnik gorilnik! kurilno_olj kurilnega_olj`,
  streha: `nevihta! nevihti! neurj! streh_pusc streh_puca streh_tec streh_zamak streh_cur rina_zamas rine_zamas zleb_zamas zlebov_zamas dez! dezj! dezuje! ko_dez velux_okn streh! streha$! strehe$! strehi$! streho$! stresn! strešn ostresj! podstres zleb! zlebov! zlebi! rina$! rine$! rino$! rinah! rinn odtocn_cev_s_streh vertikal
    opek! opeka! crep! korc! kupe$ salonit! lepenk! bitumen! kritin! krov! krovec!! krovsk! klepar!! kleparsk! plocevin! zamaka! zamak! zamakanj! pusca_streh tece_skozi_streh
    curi_s_strop curi_iz_strop kaplja_s_strop dimnik! dimnika$ dimnikar!! obrob! snegolov! velux! stresno_okn stresna_okn tram! tramov! sleme! slemen! odnesl_veter veter_odnesel toca! toča
    zleb_pusc zlebovi_pusc zleb_puca zlebovi_zamas zleb_zamas ocist_zleb ocistit_zleb zamenjat_zleb rina_puca rina_pusc rine_puca rine_polne rina_polna zamaka_s_strop
    zamaka_strop kaplja_s_strop_ko_dez dezuje! salonitn! salonitne_plosc azbest! snegobran! snegolovil! nadstresek! nadstresk! nadstresek_pusc nadstresni prekrivanj! prekrit_streh
    strešnik strešnika strešnike stresnik! stresnika! stresnike! stresna_okn stresno_okn stresni_okn kritina! kritino! odkril_streh dimnik_popravi dimnik_pusc dimnik_puca obroba! obrobe! plocevinast_streh pocena_opeka tegola`,
  vrt: `oreh! jablan! hrusk! cesnj! slive$ smrek! bor$ breza! brezo$ lipa$ lipo$ hrast! tuje$! tujo$ oljk! figo$ suho_drev suh_drev vrt! vrtnar!! vrtnarsk! vrtu$ vrta$ trav! travnik! trata! kosit! pokosit! pokos! kosnj! kosilnic! kosilnik! ktos fura_trave trimer! frez! drev! drevo$ drevje! sadn! sadovnjak!
    obrez! obrezat! obrezovanj! rezat_drev rezanj_drev posek! posekat! podret_drev podrl_drev zaga_drev ziva_mej ziv_mej zivic! zivo_mejo grm! grmovj! plevel! pleve! puliti_plevel
    listj! listje$! grabit! grabljenj! tlakov! tlakovc! kocke$ dvorisc! dvoris ograj! plot! plota$ sneg! snega$! kidat! kidanj! kidal! zemlj! humus! nasut! nasip namakal!
    zalivan! zalivanj! trta$ trte$ trto$ vinograd! vinogradnik bazen! uta$! ute$ vrtna_uta rastlin! cvetlic! gredic! gred$
    stor! stora$ storov! storo! frezanj_stor posipat! posip! sol_na_dovoz pluzit! pluzenj! pluzi! dovoz_skidat zarasl! zarasen! zarascen! zarascen_parcel parcel! travn_rus travna_rus rusa$ travne_ruse
    zelenic! okolic_his urejanj_okolic urejanj_vrt urejat_vrt zasaditev! zasadit! sadik! grmovnic! striz_zivo striz_ziv strizenj_ziv skropljenj! skropit! skropiln! robot_kosilnic
    trimat! trimanj! kosnj_trav kosnja_zelenic zaga_drev zaganj_drev zagat_drev posek_drev zbirat_listj grabljenj_listj podrt_drev podret_smrek`,
  ciscenje: `umazan! okn_umazan zamazan! po_selitv po_preselitv cisc! ciscenj! cistil! ocist! ocistit! pocist! pocistit! cist$ cisto$ pucat! spucat! pucan! pucanj! pucal! pospravit! pospravi! pospravlj! pomit_okn umit_okn pomiv_okn
    okna_pomit okna_umit pomij! posesat! sesat! sesanj! sesal prah! prahu$ generaln! generalk! preprog! tepih! tepihe sedezne_garnitur_ocist kemicn_ciscenj globinsk!
    po_gradnj po_obnov gradbenem_prahu steklo_ocist cistilk!! cistilni! cistilec! cistilni_servis pranje_fasad visokotlacn! kercher! karcher! dezinfekcij! razkuz! moljc stenice$ scurk
    likat! likanj! pranj pranje_oken$ pranj_oken$ pomivanj_oken$ ciscenj_oken$ pomit_oken$ umit_oken$ zlikat! perilo! perila$ pranje_okn pranj_okn okn_pranj pranj_tlakov pranje_terase ciscenj_teras pranj_preprog pranj_sedez ciscenj_sedez ciscenje_sedezne
    ciscenj_kuhinj ociscenj_kuhinj ciscenj_stopnis ciscenje_stopnisca ciscenj_pisarn ciscenje_vzmetnic vzmetnic pomit_tla pomij_tla pobrisat_tla brisanj_tal mravlj! scurk! scurki!
    dezinsekcij! deratizacij! miš$ misi$ podgan! ose$ osje_gnezd stenic! molji$ hisna_pomocnic gospodinjsk_pomoc cistilko!! cistilke!! cistilca!! cistilni_servis`,
  selitve: `znest! znesti! nadstrop selit! selitev! selitv! preselit! preseliti! selim! selimo! selil! preseljevanj! prevoz! prepelj! prepeljat! prenes! prenest! prenos! nosit! znosit! odnesti! odnest! odvoz! odpelj! odpeljat! kosovn! kosovni_odpad odpad! smeti! sut! odvoz_sut klavir! kombi! tovornjak! kamion! spraznit! izprazn! izpraznit! praznjenj podstresj_izprazn klet_izprazn stanovanje_izprazn hladilnik_prenest omaro_prenest stvari_prepelj pomoc_pri_selitv cuzat cucat prevoz_pral znest_pral prenest_pral prevoz_hladil znest_hladil prenest_hladil
    prevoz_pohistv prevoz_omar prenos_pohistv prenest_pohistv pomoc_pri_selitv pomagat_pri_selitv prevoz_kavc prevoz_sedez prevozit! znosit_pohistv znest_pohistv odnest_pohistv odnest_star odvoz_pohistv odvoz_star odvoz_gradbe transport!! transportir! dostav!
    dostava_in_prenos prenos_sedez nosac! nosaci! nosacev selitven! selitvena$ fanta_in_kombi kombij! premik_pohistv premaknit! premakn! pakiranj! skatl!`,
  tla: `parket! laminat! tla$! tleh$ pod$ podi$ talni! talne! talna! talno! obloga! oblog! vinil! pvc_pod plut! tapison! itison! preprog! parketar!! laminat_dvig laminat_napihn laminat_odstop parket_brus parket_lak brusenj_parket polagan! polozit_laminat letvic! obrobn_letv zakljucn_letv podlog!
    lakiranj_parket lakirat_parket brusenj_parket parket_skrip pod_skrip tla_skrip lesena_tla lesen_pod lesena_tl ladijski_pod ladijsk! estrih_izravn izravnat_tla izravnav_tal
    samorazliv! nivelir! nabreknil! nabrekn! parket_nabrek laminat_nabrek talno_oblog talne_oblog talna_oblog nova_tla polozit! polagal! linolej! epoksi! poliuretan_tla`,
  zidar: `zid_podir zidar!! zidat! zidan! zid$!! zidu$ beton!! betonir! betonaz! omet!! ometa!! fasad!! fasada! fasaderst estrih! zidov! predeln! predelna_sten stena_poc razpok_v_zid razpoka! razpok! omet_odpad vlag_v_zid vlaga! vlazn! plesn_na_zid fasader!! demit! stiropor izolacij! knauf!! gips! mavcn! suhomont!! adaptacij! obnov_kopaln renovac! gradbe! dimnik_zid
    betoniranj! betonirat! zabetonir! betonsk! betonska_plosc betonsko_plosc ploscic_za_garaz temelj! temelja$ stebr! steber! armatur_za_beton opaz! zidarj!! zidarsk! zidanj! zidanje_ogra
    vlazn_sten vlazne_stene vlaga_v_klet sanacij_vlag sanacij! hidroizolacij! mavcn_plosc mavcne_plosc knauf_strop spuscen_strop spušč spuscen! suhomontazn! suhomontaz! gradnj_his gradnja! gradim!
    porusit_sten_in_zid zidat_nov ometavanj! ometat! razpoke_v_fasad razpok_v_fasad fasada_poc nova_fasad izolacija_fasad termoizolacij! grobi_gradbe adaptacija_stanovanj`,
  okna: `vrat! vrata$! vratc! kljucavnic! kljucavn! okn! okno$! okna$! oknu$ rolet! zaluzij! komarnik!! mrezic_proti_komarj kljucavnicar!! steklar!! steklo! stekl! okno! okna! oknu! vrata! vhodna_vrata garazn! senc! senčil! markiz! tend! rolo! komarn! tesnil! okovj! okov! kljuka! kljuko! kljuke! pvc_okn alu_okn steklo_poc razbit_okn oknar!! zaklenil! zaklenjen! zaklenjena! izgubil_kljuc
    zataknjen_kljucavnic kljucavnica_zatakn cilinder_na_vrat zamenjat_cilinder cilindr! regulacij_okn nastavit_okn nastavitev_okn menjav_okn zamenjav_okn nova_okna nov_okn
    mreze_proti_komarj mreza_proti_komarj insekt_mrez roleta_zatakn rolet_zatakn roleta_se_ne trak_na_rolet jermen_na_rolet garazna_vrat garazn_vrat_ne balkonsk! balkonska_vrat
    balkonska_vrata_ne okno_se_ne okno_ne okna_ne okno_pusca_zrak pusca_zrak vleče_skozi_okn vlece_skozi termopan! izolacijsk_stekl dvojno_stekl troslojn! oken$! pranj_oken$ pomit_oken$ umit_oken$ regulacij_oken$ nastavit_oken$ nastavitev_oken$ menjav_oken$ zamenjav_oken$ montaz_oken$ okvir_okn
    ključar kljucar!! kljucarj!! odklepanj! odklenit! odklenite zaklenjen_ven izgubil_kljuce izgubila_kljuce vhodn_vrat protivlomn! varnostn_vrat sekcijsk!`,
  aparati: `pecica_ne pecica_ne_greje pecica! pecic! stedilnik! hladilnik! pomivaln_stroj pralni susiln! aparat! gospodinjsk_apar pralni_stroj pralnega_stroj pomivalni_stroj! pomivalnega! susilni_stroj! susilnega! hladilni$ zamrzovaln! skrinj! pecico! plosca_ne indukcij! mikroval!! napa$ nape$ kuhaln! bojler_ne_greje serviser_aparat!! centrifug! ne_ozame ne_cerpa ne_hladi hladilnik_ne mikroval_ne zamrzoval_ne pomivalni_ne susilni_ne
     hladilnik!! pomivalk! pomivalka! priklop_pomivaln pomivalko! pomivalnem hladilnik_ropot hladilnik_ne_hlad stedilnik_ne stedilnik_ne_greje stedilnik! steklokeramicn!!
    steklokeramicna_plosc indukcijsk_plosc napa_ne_vlec napa_ne kavni_aparat kavomat! aparat_za_kav sesalnik! sesalnik_ne robotski_sesal ves_masin! ves_masina vesmasin! mašina masina! masin!
    masina_za_sud sudja$ sude$ frizider! frizi! frizider_ne hladilnik_ne_dela skrinja_ne zamrzovalnik_ne ne_centrifugir centrifugir! ne_izcrpa izcrpa! ne_vrti ropota! servis_aparat
    popravil_pralnega popravilo_pralnega gorenje$ bosch! whirlpool! electrolux! beko! candy$ miele! samsung! lg$ gospodinjsk_aparat`,
  drugo: `podira! podrl! varil! varilc!! porus_sten rusit_sten podret_sten varit_ograj zvarit! hisnik!! hisnisk! popravil razna_popravil manjsa_popravil malenkost porus! rusit! rusenj! podret! adaptacij obnov! prenov! ograj_varit varit! varilec!! kovinsk! razbit_stekl alarm! kamer! videonadzor! garazn_vrat motor_za_vrat dvigaln! dvigalo! oglje gradbin! gradbenik
    varjenj! varjenje! zvarit! zelezn_ograj zelezn! kovin! kovinsk_ograj kovinsk_vrat popravilo_kovin hisnik_za_blok hisnisk_dela drobna_popravil drobn_popravil manjsa_popravila
    moz_za_vse mozakar! vse_po_hisi montaz_alarm montaza_alarma alarmn! kamer_namest namestit_kamer namestitev_kamer videonadzor! brusit_noz brusenje_noz nozi$ noze$ izdelava_kljuc`
};

// Dodatne besede in zveze (2026-10-22): pogosti opisi strank, ki so prej šli k napačni stroki ali nikamor.
const DODATNO = {
  vodovod: `praln_stroj_na_vod priklop_praln_na_vod priklop_vod podometn_wc podometni! geberit! wc_kotlic wc_skoljk montaz_wc nov_wc$ menjava_wc zamenjav_wc
    hidrofor! crpalk_za_vod vodn_crpalk vodna_napeljav vodovodna_napeljav napeljav_vod vodovodn! odtok_v_tus odtocni_kanal kanaletk! rinola zamasen_lijak lijak!
    puscajoc! kapljajoc! zmrzn! pocena_cev pocil_cev voda_tece voda_curi voda_kaplja pritisk_vod filter_vod mehcalec! bide! pisoar! pomivalno_korit pipa_ne_zapr pipa_se_ne_zapr praln_korit montaz_tus montaz_umivaln montaz_korit`,
  elektrika: `instalacij_za_novo instalacij_v_hisi elektricne_instalacij elektroinstalacij! elektricne_napeljav nova_napeljav stara_napeljav vticnice$! vticnico! vtikac!
    svetilk! stropn_luc stropna_svetil zunanj_luc senzor_gibanj reflektor! led_svetil razsvetljav! pametn_his pametn_stikal rcd! fi_stikalo varovalke_pad
    ozemljit! strelovod! soncni_panel soncne_panel fotovoltai! fotovoltaik! inverter! razsmernik! brni_omaric elektricna_omaric`,
  keramika: `fuge_v_tus fuge_so fug_v_kopaln fugiranj_tus fugir_tus fugirat_tus fuge! fugo! fugam! ploscic_na_tleh talne_ploscic stenske_ploscic ploscicar!! flizar!! flizer!!
    keramicne! keramicn! polaganje_keramik polaganj_ploscic obnov_kopalnic prenova_kopalnic kopalnico_na_novo nova_kopalnic`,
  pleskanje: `beljenj! belezen! prebelit! pobelit! farbanj! prefarbat! pofarbat! pleskanj! barvanj! pobarvat! prepleskat! premazat! lakirat! lazur! lazurn!
    madezi_na_strop lise_na_strop plesen_na_sten crna_plesen stene_umazan`,
  tla: `vinilne! vinilnih! vinil_plosc laminatn! parketn! brusenj_tal lakiranj_tal polaganj_laminat polaganj_parket polaganj_vinil polagan_tal talne_obloge talna_obloga`,
  zidar: `rusenj_sten rusit_sten porusit_sten podret_sten prebit_sten preboj! prebiti! odstranit_sten temelj$!! temelji$!! temeljev$!! temelja$!! temeljn! skarp!! skarpa! oporn_zid prezidav!! prezidat! predelav_kopalnic
    gradnj_garaz gradnja_garaz gradnj_ute zidan_ograj zidana_ograj betonsk_ograj ometavanj!! ometat! fasad! zakljucn_sloj kontaktn_fasad`,
  mizarstvo: `izdelav_omar izdelava_omar izdelava_kuhinj kuhinja_po_meri omara_po_meri fronte! kuhinjske_front lesen! lesena! leseno! lesenih! pergol! nadstres_iz_les
    obnov_lesen obnova_lesen restavrir! les_lakir masivn! hrastov! smrekov! bukov! iverk! iverne! oplemeniten`,
  montaza: `sestav_predaln sestavit_predaln predalnik_sestav montaz_mize montaza_mize sestav_mize sestavit_mize pisaln_miz sestav_postelj sestavit_postelj montaz_omar montaza_omar
    montaz_kuhinj montaza_kuhinj montaza_omaric obesit_slik obesanj_slik obesanje! ogledal_obes montaz_karnis montaza_karnis garderobn! komoda! komodo! predalnik! regal! regale!`,
  ogrevanje: `montaz_pec montaza_nove_pec nova_pec zamenjav_pec menjava_pec pec_na_pelet pec_na_drv pec_na_plin pec_za_centraln montaz_kotl nov_kotel zamenjav_kotl montaz_radiator
    peci$ pecjo$ kotlu$ kurjav! centralno_ogrevanj klimatsk_naprav klimo! klime! toplotne_crpalk toplotno_crpalk kamin! kaminsk_pec dimnik_ne_vlec ne_vlece`,
  aparati: `zamrzovalnik! zamrzovalnik_zaleden zaleden! led_v_zamrzoval pomivalk_pusc pomivalni_stroj_pusc pralni_stroj_pusc pralni_stroj_ropot hladilnik_brni hladilnik_pusc
    pralnega_stroja_popravil pomivalk! pomivalka! pomivalko! susiln_stroj susilni! susilnik! mikrovalovk! kuhalna_plosca kuhalne_plosce`,
  streha: `kaplja_s_podstresj tece_s_podstresj curi_s_podstresj zamaka_na_podstresj s_strehe$ skozi_streh strehe_kaplj stresnik! stresnike! stresnikov! zlebov! zlebe! snegobran! snegolov!
    stresno_okno strešno_okno kleparsk! obroba_dimnik obrob_dimnik pregled_streh popravil_streh nova_streh`,
  okna: `montaz_zaluzij montaz_sencil montaz_rolet montaz_markiz zaluzij! zaluzije! zaluzijo! senčil! sencil! sencila! senčila! markiz! notranja_vrata notranjih_vrat nova_vrata nov_vrat montaza_vrat montaz_vrat vgradnj_vrat
    vhodna_vrata vhodnih_vrat balkonsk_vrat garazna_vrata okna_zamenjat zamenjav_oken montaz_oken roleta! rolete! roleto! zunanje_rolet komarnik! mreze_proti_komarj`,
  vrt: `kosnj! kosnja! pokosit! kosit_trav trato! trate! zivo_mej ziva_meja rezanje_zive obrezovanj_drev obrezat_drev podiranj_drev posek_drev sajenj! posadit! nasad!
    urejanj_vrt urejanje_okolic okolica_hise grabljenj_listj listje! plevel! tlakovc! tlakovanj_dvorisc namakaln! robotsk_kosilnic`,
  ciscenje: `oprat! oprati! sprat! oprat_sedezn oprati_sedezn pranj_garnitur ciscenj_po čiščenj pomivanj_oken pomit_okna umiti_okna generalno! globinsk! pranj_preprog pranj_sedezn ciscenj_sedezn tedensk_ciscenj redno_ciscenj
    ciscenj_pisarn ciscenje_stopnisc ciscenj_kopaln ciscenje_po_gradnj po_zabav cistilk!! cistilni_servis`,
  selitve: `prevoz_kavc prevoz_omar prevoz_hladilnik prevoz_pralnega prevoz_stvar selitev_stanovanj selitev_pisarn odvoz_pohistv odvoz_starega odvoz_smeti odvoz_kosovn
    izpraznit_klet izpraznitev! izpraznit! kosovni! kosovnih! sute! sut$ kombijem prevoz! selitev! odpelj_kuhinj odpelj_omar odpelj_pohistv odpelj_kavc odpelj_sedezn prenes_omar prenest_omar prenes_kavc prenest_kavc prenest_v_klet znest_v_klet prenes_pohistv prepelj_pohistv prevoz_pohistv`,
  drugo: `varjenj_ograj varit_ograj zvarit_ograj zelezna_ograj montaz_alarm montaza_alarm alarmni_sistem namestit_kamer namestitev_kamer videonadzor!! kamere!
    hisnik!! hisnika!! drobna_popravil razna_popravil manjsa_popravil popravila_po_his`
};
for (const [k, v] of Object.entries(DODATNO)) BESEDE[k] += " " + v;

// Vsaka beseda šteje enkrat (najmočnejše ujemanje), besedne zveze dodatno po 3 točke.
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

// Ena tipkarska napaka (izpuščena, odvečna, zamenjana ali zamenjani sosednji črki).
function enaNapaka(a, b) {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  if (i === a.length || i === b.length) return true;
  if (a.length === b.length && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2)) return true;
  return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i);
}
// Beseda se začne z osnovo, a z eno napako (»vticnca«, »plosice«, »radjator«). Le za daljše osnove.
const zNapako = (sl, w) => w.length >= 5 && sl.length >= 4 && [w.length - 1, w.length, w.length + 1].some((n) => n <= sl.length && enaNapaka(sl.slice(0, n), w));

// Vrne ključ stroke ali "" če ne prepozna.
export function prepoznajStroko(besedilo) {
  const cisto = brezSumnikov(besedilo).replace(/[^a-z0-9]+/g, " ").trim();
  if (cisto.length < 2) return "";
  const t = " " + cisto + " ", slova = cisto.split(" ");
  // Tudi glagoli s predpono: prefarbat, zasraufat, odzracit ... ujamejo osnovo (farb, sraufat, zrac).
  const brez = slova.map((sl) => PREDPONE.map((p) => (sl.startsWith(p) && sl.length - p.length >= 4 ? sl.slice(p.length) : "")).filter(Boolean));
  const tocke = DELI.map(([k, besede, zveze]) => {
    const m = slova.map((sl, i) => {
      let n = 0;
      for (const b of besede) {
        if (b.tock <= n) continue;
        if (b.cela ? sl === b.w : sl.startsWith(b.w) || (b.w.length >= 4 && brez[i].some((x) => x.startsWith(b.w)))) n = b.tock;
      }
      return n;
    });
    let z = 0;
    for (const re of zveze) if (re.test(t)) z += 3;
    return [k, besede, m, z];
  });
  // Besede, ki jih ne pozna nobena stroka, poskusimo še s tipkarsko napako (pol točke manj).
  slova.forEach((sl, i) => {
    if (sl.length < 4 || tocke.some(([, , m]) => m[i])) return;
    for (const tk of tocke) for (const b of tk[1]) if (!b.cela && b.tock > tk[2][i] && zNapako(sl, b.w)) tk[2][i] = b.tock - 0.5;
  });
  let naj = "", najTock = 0;
  for (const [k, , m, z] of tocke) {
    const tock = m.reduce((a, b) => a + b, 0) + z;
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
