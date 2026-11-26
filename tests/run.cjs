const { app } = require('electron');
const fs = require('node:fs'),
  path = require('node:path');
app.whenReady().then(() => {
  try {
    const results = require('./core.cjs').run();
    fs.mkdirSync(path.join(__dirname, '../test-results'), { recursive: true });
    fs.writeFileSync(
      path.join(__dirname, '../test-results/crypto.json'),
      JSON.stringify(results, null, 2)
    );
    console.log(JSON.stringify(results, null, 2));
    app.exit(0);
  } catch (e) {
    console.error(e);
    app.exit(1);
  }
});
