// Historia adaptada a una sola ruta gratuita; distancias de juego, no navegación GPS.
module.exports = {
  "distanciaKm": 1400,
  "capitulos": [
    {
      "numero": 1,
      "id": "fuego_y_agua",
      "nombre": "Fuego y agua",
      "hastaKm": 199
    },
    {
      "numero": 2,
      "id": "hielo",
      "nombre": "Hielo",
      "hastaKm": 456
    },
    {
      "numero": 3,
      "id": "fiordos",
      "nombre": "Fiordos y monstruos",
      "hastaKm": 633
    },
    {
      "numero": 4,
      "id": "volcanes_auroras",
      "nombre": "Volcanes y auroras",
      "hastaKm": 911
    },
    {
      "numero": 5,
      "id": "sagas",
      "nombre": "Sagas y regreso",
      "hastaKm": 1400
    }
  ],
  "checkpoints": [
    {
      "id": "reykjavik",
      "nombre": "Reykjavík",
      "kmFisico": 0,
      "emoji": "🏙️",
      "capitulo": 1,
      "lat": 64.1466,
      "lon": -21.9426,
      "pista": "Una capital donde la cerveza estuvo prohibida hasta 1989. Sí, 1989.",
      "desc": "Arrancás en la capital de país soberano más al norte del mundo. La Hallgrímskirkja, de 74,5 m, tardó 41 años en construirse (1945–1986) y su forma imita las columnas de basalto de la isla. Tenés 1.400 km por delante: una vuelta a Islandia, de cascadas y playas negras a glaciares y fiordos, hasta regresar a Reykjavík.",
      "datoRaro": "🍺 En 1915 Islandia prohibió todo el alcohol. El vino volvió en 1921 porque España condicionó la compra de pescado islandés; los destilados, en 1935. La cerveza fuerte recién se legalizó el 1 de marzo de 1989: desde entonces, cada 1 de marzo se festeja el Bjórdagurinn, el Día de la Cerveza."
    },
    {
      "id": "hveragerdi",
      "nombre": "Hveragerði",
      "kmFisico": 48,
      "emoji": "♨️",
      "capitulo": 1,
      "lat": 64.0005,
      "lon": -21.186,
      "pista": "Un pueblo donde la tierra echa humo en el patio de las casas.",
      "desc": "Hveragerði está sentado sobre una zona geotérmica: hay fumarolas entre las casas y ollas de barro a 100 °C. Los invernaderos se calientan desde el subsuelo y producen tomates, pepinos… y hasta bananas, a un paso del Ártico. Subiendo al valle de Reykjadalur (\"valle del humo\") hay un río a 37–40 °C donde la gente se baña en plena montaña.",
      "datoRaro": "🍔 McDonald's se fue de Islandia en 2009. Uno de los últimos clientes guardó su hamburguesa con papas: pasó por el Museo Nacional y hoy está en vitrina en un hostel del sur del país. Más de quince años después… sigue casi igual."
    },
    {
      "id": "seljalandsfoss",
      "nombre": "Seljalandsfoss",
      "kmFisico": 137,
      "emoji": "💦",
      "capitulo": 1,
      "lat": 63.6156,
      "lon": -19.9886,
      "pista": "Una cascada que se recorre por dentro.",
      "desc": "Sesenta metros de caída que bajan del glaciar del Eyjafjallajökull. Un sendero pasa por detrás de la cortina de agua, dentro de una pequeña cueva: es imposible salir seco.",
      "datoRaro": "🌋 El Eyjafjallajökull, el volcán que la alimenta, entró en erupción en 2010 y su ceniza frenó buena parte del tráfico aéreo de Europa durante días."
    },
    {
      "id": "skogafoss",
      "nombre": "Skógafoss",
      "kmFisico": 167,
      "emoji": "🌈",
      "capitulo": 1,
      "lat": 63.5321,
      "lon": -19.5114,
      "pista": "Detrás de esta cascada hay un cofre vikingo. Alguien casi lo saca.",
      "desc": "Skógafoss cae 60 metros con 25 de ancho, y con sol casi siempre tiene arcoíris, a veces doble. Según la leyenda, Þrasi, uno de los primeros colonos vikingos, escondió un cofre con su tesoro en una cueva detrás del agua.",
      "datoRaro": "💍 Dicen que unos vecinos llegaron a enganchar el cofre, pero solo se quedaron con la argolla del costado antes de que se les escapara. La argolla habría ido a parar a la iglesia y hoy se muestra en el museo de Skógar."
    },
    {
      "id": "avion_solheimasandur",
      "nombre": "Avión de Sólheimasandur",
      "kmFisico": 178,
      "emoji": "✈️",
      "capitulo": 1,
      "lat": 63.48,
      "lon": -19.36,
      "pista": "En medio de una playa negra hay algo que no debería estar ahí.",
      "desc": "El 21 de noviembre de 1973, un Douglas C-117D (pariente del DC-3) de la Marina de EE.UU. se quedó sin motores por el hielo y aterrizó de emergencia en esta playa de arena negra. Los siete tripulantes sobrevivieron. El fuselaje sigue ahí, pelado, en medio de la nada.",
      "datoRaro": "🚶 No se llega en auto: son 2 a 3 horas de caminata ida y vuelta por la arena. Kilómetros como los tuyos."
    },
    {
      "id": "reynisfjara",
      "nombre": "Reynisfjara",
      "kmFisico": 199,
      "emoji": "🖤",
      "capitulo": 1,
      "lat": 63.419,
      "lon": -19.04,
      "pista": "Dos trolls quisieron robar un barco. El amanecer tenía otros planes.",
      "desc": "La playa de arena negra más famosa del mundo: columnas de basalto como órganos gigantes y, en el mar, las agujas de Reynisdrangar. La leyenda dice que son dos trolls que arrastraban un barco de tres mástiles a la costa y quedaron de piedra al salir el sol. Cerraste el capítulo 1.",
      "datoRaro": "🌊 Nunca le des la espalda al mar: las \"olas traicioneras\" de Reynisfjara llegan sin aviso mucho más lejos que las demás. Entre 2007 y 2025 causaron al menos 6 muertes; hoy hay un semáforo de alerta en la playa."
    },
    {
      "id": "eldhraun",
      "nombre": "Eldhraun",
      "kmFisico": 262,
      "emoji": "🌋",
      "capitulo": 2,
      "lat": 63.72,
      "lon": -18.24,
      "pista": "Un mar de lava cubierto de musgo. Su erupción oscureció el cielo de Europa.",
      "desc": "Eldhraun es la lava de la erupción del Laki (1783–1784), hoy tapada por un musgo verde y esponjoso. Fue una catástrofe: la hambruna que siguió mató a cerca del 20% de la población de Islandia y al 80% de las ovejas, y la niebla tóxica llegó hasta Gran Bretaña.",
      "datoRaro": "⛪ El 20 de julio de 1783, en Kirkjubæjarklaustur, el pastor Jón Steingrímsson dio la \"Misa de Fuego\" mientras la lava avanzaba hacia su iglesia. La lava se detuvo antes de llegar."
    },
    {
      "id": "skaftafell",
      "nombre": "Skaftafell",
      "kmFisico": 347,
      "emoji": "🧊",
      "capitulo": 2,
      "lat": 64.016,
      "lon": -16.966,
      "pista": "El techo de Islandia vive acá, abrazado por un glaciar.",
      "desc": "Puerta del Vatnajökull, el segundo casquete de hielo más grande de Europa: 7.700 km² y hasta 950 m de espesor, con volcanes activos debajo. Sobre él asoma el Hvannadalshnúkur (2.110 m), el pico más alto del país. Muy cerca cae Svartifoss, entre columnas de basalto negro.",
      "datoRaro": "🎬 Estos hielos hicieron de otro planeta en Interstellar y aparecen en Game of Thrones. Las columnas de Svartifoss inspiraron la iglesia Hallgrímskirkja que dejaste en Reykjavík."
    },
    {
      "id": "jokulsarlon",
      "nombre": "Jökulsárlón",
      "kmFisico": 394,
      "emoji": "💎",
      "capitulo": 2,
      "lat": 64.0485,
      "lon": -16.1794,
      "pista": "Un lago lleno de icebergs. James Bond pasó dos veces por acá.",
      "desc": "Jökulsárlón es la laguna donde el glaciar se parte en icebergs azules que flotan lentamente hacia el mar. Con 284 m de profundidad se la considera el lago más profundo de Islandia. Los bloques que vara la marea brillan sobre la arena negra: la famosa Diamond Beach.",
      "datoRaro": "🕶️ Acá se filmaron dos películas de James Bond (A View to a Kill y Die Another Day), además de Batman Begins y Tomb Raider. En invierno, las focas toman sol arriba de los icebergs."
    },
    {
      "id": "hofn",
      "nombre": "Höfn",
      "kmFisico": 456,
      "emoji": "🦞",
      "capitulo": 2,
      "lat": 64.2539,
      "lon": -15.2082,
      "pista": "Un puerto que vive de un bicho naranja con pinzas.",
      "desc": "Höfn significa \"puerto\" y es la capital islandesa de la langosta (humar): cada verano le dedica un festival. Desde el muelle se ve el Vatnajökull entero sobre el horizonte. Cerraste el capítulo del hielo.",
      "datoRaro": "🧭 Ya hiciste más de dos tercios de la Zona Sur. Desde acá, la ruta deja el hielo y se mete en los fiordos."
    },
    {
      "id": "vestrahorn",
      "nombre": "Vestrahorn",
      "kmFisico": 469,
      "emoji": "⚔️",
      "capitulo": 3,
      "lat": 64.26,
      "lon": -14.99,
      "pista": "Una aldea vikinga que nunca tuvo vikingos.",
      "desc": "Bajo la montaña Vestrahorn, en la península de Stokksnes, hay una aldea vikinga con casas de madera y techos de pasto. Es un set de filmación construido para una película que nunca se terminó: un pueblo vikingo sin vikingos.",
      "datoRaro": "🎥 La aldea abandonada se reutilizó en otras producciones y en 2022 le sumaron la réplica de un barco vikingo. Las dunas negras con pasto y el pico de fondo son de las fotos más buscadas de Islandia."
    },
    {
      "id": "djupivogur",
      "nombre": "Djúpivogur",
      "kmFisico": 535,
      "emoji": "🥚",
      "capitulo": 3,
      "lat": 64.6563,
      "lon": -14.283,
      "pista": "34 huevos gigantes mirando al mar.",
      "desc": "Djúpivogur es un pueblito de pescadores de los fiordos del este. Frente al muelle está Eggin í Gleðivík, del artista Sigurður Guðmundsson: 34 huevos de granito, cada uno réplica del huevo de un ave que anida en la zona.",
      "datoRaro": "🐢 Es el primer y único pueblo de Islandia en Cittaslow, la red internacional de \"pueblos lentos\". Acá nadie corre… salvo vos."
    },
    {
      "id": "stodvarfjordur",
      "nombre": "Piedras de Petra",
      "kmFisico": 568,
      "emoji": "🪨",
      "capitulo": 3,
      "lat": 64.833,
      "lon": -13.873,
      "pista": "Una mujer juntó piedras durante más de 80 años. Todavía están todas.",
      "desc": "En Stöðvarfjörður, Petra Sveinsdóttir empezó a juntar piedras de chica —primero para dibujar y decorar sus juegos— y no paró nunca, caminando por montañas adonde no iba nadie. Su casa y su jardín se llenaron de miles de minerales de los fiordos, y en 1974 los abrió al público.",
      "datoRaro": "💎 Petra murió en 2012, a los 89 años. La colección sigue en su casa: uno de los museos más raros (y lindos) del país."
    },
    {
      "id": "egilsstadir",
      "nombre": "Egilsstaðir",
      "kmFisico": 633,
      "emoji": "🐉",
      "capitulo": 3,
      "lat": 65.2654,
      "lon": -14.3948,
      "pista": "En este lago vive un gusano gigante. Lo aprobaron por votación.",
      "desc": "Llegaste a Egilsstaðir y cerraste el sur de la isla. La ruta continúa hacia los volcanes y paisajes del norte.",
      "datoRaro": "🗳️ En 2012 la TV islandesa mostró un video del \"gusano\" nadando. Un panel votó 7 a 6 que era auténtico y premió al autor. En 2014, una comisión dijo no ver motivos para dudar de que existe."
    },
    {
      "id": "modrudalur",
      "nombre": "Möðrudalur",
      "kmFisico": 716,
      "emoji": "🌌",
      "capitulo": 4,
      "lat": 65.373,
      "lon": -15.886,
      "pista": "El lugar habitado más alto de Islandia. De noche, el cielo se prende fuego verde.",
      "desc": "Möðrudalur está a 469 m de altura, en pleno desierto de lava de las Tierras Altas: la Ring Road pasaba por acá hasta que la movieron unos kilómetros al norte, así que hoy es un desvío corto. Sin luces alrededor, es de los mejores lugares para ver auroras boreales: de septiembre a abril, en noches oscuras y despejadas, el cielo se llena de cortinas verdes que se mueven.",
      "datoRaro": "🥶 Acá se midió la temperatura más baja de la historia de Islandia: −38 °C, el 21 de enero de 1918."
    },
    {
      "id": "dettifoss",
      "nombre": "Dettifoss",
      "kmFisico": 782,
      "emoji": "💥",
      "capitulo": 4,
      "lat": 65.8147,
      "lon": -16.3846,
      "pista": "La cascada que abre una película sobre el origen de la vida.",
      "desc": "Dettifoss: 44 m de caída, 100 m de ancho y unos 193 m³ de agua glaciar por segundo. Es una de las cascadas más poderosas de Europa; el estruendo se siente en el pecho antes de verla. Es un desvío de la Ring Road, y vale cada metro.",
      "datoRaro": "🎬 Es la cascada de la escena inicial de Prometheus (2012), la película de Ridley Scott."
    },
    {
      "id": "hverir",
      "nombre": "Hverir",
      "kmFisico": 832,
      "emoji": "💨",
      "capitulo": 4,
      "lat": 65.6411,
      "lon": -16.8086,
      "pista": "La tierra ronca, burbujea y huele a huevo podrido.",
      "desc": "Hverir, al pie del Námafjall: fumarolas que soplan vapor como chimeneas, ollas de barro hirviendo y un suelo naranja y amarillo de azufre. Debajo, el magma calienta todo.",
      "datoRaro": "🚀 En 1965 y 1967, astronautas del programa Apolo entrenaron geología en estos paisajes volcánicos del norte, alrededor de Mývatn y Askja. Varios de los que después caminaron sobre la Luna practicaron acá. Y el nombre Námaskarð significa \"paso de las minas\": durante siglos se sacó azufre de esta zona para exportarlo y fabricar pólvora."
    },
    {
      "id": "dimmuborgir",
      "nombre": "Dimmuborgir",
      "kmFisico": 844,
      "emoji": "🎄",
      "capitulo": 4,
      "lat": 65.5911,
      "lon": -16.9122,
      "pista": "Unos castillos negros donde vive una familia que se come a los chicos que se portan mal.",
      "desc": "Dimmuborgir (\"castillos oscuros\") es un laberinto de torres de lava junto al lago Mývatn, el \"lago de los mosquitos\". Según el folklore, ahí viven Grýla, una ogra que cocina a los niños desobedientes, sus trece hijos, los Muchachos de Navidad, y el Gato de Navidad.",
      "datoRaro": "🐈‍⬛ El Gato de Navidad se come a quien no estrena ropa antes de Nochebuena. Por las dudas, estrená medias antes de seguir."
    },
    {
      "id": "godafoss",
      "nombre": "Goðafoss",
      "kmFisico": 881,
      "emoji": "⚖️",
      "capitulo": 4,
      "lat": 65.6828,
      "lon": -17.5502,
      "pista": "La \"cascada de los dioses\". Su leyenda más famosa es… inventada.",
      "desc": "Goðafoss tiene 12 m de alto y 30 de ancho. Alrededor del año 1000, el legislador Þorgeir Ljósvetningagoði resolvió en el Alþingi que Islandia adoptara el cristianismo. La historia popular dice que, al volver, tiró las estatuas de los dioses nórdicos a esta cascada.",
      "datoRaro": "🕵️ La escena de los ídolos al agua es un invento del siglo XIX: no figura en ninguna fuente antigua. El nombre puede significar \"cascada de los dioses\"… o \"del jefe\"."
    },
    {
      "id": "akureyri",
      "nombre": "Akureyri",
      "kmFisico": 911,
      "emoji": "❤️",
      "capitulo": 4,
      "lat": 65.6835,
      "lon": -18.0878,
      "pista": "Una ciudad donde los semáforos te piden que pares… con amor.",
      "desc": "Akureyri es la capital del norte, al fondo del fiordo más largo de Islandia. Cerraste el capítulo de volcanes y auroras: ya hiciste más de un tercio de la Zona Norte.",
      "datoRaro": "❤️ Las luces rojas de los semáforos de Akureyri son corazones. Se instalaron meses antes de la crisis financiera de 2008 y, después del golpe, se quedaron como recordatorio de lo que de verdad importa."
    },
    {
      "id": "glaumbaer",
      "nombre": "Glaumbær",
      "kmFisico": 1005,
      "emoji": "🐴",
      "capitulo": 5,
      "lat": 65.611,
      "lon": -19.505,
      "pista": "En esta granja de pasto vivió el primer europeo nacido en América. 500 años antes de Colón.",
      "desc": "Glaumbær es una granja de casas de turba —paredes de tierra y techos de pasto—, hoy museo, en Skagafjörður, tierra de caballos. Según la Saga de los groenlandeses, acá vivió Snorri Þorfinnsson, nacido en Vinland, en América del Norte, alrededor del año 1000.",
      "datoRaro": "🐎 El caballo islandés tiene cinco andares, entre ellos el tölt. Desde el año 982 está prohibido importar caballos a Islandia, y un caballo islandés que sale del país nunca puede volver."
    },
    {
      "id": "hvitserkur",
      "nombre": "Hvítserkur",
      "kmFisico": 1095,
      "emoji": "🧌",
      "capitulo": 5,
      "lat": 65.6067,
      "lon": -20.6371,
      "pista": "Un troll salió a romper un monasterio. Se le hizo de día.",
      "desc": "Hvítserkur es una roca de 15 m que sale del mar en la península de Vatnsnes; con sus dos agujeros en la base parece un dragón tomando agua. La leyenda dice que era un troll que fue a atacar el monasterio de Þingeyrar y el sol lo dejó de piedra.",
      "datoRaro": "🧱 A mediados del siglo XX, los granjeros le rellenaron la base con cemento para que no se derrumbe. Hasta los trolls necesitan mantenimiento."
    },
    {
      "id": "borgarnes",
      "nombre": "Borgarnes",
      "kmFisico": 1265,
      "emoji": "🪓",
      "capitulo": 5,
      "lat": 64.5383,
      "lon": -21.9206,
      "pista": "Un vikingo escribió su primer poema a los 3 años. A los 7… agarró un hacha.",
      "desc": "Borgarnes es la tierra de la Saga de Egil. Egil Skallagrímsson (c. 904–995), guerrero y uno de los grandes poetas nórdicos, vivió en Borg, acá al lado. Su poema Sonatorrek, por la muerte de su hijo, es considerado el nacimiento de la lírica personal nórdica.",
      "datoRaro": "🪓 Según la saga, a los 7 años unos chicos le hicieron trampa en un juego de pelota: fue a buscar un hacha y le partió la cabeza al tramposo. Los vikingos no tenían VAR."
    },
    {
      "id": "tunel_hvalfjordur",
      "nombre": "Túnel de Hvalfjörður",
      "kmFisico": 1288,
      "emoji": "🐋",
      "capitulo": 5,
      "lat": 64.37,
      "lon": -21.86,
      "pista": "El último tramo pasa por debajo del mar.",
      "desc": "El túnel de Hvalfjörður cruza por debajo del fiordo: 5.770 m de largo y baja hasta 165 m bajo el nivel del mar. Se inauguró en 1998 y evita el largo rodeo por la costa del fiordo.",
      "datoRaro": "🐋 Hvalfjörður significa \"fiordo de las ballenas\"."
    },
    {
      "id": "thingvellir",
      "nombre": "Þingvellir",
      "kmFisico": 1351,
      "emoji": "🌍",
      "capitulo": 5,
      "lat": 64.2559,
      "lon": -21.1295,
      "pista": "Caminás entre dos continentes, donde se reunía un parlamento vikingo.",
      "desc": "En Þingvellir se reunió el Alþingi desde el año 930: la asamblea vikinga que hacía leyes y resolvía disputas, y que sesionó acá hasta 1798. El valle es la grieta entre las placas de América del Norte y Eurasia. Es Patrimonio de la Humanidad desde 2004.",
      "datoRaro": "🤿 En la fisura de Silfra se bucea entre las dos placas tectónicas, en agua de deshielo cristalina. Último desvío antes de volver a casa."
    },
    {
      "id": "reykjavik_meta",
      "nombre": "Reykjavík · Meta",
      "kmFisico": 1400,
      "emoji": "🏁",
      "capitulo": 5,
      "lat": 64.147,
      "lon": -21.935,
      "pista": "Volvés al punto de partida. Pero ya no sos el mismo.",
      "desc": "¡Completaste la vuelta a Islandia! 1.400 km de cascadas, playas negras, glaciares, fiordos, volcanes y sagas.",
      "datoRaro": "☀️ En la costanera te espera Sólfar, el \"Viajero del Sol\" (1990), de Jón Gunnar Árnason. Parece un barco vikingo, pero su autor lo pensó como un barco de los sueños: una promesa de territorios nuevos. Buen lugar para la foto final."
    }
  ]
};
