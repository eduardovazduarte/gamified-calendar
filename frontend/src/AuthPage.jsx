import { useState } from 'react';
import { useAuth } from './AuthContext';

export default function AuthPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const switchMode = () => {
    setError('');
    setMode(mode === 'login' ? 'register' : 'login');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(form.email, form.password);
      } else {
        await register(form.name, form.email, form.password);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível ligar ao servidor');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>{mode === 'login' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="auth-subtitle">O teu calendário gamificado</p>

        <form onSubmit={handleSubmit}>
          {mode === 'register' && (
            <input
              name="name"
              placeholder="Nome"
              value={form.name}
              onChange={handleChange}
              required
            />
          )}
          <input
            type="email"
            name="email"
            placeholder="Email"
            value={form.email}
            onChange={handleChange}
            required
          />
          <input
            type="password"
            name="password"
            placeholder="Password (mínimo 8 caracteres)"
            value={form.password}
            onChange={handleChange}
            minLength={mode === 'register' ? 8 : undefined}
            required
          />

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="btn-primary" disabled={submitting}>
            {submitting ? 'A processar...' : mode === 'login' ? 'Entrar' : 'Registar'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'login' ? 'Ainda não tens conta? ' : 'Já tens conta? '}
          <button type="button" className="link-button" onClick={switchMode}>
            {mode === 'login' ? 'Criar conta' : 'Entrar'}
          </button>
        </p>
      </div>
    </div>
  );
}