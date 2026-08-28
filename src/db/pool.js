const { Pool } = require('pg');
require('dotenv').config();

const isLocal = (process.env.DATABASE_URL || '').includes('localhost');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }, // Supabase SSL talab qiladi
  max: 20,                     // bir vaqtda 20 tagacha ulanish (30 kishi navbatlashib ishlatadi)
  idleTimeoutMillis: 30000,    // ishlatilmagan ulanishni 30s dan keyin yopadi
  connectionTimeoutMillis: 10000, // 10s kutadi, undan keyin xato beradi (osilib qolmaydi)
});

module.exports = pool;
