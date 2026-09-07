import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Copy,
  Download,
  Eye,
  FileCheck2,
  FilePlus2,
  FileWarning,
  AlertTriangle,
  MoreHorizontal,
  RotateCcw,
  Search,
  Send,
  Share2,
  Sparkles,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import {
  createConfirmationFromQuote,
  createShareLink,
  downloadDocument,
  duplicateDocument,
  listDocuments,
  listLowStockProducts,
  loadCompanySettings,
  markDocumentSent,
} from '../lib/api';
import { formatDecimal } from '@frave/domain';
import type { DocumentRow } from '../lib/types';
import { useAuth } from '../auth/AuthProvider';

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  generating: 'Generando',
  generated: 'Generado',
  generation_failed: 'Error de generación',
  sent: 'Enviado',
  void: 'Anulado',
};
const typeLabels: Record<string, string> = {
  proposal: 'Cotización',
  proforma: 'Confirmación de pedido',
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function limaDateKey(value: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(value));
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function DocumentRowView({
  document,
  onDuplicate,
  onSent,
  onDownload,
  onShare,
  onConvert,
}: {
  document: DocumentRow;
  onDuplicate: (id: string) => void;
  onSent: (id: string) => void;
  onDownload: (id: string) => void;
  onShare: (id: string) => void;
  onConvert: (id: string) => void;
}) {
  const documentFile = Array.isArray(document.document_files)
    ? document.document_files[0] ?? null
    : document.document_files ?? null;
  const pdfDeleted = Boolean(documentFile?.deleted_at);
  const canSend = document.status === 'generated' && !pdfDeleted;
  const canAccessPdf =
    Boolean(document.number) &&
    !pdfDeleted &&
    (document.status === 'generated' || document.status === 'sent');
  const canConvert =
    document.type === 'proposal' && (document.status === 'generated' || document.status === 'sent');
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<globalThis.HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const closeMenu = (event: globalThis.MouseEvent) => {
      if (!menuRef.current?.contains(event.target as globalThis.Node)) setMenuOpen(false);
    };
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', closeMenu);
    window.addEventListener('keydown', closeOnEscape);
    return () => {
      window.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('keydown', closeOnEscape);
    };
  }, [menuOpen]);
  return (
    <div className="document-row">
      <div className={`type-icon ${document.type}`}>
        <FileCheck2 size={18} />
      </div>
      <div className="document-main">
        <div className="document-title">
          <strong>{document.number ?? document.legacy_number ?? 'Sin número'}</strong>
          <span className={`status ${document.status}`}>{statusLabels[document.status]}</span>
        </div>
        <span className="document-client">
          {document.clients?.trade_name || document.clients?.legal_name || 'Cliente pendiente'} ·{' '}
          {typeLabels[document.type]}
        </span>
      </div>
      <div className="document-date">{formatDate(document.created_at)}</div>
      {document.total_usd && <div className="document-amount">USD {document.total_usd}</div>}
      <div className="row-actions">
        <button
          className="icon-button"
          title="Duplicar como borrador"
          onClick={() => onDuplicate(document.id)}
        >
          <Copy size={16} />
        </button>
        {canSend && (
          <button
            className="icon-button"
            title="Marcar como enviado"
            onClick={() => onSent(document.id)}
          >
            <Send size={16} />
          </button>
        )}
        <div className="row-action-menu" ref={menuRef}>
          <button
            className="icon-button"
            type="button"
            title="Más opciones"
            aria-label="Más opciones"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <MoreHorizontal size={17} />
          </button>
          {menuOpen && (
            <div className="row-action-popover" role="menu" aria-label="Acciones del documento">
              <Link
                to={`/documents/${document.id}`}
                role="menuitem"
                onClick={() => setMenuOpen(false)}
              >
                <Eye size={15} />
                Ver detalle
              </Link>
              {canAccessPdf && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onDownload(document.id);
                  }}
                >
                  <Download size={15} />
                  Descargar PDF
                </button>
              )}
              {canAccessPdf && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onShare(document.id);
                  }}
                >
                  <Share2 size={15} />
                  Copiar enlace temporal
                </button>
              )}
              {canConvert && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onConvert(document.id);
                  }}
                >
                  <FilePlus2 size={15} />
                  Crear confirmación
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { profile } = useAuth();
  const [documentSearch, setDocumentSearch] = useState('');
  const [documentType, setDocumentType] = useState<DocumentRow['type'] | ''>('');
  const [documentStatus, setDocumentStatus] = useState<DocumentRow['status'] | ''>('');
  const [documentFrom, setDocumentFrom] = useState('');
  const [documentTo, setDocumentTo] = useState('');
  const query = useQuery({ queryKey: ['documents'], queryFn: listDocuments });
  const settings = useQuery({ queryKey: ['settings'], queryFn: loadCompanySettings });
  const lowStock = useQuery({
    queryKey: ['low-stock', settings.data?.low_stock_threshold_kg],
    queryFn: () => listLowStockProducts(settings.data?.low_stock_threshold_kg ?? '5'),
  });
  const docs = query.data ?? [];
  const filteredDocs = useMemo(() => {
    const search = normalizeSearch(documentSearch);
    return docs.filter((document) => {
      const clientName = document.clients?.trade_name || document.clients?.legal_name || '';
      const searchable = normalizeSearch(
        `${document.number ?? ''} ${document.legacy_number ?? ''} ${clientName} ${
          document.clients?.tax_id ?? ''
        }`,
      );
      const createdDate = limaDateKey(document.created_at);
      return (
        (!search || searchable.includes(search)) &&
        (!documentType || document.type === documentType) &&
        (!documentStatus || document.status === documentStatus) &&
        (!documentFrom || createdDate >= documentFrom) &&
        (!documentTo || createdDate <= documentTo)
      );
    });
  }, [documentFrom, documentSearch, documentStatus, documentTo, documentType, docs]);

  const hasDocumentFilters = Boolean(
    documentSearch || documentType || documentStatus || documentFrom || documentTo,
  );

  function clearDocumentFilters() {
    setDocumentSearch('');
    setDocumentType('');
    setDocumentStatus('');
    setDocumentFrom('');
    setDocumentTo('');
  }
  const stats = useMemo(
    () => ({
      total: docs.length,
      drafts: docs.filter((d) => d.status === 'draft').length,
      sent: docs.filter((d) => d.status === 'sent').length,
    }),
    [docs],
  );
  async function duplicate(id: string) {
    try {
      const newId = await duplicateDocument(id);
      navigate(`/documents/${newId}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo duplicar.');
    }
  }
  async function sent(id: string) {
    try {
      await markDocumentSent(id);
      await client.invalidateQueries({ queryKey: ['documents'] });
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo actualizar.');
    }
  }
  async function download(id: string) {
    try {
      await downloadDocument(id);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo descargar el PDF.');
    }
  }
  async function share(id: string) {
    try {
      const { url } = await createShareLink(id);
      await navigator.clipboard?.writeText(url);
      window.alert('Enlace copiado. Caduca en siete días.');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear el enlace.');
    }
  }
  async function convert(id: string) {
    try {
      const newId = await createConfirmationFromQuote(id);
      navigate(`/documents/${newId}`);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'No se pudo crear la confirmación.');
    }
  }
  return (
    <div className="dashboard">
      <div className="page-heading">
        <div>
          <div className="eyebrow">
            {new Intl.DateTimeFormat('es-PE', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            }).format(new Date())}
          </div>
          <h1>
            Hola, {(profile?.full_name ?? 'equipo FRAVE').split(' ')[0]}{' '}
            <span className="heading-spark">✦</span>
          </h1>
          <p className="muted">Todo lo que necesitas para tu próxima cotización está aquí.</p>
        </div>
        <Link to="/documents/new" className="button primary">
          <FilePlus2 size={17} />
          Nuevo documento
        </Link>
      </div>
      <div className="stats-grid">
        <div className="stat-card accent">
          <div className="stat-icon">
            <Sparkles size={18} />
          </div>
          <span>Documentos totales</span>
          <strong>{stats.total}</strong>
          <small>Historial disponible</small>
        </div>
        <div className="stat-card">
          <div className="stat-icon blue">
            <FileWarning size={18} />
          </div>
          <span>Borradores</span>
          <strong>{stats.drafts}</strong>
          <small>Listos para revisar</small>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">
            <Send size={18} />
          </div>
          <span>Enviados</span>
          <strong>{stats.sent}</strong>
          <small>Este espacio de trabajo</small>
        </div>
      </div>
      {lowStock.data?.length ? (
        <section className="low-stock-alert" aria-live="polite">
          <AlertTriangle size={20} />
          <div>
            <strong>
              Stock bajo: {lowStock.data.length} producto{lowStock.data.length === 1 ? '' : 's'}
            </strong>
            <span>
              Umbral: {formatDecimal(settings.data?.low_stock_threshold_kg ?? '5', 3)} kg.{' '}
              {lowStock.data
                .slice(0, 4)
                .map((product) => `${product.sku} (${formatDecimal(product.stock_kg, 3)} kg)`)
                .join(' · ')}
              {lowStock.data.length > 4 ? ' · …' : ''}
            </span>
          </div>
          <Link className="button secondary small" to="/admin">
            Gestionar stock
          </Link>
        </section>
      ) : null}
      <section className="panel document-panel">
        <div className="panel-header">
          <div>
            <h2>Documentos recientes</h2>
            <p className="muted">Consulta, duplica o continúa un documento.</p>
          </div>
          <button className="text-button" onClick={() => void query.refetch()}>
            Actualizar <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="document-filters" aria-label="Filtros del historial">
          <label className="search-field">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Buscar documentos</span>
            <input
              value={documentSearch}
              onChange={(event) => setDocumentSearch(event.target.value)}
              placeholder="Buscar por número, cliente o RUC…"
            />
          </label>
          <label className="filter-field">
            Tipo
            <select
              value={documentType}
              onChange={(event) => setDocumentType(event.target.value as DocumentRow['type'] | '')}
            >
              <option value="">Todos</option>
              <option value="proposal">Cotizaciones</option>
              <option value="proforma">Confirmaciones de pedido</option>
            </select>
          </label>
          <label className="filter-field">
            Estado
            <select
              value={documentStatus}
              onChange={(event) =>
                setDocumentStatus(event.target.value as DocumentRow['status'] | '')
              }
            >
              <option value="">Todos</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="filter-field date-filter">
            Desde
            <input
              type="date"
              value={documentFrom}
              onChange={(event) => setDocumentFrom(event.target.value)}
            />
          </label>
          <label className="filter-field date-filter">
            Hasta
            <input
              type="date"
              value={documentTo}
              onChange={(event) => setDocumentTo(event.target.value)}
            />
          </label>
          <button
            type="button"
            className="button ghost small filter-reset"
            onClick={clearDocumentFilters}
            disabled={!hasDocumentFilters}
          >
            <RotateCcw size={14} />
            Limpiar
          </button>
        </div>
        {query.isLoading ? (
          <div className="loading-line">Cargando documentos…</div>
        ) : query.error ? (
          <div className="notice error">
            {query.error instanceof Error ? query.error.message : 'No se pudo cargar el historial.'}
          </div>
        ) : docs.length === 0 ? (
          <div className="empty-state compact">
            <FileCheck2 size={30} />
            <h3>Aún no hay documentos</h3>
            <p>Comienza creando una cotización o confirmación de pedido.</p>
            <Link className="button secondary" to="/documents/new">
              Crear el primero
            </Link>
          </div>
        ) : filteredDocs.length === 0 ? (
          <div className="empty-state compact">
            <FileWarning size={30} />
            <h3>No encontramos documentos</h3>
            <p>Prueba con otros filtros o limpia la búsqueda.</p>
            <button className="button secondary" type="button" onClick={clearDocumentFilters}>
              Limpiar filtros
            </button>
          </div>
        ) : (
          <>
            <div className="filter-results-bar">
              <span>
                {filteredDocs.length} {filteredDocs.length === 1 ? 'resultado' : 'resultados'}
              </span>
              {filteredDocs.length > 12 && <span>Mostrando los 12 más recientes</span>}
            </div>
            <div className="document-list">
              {filteredDocs.slice(0, 12).map((document) => (
                <DocumentRowView
                  key={document.id}
                  document={document}
                  onDuplicate={(id) => void duplicate(id)}
                  onSent={(id) => void sent(id)}
                  onDownload={(id) => void download(id)}
                  onShare={(id) => void share(id)}
                  onConvert={(id) => void convert(id)}
                />
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
