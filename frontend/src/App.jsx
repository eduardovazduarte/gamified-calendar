import { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';

const API_URL = 'http://localhost:3000/api';

const emptyForm = { title: '', description: '', start_time: '', end_time: '' };

function App() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState(null);

  const loadEvents = () => {
    axios.get(`${API_URL}/events/1`)
      .then((res) => {
        setEvents(res.data);
        setLoading(false);
      })
      .catch((err) => {
        console.error(err);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadEvents();
  }, []);

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Converte "2026-11-15T09:00:00.000Z" para o formato que o input datetime-local espera
  const toInputFormat = (isoString) => isoString.slice(0, 16);

  const handleEditClick = (event) => {
    setEditingId(event.id);
    setForm({
      title: event.title,
      description: event.description || '',
      start_time: toInputFormat(event.start_time),
      end_time: toInputFormat(event.end_time),
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setForm(emptyForm);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    if (editingId) {
      axios.put(`${API_URL}/events/${editingId}`, form)
        .then(() => {
          setEditingId(null);
          setForm(emptyForm);
          loadEvents();
        })
        .catch((err) => console.error(err));
    } else {
      axios.post(`${API_URL}/events`, { calendar_id: 1, ...form })
        .then(() => {
          setForm(emptyForm);
          loadEvents();
        })
        .catch((err) => console.error(err));
    }
  };

  const handleDelete = (id) => {
    axios.delete(`${API_URL}/events/${id}`)
      .then(() => loadEvents())
      .catch((err) => console.error(err));
  };

  return (
    <div style={{ maxWidth: 600, margin: '0 auto', padding: 20 }}>
      <h1>O meu calendário</h1>

      <form onSubmit={handleSubmit} style={{ marginBottom: 30 }}>
        <h3>{editingId ? 'Editar evento' : 'Novo evento'}</h3>
        <div>
          <input
            name="title"
            placeholder="Título"
            value={form.title}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          <input
            name="description"
            placeholder="Descrição"
            value={form.description}
            onChange={handleChange}
          />
        </div>
        <div>
          Início: <input
            type="datetime-local"
            name="start_time"
            value={form.start_time}
            onChange={handleChange}
            required
          />
        </div>
        <div>
          Fim: <input
            type="datetime-local"
            name="end_time"
            value={form.end_time}
            onChange={handleChange}
            required
          />
        </div>
        <button type="submit">{editingId ? 'Guardar alterações' : 'Criar evento'}</button>
        {editingId && (
          <button type="button" onClick={handleCancelEdit} style={{ marginLeft: 10 }}>
            Cancelar
          </button>
        )}
      </form>

      {loading ? (
        <p>A carregar eventos...</p>
      ) : events.length === 0 ? (
        <p>Ainda não tens eventos.</p>
      ) : (
        <ul>
          {events.map((event) => (
            <li key={event.id} style={{ marginBottom: 10 }}>
              <strong>{event.title}</strong><br />
              {new Date(event.start_time).toLocaleString('pt-PT')} até{' '}
              {new Date(event.end_time).toLocaleString('pt-PT')}
              <br />
              <button onClick={() => handleEditClick(event)}>Editar</button>
              <button onClick={() => handleDelete(event.id)} style={{ marginLeft: 5 }}>
                Apagar
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default App;