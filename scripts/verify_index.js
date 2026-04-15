const fs = require('fs');
const d = JSON.parse(fs.readFileSync('public/companies-index.json', 'utf8'));
const cos = Object.values(d).flat();
const fx = {USD:1,EUR:1.08,JPY:0.0067,CNY:0.138,KRW:0.00075,IDR:6.3e-5,SEK:0.096,GBP:1.27};
const targets = ['Faurecia','KG Group','Mayora Indah','Viaplay Group','Orange Life Insurance','Sungwoo Hitech','CATL'];
targets.forEach(n => {
  const c = cos.find(co => co.name && co.name.includes(n));
  if (!c) { console.log(n, 'NOT FOUND'); return; }
  const usd = c.revenue && fx[c.revenue_currency] ? (c.revenue * fx[c.revenue_currency] / 1e9).toFixed(1) + 'B' : 'null';
  console.log(n + ': rev=' + c.revenue + ' ' + c.revenue_currency + ' => $' + usd);
});