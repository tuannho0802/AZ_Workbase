const mysql = require('mysql2/promise');
const fs = require('fs');

async function getFKs() {
  try {
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'az_workbase'
    });
    const [rows] = await connection.query(`
      SELECT 
        CONSTRAINT_NAME, 
        COLUMN_NAME, 
        REFERENCED_TABLE_NAME, 
        REFERENCED_COLUMN_NAME
      FROM 
        information_schema.KEY_COLUMN_USAGE
      WHERE 
        TABLE_SCHEMA = 'az_workbase' 
        AND TABLE_NAME = 'customers'
        AND REFERENCED_TABLE_NAME IS NOT NULL;
    `);
    fs.writeFileSync('customers_fks.json', JSON.stringify(rows, null, 2));
    console.log('FKs written to customers_fks.json');
    await connection.end();
  } catch (err) {
    console.error('Error fetching FKs:', err);
    process.exit(1);
  }
}

getFKs();
