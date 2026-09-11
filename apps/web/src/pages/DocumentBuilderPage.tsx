import { useEffect, useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Check, ClipboardList, FileDown, Plus, Trash2 } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { calculateDocumentTotals, formatCurrencyAmount, formatDecimal } from '@frave/domain';
import {
  createDraft,
  invokePdfFunction,
  loadDocument,
  listClientAddresses,
  listClientContacts,
  listClients,
  listCommercialOptions,
  listProducts,
  listVariants,
  loadCompanySettings,
  getSuggestedExchangeRate,
  updateDraft,
} from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

const itemSchema = z.object({
  productId: z.string().min(1, 'Selecciona un producto'),
  variantId: z.string().optional(),
  sourceQuoteItemId: z.string().optional(),
  quotedUnitPriceUsd: z.string().optional(),
  quantityKg: z.string().optional(),
  observation: z.string().max(300).optional(),
});
const schema = z
  .object({
    type: z.enum(['proposal', 'proforma']),
    applyIgv: z.boolean(),
    currency: z.enum(['USD', 'PEN']),
    exchangeRatePenPerUsd: z.string().optional(),
    exchangeRateSource: z.string().optional(),
    exchangeRateObservedAt: z.string().optional(),
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
    if (
      values.currency === 'PEN' &&
      (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(values.exchangeRatePenPerUsd ?? '') ||
        Number(values.exchangeRatePenPerUsd) <= 0)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['exchangeRatePenPerUsd'],
        message: 'Ingresa una tasa válida (hasta 6 decimales)',
      });
    }
    values.items.forEach((item, index) => {
      if (
        values.type === 'proforma' &&
        (!/^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(item.quantityKg ?? '') ||
          Number(item.quantityKg) <= 0)
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
const formText = (value: string | number | null | undefined) =>
  value == null ? '' : String(value);
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
  const [stepMessage, setStepMessage] = useState('');
  const [saved, setSaved] = useState('');
  const clients = useQuery({ queryKey: ['clients'], queryFn: listClients });
  const products = useQuery({ queryKey: ['products'], queryFn: listProducts });
  const variants = useQuery({ queryKey: ['variants'], queryFn: () => listVariants() });
  const settings = useQuery({ queryKey: ['settings'], queryFn: loadCompanySettings });
  const commercialOptions = useQuery({
    queryKey: ['commercial-options'],
    queryFn: () => listCommercialOptions(),
  });
  const existing = useQuery({
    queryKey: ['document', id],
    queryFn: () => loadDocument(id ?? ''),
    enabled: Boolean(id),
  });
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: 'proposal',
      applyIgv: true,
      currency: 'USD',
      exchangeRatePenPerUsd: '',
      exchangeRateSource: '',
      exchangeRateObservedAt: '',
      clientId: '',
      contactId: '',
      addressId: '',
      paymentMethod: '50% adelanto, 50% contra entrega',
      deliveryMethod: 'Despacho coordinado con el cliente',
      validUntil: todayPlus(30),
      considerationsText: '',
      items: [
        {
          productId: '',
          variantId: '',
          sourceQuoteItemId: '',
          quotedUnitPriceUsd: '',
          quantityKg: '',
          observation: '',
        },
      ],
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
      applyIgv: document.apply_igv,
      currency: document.currency ?? 'USD',
      exchangeRatePenPerUsd: formText(document.exchange_rate_pen_per_usd),
      exchangeRateSource: document.exchange_rate_source ?? '',
      exchangeRateObservedAt: document.exchange_rate_observed_at ?? '',
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
        sourceQuoteItemId: item.source_quote_item_id ?? '',
        quotedUnitPriceUsd: item.source_quote_item_id ? formText(item.unit_price_usd) : '',
        quantityKg: formText(item.quantity_kg),
        observation: item.observation ?? '',
      })),
    });
  }, [existing.data, form]);
  const type = form.watch('type');
  const currency = form.watch('currency');
  const exchangeRatePenPerUsd = form.watch('exchangeRatePenPerUsd');
  const isConvertedConfirmation = Boolean(existing.data?.document.source_quote_id);
  const applyIgv = form.watch('applyIgv');
  const watchedItems = form.watch('items');
  const paymentMethod = form.watch('paymentMethod');
  const deliveryMethod = form.watch('deliveryMethod');
  const paymentOptions = useMemo(
    () => commercialOptions.data?.filter((option) => option.option_type === 'payment') ?? [],
    [commercialOptions.data],
  );
  const deliveryOptions = useMemo(
    () => commercialOptions.data?.filter((option) => option.option_type === 'delivery') ?? [],
    [commercialOptions.data],
  );
  const hasCompleteQuantities = useMemo(
    () =>
      watchedItems.length > 0 &&
      watchedItems.every(
        (item) =>
          /^(?:0|[1-9]\d*)(?:\.\d{1,3})?$/.test(item.quantityKg ?? '') &&
          Number(item.quantityKg) > 0,
      ),
    [watchedItems],
  );
  const shouldCalculateTotals = type === 'proforma' || hasCompleteQuantities;
  const exchangeRate = useMemo(() => {
    if (currency === 'USD') return 1;
    const value = Number(exchangeRatePenPerUsd);
    return Number.isFinite(value) && value > 0 ? value : null;
  }, [currency, exchangeRatePenPerUsd]);
  const priceInDocumentCurrency = (priceUsd: string | number | null | undefined) => {
    if (priceUsd == null || exchangeRate == null) return null;
    return (Number(priceUsd) * exchangeRate).toFixed(4);
  };
  const previewTotals = useMemo(() => {
    if (!shouldCalculateTotals || exchangeRate == null) return null;
    const lines = watchedItems
      .map((item) => {
        const product = products.data?.find((p) => p.id === item.productId);
        const variant = variants.data?.find((v) => v.id === item.variantId);
        const price =
          item.quotedUnitPriceUsd || variant?.price_override_usd || product?.unit_price_usd;
        const documentPrice = priceInDocumentCurrency(price);
        return documentPrice && item.quantityKg
          ? { quantityKg: item.quantityKg, unitPriceUsd: documentPrice }
          : null;
      })
      .filter((line): line is { quantityKg: string; unitPriceUsd: string } => Boolean(line));
    try {
      return lines.length === watchedItems.length
        ? calculateDocumentTotals(
            lines,
            type === 'proforma' || applyIgv ? (settings.data?.tax_rate ?? '0.18') : '0',
          ).totals
        : null;
    } catch {
      return null;
    }
  }, [
    applyIgv,
    products.data,
    settings.data?.tax_rate,
    shouldCalculateTotals,
    type,
    variants.data,
    watchedItems,
    exchangeRate,
    currency,
  ]);
  const suggestedRate = useMutation({
    mutationFn: getSuggestedExchangeRate,
    onSuccess: (data) => {
      form.setValue('exchangeRatePenPerUsd', data.rate, { shouldValidate: true });
      form.setValue('exchangeRateSource', data.source);
      form.setValue('exchangeRateObservedAt', data.observedAt ?? '');
    },
  });
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
          sourceQuoteItemId: item.sourceQuoteItemId || undefined,
          sku: product.sku,
          denomination: variant?.name ?? product.name,
          category: product.product_categories?.[0]?.name ?? 'Sin categoría',
          quantityKg: item.quantityKg || undefined,
          unitPriceUsd: String(variant?.price_override_usd ?? product.unit_price_usd),
          observation: item.observation,
        };
      });
      const input = {
        type: values.type,
        applyIgv: values.applyIgv,
        currency: values.currency,
        exchangeRatePenPerUsd:
          values.currency === 'PEN' ? values.exchangeRatePenPerUsd?.trim() : undefined,
        exchangeRateSource:
          values.currency === 'PEN' ? values.exchangeRateSource?.trim() : undefined,
        exchangeRateObservedAt:
          values.currency === 'PEN' ? values.exchangeRateObservedAt || undefined : undefined,
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
          ? ['paymentMethod', 'deliveryMethod', 'validUntil', 'currency', 'exchangeRatePenPerUsd']
          : ['items'],
    );
    if (valid) {
      setStepMessage('');
      setStep((current) => Math.min(current + 1, 4));
    } else {
      setStepMessage('Revisa los campos marcados antes de continuar.');
    }
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
          {isConvertedConfirmation && (
            <p className="field-help">
              Esta confirmación proviene de una cotización: conserva sus precios y no puede
              cambiarse de tipo.
            </p>
          )}
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
                  <p className="muted">
                    La cotización no afecta stock; la confirmación descuenta stock al emitirse.
                  </p>
                </div>
              </div>
              <div className="type-choice">
                <label className={type === 'proposal' ? 'selected' : ''}>
                  <input
                    type="radio"
                    value="proposal"
                    disabled={isConvertedConfirmation}
                    {...form.register('type')}
                  />
                  <span className="choice-icon">✦</span>
                  <strong>Cotización</strong>
                  <small>Cantidades opcionales; calcula totales si todas están completas.</small>
                </label>
                <label className={type === 'proforma' ? 'selected' : ''}>
                  <input
                    type="radio"
                    value="proforma"
                    disabled={isConvertedConfirmation}
                    {...form.register('type')}
                  />
                  <span className="choice-icon">$</span>
                  <strong>Confirmación de pedido</strong>
                  <small>Requiere cantidades y descuenta stock al emitir.</small>
                </label>
              </div>
              <label>
                Cliente
                <select {...form.register('clientId')}>
                  <option value="">Seleccionar cliente…</option>
                  {clients.data?.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.client_code} · {client.trade_name || client.legal_name} · RUC{' '}
                      {client.tax_id}
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
                  Moneda del documento
                  <select
                    disabled={isConvertedConfirmation}
                    {...form.register('currency')}
                    onChange={(event) => {
                      form.setValue('currency', event.target.value as 'USD' | 'PEN', {
                        shouldValidate: true,
                      });
                      if (event.target.value === 'USD') {
                        form.setValue('exchangeRatePenPerUsd', '');
                        form.setValue('exchangeRateSource', '');
                        form.setValue('exchangeRateObservedAt', '');
                      }
                    }}
                  >
                    <option value="USD">Dólares estadounidenses (USD)</option>
                    <option value="PEN">Soles peruanos (PEN)</option>
                  </select>
                  {isConvertedConfirmation && (
                    <small className="field-help">Se conserva la moneda de la cotización.</small>
                  )}
                </label>
                <label>
                  Forma de pago
                  <select required {...form.register('paymentMethod')}>
                    <option value="">Seleccionar modalidad…</option>
                    {paymentMethod &&
                      !paymentOptions.some((option) => option.label === paymentMethod) && (
                        <option value={paymentMethod}>{paymentMethod} (actual)</option>
                      )}
                    {paymentOptions.map((option) => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  {form.formState.errors.paymentMethod && (
                    <small className="field-error">
                      {form.formState.errors.paymentMethod.message}
                    </small>
                  )}
                </label>
                <label>
                  Forma de entrega
                  <select required {...form.register('deliveryMethod')}>
                    <option value="">Seleccionar modalidad…</option>
                    {deliveryMethod &&
                      !deliveryOptions.some((option) => option.label === deliveryMethod) && (
                        <option value={deliveryMethod}>{deliveryMethod} (actual)</option>
                      )}
                    {deliveryOptions.map((option) => (
                      <option key={option.id} value={option.label}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vigencia hasta
                  <input type="date" {...form.register('validUntil')} />
                </label>
              </div>
              {currency === 'PEN' && (
                <div className="exchange-rate-card">
                  <div>
                    <strong>Tasa de conversión</strong>
                    <small>Venta USD/PEN. Puedes ajustarla antes de guardar.</small>
                  </div>
                  <label>
                    S/ por USD
                    <input
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      disabled={isConvertedConfirmation}
                      {...form.register('exchangeRatePenPerUsd')}
                      onChange={(event) => {
                        form.setValue('exchangeRatePenPerUsd', event.target.value, {
                          shouldValidate: true,
                        });
                        form.setValue('exchangeRateSource', 'Manual');
                        form.setValue('exchangeRateObservedAt', '');
                      }}
                    />
                    {form.formState.errors.exchangeRatePenPerUsd && (
                      <small className="field-error">
                        {form.formState.errors.exchangeRatePenPerUsd.message}
                      </small>
                    )}
                  </label>
                  {!isConvertedConfirmation && (
                    <button
                      type="button"
                      className="button secondary small"
                      disabled={suggestedRate.isPending}
                      onClick={() => suggestedRate.mutate()}
                    >
                      {suggestedRate.isPending ? 'Consultando…' : 'Usar tasa BCRP'}
                    </button>
                  )}
                  {form.watch('exchangeRateSource') && (
                    <small className="exchange-rate-source">
                      Fuente: {form.watch('exchangeRateSource')}
                      {form.watch('exchangeRateObservedAt')
                        ? ` · ${form.watch('exchangeRateObservedAt')}`
                        : ''}
                    </small>
                  )}
                  {suggestedRate.error && (
                    <small className="field-error">
                      No se pudo consultar BCRP. Ingresa la tasa manualmente.
                    </small>
                  )}
                </div>
              )}
              <p className="field-help">
                ¿Necesitas otra modalidad? Un administrador puede agregarla en Configuración.
              </p>
              {type === 'proposal' && (
                <label className="checkbox-field">
                  <input type="checkbox" {...form.register('applyIgv')} />
                  <span>
                    <strong>Aplicar IGV a esta cotización</strong>
                    <small>Se congela al emitir el documento.</small>
                  </span>
                </label>
              )}
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
                    El precio y la disponibilidad se toman del catálogo y se congelan al emitir.
                  </p>
                </div>
                <button
                  type="button"
                  className="button secondary small"
                  onClick={() =>
                    append({
                      productId: '',
                      variantId: '',
                      sourceQuoteItemId: '',
                      quotedUnitPriceUsd: '',
                      quantityKg: '',
                      observation: '',
                    })
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
                  <span>{type === 'proforma' ? 'Kg/Neto' : 'Kg/Neto (opcional)'}</span>
                  <span>Precio {currency}/kg</span>
                  <span />
                </div>
                {fields.map((field, index) => {
                  const item = watchedItems[index];
                  const quantityError = form.formState.errors.items?.[index]?.quantityKg?.message;
                  const product = products.data?.find((p) => p.id === item?.productId);
                  const options =
                    variants.data?.filter((variant) => variant.product_id === product?.id) ?? [];
                  const variant = variants.data?.find((v) => v.id === item?.variantId);
                  const productField = form.register(`items.${index}.productId`);
                  const variantField = form.register(`items.${index}.variantId`);
                  const displayedPrice =
                    item?.quotedUnitPriceUsd ||
                    variant?.price_override_usd ||
                    product?.unit_price_usd;
                  const displayedDocumentPrice = priceInDocumentCurrency(displayedPrice);
                  return (
                    <div className="item-line" key={field.id}>
                      <span className="item-number">{index + 1}</span>
                      <div>
                        <select
                          {...productField}
                          onChange={(event) => {
                            productField.onChange(event);
                            form.setValue(`items.${index}.variantId`, '');
                            form.setValue(`items.${index}.sourceQuoteItemId`, '');
                            form.setValue(`items.${index}.quotedUnitPriceUsd`, '');
                          }}
                        >
                          <option value="">Seleccionar…</option>
                          {products.data?.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.sku} · {p.name} · Stock {formatDecimal(p.stock_kg, 3)} kg
                            </option>
                          ))}
                        </select>
                        {options.length > 0 && (
                          <select
                            className="variant-select"
                            {...variantField}
                            onChange={(event) => {
                              variantField.onChange(event);
                              form.setValue(`items.${index}.sourceQuoteItemId`, '');
                              form.setValue(`items.${index}.quotedUnitPriceUsd`, '');
                            }}
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
                      <div className="item-quantity">
                        <input
                          type="number"
                          min="0"
                          step="0.001"
                          placeholder={type === 'proforma' ? '0.000' : 'Opcional'}
                          aria-invalid={Boolean(quantityError)}
                          {...form.register(`items.${index}.quantityKg`)}
                        />
                        {quantityError && <small className="field-error">{quantityError}</small>}
                      </div>
                      <span className="price-cell">
                        {product && displayedDocumentPrice
                          ? `${currency === 'PEN' ? 'S/' : 'USD'} ${formatCurrencyAmount(displayedDocumentPrice)}`
                          : '—'}
                        {product && <small>Stock: {formatDecimal(product.stock_kg, 3)} kg</small>}
                        {item?.sourceQuoteItemId && (
                          <small>Precio conservado de la cotización</small>
                        )}
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
              {stepMessage && <div className="notice error">{stepMessage}</div>}
            </div>
          )}
          {step === 4 && (
            <div className="form-step">
              <div className="review-banner">
                <div className={`type-icon ${type}`}>
                  <ClipboardList size={19} />
                </div>
                <div>
                  <strong>{type === 'proposal' ? 'Cotización' : 'Confirmación de pedido'}</strong>
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
                      <strong>
                        {currency === 'PEN' ? 'S/' : 'USD'}{' '}
                        {formatCurrencyAmount(previewTotals.subtotalUsd)}
                      </strong>
                    </div>
                    <div>
                      <span>IGV preliminar</span>
                      <strong>
                        {currency === 'PEN' ? 'S/' : 'USD'}{' '}
                        {formatCurrencyAmount(previewTotals.taxUsd)}
                      </strong>
                    </div>
                    <div>
                      <span>Total preliminar</span>
                      <strong>
                        {currency === 'PEN' ? 'S/' : 'USD'}{' '}
                        {formatCurrencyAmount(previewTotals.totalUsd)}
                      </strong>
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
          {shouldCalculateTotals ? (
            <div className="summary-total">
              <span>Total preliminar</span>
              <strong>
                {currency === 'PEN' ? 'S/' : 'USD'}{' '}
                {previewTotals ? formatCurrencyAmount(previewTotals.totalUsd) : '—'}
              </strong>
              <small>
                {type === 'proposal' && !applyIgv
                  ? 'IGV no aplicado a esta cotización'
                  : 'IGV configurable según la configuración comercial'}
              </small>
            </div>
          ) : (
            <div className="summary-total">
              <span>Totales pendientes</span>
              <strong>Completa los Kg</strong>
              <small>La cotización mostrará precio por kg hasta tener todas las cantidades.</small>
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
