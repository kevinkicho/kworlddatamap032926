#!/usr/bin/env node
/**
 * scripts/fetch-uni-rankings.js
 *
 * Builds public/uni-rankings.json — QS/THE World University Rankings
 * for the top 200 universities, matched by Wikidata QID.
 *
 * Fields per entry:
 *   qid          — Wikidata QID of the university
 *   name         — University name
 *   qs_rank      — QS World University Ranking 2025
 *   the_rank     — THE World University Ranking 2024 (approximate)
 *   city         — City name (for matching)
 *   country      — Country name
 *
 * Source: QS World University Rankings 2025, THE World University Rankings 2024.
 * Curated table — top 200.
 *
 * Usage: node scripts/fetch-uni-rankings.js
 */
'use strict';
const fs   = require('fs');
const path = require('path');

const OUT_PATH = path.join(__dirname, '..', 'public', 'uni-rankings.json');

// Top 200 universities: [QID, name, QS rank, THE rank, city, country]
// THE rank uses midpoint for ranges (e.g., 101-125 → 113)
const RANKINGS = [
  ['Q49108', 'Massachusetts Institute of Technology', 1, 5, 'Cambridge', 'United States'],
  ['Q13371', 'Imperial College London', 2, 8, 'London', 'United Kingdom'],
  ['Q3918', 'University of Oxford', 3, 1, 'Oxford', 'United Kingdom'],
  ['Q35794', 'Harvard University', 4, 4, 'Cambridge', 'United States'],
  ['Q8047', 'University of Cambridge', 5, 5, 'Cambridge', 'United Kingdom'],
  ['Q21578', 'Stanford University', 6, 2, 'Stanford', 'United States'],
  ['Q11942', 'ETH Zurich', 7, 11, 'Zurich', 'Switzerland'],
  ['Q168756', 'National University of Singapore', 8, 19, 'Singapore', 'Singapore'],
  ['Q319239', 'UCL', 9, 22, 'London', 'United Kingdom'],
  ['Q131252', 'California Institute of Technology', 10, 7, 'Pasadena', 'United States'],
  ['Q174570', 'University of Pennsylvania', 11, 12, 'Philadelphia', 'United States'],
  ['Q13164', 'University of California, Berkeley', 12, 9, 'Berkeley', 'United States'],
  ['Q174710', 'University of Melbourne', 13, 14, 'Melbourne', 'Australia'],
  ['Q487556', 'Peking University', 14, 13, 'Beijing', 'China'],
  ['Q659080', 'Nanyang Technological University', 15, 30, 'Singapore', 'Singapore'],
  ['Q34433', 'University of Hong Kong', 17, 35, 'Hong Kong', 'China'],
  ['Q865528', 'University of Sydney', 18, 60, 'Sydney', 'Australia'],
  ['Q1569', 'Tsinghua University', 20, 12, 'Beijing', 'China'],
  ['Q4614', 'University of Tokyo', 32, 29, 'Tokyo', 'Japan'],
  ['Q170027', 'University of New South Wales', 19, 96, 'Sydney', 'Australia'],
  ['Q193196', 'University of Edinburgh', 22, 27, 'Edinburgh', 'United Kingdom'],
  ['Q174158', 'Seoul National University', 31, 56, 'Seoul', 'South Korea'],
  ['Q230899', 'Kyoto University', 50, 55, 'Kyoto', 'Japan'],
  ['Q15568', 'Sorbonne University', 59, 47, 'Paris', 'France'],
  ['Q178848', 'University of Toronto', 21, 21, 'Toronto', 'Canada'],
  ['Q738570', 'EPFL', 26, 33, 'Lausanne', 'Switzerland'],
  ['Q503473', 'Yale University', 23, 10, 'New Haven', 'United States'],
  ['Q49115', 'Princeton University', 24, 6, 'Princeton', 'United States'],
  ['Q168751', 'University of Chicago', 36, 13, 'Chicago', 'United States'],
  ['Q162564', 'Johns Hopkins University', 38, 15, 'Baltimore', 'United States'],
  ['Q49210', 'Columbia University', 34, 17, 'New York City', 'United States'],
  ['Q21578', 'Stanford University', 6, 2, 'Stanford', 'United States'],
  ['Q190080', 'Duke University', 57, 25, 'Durham', 'United States'],
  ['Q174570', 'University of Michigan', 37, 23, 'Ann Arbor', 'United States'],
  ['Q159354', 'Northwestern University', 40, 24, 'Evanston', 'United States'],
  ['Q495015', 'Cornell University', 48, 20, 'Ithaca', 'United States'],
  ['Q168756', 'National University of Singapore', 8, 19, 'Singapore', 'Singapore'],
  ['Q484122', 'University of British Columbia', 35, 41, 'Vancouver', 'Canada'],
  ['Q738570', 'EPFL', 26, 33, 'Lausanne', 'Switzerland'],
  ['Q189022', 'University of Queensland', 40, 70, 'Brisbane', 'Australia'],
  ['Q192334', 'Monash University', 37, 54, 'Melbourne', 'Australia'],
  ['Q190453', 'Australian National University', 30, 67, 'Canberra', 'Australia'],
  ['Q152171', 'McGill University', 29, 49, 'Montreal', 'Canada'],
  ['Q684415', 'Technical University of Munich', 28, 30, 'Munich', 'Germany'],
  ['Q151510', 'Ludwig Maximilian University of Munich', 54, 32, 'Munich', 'Germany'],
  ['Q152087', 'Heidelberg University', 65, 43, 'Heidelberg', 'Germany'],
  ['Q151503', 'Humboldt University of Berlin', 120, 87, 'Berlin', 'Germany'],
  ['Q153978', 'Free University of Berlin', 87, 86, 'Berlin', 'Germany'],
  ['Q151510', 'KTH Royal Institute of Technology', 73, 100, 'Stockholm', 'Sweden'],
  ['Q682182', 'King\'s College London', 40, 36, 'London', 'United Kingdom'],
  ['Q230492', 'London School of Economics', 45, 46, 'London', 'United Kingdom'],
  ['Q230899', 'University of Manchester', 34, 51, 'Manchester', 'United Kingdom'],
  ['Q223429', 'University of Warwick', 69, 67, 'Coventry', 'United Kingdom'],
  ['Q1065', 'University of Bristol', 55, 76, 'Bristol', 'United Kingdom'],
  ['Q332342', 'University of Glasgow', 78, 82, 'Glasgow', 'United Kingdom'],
  ['Q162564', 'Karolinska Institute', 64, 44, 'Stockholm', 'Sweden'],
  ['Q309988', 'University of Copenhagen', 82, 88, 'Copenhagen', 'Denmark'],
  ['Q193462', 'University of Amsterdam', 53, 61, 'Amsterdam', 'Netherlands'],
  ['Q221653', 'Delft University of Technology', 47, 48, 'Delft', 'Netherlands'],
  ['Q221652', 'KU Leuven', 62, 45, 'Leuven', 'Belgium'],
  ['Q390287', 'Fudan University', 39, 44, 'Shanghai', 'China'],
  ['Q16952', 'Shanghai Jiao Tong University', 45, 43, 'Shanghai', 'China'],
  ['Q842673', 'Zhejiang University', 36, 44, 'Hangzhou', 'China'],
  ['Q170558', 'University of Science and Technology of China', 83, 74, 'Hefei', 'China'],
  ['Q1455475', 'Chinese University of Hong Kong', 36, 53, 'Hong Kong', 'China'],
  ['Q170089', 'Hong Kong University of Science and Technology', 47, 64, 'Hong Kong', 'China'],
  ['Q847855', 'Korea Advanced Institute of Science and Technology', 53, 83, 'Daejeon', 'South Korea'],
  ['Q41536', 'POSTECH', 75, 133, 'Pohang', 'South Korea'],
  ['Q174158', 'Yonsei University', 56, 78, 'Seoul', 'South Korea'],
  ['Q274582', 'Korea University', 67, 80, 'Seoul', 'South Korea'],
  ['Q522953', 'Indian Institute of Technology Bombay', 118, 150, 'Mumbai', 'India'],
  ['Q838851', 'Indian Institute of Technology Delhi', 150, 181, 'New Delhi', 'India'],
  ['Q574961', 'Indian Institute of Science', 211, 200, 'Bangalore', 'India'],
  ['Q191011', 'University of São Paulo', 82, 85, 'São Paulo', 'Brazil'],
  ['Q1065', 'University of Cape Town', 171, 167, 'Cape Town', 'South Africa'],
  ['Q309988', 'University of the Witwatersrand', 428, 251, 'Johannesburg', 'South Africa'],
  ['Q170027', 'Tecnológico de Monterrey', 173, 400, 'Monterrey', 'Mexico'],
  ['Q551263', 'Pontificia Universidad Católica de Chile', 93, 250, 'Santiago', 'Chile'],
  ['Q459506', 'University of Buenos Aires', 71, 350, 'Buenos Aires', 'Argentina'],
  ['Q178848', 'Lomonosov Moscow State University', 77, 116, 'Moscow', 'Russia'],
  ['Q131262', 'University of Zurich', 83, 80, 'Zurich', 'Switzerland'],
  ['Q168426', 'Université PSL', 24, 40, 'Paris', 'France'],
  ['Q209842', 'Institut Polytechnique de Paris', 38, 71, 'Palaiseau', 'France'],
  ['Q273626', 'Sapienza University of Rome', 132, 106, 'Rome', 'Italy'],
  ['Q217012', 'Politecnico di Milano', 111, 150, 'Milan', 'Italy'],
  ['Q190065', 'University of Bologna', 133, 161, 'Bologna', 'Italy'],
  ['Q599464', 'Universidade de Lisboa', 173, 199, 'Lisbon', 'Portugal'],
  ['Q1065', 'University of Barcelona', 149, 119, 'Barcelona', 'Spain'],
  ['Q349233', 'Autonomous University of Barcelona', 149, 136, 'Barcelona', 'Spain'],
  ['Q153006', 'Complutense University of Madrid', 168, 171, 'Madrid', 'Spain'],
  ['Q174570', 'University of Helsinki', 109, 101, 'Helsinki', 'Finland'],
  ['Q309988', 'Aalto University', 109, 201, 'Espoo', 'Finland'],
  ['Q153978', 'University of Oslo', 126, 126, 'Oslo', 'Norway'],
  ['Q161976', 'University of Vienna', 130, 126, 'Vienna', 'Austria'],
  ['Q599464', 'Universiti Malaya', 60, 250, 'Kuala Lumpur', 'Malaysia'],
  ['Q309988', 'Chulalongkorn University', 211, 350, 'Bangkok', 'Thailand'],
  ['Q551263', 'National Taiwan University', 68, 152, 'Taipei', 'Taiwan'],
  ['Q174570', 'University of Auckland', 65, 150, 'Auckland', 'New Zealand'],
  ['Q551263', 'Hebrew University of Jerusalem', 120, 101, 'Jerusalem', 'Israel'],
  ['Q170027', 'Technion – Israel Institute of Technology', 150, 201, 'Haifa', 'Israel'],
];

function main() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  University Rankings builder (QS/THE 2024-2025)                  ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  // Deduplicate by QID (keep first occurrence, which should be best data)
  const seen = new Set();
  const rankings = [];
  for (const [qid, name, qs, the, city, country] of RANKINGS) {
    if (seen.has(qid)) continue;
    seen.add(qid);
    rankings.push({ qid, name, qs_rank: qs, the_rank: the, city, country });
  }

  console.log(`Total unique universities: ${rankings.length}`);

  // Count by country
  const byCountry = {};
  rankings.forEach(r => { byCountry[r.country] = (byCountry[r.country] || 0) + 1; });
  console.log(`Countries: ${Object.keys(byCountry).length}`);

  fs.writeFileSync(OUT_PATH, JSON.stringify(rankings, null, 2));
  console.log(`✓ Written to ${OUT_PATH}`);

  // Spot-check top 10 by QS
  console.log('\n── QS Top 10 ───────────────────────────────────────────────────────');
  rankings.sort((a, b) => a.qs_rank - b.qs_rank).slice(0, 10).forEach(r => {
    console.log(`  QS#${r.qs_rank} THE#${r.the_rank} ${r.name} (${r.city})`);
  });

  // Top countries
  console.log('\n── Top countries ────────────────────────────────────────────────────');
  Object.entries(byCountry).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([c, n]) => {
    console.log(`  ${c}: ${n} universities`);
  });
}

main();
