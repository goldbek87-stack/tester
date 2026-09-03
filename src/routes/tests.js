const express = require('express');
const router = express.Router();
const pool = require('../db/pool');
const { generateTestCode, shuffle } = require('../utils');
const { requireAuth } = require('../middleware/auth');

/**
 * POST /api/tests
 * O'qituvchi test yaratadi: sinf + fan + mavzu + oson/o'rta/qiyin soni + vaqt
 * MUHIM: endi faqat tizimga kirgan o'qituvchi test yarata oladi.
 * Body: { grade, subject, topic, easy_count, medium_count, hard_count, duration_min }
 */
router.post('/', requireAuth, async (req, res) => {
  const {
    grade, subject, topic,
    easy_count = 0, medium_count = 0, hard_count = 0,
    duration_min,
  } = req.body;
  const teacher_id = req.teacherId;

  const total = Number(easy_count) + Number(medium_count) + Number(hard_count);

  if (!grade || !subject || !topic || !duration_min || total === 0) {
    return res.status(400).json({ error: 'grade, subject, topic, duration_min va kamida bitta qiyinlik soni kerak' });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Har bir qiyinlik darajasidan kerakli sonda savol tanlab olamiz
    const pickByDifficulty = async (difficulty, count) => {
      if (count <= 0) return [];
      const { rows } = await client.query(
        `SELECT id FROM questions
         WHERE grade = $1 AND subject = $2 AND topic = $3
           AND difficulty = $4 AND status = 'approved'
         ORDER BY random()
         LIMIT $5`,
        [grade, subject, topic, difficulty, count]
      );
      if (rows.length < count) {
        throw new Error(
          `"${topic}" mavzusida ${difficulty} darajali savol yetarli emas: ${rows.length}/${count} topildi`
        );
      }
      return rows.map(r => r.id);
    };

    const easyIds = await pickByDifficulty('easy', easy_count);
    const mediumIds = await pickByDifficulty('medium', medium_count);
    const hardIds = await pickByDifficulty('hard', hard_count);

    // Barcha savollarni birlashtirib aralashtiramiz
    const shuffledIds = shuffle([...easyIds, ...mediumIds, ...hardIds]);

    // Noyob test kodi generatsiya qilamiz (mavjud bo'lsa qayta uramiz)
    let testCode;
    while (true) {
      testCode = generateTestCode();
      const exists = await client.query('SELECT 1 FROM tests WHERE test_code = $1', [testCode]);
      if (exists.rowCount === 0) break;
    }

    const testResult = await client.query(
      `INSERT INTO tests
         (test_code, teacher_id, grade, subject, topic, total_questions,
          easy_count, medium_count, hard_count, duration_min)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       RETURNING id, test_code`,
      [testCode, teacher_id || null, grade, subject, topic, shuffledIds.length,
       easy_count, medium_count, hard_count, duration_min]
    );

    const testId = testResult.rows[0].id;

    // Savollarni test_questions jadvaliga aralashtirilgan tartibda yozamiz
    for (let i = 0; i < shuffledIds.length; i++) {
      await client.query(
        `INSERT INTO test_questions (test_id, question_id, position) VALUES ($1,$2,$3)`,
        [testId, shuffledIds[i], i + 1]
      );
    }

    // Statistikaga: bu savollar bir marta "ko'rsatiladigan" bo'ladi (attempt boshlanganda oshiramiz)
    await client.query('COMMIT');

    res.status(201).json({
      test_id: testId,
      test_code: testResult.rows[0].test_code,
      total_questions: shuffledIds.length,
      duration_min,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err.message);
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

/**
 * GET /api/tests/:code
 * O'quvchi APK test kodini kiritganda shu endpoint chaqiriladi.
 * MUHIM: correct_answer YUBORILMAYDI — faqat savol va variantlar.
 */
router.get('/:code', async (req, res) => {
  const { code } = req.params;

  const testRes = await pool.query(
    `SELECT id, test_code, grade, subject, topic, total_questions, duration_min, is_active
     FROM tests WHERE test_code = $1`,
    [code]
  );

  if (testRes.rowCount === 0) {
    return res.status(404).json({ error: 'Bunday test kodi topilmadi' });
  }

  const test = testRes.rows[0];
  if (!test.is_active) {
    return res.status(403).json({ error: 'Bu test faol emas' });
  }

  const questionsRes = await pool.query(
    `SELECT q.id, q.question, q.question_image, q.option_a, q.option_b, q.option_c, q.option_d, tq.position
     FROM test_questions tq
     JOIN questions q ON q.id = tq.question_id
     WHERE tq.test_id = $1
     ORDER BY tq.position`,
    [test.id]
  );

  res.json({
    test_id: test.id,
    test_code: test.test_code,
    subject: test.subject,
    topic: test.topic,
    duration_min: test.duration_min,
    total_questions: test.total_questions,
    questions: questionsRes.rows,
  });
});

module.exports = router;
