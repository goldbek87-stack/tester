const express = require('express');
const router = express.Router();
const pool = require('../db/pool');

/**
 * POST /api/attempts/start
 * O'quvchi "BOSHLASH" bosganda chaqiriladi
 * Body: { test_code, student_name }
 */
router.post('/start', async (req, res) => {
  const { test_code, student_name } = req.body;
  if (!test_code || !student_name) {
    return res.status(400).json({ error: 'test_code va student_name kerak' });
  }

  const testRes = await pool.query('SELECT id FROM tests WHERE test_code = $1 AND is_active = true', [test_code]);
  if (testRes.rowCount === 0) {
    return res.status(404).json({ error: 'Test topilmadi yoki faol emas' });
  }

  const attemptRes = await pool.query(
    `INSERT INTO attempts (test_id, student_name) VALUES ($1, $2) RETURNING id, started_at`,
    [testRes.rows[0].id, student_name]
  );

  res.status(201).json({
    attempt_id: attemptRes.rows[0].id,
    started_at: attemptRes.rows[0].started_at,
  });
});

/**
 * POST /api/attempts/:id/submit
 * O'quvchi "TESTNI YAKUNLASH" bosganda chaqiriladi.
 * Server javoblarni tekshiradi (correct_answer hech qachon APKga yuborilmagan edi).
 * Body: { answers: [{ question_id, selected_answer }, ...] }
 */
router.post('/:id/submit', async (req, res) => {
  const attemptId = req.params.id;
  const { answers } = req.body;

  if (!Array.isArray(answers)) {
    return res.status(400).json({ error: 'answers massiv bo\'lishi kerak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const attemptRes = await client.query(
      `SELECT a.id, a.started_at, t.id AS test_id
       FROM attempts a JOIN tests t ON t.id = a.test_id
       WHERE a.id = $1 AND a.finished_at IS NULL`,
      [attemptId]
    );
    if (attemptRes.rowCount === 0) {
      throw new Error('Urinish topilmadi yoki allaqachon yakunlangan');
    }
    const { started_at } = attemptRes.rows[0];

    let correctCount = 0;
    for (const ans of answers) {
      const qRes = await client.query(
        `SELECT correct_answer FROM questions WHERE id = $1`,
        [ans.question_id]
      );
      if (qRes.rowCount === 0) continue;

      const isCorrect = qRes.rows[0].correct_answer === ans.selected_answer;
      if (isCorrect) correctCount++;

      await client.query(
        `INSERT INTO attempt_answers (attempt_id, question_id, selected_answer, is_correct)
         VALUES ($1,$2,$3,$4)`,
        [attemptId, ans.question_id, ans.selected_answer || null, isCorrect]
      );

      // Har bir savol statistikasini yangilaymiz (11-band: qiyinlikni qayta baholash uchun)
      await client.query(
        `UPDATE questions SET times_shown = times_shown + 1,
                              times_correct = times_correct + $2
         WHERE id = $1`,
        [ans.question_id, isCorrect ? 1 : 0]
      );
    }

    const wrongCount = answers.length - correctCount;
    const scorePercent = answers.length > 0 ? (correctCount / answers.length) * 100 : 0;
    const durationSec = Math.round((Date.now() - new Date(started_at).getTime()) / 1000);

    await client.query(
      `UPDATE attempts
       SET finished_at = now(), correct_count = $1, wrong_count = $2,
           score_percent = $3, duration_sec = $4
       WHERE id = $5`,
      [correctCount, wrongCount, scorePercent.toFixed(2), durationSec, attemptId]
    );

    await client.query('COMMIT');

    res.json({
      attempt_id: Number(attemptId),
      total: answers.length,
      correct: correctCount,
      wrong: wrongCount,
      score_percent: Number(scorePercent.toFixed(2)),
      duration_sec: durationSec,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/attempts/by-test/:test_code
 * O'qituvchi paneli: shu testni kim qanday topshirganini ko'rish
 */
router.get('/by-test/:test_code', async (req, res) => {
  const { test_code } = req.params;

  const rows = await pool.query(
    `SELECT a.id, a.student_name, a.correct_count, a.wrong_count,
            a.score_percent, a.duration_sec, a.finished_at
     FROM attempts a
     JOIN tests t ON t.id = a.test_id
     WHERE t.test_code = $1 AND a.finished_at IS NOT NULL
     ORDER BY a.score_percent DESC NULLS LAST`,
    [test_code]
  );

  res.json({ attempts: rows.rows });
});

module.exports = router;
