/**
 * QUESTION PARSER — matndan test savollarini ajratib oladi.
 *
 * Kutilayotgan format (eng keng tarqalgan Uzbek test kitob formati):
 *
 *   1. Savol matni?
 *   A) variant 1
 *   B) variant 2
 *   C) variant 3
 *   D) variant 4
 *   Javob: B
 *
 * AI ishlatilmagani uchun bu — qoida (regex) asosidagi ajratish.
 * Shuning uchun aniqlik 100% emas: formatga mos kelmagan savollar
 * "ocr_error" statusiga tushadi, formatga mos lekin tekshirish kerak
 * bo'lganlari "review" statusiga tushadi. Hech qachon avtomatik
 * "approved" qilinmaydi.
 */

// Savol blokini topish uchun asosiy naqsh.
// Raqam bilan boshlanadi (1. yoki 1) kabi), so'ng savol matni,
// so'ng A/B/C/D variantlari, so'ng "Javob:" qatori.
const QUESTION_BLOCK_RE =
  /(\d{1,4})[.\)]\s*([\s\S]+?)\n\s*A[.\):]\s*([^\n]+)\n\s*B[.\):]\s*([^\n]+)\n\s*C[.\):]\s*([^\n]+)\n\s*D[.\):]\s*([^\n]+?)(?:\n\s*(?:Javob|To['\u2018\u2019]g['\u2018\u2019]ri javob|Javobi)\s*[:\-]?\s*([A-D]))?(?=\n\s*\d{1,4}[.\)]|\s*$)/gi;

function guessDifficulty(questionText) {
  const wordCount = questionText.trim().split(/\s+/).length;
  if (wordCount <= 8) return 'easy';
  if (wordCount <= 16) return 'medium';
  return 'hard';
}

function cleanText(s) {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * @param {string} rawText - PDF'dan chiqarilgan xom matn
 * @param {object} meta - { grade, subject, topic, source_book }
 * @returns {{ ready: Array, review: Array, ocrError: Array }}
 */
function parseQuestions(rawText, meta) {
  const text = rawText.replace(/\r\n/g, '\n');
  const results = { review: [], ocrError: [] };

  let match;
  let foundCount = 0;
  QUESTION_BLOCK_RE.lastIndex = 0;

  while ((match = QUESTION_BLOCK_RE.exec(text)) !== null) {
    foundCount++;
    const [, num, qText, optA, optB, optC, optD, answer] = match;

    const question = cleanText(qText);
    const options = [optA, optB, optC, optD].map(cleanText);
    const hasEmptyOption = options.some(o => !o || o.length < 1);

    const base = {
      grade: meta.grade,
      subject: meta.subject,
      topic: meta.topic,
      question,
      option_a: options[0],
      option_b: options[1],
      option_c: options[2],
      option_d: options[3],
      correct_answer: answer ? answer.toUpperCase() : null,
      difficulty: guessDifficulty(question),
      source_book: meta.source_book || null,
      source_page: null, // sahifa raqami PDF sahifa-bo'lish orqali alohida hisoblanadi (server tomonida)
      source_question_no: num,
    };

    // Javob topilmagan yoki variant bo'sh bo'lsa — OCR xatosi (qo'lda to'ldirish kerak)
    if (!answer || hasEmptyOption || question.length < 3) {
      results.ocrError.push(base);
    } else {
      results.review.push(base);
    }
  }

  return { ...results, totalFound: foundCount };
}

module.exports = { parseQuestions, guessDifficulty };
