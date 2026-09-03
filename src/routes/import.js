const express = require('express');
const router = express.Router();
const multer = require('multer');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { parseQuestionsFromLines } = require('../services/questionParser');
const { extractColoredPages } = require('../services/pdfColorExtractor');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024 }, // 30 MB gacha PDF
  fileFilter: (req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Faqat PDF fayl qabul qilinadi'));
    }
    cb(null, true);
  },
});

const IMAGE_PADDING = 4; // rasm chetlarida ozgina bo'sh joy (piksel)

/**
 * Sahifa canvas'idan savol matni joylashgan qismini kesib, PNG base64 qilib qaytaradi.
 * Faqat matn joylashgan KENGLIKNI kesamiz (butun sahifa emas) — aks holda
 * tor telefon ekraniga siqilganda matn juda kichrayib ketadi.
 */
function cropQuestionImage(pageCanvas, bounds, pageWidth) {
  const { createCanvas } = require('@napi-rs/canvas');
  const top = Math.max(0, Math.floor(bounds.top - IMAGE_PADDING));
  const bottom = Math.min(pageCanvas.height, Math.ceil(bounds.bottom + IMAGE_PADDING));
  const left = Math.max(0, Math.floor((bounds.left ?? 0) - IMAGE_PADDING));
  const right = Math.min(pageWidth, Math.ceil((bounds.right ?? pageWidth) + IMAGE_PADDING));

  const height = bottom - top;
  const width = right - left;
  if (height <= 0 || height > 600 || width <= 0) return null;

  const cropCanvas = createCanvas(width, height);
  const ctx = cropCanvas.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(pageCanvas, left, top, width, height, 0, 0, width, height);

  return 'data:image/png;base64,' + cropCanvas.toBuffer('image/png').toString('base64');
}

/**
 * POST /api/import/upload
 * Form-data: pdf (fayl), grade, subject, topic, source_book (ixtiyoriy)
 */
router.post('/upload', requireAuth, upload.single('pdf'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'PDF fayl yuklanmadi' });
  }
  const { grade, subject, topic, source_book } = req.body;
  if (!grade || !subject || !topic) {
    return res.status(400).json({ error: 'grade, subject, topic kerak' });
  }

  let pages;
  try {
    pages = await extractColoredPages(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: 'PDF o\'qib bo\'lmadi: ' + err.message });
  }

  const toInsert = []; // { ...fields, status }

  pages.forEach((pageData, idx) => {
    const pageNum = idx + 1;
    const { review, ocrError } = parseQuestionsFromLines(pageData.lines, {
      grade: Number(grade), subject, topic,
      source_book: source_book || req.file.originalname,
    });

    [...review.map(q => ({ q, status: 'review' })), ...ocrError.map(q => ({ q, status: 'ocr_error' }))]
      .forEach(({ q, status }) => {
        let question_image = null;
        try {
          if (pageData.canvas && q.imageBounds) {
            question_image = cropQuestionImage(pageData.canvas, q.imageBounds, pageData.width);
          }
        } catch (e) {
          console.error(`[import] Savol #${q.source_question_no} uchun rasm kesib bo'lmadi:`, e.message);
        }

        toInsert.push({ ...q, source_page: pageNum, status, question_image });
      });
  });

  if (toInsert.length === 0) {
    return res.json({
      total_found: 0, review: 0, ocr_error: 0,
      message: 'Hech qanday savol formatiga mos matn topilmadi. PDF skanerlangan rasm bo\'lishi mumkin (OCR kerak) yoki format mos kelmadi.',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const q of toInsert) {
      await client.query(
        `INSERT INTO questions
           (grade, subject, topic, question, option_a, option_b, option_c, option_d,
            correct_answer, difficulty, source_book, source_page, status, question_image)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [q.grade, q.subject, q.topic, q.question, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, q.difficulty, q.source_book, q.source_page, q.status, q.question_image]
      );
    }
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    return res.status(500).json({ error: 'Bazaga yozishda xato: ' + err.message });
  } finally {
    client.release();
  }

  const reviewCount = toInsert.filter(q => q.status === 'review').length;
  const errorCount = toInsert.filter(q => q.status === 'ocr_error').length;

  res.status(201).json({
    total_found: toInsert.length,
    review: reviewCount,
    ocr_error: errorCount,
  });
});

/**
 * GET /api/import/pending?status=review
 * Tekshirish kutayotgan savollar ro'yxati
 */
router.get('/pending', requireAuth, async (req, res) => {
  const status = req.query.status === 'ocr_error' ? 'ocr_error' : 'review';
  const { rows } = await pool.query(
    `SELECT * FROM questions WHERE status = $1 ORDER BY id DESC LIMIT 200`,
    [status]
  );
  res.json({ questions: rows });
});

/**
 * PATCH /api/import/questions/:id
 * O'qituvchi tuzatib, tasdiqlaydi (status='approved') yoki qayta 'review'ga qoldiradi
 */
router.patch('/questions/:id', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { question, option_a, option_b, option_c, option_d, correct_answer, difficulty, status } = req.body;

  const { rows } = await pool.query(
    `UPDATE questions SET
       question = COALESCE($1, question),
       option_a = COALESCE($2, option_a),
       option_b = COALESCE($3, option_b),
       option_c = COALESCE($4, option_c),
       option_d = COALESCE($5, option_d),
       correct_answer = COALESCE($6, correct_answer),
       difficulty = COALESCE($7, difficulty),
       status = COALESCE($8, status)
     WHERE id = $9
     RETURNING *`,
    [question, option_a, option_b, option_c, option_d, correct_answer, difficulty, status, id]
  );

  if (rows.length === 0) return res.status(404).json({ error: 'Savol topilmadi' });
  res.json({ question: rows[0] });
});

/**
 * DELETE /api/import/questions/:id — noto'g'ri import qilingan savolni o'chirish
 */
router.delete('/questions/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM questions WHERE id = $1', [req.params.id]);
  res.json({ deleted: true });
});

module.exports = router;
