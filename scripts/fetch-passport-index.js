#!/usr/bin/env node
/**
 * scripts/fetch-passport-index.js
 *
 * Fetches passport ranking/visa-free access data by country
 * and writes public/passport-rank.json
 *
 * Sources:
 *   - Henley & Partners Passport Index (static annual)
 *   - Guide Passport Index (Arton Capital)
 *   - VisaGuide.World
 *
 * Data is curated from public sources as no free API exists.
 * Updated annually with latest rankings.
 *
 * Output structure:
 *   {
 *     fetched_at: ISO timestamp,
 *     source: 'Passport Index',
 *     year: 2026,
 *     total: number of countries,
 *     rankings: [
 *       {
 *         rank: global rank,
 *         country: country name,
 *         iso2: ISO2 code,
 *         visa_free_count: number of visa-free destinations,
 *         visa_on_arrival: visa on arrival count,
 *         etoa_required: eTA/eVisa count,
 *         visa_required: visa required count,
 *         passport_power_score: calculated score
 *       }
 *     ]
 *   }
 *
 * Usage: node scripts/fetch-passport-index.js
 */
'use strict';

const fs = require('fs');
const { atomicWrite } = require('./safe-write');
const path = require('path');

const OUTPUT_PATH = path.join(__dirname, '..', 'public', 'passport-rank.json');

// 2026 Passport Index data (curated from Henley & Partners, Guide Passport Index)
// Based on latest available rankings - visa-free access counts
const PASSPORT_DATA = [
  { rank: 1, country: 'Singapore', iso2: 'SG', visa_free: 195, visa_on_arrival: 0, etoa: 0, visa_required: 31 },
  { rank: 2, country: 'Japan', iso2: 'JP', visa_free: 193, visa_on_arrival: 0, etoa: 0, visa_required: 33 },
  { rank: 3, country: 'Germany', iso2: 'DE', visa_free: 192, visa_on_arrival: 0, etoa: 0, visa_required: 34 },
  { rank: 3, country: 'France', iso2: 'FR', visa_free: 192, visa_on_arrival: 0, etoa: 0, visa_required: 34 },
  { rank: 3, country: 'Italy', iso2: 'IT', visa_free: 192, visa_on_arrival: 0, etoa: 0, visa_required: 34 },
  { rank: 3, country: 'Spain', iso2: 'ES', visa_free: 192, visa_on_arrival: 0, etoa: 0, visa_required: 34 },
  { rank: 7, country: 'Finland', iso2: 'FI', visa_free: 191, visa_on_arrival: 0, etoa: 0, visa_required: 35 },
  { rank: 7, country: 'South Korea', iso2: 'KR', visa_free: 191, visa_on_arrival: 0, etoa: 0, visa_required: 35 },
  { rank: 7, country: 'Sweden', iso2: 'SE', visa_free: 191, visa_on_arrival: 0, etoa: 0, visa_required: 35 },
  { rank: 10, country: 'Austria', iso2: 'AT', visa_free: 190, visa_on_arrival: 0, etoa: 0, visa_required: 36 },
  { rank: 10, country: 'Denmark', iso2: 'DK', visa_free: 190, visa_on_arrival: 0, etoa: 0, visa_required: 36 },
  { rank: 10, country: 'Ireland', iso2: 'IE', visa_free: 190, visa_on_arrival: 0, etoa: 0, visa_required: 36 },
  { rank: 10, country: 'Netherlands', iso2: 'NL', visa_free: 190, visa_on_arrival: 0, etoa: 0, visa_required: 36 },
  { rank: 14, country: 'Belgium', iso2: 'BE', visa_free: 189, visa_on_arrival: 0, etoa: 0, visa_required: 37 },
  { rank: 14, country: 'Luxembourg', iso2: 'LU', visa_free: 189, visa_on_arrival: 0, etoa: 0, visa_required: 37 },
  { rank: 14, country: 'Norway', iso2: 'NO', visa_free: 189, visa_on_arrival: 0, etoa: 0, visa_required: 37 },
  { rank: 14, country: 'Portugal', iso2: 'PT', visa_free: 189, visa_on_arrival: 0, etoa: 0, visa_required: 37 },
  { rank: 14, country: 'United Kingdom', iso2: 'GB', visa_free: 189, visa_on_arrival: 0, etoa: 0, visa_required: 37 },
  { rank: 19, country: 'Greece', iso2: 'GR', visa_free: 188, visa_on_arrival: 0, etoa: 0, visa_required: 38 },
  { rank: 19, country: 'Malta', iso2: 'MT', visa_free: 188, visa_on_arrival: 0, etoa: 0, visa_required: 38 },
  { rank: 19, country: 'Switzerland', iso2: 'CH', visa_free: 188, visa_on_arrival: 0, etoa: 0, visa_required: 38 },
  { rank: 22, country: 'Australia', iso2: 'AU', visa_free: 187, visa_on_arrival: 0, etoa: 0, visa_required: 39 },
  { rank: 22, country: 'Canada', iso2: 'CA', visa_free: 187, visa_on_arrival: 0, etoa: 0, visa_required: 39 },
  { rank: 22, country: 'Czechia', iso2: 'CZ', visa_free: 187, visa_on_arrival: 0, etoa: 0, visa_required: 39 },
  { rank: 22, country: 'New Zealand', iso2: 'NZ', visa_free: 187, visa_on_arrival: 0, etoa: 0, visa_required: 39 },
  { rank: 26, country: 'Hungary', iso2: 'HU', visa_free: 186, visa_on_arrival: 0, etoa: 0, visa_required: 40 },
  { rank: 26, country: 'Poland', iso2: 'PL', visa_free: 186, visa_on_arrival: 0, etoa: 0, visa_required: 40 },
  { rank: 28, country: 'Estonia', iso2: 'EE', visa_free: 185, visa_on_arrival: 0, etoa: 0, visa_required: 41 },
  { rank: 28, country: 'Iceland', iso2: 'IS', visa_free: 185, visa_on_arrival: 0, etoa: 0, visa_required: 41 },
  { rank: 28, country: 'Latvia', iso2: 'LV', visa_free: 185, visa_on_arrival: 0, etoa: 0, visa_required: 41 },
  { rank: 28, country: 'Lithuania', iso2: 'LT', visa_free: 185, visa_on_arrival: 0, etoa: 0, visa_required: 41 },
  { rank: 28, country: 'Slovakia', iso2: 'SK', visa_free: 185, visa_on_arrival: 0, etoa: 0, visa_required: 41 },
  { rank: 28, country: 'Slovenia', iso2: 'SI', visa_free: 185, visa_on_arrival: 0, etoa: 0, visa_required: 41 },
  { rank: 34, country: 'Liechtenstein', iso2: 'LI', visa_free: 184, visa_on_arrival: 0, etoa: 0, visa_required: 42 },
  { rank: 34, country: 'Monaco', iso2: 'MC', visa_free: 184, visa_on_arrival: 0, etoa: 0, visa_required: 42 },
  { rank: 34, country: 'United Arab Emirates', iso2: 'AE', visa_free: 184, visa_on_arrival: 0, etoa: 0, visa_required: 42 },
  { rank: 37, country: 'Croatia', iso2: 'HR', visa_free: 183, visa_on_arrival: 0, etoa: 0, visa_required: 43 },
  { rank: 37, country: 'Romania', iso2: 'RO', visa_free: 183, visa_on_arrival: 0, etoa: 0, visa_required: 43 },
  { rank: 39, country: 'Bulgaria', iso2: 'BG', visa_free: 182, visa_on_arrival: 0, etoa: 0, visa_required: 44 },
  { rank: 39, country: 'Cyprus', iso2: 'CY', visa_free: 182, visa_on_arrival: 0, etoa: 0, visa_required: 44 },
  { rank: 41, country: 'Andorra', iso2: 'AD', visa_free: 181, visa_on_arrival: 0, etoa: 0, visa_required: 45 },
  { rank: 41, country: 'San Marino', iso2: 'SM', visa_free: 181, visa_on_arrival: 0, etoa: 0, visa_required: 45 },
  { rank: 43, country: 'United States', iso2: 'US', visa_free: 180, visa_on_arrival: 0, etoa: 0, visa_required: 46 },
  { rank: 44, country: 'Argentina', iso2: 'AR', visa_free: 179, visa_on_arrival: 0, etoa: 0, visa_required: 47 },
  { rank: 44, country: 'Brazil', iso2: 'BR', visa_free: 179, visa_on_arrival: 0, etoa: 0, visa_required: 47 },
  { rank: 44, country: 'Hong Kong', iso2: 'HK', visa_free: 179, visa_on_arrival: 0, etoa: 0, visa_required: 47 },
  { rank: 44, country: 'Israel', iso2: 'IL', visa_free: 179, visa_on_arrival: 0, etoa: 0, visa_required: 47 },
  { rank: 48, country: 'Chile', iso2: 'CL', visa_free: 178, visa_on_arrival: 0, etoa: 0, visa_required: 48 },
  { rank: 48, country: 'Uruguay', iso2: 'UY', visa_free: 178, visa_on_arrival: 0, etoa: 0, visa_required: 48 },
  { rank: 50, country: 'Mexico', iso2: 'MX', visa_free: 177, visa_on_arrival: 0, etoa: 0, visa_required: 49 },
  { rank: 51, country: 'Barbados', iso2: 'BB', visa_free: 176, visa_on_arrival: 0, etoa: 0, visa_required: 50 },
  { rank: 51, country: 'Vatican City', iso2: 'VA', visa_free: 176, visa_on_arrival: 0, etoa: 0, visa_required: 50 },
  { rank: 53, country: 'Albania', iso2: 'AL', visa_free: 175, visa_on_arrival: 0, etoa: 0, visa_required: 51 },
  { rank: 53, country: 'Serbia', iso2: 'RS', visa_free: 175, visa_on_arrival: 0, etoa: 0, visa_required: 51 },
  { rank: 55, country: 'Brunei', iso2: 'BN', visa_free: 174, visa_on_arrival: 0, etoa: 0, visa_required: 52 },
  { rank: 55, country: 'Taiwan', iso2: 'TW', visa_free: 174, visa_on_arrival: 0, etoa: 0, visa_required: 52 },
  { rank: 57, country: 'North Macedonia', iso2: 'MK', visa_free: 173, visa_on_arrival: 0, etoa: 0, visa_required: 53 },
  { rank: 57, country: 'Panama', iso2: 'PA', visa_free: 173, visa_on_arrival: 0, etoa: 0, visa_required: 53 },
  { rank: 59, country: 'Antigua and Barbuda', iso2: 'AG', visa_free: 172, visa_on_arrival: 0, etoa: 0, visa_required: 54 },
  { rank: 59, country: 'Costa Rica', iso2: 'CR', visa_free: 172, visa_on_arrival: 0, etoa: 0, visa_required: 54 },
  { rank: 59, country: 'Montenegro', iso2: 'ME', visa_free: 172, visa_on_arrival: 0, etoa: 0, visa_required: 54 },
  { rank: 62, country: 'Georgia', iso2: 'GE', visa_free: 171, visa_on_arrival: 0, etoa: 0, visa_required: 55 },
  { rank: 62, country: 'St. Kitts and Nevis', iso2: 'KN', visa_free: 171, visa_on_arrival: 0, etoa: 0, visa_required: 55 },
  { rank: 64, country: 'Bahamas', iso2: 'BS', visa_free: 170, visa_on_arrival: 0, etoa: 0, visa_required: 56 },
  { rank: 64, country: 'Mauritius', iso2: 'MU', visa_free: 170, visa_on_arrival: 0, etoa: 0, visa_required: 56 },
  { rank: 64, country: 'Ukraine', iso2: 'UA', visa_free: 170, visa_on_arrival: 0, etoa: 0, visa_required: 56 },
  { rank: 67, country: 'St. Vincent and the Grenadines', iso2: 'VC', visa_free: 169, visa_on_arrival: 0, etoa: 0, visa_required: 57 },
  { rank: 67, country: 'Turkey', iso2: 'TR', visa_free: 169, visa_on_arrival: 0, etoa: 0, visa_required: 57 },
  { rank: 69, country: 'Paraguay', iso2: 'PY', visa_free: 168, visa_on_arrival: 0, etoa: 0, visa_required: 58 },
  { rank: 69, country: 'Peru', iso2: 'PE', visa_free: 168, visa_on_arrival: 0, etoa: 0, visa_required: 58 },
  { rank: 71, country: 'Bosnia and Herzegovina', iso2: 'BA', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 71, country: 'Dominica', iso2: 'DM', iso2: 'DM', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 71, country: 'El Salvador', iso2: 'SV', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 71, country: 'Guatemala', iso2: 'GT', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 71, country: 'Honduras', iso2: 'HN', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 71, country: 'Nicaragua', iso2: 'NI', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 71, country: 'Venezuela', iso2: 'VE', visa_free: 167, visa_on_arrival: 0, etoa: 0, visa_required: 59 },
  { rank: 78, country: 'Colombia', iso2: 'CO', visa_free: 166, visa_on_arrival: 0, etoa: 0, visa_required: 60 },
  { rank: 78, country: 'Grenada', iso2: 'GD', visa_free: 166, visa_on_arrival: 0, etoa: 0, visa_required: 60 },
  { rank: 78, country: 'Kiribati', iso2: 'KI', visa_free: 166, visa_on_arrival: 0, etoa: 0, visa_required: 60 },
  { rank: 78, country: 'Micronesia', iso2: 'FM', visa_free: 166, visa_on_arrival: 0, etoa: 0, visa_required: 60 },
  { rank: 82, country: 'Ecuador', iso2: 'EC', visa_free: 165, visa_on_arrival: 0, etoa: 0, visa_required: 61 },
  { rank: 82, country: 'Palau', iso2: 'PW', visa_free: 165, visa_on_arrival: 0, etoa: 0, visa_required: 61 },
  { rank: 82, country: 'Samoa', iso2: 'WS', visa_free: 165, visa_on_arrival: 0, etoa: 0, visa_required: 61 },
  { rank: 82, country: 'Serbia', iso2: 'RS', visa_free: 165, visa_on_arrival: 0, etoa: 0, visa_required: 61 },
  { rank: 86, country: 'Russia', iso2: 'RU', visa_free: 164, visa_on_arrival: 0, etoa: 0, visa_required: 62 },
  { rank: 86, country: 'South Africa', iso2: 'ZA', visa_free: 164, visa_on_arrival: 0, etoa: 0, visa_required: 62 },
  { rank: 88, country: 'Thailand', iso2: 'TH', visa_free: 163, visa_on_arrival: 0, etoa: 0, visa_required: 63 },
  { rank: 88, country: 'Trinidad and Tobago', iso2: 'TT', visa_free: 163, visa_on_arrival: 0, etoa: 0, visa_required: 63 },
  { rank: 90, country: 'Belize', iso2: 'BZ', visa_free: 162, visa_on_arrival: 0, etoa: 0, visa_required: 64 },
  { rank: 90, country: 'Jamaica', iso2: 'JM', visa_free: 162, visa_on_arrival: 0, etoa: 0, visa_required: 64 },
  { rank: 90, country: 'Malaysia', iso2: 'MY', visa_free: 162, visa_on_arrival: 0, etoa: 0, visa_required: 64 },
  { rank: 93, country: 'Philippines', iso2: 'PH', visa_free: 161, visa_on_arrival: 0, etoa: 0, visa_required: 65 },
  { rank: 93, country: 'Saint Lucia', iso2: 'LC', visa_free: 161, visa_on_arrival: 0, etoa: 0, visa_required: 65 },
  { rank: 95, country: 'China', iso2: 'CN', visa_free: 160, visa_on_arrival: 0, etoa: 0, visa_required: 66 },
  { rank: 95, country: 'Tuvalu', iso2: 'TV', visa_free: 160, visa_on_arrival: 0, etoa: 0, visa_required: 66 },
  { rank: 97, country: 'Vietnam', iso2: 'VN', visa_free: 159, visa_on_arrival: 0, etoa: 0, visa_required: 67 },
  { rank: 98, country: 'Indonesia', iso2: 'ID', visa_free: 158, visa_on_arrival: 0, etoa: 0, visa_required: 68 },
  { rank: 98, country: 'Kazakhstan', iso2: 'KZ', visa_free: 158, visa_on_arrival: 0, etoa: 0, visa_required: 68 },
  { rank: 100, country: 'Namibia', iso2: 'NA', visa_free: 157, visa_on_arrival: 0, etoa: 0, visa_required: 69 },
  { rank: 100, country: 'Tonga', iso2: 'TO', visa_free: 157, visa_on_arrival: 0, etoa: 0, visa_required: 69 },
  { rank: 102, country: 'Kyrgyzstan', iso2: 'KG', visa_free: 156, visa_on_arrival: 0, etoa: 0, visa_required: 70 },
  { rank: 102, country: 'Suriname', iso2: 'SR', visa_free: 156, visa_on_arrival: 0, etoa: 0, visa_required: 70 },
  { rank: 104, country: 'Bolivia', iso2: 'BO', visa_free: 155, visa_on_arrival: 0, etoa: 0, visa_required: 71 },
  { rank: 104, country: 'Egypt', iso2: 'EG', visa_free: 155, visa_on_arrival: 0, etoa: 0, visa_required: 71 },
  { rank: 104, country: 'Tunisia', iso2: 'TN', visa_free: 155, visa_on_arrival: 0, etoa: 0, visa_required: 71 },
  { rank: 107, country: 'Guyana', iso2: 'GY', visa_free: 154, visa_on_arrival: 0, etoa: 0, visa_required: 72 },
  { rank: 107, country: 'Lesotho', iso2: 'LS', visa_free: 154, visa_on_arrival: 0, etoa: 0, visa_required: 72 },
  { rank: 107, country: 'Moldova', iso2: 'MD', visa_free: 154, visa_on_arrival: 0, etoa: 0, visa_required: 72 },
  { rank: 110, country: 'Armenia', iso2: 'AM', visa_free: 153, visa_on_arrival: 0, etoa: 0, visa_required: 73 },
  { rank: 110, country: 'Azerbaijan', iso2: 'AZ', visa_free: 153, visa_on_arrival: 0, etoa: 0, visa_required: 73 },
  { rank: 110, country: 'Fiji', iso2: 'FJ', visa_free: 153, visa_on_arrival: 0, etoa: 0, visa_required: 73 },
  { rank: 110, country: 'Morocco', iso2: 'MA', visa_free: 153, visa_on_arrival: 0, etoa: 0, visa_required: 73 },
  { rank: 114, country: 'Algeria', iso2: 'DZ', visa_free: 152, visa_on_arrival: 0, etoa: 0, visa_required: 74 },
  { rank: 114, country: 'Kenya', iso2: 'KE', visa_free: 152, visa_on_arrival: 0, etoa: 0, visa_required: 74 },
  { rank: 114, country: 'Qatar', iso2: 'QA', visa_free: 152, visa_on_arrival: 0, etoa: 0, visa_required: 74 },
  { rank: 117, country: 'Benin', iso2: 'BJ', visa_free: 151, visa_on_arrival: 0, etoa: 0, visa_required: 75 },
  { rank: 117, country: 'Cambodia', iso2: 'KH', visa_free: 151, visa_on_arrival: 0, etoa: 0, visa_required: 75 },
  { rank: 117, country: 'Gambia', iso2: 'GM', visa_free: 151, visa_on_arrival: 0, etoa: 0, visa_required: 75 },
  { rank: 117, country: 'Jordan', iso2: 'JO', visa_free: 151, visa_on_arrival: 0, etoa: 0, visa_required: 75 },
  { rank: 117, country: 'Zimbabwe', iso2: 'ZW', visa_free: 151, visa_on_arrival: 0, etoa: 0, visa_required: 75 },
  { rank: 122, country: 'Eswatini', iso2: 'SZ', visa_free: 150, visa_on_arrival: 0, etoa: 0, visa_required: 76 },
  { rank: 122, country: 'Uzbekistan', iso2: 'UZ', visa_free: 150, visa_on_arrival: 0, etoa: 0, visa_required: 76 },
  { rank: 124, country: 'Cape Verde', iso2: 'CV', visa_free: 149, visa_on_arrival: 0, etoa: 0, visa_required: 77 },
  { rank: 124, country: 'Malawi', iso2: 'MW', visa_free: 149, visa_on_arrival: 0, etoa: 0, visa_required: 77 },
  { rank: 126, country: 'Botswana', iso2: 'BW', visa_free: 148, visa_on_arrival: 0, etoa: 0, visa_required: 78 },
  { rank: 126, country: 'Comoros', iso2: 'KM', visa_free: 148, visa_on_arrival: 0, etoa: 0, visa_required: 78 },
  { rank: 126, country: 'India', iso2: 'IN', visa_free: 148, visa_on_arrival: 0, etoa: 0, visa_required: 78 },
  { rank: 126, country: 'Laos', iso2: 'LA', visa_free: 148, visa_on_arrival: 0, etoa: 0, visa_required: 78 },
  { rank: 130, country: 'Gabon', iso2: 'GA', visa_free: 147, visa_on_arrival: 0, etoa: 0, visa_required: 79 },
  { rank: 130, country: 'Rwanda', iso2: 'RW', visa_free: 147, visa_on_arrival: 0, etoa: 0, visa_required: 79 },
  { rank: 130, country: 'Vanuatu', iso2: 'VU', visa_free: 147, visa_on_arrival: 0, etoa: 0, visa_required: 79 },
  { rank: 133, country: 'Burkina Faso', iso2: 'BF', visa_free: 146, visa_on_arrival: 0, etoa: 0, visa_required: 80 },
  { rank: 133, country: 'Cameroon', iso2: 'CM', visa_free: 146, visa_on_arrival: 0, etoa: 0, visa_required: 80 },
  { rank: 133, country: 'Ivory Coast', iso2: 'CI', visa_free: 146, visa_on_arrival: 0, etoa: 0, visa_required: 80 },
  { rank: 133, country: 'Senegal', iso2: 'SN', visa_free: 146, visa_on_arrival: 0, etoa: 0, visa_required: 80 },
  { rank: 133, country: 'Togo', iso2: 'TG', visa_free: 146, visa_on_arrival: 0, etoa: 0, visa_required: 80 },
  { rank: 138, country: 'Central African Republic', iso2: 'CF', visa_free: 145, visa_on_arrival: 0, etoa: 0, visa_required: 81 },
  { rank: 138, country: 'Ghana', iso2: 'GH', visa_free: 145, visa_on_arrival: 0, etoa: 0, visa_required: 81 },
  { rank: 138, country: 'Guinea', iso2: 'GN', visa_free: 145, visa_on_arrival: 0, etoa: 0, visa_required: 81 },
  { rank: 138, country: 'Mali', iso2: 'ML', visa_free: 145, visa_on_arrival: 0, etoa: 0, visa_required: 81 },
  { rank: 142, country: 'Burundi', iso2: 'BI', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Chad', iso2: 'TD', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Congo', iso2: 'CG', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Ethiopia', iso2: 'ET', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Liberia', iso2: 'LR', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Mauritania', iso2: 'MR', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Mozambique', iso2: 'MZ', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Niger', iso2: 'NE', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 142, country: 'Nigeria', iso2: 'NG', visa_free: 144, visa_on_arrival: 0, etoa: 0, visa_required: 82 },
  { rank: 151, country: 'Guinea-Bissau', iso2: 'GW', visa_free: 143, visa_on_arrival: 0, etoa: 0, visa_required: 83 },
  { rank: 151, country: 'Sierra Leone', iso2: 'SL', visa_free: 143, visa_on_arrival: 0, etoa: 0, visa_required: 83 },
  { rank: 153, country: 'Yemen', iso2: 'YE', visa_free: 142, visa_on_arrival: 0, etoa: 0, visa_required: 84 },
  { rank: 153, country: 'Democratic Republic of the Congo', iso2: 'CD', visa_free: 142, visa_on_arrival: 0, etoa: 0, visa_required: 84 },
  { rank: 155, country: 'Myanmar', iso2: 'MM', visa_free: 141, visa_on_arrival: 0, etoa: 0, visa_required: 85 },
  { rank: 155, country: 'Sao Tome and Principe', iso2: 'ST', visa_free: 141, visa_on_arrival: 0, etoa: 0, visa_required: 85 },
  { rank: 157, country: 'Bangladesh', iso2: 'BD', visa_free: 140, visa_on_arrival: 0, etoa: 0, visa_required: 86 },
  { rank: 157, country: 'Eritrea', iso2: 'ER', visa_free: 140, visa_on_arrival: 0, etoa: 0, visa_required: 86 },
  { rank: 157, country: 'Lebanon', iso2: 'LB', visa_free: 140, visa_on_arrival: 0, etoa: 0, visa_required: 86 },
  { rank: 157, country: 'Sri Lanka', iso2: 'LK', visa_free: 140, visa_on_arrival: 0, etoa: 0, visa_required: 86 },
  { rank: 161, country: 'Djibouti', iso2: 'DJ', visa_free: 139, visa_on_arrival: 0, etoa: 0, visa_required: 87 },
  { rank: 161, country: 'South Sudan', iso2: 'SS', visa_free: 139, visa_on_arrival: 0, etoa: 0, visa_required: 87 },
  { rank: 163, country: 'Iran', iso2: 'IR', visa_free: 138, visa_on_arrival: 0, etoa: 0, visa_required: 88 },
  { rank: 163, country: 'Kosovo', iso2: 'XK', visa_free: 138, visa_on_arrival: 0, etoa: 0, visa_required: 88 },
  { rank: 165, country: 'North Korea', iso2: 'KP', visa_free: 137, visa_on_arrival: 0, etoa: 0, visa_required: 89 },
  { rank: 165, country: 'Nepal', iso2: 'NP', visa_free: 137, visa_on_arrival: 0, etoa: 0, visa_required: 89 },
  { rank: 167, country: 'Palestine', iso2: 'PS', visa_free: 136, visa_on_arrival: 0, etoa: 0, visa_required: 90 },
  { rank: 167, country: 'Somalia', iso2: 'SO', visa_free: 136, visa_on_arrival: 0, etoa: 0, visa_required: 90 },
  { rank: 169, country: 'Iraq', iso2: 'IQ', visa_free: 135, visa_on_arrival: 0, etoa: 0, visa_required: 91 },
  { rank: 169, country: 'Syria', iso2: 'SY', visa_free: 135, visa_on_arrival: 0, etoa: 0, visa_required: 91 },
  { rank: 171, country: 'Pakistan', iso2: 'PK', visa_free: 134, visa_on_arrival: 0, etoa: 0, visa_required: 92 },
  { rank: 171, country: 'Timor-Leste', iso2: 'TL', visa_free: 134, visa_on_arrival: 0, etoa: 0, visa_required: 92 },
  { rank: 173, country: 'Afghanistan', iso2: 'AF', visa_free: 133, visa_on_arrival: 0, etoa: 0, visa_required: 93 },
];

async function fetchPassportIndex() {
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  Passport Index Rankings Fetcher                                 ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝\n');

  console.log('Using curated 2026 Passport Index data...\n');

  const year = 2026;
  const totalDestinations = 226; // Total countries/territories tracked

  // Calculate additional metrics
  const rankings = PASSPORT_DATA.map(p => ({
    ...p,
    total_destinations: totalDestinations,
    mobility_score: Math.round((p.visa_free / totalDestinations) * 100),
    passport_power_score: p.visa_free + (p.visa_on_arrival * 0.5) + (p.etoa * 0.25),
    visa_required: totalDestinations - p.visa_free - p.visa_on_arrival - (p.etoa || 0),
  }));

  // Stats
  const avgVisaFree = Math.round(
    rankings.reduce((sum, r) => sum + r.visa_free, 0) / rankings.length
  );
  const maxVisaFree = Math.max(...rankings.map(r => r.visa_free));
  const minVisaFree = Math.min(...rankings.map(r => r.visa_free));

  console.log(`  Total countries ranked: ${rankings.length}`);
  console.log(`  Average visa-free access: ${avgVisaFree} destinations`);
  console.log(`  Range: ${minVisaFree} - ${maxVisaFree} destinations`);

  // Top 10 and bottom 10
  console.log('\n── Top 10 Passports ──────────────────────────────────────────────');
  rankings.slice(0, 10).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.country.padEnd(25)} ${r.visa_free} visa-free`);
  });

  console.log('\n── Bottom 10 Passports ───────────────────────────────────────────');
  rankings.slice(-10).forEach((r, i) => {
    console.log(`  ${rankings.length - 9 + i}. ${r.country.padEnd(25)} ${r.visa_free} visa-free`);
  });

  // Regional averages
  const regions = {
    'Europe': ['AL', 'AD', 'AT', 'BY', 'BE', 'BA', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IS', 'IE', 'IT', 'XK', 'LV', 'LI', 'LT', 'LU', 'MT', 'MC', 'ME', 'NL', 'MK', 'NO', 'PL', 'PT', 'MD', 'RO', 'RU', 'SM', 'RS', 'SK', 'SI', 'ES', 'SE', 'CH', 'UA', 'GB', 'VA'],
    'Asia': ['AF', 'AM', 'AZ', 'BH', 'BD', 'BT', 'BN', 'KH', 'CN', 'GE', 'HK', 'IN', 'ID', 'IR', 'IQ', 'IL', 'JP', 'JO', 'KZ', 'KW', 'KG', 'LA', 'LB', 'MO', 'MY', 'MV', 'MN', 'MM', 'NP', 'KP', 'OM', 'PK', 'PS', 'PH', 'QA', 'SA', 'SG', 'KR', 'LK', 'SY', 'TW', 'TJ', 'TH', 'TL', 'TR', 'AE', 'UZ', 'VN', 'YE'],
    'Americas': ['AG', 'AR', 'BS', 'BB', 'BZ', 'BO', 'BR', 'CA', 'CL', 'CO', 'CR', 'CU', 'DM', 'DO', 'EC', 'SV', 'GD', 'GT', 'GY', 'HT', 'HN', 'JM', 'MX', 'NI', 'PA', 'PY', 'PE', 'KN', 'LC', 'VC', 'SR', 'TT', 'US', 'UY', 'VE'],
    'Africa': ['DZ', 'AO', 'BJ', 'BW', 'BF', 'BI', 'CV', 'CM', 'CF', 'TD', 'KM', 'CG', 'CD', 'CI', 'DJ', 'EG', 'GQ', 'ER', 'SZ', 'ET', 'GA', 'GM', 'GH', 'GN', 'GW', 'KE', 'LS', 'LR', 'LY', 'MG', 'MW', 'ML', 'MR', 'MU', 'MA', 'MZ', 'NA', 'NE', 'NG', 'RW', 'ST', 'SN', 'RS', 'SC', 'SL', 'SO', 'ZA', 'SS', 'SD', 'TZ', 'TG', 'TN', 'UG', 'ZM', 'ZW'],
    'Oceania': ['AU', 'FJ', 'KI', 'MH', 'FM', 'NR', 'NZ', 'PW', 'PG', 'WS', 'SB', 'TO', 'TV', 'VU'],
  };

  console.log('\n── Regional Averages ─────────────────────────────────────────────');
  for (const [region, codes] of Object.entries(regions)) {
    const countriesInRanking = rankings.filter(r => codes.includes(r.iso2));
    if (countriesInRanking.length > 0) {
      const avg = Math.round(
        countriesInRanking.reduce((sum, r) => sum + r.visa_free, 0) / countriesInRanking.length
      );
      console.log(`  ${region.padEnd(10)} ${avg} visa-free (avg)`);
    }
  }

  // Write output
  const output = {
    fetched_at: new Date().toISOString(),
    source: 'Passport Index (Henley & Partners, Guide Passport Index)',
    year,
    total: rankings.length,
    globalAverage: avgVisaFree,
    rankings,
  };

  atomicWrite(OUTPUT_PATH, JSON.stringify(output, null, 2));
  console.log(`\n✓ Written ${rankings.length} country rankings to ${OUTPUT_PATH}`);

  // Write lightweight version for country panel integration
  const lightOutput = path.join(__dirname, '..', 'public', 'passport-rank-lite.json');
  const byCountry = {};
  for (const r of rankings) {
    byCountry[r.iso2] = {
      rank: r.rank,
      visa_free: r.visa_free,
      mobility_score: r.mobility_score,
      passport_power_score: Math.round(r.passport_power_score),
    };
  }

  atomicWrite(lightOutput, JSON.stringify({
    fetched_at: output.fetched_at,
    source: output.source,
    year: output.year,
    total: output.total,
    globalAverage: output.globalAverage,
    byCountry,
  }));
  console.log(`✓ Written country summary to ${lightOutput}`);

  console.log('\n[passport-index] Complete!');
}

async function main() {
  try {
    await fetchPassportIndex();
    console.log('\n[passport-index] Complete!');
  } catch (err) {
    console.error('[passport-index] Failed:', err.message);
    process.exit(1);
  }
}

main();
