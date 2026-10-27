// Prepoznava stroke v drugih jezikih (pravila zapisa kot v pomoc.js: ! 2 točki, !! ime mojstra 4 točke, $ cela beseda, _ besedna zveza).
// Angleščina in nemščina sta najbolj popolni; ostali jeziki imajo pogoste besede za vsako stroko.
export const SESTAVLJENKE = ["de", "nl"];
export const BESEDE_JEZIKI = {
  en: {
    vodovod: `plumber!! plumbing! leak! leaking! drip! dripping! tap$! taps$! faucet! sink! basin! drain! drains! clog! clogged! blocked_drain blocked_toilet blocked_sink
      toilet! loo$ wc$! flush! cistern! shower! bath$! bathtub! tub$ pipe! pipes! burst! water_heater boiler_leak no_hot_water no_water water_pressure low_pressure
      sewer! sewage! septic! valve! stopcock! washer_leak overflow! siphon! trap$ bidet! urinal! water_softener water_on_the_floor flooded! flood!`,
    elektrika: `electrician!! electric! electrical! electricity! socket! sockets! outlet! outlets! plug$ plugs$ switch! switches! light! lights! lighting! lamp! bulb!
      fuse! fuses! breaker! tripping! trips! rcd$! wiring! wire! wires! cable! power_cut no_power spark! sparks! doorbell! intercom! chandelier! spotlight!
      led$ ceiling_light fuse_box consumer_unit ev_charger solar_panel solar_panels inverter!`,
    keramika: `tiler!! tile! tiles! tiling! grout! grouting! regrout! ceramic! porcelain_tile mosaic! backsplash! splashback! bathroom_renovation new_bathroom
      cracked_tile loose_tile tiles_falling`,
    pleskanje: `painter!! decorator!! paint! painting! repaint! paint_the repainting! wallpaper! wallpapering! whitewash! emulsion! primer! varnish! stain_on_ceiling
      mould_on mold_on damp_patch walls_painted ceiling_painted plaster_crack`,
    tla: `floor! floors! flooring! floorer!! laminate! parquet! hardwood! vinyl! lino! linoleum! carpet! carpets! skirting! sanding_floor floor_sanding
      wooden_floor floorboard! floorboards! squeaky_floor`,
    zidar: `builder!! bricklayer!! mason!! brick! bricks! brickwork! wall_demolition knock_down knock_through masonry! concrete! cement! plaster! plastering! render!
      rendering! facade! façade! foundation! foundations! extension! garden_wall retaining_wall screed! damp_proof crack_in_the_wall chimney_repair`,
    mizarstvo: `carpenter!! joiner!! cabinetmaker!! carpentry! joinery! wooden! wood! door_sticks door_won_t door_does_not hinge! hinges! kitchen_cabinets wardrobe_made
      built_in fitted_wardrobe shelf_made worktop! decking! deck$ pergola! staircase! stairs! bannister! handrail!`,
    okna: `window! windows! glazing! glazier!! double_glazing glass! pane! shutter! shutters! blind! blinds! roller_blind awning! skylight! front_door
      patio_door sliding_door door_lock lock$! locks$ locksmith!! handle! draught! draft! mosquito_net fly_screen garage_door`,
    montaza: `assemble! assembly! assembling! flat_pack flatpack! ikea! furniture! put_together build_a build_the bed$ beds$ desk! table! chest_of_drawers
      dresser! bookcase! shelves! shelf! mount_tv tv_mount tv_on_the_wall hang_a hang_the hanging! mirror! curtain_rail curtain_pole picture!`,
    ogrevanje: `heating! heater! radiator! radiators! boiler! boilers! furnace! central_heating heat_pump air_con aircon! air_conditioning! air_conditioner! ac$ hvac!
      gas_engineer!! heating_engineer!! thermostat! underfloor_heating fireplace! stove! wood_burner chimney! not_heating cold_radiator bleed_radiator gas_leak`,
    aparati: `appliance! appliances! washing_machine washer$ dryer! tumble_dryer dishwasher! fridge! refrigerator! freezer! oven! cooker! hob! microwave! extractor!
      cooker_hood range_hood not_spinning not_cooling not_draining appliance_repair! repairman!!`,
    streha: `roof! roofer!! roofing! leaking_roof roof_leak gutter! gutters! downpipe! shingle! shingles! slate! slates! roof_tile roof_tiles flashing! chimney_flashing
      attic_leak loft_leak skylight_leak dormer! fascia! soffit!`,
    vrt: `gardener!! garden! gardening! lawn! lawns! grass! mow! mowing! hedge! hedges! tree! trees! prune! pruning! trim_hedge stump! weeds! weeding! landscaping! landscaper!!
      planting! plants! leaves! irrigation! sprinkler! paving! patio! driveway!`,
    ciscenje: `cleaner!! cleaning! clean! deep_clean deep_cleaning end_of_tenancy window_cleaning wash_windows carpet_cleaning upholstery! sofa_cleaning
      pressure_washing jet_wash after_builders after_renovation spring_clean housekeeping! maid!`,
    selitve: `removal! removals! removalist!! mover! movers! moving! move_house moving_house relocation! van$ transport! deliver! delivery! carry! take_away
      dispose! disposal! rubbish! junk! clearance! clear_out house_clearance skip$ man_with_a_van`,
    drugo: `handyman!! odd_jobs odd_job small_jobs small_repairs fix_a few_things welding! welder!! weld! alarm! cctv! camera! cameras! security_system smart_home
      general_repairs maintenance!`
  },
  de: {
    vodovod: `installateur!! klempner!! sanitar! sanitär! rohr! rohre! rohrbruch! wasserrohr! leck! undicht! tropft! tropfen! wasserhahn! hahn$! armatur! mischbatterie!
      waschbecken! spule! spüle! abfluss! abflüsse! verstopft verstopfung toilette! toiletten! klo$! wc$! spulung! spülung! spulkasten! spülkasten! dusche! duschkabine!
      badewanne! wanne$ boiler! warmwasser! kein_warmes_wasser kein_wasser wasserdruck! siphon! ventil! absperrhahn! kanal! kanalisation! wasserschaden! uberschwemm!
      überschwemm! nass! wasser$ wasserzahler! enthärtung! wasserenthärter!`,
    elektrika: `elektriker!! elektro! elektrik! strom! stromausfall! kein_strom steckdose! steckdosen! stecker! schalter! lichtschalter! licht! lampe! lampen! leuchte! leuchten!
      gluhbirne! glühbirne! birne$ sicherung! sicherungen! fi_schalter fehlerstrom! sicherungskasten! verteiler! kabel! leitung! leitungen! verkabelung! funken!
      klingel! turklingel! türklingel! gegensprechanlage! deckenlampe! led$ wallbox! photovoltaik! solaranlage! wechselrichter!`,
    keramika: `fliese! fliesen! fliesenleger!! kacheln! kachel! fugen! fuge! verfugen! keramik! mosaik! badsanierung! bad_sanieren badrenovierung! neues_bad
      fliesen_lose fliesen_gesprungen`,
    pleskanje: `maler!! malerarbeiten! streichen! anstreichen! gestrichen! anstrich! farbe! tapezieren! tapete! tapeten! lackieren! lack$! lasur! grundierung!
      schimmel! schimmelflecken! feuchte_flecken decke_streichen wand_streichen wande_streichen wände_streichen putzriss`,
    tla: `boden! boden$ böden! bodenbelag! bodenleger!! laminat! parkett! dielen! diele! vinyl! vinylboden! designboden! linoleum! teppich! teppichboden! sockelleiste! fussleiste!
      fußleiste! boden_schleifen parkett_schleifen knarrt!`,
    zidar: `maurer!! mauer! mauern! mauerwerk! wand_durchbruch durchbruch! wand_entfernen abriss! abreissen! abreißen! beton! betonieren! zement! putz! verputzen! verputz!
      fassade! fassaden! fundament! fundamente! anbau! estrich! riss_in_der_wand risse! trockenbau! rigips! gipskarton! schornsteinsanierung`,
    mizarstvo: `tischler!! schreiner!! zimmermann!! tischlerei! schreinerei! holz! holzarbeiten! tur_klemmt tür_klemmt tur_schliesst tür_schließt klemmt! scharnier! scharniere!
      einbauschrank! massanfertigung! maßanfertigung! kuchenfronten küchenfronten arbeitsplatte! terrasse_holz holzterrasse! pergola! treppe! treppen! gelander! geländer! handlauf!`,
    okna: `fenster! fensterbauer!! glas! glaser!! verglasung! scheibe! scheiben! rollladen! rollläden! rolladen! jalousie! jalousien! markise! markisen! plissee! haustur! haustür!
      terrassentur! terrassentür! schiebetur! schiebetür! schloss! schlüsseldienst!! schlusseldienst!! turgriff! türgriff! zieht! fliegengitter! insektenschutz! garagentor!`,
    montaza: `montage! montieren! aufbauen! aufbau! zusammenbauen! zusammenbau! ikea! mobel! möbel! mobelmontage! möbelmontage! schrank_aufbauen bett$ bett_aufbauen
      kommode! regal! regale! schreibtisch! tisch! fernseher_aufhangen fernseher_aufhängen tv_wand aufhangen! aufhängen! spiegel! gardinenstange! bilder!`,
    ogrevanje: `heizung! heizungen! heizungsbauer!! heizkorper! heizkörper! heizkessel! therme! gastherme! kessel! warmepumpe! wärmepumpe! fussbodenheizung! fußbodenheizung!
      klima! klimaanlage! klimagerät! klimagerat! lüftung! luftung! thermostat! kamin! ofen! kaminofen! schornstein! heizt_nicht kalt! entluften! entlüften! gasgeruch!`,
    aparati: `waschmaschine! trockner! wäschetrockner! waschetrockner! geschirrspuler! geschirrspüler! spulmaschine! spülmaschine! kühlschrank! kuhlschrank! gefrierschrank!
      gefriertruhe! backofen! herd! kochfeld! ceranfeld! induktion! mikrowelle! dunstabzug! dunstabzugshaube! hausgerat! hausgerät! gerate_reparatur geräte_reparatur
      schleudert_nicht kuhlt_nicht kühlt_nicht pumpt_nicht`,
    streha: `dach! dacher! dächer! dachdecker!! undichtes_dach dach_undicht dachrinne! dachrinnen! regenrinne! fallrohr! dachziegel! ziegel! schindel! schindeln! dachfenster!
      flachdach! dachboden_nass dachstuhl! spengler!! klempnerarbeiten_dach`,
    vrt: `garten! gartner!! gärtner!! gartenarbeit! gartenpflege! rasen! rasenmahen! rasenmähen! mahen! mähen! hecke! hecken! heckenschnitt! baum! baume! bäume! baumschnitt!
      fallen! fällen! baumfallung! baumfällung! unkraut! jaten! jäten! bepflanzung! pflanzen! laub! bewasserung! bewässerung! pflaster! pflastern! einfahrt! terrasse!`,
    ciscenje: `reinigung! reinigen! putzen! putzfrau!! putzkraft!! raumpfleger!! fensterreinigung! fenster_putzen grundreinigung! endreinigung! teppichreinigung!
      polsterreinigung! sofa_reinigen hochdruckreiniger! bauendreinigung! nach_renovierung haushaltshilfe!`,
    selitve: `umzug! umziehen! umzugsfirma!! umzugshelfer!! zugeln! zügeln! transport! transportieren! entrumpelung! entrümpelung! entsorgung! entsorgen! sperrmull! sperrmüll!
      haushaltsauflosung! haushaltsauflösung! wohnungsauflosung! wohnungsauflösung! lieferung! tragen! moebeltransport möbeltransport! transporter!`,
    drugo: `hausmeister!! handwerker!! kleinreparaturen! reparaturen! kleine_reparaturen schweissen! schweißen! schweisser!! schweißer!! alarmanlage! uberwachungskamera!
      überwachungskamera! videouberwachung! videoüberwachung! smart_home allerlei verschiedenes!`
  },
  fr: {
    vodovod: `plombier!! plomberie! fuite! fuit! goutte! robinet! robinets! mitigeur! evier! évier! lavabo! vasque! evacuation! évacuation! bouche! bouché! bouchon! canalisation!
      toilette! toilettes! wc$! chasse_d_eau douche! baignoire! tuyau! tuyaux! chauffe_eau ballon! pas_d_eau_chaude degat_des_eaux dégât_des_eaux siphon! vanne! debouchage!`,
    elektrika: `electricien!! électricien!! electrique! électrique! electricite! électricité! prise! prises! interrupteur! lumiere! lumière! lampe! ampoule! fusible! disjoncteur!
      disjoncte! tableau_electrique cable! câble! cablage! câblage! panne_de_courant plus_de_courant sonnette! interphone! lustre! spot! spots! borne_de_recharge`,
    keramika: `carreleur!! carrelage! carreau! carreaux! joint! joints! faience! faïence! mosaique! mosaïque! renovation_salle_de_bain rénovation_salle_de_bain`,
    pleskanje: `peintre!! peinture! peindre! repeindre! papier_peint tapisserie! enduit! vernis! lasure! moisissure! tache_au_plafond`,
    tla: `sol$ sols$ parquet! parqueteur!! stratifie! stratifié! vinyle! lino! moquette! plinthe! plinthes! poncage! ponçage! revetement_de_sol revêtement_de_sol`,
    zidar: `macon!! maçon!! maconnerie! maçonnerie! mur$ murs$ brique! briques! beton! béton! ciment! platre! plâtre! crepi! crépi! facade! façade! ravalement! fondation!
      fondations! extension! chape! fissure! fissures! demolition! démolition! abattre_un_mur placo! placoplatre!`,
    mizarstvo: `menuisier!! ebeniste!! ébéniste!! menuiserie! bois! porte_qui_frotte porte_coince charniere! charnière! placard_sur_mesure sur_mesure! plan_de_travail terrasse_bois
      pergola! escalier! rampe!`,
    okna: `fenetre! fenêtre! fenetres! fenêtres! vitre! vitres! vitrier!! vitrage! double_vitrage volet! volets! store! stores! store_banne porte_d_entree porte-fenetre baie_vitree
      serrure! serrurier!! poignee! poignée! moustiquaire! porte_de_garage`,
    montaza: `montage! monter! assemblage! assembler! ikea! meuble! meubles! armoire! lit$ commode! etagere! étagère! etageres! étagères! bureau! table! fixer_tv accrocher! miroir!
      tringle! cadre! cadres!`,
    ogrevanje: `chauffage! chauffagiste!! radiateur! radiateurs! chaudiere! chaudière! pompe_a_chaleur pompe_à_chaleur climatisation! climatiseur! clim$! thermostat! plancher_chauffant
      cheminee! cheminée! poele! poêle! ramonage! ne_chauffe_pas`,
    aparati: `electromenager! électroménager! lave-linge lave_linge machine_a_laver machine_à_laver seche-linge sèche-linge lave-vaisselle lave_vaisselle frigo! refrigerateur!
      réfrigérateur! congelateur! congélateur! four! plaque_de_cuisson micro-ondes hotte! ne_refroidit_pas ne_vidange_pas`,
    streha: `toit! toiture! couvreur!! fuite_du_toit gouttiere! gouttière! gouttieres! gouttières! tuile! tuiles! ardoise! ardoises! velux! zinguerie! charpente!`,
    vrt: `jardin! jardinier!! jardinage! pelouse! gazon! tondre! tonte! haie! haies! taille! arbre! arbres! elagage! élagage! abattage! desherbage! désherbage! paysagiste!!
      plantation! arrosage! feuilles! pave! pavé! allee! allée!`,
    ciscenje: `menage! ménage! nettoyage! nettoyer! femme_de_menage femme_de_ménage lavage_vitres laver_les_vitres nettoyage_canape shampouinage! karcher! fin_de_chantier
      grand_menage`,
    selitve: `demenagement! déménagement! demenager! déménager! demenageur!! déménageur!! transport! livraison! debarras! débarras! encombrant! encombrants! evacuation_dechets
      porter! camionnette!`,
    drugo: `bricoleur!! homme_a_tout_faire petits_travaux petites_reparations reparations! réparations! soudure! souder! soudeur!! alarme! camera! caméra! videosurveillance!
      vidéosurveillance! domotique!`
  },
  it: {
    vodovod: `idraulico!! idraulica! perdita! perde! gocciola! rubinetto! rubinetti! miscelatore! lavandino! lavabo! scarico! scarichi! intasato! otturato! ingorgo! wc$!
      water$! gabinetto! sciacquone! cassetta! doccia! vasca! tubo! tubi! tubatura! tubature! scaldabagno! boiler! acqua_calda niente_acqua allagamento! allagato! sifone!
      valvola! fogna! fognatura! bidet!`,
    elektrika: `elettricista!! elettrico! elettrica! elettricita! elettricità! presa! prese! spina! interruttore! interruttori! luce! luci! lampada! lampadina! fusibile! salvavita!
      differenziale! quadro_elettrico cavo! cavi! impianto_elettrico corrente! blackout! campanello! citofono! lampadario! faretti! led$ fotovoltaico! inverter!`,
    keramika: `piastrellista!! piastrelle! piastrella! fughe! fuga! ceramica! mosaico! rifacimento_bagno ristrutturazione_bagno bagno_nuovo`,
    pleskanje: `imbianchino!! pittore!! tinteggiatura! tinteggiare! imbiancare! verniciare! vernice! pittura! carta_da_parati muffa! macchie_sul_soffitto stucco!`,
    tla: `pavimento! pavimenti! pavimentista!! parquet! laminato! vinile! linoleum! moquette! battiscopa! levigatura!`,
    zidar: `muratore!! muratura! muro! muri! mattone! mattoni! cemento! calcestruzzo! intonaco! intonacare! facciata! facciate! fondamenta! massetto! crepa! crepe! demolizione!
      abbattere_muro cartongesso! ampliamento!`,
    mizarstvo: `falegname!! falegnameria! legno! porta_non_chiude porta_struscia cerniera! cerniere! armadio_su_misura su_misura! piano_di_lavoro pergolato! scala! scale! ringhiera!`,
    okna: `finestra! finestre! infisso! infissi! serramento! serramenti! serramentista!! vetro! vetri! vetraio!! tapparella! tapparelle! persiana! persiane! tenda_da_sole
      zanzariera! portone! porta_blindata serratura! fabbro!! maniglia! basculante!`,
    montaza: `montaggio! montare! assemblare! assemblaggio! ikea! mobile! mobili! armadio! letto$ cassettiera! comò! scaffale! mensola! mensole! scrivania! tavolo! appendere!
      specchio! bastone_tende quadro! quadri! tv_a_parete`,
    ogrevanje: `riscaldamento! termoidraulico!! termosifone! termosifoni! radiatore! radiatori! caldaia! pompa_di_calore climatizzatore! condizionatore! aria_condizionata clima$!
      termostato! riscaldamento_a_pavimento camino! stufa! canna_fumaria non_scalda`,
    aparati: `elettrodomestico! elettrodomestici! lavatrice! asciugatrice! lavastoviglie! frigo! frigorifero! congelatore! forno! piano_cottura microonde! cappa! non_centrifuga
      non_raffredda non_scarica`,
    streha: `tetto! tetti! copertura! lattoniere!! grondaia! grondaie! pluviale! tegola! tegole! coppi! lucernario! infiltrazione_dal_tetto guaina! impermeabilizzazione!`,
    vrt: `giardino! giardiniere!! giardinaggio! prato! erba! tagliare_l_erba tosaerba! siepe! siepi! potatura! potare! albero! alberi! abbattimento! erbacce! piante! foglie!
      irrigazione! vialetto!`,
    ciscenje: `pulizia! pulizie! pulire! impresa_di_pulizie colf! lavare_i_vetri pulizia_vetri pulizia_divano lavaggio_tappeti fine_cantiere sanificazione!`,
    selitve: `trasloco! traslochi! traslocare! traslocatore!! trasporto! consegna! sgombero! sgomberare! smaltimento! ingombranti! portare! furgone!`,
    drugo: `tuttofare!! piccoli_lavori piccole_riparazioni riparazioni! saldatura! saldare! saldatore!! allarme! telecamera! telecamere! videosorveglianza! domotica!`
  },
  es: {
    vodovod: `fontanero!! fontaneria! fontanería! fuga! gotea! goteo! grifo! grifos! griferia! grifería! fregadero! lavabo! desague! desagüe! atasco! atascado! obstruido! inodoro!
      vater! váter! wc$! cisterna! ducha! banera! bañera! tuberia! tubería! tuberias! tuberías! tubo! calentador! termo$ agua_caliente sin_agua inundacion! inundación! sifon! sifón!
      llave_de_paso alcantarillado! bidé! bide!`,
    elektrika: `electricista!! electrico! eléctrico! electrica! eléctrica! electricidad! enchufe! enchufes! interruptor! interruptores! luz$ luces! lampara! lámpara! bombilla! fusible!
      diferencial! cuadro_electrico cuadro_eléctrico cable! cables! cableado! instalacion_electrica sin_luz apagon! apagón! timbre! portero_automatico lampara_de_techo foco! focos!
      led$ placas_solares inversor!`,
    keramika: `alicatador!! azulejo! azulejos! baldosa! baldosas! juntas! ceramica! cerámica! mosaico! reforma_de_bano reforma_de_baño bano_nuevo baño_nuevo`,
    pleskanje: `pintor!! pintura! pintar! repintar! papel_pintado barniz! barnizar! moho! humedad! manchas_en_el_techo gotele! alisar_paredes`,
    tla: `suelo! suelos! solador!! parquet! tarima! laminado! vinilo! linoleo! moqueta! rodapie! rodapié! acuchillado! pulir_suelo`,
    zidar: `albanil!! albañil!! albanileria! albañilería! pared! paredes! muro! ladrillo! ladrillos! hormigon! hormigón! cemento! yeso! enlucido! fachada! fachadas! cimientos!
      solera! grieta! grietas! demolicion! demolición! tirar_un_tabique tabique! pladur! ampliacion! ampliación! obra! reforma!`,
    mizarstvo: `carpintero!! ebanista!! carpinteria! carpintería! madera! puerta_roza puerta_no_cierra bisagra! bisagras! armario_a_medida a_medida! encimera! pergola! pérgola!
      escalera! escaleras! barandilla!`,
    okna: `ventana! ventanas! cristal! cristales! cristalero!! acristalamiento! doble_acristalamiento persiana! persianas! toldo! toldos! mosquitera! puerta_de_entrada
      cerradura! cerrajero!! manilla! puerta_de_garaje contraventana!`,
    montaza: `montaje! montar! ensamblar! ikea! mueble! muebles! armario! cama$ comoda! cómoda! estanteria! estantería! estante! escritorio! mesa! colgar! espejo! cortinero!
      cuadro! cuadros! tele_en_la_pared soporte_tv`,
    ogrevanje: `calefaccion! calefacción! calefactor! radiador! radiadores! caldera! bomba_de_calor aire_acondicionado climatizacion! climatización! split! aerotermia! termostato!
      suelo_radiante chimenea! estufa! no_calienta`,
    aparati: `electrodomestico! electrodoméstico! electrodomesticos! electrodomésticos! lavadora! secadora! lavavajillas! nevera! frigorifico! frigorífico! congelador! horno!
      vitroceramica! vitrocerámica! placa_de_induccion microondas! campana! no_centrifuga no_enfria no_enfría`,
    streha: `tejado! tejados! techador!! cubierta! gotera! goteras! canalon! canalón! canalones! bajante! teja! tejas! claraboya! impermeabilizacion! impermeabilización!`,
    vrt: `jardin! jardín! jardinero!! jardineria! jardinería! cesped! césped! cortar_el_cesped cortacesped! seto! setos! poda! podar! arbol! árbol! arboles! árboles! tala!
      malas_hierbas plantas! hojas! riego! adoquin! adoquín!`,
    ciscenje: `limpieza! limpiar! limpiadora!! empleada_de_hogar limpieza_de_cristales limpiar_ventanas limpieza_de_sofa limpieza_de_alfombras fin_de_obra limpieza_a_fondo`,
    selitve: `mudanza! mudanzas! mudarse! transporte! portes! entrega! vaciado! vaciar_piso retirada! muebles_viejos trastos! cargar! furgoneta!`,
    drugo: `manitas!! chapuzas! pequenas_reparaciones pequeñas_reparaciones reparaciones! soldadura! soldar! soldador!! alarma! camara! cámara! camaras! cámaras! videovigilancia!
      domotica! domótica!`
  },
  pt: {
    vodovod: `canalizador!! encanador!! canalizacao! canalização! fuga! vazamento! pinga! torneira! torneiras! misturadora! lava-loica lava_loiça pia! lavatorio! lavatório! esgoto!
      entupido! entupida! entupimento! sanita! vaso_sanitario autoclismo! descarga! chuveiro! duche! banheira! cano! canos! tubo! tubos! esquentador! cilindro! agua_quente
      sem_agua inundacao! inundação! sifao! sifão! valvula! válvula! bide! bidé!`,
    elektrika: `eletricista!! electricista!! eletrico! elétrico! eletrica! elétrica! eletricidade! tomada! tomadas! interruptor! interruptores! luz$ luzes! lampada! lâmpada!
      disjuntor! quadro_eletrico quadro_elétrico cabo! cabos! fios! instalacao_eletrica sem_luz falta_de_luz campainha! intercomunicador! candeeiro! led$ paineis_solares`,
    keramika: `ladrilhador!! azulejo! azulejos! ladrilho! ladrilhos! mosaico! juntas! ceramica! cerâmica! remodelacao_de_casa_de_banho casa_de_banho_nova`,
    pleskanje: `pintor!! pintura! pintar! repintar! papel_de_parede verniz! envernizar! bolor! mofo! humidade! manchas_no_teto`,
    tla: `chao! chão! piso! pavimento! soalho! parquet! parque$ flutuante! vinil! linoleo! alcatifa! rodape! rodapé! afagamento!`,
    zidar: `pedreiro!! alvenaria! parede! paredes! muro! tijolo! tijolos! betao! betão! concreto! cimento! reboco! estuque! fachada! fachadas! fundacoes! fundações! fissura!
      fissuras! rachadura! demolicao! demolição! pladur! obra! obras! remodelacao! remodelação!`,
    mizarstvo: `carpinteiro!! marceneiro!! carpintaria! madeira! porta_nao_fecha porta_não_fecha dobradica! dobradiça! roupeiro_por_medida por_medida! bancada! pergola! pérgola!
      escada! escadas! corrimao! corrimão!`,
    okna: `janela! janelas! vidro! vidros! vidraceiro!! vidro_duplo estore! estores! persiana! persianas! toldo! rede_mosquiteira porta_de_entrada fechadura! serralheiro!!
      macaneta! maçaneta! puxador! portao_de_garagem portão_de_garagem caixilharia!`,
    montaza: `montagem! montar! ikea! movel! móvel! moveis! móveis! roupeiro! armario! armário! cama$ comoda! cómoda! estante! prateleira! prateleiras! secretaria! secretária!
      mesa! pendurar! espelho! varao! quadro! quadros! televisao_na_parede`,
    ogrevanje: `aquecimento! aquecedor! radiador! radiadores! caldeira! bomba_de_calor ar_condicionado climatizacao! climatização! termostato! piso_radiante lareira! salamandra!
      recuperador! nao_aquece não_aquece`,
    aparati: `eletrodomestico! eletrodoméstico! eletrodomesticos! eletrodomésticos! maquina_de_lavar máquina_de_lavar maquina_de_secar máquina_de_secar maquina_de_loica
      máquina_de_loiça lava-loicas frigorifico! frigorífico! geladeira! congelador! arca! forno! placa! fogao! fogão! micro-ondas exaustor! nao_arrefece não_arrefece`,
    streha: `telhado! telhados! telhador!! cobertura! infiltracao_no_telhado infiltração_no_telhado caleira! caleiras! algeroz! telha! telhas! claraboia! impermeabilizacao!
      impermeabilização!`,
    vrt: `jardim! jardineiro!! jardinagem! relva! grama! cortar_a_relva corta-relva sebe! sebes! poda! podar! arvore! árvore! arvores! árvores! abate! ervas_daninhas plantas!
      folhas! rega! calcada! calçada!`,
    ciscenje: `limpeza! limpezas! limpar! empregada_de_limpeza empregada! limpeza_de_vidros limpar_janelas limpeza_de_sofa limpeza_de_tapetes pos_obra pós_obra limpeza_profunda`,
    selitve: `mudanca! mudança! mudancas! mudanças! transporte! entrega! esvaziar! recolha! monos! moveis_velhos carregar! carrinha!`,
    drugo: `faz-tudo faz_tudo pequenas_reparacoes pequenas_reparações reparacoes! reparações! soldadura! soldar! soldador!! alarme! camara! câmara! camaras! câmaras!
      videovigilancia! videovigilância! domotica! domótica!`
  },
  nl: {
    vodovod: `loodgieter!! lek! lekt! lekkage! druppelt! kraan! kranen! mengkraan! gootsteen! wastafel! afvoer! verstopt! verstopping! toilet! wc$! spoelbak! stortbak! douche!
      bad$ badkuip! leiding! leidingen! buis! buizen! boiler! geiser! warm_water geen_warm_water geen_water waterdruk! sifon! afsluiter! riool! riolering! wateroverlast!`,
    elektrika: `elektricien!! elektra! elektrisch! elektriciteit! stopcontact! stopcontacten! stekker! schakelaar! schakelaars! licht! lamp! lampen! verlichting! peertje!
      zekering! zekeringen! aardlekschakelaar! groepenkast! meterkast! kabel! kabels! bedrading! stroomuitval! geen_stroom deurbel! intercom! plafondlamp! laadpaal!
      zonnepanelen! omvormer!`,
    keramika: `tegelzetter!! tegel! tegels! voegen! voeg! voegwerk! keramiek! mozaiek! mozaïek! badkamerrenovatie! nieuwe_badkamer`,
    pleskanje: `schilder!! schilderen! schilderwerk! verven! verf! behang! behangen! behanger!! lak$! lakken! beits! schimmel! vlekken_op_plafond stucen! stukadoor!!`,
    tla: `vloer! vloeren! vloerenlegger!! laminaat! parket! pvc_vloer vinyl! linoleum! tapijt! vloerbedekking! plint! plinten! schuren!`,
    zidar: `metselaar!! metselen! metselwerk! muur! muren! baksteen! bakstenen! beton! cement! pleister! pleisterwerk! gevel! gevels! fundering! dekvloer! scheur! scheuren!
      sloop! slopen! muur_doorbreken uitbouw! aanbouw! gipsplaat! voegwerk_gevel`,
    mizarstvo: `timmerman!! meubelmaker!! timmerwerk! hout! houten! deur_klemt klemt! scharnier! scharnieren! inbouwkast! op_maat maatwerk! werkblad! vlonder! pergola! trap! trappen!
      leuning!`,
    okna: `raam! ramen! kozijn! kozijnen! glas! glaszetter!! dubbel_glas rolluik! rolluiken! jaloezie! jaloezieen! zonnescherm! screens! hor$ horren! voordeur! schuifpui!
      slot$ sloten! slotenmaker!! deurklink! garagedeur!`,
    montaza: `montage! monteren! in_elkaar_zetten ikea! meubel! meubels! kast! kasten! bed$ ladekast! boekenkast! plank! planken! bureau! tafel! ophangen! spiegel! gordijnrail!
      schilderij! tv_ophangen`,
    ogrevanje: `verwarming! cv$! cv-ketel cv_ketel ketel! radiator! radiatoren! warmtepomp! airco! airconditioning! thermostaat! vloerverwarming! open_haard kachel! houtkachel!
      schoorsteen! verwarmt_niet ontluchten! gaslucht!`,
    aparati: `wasmachine! droger! wasdroger! vaatwasser! vaatwasmachine! koelkast! vriezer! diepvries! oven! kookplaat! inductie! magnetron! afzuigkap! witgoed! centrifugeert_niet
      koelt_niet pompt_niet`,
    streha: `dak! daken! dakdekker!! daklekkage! dak_lekt goot! goten! dakgoot! regenpijp! dakpan! dakpannen! dakraam! plat_dak dakkapel! lood_dak`,
    vrt: `tuin! tuinman!! hovenier!! tuinieren! gazon! gras! maaien! grasmaaien! heg! heggen! haag! snoeien! boom! bomen! kappen! onkruid! planten! bladeren! beregening!
      bestrating! straatwerk! oprit!`,
    ciscenje: `schoonmaak! schoonmaken! schoonmaker!! schoonmaakster!! glazenwasser!! ramen_wassen dieptereiniging! bank_reinigen tapijtreiniging! opleveringsschoonmaak!
      na_verbouwing hogedrukreiniger!`,
    selitve: `verhuizing! verhuizen! verhuizer!! verhuisbedrijf!! transport! vervoer! bezorgen! ontruiming! ontruimen! afvoeren! grofvuil! tillen! busje!`,
    drugo: `klusjesman!! klussen! klusjes! kleine_reparaties reparaties! lassen! lasser!! alarm! camera! cameras! camerabewaking! beveiliging! domotica!`
  },
  pl: {
    vodovod: `hydraulik!! hydrauliczne! wyciek! cieknie! kapie! przecieka! kran! krany! bateria! zlew! zlewozmywak! umywalka! odplyw! odpływ! zatkany! zatkana! zatkane!
      toaleta! wc$! sedes! spluczka! spłuczka! prysznic! wanna! rura! rury! bojler! podgrzewacz! ciepla_woda ciepła_woda brak_wody zalanie! zalane! syfon! zawor! zawór!
      kanalizacja! bidet!`,
    elektrika: `elektryk!! elektryczne! elektryczny! prad! prąd! brak_pradu brak_prądu gniazdko! gniazdka! wtyczka! wlacznik! włącznik! wylacznik! światło! swiatlo! lampa! zarowka!
      żarówka! bezpiecznik! bezpieczniki! korki! rozdzielnia! kabel! kable! okablowanie! instalacja_elektryczna dzwonek! domofon! zyrandol! żyrandol! oswietlenie! oświetlenie!
      led$ fotowoltaika! falownik!`,
    keramika: `glazurnik!! płytki! plytki! płytka! plytka! kafelki! fugi! fugowanie! glazura! terakota! mozaika! remont_lazienki remont_łazienki`,
    pleskanje: `malarz!! malowanie! pomalowac! pomalować! farba! tapeta! tapety! tapetowanie! lakierowanie! lakier! grunt! plesn! pleśń! zaciek! zacieki! gladz! gładź!`,
    tla: `podloga! podłoga! podlogi! podłogi! parkiet! panele! panele_podlogowe panele_podłogowe deski! winyl! wykladzina! wykładzina! listwy! cyklinowanie!`,
    zidar: `murarz!! murowanie! mur$ sciana! ściana! sciany! ściany! cegla! cegła! cegly! cegły! beton! cement! tynk! tynkowanie! elewacja! fundament! fundamenty! wylewka! pekniecie!
      pęknięcie! rysy! wyburzenie! wyburzyc! wyburzyć! karton-gips regips! rozbudowa! budowlaniec!!`,
    mizarstvo: `stolarz!! stolarka! drewno! drewniane! drewniany! drzwi_ocieraja drzwi_nie_zamykaja zawias! zawiasy! szafa_na_wymiar na_wymiar! blat! taras_drewniany pergola! schody!
      porecz! poręcz!`,
    okna: `okno! okna! szyba! szyby! szklarz!! roleta! rolety! zaluzje! żaluzje! markiza! moskitiera! drzwi_wejsciowe drzwi_wejściowe drzwi_balkonowe zamek! zamki! slusarz!!
      ślusarz!! klamka! brama_garazowa brama_garażowa parapet!`,
    montaza: `montaz! montaż! skrecanie! skręcanie! skrecic! skręcić! zlozyc! złożyć! ikea! meble! mebel! szafa! lozko! łóżko! komoda! regal! regał! polka! półka! polki! półki! biurko!
      stol! stół! powiesic! powiesić! lustro! karnisz! obraz! telewizor_na_scianie`,
    ogrevanje: `ogrzewanie! grzejnik! grzejniki! kaloryfer! kaloryfery! piec! kociol! kocioł! pompa_ciepla pompa_ciepła klimatyzacja! klimatyzator! klima$! termostat! ogrzewanie_podlogowe
      kominek! komin! nie_grzeje odpowietrzyc`,
    aparati: `agd$ pralka! suszarka! zmywarka! lodowka! lodówka! zamrazarka! zamrażarka! piekarnik! plyta_indukcyjna płyta_indukcyjna kuchenka! mikrofalowka! mikrofalówka! okap!
      nie_wiruje nie_chlodzi nie_chłodzi`,
    streha: `dach! dachy! dekarz!! cieknie_dach przeciekajacy_dach rynna! rynny! rynien! dachowka! dachówka! dachowki! dachówki! papa! okno_dachowe blacharz!! pokrycie_dachu`,
    vrt: `ogrod! ogród! ogrodnik!! ogrodnictwo! trawnik! trawa! koszenie! kosic! kosić! zywoplot! żywopłot! przycinanie! drzewo! drzewa! wycinka! chwasty! sadzenie! rosliny!
      rośliny! liscie! liście! nawadnianie! kostka_brukowa podjazd!`,
    ciscenje: `sprzatanie! sprzątanie! sprzatac! sprzątać! sprzataczka!! sprzątaczka!! mycie_okien myc_okna pranie_tapicerki pranie_dywanow pranie_dywanów po_remoncie
      gruntowne_sprzatanie gruntowne_sprzątanie`,
    selitve: `przeprowadzka! przeprowadzki! przeprowadzic! przeprowadzić! transport! przewoz! przewóz! dostawa! oproznienie! opróżnienie! wywoz! wywóz! gabaryty! stare_meble
      noszenie! bus$`,
    drugo: `zlota_raczka! złota_rączka! drobne_naprawy naprawy! spawanie! spawac! spawać! spawacz!! alarm! kamera! kamery! monitoring! inteligentny_dom`
  },
  hr: {
    vodovod: `vodoinstalater!! vodoinstalacij! curi! curenje! kapa$ kaplje! slavina! slavine! pipa! pipe$ miješalica! mjesalica! sudoper! umivaonik! odvod! zacepljen! začepljen!
      začepio! zacepio! wc$! školjka! skoljka! vodokotlić! vodokotlic! tuš! tus! tuš_kabina kada! cijev! cijevi! bojler! topla_voda nema_tople nema_vode poplava! poplavilo!
      sifon! ventil! kanalizacija! bide!`,
    elektrika: `električar!! elektricar!! struja! struje! nema_struje utičnica! uticnica! utičnice! uticnice! utikač! prekidač! prekidac! svjetlo! svjetla! lampa! žarulja! zarulja!
      osigurač! osigurac! osigurači! fid! razvodna_ploča razvodna_ploca kabel! kablovi! instalacija! instalacije! zvono! interfon! luster! rasvjeta! led$ solarni_paneli`,
    keramika: `keramičar!! keramicar!! pločice! plocice! pločica! plocica! fuge! fugiranje! keramika! mozaik! obnova_kupaonice nova_kupaonica`,
    pleskanje: `soboslikar!! ličilac!! licilac!! bojanje! bojati! ličenje! licenje! pobojati! farbanje! farba! boja! tapete! lakiranje! plijesan! mrlje_na_stropu gletanje!`,
    tla: `pod$ podovi! podopolagač!! parket! laminat! vinil! linoleum! tepih! itison! lajsne! brušenje_parketa brusenje_parketa`,
    zidar: `zidar!! zidanje! zid$ zidovi! cigla! cigle! beton! cement! žbuka! zbuka! žbukanje! fasada! fasade! temelj! temelji! estrih! pukotina! pukotine! rušenje! rusenje!
      knauf! gips! dogradnja! građevinar!! gradjevinar!!`,
    mizarstvo: `stolar!! stolarija! drvo! drveni! drvena! vrata_zapinju vrata_se_ne_zatvaraju šarke! sarke! ormar_po_mjeri po_mjeri! radna_ploča radna_ploca pergola! stepenice!
      ograda_stepenica rukohvat!`,
    okna: `prozor! prozori! staklo! stakla! staklar!! roleta! rolete! žaluzine! zaluzine! tenda! komarnik! ulazna_vrata balkonska_vrata brava! bravar!! kvaka! garažna_vrata
      garazna_vrata pvc_stolarija`,
    montaza: `montaža! montaza! sastavljanje! sastaviti! ikea! namještaj! namjestaj! ormar! krevet! komoda! polica! police! stol$ radni_stol objesiti! ogledalo! garnišna! garnisna!
      slika! slike! televizor_na_zid`,
    ogrevanje: `grijanje! radijator! radijatori! kotao! bojler_plin dizalica_topline toplinska_pumpa klima! klime! klimatizacija! termostat! podno_grijanje kamin! peć! pec$ dimnjak!
      ne_grije`,
    aparati: `kućanski_aparati kucanski_aparati perilica! perilica_rublja sušilica! susilica! perilica_posuđa perilica_posuda hladnjak! frižider! frizider! zamrzivač! zamrzivac!
      pećnica! pecnica! štednjak! stednjak! ploča_za_kuhanje mikrovalna! napa! ne_centrifugira ne_hladi`,
    streha: `krov! krovovi! krovopokrivač!! krovopokrivac!! prokišnjava! prokisnjava! oluk! oluci! oluka! crijep! crijepovi! lim$ limar!! krovni_prozor`,
    vrt: `vrt! vrtlar!! vrtlarstvo! travnjak! trava! košnja! kosnja! kositi! živica! zivica! orezivanje! drvo_rezanje stablo! stabla! rušenje_stabla korov! sadnja! biljke!
      lišće! lisce! navodnjavanje! popločavanje! poplocavanje! okućnica! okucnica!`,
    ciscenje: `čišćenje! ciscenje! očistiti! ocistiti! čistačica!! cistacica!! pranje_prozora prati_prozore dubinsko! pranje_sjedeće pranje_tepiha nakon_radova generalno_čišćenje`,
    selitve: `selidba! selidbe! seljenje! preseljenje! prijevoz! prijevoz_namještaja dostava! odvoz! glomazni! stari_namještaj nositi! kombi!`,
    drugo: `majstor_za_sve sitni_popravci popravci! zavarivanje! zavariti! varioc!! alarm! kamera! kamere! videonadzor! pametna_kuća`
  }
};
