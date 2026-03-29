const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use('/node_modules', express.static(path.join(__dirname, 'node_modules')));

app.listen(PORT, () => {
  console.log(`World Data Map running at http://localhost:${PORT}`);
});
