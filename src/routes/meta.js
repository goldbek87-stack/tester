const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

/**
 * GET /api/meta/topics
 * Bazada mavjud har bir (sinf, fan, mavzu) uchun oson/o'rta/qiyin savollar sonini qaytaradi.
 * O'qituvchi paneli shu orqali dropdownlarni to'ldiradi va
 * "bu mavzuda nechta savol bor" ekanini oldindan ko'rsatadi.
 */
router.get('/topics', async (req, res) => {
  const { rows } = await pool.query(`
    SELECT grade, subject, topic,
           COUNT(*) FILTER (WHERE difficulty = 'easy')   AS easy_available,
           COUNT(*) FILTER (WHERE difficulty = 'medium') AS medium_available,
           COUNT(*) FILTER (WHERE difficulty = 'hard')   AS hard_available,
           COUNT(*) AS total_available
    FROM questions
    WHERE status = 'approved'
    GROUP BY grade, subject, topic
    ORDER BY grade, subject, topic
  `);
  res.json({ topics: rows });
});

module.exports = router;
