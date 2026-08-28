const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const { JWT_SECRET } = require('../middleware/auth');

/**
 * POST /api/auth/login
 * Body: { login, password }
 */
router.post('/login', async (req, res) => {
  const { login, password } = req.body;
  if (!login || !password) {
    return res.status(400).json({ error: 'login va password kerak' });
  }

  const result = await pool.query('SELECT * FROM teachers WHERE login = $1', [login]);
  if (result.rowCount === 0) {
    return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri' });
  }

  const teacher = result.rows[0];
  const ok = await bcrypt.compare(password, teacher.password);
  if (!ok) {
    return res.status(401).json({ error: 'Login yoki parol noto\'g\'ri' });
  }

  const token = jwt.sign(
    { teacher_id: teacher.id, full_name: teacher.full_name },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  res.json({ token, teacher: { id: teacher.id, full_name: teacher.full_name, login: teacher.login } });
});

module.exports = router;
