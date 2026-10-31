import { AuthProvider, useAuth } from './AuthContext';
import AuthPage from './AuthPage';
import CalendarPage from './CalendarPage';
import './App.css';

function Content() {
  const { user, loading } = useAuth();

  if (loading) return <p className="loading">A carregar...</p>;
  return user ? <CalendarPage /> : <AuthPage />;
}

export default function App() {
  return (
    <AuthProvider>
      <Content />
    </AuthProvider>
  );
}