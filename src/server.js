require('dotenv').config();
const express = require('express');
const cors = require('cors');

const testsRouter = require('./routes/tests');
const attemptsRouter = require('./routes/attempts');
const metaRouter = require('./routes/meta');
const authRouter = require('./routes/auth');
const importRouter = require('./routes/import');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // O'qituvchi paneli: public/admin.html

app.get('/api/health', (req, res) => res.json({ status: 'ok', time: new Date() }));

app.use('/api/auth', authRouter);
app.use('/api/tests', testsRouter);
app.use('/api/attempts', attemptsRouter);
app.use('/api/meta', metaRouter);
app.use('/api/import', importRouter);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ Server ishlayapti: http://localhost:${PORT}`);
});
