import { useState } from 'react';
import { Link, Navigate, Outlet, Route, Routes, useLocation } from 'react-router-dom';
import { FilePlus2, FileText, LayoutDashboard, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { useAuth } from './auth/AuthProvider';
import { DashboardPage } from './pages/DashboardPage';
import { DocumentBuilderPage } from './pages/DocumentBuilderPage';
import { LoginPage } from './pages/LoginPage';
import { AdminPage } from './pages/AdminPage';
import { DocumentDetailPage } from './pages/DocumentDetailPage';

function ProtectedLayout() {
  const { user, loading, profile, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  if (loading)
    return (
      <div className="splash">
        <div className="brand-mark">F</div>
        <span>Cargando espacio FRAVE…</span>
      </div>
    );
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;

  const links = [
    { to: '/', label: 'Resumen', icon: LayoutDashboard },
    { to: '/documents/new', label: 'Nuevo documento', icon: FilePlus2 },
    ...(profile?.role === 'admin'
      ? [{ to: '/admin', label: 'Administración', icon: ShieldCheck }]
      : []),
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? 'sidebar-open' : ''}`}>
        <div className="sidebar-header">
          <div className="brand-mark">F</div>
          <div>
            <strong>FRAVE</strong>
            <span>Documentos comerciales</span>
          </div>
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
          >
            <X size={18} />
          </button>
        </div>
        <nav>
          {links.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              onClick={() => setOpen(false)}
              className={location.pathname === to ? 'active' : ''}
            >
              <Icon size={18} />
              {label}
            </Link>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <div className="avatar">
              {(profile?.full_name ?? user.email ?? 'U').slice(0, 1).toUpperCase()}
            </div>
            <div>
              <strong>{profile?.full_name ?? 'Usuario'}</strong>
              <span>{profile?.role === 'admin' ? 'Administrador' : 'Vendedor'}</span>
            </div>
          </div>
          <button className="logout-button" onClick={() => void signOut()}>
            <LogOut size={16} />
            Cerrar sesión
          </button>
        </div>
      </aside>
      <main className="main-content">
        <header className="topbar">
          <button
            className="icon-button mobile-only"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Generador <span>/</span>{' '}
            {location.pathname === '/documents/new'
              ? 'Nuevo documento'
              : location.pathname === '/admin'
                ? 'Administración'
                : 'Resumen'}
          </div>
          <div className="topbar-meta">
            <span className="status-dot" />
            Sistema operativo
          </div>
        </header>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </div>
  );
}

function NotFound() {
  return (
    <div className="empty-state">
      <FileText size={32} />
      <h2>Página no encontrada</h2>
      <Link className="button primary" to="/">
        Volver al resumen
      </Link>
    </div>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedLayout />}>
        <Route index element={<DashboardPage />} />
        <Route path="documents/new" element={<DocumentBuilderPage />} />
        <Route path="documents/:id/edit" element={<DocumentBuilderPage />} />
        <Route path="documents/:id" element={<DocumentDetailPage />} />
        <Route path="admin" element={<AdminPage />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
