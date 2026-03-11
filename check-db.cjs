const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'commerce_data.sqlite');
const db = new sqlite3.Database(dbPath);

console.log("Checking DB:", dbPath);

db.all("SELECT * FROM Configuracion", [], (err, rows) => {
    if (err) console.error("Error:", err);
    else console.log("Rows:", rows);
});

db.close();
