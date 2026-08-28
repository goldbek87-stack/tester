const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-ozgartiring';

function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Tizimga kirilmagan (token yo\'q)' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.teacherId = payload.teacher_id;
    req.teacherName = payload.full_name;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Token yaroqsiz yoki muddati tugagan' });
  }
}

module.exports = { requireAuth, JWT_SECRET };
