'use strict';
// Quick coverage check for EU city → NUTS-2 mapping
const cities = require('../public/cities-full.json');
const regions = require('../public/eurostat-regions.json');

const QID_NUTS2 = {
  Q64:'DE30', Q1055:'DE60', Q1741:'AT13',
  Q216:'LT01',   // Vilnius
  Q19660:'RO32', // Bucharest
  Q1085:'CZ01',  // Prague
  Q1435:'HR05',  // Zagreb
  Q585:'NO08',   // Oslo
  Q472:'BG41',   // Sofia
  Q437:'SI04',   // Ljubljana
  Q2079:'DED5',  // Leipzig
  Q1731:'DED2',  // Dresden
  Q2211:'SE22',  // Malmö
};
const SINGLE_NUTS2 = { CY:'CY00', EE:'EE00', LU:'LU00', LV:'LV00', MT:'MT00', IS:'IS00' };

// Abbreviated mapping for test
const ADMIN_TO_NUTS2 = {
  DE: {'Stuttgart Government Region':'DE11','Karlsruhe Government Region':'DE12','Freiburg Government Region':'DE13','Tübingen Government Region':'DE14','Upper Bavaria':'DE21','Lower Bavaria':'DE22','Upper Palatinate':'DE23','Upper Franconia':'DE24','Middle Franconia':'DE25','Lower Franconia':'DE26','Swabia':'DE27','Munich':'DE21','Brandenburg':'DE40','Bremen':'DE50','Hamburg':'DE60','Darmstadt Government Region':'DE71','Kassel Government Region':'DE73','Mecklenburg-Vorpommern':'DE80','Braunschweig Government Region':'DE91','Hannover Region':'DE92','Düsseldorf Government Region':'DEA1','Cologne Government Region':'DEA2','Aachen cities region':'DEA2','Münster Government Region':'DEA3','Detmold Government Region':'DEA4','Arnsberg Government Region':'DEA5','Saxony-Anhalt':'DEE0','Schleswig-Holstein':'DEF0','Thuringia':'DEG0'},
  FR: {'Grand Paris':'FR10','Seine-Saint-Denis':'FR10','Val-de-Marne':'FR10','Hauts-de-Seine':'FR10','Indre-et-Loire':'FRB0','Loiret':'FRB0','Loir-et-Cher':'FRB0','Calvados':'FRD1','Seine-Maritime':'FRD2','Nord':'FRE1','Pas-de-Calais':'FRE1','Somme':'FRE2','Bas-Rhin':'FRF1','Haut-Rhin':'FRF1','Marne':'FRF2','Moselle':'FRF3','Meurthe-et-Moselle':'FRF3','Loire-Atlantique':'FRG0','Sarthe':'FRG0','Maine-et-Loire':'FRG0','Ille-et-Vilaine':'FRH0','Finistère':'FRH0','Gironde':'FRI1','Haute-Vienne':'FRI2','Vienne':'FRI3','Charente-Maritime':'FRI3','Hérault':'FRJ1','Pyrénées-Orientales':'FRJ1','Haute-Garonne':'FRJ2','Puy-de-Dôme':'FRK1','Isère':'FRK2','Haute-Savoie':'FRK2','Savoie':'FRK2','Loire':'FRK2','Metropolis of Lyon':'FRK2','Auvergne-Rhône-Alpes':'FRK2','Bouches-du-Rhône':'FRL0','Alpes-Maritimes':'FRL0','Var':'FRL0','Vaucluse':'FRL0','Corse-du-Sud':'FRM0','Martinique':'FRY2','French Guiana':'FRY3','Réunion':'FRY4'},
  IT: {'Metropolitan City of Turin':'ITC1','Province of Novara':'ITC1','Province of Alessandria':'ITC1','Province of Cuneo':'ITC1','Province of Asti':'ITC1','Metropolitan City of Genoa':'ITC3','Province of Savona':'ITC3','Province of Imperia':'ITC3','Lombardia':'ITC4','Metropolitan City of Milan':'ITC4','Province of Brescia':'ITC4','Province of Monza and Brianza':'ITC4','Province of Bergamo':'ITC4','Province of Como':'ITC4','Province of Varese':'ITC4','Province of Cremona':'ITC4','Province of Pescara':'ITF1','Province of L\'Aquila':'ITF1','Metropolitan City of Naples':'ITF3','Province of Salerno':'ITF3','Province of Caserta':'ITF3','Avellino':'ITF3','Metropolitan City of Bari':'ITF4','Province of Taranto':'ITF4','Province of Foggia':'ITF4','Province of Barletta-Andria-Trani':'ITF4','province of Lecce':'ITF4','Province of Brindisi':'ITF4','province of Potenza':'ITF5','Metropolitan City of Reggio Calabria':'ITF6','Province of Catanzaro':'ITF6','Province of Crotone':'ITF6','Metropolitan City of Palermo':'ITG1','Metropolitan City of Catania':'ITG1','Metropolitan City of Messina':'ITG1','Free Municipal Consortium of Syracuse':'ITG1','Free municipal consortium of Agrigento':'ITG1','Province of Sassari':'ITG2','South Tyrol':'ITH1','Metropolitan City of Venice':'ITH3','Province of Verona':'ITH3','Province of Padua':'ITH3','Province of Vicenza':'ITH3','Province of Treviso':'ITH3','Veneto':'ITH3','regional decentralization entity of Trieste':'ITH4','regional decentralization entity of Udine':'ITH4','Metropolitan City of Bologna':'ITH5','Province of Parma':'ITH5','Province of Modena':'ITH5','Province of Reggio Emilia':'ITH5','Province of Ravenna':'ITH5','Province of Rimini':'ITH5','Province of Ferrara':'ITH5','Province of Forlì-Cesena':'ITH5','Province of Piacenza':'ITH5','Metropolitan City of Florence':'ITI1','Province of Prato':'ITI1','Province of Livorno':'ITI1','Province of Lucca':'ITI1','Province of Pisa':'ITI1','Province of Massa-Carrara':'ITI1','Province of Siena':'ITI1','province of Perugia':'ITI2','province of Terni':'ITI2','Province of Ancona':'ITI3','Metropolitan City of Rome':'ITI4','Province of Latina':'ITI4'},
  ES: {'Galicia':'ES11','Xixón':'ES12','Uviéu':'ES12','Cantabria':'ES13','Santander':'ES13','País Vasco':'ES21','Greater Bilbao':'ES21','La Rioja':'ES23','Logroño':'ES23','Aragón':'ES24','Zaragoza':'ES24','Community of Madrid':'ES30','Madrid':'ES30','Alcalá de Henares':'ES30','Getafe':'ES30','Castile and León':'ES41','Valladolid':'ES41','Salamanca':'ES41','León':'ES41','Castile–La Mancha':'ES42','Guadalajara':'ES42','Ciudad Real':'ES42','Albacete':'ES42','Extremadura':'ES43','Province of Badajoz':'ES43','Badajoz':'ES43','Cáceres':'ES43','Mérida':'ES43','Cataluña':'ES51','Barcelonès':'ES51','Girona':'ES51','Tarragona':'ES51','Vallès Occidental':'ES51','Baix Llobregat':'ES51','Comunitat Valenciana':'ES52','Valencia':'ES52','Province of Alicante':'ES52','Castellón':'ES52','Horta Sud':'ES52','Elche':'ES52','Illes Balears':'ES53','Mallorca':'ES53','Andalucía':'ES61','Seville':'ES61','Seville Province':'ES61','Málaga':'ES61','Córdoba':'ES61','Almería':'ES61','Cádiz':'ES61','Jaén':'ES61','Región de Murcia':'ES62','Murcia':'ES62','Canary Islands':'ES70','Santa Cruz de Tenerife Province':'ES70','Santa Cruz de Tenerife':'ES70','Las Palmas':'ES70'},
  PL: {'Lesser Poland Voivodeship':'PL21','Silesian Voivodeship':'PL22','Greater Poland Voivodeship':'PL41','West Pomeranian Voivodeship':'PL42','Lubusz Voivodeship':'PL43','Lower Silesian Voivodeship':'PL51','Opole Voivodeship':'PL52','Kuyavian-Pomeranian Voivodeship':'PL61','Warmian-Masurian Voivodeship':'PL62','Pomeranian Voivodeship':'PL63','Łódź Voivodeship':'PL71','Świętokrzyskie Voivodeship':'PL72','Lublin Voivodeship':'PL81','Podkarpackie Voivodeship':'PL82','Podlaskie Voivodeship':'PL84','Masovian Voivodeship':'PL91'},
  AT: {'Burgenland':'AT11','Lower Austria':'AT12','Carinthia':'AT21','Styria':'AT22','Upper Austria':'AT31','Salzburg':'AT32','Tyrol':'AT33','Vorarlberg':'AT34','Dornbirn District':'AT34'},
  NL: {'Groningen':'NL11','Friesland':'NL12','Drenthe':'NL13','Overijssel':'NL21','Gelderland':'NL22','Flevoland':'NL23','Utrecht':'NL31','Noord-Holland':'NL32','Zuid-Holland':'NL33','Zeeland':'NL34','Noord-Brabant':'NL41','Limburg':'NL42','North Holland':'NL32','South Holland':'NL33','North Brabant':'NL41','Amsterdam':'NL32','Rotterdam':'NL33','Breda':'NL41'},
  SE: {'Stockholm':'SE11','Uppsala Municipality':'SE12','Gothenburg Municipality':'SE23','Malmö':'SE22'},
  FI: {'Uusimaa':'FI1B','Helsinki-Uusimaa':'FI1B','Pirkanmaa':'FI19','Southwest Finland':'FI19','North Ostrobothnia':'FI1D','North Savo':'FI1D'},
  BE: {'Arrondissement of Brussels-Capital':'BE10','Arrondissement of Antwerp':'BE21','Arrondissement of Ghent':'BE23','Arrondissement of Bruges':'BE25','Arrondissement of Liège':'BE33'},
  DK: {'Capital Region of Denmark':'DK01','Aarhus Municipality':'DK04','Odense Municipality':'DK03','Aalborg Municipality':'DK05','Frederiksberg Municipality':'DK01'},
  PT: {'Porto':'PT11','Braga':'PT11'},
  RO: {'Cluj County':'RO11','Brașov County':'RO12','Iași County':'RO21','Constanța County':'RO22','Timiș County':'RO42'},
  HU: {'Csongrád-Csanád County':'HU33','Miskolc District':'HU31','Pécs District':'HU23','Nyíregyháza District':'HU32','Kecskemét District':'HU33','Székesfehérvár District':'HU21'},
  SK: {'Bratislava Region':'SK01','Košice Region':'SK04','Prešov Region':'SK04','Žilina District':'SK03','Nitra District':'SK02'},
  DK: {'Capital Region of Denmark':'DK01','Aarhus Municipality':'DK04','Odense Municipality':'DK03','Aalborg Municipality':'DK05'},
  SE: {'Stockholm':'SE11','Stockholm County':'SE11','Uppsala Municipality':'SE12','Uppsala County':'SE12','Östergötland County':'SE12','Jönköping County':'SE21','Skåne County':'SE22','Halland County':'SE22','Gothenburg Municipality':'SE23','Västra Götaland County':'SE23','Örebro County':'SE12'},
  NO: {'Oslo Municipality':'NO08','Oslo':'NO08','Bergen':'NO0A','Trondheim':'NO06','Stavanger':'NO09','Rogaland':'NO09'},
  BG: {'Stolichna Municipality':'BG41','Plovdiv Province':'BG42','Varna Province':'BG33','Burgas Province':'BG34','Burgas':'BG34','Stara Zagora':'BG42','Ruse':'BG32','Pleven':'BG31','Sliven':'BG34'},
  LT: {'Vilnius City Municipality':'LT01','Kaunas City Municipality':'LT02','Klaipeda City Municipality':'LT02','Šiauliai City Municipality':'LT01','Panevėžys City Municipality':'LT01','Alytus City Municipality':'LT02'},
  SI: {'Ljubljana City Municipality':'SI04','Maribor City Municipality':'SI03'},
  HR: {'Split-Dalmatia County':'HR03','Primorje-Gorski Kotar County':'HR03','Zadar County':'HR03','Osijek-Baranja County':'HR04'},
  IE: {'Dublin City':'IE06','County Cork':'IE05','Galway City':'IE04','County Limerick':'IE05'},
  CZ: {'Czech Republic':'CZ01','Brno-City District':'CZ06','Ostrava-City District':'CZ08','Plzeň-City District':'CZ03','Liberec District':'CZ05','Olomouc District':'CZ07','Pardubice District':'CZ05','Ústí nad Labem District':'CZ04','Kladno District':'CZ02','Chomutov District':'CZ04','Děčín District':'CZ04'},
  RO: {'Cluj County':'RO11','Brașov County':'RO12','Iași County':'RO21','Constanța County':'RO22','Timiș County':'RO42','Romania':'RO32'},
};

const EU_ISOS = new Set(['AT','BE','BG','CY','CZ','DE','DK','EE','EL','ES','FI','FR','HR','HU','IE','IT','LT','LU','LV','MT','NL','PL','PT','RO','SE','SI','SK','NO','IS']);

let matched = 0, total = 0, byCountry = {};
const missed = [];

const SE_COUNTY_NUTS2 = {
  'Stockholm County':'SE11','Uppsala County':'SE12','Södermanland County':'SE12',
  'Östergötland County':'SE12','Örebro County':'SE12','Västmanland County':'SE12',
  'Jönköping County':'SE21','Kronoberg County':'SE21','Kalmar County':'SE21','Gotland County':'SE21',
  'Skåne County':'SE22','Halland County':'SE22','Blekinge County':'SE22',
  'Västra Götaland County':'SE23',
  'Värmland County':'SE31','Gävleborg County':'SE31','Dalarna County':'SE31',
  'Västernorrland County':'SE32','Jämtland County':'SE32',
  'Västerbotten County':'SE33','Norrbotten County':'SE33',
};

cities.forEach(c => {
  const iso = c.iso || (c.country === 'Netherlands' ? 'NL' : null);
  if (!iso || !EU_ISOS.has(iso)) return;
  total++;
  byCountry[iso] = byCountry[iso] || { m: 0, t: 0 };
  byCountry[iso].t++;

  let hit = false;
  if (QID_NUTS2[c.qid] && regions[QID_NUTS2[c.qid]]) hit = true;
  else if (SINGLE_NUTS2[iso] && regions[SINGLE_NUTS2[iso]]) hit = true;
  else if (iso === 'SE' && c.admin === 'Sweden' && SE_COUNTY_NUTS2[c.name] && regions[SE_COUNTY_NUTS2[c.name]]) hit = true;
  else {
    const map = ADMIN_TO_NUTS2[iso];
    if (map && map[c.admin] && regions[map[c.admin]]) hit = true;
  }

  if (hit) { matched++; byCountry[iso].m++; }
  else missed.push(`${iso} | ${c.name} | admin=${c.admin}`);
});

console.log(`\nTotal: ${matched}/${total} (${Math.round(matched/total*100)}%)\n`);
Object.entries(byCountry).sort((a,b)=>b[1].t-a[1].t).forEach(([iso, s]) => {
  const pct = Math.round(s.m/s.t*100);
  console.log(`  ${iso}: ${s.m}/${s.t} (${pct}%)`);
});
console.log('\nSample misses (first 20):');
missed.slice(0,20).forEach(x => console.log(' ', x));
