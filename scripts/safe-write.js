const fs = require('fs');
const path = require('path');

function atomicWrite(filePath, data, encoding) {
  const dir = path.dirname(filePath);
  const tmp = path.join(dir, '.' + path.basename(filePath) + '.tmp');
  fs.writeFileSync(tmp, data, encoding || undefined);
  fs.renameSync(tmp, filePath);
}

module.exports = { atomicWrite };