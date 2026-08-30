import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Copy,
  Download,
  FileCheck2,
  FileDown,
  Pencil,
  RefreshCw,
  Send,
  Share2,
} from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  createShareLink,
  downloadDocument,
  duplicateDocument,
  generateDocument,
  loadDocument,
  markDocumentSent,
  previewDocument,
  voidDocument,
} from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

const statusLabels: Record<string, string> = {
  draft: 'Borrador',
  generating: 'Generando',
  generated: 'Generado',
  generation_failed: 'Error de generación',
  sent: 'Enviado',
  void: 'Anulado',
};

export function DocumentDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { profile, user } = useAuth();
  const client = useQueryClient();
  const [message, setMessage] = useState('');
  const query = useQuery({
    queryKey: ['document', id],
    queryFn: () => loadDocument(id),
    enabled: Boolean(id),
  });
  const document = query.data?.document;
  const items = query.data?.items ?? [];
  const isLegacy = Boolean(document?.legacy_number);
  const hasNativePdf = Boolean(document?.number);
  const canManage = Boolean(
    user && (document?.created_by === user.id || profile?.role === 'admin'),
  );
  const canVoid =
    profile?.role === 'admin' &&
    Boolean(document && ['generated', 'sent'].includes(document.status));
  const action = useMutation({
    mutationFn: async (
      kind: 'generate' | 'preview' | 'share' | 'download' | 'duplicate' | 'sent' | 'void',
    ) => {
      if (kind === 'generate') return generateDocument(id);
      if (kind === 'preview') return previewDocument(id);
      if (kind === 'share') return createShareLink(id);
      if (kind === 'download') return downloadDocument(id);
      if (kind === 'duplicate') return duplicateDocument(id);
      if (kind === 'void') {
        const reason = window.prompt('Motivo de anulación (obligatorio):')?.trim();
        if (!reason) throw new Error('La anulación requiere un motivo.');
        return voidDocument(id, reason);
      }
      return markDocumentSent(id);
    },
    onSuccess: (result, kind) => {
      if (kind === 'generate' && result && typeof result === 'object' && 'downloadUrl' in result)
        window.open(String(result.downloadUrl), '_blank', 'noopener,noreferrer');
      if (kind === 'share' && result && typeof result === 'object' && 'url' in result) {
        void navigator.clipboard?.writeText(String(result.url));
        setMessage('Enlace copiado. Caduca en siete días.');
      }
      if (kind === 'duplicate' && typeof result === 'string') navigate(`/documents/${result}`);
      void client.invalidateQueries({ queryKey: ['document', id] });
      void client.invalidateQueries({ queryKey: ['documents'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo completar la acción.'),
  });
  if (query.isLoading) return <div className="loading-line">Cargando documento…</div>;
  if (query.error || !document)
    return (
      <div className="empty-state">
        <FileCheck2 size={32} />
        <h2>Documento no encontrado</h2>
        <Link className="button secondary" to="/">
          Volver
        </Link>
      </div>
    );
  return (
    <div className="document-detail">
      <div className="page-heading compact-heading">
        <div>
          <Link className="back-link" to="/">
            <ArrowLeft size={15} />
            Volver al resumen
          </Link>
          <div className="detail-title">
            <div className={`type-icon ${document.type}`}>
              <FileCheck2 size={20} />
            </div>
            <div>
              <h1>{document.number ?? document.legacy_number ?? 'Borrador sin número'}</h1>
              <p className="muted">
                {document.clients?.trade_name || document.clients?.legal_name} ·{' '}
                <span className={`status ${document.status}`}>{statusLabels[document.status]}</span>
              </p>
            </div>
          </div>
        </div>
        <div className="detail-actions">
          {document.status === 'draft' && canManage && (
            <Link className="button secondary" to={`/documents/${id}/edit`}>
              <Pencil size={16} />
              Editar borrador
            </Link>
          )}
          {(document.status === 'draft' || document.status === 'generation_failed') && canManage ? (
            <button
              className="button primary"
              disabled={action.isPending}
              onClick={() => action.mutate('generate')}
            >
              <FileDown size={16} />
              {document.status === 'generation_failed' ? 'Reintentar PDF' : 'Generar PDF'}
            </button>
          ) : canManage &&
            hasNativePdf &&
            (document.status === 'generated' || document.status === 'sent') ? (
            <button className="button primary" onClick={() => action.mutate('share')}>
              <Share2 size={16} />
              Copiar enlace
            </button>
          ) : null}
        </div>
      </div>
      <div className="detail-grid">
        <section className="panel detail-card">
          <div className="panel-header">
            <div>
              <h2>Contenido comercial</h2>
              <p className="muted">
                {items.length} producto{items.length === 1 ? '' : 's'} · Vigencia hasta{' '}
                {document.valid_until}
              </p>
            </div>
            <button
              className="text-button"
              disabled={action.isPending || !canManage || !hasNativePdf}
              onClick={() => action.mutate('preview')}
            >
              <Download size={15} />
              Vista previa
            </button>
          </div>
          {isLegacy && document.legacy_drive_url && (
            <div className="notice info legacy-link">
              <a href={document.legacy_drive_url} target="_blank" rel="noreferrer">
                Abrir PDF histórico en Google Drive
              </a>
              {document.legacy_file_name ? <span>{document.legacy_file_name}</span> : null}
            </div>
          )}
          <div className="detail-table">
            <div className="detail-table-head">
              <span>REF</span>
              <span>DENOMINACIÓN</span>
              <span>CATEGORÍA</span>
              <span>{document.type === 'proforma' ? 'KG / TOTAL' : 'USD / KG'}</span>
            </div>
            {items.map((item) => (
              <div className="detail-table-row" key={item.id}>
                <strong>{item.sku_snapshot}</strong>
                <span>{item.denomination_snapshot}</span>
                <span>{item.category_snapshot}</span>
                <span>
                  {document.type === 'proforma'
                    ? `${item.quantity_kg ?? '—'} kg · USD ${item.total_usd ?? '—'}`
                    : `USD ${item.unit_price_usd ?? '—'}`}
                </span>
              </div>
            ))}
          </div>
          {document.type === 'proforma' && (
            <div className="detail-totals">
              <div>
                <span>Subtotal</span>
                <strong>USD {document.subtotal_usd}</strong>
              </div>
              <div>
                <span>IGV</span>
                <strong>USD {document.tax_usd}</strong>
              </div>
              <div className="total">
                <span>Total</span>
                <strong>USD {document.total_usd}</strong>
              </div>
            </div>
          )}
        </section>
        <aside className="panel detail-side">
          <div className="summary-label">Acciones</div>
          <button className="side-action" onClick={() => action.mutate('duplicate')}>
            <Copy size={16} />
            <span>
              <strong>Duplicar documento</strong>
              <small>Crear un borrador propio</small>
            </span>
          </button>
          {canManage &&
            hasNativePdf &&
            (document.status === 'generated' || document.status === 'sent') && (
              <button className="side-action" onClick={() => action.mutate('download')}>
                <Download size={16} />
                <span>
                  <strong>Descargar PDF</strong>
                  <small>Enlace autenticado válido siete días</small>
                </span>
              </button>
            )}
          {document.status === 'generated' && canManage && hasNativePdf && (
            <button className="side-action" onClick={() => action.mutate('sent')}>
              <Send size={16} />
              <span>
                <strong>Marcar como enviado</strong>
                <small>Actualiza el estado comercial</small>
              </span>
            </button>
          )}
          {canManage &&
            hasNativePdf &&
            (document.status === 'generated' || document.status === 'sent') && (
              <button className="side-action" onClick={() => action.mutate('share')}>
                <Share2 size={16} />
                <span>
                  <strong>Copiar enlace temporal</strong>
                  <small>Válido durante siete días</small>
                </span>
              </button>
            )}
          {canVoid && (
            <button className="side-action danger-action" onClick={() => action.mutate('void')}>
              <Ban size={16} />
              <span>
                <strong>Anular documento</strong>
                <small>Requiere un motivo y queda auditado</small>
              </span>
            </button>
          )}
          <div className="summary-divider" />
          <div className="detail-meta">
            <span>Tipo</span>
            <strong>
              {document.type === 'proposal' ? 'Propuesta económica' : 'Proforma económica'}
            </strong>
            <span>Creado</span>
            <strong>
              {new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(
                new Date(document.created_at),
              )}
            </strong>
          </div>
        </aside>
      </div>
      {action.isPending && (
        <div className="notice info">
          <RefreshCw size={14} /> Procesando…
        </div>
      )}
      {message && (
        <div className="notice success">
          <CheckCircle2 size={15} />
          {message}
        </div>
      )}
    </div>
  );
}
