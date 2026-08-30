import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, LockKeyhole, Mail } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';

export function LoginPage() {
  const { user, signIn, configured } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  if (user) return <Navigate to="/" replace />;
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  async function submit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signIn(email.trim(), password);
      navigate(from, { replace: true });
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="login-page">
      <div className="login-decoration">
        <div className="orb orb-one" />
        <div className="orb orb-two" />
        <div className="login-copy">
          <div className="brand-lockup">
            <div className="brand-mark large">F</div>
            <span>FRAVE</span>
          </div>
          <h1>Documentos comerciales, sin fricción.</h1>
          <p>Un espacio sencillo para preparar proformas y propuestas con la identidad de FRAVE.</p>
          <div className="feature-list">
            <span>
              <ArrowRight size={15} />
              Cálculos consistentes
            </span>
            <span>
              <ArrowRight size={15} />
              PDF listo para compartir
            </span>
            <span>
              <ArrowRight size={15} />
              Historial controlado
            </span>
          </div>
        </div>
      </div>
      <div className="login-panel">
        <div className="login-card">
          <div className="eyebrow">Acceso interno</div>
          <h2>Bienvenido de nuevo</h2>
          <p className="muted">Ingresa con la cuenta que te proporcionó tu administrador.</p>
          {!configured && (
            <div className="notice warning">
              Configura <code>VITE_SUPABASE_URL</code> y <code>VITE_SUPABASE_ANON_KEY</code> para
              conectar este entorno.
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Correo corporativo
              <div className="input-icon">
                <Mail size={17} />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="nombre@frave.pe"
                  autoComplete="username"
                />
              </div>
            </label>
            <label>
              Contraseña
              <div className="input-icon">
                <LockKeyhole size={17} />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                />
              </div>
            </label>
            {error && <div className="form-error">{error}</div>}
            <button className="button primary full" disabled={busy || !configured}>
              {busy ? 'Validando…' : 'Entrar al generador'}
              <ArrowRight size={17} />
            </button>
          </form>
          <p className="login-help">
            ¿Problemas con tu acceso? Solicita un restablecimiento a un administrador.
          </p>
        </div>
        <span className="login-version">Generador FRAVE · v0.1</span>
      </div>
    </div>
  );
}
