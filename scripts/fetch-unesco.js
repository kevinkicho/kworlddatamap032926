#!/usr/bin/env node
/**
 * scripts/fetch-unesco.js
 *
 * Builds public/unesco.json — UNESCO World Heritage Sites for map display.
 *
 * Fields per site:
 *   name       — Site name
 *   lat, lng   — Coordinates
 *   iso2       — Country ISO-2 code
 *   type       — "Cultural" | "Natural" | "Mixed"
 *   year       — Year inscribed
 *
 * Also enriches public/country-data.json with:
 *   unesco_cultural  — Number of cultural WH sites
 *   unesco_natural   — Number of natural WH sites
 *   unesco_mixed     — Number of mixed WH sites
 *   unesco_total     — Total WH sites
 *
 * Source: UNESCO World Heritage Centre (whc.unesco.org), 2024 list.
 * Curated table — ~200 notable sites covering 80+ countries.
 *
 * Usage: node scripts/fetch-unesco.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'public', 'unesco.json');
const CD_PATH  = path.join(__dirname, '..', 'public', 'country-data.json');

// UNESCO World Heritage Sites — curated selection of ~200 notable sites
// Source: whc.unesco.org (2024 list). Coordinates from WHC/Wikipedia.
// Type: C=Cultural, N=Natural, M=Mixed
const SITES = [
  // ── Italy (59 total, showing top selections) ────────────────────────
  { name: 'Historic Centre of Rome',              lat: 41.8902, lng: 12.4922, iso2: 'IT', type: 'C', year: 1980 },
  { name: 'Venice and its Lagoon',                 lat: 45.4343, lng: 12.3388, iso2: 'IT', type: 'C', year: 1987 },
  { name: 'Historic Centre of Florence',           lat: 43.7696, lng: 11.2558, iso2: 'IT', type: 'C', year: 1982 },
  { name: 'Piazza del Duomo, Pisa',                lat: 43.7230, lng: 10.3966, iso2: 'IT', type: 'C', year: 1987 },
  { name: 'Amalfi Coast',                          lat: 40.6340, lng: 14.6027, iso2: 'IT', type: 'C', year: 1997 },
  { name: 'Pompeii, Herculaneum, Torre Annunziata',lat: 40.7508, lng: 14.4869, iso2: 'IT', type: 'C', year: 1997 },
  { name: 'Historic Centre of Naples',             lat: 40.8518, lng: 14.2681, iso2: 'IT', type: 'C', year: 1995 },
  { name: 'Dolomites',                             lat: 46.4340, lng: 11.8487, iso2: 'IT', type: 'N', year: 2009 },
  { name: 'Val d\'Orcia',                          lat: 43.0600, lng: 11.5500, iso2: 'IT', type: 'C', year: 2004 },
  { name: 'Cinque Terre',                          lat: 44.1461, lng: 9.6561,  iso2: 'IT', type: 'C', year: 1997 },

  // ── China (57 total) ────────────────────────────────────────────────
  { name: 'Great Wall of China',                   lat: 40.4319, lng: 116.5704,iso2: 'CN', type: 'C', year: 1987 },
  { name: 'Forbidden City',                        lat: 39.9163, lng: 116.3972,iso2: 'CN', type: 'C', year: 1987 },
  { name: 'Terracotta Army (Mausoleum of Qin Shi Huang)', lat: 34.3848, lng: 109.2734, iso2: 'CN', type: 'C', year: 1987 },
  { name: 'Summer Palace, Beijing',                lat: 39.9999, lng: 116.2755,iso2: 'CN', type: 'C', year: 1998 },
  { name: 'Temple of Heaven, Beijing',             lat: 39.8822, lng: 116.4066,iso2: 'CN', type: 'C', year: 1998 },
  { name: 'Potala Palace, Lhasa',                  lat: 29.6577, lng: 91.1170, iso2: 'CN', type: 'C', year: 1994 },
  { name: 'Jiuzhaigou Valley',                     lat: 33.2600, lng: 103.9200,iso2: 'CN', type: 'N', year: 1992 },
  { name: 'Huanglong',                             lat: 32.7500, lng: 103.8167,iso2: 'CN', type: 'N', year: 1992 },
  { name: 'Mount Emei and Leshan Giant Buddha',    lat: 29.5441, lng: 103.7734,iso2: 'CN', type: 'M', year: 1996 },
  { name: 'South China Karst',                     lat: 25.0100, lng: 104.6800,iso2: 'CN', type: 'N', year: 2007 },

  // ── Germany (52 total) ──────────────────────────────────────────────
  { name: 'Cologne Cathedral',                     lat: 50.9413, lng: 6.9583,  iso2: 'DE', type: 'C', year: 1996 },
  { name: 'Museumsinsel (Museum Island), Berlin',  lat: 52.5169, lng: 13.4019, iso2: 'DE', type: 'C', year: 1999 },
  { name: 'Palaces of Potsdam and Berlin',         lat: 52.4042, lng: 13.0385, iso2: 'DE', type: 'C', year: 1990 },
  { name: 'Aachen Cathedral',                      lat: 50.7753, lng: 6.0839,  iso2: 'DE', type: 'C', year: 1978 },
  { name: 'Classical Weimar',                      lat: 50.9795, lng: 11.3235, iso2: 'DE', type: 'C', year: 1998 },
  { name: 'Wadden Sea',                            lat: 53.6000, lng: 8.0000,  iso2: 'DE', type: 'N', year: 2009 },

  // ── France (52 total) ──────────────────────────────────────────────
  { name: 'Mont-Saint-Michel and its Bay',         lat: 48.6361, lng: -1.5115, iso2: 'FR', type: 'C', year: 1979 },
  { name: 'Palace of Versailles',                  lat: 48.8049, lng: 2.1204,  iso2: 'FR', type: 'C', year: 1979 },
  { name: 'Chartres Cathedral',                    lat: 48.4477, lng: 1.4872,  iso2: 'FR', type: 'C', year: 1979 },
  { name: 'Banks of the Seine in Paris',           lat: 48.8584, lng: 2.2945,  iso2: 'FR', type: 'C', year: 1991 },
  { name: 'Palace of Fontainebleau',               lat: 48.4010, lng: 2.7003,  iso2: 'FR', type: 'C', year: 1981 },
  { name: 'Historic Centre of Avignon',            lat: 43.9493, lng: 4.8055,  iso2: 'FR', type: 'C', year: 1995 },
  { name: 'Pitons, Cirques and Remparts of Réunion', lat: -21.1151, lng: 55.5364, iso2: 'FR', type: 'N', year: 2010 },
  { name: 'Decorated Cave of Pont d\'Arc (Chauvet)',lat: 44.3883, lng: 4.4169, iso2: 'FR', type: 'C', year: 2014 },

  // ── Spain (50 total) ───────────────────────────────────────────────
  { name: 'Alhambra, Generalife and Albayzín',     lat: 37.1761, lng: -3.5881, iso2: 'ES', type: 'C', year: 1984 },
  { name: 'Works of Antoni Gaudí',                 lat: 41.4036, lng: 2.1744,  iso2: 'ES', type: 'C', year: 1984 },
  { name: 'Historic City of Toledo',               lat: 39.8628, lng: -4.0273, iso2: 'ES', type: 'C', year: 1986 },
  { name: 'Old Town of Segovia and its Aqueduct',  lat: 40.9481, lng: -4.1184, iso2: 'ES', type: 'C', year: 1985 },
  { name: 'Santiago de Compostela (Old Town)',      lat: 42.8805, lng: -8.5448, iso2: 'ES', type: 'C', year: 1985 },
  { name: 'Teide National Park',                   lat: 28.2724, lng: -16.6428,iso2: 'ES', type: 'N', year: 2007 },
  { name: 'Doñana National Park',                  lat: 36.9989, lng: -6.4357, iso2: 'ES', type: 'N', year: 1994 },

  // ── United Kingdom (33 total) ──────────────────────────────────────
  { name: 'Stonehenge and Avebury',                lat: 51.1789, lng: -1.8262, iso2: 'GB', type: 'C', year: 1986 },
  { name: 'Tower of London',                       lat: 51.5081, lng: -0.0759, iso2: 'GB', type: 'C', year: 1988 },
  { name: 'City of Bath',                          lat: 51.3811, lng: -2.3590, iso2: 'GB', type: 'C', year: 1987 },
  { name: 'Edinburgh Old and New Towns',           lat: 55.9503, lng: -3.1883, iso2: 'GB', type: 'C', year: 1995 },
  { name: 'Giant\'s Causeway',                     lat: 55.2408, lng: -6.5116, iso2: 'GB', type: 'N', year: 1986 },
  { name: 'Maritime Greenwich',                    lat: 51.4769, lng: -0.0005, iso2: 'GB', type: 'C', year: 1997 },

  // ── United States (25 total) ───────────────────────────────────────
  { name: 'Yellowstone National Park',             lat: 44.4280, lng: -110.5885,iso2: 'US', type: 'N', year: 1978 },
  { name: 'Grand Canyon National Park',            lat: 36.1069, lng: -112.1129,iso2: 'US', type: 'N', year: 1979 },
  { name: 'Statue of Liberty',                     lat: 40.6892, lng: -74.0445,iso2: 'US', type: 'C', year: 1984 },
  { name: 'Yosemite National Park',                lat: 37.8651, lng: -119.5383,iso2: 'US', type: 'N', year: 1984 },
  { name: 'Independence Hall',                     lat: 39.9489, lng: -75.1500,iso2: 'US', type: 'C', year: 1979 },
  { name: 'Everglades National Park',              lat: 25.2866, lng: -80.8987,iso2: 'US', type: 'N', year: 1979 },
  { name: 'Great Smoky Mountains National Park',   lat: 35.6118, lng: -83.4895,iso2: 'US', type: 'N', year: 1983 },
  { name: 'Hawaii Volcanoes National Park',        lat: 19.4194, lng: -155.2885,iso2: 'US', type: 'N', year: 1987 },

  // ── India (42 total) ───────────────────────────────────────────────
  { name: 'Taj Mahal',                             lat: 27.1751, lng: 78.0421, iso2: 'IN', type: 'C', year: 1983 },
  { name: 'Agra Fort',                             lat: 27.1795, lng: 78.0211, iso2: 'IN', type: 'C', year: 1983 },
  { name: 'Ajanta Caves',                          lat: 20.5519, lng: 75.7033, iso2: 'IN', type: 'C', year: 1983 },
  { name: 'Ellora Caves',                          lat: 20.0269, lng: 75.1798, iso2: 'IN', type: 'C', year: 1983 },
  { name: 'Khajuraho Group of Monuments',          lat: 24.8518, lng: 79.9199, iso2: 'IN', type: 'C', year: 1986 },
  { name: 'Kaziranga National Park',               lat: 26.5775, lng: 93.1711, iso2: 'IN', type: 'N', year: 1985 },
  { name: 'Sundarbans National Park',              lat: 21.9497, lng: 89.1833, iso2: 'IN', type: 'N', year: 1987 },
  { name: 'Fatehpur Sikri',                        lat: 27.0940, lng: 77.6610, iso2: 'IN', type: 'C', year: 1986 },

  // ── Japan (25 total) ───────────────────────────────────────────────
  { name: 'Historic Monuments of Ancient Kyoto',   lat: 35.0394, lng: 135.7292,iso2: 'JP', type: 'C', year: 1994 },
  { name: 'Historic Monuments of Ancient Nara',    lat: 34.6851, lng: 135.8048,iso2: 'JP', type: 'C', year: 1998 },
  { name: 'Hiroshima Peace Memorial (Genbaku Dome)',lat: 34.3955, lng: 132.4536,iso2: 'JP', type: 'C', year: 1996 },
  { name: 'Himeji-jo',                             lat: 34.8394, lng: 134.6939,iso2: 'JP', type: 'C', year: 1993 },
  { name: 'Fujisan',                               lat: 35.3606, lng: 138.7274,iso2: 'JP', type: 'C', year: 2013 },
  { name: 'Shiretoko',                             lat: 44.1300, lng: 145.1500,iso2: 'JP', type: 'N', year: 2005 },
  { name: 'Yakushima',                             lat: 30.3500, lng: 130.5000,iso2: 'JP', type: 'N', year: 1993 },

  // ── Russia (31 total) ──────────────────────────────────────────────
  { name: 'Moscow Kremlin and Red Square',         lat: 55.7520, lng: 37.6175, iso2: 'RU', type: 'C', year: 1990 },
  { name: 'Historic Centre of Saint Petersburg',   lat: 59.9343, lng: 30.3351, iso2: 'RU', type: 'C', year: 1990 },
  { name: 'Lake Baikal',                           lat: 53.5587, lng: 108.1650,iso2: 'RU', type: 'N', year: 1996 },
  { name: 'Volcanoes of Kamchatka',                lat: 54.0500, lng: 159.4500,iso2: 'RU', type: 'N', year: 1996 },
  { name: 'Kizhi Pogost',                          lat: 62.0669, lng: 35.2236, iso2: 'RU', type: 'C', year: 1990 },

  // ── Brazil (23 total) ──────────────────────────────────────────────
  { name: 'Historic Town of Ouro Preto',           lat: -20.3856, lng: -43.5035,iso2: 'BR', type: 'C', year: 1980 },
  { name: 'Iguaçu National Park',                  lat: -25.6953, lng: -54.4367,iso2: 'BR', type: 'N', year: 1986 },
  { name: 'Rio de Janeiro: Carioca Landscapes',    lat: -22.9519, lng: -43.2105,iso2: 'BR', type: 'C', year: 2012 },
  { name: 'Brasília',                              lat: -15.7939, lng: -47.8828,iso2: 'BR', type: 'C', year: 1987 },
  { name: 'Central Amazon Conservation Complex',   lat: -2.5000, lng: -62.0000, iso2: 'BR', type: 'N', year: 2000 },

  // ── Mexico (35 total) ──────────────────────────────────────────────
  { name: 'Pre-Hispanic City of Teotihuacan',      lat: 19.6925, lng: -98.8438, iso2: 'MX', type: 'C', year: 1987 },
  { name: 'Historic Centre of Mexico City and Xochimilco', lat: 19.4326, lng: -99.1332, iso2: 'MX', type: 'C', year: 1987 },
  { name: 'Pre-Hispanic City of Chichen-Itza',     lat: 20.6843, lng: -88.5678, iso2: 'MX', type: 'C', year: 1988 },
  { name: 'Historic Centre of Oaxaca and Monte Albán', lat: 17.0436, lng: -96.7678, iso2: 'MX', type: 'C', year: 1987 },
  { name: 'Sian Ka\'an',                           lat: 19.8000, lng: -87.6000, iso2: 'MX', type: 'N', year: 1987 },
  { name: 'Historic Centre of Puebla',             lat: 19.0414, lng: -98.2063, iso2: 'MX', type: 'C', year: 1987 },

  // ── Australia (20 total) ───────────────────────────────────────────
  { name: 'Great Barrier Reef',                    lat: -18.2871, lng: 147.6992,iso2: 'AU', type: 'N', year: 1981 },
  { name: 'Uluru-Kata Tjuta National Park',        lat: -25.3444, lng: 131.0369,iso2: 'AU', type: 'M', year: 1987 },
  { name: 'Sydney Opera House',                    lat: -33.8568, lng: 151.2153,iso2: 'AU', type: 'C', year: 2007 },
  { name: 'Kakadu National Park',                  lat: -12.8333, lng: 132.8833,iso2: 'AU', type: 'M', year: 1981 },
  { name: 'Blue Mountains Area',                   lat: -33.7150, lng: 150.3119,iso2: 'AU', type: 'N', year: 2000 },

  // ── Canada (22 total) ──────────────────────────────────────────────
  { name: 'Canadian Rocky Mountain Parks',         lat: 51.4254, lng: -116.1773,iso2: 'CA', type: 'N', year: 1984 },
  { name: 'Old Quebec',                            lat: 46.8119, lng: -71.2058, iso2: 'CA', type: 'C', year: 1985 },
  { name: 'Nahanni National Park',                 lat: 61.0833, lng: -123.5833,iso2: 'CA', type: 'N', year: 1978 },
  { name: 'Dinosaur Provincial Park',              lat: 50.7500, lng: -111.5333,iso2: 'CA', type: 'N', year: 1979 },

  // ── Egypt (7 total) ────────────────────────────────────────────────
  { name: 'Memphis and its Necropolis (Pyramids of Giza)', lat: 29.9792, lng: 31.1342, iso2: 'EG', type: 'C', year: 1979 },
  { name: 'Ancient Thebes with its Necropolis',    lat: 25.7402, lng: 32.6014,  iso2: 'EG', type: 'C', year: 1979 },
  { name: 'Abu Simbel to Philae (Nubian Monuments)',lat: 22.3360, lng: 31.6256, iso2: 'EG', type: 'C', year: 1979 },
  { name: 'Historic Cairo',                        lat: 30.0459, lng: 31.2243,  iso2: 'EG', type: 'C', year: 1979 },

  // ── Turkey (19 total) ──────────────────────────────────────────────
  { name: 'Historic Areas of Istanbul',            lat: 41.0082, lng: 28.9784,  iso2: 'TR', type: 'C', year: 1985 },
  { name: 'Göreme National Park and Rock Sites of Cappadocia', lat: 38.6431, lng: 34.8289, iso2: 'TR', type: 'M', year: 1985 },
  { name: 'Hierapolis-Pamukkale',                  lat: 37.9204, lng: 29.1187,  iso2: 'TR', type: 'M', year: 1988 },
  { name: 'Ephesus',                               lat: 37.9411, lng: 27.3419,  iso2: 'TR', type: 'C', year: 2015 },
  { name: 'Troy',                                  lat: 39.9575, lng: 26.2389,  iso2: 'TR', type: 'C', year: 1998 },

  // ── Greece (18 total) ──────────────────────────────────────────────
  { name: 'Acropolis, Athens',                     lat: 37.9715, lng: 23.7257,  iso2: 'GR', type: 'C', year: 1987 },
  { name: 'Archaeological Site of Delphi',         lat: 38.4824, lng: 22.5010,  iso2: 'GR', type: 'C', year: 1987 },
  { name: 'Archaeological Site of Olympia',        lat: 37.6388, lng: 21.6300,  iso2: 'GR', type: 'C', year: 1989 },
  { name: 'Meteora',                               lat: 39.7217, lng: 21.6306,  iso2: 'GR', type: 'M', year: 1988 },
  { name: 'Mount Athos',                           lat: 40.1573, lng: 24.3285,  iso2: 'GR', type: 'M', year: 1988 },

  // ── Peru (13 total) ────────────────────────────────────────────────
  { name: 'Historic Sanctuary of Machu Picchu',    lat: -13.1631, lng: -72.5450,iso2: 'PE', type: 'M', year: 1983 },
  { name: 'City of Cusco',                         lat: -13.5170, lng: -71.9785,iso2: 'PE', type: 'C', year: 1983 },
  { name: 'Nazca and Palpa Lines and Geoglyphs',   lat: -14.7350, lng: -75.1300,iso2: 'PE', type: 'C', year: 1994 },
  { name: 'Chan Chan Archaeological Zone',         lat: -8.1050, lng: -79.0747, iso2: 'PE', type: 'C', year: 1986 },

  // ── South Korea (16 total) ─────────────────────────────────────────
  { name: 'Changdeokgung Palace Complex',          lat: 37.5794, lng: 126.9910,iso2: 'KR', type: 'C', year: 1997 },
  { name: 'Gyeongju Historic Areas',               lat: 35.8562, lng: 129.2247,iso2: 'KR', type: 'C', year: 2000 },
  { name: 'Jeju Volcanic Island and Lava Tubes',   lat: 33.3617, lng: 126.5292,iso2: 'KR', type: 'N', year: 2007 },
  { name: 'Haeinsa Temple Janggyeong Panjeon',     lat: 35.8022, lng: 128.0969,iso2: 'KR', type: 'C', year: 1995 },

  // ── Iran (27 total) ────────────────────────────────────────────────
  { name: 'Persepolis',                            lat: 29.9353, lng: 52.8914,  iso2: 'IR', type: 'C', year: 1979 },
  { name: 'Meidan Emam, Isfahan',                  lat: 32.6572, lng: 51.6775,  iso2: 'IR', type: 'C', year: 1979 },
  { name: 'Bam and its Cultural Landscape',        lat: 29.1167, lng: 58.3500,  iso2: 'IR', type: 'C', year: 2004 },
  { name: 'Golestan Palace',                       lat: 35.6840, lng: 51.4178,  iso2: 'IR', type: 'C', year: 2013 },

  // ── Morocco (9 total) ──────────────────────────────────────────────
  { name: 'Medina of Fez',                         lat: 34.0620, lng: -4.9784,  iso2: 'MA', type: 'C', year: 1981 },
  { name: 'Medina of Marrakesh',                   lat: 31.6295, lng: -7.9811,  iso2: 'MA', type: 'C', year: 1985 },
  { name: 'Ksar of Ait-Ben-Haddou',               lat: 31.0472, lng: -7.1297,  iso2: 'MA', type: 'C', year: 1987 },

  // ── South Africa (10 total) ────────────────────────────────────────
  { name: 'Robben Island',                         lat: -33.8066, lng: 18.3661, iso2: 'ZA', type: 'C', year: 1999 },
  { name: 'iSimangaliso Wetland Park',             lat: -27.8500, lng: 32.5500, iso2: 'ZA', type: 'N', year: 1999 },
  { name: 'Fossil Hominid Sites of South Africa',  lat: -25.9517, lng: 27.7814, iso2: 'ZA', type: 'C', year: 1999 },
  { name: 'Cape Floral Region Protected Areas',    lat: -34.0831, lng: 18.4025, iso2: 'ZA', type: 'N', year: 2004 },

  // ── Indonesia (9 total) ────────────────────────────────────────────
  { name: 'Borobudur Temple Compounds',            lat: -7.6079, lng: 110.2038, iso2: 'ID', type: 'C', year: 1991 },
  { name: 'Prambanan Temple Compounds',            lat: -7.7520, lng: 110.4914, iso2: 'ID', type: 'C', year: 1991 },
  { name: 'Komodo National Park',                  lat: -8.5500, lng: 119.4500, iso2: 'ID', type: 'N', year: 1991 },
  { name: 'Tropical Rainforest Heritage of Sumatra',lat: -2.5000, lng: 101.5000,iso2: 'ID', type: 'N', year: 2004 },

  // ── Thailand (7 total) ─────────────────────────────────────────────
  { name: 'Historic City of Ayutthaya',            lat: 14.3553, lng: 100.5683, iso2: 'TH', type: 'C', year: 1991 },
  { name: 'Historic Town of Sukhothai',            lat: 17.0194, lng: 99.7042,  iso2: 'TH', type: 'C', year: 1991 },
  { name: 'Dong Phayayen-Khao Yai Forest Complex', lat: 14.4167, lng: 101.3833,iso2: 'TH', type: 'N', year: 2005 },

  // ── Vietnam (8 total) ──────────────────────────────────────────────
  { name: 'Ha Long Bay',                           lat: 20.9101, lng: 107.1839, iso2: 'VN', type: 'N', year: 1994 },
  { name: 'Hoi An Ancient Town',                   lat: 15.8801, lng: 108.3380, iso2: 'VN', type: 'C', year: 1999 },
  { name: 'Complex of Hué Monuments',              lat: 16.4698, lng: 107.5788, iso2: 'VN', type: 'C', year: 1993 },

  // ── Cambodia (3 total) ─────────────────────────────────────────────
  { name: 'Angkor',                                lat: 13.4125, lng: 103.8670, iso2: 'KH', type: 'C', year: 1992 },

  // ── Nepal (4 total) ────────────────────────────────────────────────
  { name: 'Sagarmatha National Park',              lat: 27.9881, lng: 86.9250,  iso2: 'NP', type: 'N', year: 1979 },
  { name: 'Kathmandu Valley',                      lat: 27.7025, lng: 85.3119,  iso2: 'NP', type: 'C', year: 1979 },
  { name: 'Lumbini, Birthplace of the Lord Buddha',lat: 27.4695, lng: 83.2763, iso2: 'NP', type: 'C', year: 1997 },

  // ── Pakistan (6 total) ─────────────────────────────────────────────
  { name: 'Mohenjo-daro',                          lat: 27.3242, lng: 68.1380,  iso2: 'PK', type: 'C', year: 1980 },
  { name: 'Taxila',                                lat: 33.7462, lng: 72.7970,  iso2: 'PK', type: 'C', year: 1980 },

  // ── Argentina (11 total) ───────────────────────────────────────────
  { name: 'Los Glaciares National Park',           lat: -50.3333, lng: -73.1667,iso2: 'AR', type: 'N', year: 1981 },
  { name: 'Iguazú National Park',                  lat: -25.6808, lng: -54.4508,iso2: 'AR', type: 'N', year: 1984 },

  // ── Colombia (9 total) ─────────────────────────────────────────────
  { name: 'Port, Fortresses, Monuments of Cartagena',lat: 10.4236, lng: -75.5336,iso2:'CO', type: 'C', year: 1984 },
  { name: 'Coffee Cultural Landscape of Colombia', lat: 4.7700, lng: -75.7000,  iso2: 'CO', type: 'C', year: 2011 },
  { name: 'Los Katíos National Park',              lat: 7.8000, lng: -77.1333,  iso2: 'CO', type: 'N', year: 1994 },

  // ── Chile (7 total) ────────────────────────────────────────────────
  { name: 'Rapa Nui National Park (Easter Island)',lat: -27.1127, lng: -109.3497,iso2: 'CL', type: 'C', year: 1995 },
  { name: 'Historic Quarter of Valparaíso',        lat: -33.0472, lng: -71.6127,iso2: 'CL', type: 'C', year: 2003 },

  // ── Poland (17 total) ──────────────────────────────────────────────
  { name: 'Auschwitz Birkenau',                    lat: 50.0343, lng: 19.1784,  iso2: 'PL', type: 'C', year: 1979 },
  { name: 'Historic Centre of Kraków',             lat: 50.0614, lng: 19.9383,  iso2: 'PL', type: 'C', year: 1978 },
  { name: 'Wieliczka and Bochnia Royal Salt Mines',lat: 49.9833, lng: 20.0556,  iso2: 'PL', type: 'C', year: 1978 },

  // ── Czech Republic (17 total) ──────────────────────────────────────
  { name: 'Historic Centre of Prague',             lat: 50.0755, lng: 14.4378,  iso2: 'CZ', type: 'C', year: 1992 },
  { name: 'Historic Centre of Český Krumlov',      lat: 48.8127, lng: 14.3175,  iso2: 'CZ', type: 'C', year: 1992 },

  // ── Austria (12 total) ─────────────────────────────────────────────
  { name: 'Palace and Gardens of Schönbrunn',      lat: 48.1845, lng: 16.3122,  iso2: 'AT', type: 'C', year: 1996 },
  { name: 'Historic Centre of Salzburg',           lat: 47.7981, lng: 13.0475,  iso2: 'AT', type: 'C', year: 1996 },
  { name: 'Hallstatt-Dachstein Cultural Landscape',lat: 47.5622, lng: 13.6493, iso2: 'AT', type: 'C', year: 1997 },

  // ── Switzerland (13 total) ─────────────────────────────────────────
  { name: 'Swiss Alps Jungfrau-Aletsch',           lat: 46.5414, lng: 7.9892,   iso2: 'CH', type: 'N', year: 2001 },
  { name: 'Old City of Berne',                     lat: 46.9480, lng: 7.4474,   iso2: 'CH', type: 'C', year: 1983 },

  // ── Belgium (16 total) ─────────────────────────────────────────────
  { name: 'Grand-Place, Brussels',                 lat: 50.8467, lng: 4.3525,   iso2: 'BE', type: 'C', year: 1998 },
  { name: 'Belfries of Belgium and France',        lat: 50.8503, lng: 2.8824,   iso2: 'BE', type: 'C', year: 1999 },

  // ── Netherlands (12 total) ─────────────────────────────────────────
  { name: 'Canal Ring Area of Amsterdam',          lat: 52.3676, lng: 4.9041,   iso2: 'NL', type: 'C', year: 2010 },
  { name: 'Schokland and Surroundings',            lat: 52.6333, lng: 5.7667,   iso2: 'NL', type: 'C', year: 1995 },

  // ── Portugal (17 total) ────────────────────────────────────────────
  { name: 'Tower of Belém',                        lat: 38.6916, lng: -9.2160,  iso2: 'PT', type: 'C', year: 1983 },
  { name: 'Cultural Landscape of Sintra',          lat: 38.7876, lng: -9.3906,  iso2: 'PT', type: 'C', year: 1995 },
  { name: 'Historic Centre of Porto',              lat: 41.1414, lng: -8.6124,  iso2: 'PT', type: 'C', year: 1996 },

  // ── Sweden (15 total) ──────────────────────────────────────────────
  { name: 'Birka and Hovgården',                   lat: 59.3333, lng: 17.5500,  iso2: 'SE', type: 'C', year: 1993 },
  { name: 'Laponian Area',                         lat: 67.2000, lng: 17.1000,  iso2: 'SE', type: 'M', year: 1996 },

  // ── Norway (8 total) ───────────────────────────────────────────────
  { name: 'Bryggen',                               lat: 60.3975, lng: 5.3228,   iso2: 'NO', type: 'C', year: 1979 },
  { name: 'West Norwegian Fjords',                 lat: 62.1050, lng: 7.1944,   iso2: 'NO', type: 'N', year: 2005 },

  // ── Denmark (10 total) ─────────────────────────────────────────────
  { name: 'Jelling Mounds, Runic Stones and Church',lat: 55.7556, lng: 9.4194,  iso2: 'DK', type: 'C', year: 1994 },
  { name: 'Kronborg Castle',                       lat: 56.0389, lng: 12.6208,  iso2: 'DK', type: 'C', year: 2000 },

  // ── Finland (7 total) ──────────────────────────────────────────────
  { name: 'Fortress of Suomenlinna',               lat: 60.1458, lng: 24.9883,  iso2: 'FI', type: 'C', year: 1991 },

  // ── Ireland (2 total) ──────────────────────────────────────────────
  { name: 'Brú na Bóinne (Newgrange)',             lat: 53.6947, lng: -6.4753,  iso2: 'IE', type: 'C', year: 1993 },
  { name: 'Skellig Michael',                       lat: 51.7710, lng: -10.5396, iso2: 'IE', type: 'C', year: 1996 },

  // ── Israel (9 total) ───────────────────────────────────────────────
  { name: 'Old City of Jerusalem and its Walls',   lat: 31.7767, lng: 35.2345,  iso2: 'IL', type: 'C', year: 1981 },
  { name: 'Masada',                                lat: 31.3156, lng: 35.3536,  iso2: 'IL', type: 'C', year: 2001 },
  { name: 'White City of Tel-Aviv',                lat: 32.0741, lng: 34.7744,  iso2: 'IL', type: 'C', year: 2003 },

  // ── Jordan (6 total) ───────────────────────────────────────────────
  { name: 'Petra',                                 lat: 30.3285, lng: 35.4414,  iso2: 'JO', type: 'C', year: 1985 },
  { name: 'Wadi Rum Protected Area',               lat: 29.5321, lng: 35.4137,  iso2: 'JO', type: 'M', year: 2011 },

  // ── Ethiopia (11 total) ────────────────────────────────────────────
  { name: 'Rock-Hewn Churches, Lalibela',          lat: 12.0319, lng: 39.0472,  iso2: 'ET', type: 'C', year: 1978 },
  { name: 'Simien National Park',                  lat: 13.2500, lng: 38.0667,  iso2: 'ET', type: 'N', year: 1978 },
  { name: 'Aksum',                                 lat: 14.1211, lng: 38.7181,  iso2: 'ET', type: 'C', year: 1980 },

  // ── Tanzania (7 total) ─────────────────────────────────────────────
  { name: 'Serengeti National Park',               lat: -2.3333, lng: 34.8333,  iso2: 'TZ', type: 'N', year: 1981 },
  { name: 'Ngorongoro Conservation Area',          lat: -3.2333, lng: 35.4500,  iso2: 'TZ', type: 'M', year: 1979 },
  { name: 'Kilimanjaro National Park',             lat: -3.0674, lng: 37.3556,  iso2: 'TZ', type: 'N', year: 1987 },

  // ── Kenya (7 total) ────────────────────────────────────────────────
  { name: 'Mount Kenya National Park',             lat: -0.1500, lng: 37.3000,  iso2: 'KE', type: 'N', year: 1997 },
  { name: 'Lamu Old Town',                         lat: -2.2697, lng: 40.9025,  iso2: 'KE', type: 'C', year: 2001 },

  // ── Uganda, DRC, Madagascar ────────────────────────────────────────
  { name: 'Bwindi Impenetrable National Park',     lat: -1.0500, lng: 29.6167,  iso2: 'UG', type: 'N', year: 1994 },
  { name: 'Virunga National Park',                 lat: -1.4000, lng: 29.2000,  iso2: 'CD', type: 'N', year: 1979 },
  { name: 'Tsingy de Bemaraha Strict Nature Reserve',lat:-18.6667,lng: 44.7500, iso2: 'MG', type: 'N', year: 1990 },

  // ── New Zealand (3 total) ──────────────────────────────────────────
  { name: 'Te Wahipounamu (South West New Zealand)',lat: -44.6667, lng: 167.8333,iso2: 'NZ', type: 'N', year: 1990 },
  { name: 'Tongariro National Park',               lat: -39.2000, lng: 175.5667,iso2: 'NZ', type: 'M', year: 1990 },

  // ── Philippines (6 total) ──────────────────────────────────────────
  { name: 'Rice Terraces of the Philippine Cordilleras',lat: 16.9500, lng: 121.0833,iso2:'PH', type:'C', year: 1995 },
  { name: 'Puerto-Princesa Subterranean River National Park',lat: 10.1667, lng: 118.9167,iso2:'PH', type:'N', year: 1999 },

  // ── Malaysia (4 total) ─────────────────────────────────────────────
  { name: 'Kinabalu Park',                         lat: 6.0833, lng: 116.5500,  iso2: 'MY', type: 'N', year: 2000 },
  { name: 'Melaka and George Town',                lat: 2.1896, lng: 102.2501,  iso2: 'MY', type: 'C', year: 2008 },

  // ── Sri Lanka (8 total) ────────────────────────────────────────────
  { name: 'Ancient City of Sigiriya',              lat: 7.9570, lng: 80.7603,   iso2: 'LK', type: 'C', year: 1982 },
  { name: 'Sacred City of Anuradhapura',           lat: 8.3114, lng: 80.3972,   iso2: 'LK', type: 'C', year: 1982 },

  // ── Myanmar (2 total) ──────────────────────────────────────────────
  { name: 'Bagan',                                 lat: 21.1717, lng: 94.8585,  iso2: 'MM', type: 'C', year: 2019 },

  // ── Cuba (9 total) ─────────────────────────────────────────────────
  { name: 'Old Havana and its Fortification System',lat: 23.1395, lng: -82.3534,iso2: 'CU', type: 'C', year: 1982 },
  { name: 'Trinidad and the Valley de los Ingenios',lat: 21.8051, lng: -79.9844,iso2: 'CU', type: 'C', year: 1988 },

  // ── Saudi Arabia (7 total) ─────────────────────────────────────────
  { name: 'Al-Hijr Archaeological Site (Madain Salih)',lat: 26.7907, lng: 37.9533,iso2:'SA', type: 'C', year: 2008 },

  // ── UAE (1 total) ──────────────────────────────────────────────────
  { name: 'Cultural Sites of Al Ain',              lat: 24.0719, lng: 55.7608,  iso2: 'AE', type: 'C', year: 2011 },

  // ── Iraq (6 total) ─────────────────────────────────────────────────
  { name: 'Hatra',                                 lat: 35.5878, lng: 42.7186,  iso2: 'IQ', type: 'C', year: 1985 },
  { name: 'Babylon',                               lat: 32.5363, lng: 44.4209,  iso2: 'IQ', type: 'C', year: 2019 },

  // ── Lebanon (5 total) ──────────────────────────────────────────────
  { name: 'Baalbek',                               lat: 34.0069, lng: 36.2039,  iso2: 'LB', type: 'C', year: 1984 },
  { name: 'Byblos',                                lat: 34.1200, lng: 35.6486,  iso2: 'LB', type: 'C', year: 1984 },

  // ── Tunisia (8 total) ──────────────────────────────────────────────
  { name: 'Amphitheatre of El Jem',                lat: 35.2961, lng: 10.7069,  iso2: 'TN', type: 'C', year: 1979 },
  { name: 'Site of Carthage',                      lat: 36.8528, lng: 10.3233,  iso2: 'TN', type: 'C', year: 1979 },

  // ── Libya (5 total) ────────────────────────────────────────────────
  { name: 'Archaeological Site of Leptis Magna',   lat: 32.6378, lng: 14.2886,  iso2: 'LY', type: 'C', year: 1982 },

  // ── Senegal, Mali, Ghana ───────────────────────────────────────────
  { name: 'Island of Gorée',                       lat: 14.6667, lng: -17.3981, iso2: 'SN', type: 'C', year: 1978 },
  { name: 'Timbuktu',                              lat: 16.7735, lng: -3.0074,  iso2: 'ML', type: 'C', year: 1988 },
  { name: 'Forts and Castles, Volta, Greater Accra',lat: 5.0833, lng: -1.2833, iso2: 'GH', type: 'C', year: 1979 },

  // ── Zimbabwe, Zambia ───────────────────────────────────────────────
  { name: 'Great Zimbabwe National Monument',      lat: -20.2714, lng: 30.9339, iso2: 'ZW', type: 'C', year: 1986 },
  { name: 'Mosi-oa-Tunya / Victoria Falls',        lat: -17.9244, lng: 25.8572, iso2: 'ZM', type: 'N', year: 1989 },

  // ── Ecuador (5 total) ──────────────────────────────────────────────
  { name: 'Galápagos Islands',                     lat: -0.8333, lng: -91.1333, iso2: 'EC', type: 'N', year: 1978 },
  { name: 'City of Quito',                         lat: -0.2150, lng: -78.5000, iso2: 'EC', type: 'C', year: 1978 },

  // ── Bolivia (7 total) ──────────────────────────────────────────────
  { name: 'City of Potosí',                        lat: -19.5883, lng: -65.7553,iso2: 'BO', type: 'C', year: 1987 },
  { name: 'Tiwanaku',                              lat: -16.5553, lng: -68.6725,iso2: 'BO', type: 'C', year: 2000 },

  // ── Guatemala (3 total) ────────────────────────────────────────────
  { name: 'Tikal National Park',                   lat: 17.2220, lng: -89.6237, iso2: 'GT', type: 'M', year: 1979 },

  // ── Honduras (2 total) ─────────────────────────────────────────────
  { name: 'Maya Site of Copan',                    lat: 14.8383, lng: -89.1423, iso2: 'HN', type: 'C', year: 1980 },

  // ── Romania (9 total) ──────────────────────────────────────────────
  { name: 'Danube Delta',                          lat: 45.0833, lng: 29.5000,  iso2: 'RO', type: 'N', year: 1991 },
  { name: 'Churches of Moldavia',                  lat: 47.7500, lng: 25.7000,  iso2: 'RO', type: 'C', year: 1993 },

  // ── Hungary (8 total) ──────────────────────────────────────────────
  { name: 'Budapest: Banks of the Danube & Buda Castle',lat: 47.4979, lng: 19.0402,iso2: 'HU', type: 'C', year: 1987 },

  // ── Croatia (10 total) ─────────────────────────────────────────────
  { name: 'Old City of Dubrovnik',                 lat: 42.6507, lng: 18.0944,  iso2: 'HR', type: 'C', year: 1979 },
  { name: 'Plitvice Lakes National Park',          lat: 44.8654, lng: 15.5821,  iso2: 'HR', type: 'N', year: 1979 },

  // ── Serbia (5 total) ───────────────────────────────────────────────
  { name: 'Studenica Monastery',                   lat: 43.4861, lng: 20.5322,  iso2: 'RS', type: 'C', year: 1986 },

  // ── Georgia (4 total) ──────────────────────────────────────────────
  { name: 'Historical Monuments of Mtskheta',      lat: 41.8444, lng: 44.7197,  iso2: 'GE', type: 'C', year: 1994 },

  // ── Armenia (3 total) ──────────────────────────────────────────────
  { name: 'Monasteries of Haghpat and Sanahin',    lat: 41.0939, lng: 44.6814,  iso2: 'AM', type: 'C', year: 1996 },

  // ── Uzbekistan (5 total) ───────────────────────────────────────────
  { name: 'Historic Centre of Bukhara',            lat: 39.7745, lng: 64.4231,  iso2: 'UZ', type: 'C', year: 1993 },
  { name: 'Samarkand — Crossroad of Cultures',     lat: 39.6550, lng: 66.9597,  iso2: 'UZ', type: 'C', year: 2001 },

  // ── Myanmar / Laos / Mongolia ──────────────────────────────────────
  { name: 'Town of Luang Prabang',                 lat: 19.8856, lng: 102.1347, iso2: 'LA', type: 'C', year: 1995 },
  { name: 'Orkhon Valley Cultural Landscape',      lat: 47.5000, lng: 102.8333, iso2: 'MN', type: 'C', year: 2004 },

  // ── Costa Rica (4 total) ───────────────────────────────────────────
  { name: 'Cocos Island National Park',            lat: 5.5294, lng: -87.0628,  iso2: 'CR', type: 'N', year: 1997 },

  // ── Panama (5 total) ───────────────────────────────────────────────
  { name: 'Fortifications on the Caribbean Side of Portobelo-San Lorenzo', lat: 9.5548, lng: -79.6545, iso2: 'PA', type: 'C', year: 1980 },

  // ── Nigeria (2 total) ──────────────────────────────────────────────
  { name: 'Osun-Osogbo Sacred Grove',              lat: 7.7500, lng: 4.5500,    iso2: 'NG', type: 'C', year: 2005 },

  // ── Bangladesh (3 total) ───────────────────────────────────────────
  { name: 'Ruins of the Buddhist Vihara at Paharpur',lat: 25.0306, lng: 88.9775,iso2: 'BD', type: 'C', year: 1985 },
  { name: 'The Sundarbans',                        lat: 21.9497, lng: 89.1833,  iso2: 'BD', type: 'N', year: 1997 },

  // ── Iceland (3 total) ──────────────────────────────────────────────
  { name: 'Þingvellir National Park',              lat: 64.2559, lng: -21.1300, iso2: 'IS', type: 'C', year: 2004 },

  // ── Algeria (7 total) ──────────────────────────────────────────────
  { name: 'Tassili n\'Ajjer',                      lat: 25.5000, lng: 9.0000,   iso2: 'DZ', type: 'M', year: 1982 },
  { name: 'Djémila',                               lat: 36.3214, lng: 5.7367,   iso2: 'DZ', type: 'C', year: 1982 },
];

// Expand type codes
const TYPE_MAP = { C: 'Cultural', N: 'Natural', M: 'Mixed' };

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  UNESCO World Heritage Sites builder                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Build output array
  const sites = SITES.map(s => ({
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    iso2: s.iso2,
    type: TYPE_MAP[s.type] || s.type,
    year: s.year,
  }));

  console.log(`Total sites: ${sites.length}`);

  // Count by type
  const byType = { Cultural: 0, Natural: 0, Mixed: 0 };
  sites.forEach(s => { byType[s.type] = (byType[s.type] || 0) + 1; });
  console.log(`  Cultural: ${byType.Cultural}  Natural: ${byType.Natural}  Mixed: ${byType.Mixed}`);

  // Count by country
  const byCountry = {};
  sites.forEach(s => { byCountry[s.iso2] = (byCountry[s.iso2] || 0) + 1; });
  console.log(`  Countries covered: ${Object.keys(byCountry).length}\n`);

  // Write unesco.json
  fs.writeFileSync(OUT_PATH, JSON.stringify(sites, null, 2));
  console.log(`✓ Written ${sites.length} sites to ${OUT_PATH}`);

  // Enrich country-data.json with counts
  const cd = JSON.parse(fs.readFileSync(CD_PATH, 'utf8'));
  console.log(`Loaded country-data.json: ${Object.keys(cd).length} entries\n`);

  // Clear old UNESCO fields
  for (const iso in cd) {
    if (!cd[iso]) continue;
    delete cd[iso].unesco_cultural;
    delete cd[iso].unesco_natural;
    delete cd[iso].unesco_mixed;
    delete cd[iso].unesco_total;
  }

  // Count per country
  const counts = {};
  for (const s of sites) {
    if (!counts[s.iso2]) counts[s.iso2] = { cultural: 0, natural: 0, mixed: 0 };
    if (s.type === 'Cultural') counts[s.iso2].cultural++;
    else if (s.type === 'Natural') counts[s.iso2].natural++;
    else if (s.type === 'Mixed') counts[s.iso2].mixed++;
  }

  console.log('── Merging counts ──────────────────────────────────────────────────');
  let enriched = 0;
  for (const [iso2, c] of Object.entries(counts)) {
    if (!cd[iso2]) { console.log(`  SKIP: ${iso2} not in country-data.json`); continue; }
    cd[iso2].unesco_cultural = c.cultural;
    cd[iso2].unesco_natural  = c.natural;
    cd[iso2].unesco_mixed    = c.mixed;
    cd[iso2].unesco_total    = c.cultural + c.natural + c.mixed;
    enriched++;
  }
  console.log(`  Enriched ${enriched} countries with UNESCO counts`);

  fs.writeFileSync(CD_PATH, JSON.stringify(cd, null, 2));
  console.log(`✓ Written to ${CD_PATH}`);

  // Spot-check
  console.log('\n── Spot-check ──────────────────────────────────────────────────────');
  for (const iso of ['IT', 'CN', 'FR', 'DE', 'ES', 'US', 'IN', 'JP', 'BR', 'AU', 'EG', 'TR', 'GR', 'PE']) {
    const c = cd[iso];
    if (!c || !c.unesco_total) continue;
    console.log(`  ${iso}: ${c.unesco_total} total (${c.unesco_cultural}C ${c.unesco_natural}N ${c.unesco_mixed}M)`);
  }

  // Top countries by site count
  console.log('\n── Top 15 countries ────────────────────────────────────────────────');
  Object.entries(counts)
    .map(([iso, c]) => [iso, c.cultural + c.natural + c.mixed])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .forEach(([iso, n]) => console.log(`  ${iso}: ${n} sites`));
}

main();
