const { Pool, types } = require('pg');
require('dotenv').config();

// timestamp sem fuso horário (OID 1114): devolve o texto tal como está na BD
types.setTypeParser(1114, (value) => value);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

module.exports = pool;