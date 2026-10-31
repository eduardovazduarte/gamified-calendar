const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('./db');

const router = express.Router();

const signToken = (user) =>
  jwt.sign({ id: user.id }, process.env.JWT_SECRET, { expiresIn: '7d' });

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  xp: u.xp,
  level: u.level,
});

// Middleware: exige um token válido
function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token em falta' });
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

// Registo
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Nome, email e password são obrigatórios' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'A password deve ter pelo menos 8 caracteres' });
  }

  try {
    const hash = await bcrypt.hash(password, 12);
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING *',
      [name.trim(), email.trim().toLowerCase(), hash]
    );
    const user = result.rows[0];

    // Calendário por defeito para o novo utilizador
    await pool.query(
      'INSERT INTO calendars (name, owner_id) VALUES ($1, $2)',
      ['Calendário Pessoal', user.id]
    );

    res.status(201).json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Já existe uma conta com este email' });
    }
    console.error(err);
    res.status(500).json({ error: 'Erro ao registar' });
  }
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email e password são obrigatórios' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email.trim().toLowerCase()]
    );
    const user = result.rows[0];
    const ok = user && user.password_hash &&
      (await bcrypt.compare(password, user.password_hash));

    if (!ok) {
      return res.status(401).json({ error: 'Email ou password incorretos' });
    }
    res.json({ token: signToken(user), user: publicUser(user) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao fazer login' });
  }
});

// Utilizador autenticado
router.get('/me', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, xp, level FROM users WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Utilizador não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar utilizador' });
  }
});

module.exports = { router, requireAuth };