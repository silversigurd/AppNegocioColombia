const sqlite3 = require('sqlite3').verbose();
const dbRoot = new sqlite3.Database('commerce_data.sqlite');
dbRoot.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, rows) => {
    if (err) console.error(err);
    else console.log("ROOT DB TABLES:", rows.map(r => r.name).join(', '));
});
dbRoot.close();
