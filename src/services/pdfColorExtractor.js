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
  const { createCanvas } = require('@napi-rs/canvas');
  if (!global.FontFace) {
    global.FontFace = class { constructor() { this.loaded = Promise.resolve(); } };
  }
  if (!global.document) {
    global.document = {
      createElement: (tag) => {
        if (tag === 'canvas') return createCanvas(1, 1);
        return { sheet: { insertRule: () => {}, cssRules: [] }, remove: () => {} };
      },
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
 * ro'yxati sifatida qaytaradi, HAR BIR QATORNING RASM (canvas) piksel
 * bo'yicha vertikal chegarasi (topY/bottomY) bilan birga.
 */
async function extractPageLines(PDFJS, page, viewport) {
  const OPS = PDFJS.OPS;
  const [textContent, opList] = await Promise.all([
    page.getTextContent(),
    page.getOperatorList(),
  ]);

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

  // viewport.transform = [a,0,0,d,e,f] — PDF koordinatasini canvas pikseliga o'giradi
  const [a, , , d, e, f] = viewport.transform;
  const toCanvasY = (pdfY) => d * pdfY + f;
  const toCanvasX = (pdfX) => a * pdfX + e;

  const taggedItems = textContent.items.map((item, idx) => {
    const fontSize = Math.abs(item.transform[0]) || 8;
    const pdfYBaseline = item.transform[5];
    const pdfYTop = pdfYBaseline + fontSize * 0.8;
    const pdfYBottom = pdfYBaseline - fontSize * 0.25;
    const pdfXLeft = item.transform[4];
    const pdfXRight = item.transform[4] + (item.width || 0);
    return {
      text: item.str,
      y: Math.round(item.transform[5]),
      isRed: runs[idx] ? isRedColor(runs[idx].color) : false,
      canvasYTop: toCanvasY(pdfYTop),
      canvasYBottom: toCanvasY(pdfYBottom),
      canvasXLeft: toCanvasX(pdfXLeft),
      canvasXRight: toCanvasX(pdfXRight),
    };
  });

  const lines = [];
  let currentLine = null;
  taggedItems.forEach((item) => {
    if (!item.text.trim()) return;
    if (currentLine && Math.abs(currentLine.y - item.y) <= 1) {
      currentLine.segments.push({ text: item.text, isRed: item.isRed });
      currentLine.canvasYTop = Math.min(currentLine.canvasYTop, item.canvasYTop);
      currentLine.canvasYBottom = Math.max(currentLine.canvasYBottom, item.canvasYBottom);
      currentLine.canvasXLeft = Math.min(currentLine.canvasXLeft, item.canvasXLeft);
      currentLine.canvasXRight = Math.max(currentLine.canvasXRight, item.canvasXRight);
    } else {
      currentLine = {
        y: item.y,
        segments: [{ text: item.text, isRed: item.isRed }],
        canvasYTop: item.canvasYTop,
        canvasYBottom: item.canvasYBottom,
        canvasXLeft: item.canvasXLeft,
        canvasXRight: item.canvasXRight,
      };
      lines.push(currentLine);
    }
  });

  return lines;
}

/**
 * @param {Buffer} buffer - PDF fayl
 * @param {object} opts - { renderImages: boolean } — rasm kerak bo'lmasa false qilib tezlashtirish mumkin
 * @returns {Promise<Array<{lines, canvas, width, height}>>} har bir sahifa uchun qatorlar + render qilingan rasm
 */
async function extractColoredPages(buffer, opts = {}) {
  const { renderImages = true } = opts;
  const { createCanvas } = require('@napi-rs/canvas');
  const PDFJS = await getPDFJS(buffer);
  const doc = await PDFJS.getDocument(buffer);
  const pages = [];

  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport(2.0); // 2x — kichik matnlar ham aniq ko'rinishi uchun
    const lines = await extractPageLines(PDFJS, page, viewport);

    let canvas = null;
    if (renderImages) {
      try {
        canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page.render({ canvasContext: ctx, viewport }).promise;
      } catch (err) {
        console.error(`[import] Sahifa ${i} rasmga render qilinmadi:`, err.message);
        canvas = null; // shu sahifadagi savollar rasmsiz, faqat matn bilan qoladi
      }
    }

    pages.push({ lines, canvas, width: viewport.width, height: viewport.height });
  }

  doc.destroy();
  return pages;
}

module.exports = { extractColoredPages };
