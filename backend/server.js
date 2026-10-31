const express = require('express');
const cors = require('cors');
require('dotenv').config();
const pool = require('./db');
const { router: authRouter, requireAuth } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

// Rotas públicas
app.use('/api/auth', authRouter);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Tudo o que vem a seguir exige login
app.use('/api/calendars', requireAuth);
app.use('/api/events', requireAuth);

// Verifica se um calendário pertence ao utilizador
async function ownsCalendar(calendarId, userId) {
  const result = await pool.query(
    'SELECT 1 FROM calendars WHERE id = $1 AND owner_id = $2',
    [calendarId, userId]
  );
  return result.rowCount > 0;
}

// ---------- CALENDÁRIOS ----------

// Listar os calendários do utilizador
app.get('/api/calendars', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM calendars WHERE owner_id = $1 ORDER BY id',
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar calendários' });
  }
});

// Criar calendário
app.post('/api/calendars', async (req, res) => {
  const { name } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'O nome é obrigatório' });
  }
  try {
    const result = await pool.query(
      'INSERT INTO calendars (name, owner_id) VALUES ($1, $2) RETURNING *',
      [name, req.user.id]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar calendário' });
  }
});

// Editar calendário
app.put('/api/calendars/:id', async (req, res) => {
  const { name } = req.body;
  try {
    const result = await pool.query(
      'UPDATE calendars SET name = $1 WHERE id = $2 AND owner_id = $3 RETURNING *',
      [name, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao editar calendário' });
  }
});

// Apagar calendário (e os seus eventos)
app.delete('/api/calendars/:id', async (req, res) => {
  try {
    if (!(await ownsCalendar(req.params.id, req.user.id))) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }
    await pool.query('DELETE FROM events WHERE calendar_id = $1', [req.params.id]);
    await pool.query('DELETE FROM calendars WHERE id = $1', [req.params.id]);
    res.json({ message: 'Calendário apagado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao apagar calendário' });
  }
});

// ---------- EVENTOS ----------

// Listar eventos de um calendário
app.get('/api/events/:calendar_id', async (req, res) => {
  try {
    if (!(await ownsCalendar(req.params.calendar_id, req.user.id))) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }
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

// Criar evento
app.post('/api/events', async (req, res) => {
  const { calendar_id, title, description, start_time, end_time } = req.body;
  try {
    if (!(await ownsCalendar(calendar_id, req.user.id))) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }
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

// Editar evento
app.put('/api/events/:id', async (req, res) => {
  const { title, description, start_time, end_time } = req.body;
  try {
    const result = await pool.query(
      `UPDATE events
       SET title = $1, description = $2, start_time = $3, end_time = $4
       WHERE id = $5
         AND calendar_id IN (SELECT id FROM calendars WHERE owner_id = $6)
       RETURNING *`,
      [title, description, start_time, end_time, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao editar evento' });
  }
});

// Apagar evento
app.delete('/api/events/:id', async (req, res) => {
  try {
    const result = await pool.query(
      `DELETE FROM events
       WHERE id = $1
         AND calendar_id IN (SELECT id FROM calendars WHERE owner_id = $2)
       RETURNING *`,
      [req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    res.json({ message: 'Evento apagado com sucesso' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao apagar evento' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor a correr em http://localhost:${PORT}`);
});