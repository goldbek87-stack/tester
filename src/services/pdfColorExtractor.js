/**
 * PDF COLOR EXTRACTOR
 *
 * Ko'plab test kitoblarida to'g'ri javob so'z bilan ("Javob: B") emas,
 * balki QIZIL RANGDA bosilgan bo'ladi. Oddiy matn ajratish (pdf-parse)
 * rangni yo'qotib qo'yadi, shuning uchun bu modul pastki darajadagi
 * pdf.js operator-list orqali har bir matn bo'lagining rangini ham
 * chiqarib beradi.
 *
 * Natija: har bir sahifa uchun "qatorlar" ro'yxati, har bir qator esa
 * {text, isRed} segmentlaridan iborat — shu orqali "C) 5" ning aynan
 * qizil ekanini bilib olamiz.
 */

// pdf.js eski (v1.10.100) qurilmasi brauzer muhitini kutadi (document, FontFace).
// Node'da bular yo'q, shuning uchun zararsiz "stub"lar bilan almashtiramiz —
// bu faqat shrift yuklash xatosining oldini oladi, natijaga ta'sir qilmaydi.
function ensureBrowserStubs() {
  if (!global.FontFace) {
    global.FontFace = class { constructor() { this.loaded = Promise.resolve(); } };
  }
  if (!global.document) {
    global.document = {
      createElement: () => ({ sheet: { insertRule: () => {}, cssRules: [] }, remove: () => {} }),
      documentElement: { getElementsByTagName: () => [{ appendChild: () => {} }] },
      fonts: { delete: () => {}, add: () => {} },
    };
  }
}

let cachedPDFJS = null;
async function getPDFJS(buffer) {
  if (cachedPDFJS) return cachedPDFJS;
  ensureBrowserStubs();
  const pdfParse = require('pdf-parse');
  await pdfParse(buffer); // pdf-parse ichki modulni birinchi marta yuklab, keshga qo'yadi
  cachedPDFJS = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  return cachedPDFJS;
}

function isRedColor([r, g, b]) {
  return r > 140 && g < 110 && b < 110;
}

/**
 * Bitta sahifadagi matnni {text, isRed} segmentlariga ega qatorlar
 * ro'yxati sifatida qaytaradi.
 */
async function extractPageLines(PDFJS, page) {
  const OPS = PDFJS.OPS;
  const [textContent, opList] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);

  // Ketma-ket showText chaqiruvlarini, rang o'zgarmaguncha, bitta "run" deb hisoblaymiz.
  // Bu runlar soni deyarli har doim textContent.items soniga teng chiqadi,
  // chunki rang o'zgarishi PDF generatorda odatda yangi matn segmentini boshlaydi.
  const runs = [];
  let currentColor = [0, 0, 0];
  let inRun = false;

  for (let i = 0; i < opList.fnArray.length; i++) {
    const fn = opList.fnArray[i];
    const args = opList.argsArray[i];

    if (fn === OPS.setFillRGBColor) {
      currentColor = args;
      inRun = false;
    } else if (fn === OPS.setFillGray) {
      const g = args[0] * 255;
      currentColor = [g, g, g];
      inRun = false;
    } else if (fn === OPS.showText || fn === OPS.showSpacedText) {
      if (!inRun) {
        runs.push({ color: [...currentColor] });
        inRun = true;
      }
    }
  }

  // Har bir matn itemini navbatdagi run rangi bilan bog'laymiz.
  // (Runlar soni item sonidan kam bo'lib qolsa — qolganlarini qora deb olamiz.)
  const taggedItems = textContent.items.map((item, idx) => ({
    text: item.str,
    y: Math.round(item.transform[5]),
    isRed: runs[idx] ? isRedColor(runs[idx].color) : false,
  }));

  // Bir xil Y koordinatadagi itemlarni bitta "qator"ga yig'amiz (segmentlarni saqlab qolgan holda)
  const lines = [];
  let currentLine = null;
  taggedItems.forEach((item) => {
    if (!item.text.trim()) return;
    if (currentLine && Math.abs(currentLine.y - item.y) <= 1) {
      currentLine.segments.push({ text: item.text, isRed: item.isRed });
    } else {
      currentLine = { y: item.y, segments: [{ text: item.text, isRed: item.isRed }] };
      lines.push(currentLine);
    }
  });

  return lines;
}

/**
 * @param {Buffer} buffer - PDF fayl
 * @returns {Promise<Array<Array<{y:number, segments:Array<{text,isRed}>}>>>} sahifalar -> qatorlar
 */
async function extractColoredPages(buffer) {
  const PDFJS = await getPDFJS(buffer);
  const doc = await PDFJS.getDocument(buffer);
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    pages.push(await extractPageLines(PDFJS, page));
  }
  doc.destroy();
  return pages;
}

module.exports = { extractColoredPages };
