import { useState, useEffect } from 'react';
import axios from 'axios';
import FullCalendar from '@fullcalendar/react';
import themePlugin from '@fullcalendar/react/themes/classic';
import dayGridPlugin from '@fullcalendar/react/daygrid';
import timeGridPlugin from '@fullcalendar/react/timegrid';
import interactionPlugin from '@fullcalendar/react/interaction';

import '@fullcalendar/react/skeleton.css';
import '@fullcalendar/react/themes/classic/theme.css';
import '@fullcalendar/react/themes/classic/palette.css';
import './App.css';

const API_URL = 'http://localhost:3000/api';
const emptyForm = { title: '', description: '', start_time: '', end_time: '' };

function App() {
  const [events, setEvents] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const loadEvents = () => {
    axios.get(`${API_URL}/events/1`).then((res) => setEvents(res.data));
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const toInputFormat = (isoString) => isoString.slice(0, 16);

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
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description || '',
      start_time: toInputFormat(event.start_time),
      end_time: toInputFormat(event.end_time),
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
    const request = editingId
      ? axios.put(`${API_URL}/events/${editingId}`, form)
      : axios.post(`${API_URL}/events`, { calendar_id: 1, ...form });

    request.then(() => {
      loadEvents();
      closeForm();
    });
  };

  const handleDelete = () => {
    axios.delete(`${API_URL}/events/${editingId}`).then(() => {
      loadEvents();
      closeForm();
    });
  };

  const calendarEvents = events.map((e) => ({
    id: String(e.id),
    title: e.title,
    start: e.start_time,
    end: e.end_time,
  }));

  return (
    <div className="page">
      <div className="calendar-wrapper">
        <FullCalendar
          plugins={[themePlugin, dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="dayGridMonth"
          headerToolbar={{
            left: 'addEvent prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          buttons={{
            addEvent: {
              text: '+ Novo evento',
              click: openNewEvent,
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

export default App;