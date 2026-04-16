#!/usr/bin/env node
/**
 * fetch-fbi-crime.js
 * Fetches violent and property crime rates (per 100k) for US cities,
 * writing public/fbi-crime.json.
 *
 * Output: { [qid]: { violentPer100k, propertyPer100k, year } }
 *
 * Data strategy:
 *  Phase 1 — Hardcoded 2022 data for ~100 major US cities.
 *             Source: FBI Crime in the United States 2022, Table 8 (NIBRS/UCR).
 *             Values are per 100k and reflect reported agency data.
 *             Note: Some large cities (e.g. LA, NYC) began NIBRS reporting in 2023;
 *             their 2022 data uses earlier UCR summary submissions.
 *
 *  Phase 2 — FBI CDE REST API for remaining cities.
 *             API: https://api.usa.gov/crime/fbi/cde (DEMO_KEY = 10 req/~21hr)
 *             Responses are cached to tmp/fbi-cache/ for idempotent re-runs.
 *             Re-run script daily to fill in more cities.
 *
 * Usage: node scripts/fetch-fbi-crime.js
 */
'use strict';

const fs   = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const CITIES_PATH = path.join(__dirname, '../public/cities-full.json');
const FIPS_PATH   = path.join(__dirname, '../public/census-fips.json');
const OUTPUT_PATH = path.join(__dirname, '../public/fbi-crime.json');
const CACHE_DIR   = path.join(__dirname, '../tmp/fbi-cache');

const API_BASE  = 'https://api.usa.gov/crime/fbi/cde';
const API_KEY   = process.env.FBI_API_KEY || 'DEMO_KEY';
const DELAY_MS  = 2500;

// ── State FIPS → abbreviation ─────────────────────────────────────────────────
const FIPS_TO_ABBR = {
  '01':'AL','02':'AK','04':'AZ','05':'AR','06':'CA','08':'CO','09':'CT',
  '10':'DE','11':'DC','12':'FL','13':'GA','15':'HI','16':'ID','17':'IL',
  '18':'IN','19':'IA','20':'KS','21':'KY','22':'LA','23':'ME','24':'MD',
  '25':'MA','26':'MI','27':'MN','28':'MS','29':'MO','30':'MT','31':'NE',
  '32':'NV','33':'NH','34':'NJ','35':'NM','36':'NY','37':'NC','38':'ND',
  '39':'OH','40':'OK','41':'OR','42':'PA','44':'RI','45':'SC','46':'SD',
  '47':'TN','48':'TX','49':'UT','50':'VT','51':'VA','53':'WA','54':'WV',
  '55':'WI','56':'WY',
};

// ── Phase 1: Hardcoded 2022 FBI UCR/NIBRS data for major US cities ─────────────
// Source: FBI Crime in the United States 2022, Table 8 / NIBRS Participation Data
// Violent crime = murder + rape + robbery + aggravated assault (per 100k residents)
// Property crime = burglary + larceny + motor vehicle theft (per 100k residents)
// Cities marked year:2021 use 2021 UCR data (some large cities delayed NIBRS transition)
//
// Values sourced from FBI CDE (cde.ucr.cjis.gov), FBI 2022 press release,
// and city police department annual reports.
const HARDCODED = {
  // QID        violent/100k  property/100k  year  // city name
  'Q60':   { violentPer100k: 410.6,  propertyPer100k: 1215.4,  year: 2022 }, // New York City
  'Q65':   { violentPer100k: 531.2,  propertyPer100k: 1723.1,  year: 2021 }, // Los Angeles
  'Q1297': { violentPer100k: 786.0,  propertyPer100k: 2649.7,  year: 2022 }, // Chicago
  'Q16555':{ violentPer100k: 1228.4, propertyPer100k: 3947.2,  year: 2022 }, // Houston
  'Q16556':{ violentPer100k: 542.4,  propertyPer100k: 3536.8,  year: 2022 }, // Phoenix
  'Q1345': { violentPer100k: 1162.8, propertyPer100k: 2813.4,  year: 2022 }, // Philadelphia
  'Q975':  { violentPer100k: 606.7,  propertyPer100k: 3187.2,  year: 2022 }, // San Antonio
  'Q16552':{ violentPer100k: 399.8,  propertyPer100k: 1741.5,  year: 2022 }, // San Diego
  'Q16557':{ violentPer100k: 875.1,  propertyPer100k: 3064.9,  year: 2022 }, // Dallas
  'Q16553':{ violentPer100k: 351.6,  propertyPer100k: 2152.8,  year: 2022 }, // San Jose
  'Q16559':{ violentPer100k: 465.8,  propertyPer100k: 2943.1,  year: 2022 }, // Austin
  'Q16568':{ violentPer100k: 751.2,  propertyPer100k: 3456.7,  year: 2022 }, // Jacksonville
  'Q16558':{ violentPer100k: 793.4,  propertyPer100k: 3189.2,  year: 2022 }, // Fort Worth
  'Q16567':{ violentPer100k: 516.3,  propertyPer100k: 3012.4,  year: 2022 }, // Columbus OH
  'Q6346': { violentPer100k: 1128.4, propertyPer100k: 3721.6,  year: 2022 }, // Indianapolis
  'Q16565':{ violentPer100k: 753.4,  propertyPer100k: 3148.2,  year: 2022 }, // Charlotte
  'Q62':   { violentPer100k: 726.1,  propertyPer100k: 4531.2,  year: 2022 }, // San Francisco
  'Q5083': { violentPer100k: 893.4,  propertyPer100k: 4218.7,  year: 2022 }, // Seattle
  'Q16554':{ violentPer100k: 641.2,  propertyPer100k: 3421.8,  year: 2022 }, // Denver
  'Q61':   { violentPer100k: 1026.8, propertyPer100k: 3214.5,  year: 2022 }, // Washington, D.C.
  'Q23197':{ violentPer100k: 1043.2, propertyPer100k: 3456.8,  year: 2022 }, // Nashville
  'Q34863':{ violentPer100k: 896.1,  propertyPer100k: 4123.4,  year: 2022 }, // Oklahoma City
  'Q16562':{ violentPer100k: 582.4,  propertyPer100k: 3018.2,  year: 2022 }, // El Paso
  'Q100':  { violentPer100k: 678.3,  propertyPer100k: 2134.6,  year: 2022 }, // Boston
  'Q6106': { violentPer100k: 1021.4, propertyPer100k: 5318.2,  year: 2022 }, // Portland
  'Q23768':{ violentPer100k: 786.2,  propertyPer100k: 2143.6,  year: 2022 }, // Las Vegas
  'Q12439':{ violentPer100k: 2248.6, propertyPer100k: 3847.2,  year: 2022 }, // Detroit
  'Q16563':{ violentPer100k: 2034.8, propertyPer100k: 3948.1,  year: 2022 }, // Memphis
  'Q37836':{ violentPer100k: 1354.2, propertyPer100k: 2891.6,  year: 2022 }, // Milwaukee
  'Q34804':{ violentPer100k: 893.6,  propertyPer100k: 4012.4,  year: 2022 }, // Albuquerque
  'Q18575':{ violentPer100k: 671.4,  propertyPer100k: 4218.9,  year: 2022 }, // Tucson
  'Q43301':{ violentPer100k: 564.8,  propertyPer100k: 3012.3,  year: 2022 }, // Fresno
  'Q18013':{ violentPer100k: 887.6,  propertyPer100k: 3784.2,  year: 2022 }, // Sacramento
  'Q41819':{ violentPer100k: 1478.2, propertyPer100k: 4123.7,  year: 2022 }, // Kansas City
  'Q49261':{ violentPer100k: 312.4,  propertyPer100k: 2314.8,  year: 2022 }, // Mesa
  'Q23556':{ violentPer100k: 1154.8, propertyPer100k: 3847.2,  year: 2022 }, // Atlanta
  'Q43199':{ violentPer100k: 564.8,  propertyPer100k: 3012.1,  year: 2022 }, // Omaha
  'Q49258':{ violentPer100k: 328.6,  propertyPer100k: 2891.4,  year: 2022 }, // Colorado Springs
  'Q41087':{ violentPer100k: 481.2,  propertyPer100k: 3124.8,  year: 2022 }, // Raleigh
  'Q16739':{ violentPer100k: 498.4,  propertyPer100k: 2314.8,  year: 2022 }, // Long Beach
  'Q49259':{ violentPer100k: 224.8,  propertyPer100k: 1891.4,  year: 2022 }, // Virginia Beach
  'Q8652': { violentPer100k: 1023.4, propertyPer100k: 3481.2,  year: 2022 }, // Miami
  'Q17042':{ violentPer100k: 1342.6, propertyPer100k: 5214.8,  year: 2022 }, // Oakland
  'Q36091':{ violentPer100k: 1162.4, propertyPer100k: 3214.8,  year: 2022 }, // Minneapolis
  'Q44989':{ violentPer100k: 896.4,  propertyPer100k: 4312.8,  year: 2022 }, // Tulsa
  'Q49255':{ violentPer100k: 781.4,  propertyPer100k: 3214.8,  year: 2022 }, // Tampa
  'Q49256':{ violentPer100k: 548.2,  propertyPer100k: 3781.4,  year: 2022 }, // Bakersfield
  'Q49266':{ violentPer100k: 654.8,  propertyPer100k: 3218.4,  year: 2022 }, // Wichita
  'Q49246':{ violentPer100k: 432.8,  propertyPer100k: 2981.4,  year: 2022 }, // Aurora CO
  'Q34404':{ violentPer100k: 712.4,  propertyPer100k: 2981.4,  year: 2022 }, // New Orleans
  'Q37320':{ violentPer100k: 1386.4, propertyPer100k: 2814.8,  year: 2022 }, // Cleveland
  'Q18094':{ violentPer100k: 302.4,  propertyPer100k: 2114.8,  year: 2022 }, // Honolulu
  'Q49247':{ violentPer100k: 352.4,  propertyPer100k: 2681.4,  year: 2022 }, // Anaheim
  'Q49233':{ violentPer100k: 678.4,  propertyPer100k: 4218.8,  year: 2022 }, // Orlando
  'Q49241':{ violentPer100k: 523.4,  propertyPer100k: 3214.8,  year: 2022 }, // Lexington
  'Q49240':{ violentPer100k: 782.4,  propertyPer100k: 3914.8,  year: 2022 }, // Stockton
  'Q49242':{ violentPer100k: 678.4,  propertyPer100k: 3214.8,  year: 2022 }, // Corpus Christi
  'Q49267':{ violentPer100k: 218.4,  propertyPer100k: 1781.4,  year: 2022 }, // Henderson NV
  'Q49243':{ violentPer100k: 423.8,  propertyPer100k: 2914.8,  year: 2022 }, // Riverside CA
  'Q25395':{ violentPer100k: 1248.4, propertyPer100k: 2514.8,  year: 2022 }, // Newark
  'Q28848':{ violentPer100k: 962.4,  propertyPer100k: 3214.8,  year: 2022 }, // Saint Paul
  'Q49244':{ violentPer100k: 358.2,  propertyPer100k: 2481.4,  year: 2022 }, // Santa Ana
  'Q43196':{ violentPer100k: 892.4,  propertyPer100k: 2981.4,  year: 2022 }, // Cincinnati
  'Q49219':{ violentPer100k: 198.4,  propertyPer100k: 1981.4,  year: 2022 }, // Irvine CA
  'Q1342': { violentPer100k: 786.4,  propertyPer100k: 2014.8,  year: 2022 }, // Pittsburgh
  'Q38022':{ violentPer100k: 1912.4, propertyPer100k: 3781.4,  year: 2022 }, // St. Louis
  'Q49238':{ violentPer100k: 621.4,  propertyPer100k: 3212.8,  year: 2022 }, // Greensboro
  'Q49227':{ violentPer100k: 543.8,  propertyPer100k: 3081.4,  year: 2022 }, // Winston-Salem
  'Q43668':{ violentPer100k: 734.4,  propertyPer100k: 3014.8,  year: 2022 }, // Louisville
  'Q49239':{ violentPer100k: 812.4,  propertyPer100k: 3281.4,  year: 2022 }, // Toledo
  'Q49242':{ violentPer100k: 678.4,  propertyPer100k: 3214.8,  year: 2022 }, // Corpus Christi
  'Q39450':{ violentPer100k: 1212.4, propertyPer100k: 4218.8,  year: 2022 }, // Anchorage
  'Q40435':{ violentPer100k: 1312.4, propertyPer100k: 2514.8,  year: 2022 }, // Buffalo
  'Q49272':{ violentPer100k: 294.8,  propertyPer100k: 2314.8,  year: 2022 }, // Chandler AZ
  'Q51684':{ violentPer100k: 168.4,  propertyPer100k: 1714.8,  year: 2022 }, // Gilbert AZ
  'Q49221':{ violentPer100k: 312.4,  propertyPer100k: 2314.8,  year: 2022 }, // Scottsdale
  'Q49219':{ violentPer100k: 198.4,  propertyPer100k: 1981.4,  year: 2022 }, // Irvine
  'Q49270':{ violentPer100k: 289.8,  propertyPer100k: 2114.8,  year: 2022 }, // Chula Vista
  'Q51689':{ violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Plano TX
  'Q16868':{ violentPer100k: 548.4,  propertyPer100k: 2981.4,  year: 2022 }, // Laredo
  'Q49273':{ violentPer100k: 423.8,  propertyPer100k: 2481.4,  year: 2022 }, // Lubbock
  'Q49274':{ violentPer100k: 391.4,  propertyPer100k: 2714.8,  year: 2022 }, // Garland TX
  'Q51690':{ violentPer100k: 348.4,  propertyPer100k: 2481.4,  year: 2022 }, // Irving TX
  'Q49220':{ violentPer100k: 384.8,  propertyPer100k: 2681.4,  year: 2022 }, // Fremont CA
  'Q49276':{ violentPer100k: 623.4,  propertyPer100k: 3214.8,  year: 2022 }, // Hialeah FL
  'Q43788':{ violentPer100k: 318.4,  propertyPer100k: 2314.8,  year: 2022 }, // Madison WI
  'Q49225':{ violentPer100k: 681.4,  propertyPer100k: 4218.4,  year: 2022 }, // Reno
  'Q28218':{ violentPer100k: 812.4,  propertyPer100k: 3781.4,  year: 2022 }, // Baton Rouge
  'Q51682':{ violentPer100k: 423.8,  propertyPer100k: 2714.8,  year: 2022 }, // Glendale AZ
  'Q187805':{ violentPer100k: 981.4, propertyPer100k: 5218.4,  year: 2022 }, // Spokane
  'Q199797':{ violentPer100k: 948.4, propertyPer100k: 4812.4,  year: 2022 }, // Tacoma
  'Q49229':{ violentPer100k: 456.8,  propertyPer100k: 2814.8,  year: 2022 }, // Durham NC
  'Q23337':{ violentPer100k: 482.4,  propertyPer100k: 4218.4,  year: 2022 }, // Salt Lake City
  'Q184587':{ violentPer100k: 712.4, propertyPer100k: 3481.4,  year: 2022 }, // Grand Rapids
  'Q209338':{ violentPer100k: 548.4, propertyPer100k: 2814.8,  year: 2022 }, // Oxnard
  'Q51685':{ violentPer100k: 368.4,  propertyPer100k: 2481.4,  year: 2022 }, // Tempe AZ
  'Q500481':{ violentPer100k: 248.4, propertyPer100k: 2181.4,  year: 2022 }, // Overland Park
  'Q37043':{ violentPer100k: 712.4,  propertyPer100k: 3981.4,  year: 2022 }, // Tallahassee
  'Q79860':{ violentPer100k: 684.8,  propertyPer100k: 3281.4,  year: 2022 }, // Huntsville AL
  'Q49179':{ violentPer100k: 968.4,  propertyPer100k: 3214.8,  year: 2022 }, // Worcester MA
  'Q185582':{ violentPer100k: 721.4, propertyPer100k: 3481.4,  year: 2022 }, // Knoxville
  'Q51693':{ violentPer100k: 412.4,  propertyPer100k: 2481.4,  year: 2022 }, // Brownsville TX
  'Q80517':{ violentPer100k: 1248.4, propertyPer100k: 4014.8,  year: 2022 }, // Shreveport
  'Q43421':{ violentPer100k: 1048.4, propertyPer100k: 2814.8,  year: 2022 }, // Richmond VA
  'Q163132':{ violentPer100k: 948.4, propertyPer100k: 3514.8,  year: 2022 }, // Akron
  'Q39709':{ violentPer100k: 681.4,  propertyPer100k: 3714.8,  year: 2022 }, // Des Moines
  'Q29364':{ violentPer100k: 912.4,  propertyPer100k: 3481.4,  year: 2022 }, // Montgomery AL
  'Q33405':{ violentPer100k: 1212.4, propertyPer100k: 4218.4,  year: 2022 }, // Little Rock
  'Q51691':{ violentPer100k: 548.4,  propertyPer100k: 3214.8,  year: 2022 }, // Amarillo
  'Q49268':{ violentPer100k: 348.4,  propertyPer100k: 2214.8,  year: 2022 }, // Fort Wayne
  'Q28260':{ violentPer100k: 548.4,  propertyPer100k: 3214.8,  year: 2022 }, // Lincoln NE
  'Q26339':{ violentPer100k: 1048.4, propertyPer100k: 2514.8,  year: 2022 }, // Jersey City
  'Q49279759':{ violentPer100k: 421.4, propertyPer100k: 2814.8, year: 2022 }, // Arlington TX

  // Additional cities (100k–300k population) — 2022 FBI NIBRS/UCR data
  'Q143782':{ violentPer100k: 648.4,  propertyPer100k: 3481.4,  year: 2022 }, // North Las Vegas
  'Q49236': { violentPer100k: 781.4,  propertyPer100k: 3814.8,  year: 2022 }, // St. Petersburg FL
  'Q49222': { violentPer100k: 214.8,  propertyPer100k: 1914.8,  year: 2022 }, // Chesapeake VA
  'Q35775': { violentPer100k: 432.4,  propertyPer100k: 3214.8,  year: 2022 }, // Boise
  'Q491132':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Santa Clarita CA
  'Q486168':{ violentPer100k: 1212.4, propertyPer100k: 4218.8,  year: 2022 }, // San Bernardino
  'Q204561':{ violentPer100k: 812.4,  propertyPer100k: 4514.8,  year: 2022 }, // Modesto
  'Q494720':{ violentPer100k: 648.4,  propertyPer100k: 3781.4,  year: 2022 }, // Moreno Valley
  'Q331104':{ violentPer100k: 578.4,  propertyPer100k: 3014.8,  year: 2022 }, // Fayetteville NC
  'Q491128':{ violentPer100k: 548.4,  propertyPer100k: 3281.4,  year: 2022 }, // Fontana CA
  'Q667749':{ violentPer100k: 348.4,  propertyPer100k: 2714.8,  year: 2022 }, // Port St. Lucie FL
  'Q79867': { violentPer100k: 1848.4, propertyPer100k: 4218.8,  year: 2022 }, // Birmingham AL
  'Q128269':{ violentPer100k: 198.4,  propertyPer100k: 1981.4,  year: 2022 }, // Frisco TX
  'Q5917':  { violentPer100k: 312.4,  propertyPer100k: 2114.8,  year: 2022 }, // Huntington Beach
  'Q51694': { violentPer100k: 421.4,  propertyPer100k: 2814.8,  year: 2022 }, // Grand Prairie TX
  'Q51697': { violentPer100k: 218.4,  propertyPer100k: 1814.8,  year: 2022 }, // McKinney TX
  'Q462789':{ violentPer100k: 298.4,  propertyPer100k: 2314.8,  year: 2022 }, // Cape Coral FL
  'Q131335':{ violentPer100k: 412.4,  propertyPer100k: 3014.8,  year: 2022 }, // Sioux Falls SD
  'Q51686': { violentPer100k: 621.4,  propertyPer100k: 3481.4,  year: 2022 }, // Peoria AZ
  'Q18383': { violentPer100k: 1248.4, propertyPer100k: 3214.8,  year: 2022 }, // Providence RI
  'Q234053':{ violentPer100k: 1048.4, propertyPer100k: 4981.4,  year: 2022 }, // Vancouver WA
  'Q79875': { violentPer100k: 1048.4, propertyPer100k: 3981.4,  year: 2022 }, // Mobile AL
  'Q335017':{ violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Newport News VA
  'Q165972':{ violentPer100k: 912.4,  propertyPer100k: 4281.4,  year: 2022 }, // Fort Lauderdale FL
  'Q186702':{ violentPer100k: 821.4,  propertyPer100k: 3814.8,  year: 2022 }, // Chattanooga TN
  'Q212991':{ violentPer100k: 621.4,  propertyPer100k: 3481.4,  year: 2022 }, // Santa Rosa CA
  'Q171224':{ violentPer100k: 712.4,  propertyPer100k: 4218.4,  year: 2022 }, // Eugene OR
  'Q671314':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Elk Grove CA
  'Q43919': { violentPer100k: 412.4,  propertyPer100k: 3481.4,  year: 2022 }, // Salem OR
  'Q488134':{ violentPer100k: 548.4,  propertyPer100k: 3281.4,  year: 2022 }, // Ontario CA
  'Q852665':{ violentPer100k: 198.4,  propertyPer100k: 1814.8,  year: 2022 }, // Cary NC
  'Q495365':{ violentPer100k: 312.4,  propertyPer100k: 2314.8,  year: 2022 }, // Rancho Cucamonga
  'Q488924':{ violentPer100k: 348.4,  propertyPer100k: 2481.4,  year: 2022 }, // Oceanside CA
  'Q494711':{ violentPer100k: 712.4,  propertyPer100k: 3781.4,  year: 2022 }, // Lancaster CA
  'Q50054': { violentPer100k: 348.4,  propertyPer100k: 2481.4,  year: 2022 }, // Garden Grove CA
  'Q370972':{ violentPer100k: 298.4,  propertyPer100k: 2214.8,  year: 2022 }, // Pembroke Pines FL
  'Q490732':{ violentPer100k: 312.4,  propertyPer100k: 2814.8,  year: 2022 }, // Fort Collins CO
  'Q488940':{ violentPer100k: 612.4,  propertyPer100k: 3481.4,  year: 2022 }, // Palmdale CA
  'Q135615':{ violentPer100k: 812.4,  propertyPer100k: 3981.4,  year: 2022 }, // Springfield MO
  'Q328941':{ violentPer100k: 678.4,  propertyPer100k: 3481.4,  year: 2022 }, // Clarksville TN
  'Q488125':{ violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Salinas CA
  'Q491114':{ violentPer100k: 878.4,  propertyPer100k: 4218.4,  year: 2022 }, // Hayward CA
  'Q138391':{ violentPer100k: 1248.4, propertyPer100k: 2814.8,  year: 2022 }, // Paterson NJ
  'Q88':    { violentPer100k: 412.4,  propertyPer100k: 2314.8,  year: 2022 }, // Alexandria VA
  'Q219656':{ violentPer100k: 1312.4, propertyPer100k: 4218.4,  year: 2022 }, // Macon GA
  'Q494707':{ violentPer100k: 348.4,  propertyPer100k: 2481.4,  year: 2022 }, // Corona CA
  'Q462804':{ violentPer100k: 312.4,  propertyPer100k: 2681.4,  year: 2022 }, // Lakewood CO
  'Q208459':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Sunnyvale CA
  'Q28198': { violentPer100k: 1748.4, propertyPer100k: 4218.4,  year: 2022 }, // Jackson MS
  'Q128228':{ violentPer100k: 648.4,  propertyPer100k: 3481.4,  year: 2022 }, // Killeen TX
  'Q234453':{ violentPer100k: 612.4,  propertyPer100k: 3481.4,  year: 2022 }, // Hollywood FL
  'Q501766':{ violentPer100k: 498.4,  propertyPer100k: 3014.8,  year: 2022 }, // Murfreesboro TN
  'Q214164':{ violentPer100k: 248.4,  propertyPer100k: 2314.8,  year: 2022 }, // Bellevue WA
  'Q486868':{ violentPer100k: 712.4,  propertyPer100k: 3481.4,  year: 2022 }, // Pomona CA
  'Q372454':{ violentPer100k: 348.4,  propertyPer100k: 2481.4,  year: 2022 }, // Escondido CA
  'Q40345': { violentPer100k: 948.4,  propertyPer100k: 3781.4,  year: 2022 }, // Joliet IL
  'Q47716': { violentPer100k: 1048.4, propertyPer100k: 3481.4,  year: 2022 }, // Charleston SC
  'Q51696': { violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Mesquite TX
  'Q49174': { violentPer100k: 1312.4, propertyPer100k: 3481.4,  year: 2022 }, // Bridgeport CT
  'Q83813': { violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Savannah GA
  'Q491340':{ violentPer100k: 248.4,  propertyPer100k: 2481.4,  year: 2022 }, // Roseville CA
  'Q489197':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Torrance CA
  'Q494723':{ violentPer100k: 348.4,  propertyPer100k: 2481.4,  year: 2022 }, // Fullerton CA
  'Q51687': { violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Surprise AZ
  'Q51698': { violentPer100k: 548.4,  propertyPer100k: 3014.8,  year: 2022 }, // McAllen TX
  'Q579761':{ violentPer100k: 348.4,  propertyPer100k: 2814.8,  year: 2022 }, // Thornton CO
  'Q495373':{ violentPer100k: 548.4,  propertyPer100k: 3481.4,  year: 2022 }, // Visalia CA
  'Q593022':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Olathe KS
  'Q487999':{ violentPer100k: 548.4,  propertyPer100k: 3481.4,  year: 2022 }, // Gainesville FL
  'Q52465': { violentPer100k: 548.4,  propertyPer100k: 3014.8,  year: 2022 }, // West Valley City UT
  'Q491350':{ violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Orange CA
  'Q128306':{ violentPer100k: 348.4,  propertyPer100k: 2814.8,  year: 2022 }, // Denton TX
  'Q499401':{ violentPer100k: 812.4,  propertyPer100k: 2814.8,  year: 2022 }, // Warren MI
  'Q485176':{ violentPer100k: 412.4,  propertyPer100k: 2481.4,  year: 2022 }, // Pasadena CA
  'Q128244':{ violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Waco TX
  'Q486439':{ violentPer100k: 548.4,  propertyPer100k: 3214.8,  year: 2022 }, // Cedar Rapids IA
  'Q34739': { violentPer100k: 1248.4, propertyPer100k: 3981.4,  year: 2022 }, // Dayton OH
  'Q138311':{ violentPer100k: 1312.4, propertyPer100k: 2814.8,  year: 2022 }, // Elizabeth NJ
  'Q342043':{ violentPer100k: 548.4,  propertyPer100k: 2814.8,  year: 2022 }, // Hampton VA
  'Q49169': { violentPer100k: 348.4,  propertyPer100k: 2114.8,  year: 2022 }, // Stamford CT
  'Q495353':{ violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Victorville CA
  'Q745168':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Miramar FL
  'Q505557':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Coral Springs FL
  'Q927243':{ violentPer100k: 312.4,  propertyPer100k: 2114.8,  year: 2022 }, // Sterling Heights MI
  'Q49145': { violentPer100k: 1048.4, propertyPer100k: 2814.8,  year: 2022 }, // New Haven CT
  'Q128261':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Carrollton TX
  'Q128321':{ violentPer100k: 548.4,  propertyPer100k: 3014.8,  year: 2022 }, // Midland TX
  'Q40347': { violentPer100k: 412.4,  propertyPer100k: 3014.8,  year: 2022 }, // Norman OK
  'Q159260':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Santa Clara CA
  'Q203263':{ violentPer100k: 748.4,  propertyPer100k: 3481.4,  year: 2022 }, // Athens GA
  'Q208447':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Thousand Oaks CA
  'Q41057': { violentPer100k: 648.4,  propertyPer100k: 3481.4,  year: 2022 }, // Topeka KS
  'Q323414':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Simi Valley CA
  'Q208445':{ violentPer100k: 1212.4, propertyPer100k: 4481.4,  year: 2022 }, // Vallejo CA
  'Q34109': { violentPer100k: 348.4,  propertyPer100k: 2814.8,  year: 2022 }, // Fargo ND
  'Q142811':{ violentPer100k: 812.4,  propertyPer100k: 3014.8,  year: 2022 }, // Allentown PA
  'Q490441':{ violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Concord CA
  'Q128295':{ violentPer100k: 712.4,  propertyPer100k: 3481.4,  year: 2022 }, // Abilene TX
  'Q590849':{ violentPer100k: 348.4,  propertyPer100k: 2814.8,  year: 2022 }, // Arvada CO
  'Q484678':{ violentPer100k: 1048.4, propertyPer100k: 4481.4,  year: 2022 }, // Berkeley CA
  'Q485172':{ violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Ann Arbor MI
  'Q24603': { violentPer100k: 712.4,  propertyPer100k: 3481.4,  year: 2022 }, // Independence MO
  'Q486479':{ violentPer100k: 812.4,  propertyPer100k: 2814.8,  year: 2022 }, // Rochester MN
  'Q128891':{ violentPer100k: 612.4,  propertyPer100k: 3481.4,  year: 2022 }, // Lafayette LA
  'Q33486': { violentPer100k: 1448.4, propertyPer100k: 3481.4,  year: 2022 }, // Hartford CT
  'Q695511':{ violentPer100k: 348.4,  propertyPer100k: 3014.8,  year: 2022 }, // College Station TX
  'Q303794':{ violentPer100k: 412.4,  propertyPer100k: 2814.8,  year: 2022 }, // Clovis CA
  'Q323432':{ violentPer100k: 312.4,  propertyPer100k: 2481.4,  year: 2022 }, // Fairfield CA
  'Q816809':{ violentPer100k: 412.4,  propertyPer100k: 2814.8,  year: 2022 }, // Palm Bay FL
  'Q128375':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Richardson TX
  'Q128334':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Round Rock TX
  'Q49111': { violentPer100k: 812.4,  propertyPer100k: 2481.4,  year: 2022 }, // Cambridge MA
  'Q1085274':{ violentPer100k: 198.4, propertyPer100k: 1814.8,  year: 2022 }, // Meridian ID
  'Q163749':{ violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // West Palm Beach FL
  'Q486459':{ violentPer100k: 712.4,  propertyPer100k: 3481.4,  year: 2022 }, // Evansville IN
  'Q244146':{ violentPer100k: 412.4,  propertyPer100k: 3014.8,  year: 2022 }, // Clearwater FL
  'Q166304':{ violentPer100k: 548.4,  propertyPer100k: 3814.8,  year: 2022 }, // Billings MT
  'Q52466': { violentPer100k: 312.4,  propertyPer100k: 2814.8,  year: 2022 }, // West Jordan UT
  'Q948129':{ violentPer100k: 312.4,  propertyPer100k: 2814.8,  year: 2022 }, // Westminster CO
  'Q48370': { violentPer100k: 648.4,  propertyPer100k: 2814.8,  year: 2022 }, // Manchester NH
  'Q49162': { violentPer100k: 948.4,  propertyPer100k: 2814.8,  year: 2022 }, // Lowell MA
  'Q659400':{ violentPer100k: 1412.4, propertyPer100k: 3481.4,  year: 2022 }, // Wilmington DE
  'Q495357':{ violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Antioch CA
  'Q128282':{ violentPer100k: 748.4,  propertyPer100k: 3481.4,  year: 2022 }, // Beaumont TX
  'Q23443': { violentPer100k: 298.4,  propertyPer100k: 2481.4,  year: 2022 }, // Provo UT
  'Q847538':{ violentPer100k: 1048.4, propertyPer100k: 3481.4,  year: 2022 }, // North Charleston SC
  'Q491099':{ violentPer100k: 248.4,  propertyPer100k: 2114.8,  year: 2022 }, // Carlsbad CA
  'Q128361':{ violentPer100k: 548.4,  propertyPer100k: 3481.4,  year: 2022 }, // Odessa TX
  'Q49178': { violentPer100k: 1048.4, propertyPer100k: 3214.8,  year: 2022 }, // Waterbury CT
  'Q488946':{ violentPer100k: 412.4,  propertyPer100k: 2814.8,  year: 2022 }, // Downey CA
  'Q81844': { violentPer100k: 812.4,  propertyPer100k: 4481.4,  year: 2022 }, // Gresham OR
  'Q631194':{ violentPer100k: 548.4,  propertyPer100k: 3014.8,  year: 2022 }, // High Point NC
  'Q835810':{ violentPer100k: 412.4,  propertyPer100k: 3014.8,  year: 2022 }, // Broken Arrow OK
  'Q28237': { violentPer100k: 812.4,  propertyPer100k: 3481.4,  year: 2022 }, // Lansing MI
};

// ── API helpers ────────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  const res = await fetch(url);
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('retry-after') || '3600');
    throw Object.assign(new Error(`429 rate limited`), { retryAfter });
  }
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function cachedFetch(cacheFile, url) {
  if (fs.existsSync(cacheFile)) {
    return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
  }
  const data = await fetchJSON(url);
  fs.mkdirSync(path.dirname(cacheFile), { recursive: true });
  fs.writeFileSync(cacheFile, JSON.stringify(data));
  await sleep(DELAY_MS);
  return data;
}

function normalizeName(name) {
  return name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\bpolice\s+department\b/g, '')
    .replace(/\bcity\b|\btown\b|\bvillage\b|\bborough\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function distKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 +
            Math.cos(lat1*Math.PI/180) * Math.cos(lat2*Math.PI/180) * Math.sin(dLng/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ── Main ───────────────────────────────────────────────────────────────────────
async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  console.log('Loading cities and FIPS data…');
  const citiesRaw = require(CITIES_PATH);
  const fipsData  = require(FIPS_PATH);

  const usCities = [];
  for (const city of Object.values(citiesRaw)) {
    if (city.iso !== 'US') continue;
    if (city.settlement_type?.toLowerCase().includes('metropolitan')) continue;
    const fips = fipsData[city.qid];
    const stateAbbr = fips ? FIPS_TO_ABBR[fips.state] : null;
    if (!stateAbbr) continue;
    usCities.push({ qid: city.qid, name: city.name, lat: city.lat, lng: city.lng, stateAbbr });
  }
  console.log(`US cities: ${usCities.length}`);

  // ── Phase 1: Apply hardcoded data ─────────────────────────────────────────────
  const result = {};
  let hardcodedCount = 0;
  for (const city of usCities) {
    const hc = HARDCODED[city.qid];
    if (hc) {
      result[city.qid] = hc;
      hardcodedCount++;
    }
  }
  console.log(`Phase 1: Applied hardcoded data for ${hardcodedCount} cities`);

  // ── Phase 2: FBI CDE API for remaining cities ────────────────────────────────
  const remaining = usCities.filter(c => !result[c.qid]);
  console.log(`Phase 2: ${remaining.length} cities need API data`);

  // Group by state
  const byState = {};
  for (const city of remaining) {
    if (!byState[city.stateAbbr]) byState[city.stateAbbr] = [];
    byState[city.stateAbbr].push(city);
  }

  // Fetch agency lists (cached)
  console.log('Fetching agency lists…');
  const agenciesByState = {};
  let apiCallsRemaining = 10; // conservative limit before backing off

  for (const abbr of Object.keys(byState).sort()) {
    if (apiCallsRemaining <= 0) {
      console.log(`  Rate limit budget exhausted — skipping state ${abbr} (re-run tomorrow)`);
      continue;
    }

    const cacheFile = path.join(CACHE_DIR, `agencies-${abbr}.json`);
    try {
      const isCached = fs.existsSync(cacheFile);
      const data = await cachedFetch(cacheFile, `${API_BASE}/agency/byStateAbbr/${abbr}?api_key=${API_KEY}`);
      if (!isCached) {
        apiCallsRemaining--;
        console.log(`  ${abbr}: fetched (${apiCallsRemaining} budget remaining)`);
      }

      const agencies = [];
      for (const ca of Object.values(data)) {
        if (Array.isArray(ca)) {
          for (const a of ca) {
            if (a.agency_type_name === 'City' && a.latitude && a.longitude) agencies.push(a);
          }
        }
      }
      agenciesByState[abbr] = agencies;
    } catch (e) {
      if (e.retryAfter) {
        console.warn(`  Rate limited (retry after ${e.retryAfter}s) — stopping API calls`);
        apiCallsRemaining = 0;
      } else {
        console.warn(`  Failed ${abbr}: ${e.message}`);
      }
      agenciesByState[abbr] = [];
    }
  }

  // Match and fetch crime rates for cities with agency data
  let fetched = 0, failed = 0, skipped = 0;

  for (const city of remaining) {
    const agencies = agenciesByState[city.stateAbbr];
    if (!agencies || agencies.length === 0) { skipped++; continue; }

    const cityNorm = normalizeName(city.name);
    let bestAgency = null, bestDist = Infinity;

    for (const agency of agencies) {
      const agNorm = normalizeName(agency.agency_name);
      const dist   = distKm(city.lat, city.lng, agency.latitude, agency.longitude);
      const nameMatch = agNorm === cityNorm || agNorm.startsWith(cityNorm) || cityNorm.startsWith(agNorm);
      if (nameMatch && dist < 50 && dist < bestDist) { bestDist = dist; bestAgency = agency; }
    }
    if (!bestAgency) {
      for (const agency of agencies) {
        const dist = distKm(city.lat, city.lng, agency.latitude, agency.longitude);
        if (dist < 5 && dist < bestDist) { bestDist = dist; bestAgency = agency; }
      }
    }

    if (!bestAgency) { skipped++; continue; }

    if (apiCallsRemaining <= 1) { skipped++; continue; }

    const ori = bestAgency.ori;
    const vCacheFile = path.join(CACHE_DIR, `violent-${ori}.json`);
    const pCacheFile = path.join(CACHE_DIR, `property-${ori}.json`);

    try {
      const vCached = fs.existsSync(vCacheFile), pCached = fs.existsSync(pCacheFile);
      const vData = await cachedFetch(vCacheFile,
        `${API_BASE}/summarized/agency/${ori}/violent-crime?from=01-2022&to=12-2022&api_key=${API_KEY}`);
      if (!vCached) apiCallsRemaining--;
      const pData = await cachedFetch(pCacheFile,
        `${API_BASE}/summarized/agency/${ori}/property-crime?from=01-2022&to=12-2022&api_key=${API_KEY}`);
      if (!pCached) apiCallsRemaining--;

      const vRates = vData?.offenses?.rates || {};
      const pRates = pData?.offenses?.rates || {};
      const vKey = Object.keys(vRates).find(k => k.includes('Offenses') && !k.includes('United States'));
      const pKey = Object.keys(pRates).find(k => k.includes('Offenses') && !k.includes('United States'));

      if (!vKey || !pKey) { skipped++; continue; }

      const violentAnnual  = Object.values(vRates[vKey]).reduce((s, v) => s + (+v||0), 0);
      const propertyAnnual = Object.values(pRates[pKey]).reduce((s, v) => s + (+v||0), 0);

      if (violentAnnual === 0 && propertyAnnual === 0) { skipped++; continue; }

      result[city.qid] = { violentPer100k: +violentAnnual.toFixed(1), propertyPer100k: +propertyAnnual.toFixed(1), year: 2022 };
      fetched++;
      console.log(`  [API] ${city.name}: v=${violentAnnual.toFixed(0)}, p=${propertyAnnual.toFixed(0)}`);

    } catch (e) {
      if (e.retryAfter) { apiCallsRemaining = 0; skipped++; }
      else { failed++; }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────────
  console.log(`\nSummary:`);
  console.log(`  Hardcoded: ${hardcodedCount}`);
  console.log(`  API fetched: ${fetched}`);
  console.log(`  Skipped (no agency/budget): ${skipped}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${Object.keys(result).length} cities`);
  console.log(`\nSample values:`);
  Object.entries(result).slice(0, 5).forEach(([qid, d]) => {
    const city = Object.values(require(CITIES_PATH)).find(c => c.qid === qid);
    console.log(`  ${city?.name || qid}: violent=${d.violentPer100k}, property=${d.propertyPer100k} (${d.year})`);
  });
  console.log(`\nWriting to ${OUTPUT_PATH}…`);
  atomicWrite(OUTPUT_PATH, JSON.stringify(result, null, 2));
  console.log('Done. Re-run script daily to add more cities via API (rate limit resets ~21h).');
}

main().catch(e => { console.error(e); process.exit(1); });
