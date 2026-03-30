const mysql = require('mysql2/promise');
const fs = require('fs');

async function testConnection() {
  const credentials = [
    { user: 'root', password: '' },
    { user: 'root', password: 'password' },
    { user: 'root', password: 'root' },
    { user: 'admin', password: 'password' }
  ];

  let connection;
  let correctCred = null;

  for (const cred of credentials) {
    try {
      connection = await mysql.createConnection({
        host: 'localhost',
        user: cred.user,
        password: cred.password
      });
      correctCred = cred;
      break;
    } catch (e) {
      // ignore
    }
  }

  if (connection) {
    console.log(`SUCCESS: user=${correctCred.user}, password=${correctCred.password}`);
    await connection.query('CREATE DATABASE IF NOT EXISTS az_workbase');
    console.log('Database az_workbase created or exists');
    await connection.end();
  } else {
    console.error('FAILED TO CONNECT WITH ANY COMMON CREDENTIALS');
  }
}

testConnection();
