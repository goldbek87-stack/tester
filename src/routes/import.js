const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const pool = require('../db/pool');
const { requireAuth } = require('../middleware/auth');
const { parseQuestions } = require('../services/questionParser');

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

const PAGE_MARKER = '\n\n<<<PAGE_BREAK>>>\n\n';

/**
 * pdf.js har bir matn bo'lagini alohida beradi va ular orasida \n bo'lmaydi.
 * Shuning uchun qatorlarni y-koordinata (vertikal joylashuv) o'zgarishiga
 * qarab qayta tiklaymiz — aks holda "A) 1 B) 5/4 C)..." bitta qatorga
 * yopishib qolib, regex savol/variantlarni ajrata olmaydi.
 */
function renderPageWithLineBreaks(pageData) {
  return pageData.getTextContent().then((tc) => {
    let lastY = null;
    let line = '';
    const lines = [];

    tc.items.forEach((item) => {
      const y = item.transform[5];
      if (lastY !== null && Math.abs(y - lastY) > 1) {
        lines.push(line.trim());
        line = '';
      }
      line += item.str + ' ';
      lastY = y;
    });
    if (line.trim()) lines.push(line.trim());

    return lines.join('\n') + PAGE_MARKER;
  });
}

/**
 * PDF'ni sahifama-sahifa matnga aylantiradi (har bir savolning qaysi
 * sahifadan olinganini bilish uchun sahifalar orasiga maxsus belgi qo'yiladi).
 */
async function extractPagedText(buffer) {
  const data = await pdfParse(buffer, { pagerender: renderPageWithLineBreaks });
  return data.text.split(PAGE_MARKER);
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
    pages = await extractPagedText(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ error: 'PDF o\'qib bo\'lmadi: ' + err.message });
  }

  const toInsert = []; // { ...fields, status }

  pages.forEach((pageText, idx) => {
    const pageNum = idx + 1;
    const { review, ocrError } = parseQuestions(pageText, {
      grade: Number(grade), subject, topic,
      source_book: source_book || req.file.originalname,
    });
    review.forEach((q) => toInsert.push({ ...q, source_page: pageNum, status: 'review' }));
    ocrError.forEach((q) => toInsert.push({ ...q, source_page: pageNum, status: 'ocr_error' }));
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
            correct_answer, difficulty, source_book, source_page, status)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [q.grade, q.subject, q.topic, q.question, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, q.difficulty, q.source_book, q.source_page, q.status]
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
