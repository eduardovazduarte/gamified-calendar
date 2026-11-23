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

const COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

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

app.post('/api/calendars', async (req, res) => {
  const { name, color } = req.body;
  if (!name) {
    return res.status(400).json({ error: 'O nome é obrigatório' });
  }
  if (color && !COLOR_PATTERN.test(color)) {
    return res.status(400).json({ error: 'Cor inválida' });
  }
  try {
    const result = await pool.query(
      `INSERT INTO calendars (name, owner_id, color)
       VALUES ($1, $2, COALESCE($3, '#4f46e5')) RETURNING *`,
      [name, req.user.id, color || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar calendário' });
  }
});

app.put('/api/calendars/:id', async (req, res) => {
  const { name, color } = req.body;
  if (color && !COLOR_PATTERN.test(color)) {
    return res.status(400).json({ error: 'Cor inválida' });
  }
  try {
    const result = await pool.query(
      `UPDATE calendars
       SET name = COALESCE($1, name), color = COALESCE($2, color)
       WHERE id = $3 AND owner_id = $4 RETURNING *`,
      [name || null, color || null, req.params.id, req.user.id]
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
const EVENT_TYPES = ['event', 'task'];

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

// Todos os eventos de todos os calendários do utilizador
app.get('/api/events', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT e.*
       FROM events e
       JOIN calendars c ON c.id = e.calendar_id
       WHERE c.owner_id = $1
       ORDER BY e.start_time`,
      [req.user.id]
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
  const type = req.body.type || 'event';
  if (!EVENT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  try {
    if (!(await ownsCalendar(calendar_id, req.user.id))) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }
    const result = await pool.query(
      `INSERT INTO events (calendar_id, title, description, start_time, end_time, rrule, type)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [calendar_id, title, description, start_time, end_time, rrule, type]
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

  // type e calendar_id são opcionais: se não vierem, mantêm-se os valores atuais
  const type = req.body.type || null;
  if (type !== null && !EVENT_TYPES.includes(type)) {
    return res.status(400).json({ error: 'Tipo inválido' });
  }
  const calendarId = req.body.calendar_id == null ? null : Number(req.body.calendar_id);
  if (calendarId !== null && !Number.isInteger(calendarId)) {
    return res.status(400).json({ error: 'Calendário inválido' });
  }

  try {
    if (calendarId !== null && !(await ownsCalendar(calendarId, req.user.id))) {
      return res.status(404).json({ error: 'Calendário não encontrado' });
    }

    const result = await pool.query(
      `UPDATE events
       SET title = $1, description = $2, start_time = $3, end_time = $4, rrule = $5,
           calendar_id = COALESCE($6, calendar_id),
           type = COALESCE($7, type)
       WHERE id = $8
         AND calendar_id IN (SELECT id FROM calendars WHERE owner_id = $9)
       RETURNING *`,
      [title, description, start_time, end_time, rrule, calendarId, type, req.params.id, req.user.id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }

    // um evento não se conclui: se deixou de ser tarefa, apaga as conclusões
    if (result.rows[0].type === 'event') {
      await pool.query('DELETE FROM event_completions WHERE event_id = $1', [result.rows[0].id]);
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

// ---------- CONCLUSÃO DE EVENTOS ----------

// Verifica se um evento pertence ao utilizador
async function ownsEvent(eventId, userId) {
  const result = await pool.query(
    `SELECT 1 FROM events e
     JOIN calendars c ON c.id = e.calendar_id
     WHERE e.id = $1 AND c.owner_id = $2`,
    [eventId, userId]
  );
  return result.rowCount > 0;
}

// Verifica se é uma tarefa do utilizador (só as tarefas se concluem)
async function ownsTask(eventId, userId) {
  const result = await pool.query(
    `SELECT 1 FROM events e
     JOIN calendars c ON c.id = e.calendar_id
     WHERE e.id = $1 AND c.owner_id = $2 AND e.type = 'task'`,
    [eventId, userId]
  );
  return result.rowCount > 0;
}

// Todas as conclusões do utilizador
app.get('/api/completions', requireAuth, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT ec.event_id, ec.occurrence
       FROM event_completions ec
       JOIN events e ON e.id = ec.event_id
       JOIN calendars c ON c.id = e.calendar_id
       WHERE c.owner_id = $1`,
      [req.user.id]
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao buscar conclusões' });
  }
});

// Marcar uma ocorrência como concluída
app.post('/api/events/:id/complete', async (req, res) => {
  const { occurrence } = req.body;
  if (!OCCURRENCE_PATTERN.test(occurrence || '')) {
    return res.status(400).json({ error: 'Ocorrência inválida' });
  }
  try {
    if (!(await ownsTask(req.params.id, req.user.id))) {
      return res.status(404).json({ error: 'Tarefa não encontrada' });
    }
    await pool.query(
      `INSERT INTO event_completions (event_id, occurrence)
       VALUES ($1, $2)
       ON CONFLICT (event_id, occurrence) DO NOTHING`,
      [req.params.id, occurrence]
    );
    res.status(201).json({ message: 'Evento concluído' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao concluir evento' });
  }
});

// Desmarcar uma ocorrência
app.delete('/api/events/:id/complete', async (req, res) => {
  const occurrence = req.query.occurrence;
  if (!OCCURRENCE_PATTERN.test(occurrence || '')) {
    return res.status(400).json({ error: 'Ocorrência inválida' });
  }
  try {
    if (!(await ownsEvent(req.params.id, req.user.id))) {
      return res.status(404).json({ error: 'Evento não encontrado' });
    }
    await pool.query(
      'DELETE FROM event_completions WHERE event_id = $1 AND occurrence = $2',
      [req.params.id, occurrence]
    );
    res.json({ message: 'Conclusão removida' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao remover conclusão' });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor a correr em http://localhost:${PORT}`);
});