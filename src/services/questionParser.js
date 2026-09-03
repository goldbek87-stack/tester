/**
 * QUESTION PARSER v2 — endi ikki xil formatni qo'llab-quvvatlaydi:
 *
 * FORMAT 1 (rang bilan):
 *   1. Savol matni?
 *   A) 1   B) 6   C) 5   D) 0      <- to'g'ri javob QIZIL rangda bosilgan
 *
 * FORMAT 2 (matn bilan):
 *   1. Savol matni?
 *   A) variant1
 *   B) variant2
 *   C) variant3
 *   D) variant4
 *   Javob: B
 *
 * Ikkalasi ham qo'llab-quvvatlanadi: avval rangga qaraladi (aynan bitta
 * variant qizil bo'lsa — shu to'g'ri javob), topilmasa "Javob:" matniga
 * qaraladi, u ham topilmasa — javob noaniq deb "ocr_error"ga tushadi.
 */

const QUESTION_NUM_RE = /^(\d{1,4})[.\)]\s*(.*)$/;
const OPTION_LINE_HINT_RE = /\b[A-D][.\)]\s/;
const JAVOB_RE = /(Javob|To['\u2018\u2019]g['\u2018\u2019]ri\s*javob|Javobi)\s*[:\-]?\s*([A-D])/i;

function guessDifficulty(questionText) {
  const wordCount = questionText.trim().split(/\s+/).filter(Boolean).length;
  if (wordCount <= 8) return 'easy';
  if (wordCount <= 16) return 'medium';
  return 'hard';
}

function cleanText(s) {
  return s.replace(/\s+/g, ' ').trim();
}

function lineText(line) {
  return line.segments.map((s) => s.text).join('');
}

function isRedColor(rgb) {
  return rgb && rgb[0] > 140 && rgb[1] < 110 && rgb[2] < 110;
}

/**
 * Bir nechta qatorning segmentlarini bitta "blob"ga birlashtirib,
 * har bir A/B/C/D variantini (matnini VA rangini) ajratib oladi.
 */
function extractOptionsFromLines(optionLines) {
  let fullText = '';
  const redRanges = [];

  optionLines.forEach((line) => {
    line.segments.forEach((seg) => {
      const start = fullText.length;
      fullText += seg.text;
      if (seg.isRed) redRanges.push([start, fullText.length]);
    });
    fullText += '\n';
  });

  const labelRe = /(?:^|[\s\n])([A-D])[.\)]\s*/g;
  const labels = [];
  let m;
  while ((m = labelRe.exec(fullText)) !== null) {
    labels.push({ letter: m[1], labelStart: m.index, valueStart: m.index + m[0].length });
  }

  const options = {};
  let anyRed = null;

  labels.forEach((lab, i) => {
    const valueEnd = i + 1 < labels.length ? labels[i + 1].labelStart : fullText.length;
    const value = cleanText(fullText.slice(lab.valueStart, valueEnd));
    if (!value) return;
    options[lab.letter] = value;

    const isRed = redRanges.some(([rs, re]) => rs < valueEnd && re > lab.labelStart);
    if (isRed) anyRed = anyRed === null ? lab.letter : 'MULTIPLE';
  });

  return { options, colorAnswer: anyRed && anyRed !== 'MULTIPLE' ? anyRed : null, fullText };
}

/**
 * @param {Array<{y:number, segments:Array<{text,isRed}>}>} pageLines
 * @param {object} meta - { grade, subject, topic, source_book }
 */
function parseQuestionsFromLines(pageLines, meta) {
  const plainLines = pageLines.map((l) => cleanText(lineText(l)));

  // Har bir savol boshlanishi ("1.", "2." kabi) indekslarini topamiz
  const startIdxs = [];
  plainLines.forEach((text, idx) => {
    if (QUESTION_NUM_RE.test(text)) startIdxs.push(idx);
  });

  const review = [];
  const ocrError = [];
  let totalFound = 0;

  startIdxs.forEach((startIdx, i) => {
    const endIdx = i + 1 < startIdxs.length ? startIdxs[i + 1] : pageLines.length;
    const blockLines = pageLines.slice(startIdx, endIdx);
    const blockPlain = plainLines.slice(startIdx, endIdx);

    // Birinchi qatordan savol raqamini ajratamiz
    const firstMatch = blockPlain[0].match(QUESTION_NUM_RE);
    if (!firstMatch) return;
    const questionNo = firstMatch[1];

    // Qaysi qatordan variantlar boshlanishini topamiz (birinchi "A)" uchraган joy)
    let optionStart = blockPlain.findIndex((t) => OPTION_LINE_HINT_RE.test(t));
    if (optionStart === -1) return; // variant topilmadi — bu savol emas

    const questionTextRaw = [firstMatch[2], ...blockPlain.slice(1, optionStart)].join(' ');
    const question = cleanText(questionTextRaw);
    if (!question) return;

    totalFound++;

    // Savol matni (variantlargacha bo'lgan qatorlar)ning rasm uchun chegarasi.
    // Agar savol va birinchi variant BITTA qatorda bo'lsa (optionStart === 0),
    // baribir shu qatorning o'zini rasmga olamiz (bo'sh chegara hosil bo'lmasligi uchun).
    const questionOnlyLines = blockLines.slice(0, Math.max(1, optionStart));
    const imageTop = Math.min(...questionOnlyLines.map((l) => l.canvasYTop));
    const imageBottom = Math.max(...questionOnlyLines.map((l) => l.canvasYBottom));
    const imageLeft = Math.min(...questionOnlyLines.map((l) => l.canvasXLeft));
    const imageRight = Math.max(...questionOnlyLines.map((l) => l.canvasXRight));

    const optionLines = blockLines.slice(optionStart);
    const { options, colorAnswer, fullText } = extractOptionsFromLines(optionLines);

    const hasAllOptions = ['A', 'B', 'C', 'D'].every((l) => options[l]);

    let correctAnswer = colorAnswer;
    if (!correctAnswer) {
      const javobMatch = fullText.match(JAVOB_RE);
      if (javobMatch) correctAnswer = javobMatch[2].toUpperCase();
    }

    const base = {
      grade: meta.grade,
      subject: meta.subject,
      topic: meta.topic,
      question,
      option_a: options.A || '',
      option_b: options.B || '',
      option_c: options.C || '',
      option_d: options.D || '',
      correct_answer: correctAnswer || null,
      difficulty: guessDifficulty(question),
      source_book: meta.source_book || null,
      source_question_no: questionNo,
      imageBounds: { top: imageTop, bottom: imageBottom, left: imageLeft, right: imageRight },
    };

    if (!hasAllOptions || !correctAnswer) {
      ocrError.push(base);
    } else {
      review.push(base);
    }
  });

  return { review, ocrError, totalFound };
}

module.exports = { parseQuestionsFromLines, guessDifficulty };
