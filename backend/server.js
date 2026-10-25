const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Listar utilizadores
app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar utilizadores' });
  }
});

// Criar utilizador
app.post('/api/users', async (req, res) => {
  const { name, email } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar utilizador' });
  }
});

// Criar calendário
app.post('/api/calendars', async (req, res) => {
  const { name, owner_id } = req.body;
  try {
    const result = await pool.query(
      'INSERT INTO calendars (name, owner_id) VALUES ($1, $2) RETURNING *',
      [name, owner_id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar calendário' });
  }
});

// Listar calendários de um utilizador
app.get('/api/calendars/:owner_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM calendars WHERE owner_id = $1',
      [req.params.owner_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar calendários' });
  }
});

// Criar evento
app.post('/api/events', async (req, res) => {
  const { calendar_id, title, description, start_time, end_time } = req.body;
  try {
    const result = await pool.query(
      `INSERT INTO events (calendar_id, title, description, start_time, end_time)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [calendar_id, title, description, start_time, end_time]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar evento' });
  }
});

// Listar eventos de um calendário
app.get('/api/events/:calendar_id', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM events WHERE calendar_id = $1 ORDER BY start_time',
      [req.params.calendar_id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar eventos' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr em http://localhost:${PORT}`);
});