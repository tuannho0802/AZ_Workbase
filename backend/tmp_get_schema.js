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
    const [rows] = await connection.query('SHOW CREATE TABLE customers');
    const createSql = rows[0]['Create Table'];
    fs.writeFileSync('customers_schema.txt', createSql);
    console.log('Schema written to customers_schema.txt');
    await connection.end();
  } catch (err) {
    console.error('Error fetching schema:', err);
    process.exit(1);
  }
}

getSchema();
