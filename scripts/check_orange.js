const fs = require('fs');
const data = JSON.parse(fs.readFileSync('public/companies.json', 'utf8'));
const cos = Object.values(data).flat();
const targets = ['Faurecia', 'KG Group', 'Mayora Indah', 'Viaplay Group', 'Orange Life Insurance', 'Sungwoo Hitech', 'Evraz', 'DMG Mori', 'Contemporary Amperex'];
targets.forEach(n => {
  const c = cos.find(co => co.name && co.name.includes(n));
  if (!c) { console.log(n, 'NOT FOUND'); return; }
  console.log(n + ': rev=' + c.revenue + ' cur=' + c.revenue_currency +
    ' net_inc=' + c.net_income + ' ni_cur=' + c.net_income_currency +
    ' oi=' + c.operating_income + ' oi_cur=' + c.operating_income_currency +
    ' employees=' + c.employees);
});