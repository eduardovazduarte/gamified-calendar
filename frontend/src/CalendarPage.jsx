import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import FullCalendar from '@fullcalendar/react';
import themePlugin from '@fullcalendar/react/themes/classic';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import interactionPlugin from '@fullcalendar/react/interaction';
import rrulePlugin from '@fullcalendar/rrule';

import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';

import api from './api';
import { useAuth } from './AuthContext';

const emptyForm = {
  title: '',
  description: '',
  start_time: '',
  end_time: '',
  repeat: 'none',
  repeat_until: '',
  base_rrule: '',
  byday: [],
  bymonthday: '',
  calendar_id: '',
  type: 'event',
  all_day: false,
};

// A BD devolve "2026-11-03 18:00:00" (sem fuso) -> "2026-11-03T18:00:00"
const toIso = (s) => s.replace(' ', 'T').slice(0, 19);
const toInputFormat = (s) => toIso(s).slice(0, 16);

// Date (hora local) -> "2026-11-10T18:00:00"
const toLocalIso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};

// "FREQ=WEEKLY;BYDAY=TU,TH" -> { FREQ: 'WEEKLY', BYDAY: 'TU,TH' }
const parseRrule = (rrule) =>
  Object.fromEntries(
    (rrule || '').split(';').filter(Boolean).map((p) => p.split('='))
  );

const WEEKDAYS = [
  ['MO', 'Seg'], ['TU', 'Ter'], ['WE', 'Qua'], ['TH', 'Qui'],
  ['FR', 'Sex'], ['SA', 'Sáb'], ['SU', 'Dom'],
];

const PALETTE = ['#4f46e5', '#16a34a', '#dc2626', '#d97706', '#0891b2', '#c026d3', '#64748b'];

// "1, 10, 40, x" -> "1,10" (só dias válidos, de 1 a 31)
const cleanMonthDays = (text) =>
  (text || '')
    .split(',')
    .map((d) => d.trim())
    .filter((d) => /^([1-9]|[12]\d|3[01])$/.test(d))
    .join(',');

// Constrói a RRULE a partir do formulário.
// Mantém parâmetros extra (ex: BYDAY) se a frequência não foi alterada.
const buildRrule = (repeat, untilDate, baseRrule, byday = [], bymonthday = '') => {
  if (repeat === 'none') return null;
  const base = parseRrule(baseRrule);
  const parts = base.FREQ === repeat ? { ...base } : { FREQ: repeat };

  if (repeat === 'WEEKLY') {
    if (byday.length) parts.BYDAY = byday.join(',');
    else delete parts.BYDAY;
  }
  if (repeat === 'MONTHLY') {
    const days = cleanMonthDays(bymonthday);
    if (days) parts.BYMONTHDAY = days;
    else delete parts.BYMONTHDAY;
  }

  if (untilDate) {
    delete parts.COUNT;
    parts.UNTIL = `${untilDate.replace(/-/g, '')}T235959`;
  } else {
    delete parts.UNTIL;
  }
  return Object.entries(parts).map(([k, v]) => `${k}=${v}`).join(';');
};

// "20261231T235959" -> "2026-12-31"
const untilToInput = (until) =>
  until ? `${until.slice(0, 4)}-${until.slice(4, 6)}-${until.slice(6, 8)}` : '';

export default function CalendarPage() {
  const { user, logout } = useAuth();
  const [calendars, setCalendars] = useState([]);
  const [hidden, setHidden] = useState([]);
  const [colorFor, setColorFor] = useState(null);
  const [completions, setCompletions] = useState([]);
  const calendarsRef = useRef([]);
  const hiddenRef = useRef([]);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [occurrence, setOccurrence] = useState('');
  const [askDeleteScope, setAskDeleteScope] = useState(false);

    const [stats, setStats] = useState({
    xp: 0,
    level: 1,
    xp_per_level: 100,
    streak: 0,
    best_streak: 0,
    done_today: false,
  });

  const loadCalendars = useCallback(() => {
    api.get('/calendars').then(async (res) => {
      if (res.data.length > 0) {
        setCalendars(res.data);
      } else {
        const created = await api.post('/calendars', { name: 'Calendário Pessoal' });
        setCalendars([created.data]);
      }
    });
  }, []);

  useEffect(() => {
    calendarsRef.current = calendars;
    hiddenRef.current = hidden;
  }, [calendars, hidden]);

  // Eventos de todos os calendários; o filtro por calendário é feito no frontend
  const loadEvents = useCallback(() => {
    api.get('/events').then((res) => setEvents(res.data));
  }, []);

    const loadCompletions = useCallback(() => {
    api.get('/completions').then((res) =>
      setCompletions(res.data.map((c) => `${c.event_id}|${c.occurrence}`))
    );
  }, []);

  const loadStats = useCallback(() => {
    api.get('/stats').then((res) => setStats(res.data));
  }, []);

  const isTask = (eventId) =>
    events.some((e) => String(e.id) === String(eventId) && e.type === 'task');

  const calendarColorOf = (eventId) => {
    const ev = events.find((e) => String(e.id) === String(eventId));
    return calendars.find((c) => c.id === ev?.calendar_id)?.color;
  };

  const isDone = (eventId, date) =>
    isTask(eventId) && completions.includes(`${eventId}|${toLocalIso(date)}`);

  const editingIsTask =
    !!editingId && events.find((e) => e.id === editingId)?.type === 'task';

  useEffect(() => {
    loadCalendars();
    loadEvents();
    loadCompletions();
    loadStats();
  }, [loadCalendars, loadEvents, loadCompletions, loadStats]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toggleAllDay = (e) => {
    const checked = e.target.checked;
    setForm((f) => {
      const day = f.start_time.slice(0, 10);
      return {
        ...f,
        all_day: checked,
        ...(checked && day ? { start_time: `${day}T00:00`, end_time: `${day}T23:59` } : {}),
      };
    });
  };

  const handleDayChange = (e) => {
    const day = e.target.value;
    setForm((f) => ({
      ...f,
      start_time: day ? `${day}T00:00` : '',
      end_time: day ? `${day}T23:59` : '',
    }));
  };

  const toggleCalendar = (id) =>
  setHidden((h) => (h.includes(id) ? h.filter((x) => x !== id) : [...h, id]));

  const soloCalendar = (id) => {
    const onlyThis = calendars.every((c) =>
      c.id === id ? !hidden.includes(c.id) : hidden.includes(c.id)
    );
    setHidden(onlyThis ? [] : calendars.filter((c) => c.id !== id).map((c) => c.id));
  };

  const toggleDone = (eventId, occ) => {
    const done = completions.includes(`${eventId}|${occ}`);
    const request = done
      ? api.delete(`/events/${eventId}/complete`, { params: { occurrence: occ } })
      : api.post(`/events/${eventId}/complete`, { occurrence: occ });
    return request
      .then(() => {
        loadCompletions();
        loadStats();
        return true;
      })
      .catch(() => {
        alert('Não foi possível atualizar o estado da tarefa.');
        return false;
      });
  };

  const createCalendar = () => {
    const name = window.prompt('Nome do novo calendário:');
    if (!name || !name.trim()) return;
    api
      .post('/calendars', {
        name: name.trim(),
        color: PALETTE[calendars.length % PALETTE.length],
      })
      .then(loadCalendars);
  };

    const renameCalendar = (c) => {
    const name = window.prompt('Novo nome do calendário:', c.name);
    if (!name || !name.trim() || name.trim() === c.name) return;
    api.put(`/calendars/${c.id}`, { name: name.trim() }).then(loadCalendars);
  };

  const changeCalendarColor = (c, color) => {
    api.put(`/calendars/${c.id}`, { color }).then(() => {
      setColorFor(null);
      loadCalendars();
    });
  };

  const deleteCalendar = (c) => {
    if (calendars.length === 1) {
      alert('Tens de ter pelo menos um calendário.');
      return;
    }
    if (!window.confirm(`Apagar "${c.name}" e todos os seus eventos? Não dá para desfazer.`)) return;
    api.delete(`/calendars/${c.id}`).then(() => {
      setHidden((h) => h.filter((id) => id !== c.id));
      loadCalendars();
      loadEvents();
    });
  };

  const toggleWeekday = (code) =>
    setForm((f) => {
      const set = new Set(f.byday);
      if (set.has(code)) set.delete(code);
      else set.add(code);
      return { ...f, byday: WEEKDAYS.map(([c]) => c).filter((c) => set.has(c)) };
    });

  const getDefaultCalendarId = () => {
    const cals = calendarsRef.current;
    const cal = cals.find((c) => !hiddenRef.current.includes(c.id)) || cals[0];
    return cal ? cal.id : '';
  };

  const openNewEvent = () => {
    setEditingId(null);
    setForm({ ...emptyForm, calendar_id: getDefaultCalendarId() });
    setShowForm(true);
  };

  const handleDateClick = (info) => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      calendar_id: getDefaultCalendarId(),
      start_time: info.dateStr + 'T09:00',
      end_time: info.dateStr + 'T10:00',
    });
    setShowForm(true);
  };



  const handleEventClick = (info) => {
    const event = events.find((e) => String(e.id) === info.event.id);

    // clique no ícone da tarefa: conclui/desfaz sem abrir o formulário
    if (info.jsEvent.target.closest('.done-icon') && isTask(info.event.id)) {
      toggleDone(info.event.id, toLocalIso(info.event.start));
      return;
    }

    if (!event) return;
    const rule = parseRrule(event.rrule);
    setEditingId(event.id);
    setOccurrence(toLocalIso(info.event.start));
    setForm({
      title: event.title,
      calendar_id: event.calendar_id,
      type: event.type || 'event',
      all_day: !!event.all_day,
      description: event.description || '',
      start_time: toInputFormat(event.start_time),
      end_time: toInputFormat(event.end_time),
      repeat: rule.FREQ || 'none',
      repeat_until: untilToInput(rule.UNTIL),
      base_rrule: event.rrule || '',
      byday: rule.BYDAY ? rule.BYDAY.split(',') : [],
      bymonthday: rule.BYMONTHDAY || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
    setOccurrence('');
    setAskDeleteScope(false);
  };

   const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      calendar_id: Number(form.calendar_id),
      type: form.type,
      all_day: form.all_day,
      title: form.title,
      description: form.description,
      start_time: form.start_time,
      end_time: form.end_time,
      rrule: buildRrule(form.repeat, form.repeat_until, form.base_rrule, form.byday, form.bymonthday),
    };

    const request = editingId
      ? api.put(`/events/${editingId}`, payload)
      : api.post('/events', payload);

    request
      .then(() => {
        loadEvents();
        loadStats();
        closeForm();
      })
      .catch(() => alert('Não foi possível guardar o evento.'));
  };

  const deleteEvent = (scope = 'all') => {
    api
      .delete(`/events/${editingId}`, { params: { scope, occurrence } })
      .then(() => {
        loadEvents();
        closeForm();
      });
  };

  const handleDelete = () => {
    // evento repetido: pergunta primeiro o que apagar
    if (form.base_rrule) setAskDeleteScope(true);
    else deleteEvent();
  };

  const calendarEvents = useMemo(() => {
    const colors = Object.fromEntries(calendars.map((c) => [c.id, c.color]));

    return events
      .filter((e) => !hidden.includes(e.calendar_id))
      .map((e) => {
        const start = toIso(e.start_time);
        const end = toIso(e.end_time);
        const color = colors[e.calendar_id];

        if (!e.rrule) {
          if (e.all_day) {
            return { id: String(e.id), title: e.title, start: start.slice(0, 10), allDay: true, color };
          }
          return { id: String(e.id), title: e.title, start, end, allDay: false, color };
        }

        const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
        return {
          id: String(e.id),
          title: e.title,
          rrule: `DTSTART:${start.replace(/[-:]/g, '')}\nRRULE:${e.rrule}`,
          exdate: e.exdates || [],
          duration: e.all_day ? { days: 1 } : { minutes },
          allDay: !!e.all_day,
          color,
        };
      });
  }, [events, calendars, hidden]);

  return (
    <div className="page">

      <aside className="sidebar">

        <div className="level-card">
          <div className="level-title">Nível {stats.level}</div>
          <div className="xp-bar">
            <div
              className="xp-fill"
              style={{ width: `${((stats.xp % stats.xp_per_level) / stats.xp_per_level) * 100}%` }}
            />
          </div>
          <div className="xp-text">
            {stats.xp % stats.xp_per_level} / {stats.xp_per_level} XP · {stats.xp} no total
          </div>

          <div className="streak-row">
            <span className="streak-flame">🔥</span>
            <div>
              <div className="streak-count">
                {stats.streak} {stats.streak === 1 ? 'dia seguido' : 'dias seguidos'}
              </div>
              <div className="streak-note">
                {stats.done_today
                  ? 'Hoje já cumpriste'
                  : stats.streak > 0
                    ? 'Conclui uma tarefa hoje para manter a sequência'
                    : 'Conclui uma tarefa para começar'}
                {' · '}Recorde: {stats.best_streak}
              </div>
            </div>
          </div>

        </div>

        <h3>Calendários</h3>
                {calendars.map((c) => {
          const muted = hidden.includes(c.id);
          const solo =
            !muted &&
            calendars.length > 1 &&
            calendars.every((o) => o.id === c.id || hidden.includes(o.id));

          return (
            <div key={c.id}>
              <div className={`calendar-item${muted ? ' muted' : ''}`}>
                <button
                  type="button"
                  className="icon-button"
                  title="Mudar cor"
                  onClick={() => setColorFor(colorFor === c.id ? null : c.id)}
                >
                  <span className="color-dot" style={{ background: c.color }} />
                </button>

                <span className="calendar-name" title={c.name}>{c.name}</span>

                <button
                  type="button"
                  className={`pill-button${solo ? ' active' : ''}`}
                  title="Solo: ver só este calendário"
                  onClick={() => soloCalendar(c.id)}
                >
                  S
                </button>
                <button
                  type="button"
                  className={`pill-button${muted ? ' active' : ''}`}
                  title={muted ? 'Mostrar este calendário' : 'Silenciar: esconder este calendário'}
                  onClick={() => toggleCalendar(c.id)}
                >
                  M
                </button>

                <span className="row-actions">
                  <button type="button" className="icon-button" title="Renomear" onClick={() => renameCalendar(c)}>
                    ✎
                  </button>
                  <button type="button" className="icon-button" title="Apagar" onClick={() => deleteCalendar(c)}>
                    🗑
                  </button>
                </span>
              </div>

              {colorFor === c.id && (
                <div className="color-swatches">
                  {PALETTE.map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="swatch"
                      style={{ background: color }}
                      onClick={() => changeCalendarColor(c, color)}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {hidden.length > 0 && (
          <button type="button" className="link-button" onClick={() => setHidden([])}>
            Mostrar todos
          </button>
        )}
        
        <button type="button" className="btn-secondary" onClick={createCalendar}>
          + Novo calendário
        </button>
      </aside>

      <div className="calendar-wrapper">
        <FullCalendar
          plugins={[
            themePlugin,
            rrulePlugin,
            dayGridPlugin,
            timeGridPlugin,
            interactionPlugin,
          ]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'addEvent prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay logout',
          }}
          buttons={{
            addEvent: {
              text: '+ Novo evento',
              click: openNewEvent,
            },
            logout: {
              text: `Sair (${user.name})`,
              click: logout,
            },
          }}
          buttonClass={(info) =>
            info.isSelected ? 'my-button my-button-active' : 'my-button'
          }
          dayCellClass="my-cell"
          dayCellTopClass="my-day-top"
          events={calendarEvents}
          dateClick={handleDateClick}
                    eventClass={(arg) =>
            isDone(arg.event.id, arg.event.start) ? ['event-done'] : []
          }
          eventContent={(arg) => {
            const task = isTask(arg.event.id);
            const done = task && isDone(arg.event.id, arg.event.start);
            return (
              <>
                {task && (
                  <span className="done-icon" style={{ '--cal-color': calendarColorOf(arg.event.id) }}>
                    {done ? '✓' : '☐'}
                  </span>
                )}
                {arg.timeText && <b>{arg.timeText} </b>}
                <span>{arg.event.title}</span>
              </>
            );
          }}
          listItemEventClass="list-item-event"
          listItemEventBeforeClass={(data) =>
            isTask(data.event?.id) ? 'task-dot-hidden' : ''
          }
          eventClick={handleEventClick}
          height="100%"
        />
      </div>

      {showForm && (
        <div className="modal-overlay" onClick={closeForm}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{editingId ? 'Editar evento' : 'Novo evento'}</h3>
            <form onSubmit={handleSubmit}>
              <input
                name="title"
                placeholder="Título"
                value={form.title}
                onChange={handleChange}
                required
              />
              <input
                name="description"
                placeholder="Descrição"
                value={form.description}
                onChange={handleChange}
              />

              <label>Calendário
                <select
                  name="calendar_id"
                  value={form.calendar_id}
                  onChange={handleChange}
                >
                  {calendars.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </label>

              <label>Tipo
                <select name="type" value={form.type} onChange={handleChange}>
                  <option value="event">Evento</option>
                  <option value="task">Tarefa</option>
                </select>
              </label>

              <label className="check-row">
                <input type="checkbox" checked={form.all_day} onChange={toggleAllDay} />
                Todo o dia
              </label>

              {form.all_day ? (
                <label>Data
                  <input type="date" value={form.start_time.slice(0, 10)} onChange={handleDayChange} required />
                </label>
              ) : (
                <>
                  <label>Início
                    <input type="datetime-local" name="start_time" value={form.start_time} onChange={handleChange} required />
                  </label>
                  <label>Fim
                    <input type="datetime-local" name="end_time" value={form.end_time} onChange={handleChange} required />
                  </label>
                </>
              )}

              <label>Repetir
                <select name="repeat" value={form.repeat} onChange={handleChange}>
                  <option value="none">Não repete</option>
                  <option value="DAILY">Todos os dias</option>
                  <option value="WEEKLY">Todas as semanas</option>
                  <option value="MONTHLY">Todos os meses</option>
                  <option value="YEARLY">Todos os anos</option>
                </select>
              </label>

              {form.repeat === 'WEEKLY' && (
                <div className="weekday-picker">
                  {WEEKDAYS.map(([code, label]) => (
                    <label key={code}>
                      <input
                        type="checkbox"
                        checked={form.byday.includes(code)}
                        onChange={() => toggleWeekday(code)}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              )}

              {form.repeat === 'MONTHLY' && (
                <label>Dias do mês (ex: 1,10)
                  <input
                    name="bymonthday"
                    placeholder="Vazio = mesmo dia do evento"
                    value={form.bymonthday}
                    onChange={handleChange}
                  />
                </label>
              )}

              {form.repeat !== 'none' && (
                <label>Repetir até (opcional)
                  <input type="date" name="repeat_until" value={form.repeat_until} onChange={handleChange} />
                </label>
              )}


              {askDeleteScope && (
              <div className="delete-scope">
                <p>Apagar evento repetido:</p>
                <button type="button" className="btn-secondary" onClick={() => deleteEvent('this')}>
                  Só este evento
                </button>
                <button type="button" className="btn-secondary" onClick={() => deleteEvent('following')}>
                  Este e os seguintes
                </button>
                <button type="button" className="btn-danger" onClick={() => deleteEvent('all')}>
                  Todos os eventos
                </button>
                <button type="button" className="link-button" onClick={() => setAskDeleteScope(false)}>
                  Voltar
                </button>
              </div>
            )}

              {editingIsTask && (
                <button
                  type="button"
                  className={completions.includes(`${editingId}|${occurrence}`) ? 'btn-secondary btn-block' : 'btn-success btn-block'}
                  onClick={() => toggleDone(editingId, occurrence).then((ok) => ok && closeForm())}
                >
                  {completions.includes(`${editingId}|${occurrence}`)
                    ? 'Desfazer conclusão'
                    : form.base_rrule
                      ? 'Concluir esta ocorrência'
                      : 'Concluir tarefa'}
                </button>
              )}

              <div className="modal-actions">
                <button type="submit" className="btn-primary">
                  {editingId ? 'Guardar' : 'Criar'}
                </button>
                {editingId && (
                  <button type="button" className="btn-danger" onClick={handleDelete}>
                    Apagar
                  </button>
                )}
                <button type="button" className="btn-secondary" onClick={closeForm}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}