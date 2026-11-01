import { useState, useEffect, useCallback, useMemo } from 'react';
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
};

// A BD devolve "2026-11-03 18:00:00" (sem fuso) -> "2026-11-03T18:00:00"
const toIso = (s) => s.replace(' ', 'T').slice(0, 19);
const toInputFormat = (s) => toIso(s).slice(0, 16);

// "FREQ=WEEKLY;BYDAY=TU,TH" -> { FREQ: 'WEEKLY', BYDAY: 'TU,TH' }
const parseRrule = (rrule) =>
  Object.fromEntries(
    (rrule || '').split(';').filter(Boolean).map((p) => p.split('='))
  );

// Constrói a RRULE a partir do formulário.
// Mantém parâmetros extra (ex: BYDAY) se a frequência não foi alterada.
const buildRrule = (repeat, untilDate, baseRrule) => {
  if (repeat === 'none') return null;
  const base = parseRrule(baseRrule);
  const parts = base.FREQ === repeat ? { ...base } : { FREQ: repeat };

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
  const [calendarId, setCalendarId] = useState(null);
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  // Descobre o calendário do utilizador (cria um se ainda não existir)
  useEffect(() => {
    api.get('/calendars').then(async (res) => {
      if (res.data.length > 0) {
        setCalendarId(res.data[0].id);
      } else {
        const created = await api.post('/calendars', { name: 'Calendário Pessoal' });
        setCalendarId(created.data.id);
      }
    });
  }, []);

  const loadEvents = useCallback(() => {
    if (!calendarId) return;
    api.get(`/events/${calendarId}`).then((res) => setEvents(res.data));
  }, [calendarId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const openNewEvent = () => {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  };

  const handleDateClick = (info) => {
    setEditingId(null);
    setForm({
      ...emptyForm,
      start_time: info.dateStr + 'T09:00',
      end_time: info.dateStr + 'T10:00',
    });
    setShowForm(true);
  };

  const handleEventClick = (info) => {
    const event = events.find((e) => String(e.id) === info.event.id);
    if (!event) return;
    const rule = parseRrule(event.rrule);
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description || '',
      start_time: toInputFormat(event.start_time),
      end_time: toInputFormat(event.end_time),
      repeat: rule.FREQ || 'none',
      repeat_until: untilToInput(rule.UNTIL),
      base_rrule: event.rrule || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      title: form.title,
      description: form.description,
      start_time: form.start_time,
      end_time: form.end_time,
      rrule: buildRrule(form.repeat, form.repeat_until, form.base_rrule),
    };

    const request = editingId
      ? api.put(`/events/${editingId}`, payload)
      : api.post('/events', { calendar_id: calendarId, ...payload });

    request.then(() => {
      loadEvents();
      closeForm();
    });
  };

  const handleDelete = () => {
    api.delete(`/events/${editingId}`).then(() => {
      loadEvents();
      closeForm();
    });
  };

  const calendarEvents = useMemo(
    () =>
      events.map((e) => {
        const start = toIso(e.start_time);
        const end = toIso(e.end_time);

        if (!e.rrule) {
          return { id: String(e.id), title: e.title, start, end };
        }

        const minutes = Math.round((new Date(end) - new Date(start)) / 60000);
        return {
          id: String(e.id),
          title: e.title,
          rrule: `DTSTART:${start.replace(/[-:]/g, '')}\nRRULE:${e.rrule}`,
          duration: { minutes },
        };
      }),
    [events]
  );

  return (
    <div className="page">
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
              <label>Início
                <input type="datetime-local" name="start_time" value={form.start_time} onChange={handleChange} required />
              </label>
              <label>Fim
                <input type="datetime-local" name="end_time" value={form.end_time} onChange={handleChange} required />
              </label>

              <label>Repetir
                <select name="repeat" value={form.repeat} onChange={handleChange}>
                  <option value="none">Não repete</option>
                  <option value="DAILY">Todos os dias</option>
                  <option value="WEEKLY">Todas as semanas</option>
                  <option value="MONTHLY">Todos os meses</option>
                  <option value="YEARLY">Todos os anos</option>
                </select>
              </label>

              {form.repeat !== 'none' && (
                <label>Repetir até (opcional)
                  <input type="date" name="repeat_until" value={form.repeat_until} onChange={handleChange} />
                </label>
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