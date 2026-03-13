const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'commerce_data.sqlite');
console.log('Checking DB at:', dbPath);
const db = new sqlite3.Database(dbPath);

db.all("SELECT name FROM sqlite_master WHERE type='table'", [], (err, tables) => {
    if (err) {
        console.error('Error listing tables:', err);
        return;
    }
    console.log('Tables:', tables.map(t => t.name).join(', '));

    db.all("SELECT * FROM Configuracion", [], (err, rows) => {
        if (err) {
            console.error('Error querying Configuracion:', err);
        } else {
            console.log('Configuracion Rows:', JSON.stringify(rows, null, 2));
        }
        db.close();
    });
});
