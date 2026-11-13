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

const RRULE_PATTERN = /^FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)(;[A-Z]+=[A-Z0-9,+-]+)*$/;

function normalizeRrule(value) {
  if (value === undefined || value === null || value === '') return null;
  return typeof value === 'string' && RRULE_PATTERN.test(value) ? value : false;
}

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
  const rrule = normalizeRrule(req.body.rrule);
  if (rrule === false) {
    return res.status(400).json({ error: 'Regra de repetição inválida' });
  }
  try {
    if (!(await ownsCalendar(calendar_id, req.user.id))) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }
    const result = await pool.query(
      `INSERT INTO events (calendar_id, title, description, start_time, end_time, rrule)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [calendar_id, title, description, start_time, end_time, rrule]
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
  const rrule = normalizeRrule(req.body.rrule);
  if (rrule === false) {
    return res.status(400).json({ error: 'Regra de repetição inválida' });
  }
  try {
    const result = await pool.query(
      `UPDATE events
       SET title = $1, description = $2, start_time = $3, end_time = $4, rrule = $5
       WHERE id = $6
         AND calendar_id IN (SELECT id FROM calendars WHERE owner_id = $7)
       RETURNING *`,
      [title, description, start_time, end_time, rrule, req.params.id, req.user.id]
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

// ---------- APAGAR EVENTOS (com repetições) ----------

const OCCURRENCE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/;

// "2026-11-10" -> "2026-11-09"
function dayBefore(isoDay) {
  const d = new Date(`${isoDay}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Põe um UNTIL na regra. O COUNT sai, porque não pode coexistir com o UNTIL.
function rruleWithUntil(rrule, untilDay) {
  const parts = rrule
    .split(';')
    .filter(Boolean)
    .map((p) => p.split('='))
    .filter(([key]) => key !== 'COUNT' && key !== 'UNTIL');
  parts.push(['UNTIL', `${untilDay.replace(/-/g, '')}T235959`]);
  return parts.map(([key, value]) => `${key}=${value}`).join(';');
}

app.delete('/api/events/:id', async (req, res) => {
  try {
    const scope = req.query.scope || 'all';
    const occurrence = req.query.occurrence;

    // Procura o evento (só se for do utilizador autenticado)
    const found = await pool.query(
      `SELECT *, to_char(start_time, 'YYYY-MM-DD') AS start_day
       FROM events
       WHERE id = $1
         AND calendar_id IN (SELECT id FROM calendars WHERE owner_id = $2)`,
      [req.params.id, req.user.id]
    );
    if (found.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    const event = found.rows[0];

    // "só esta" e "esta e seguintes" só fazem sentido em eventos repetidos
    if ((scope === 'this' || scope === 'following') && event.rrule) {
      if (!OCCURRENCE_PATTERN.test(occurrence || '')) {
        return res.status(400).json({ error: 'Ocorrência inválida' });
      }

      if (scope === 'this') {
        await pool.query(
          'UPDATE events SET exdates = array_append(exdates, $1) WHERE id = $2',
          [occurrence, event.id]
        );
        return res.json({ message: 'Ocorrência apagada com sucesso' });
      }

      // scope === 'following': corta a série no dia anterior
      const untilDay = dayBefore(occurrence.slice(0, 10));
      if (untilDay >= event.start_day) {
        await pool.query('UPDATE events SET rrule = $1 WHERE id = $2', [
          rruleWithUntil(event.rrule, untilDay),
          event.id,
        ]);
        return res.json({ message: 'Ocorrências apagadas com sucesso' });
      }
      // se não sobra nenhuma ocorrência antes desta, apaga o evento todo
    }

    await pool.query('DELETE FROM events WHERE id = $1', [event.id]);
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