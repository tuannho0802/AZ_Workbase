const mysql = require('mysql2/promise');
const fs = require('fs');

async function getSchema() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'az_workbase'
    });
    const [rows] = await connection.query('SHOW INDEX FROM customers');
    fs.writeFileSync('customers_indexes.json', JSON.stringify(rows, null, 2));
    console.log('Indexes written to customers_indexes.json');
    await connection.end();
  } catch (err) {
    console.error('Error fetching indexes:', err);
    process.exit(1);
  }
}

getSchema();
