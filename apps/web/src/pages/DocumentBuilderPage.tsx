import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ClipboardList, FileDown, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { calculateDocumentTotals, formatDecimal } from '@frave/domain';
import {
  createDraft,
  invokePdfFunction,
  loadDocument,
  listClientAddresses,
  listClientContacts,
  listClients,
  listProducts,
  listVariants,
  updateDraft,
} from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

const itemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().optional(),
  quantityKg: z.string().optional(),
  observation: z.string().max(300).optional(),
});
const schema = z
  .object({
    type: z.enum(['proposal', 'proforma']),
    clientId: z.string().min(1, 'Selecciona un cliente'),
    contactId: z.string().optional(),
    addressId: z.string().optional(),
    paymentMethod: z.string().min(1, 'Indica la modalidad de pago'),
    deliveryMethod: z.string().min(1, 'Indica la modalidad de entrega'),
    validUntil: z.string().min(1),
    considerationsText: z.string().optional(),
    items: z.array(itemSchema).min(1, 'Agrega al menos un producto').max(100),
  })
  .superRefine((values, context) => {
    values.items.forEach((item, index) => {
      if (
        values.type === 'proforma' &&
        !/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(item.quantityKg ?? '')
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['items', index, 'quantityKg'],
          message: 'Cantidad requerida (máximo 3 decimales)',
        });
      }
    });
  });
type FormValues = z.infer<typeof schema>;
const todayPlus = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export function DocumentBuilderPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState('');
  const clients = useQuery({ queryKey: ['clients'], queryFn: listClients });
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts });
  const variants = useQuery({ queryKey: ['variants'], queryFn: () => listVariants() });
  const existing = useQuery({
    queryKey: ['document', id],
    queryFn: () => loadDocument(id ?? ''),
    enabled: Boolean(id),
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'proposal',
      clientId: '',
      contactId: '',
      addressId: '',
      paymentMethod: '50% adelanto, 50% contra entrega',
      deliveryMethod: 'Despacho coordinado con el cliente',
      validUntil: todayPlus(30),
      considerationsText: '',
      items: [{ productId: '', variantId: '', quantityKg: '', observation: '' }],
    },
    mode: 'onBlur',
  });
  const selectedClientId = form.watch('clientId');
  const contactList = useQuery({
    queryKey: ['client-contacts', selectedClientId],
    queryFn: () => listClientContacts(selectedClientId),
    enabled: Boolean(selectedClientId),
  });
  const addressList = useQuery({
    queryKey: ['client-addresses', selectedClientId],
    queryFn: () => listClientAddresses(selectedClientId),
    enabled: Boolean(selectedClientId),
  });
  const { fields, append, remove } = useFieldArray({ control: form.control, name: 'items' });
  useEffect(() => {
    if (!existing.data) return;
    const document = existing.data.document;
    form.reset({
      type: document.type,
      clientId: document.client_id,
      contactId: document.contact_id ?? '',
      addressId: document.address_id ?? '',
      paymentMethod: document.payment_method ?? '',
      deliveryMethod: document.delivery_method ?? '',
      validUntil: document.valid_until,
      considerationsText: (document.considerations ?? []).join('\n'),
      items: existing.data.items.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id ?? '',
        quantityKg: item.quantity_kg ?? '',
        observation: item.observation ?? '',
      })),
    });
  }, [existing.data, form]);
  const type = form.watch('type');
  const watchedItems = form.watch('items');
  const previewTotals = useMemo(() => {
    if (type !== 'proforma') return null;
    const lines = watchedItems
      .map((item) => {
        const product = products.data?.find((p) => p.id === item.productId);
        const variant = variants.data?.find((v) => v.id === item.variantId);
        const price = variant?.price_override_usd ?? product?.unit_price_usd;
        return price && item.quantityKg
          ? { quantityKg: item.quantityKg, unitPriceUsd: String(price) }
          : null;
      })
      .filter((line): line is { quantityKg: string; unitPriceUsd: string } => Boolean(line));
    try {
      return lines.length ? calculateDocumentTotals(lines, '0.18').totals : null;
    } catch {
      return null;
    }
  }, [products.data, type, variants.data, watchedItems]);
  const save = useMutation({
    mutationFn: async (values: FormValues) => {
      if (!user) throw new Error('Sesión no disponible');
      const items = values.items.map((item) => {
        const product = products.data?.find((p) => p.id === item.productId);
        const variant = variants.data?.find((v) => v.id === item.variantId);
        if (!product) throw new Error('Producto inválido');
        return {
          productId: product.id,
          variantId: variant?.id,
          sku: product.sku,
          denomination: variant?.name ?? product.name,
          category: product.product_categories?.[0]?.name ?? 'Sin categoría',
          quantityKg: values.type === 'proforma' ? item.quantityKg : undefined,
          unitPriceUsd: String(variant?.price_override_usd ?? product.unit_price_usd),
          observation: item.observation,
        };
      });
      const input = {
        type: values.type,
        clientId: values.clientId,
        contactId: values.contactId || undefined,
        addressId: values.addressId || undefined,
        sellerId: user.id,
        paymentMethod: values.paymentMethod,
        deliveryMethod: values.deliveryMethod,
        validUntil: values.validUntil,
        considerations: (values.considerationsText ?? '')
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean),
        items,
      };
      return id ? updateDraft(id, input) : createDraft(input, user.id);
    },
    onSuccess: (document) => {
      setSaved(document.id);
      navigate(`/documents/${document.id}`);
    },
  });
  const preview = useMutation({
    mutationFn: (documentId: string) =>
      invokePdfFunction<{ url?: string }>('preview-document', { documentId }),
  });
  async function next() {
    const valid = await form.trigger(
      step === 1
        ? ['type', 'clientId']
        : step === 2
          ? ['paymentMethod', 'deliveryMethod', 'validUntil']
          : ['items'],
    );
    if (valid) setStep((current) => Math.min(current + 1, 4));
  }
  const submit = form.handleSubmit((values) => save.mutate(values));
  const selectedClient = clients.data?.find((client) => client.id === form.getValues('clientId'));

  return (
    <div className="builder">
      <div className="page-heading compact-heading">
        <div>
          <Link className="back-link" to="/">
            <ArrowLeft size={15} />
            Volver al resumen
          </Link>
          <h1>{id ? 'Editar borrador' : 'Nuevo documento'}</h1>
          <p className="muted">Completa la información comercial y revisa antes de guardar.</p>
        </div>
        <div className="draft-indicator">
          <span className="status-dot" />
          Guardado como borrador al finalizar
        </div>
      </div>
      <div className="stepper">
        {['Tipo y cliente', 'Condiciones', 'Productos', 'Revisión'].map((label, index) => (
          <div
            key={label}
            className={`step ${step > index + 1 ? 'done' : step === index + 1 ? 'current' : ''}`}
          >
            <span>{step > index + 1 ? <Check size={14} /> : index + 1}</span>
            <label>{label}</label>
          </div>
        ))}
      </div>
      <form onSubmit={submit} className="builder-grid">
        <section className="panel builder-form">
          {step === 1 && (
            <div className="form-step">
              <div className="section-title">
                <ClipboardList size={19} />
                <div>
                  <h2>Define el documento</h2>
                  <p className="muted">La propuesta no muestra importes; la proforma sí.</p>
                </div>
              </div>
              <div className="type-choice">
                <label className={type === 'proposal' ? 'selected' : ''}>
                  <input type="radio" value="proposal" {...form.register('type')} />
                  <span className="choice-icon">✦</span>
                  <strong>Propuesta económica</strong>
                  <small>Presenta catálogo y precios, sin totales.</small>
                </label>
                <label className={type === 'proforma' ? 'selected' : ''}>
                  <input type="radio" value="proforma" {...form.register('type')} />
                  <span className="choice-icon">$</span>
                  <strong>Proforma económica</strong>
                  <small>Incluye cantidades, IGV y total.</small>
                </label>
              </div>
              <label>
                Cliente
                <select {...form.register('clientId')}>
                  <option value="">Seleccionar cliente…</option>
                  {clients.data?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.trade_name || client.legal_name} · RUC {client.tax_id}
                    </option>
                  ))}
                </select>
                {form.formState.errors.clientId && (
                  <small className="field-error">{form.formState.errors.clientId.message}</small>
                )}
              </label>
              {selectedClientId && (
                <div className="two-columns compact-fields">
                  <label>
                    Contacto <span className="label-hint">opcional</span>
                    <select {...form.register('contactId')}>
                      <option value="">Sin contacto</option>
                      {contactList.data?.map((contact) => (
                        <option key={contact.id} value={contact.id}>
                          {contact.full_name}
                          {contact.salutation ? ` · ${contact.salutation}` : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Dirección de entrega <span className="label-hint">opcional</span>
                    <select {...form.register('addressId')}>
                      <option value="">Sin dirección</option>
                      {addressList.data?.map((address) => (
                        <option key={address.id} value={address.id}>
                          {address.label} · {address.address}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              )}
            </div>
          )}
          {step === 2 && (
            <div className="form-step">
              <div className="section-title">
                <ClipboardList size={19} />
                <div>
                  <h2>Condiciones comerciales</h2>
                  <p className="muted">Estos textos quedarán congelados al emitir el PDF.</p>
                </div>
              </div>
              <div className="two-columns">
                <label>
                  Forma de pago
                  <input {...form.register('paymentMethod')} placeholder="Ej. 50% adelanto" />
                  {form.formState.errors.paymentMethod && (
                    <small className="field-error">
                      {form.formState.errors.paymentMethod.message}
                    </small>
                  )}
                </label>
                <label>
                  Forma de entrega
                  <input
                    {...form.register('deliveryMethod')}
                    placeholder="Ej. Despacho coordinado"
                  />
                </label>
                <label>
                  Vigencia hasta
                  <input type="date" {...form.register('validUntil')} />
                </label>
              </div>
              <label>
                Consideraciones <span className="label-hint">una por línea</span>
                <textarea
                  rows={5}
                  {...form.register('considerationsText')}
                  placeholder={'Precios expresados en USD/kg\nSujeto a disponibilidad de stock'}
                />
              </label>
            </div>
          )}
          {step === 3 && (
            <div className="form-step">
              <div className="section-title">
                <ClipboardList size={19} />
                <div>
                  <h2>
                    Productos <span className="count-badge">{fields.length}/100</span>
                  </h2>
                  <p className="muted">
                    El precio se toma del catálogo y se congela en el borrador.
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() =>
                    append({ productId: '', variantId: '', quantityKg: '', observation: '' })
                  }
                  disabled={fields.length >= 100}
                >
                  <Plus size={15} />
                  Agregar
                </button>
              </div>
              <div className="item-table">
                <div className="item-head">
                  <span>#</span>
                  <span>Producto</span>
                  <span>{type === 'proforma' ? 'Kg/Neto' : 'Dato interno (opcional)'}</span>
                  <span>Precio USD/kg</span>
                  <span />
                </div>
                {fields.map((field, index) => {
                  const item = watchedItems[index];
                  const product = products.data?.find((p) => p.id === item?.productId);
                  const options =
                    variants.data?.filter((variant) => variant.product_id === product?.id) ?? [];
                  const variant = variants.data?.find((v) => v.id === item?.variantId);
                  return (
                    <div className="item-line" key={field.id}>
                      <span className="item-number">{index + 1}</span>
                      <div>
                        <select {...form.register(`items.${index}.productId`)}>
                          <option value="">Seleccionar…</option>
                          {products.data?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} · {p.name}
                            </option>
                          ))}
                        </select>
                        {options.length > 0 && (
                          <select
                            className="variant-select"
                            {...form.register(`items.${index}.variantId`)}
                          >
                            <option value="">Sin variante</option>
                            {options.map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        placeholder={type === 'proforma' ? '0.000' : 'Opcional'}
                        {...form.register(`items.${index}.quantityKg`)}
                      />
                      <span className="price-cell">
                        {product
                          ? `USD ${formatDecimal(variant?.price_override_usd ?? product.unit_price_usd, 2)}`
                          : '—'}
                      </span>
                      <button
                        type="button"
                        className="icon-button danger"
                        onClick={() => remove(index)}
                        disabled={fields.length === 1}
                        aria-label="Eliminar producto"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  );
                })}
              </div>
              {form.formState.errors.items?.root && (
                <small className="field-error">{form.formState.errors.items.root.message}</small>
              )}
            </div>
          )}
          {step === 4 && (
            <div className="form-step">
              <div className="review-banner">
                <div className={`type-icon ${type}`}>
                  <ClipboardList size={19} />
                </div>
                <div>
                  <strong>
                    {type === 'proposal' ? 'Propuesta económica' : 'Proforma económica'}
                  </strong>
                  <span>Se guardará como borrador. El número se asigna al generar.</span>
                </div>
              </div>
              <div className="review-grid">
                <div>
                  <span>Cliente</span>
                  <strong>
                    {selectedClient?.trade_name || selectedClient?.legal_name || 'Pendiente'}
                  </strong>
                </div>
                <div>
                  <span>Productos</span>
                  <strong>
                    {watchedItems.filter((item) => item.productId).length} de {fields.length}{' '}
                    seleccionados
                  </strong>
                </div>
                <div>
                  <span>Vigencia</span>
                  <strong>{form.getValues('validUntil')}</strong>
                </div>
                {previewTotals && (
                  <>
                    <div>
                      <span>Subtotal preliminar</span>
                      <strong>USD {previewTotals.subtotalUsd}</strong>
                    </div>
                    <div>
                      <span>IGV preliminar</span>
                      <strong>USD {previewTotals.taxUsd}</strong>
                    </div>
                    <div>
                      <span>Total preliminar</span>
                      <strong>USD {previewTotals.totalUsd}</strong>
                    </div>
                  </>
                )}
              </div>
              {save.error && (
                <div className="notice error">
                  {save.error instanceof Error
                    ? save.error.message
                    : 'No se pudo guardar el borrador.'}
                </div>
              )}
              {saved && <div className="notice success">Borrador creado correctamente.</div>}
            </div>
          )}
        </section>
        <aside className="builder-summary panel">
          <div className="summary-label">Progreso</div>
          <strong>Paso {step} de 4</strong>
          <p className="muted">Puedes volver a cualquier paso antes de guardar.</p>
          <div className="summary-divider" />
          {type === 'proforma' ? (
            <div className="summary-total">
              <span>Total preliminar</span>
              <strong>USD {previewTotals?.totalUsd ?? '—'}</strong>
              <small>IGV configurable · 18 % inicial</small>
            </div>
          ) : (
            <div className="summary-total">
              <span>Visibilidad de precios</span>
              <strong>Sin totales</strong>
              <small>La propuesta muestra USD/kg por producto.</small>
            </div>
          )}
          {step < 4 ? (
            <button type="button" className="button primary full" onClick={() => void next()}>
              Continuar <ArrowRight size={16} />
            </button>
          ) : (
            <button type="submit" className="button primary full" disabled={save.isPending}>
              {save.isPending ? 'Guardando…' : id ? 'Actualizar borrador' : 'Guardar borrador'}
              <Check size={16} />
            </button>
          )}
          {step > 1 && (
            <button
              type="button"
              className="button ghost full"
              onClick={() => setStep((current) => current - 1)}
            >
              <ArrowLeft size={16} />
              Atrás
            </button>
          )}
          <button
            type="button"
            className="text-button full"
            disabled={!saved || preview.isPending}
            onClick={() => {
              if (saved) void preview.mutateAsync(saved);
            }}
          >
            <FileDown size={15} />
            Vista previa PDF
          </button>
        </aside>
      </form>
    </div>
  );
}
