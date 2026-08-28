// 6 xonali noyob test kodi generatsiya qiladi (masalan "847291")
function generateTestCode() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// Fisher-Yates - massivni tasodifiy aralashtirish (savollarni "aralashtirish" uchun)
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

module.exports = { generateTestCode, shuffle };
