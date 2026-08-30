import { useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  Copy,
  FileCheck2,
  FilePlus2,
  FileWarning,
  MoreHorizontal,
  Send,
  Sparkles,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { duplicateDocument, listDocuments, markDocumentSent } from '../lib/api';
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
const typeLabels: Record<string, string> = { proposal: 'Propuesta', proforma: 'Proforma' };

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function DocumentRowView({
  document,
  onDuplicate,
  onSent,
}: {
  document: DocumentRow;
  onDuplicate: (id: string) => void;
  onSent: (id: string) => void;
}) {
  const canSend = document.status === 'generated';
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
      {document.type === 'proforma' && document.total_usd && (
        <div className="document-amount">USD {document.total_usd}</div>
      )}
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
        <button className="icon-button" title="Más opciones">
          <MoreHorizontal size={17} />
        </button>
      </div>
    </div>
  );
}

export function DashboardPage() {
  const navigate = useNavigate();
  const client = useQueryClient();
  const { profile } = useAuth();
  const query = useQuery({ queryKey: ['documents'], queryFn: listDocuments });
  const docs = query.data ?? [];
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
          <p className="muted">Todo lo que necesitas para tu próxima propuesta está aquí.</p>
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
            <p>Comienza creando una propuesta o proforma.</p>
            <Link className="button secondary" to="/documents/new">
              Crear el primero
            </Link>
          </div>
        ) : (
          <div className="document-list">
            {docs.slice(0, 12).map((document) => (
              <DocumentRowView
                key={document.id}
                document={document}
                onDuplicate={(id) => void duplicate(id)}
                onSent={(id) => void sent(id)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
