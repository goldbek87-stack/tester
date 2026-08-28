# Test Platform — 1-bosqich (Server + PostgreSQL + API)

## Ishga tushirish
1. PostgreSQL o'rnating, `test_platform` nomli baza yarating
2. `.env` faylida DATABASE_URL ni sozlang
3. `psql -d test_platform -f db/schema.sql`
4. `psql -d test_platform -f db/seed.sql`  (10 ta namunaviy savol)
5. `npm install`
6. `npm start`  → http://localhost:3000

## API endpointlar
- `POST /api/tests` — o'qituvchi test yaratadi
  body: `{ grade, subject, topic, easy_count, medium_count, hard_count, duration_min }`
- `GET /api/tests/:code` — o'quvchi savollarni oladi (javoblarsiz)
- `POST /api/attempts/start` — o'quvchi testni boshlaydi
  body: `{ test_code, student_name }`
- `POST /api/attempts/:id/submit` — javoblarni yuboradi, server tekshiradi
  body: `{ answers: [{ question_id, selected_answer }] }`
- `GET /api/attempts/by-test/:test_code` — o'qituvchi natijalarni ko'radi

## Keyingi qadamlar
- 2-bosqich: O'qituvchi web paneli (frontend)
- 3-bosqich: Android APK (WebView yoki native)
- 4-bosqich: Kitobdan OCR + AI orqali savol import qilish
- 5-bosqich: Statistika (savol bo'yicha % to'g'ri javob, mavzu tahlili)
