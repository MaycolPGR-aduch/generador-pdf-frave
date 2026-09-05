import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Database,
  PackageSearch,
  Plus,
  RotateCcw,
  Save,
  Search,
  Settings2,
  UsersRound,
} from 'lucide-react';
import {
  adjustProductStock,
  createCategory,
  createCommercialOption,
  createClient,
  createClientAddress,
  createClientContact,
  createProduct,
  createVariant,
  createBankAccount,
  inviteUser,
  listCategories,
  listClients,
  listCommercialOptions,
  listProducts,
  listVariants,
  listBankAccounts,
  loadCompanySettings,
  listInventoryMovements,
  updateCompanySettings,
  updateClient,
  updateProduct,
  updateVariant,
} from '../lib/api';
import { useAuth } from '../auth/AuthProvider';
import type { CommercialOptionType, ProductCategory } from '../lib/types';
import { formatDecimal } from '@frave/domain';

type Tab = 'catalog' | 'clients' | 'settings' | 'users';

type SettingsForm = {
  displayName: string;
  legalName: string;
  taxId: string;
  taxRate: string;
  defaultValidityDays: number;
  lowStockThresholdKg: string;
  primaryAddress: string;
  footerAddress: string;
  location: string;
  district: string;
  country: string;
  brandColor: string;
};

const emptySettings: SettingsForm = {
  displayName: '',
  legalName: '',
  taxId: '',
  taxRate: '0.1800',
  defaultValidityDays: 30,
  lowStockThresholdKg: '5',
  primaryAddress: '',
  footerAddress: '',
  location: 'Lima',
  district: 'Comas',
  country: 'Perú',
  brandColor: '#f47c20',
};
const PAGE_SIZE = 20;
function pageSlice<T>(items: T[], page: number) {
  return items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
}

function normalizeSearch(value: string | null | undefined) {
  return (value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function productCategoryName(
  product: { category_id: string; product_categories?: Array<{ name: string }> | null },
  categories: ProductCategory[],
) {
  return (
    product.product_categories?.[0]?.name ??
    categories.find((category) => category.id === product.category_id)?.name ??
    'Sin categoría'
  );
}

export function AdminPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('catalog');
  const [message, setMessage] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [product, setProduct] = useState({
    sku: '',
    name: '',
    categoryId: '',
    unitPriceUsd: '',
    initialStockKg: '0',
  });
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [stockAdjustment, setStockAdjustment] = useState({
    productId: '',
    quantityDeltaKg: '',
    reason: '',
  });
  const [variant, setVariant] = useState({ productId: '', name: '', priceOverrideUsd: '' });
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [productCategoryId, setProductCategoryId] = useState('');
  const [variantSearch, setVariantSearch] = useState('');
  const [variantCategoryId, setVariantCategoryId] = useState('');
  const [variantProductId, setVariantProductId] = useState('');
  const [customer, setCustomer] = useState({ legalName: '', tradeName: '', taxId: '' });
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [productPage, setProductPage] = useState(1);
  const [variantPage, setVariantPage] = useState(1);
  const [clientPage, setClientPage] = useState(1);
  const [clientSearch, setClientSearch] = useState('');
  const [clientContact, setClientContact] = useState({
    clientId: '',
    fullName: '',
    salutation: '',
    email: '',
    phone: '',
  });
  const [clientAddress, setClientAddress] = useState({
    clientId: '',
    label: 'Principal',
    address: '',
    district: '',
    city: '',
  });
  const [invite, setInvite] = useState({
    email: '',
    fullName: '',
    role: 'seller' as 'admin' | 'seller',
  });
  const [settingsForm, setSettingsForm] = useState<SettingsForm>(emptySettings);
  const [bank, setBank] = useState({
    currency: 'USD' as 'PEN' | 'USD',
    bankName: '',
    accountType: 'Cuenta corriente',
    accountNumber: '',
    cci: '',
  });
  const [paymentOptionLabel, setPaymentOptionLabel] = useState('');
  const [deliveryOptionLabel, setDeliveryOptionLabel] = useState('');

  const products = useQuery({ queryKey: ['products'], queryFn: listProducts });
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const variants = useQuery({ queryKey: ['variants'], queryFn: () => listVariants() });
  const banks = useQuery({ queryKey: ['banks'], queryFn: listBankAccounts });
  const clients = useQuery({ queryKey: ['clients'], queryFn: listClients });
  const settings = useQuery({ queryKey: ['settings'], queryFn: loadCompanySettings });
  const commercialOptions = useQuery({
    queryKey: ['commercial-options'],
    queryFn: () => listCommercialOptions(),
  });
  const inventoryMovements = useQuery({
    queryKey: ['inventory-movements'],
    queryFn: listInventoryMovements,
  });

  const filteredProducts = useMemo(() => {
    const search = normalizeSearch(productSearch);
    return (products.data ?? []).filter((item) => {
      const categoryName = productCategoryName(item, categories.data ?? []);
      const matchesCategory = !productCategoryId || item.category_id === productCategoryId;
      const searchable = normalizeSearch(`${item.sku} ${item.name} ${categoryName}`);
      return matchesCategory && (!search || searchable.includes(search));
    });
  }, [categories.data, productCategoryId, productSearch, products.data]);

  const filteredVariants = useMemo(() => {
    const search = normalizeSearch(variantSearch);
    const productById = new Map((products.data ?? []).map((item) => [item.id, item]));
    return (variants.data ?? []).filter((item) => {
      const parent = productById.get(item.product_id);
      const matchesProduct = !variantProductId || item.product_id === variantProductId;
      const matchesCategory = !variantCategoryId || parent?.category_id === variantCategoryId;
      const searchable = normalizeSearch(
        `${item.name} ${parent?.sku ?? ''} ${parent?.name ?? ''} ${
          parent ? productCategoryName(parent, categories.data ?? []) : ''
        }`,
      );
      return matchesProduct && matchesCategory && (!search || searchable.includes(search));
    });
  }, [
    categories.data,
    products.data,
    variantCategoryId,
    variantProductId,
    variantSearch,
    variants.data,
  ]);
  const filteredClients = useMemo(() => {
    const search = normalizeSearch(clientSearch);
    return (clients.data ?? []).filter(
      (item) =>
        !search ||
        normalizeSearch(`${item.legal_name} ${item.trade_name ?? ''} ${item.tax_id}`).includes(
          search,
        ),
    );
  }, [clientSearch, clients.data]);
  const productPages = Math.max(1, Math.ceil(filteredProducts.length / PAGE_SIZE));
  const variantPages = Math.max(1, Math.ceil(filteredVariants.length / PAGE_SIZE));
  const clientPages = Math.max(1, Math.ceil(filteredClients.length / PAGE_SIZE));

  const paymentOptions = useMemo(
    () => commercialOptions.data?.filter((option) => option.option_type === 'payment') ?? [],
    [commercialOptions.data],
  );
  const deliveryOptions = useMemo(
    () => commercialOptions.data?.filter((option) => option.option_type === 'delivery') ?? [],
    [commercialOptions.data],
  );

  function clearCatalogFilters() {
    setProductSearch('');
    setProductCategoryId('');
    setVariantSearch('');
    setVariantCategoryId('');
    setVariantProductId('');
    setProductPage(1);
    setVariantPage(1);
  }

  function startProductEdit(item: (typeof filteredProducts)[number]) {
    setEditingProductId(item.id);
    setProduct({
      sku: item.sku,
      name: item.name,
      categoryId: item.category_id,
      unitPriceUsd: item.unit_price_usd,
      initialStockKg: item.stock_kg,
    });
  }

  function startVariantEdit(item: (typeof filteredVariants)[number]) {
    setEditingVariantId(item.id);
    setVariant({
      productId: item.product_id,
      name: item.name,
      priceOverrideUsd: item.price_override_usd ?? '',
    });
  }

  function startClientEdit(item: (typeof filteredClients)[number]) {
    setEditingClientId(item.id);
    setCustomer({
      legalName: item.legal_name,
      tradeName: item.trade_name ?? '',
      taxId: item.tax_id,
    });
  }

  useEffect(() => {
    if (!settings.data) return;
    setSettingsForm({
      displayName: settings.data.display_name,
      legalName: settings.data.legal_name,
      taxId: settings.data.tax_id,
      taxRate: settings.data.tax_rate,
      defaultValidityDays: settings.data.default_validity_days,
      lowStockThresholdKg: settings.data.low_stock_threshold_kg,
      primaryAddress: settings.data.primary_address,
      footerAddress: settings.data.footer_address,
      location: settings.data.location,
      district: settings.data.district,
      country: settings.data.country,
      brandColor: settings.data.brand_color,
    });
  }, [settings.data]);

  const categoryMutation = useMutation({
    mutationFn: () => createCategory(categoryName),
    onSuccess: () => {
      setCategoryName('');
      setMessage('Categoría creada.');
      void queryClient.invalidateQueries({ queryKey: ['categories'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la categoría.'),
  });

  const productMutation = useMutation({
    mutationFn: () =>
      editingProductId
        ? updateProduct({ ...product, id: editingProductId })
        : createProduct(product),
    onSuccess: () => {
      setProduct({ sku: '', name: '', categoryId: '', unitPriceUsd: '', initialStockKg: '0' });
      setEditingProductId(null);
      setMessage('Producto guardado.');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el producto.'),
  });

  const stockAdjustmentMutation = useMutation({
    mutationFn: () => adjustProductStock(stockAdjustment),
    onSuccess: () => {
      setStockAdjustment({ productId: '', quantityDeltaKg: '', reason: '' });
      setMessage('Stock ajustado y movimiento registrado.');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
      void queryClient.invalidateQueries({ queryKey: ['inventory-movements'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo ajustar el stock.'),
  });

  const variantMutation = useMutation({
    mutationFn: () =>
      editingVariantId
        ? updateVariant({ ...variant, id: editingVariantId })
        : createVariant(variant),
    onSuccess: () => {
      setVariant({ productId: '', name: '', priceOverrideUsd: '' });
      setEditingVariantId(null);
      setMessage('Variante guardada.');
      void queryClient.invalidateQueries({ queryKey: ['variants'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la variante.'),
  });

  const clientMutation = useMutation({
    mutationFn: () =>
      editingClientId ? updateClient({ ...customer, id: editingClientId }) : createClient(customer),
    onSuccess: () => {
      setCustomer({ legalName: '', tradeName: '', taxId: '' });
      setEditingClientId(null);
      setMessage('Cliente guardado.');
      void queryClient.invalidateQueries({ queryKey: ['clients'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el cliente.'),
  });

  const contactMutation = useMutation({
    mutationFn: () => createClientContact(clientContact),
    onSuccess: () => {
      setClientContact({ clientId: '', fullName: '', salutation: '', email: '', phone: '' });
      setMessage('Contacto creado.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el contacto.'),
  });

  const addressMutation = useMutation({
    mutationFn: () => createClientAddress(clientAddress),
    onSuccess: () => {
      setClientAddress({ clientId: '', label: 'Principal', address: '', district: '', city: '' });
      setMessage('Dirección creada.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la dirección.'),
  });

  const settingsMutation = useMutation({
    mutationFn: () => updateCompanySettings(settingsForm),
    onSuccess: () => {
      setMessage('Configuración guardada.');
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo guardar la configuración.'),
  });

  const bankMutation = useMutation({
    mutationFn: () => createBankAccount(bank),
    onSuccess: () => {
      setBank({
        currency: 'USD',
        bankName: '',
        accountType: 'Cuenta corriente',
        accountNumber: '',
        cci: '',
      });
      setMessage('Cuenta bancaria agregada.');
      void queryClient.invalidateQueries({ queryKey: ['banks'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo agregar la cuenta.'),
  });

  const commercialOptionMutation = useMutation({
    mutationFn: (input: { optionType: CommercialOptionType; label: string }) =>
      createCommercialOption(input),
    onSuccess: (_, input) => {
      if (input.optionType === 'payment') setPaymentOptionLabel('');
      if (input.optionType === 'delivery') setDeliveryOptionLabel('');
      setMessage('Opción comercial agregada.');
      void queryClient.invalidateQueries({ queryKey: ['commercial-options'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo agregar la opción.'),
  });

  const inviteMutation = useMutation({
    mutationFn: () => inviteUser(invite),
    onSuccess: () => {
      setInvite({ email: '', fullName: '', role: 'seller' });
      setMessage('Invitación enviada.');
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo invitar al usuario.'),
  });

  if (profile?.role !== 'admin') {
    return (
      <div className="empty-state">
        <UsersRound size={32} />
        <h2>Acceso restringido</h2>
        <p>Solo un administrador puede gestionar este espacio.</p>
      </div>
    );
  }

  function submitCatalog(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    productMutation.mutate();
  }

  function submitStockAdjustment(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    stockAdjustmentMutation.mutate();
  }

  function submitCategory() {
    setMessage('');
    categoryMutation.mutate();
  }

  function submitVariant() {
    setMessage('');
    variantMutation.mutate();
  }

  function submitClient(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    clientMutation.mutate();
  }

  function submitContact(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    contactMutation.mutate();
  }

  function submitAddress(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    addressMutation.mutate();
  }

  function submitSettings(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    settingsMutation.mutate();
  }

  function submitInvite(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    inviteMutation.mutate();
  }

  function submitBank(event: FormEvent) {
    event.preventDefault();
    setMessage('');
    bankMutation.mutate();
  }

  function submitCommercialOption(
    event: FormEvent,
    optionType: Extract<CommercialOptionType, 'payment' | 'delivery'>,
    label: string,
  ) {
    event.preventDefault();
    setMessage('');
    commercialOptionMutation.mutate({ optionType, label });
  }

  const tabItems = [
    { id: 'catalog' as const, label: 'Catálogo', icon: PackageSearch },
    { id: 'clients' as const, label: 'Clientes', icon: UsersRound },
    { id: 'settings' as const, label: 'Configuración', icon: Settings2 },
    { id: 'users' as const, label: 'Usuarios', icon: Database },
  ];

  return (
    <div className="admin-page">
      <div className="page-heading">
        <div>
          <div className="eyebrow">Control del sistema</div>
          <h1>Administración</h1>
          <p className="muted">Gestiona los datos que alimentan cada documento.</p>
        </div>
      </div>

      <div className="admin-tabs" role="tablist" aria-label="Secciones de administración">
        {tabItems.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={tab === id ? 'active' : ''}
            onClick={() => {
              setTab(id);
              setMessage('');
            }}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>

      {tab === 'catalog' && (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Productos y categorías</h2>
              <p className="muted">
                Los registros se desactivan lógicamente y no se eliminan si están referenciados.
              </p>
            </div>
            <span className="count-badge">{products.data?.length ?? '—'} productos activos</span>
          </div>
          <details className="admin-workspace" open>
            <summary>Crear o editar productos y variantes</summary>
            <form className="admin-form" onSubmit={submitCatalog}>
              <div className="form-subheading">
                <Plus size={15} />
                Nueva categoría
              </div>
              <div className="inline-form">
                <input
                  value={categoryName}
                  onChange={(event) => setCategoryName(event.target.value)}
                  placeholder="Ej. Envases PET"
                />
                <button
                  className="button secondary"
                  type="button"
                  onClick={submitCategory}
                  disabled={!categoryName.trim() || categoryMutation.isPending}
                >
                  Agregar categoría
                </button>
              </div>
              <div className="form-subheading">
                <Plus size={15} />
                Nuevo producto
              </div>
              <div className="two-columns">
                <label>
                  SKU
                  <input
                    required
                    value={product.sku}
                    onChange={(event) => setProduct({ ...product, sku: event.target.value })}
                    placeholder="FR-001"
                  />
                </label>
                <label>
                  Denominación
                  <input
                    required
                    value={product.name}
                    onChange={(event) => setProduct({ ...product, name: event.target.value })}
                    placeholder="Nombre comercial"
                  />
                </label>
                <label>
                  Categoría
                  <select
                    required
                    value={product.categoryId}
                    onChange={(event) => setProduct({ ...product, categoryId: event.target.value })}
                  >
                    <option value="">Seleccionar…</option>
                    {categories.data?.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Precio USD/kg
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.0001"
                    value={product.unitPriceUsd}
                    onChange={(event) =>
                      setProduct({ ...product, unitPriceUsd: event.target.value })
                    }
                    placeholder="0.0000"
                  />
                </label>
                <label>
                  Stock inicial (kg)
                  <input
                    required
                    type="number"
                    min="0"
                    step="0.001"
                    value={product.initialStockKg}
                    onChange={(event) =>
                      setProduct({ ...product, initialStockKg: event.target.value })
                    }
                    placeholder="0.000"
                  />
                </label>
              </div>
              <button className="button primary" disabled={productMutation.isPending}>
                <Save size={15} />
                {editingProductId ? 'Guardar cambios' : 'Crear producto'}
              </button>
              {editingProductId && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setEditingProductId(null);
                    setProduct({
                      sku: '',
                      name: '',
                      categoryId: '',
                      unitPriceUsd: '',
                      initialStockKg: '0',
                    });
                  }}
                >
                  Cancelar edición
                </button>
              )}
              <div className="form-subheading">
                <Plus size={15} />
                Nueva variante
              </div>
              <div className="two-columns">
                <label>
                  Producto
                  <select
                    value={variant.productId}
                    onChange={(event) => setVariant({ ...variant, productId: event.target.value })}
                  >
                    <option value="">Seleccionar…</option>
                    {products.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Denominación alternativa
                  <input
                    value={variant.name}
                    onChange={(event) => setVariant({ ...variant, name: event.target.value })}
                    placeholder="Ej. Tapa negra 500 ml"
                  />
                </label>
                <label>
                  Precio alternativo USD/kg
                  <input
                    type="number"
                    min="0"
                    step="0.0001"
                    value={variant.priceOverrideUsd}
                    onChange={(event) =>
                      setVariant({ ...variant, priceOverrideUsd: event.target.value })
                    }
                    placeholder="Opcional"
                  />
                </label>
              </div>
              <button
                className="button secondary"
                type="button"
                onClick={submitVariant}
                disabled={variantMutation.isPending || !variant.productId || !variant.name.trim()}
              >
                <Save size={15} />
                {editingVariantId ? 'Guardar cambios' : 'Crear variante'}
              </button>
              {editingVariantId && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setEditingVariantId(null);
                    setVariant({ productId: '', name: '', priceOverrideUsd: '' });
                  }}
                >
                  Cancelar edición
                </button>
              )}
            </form>
          </details>
          <div className="catalog-list-heading catalog-list-heading-spaced">
            <div>
              <h3>Control de stock</h3>
              <p className="muted">
                Unidad única: kg. Los ajustes quedan registrados y las confirmaciones descuentan al
                emitirse.
              </p>
            </div>
          </div>
          <details className="admin-workspace">
            <summary>Gestionar stock y movimientos</summary>
            <form className="admin-form" onSubmit={submitStockAdjustment}>
              <div className="two-columns">
                <label>
                  Producto
                  <select
                    required
                    value={stockAdjustment.productId}
                    onChange={(event) =>
                      setStockAdjustment({ ...stockAdjustment, productId: event.target.value })
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {products.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.sku} · {item.name} · {formatDecimal(item.stock_kg, 3)} kg
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Ajuste (kg)
                  <input
                    required
                    type="number"
                    step="0.001"
                    value={stockAdjustment.quantityDeltaKg}
                    onChange={(event) =>
                      setStockAdjustment({
                        ...stockAdjustment,
                        quantityDeltaKg: event.target.value,
                      })
                    }
                    placeholder="Ej. 25.000 o -2.500"
                  />
                </label>
                <label className="full-span">
                  Motivo del ajuste
                  <input
                    required
                    maxLength={300}
                    value={stockAdjustment.reason}
                    onChange={(event) =>
                      setStockAdjustment({ ...stockAdjustment, reason: event.target.value })
                    }
                    placeholder="Ej. Ingreso de almacén / corrección de inventario"
                  />
                </label>
              </div>
              <button className="button secondary" disabled={stockAdjustmentMutation.isPending}>
                <Save size={15} />
                {stockAdjustmentMutation.isPending ? 'Registrando…' : 'Registrar ajuste'}
              </button>
            </form>
            <div className="catalog-list-heading catalog-list-heading-spaced">
              <div>
                <h3>Movimientos recientes</h3>
                <p className="muted">Saldo inicial, ajustes, emisión y devolución por anulación.</p>
              </div>
            </div>
            {inventoryMovements.data?.length ? (
              <div className="admin-list inventory-list">
                {inventoryMovements.data.map((movement) => (
                  <div key={movement.id}>
                    <strong>
                      {movement.quantity_delta_kg.startsWith('-') ? '' : '+'}
                      {formatDecimal(movement.quantity_delta_kg.replace('-', ''), 3)} kg
                    </strong>
                    <span>
                      {movement.products?.sku ?? 'Producto'} · {movement.products?.name ?? ''} ·{' '}
                      {movement.reason}
                    </span>
                    <b>
                      {formatDecimal(movement.stock_before_kg, 3)} →{' '}
                      {formatDecimal(movement.stock_after_kg, 3)} kg
                      {movement.documents?.number ? ` · ${movement.documents.number}` : ''}
                    </b>
                  </div>
                ))}
              </div>
            ) : (
              <div className="catalog-list-empty">Aún no hay movimientos de inventario.</div>
            )}
          </details>
          <div className="catalog-list-heading">
            <div>
              <h3>Productos activos</h3>
              <p className="muted">Busca por SKU, código, denominación o categoría.</p>
            </div>
            <span className="count-badge">
              {filteredProducts.length} de {products.data?.length ?? 0}
            </span>
          </div>
          <div className="catalog-filters">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Buscar productos</span>
              <input
                value={productSearch}
                onChange={(event) => {
                  setProductSearch(event.target.value);
                  setProductPage(1);
                }}
                placeholder="Buscar por SKU, código o nombre…"
              />
            </label>
            <label className="filter-field">
              Categoría
              <select
                value={productCategoryId}
                onChange={(event) => {
                  setProductCategoryId(event.target.value);
                  setProductPage(1);
                }}
              >
                <option value="">Todas las categorías</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="button ghost small filter-reset"
              onClick={clearCatalogFilters}
              disabled={
                !productSearch &&
                !productCategoryId &&
                !variantSearch &&
                !variantCategoryId &&
                !variantProductId
              }
            >
              <RotateCcw size={14} />
              Limpiar
            </button>
          </div>
          {filteredProducts.length ? (
            <div className="admin-list">
              {pageSlice(filteredProducts, Math.min(productPage, productPages)).map((item) => (
                <div key={item.id}>
                  <strong>{item.sku}</strong>
                  <span>
                    {item.name} · {productCategoryName(item, categories.data ?? [])}
                  </span>
                  <b>
                    USD {item.unit_price_usd} · Stock {formatDecimal(item.stock_kg, 3)} kg
                  </b>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => startProductEdit(item)}
                  >
                    Editar
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="catalog-list-empty">
              No hay productos que coincidan con los filtros.
            </div>
          )}
          {filteredProducts.length > PAGE_SIZE && (
            <div className="pagination">
              <button
                type="button"
                className="button ghost small"
                disabled={productPage <= 1}
                onClick={() => setProductPage((value) => value - 1)}
              >
                Anterior
              </button>
              <span>
                Página {Math.min(productPage, productPages)} de {productPages}
              </span>
              <button
                type="button"
                className="button ghost small"
                disabled={productPage >= productPages}
                onClick={() => setProductPage((value) => value + 1)}
              >
                Siguiente
              </button>
            </div>
          )}

          <div className="catalog-list-heading catalog-list-heading-spaced">
            <div>
              <h3>Variantes activas</h3>
              <p className="muted">Filtra por producto y busca por nombre, SKU o categoría.</p>
            </div>
            <span className="count-badge">
              {filteredVariants.length} de {variants.data?.length ?? 0}
            </span>
          </div>
          <div className="catalog-filters variant-filters">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Buscar variantes</span>
              <input
                value={variantSearch}
                onChange={(event) => {
                  setVariantSearch(event.target.value);
                  setVariantPage(1);
                }}
                placeholder="Buscar variante, SKU o producto…"
              />
            </label>
            <label className="filter-field">
              Categoría
              <select
                value={variantCategoryId}
                onChange={(event) => {
                  setVariantCategoryId(event.target.value);
                  setVariantPage(1);
                }}
              >
                <option value="">Todas las categorías</option>
                {categories.data?.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              Producto
              <select
                value={variantProductId}
                onChange={(event) => {
                  setVariantProductId(event.target.value);
                  setVariantPage(1);
                }}
              >
                <option value="">Todos los productos</option>
                {products.data?.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.sku} · {item.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {filteredVariants.length ? (
            <div className="admin-list">
              {pageSlice(filteredVariants, Math.min(variantPage, variantPages)).map((item) => {
                const parent = products.data?.find(
                  (productItem) => productItem.id === item.product_id,
                );
                return (
                  <div key={item.id}>
                    <strong>Variante</strong>
                    <span>
                      {item.name} · {parent?.sku ?? 'Sin SKU'} ·{' '}
                      {parent?.name ?? 'Producto pendiente'}
                    </span>
                    <b>
                      {item.price_override_usd ? `USD ${item.price_override_usd}` : 'Precio base'}
                    </b>
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => startVariantEdit(item)}
                    >
                      Editar
                    </button>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="catalog-list-empty">
              No hay variantes que coincidan con los filtros.
            </div>
          )}
          {filteredVariants.length > PAGE_SIZE && (
            <div className="pagination">
              <button
                type="button"
                className="button ghost small"
                disabled={variantPage <= 1}
                onClick={() => setVariantPage((value) => value - 1)}
              >
                Anterior
              </button>
              <span>
                Página {Math.min(variantPage, variantPages)} de {variantPages}
              </span>
              <button
                type="button"
                className="button ghost small"
                disabled={variantPage >= variantPages}
                onClick={() => setVariantPage((value) => value + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'clients' && (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Clientes operativos</h2>
              <p className="muted">Los clientes nuevos requieren RUC de 11 dígitos.</p>
            </div>
            <span className="count-badge">{clients.data?.length ?? '—'} activos</span>
          </div>
          <details className="admin-workspace" open>
            <summary>Crear o editar cliente</summary>
            <form className="admin-form" onSubmit={submitClient}>
              <div className="two-columns">
                <label>
                  Razón social
                  <input
                    required
                    value={customer.legalName}
                    onChange={(event) =>
                      setCustomer({ ...customer, legalName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Nombre comercial
                  <input
                    value={customer.tradeName}
                    onChange={(event) =>
                      setCustomer({ ...customer, tradeName: event.target.value })
                    }
                  />
                </label>
                <label>
                  RUC
                  <input
                    required
                    pattern="[0-9]{11}"
                    value={customer.taxId}
                    onChange={(event) => setCustomer({ ...customer, taxId: event.target.value })}
                    placeholder="20123456789"
                  />
                </label>
              </div>
              <button className="button primary" disabled={clientMutation.isPending}>
                {editingClientId ? <Save size={15} /> : <Plus size={15} />}
                {editingClientId ? 'Guardar cambios' : 'Crear cliente'}
              </button>
              {editingClientId && (
                <button
                  type="button"
                  className="button ghost"
                  onClick={() => {
                    setEditingClientId(null);
                    setCustomer({ legalName: '', tradeName: '', taxId: '' });
                  }}
                >
                  Cancelar edición
                </button>
              )}
            </form>
          </details>
          <div className="admin-section-heading">
            <div>
              <h2>Contactos y direcciones</h2>
              <p className="muted">
                Asigna datos opcionales que quedarán congelados en el documento.
              </p>
            </div>
          </div>
          <details className="admin-workspace">
            <summary>Agregar contacto</summary>
            <form className="admin-form" onSubmit={submitContact}>
              <div className="two-columns">
                <label>
                  Cliente
                  <select
                    required
                    value={clientContact.clientId}
                    onChange={(event) =>
                      setClientContact({ ...clientContact, clientId: event.target.value })
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {clients.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.trade_name || item.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Nombre del contacto
                  <input
                    required
                    value={clientContact.fullName}
                    onChange={(event) =>
                      setClientContact({ ...clientContact, fullName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Tratamiento
                  <input
                    value={clientContact.salutation}
                    onChange={(event) =>
                      setClientContact({ ...clientContact, salutation: event.target.value })
                    }
                    placeholder="Sr. / Sra."
                  />
                </label>
                <label>
                  Correo
                  <input
                    type="email"
                    value={clientContact.email}
                    onChange={(event) =>
                      setClientContact({ ...clientContact, email: event.target.value })
                    }
                  />
                </label>
                <label>
                  Teléfono
                  <input
                    value={clientContact.phone}
                    onChange={(event) =>
                      setClientContact({ ...clientContact, phone: event.target.value })
                    }
                  />
                </label>
              </div>
              <button className="button secondary" disabled={contactMutation.isPending}>
                <Plus size={15} />
                Agregar contacto
              </button>
            </form>
          </details>
          <details className="admin-workspace">
            <summary>Agregar dirección</summary>
            <form className="admin-form" onSubmit={submitAddress}>
              <div className="two-columns">
                <label>
                  Cliente
                  <select
                    required
                    value={clientAddress.clientId}
                    onChange={(event) =>
                      setClientAddress({ ...clientAddress, clientId: event.target.value })
                    }
                  >
                    <option value="">Seleccionar…</option>
                    {clients.data?.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.trade_name || item.legal_name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Etiqueta
                  <input
                    required
                    value={clientAddress.label}
                    onChange={(event) =>
                      setClientAddress({ ...clientAddress, label: event.target.value })
                    }
                  />
                </label>
                <label className="full-span">
                  Dirección
                  <input
                    required
                    value={clientAddress.address}
                    onChange={(event) =>
                      setClientAddress({ ...clientAddress, address: event.target.value })
                    }
                  />
                </label>
                <label>
                  Distrito
                  <input
                    value={clientAddress.district}
                    onChange={(event) =>
                      setClientAddress({ ...clientAddress, district: event.target.value })
                    }
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    value={clientAddress.city}
                    onChange={(event) =>
                      setClientAddress({ ...clientAddress, city: event.target.value })
                    }
                  />
                </label>
              </div>
              <button className="button secondary" disabled={addressMutation.isPending}>
                <Plus size={15} />
                Agregar dirección
              </button>
            </form>
          </details>
          <div className="catalog-list-heading catalog-list-heading-spaced">
            <div>
              <h3>Clientes registrados</h3>
              <p className="muted">
                Busca, revisa y edita sin mezclarlo con contactos o direcciones.
              </p>
            </div>
          </div>
          <div className="catalog-filters">
            <label className="search-field">
              <Search size={16} aria-hidden="true" />
              <span className="sr-only">Buscar clientes</span>
              <input
                value={clientSearch}
                onChange={(event) => {
                  setClientSearch(event.target.value);
                  setClientPage(1);
                }}
                placeholder="Buscar por RUC o nombre…"
              />
            </label>
          </div>
          <div className="admin-list">
            {pageSlice(filteredClients, Math.min(clientPage, clientPages)).map((item) => (
              <div key={item.id}>
                <strong>{item.tax_id}</strong>
                <span>{item.trade_name || item.legal_name}</span>
                <button type="button" className="text-button" onClick={() => startClientEdit(item)}>
                  Editar
                </button>
              </div>
            ))}
          </div>
          {filteredClients.length > PAGE_SIZE && (
            <div className="pagination">
              <button
                type="button"
                className="button ghost small"
                disabled={clientPage <= 1}
                onClick={() => setClientPage((value) => value - 1)}
              >
                Anterior
              </button>
              <span>
                Página {Math.min(clientPage, clientPages)} de {clientPages}
              </span>
              <button
                type="button"
                className="button ghost small"
                disabled={clientPage >= clientPages}
                onClick={() => setClientPage((value) => value + 1)}
              >
                Siguiente
              </button>
            </div>
          )}
        </section>
      )}

      {tab === 'settings' && (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Configuración comercial</h2>
              <p className="muted">El IGV y la vigencia se congelan en cada documento emitido.</p>
            </div>
          </div>
          {settings.isLoading && <p className="muted">Cargando configuración…</p>}
          {settings.data && (
            <form className="admin-form" onSubmit={submitSettings}>
              <div className="two-columns">
                <label>
                  Nombre visible
                  <input
                    value={settingsForm.displayName}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, displayName: event.target.value })
                    }
                  />
                </label>
                <label>
                  Razón social
                  <input
                    value={settingsForm.legalName}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, legalName: event.target.value })
                    }
                  />
                </label>
                <label>
                  RUC
                  <input
                    value={settingsForm.taxId}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, taxId: event.target.value })
                    }
                  />
                </label>
                <label>
                  IGV
                  <input
                    type="number"
                    min="0"
                    max="1"
                    step="0.0001"
                    value={settingsForm.taxRate}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, taxRate: event.target.value })
                    }
                  />
                </label>
                <label>
                  Vigencia predeterminada (días)
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={settingsForm.defaultValidityDays}
                    onChange={(event) =>
                      setSettingsForm({
                        ...settingsForm,
                        defaultValidityDays: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Alerta de stock bajo (kg)
                  <input
                    type="number"
                    min="0"
                    step="0.001"
                    value={settingsForm.lowStockThresholdKg}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, lowStockThresholdKg: event.target.value })
                    }
                  />
                </label>
                <label>
                  Dirección
                  <input
                    value={settingsForm.primaryAddress}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, primaryAddress: event.target.value })
                    }
                  />
                </label>
                <label className="full-span">
                  Pie de página
                  <input
                    value={settingsForm.footerAddress}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, footerAddress: event.target.value })
                    }
                  />
                </label>
                <label>
                  Ciudad
                  <input
                    value={settingsForm.location}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, location: event.target.value })
                    }
                  />
                </label>
                <label>
                  Distrito
                  <input
                    value={settingsForm.district}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, district: event.target.value })
                    }
                  />
                </label>
                <label>
                  País
                  <input
                    value={settingsForm.country}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, country: event.target.value })
                    }
                  />
                </label>
                <label>
                  Color de marca
                  <input
                    type="color"
                    value={settingsForm.brandColor}
                    onChange={(event) =>
                      setSettingsForm({ ...settingsForm, brandColor: event.target.value })
                    }
                  />
                </label>
              </div>
              <button className="button primary" disabled={settingsMutation.isPending}>
                <Save size={15} />
                Guardar configuración
              </button>
            </form>
          )}
          <div className="admin-section-heading">
            <div>
              <h2>Opciones comerciales</h2>
              <p className="muted">
                Crea modalidades reutilizables para seleccionarlas al preparar un documento.
              </p>
            </div>
          </div>
          <div className="commercial-options-grid">
            <form
              className="commercial-option-card"
              onSubmit={(event) => submitCommercialOption(event, 'payment', paymentOptionLabel)}
            >
              <label>
                Formas de pago
                <input
                  required
                  maxLength={160}
                  value={paymentOptionLabel}
                  onChange={(event) => setPaymentOptionLabel(event.target.value)}
                  placeholder="Ej. 50% adelanto, 50% contra entrega"
                />
              </label>
              <button
                className="button secondary small"
                disabled={commercialOptionMutation.isPending}
              >
                <Plus size={15} />
                Agregar forma de pago
              </button>
              <div className="option-list">
                {paymentOptions.map((option) => (
                  <span key={option.id}>{option.label}</span>
                ))}
              </div>
            </form>
            <form
              className="commercial-option-card"
              onSubmit={(event) => submitCommercialOption(event, 'delivery', deliveryOptionLabel)}
            >
              <label>
                Formas de entrega
                <input
                  required
                  maxLength={160}
                  value={deliveryOptionLabel}
                  onChange={(event) => setDeliveryOptionLabel(event.target.value)}
                  placeholder="Ej. Despacho coordinado con el cliente"
                />
              </label>
              <button
                className="button secondary small"
                disabled={commercialOptionMutation.isPending}
              >
                <Plus size={15} />
                Agregar forma de entrega
              </button>
              <div className="option-list">
                {deliveryOptions.map((option) => (
                  <span key={option.id}>{option.label}</span>
                ))}
              </div>
            </form>
          </div>
          <div className="admin-section-heading">
            <div>
              <h2>Cuentas bancarias</h2>
              <p className="muted">Se imprimen únicamente en confirmaciones de pedido emitidas.</p>
            </div>
          </div>
          <form className="admin-form" onSubmit={submitBank}>
            <div className="two-columns">
              <label>
                Banco
                <input
                  required
                  value={bank.bankName}
                  onChange={(event) => setBank({ ...bank, bankName: event.target.value })}
                />
              </label>
              <label>
                Moneda
                <select
                  value={bank.currency}
                  onChange={(event) =>
                    setBank({ ...bank, currency: event.target.value as 'PEN' | 'USD' })
                  }
                >
                  <option value="USD">USD</option>
                  <option value="PEN">PEN</option>
                </select>
              </label>
              <label>
                Tipo de cuenta
                <input
                  required
                  value={bank.accountType}
                  onChange={(event) => setBank({ ...bank, accountType: event.target.value })}
                />
              </label>
              <label>
                Número de cuenta
                <input
                  required
                  value={bank.accountNumber}
                  onChange={(event) => setBank({ ...bank, accountNumber: event.target.value })}
                />
              </label>
              <label>
                CCI
                <input
                  value={bank.cci}
                  onChange={(event) => setBank({ ...bank, cci: event.target.value })}
                />
              </label>
            </div>
            <button className="button secondary" disabled={bankMutation.isPending}>
              <Plus size={15} />
              Agregar cuenta
            </button>
          </form>
          {banks.data?.length ? (
            <div className="admin-list">
              {banks.data.map((item) => (
                <div key={item.id}>
                  <strong>{item.currency}</strong>
                  <span>
                    {item.bank_name} · {item.account_type} · {item.account_number}
                  </span>
                  <b>{item.cci ? `CCI ${item.cci}` : ''}</b>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {tab === 'users' && (
        <section className="admin-section">
          <div className="admin-section-heading">
            <div>
              <h2>Invitar usuario</h2>
              <p className="muted">
                La persona recibirá el correo de Supabase para establecer su contraseña.
              </p>
            </div>
          </div>
          <form className="admin-form" onSubmit={submitInvite}>
            <div className="two-columns">
              <label>
                Nombre completo
                <input
                  required
                  value={invite.fullName}
                  onChange={(event) => setInvite({ ...invite, fullName: event.target.value })}
                />
              </label>
              <label>
                Correo corporativo
                <input
                  required
                  type="email"
                  value={invite.email}
                  onChange={(event) => setInvite({ ...invite, email: event.target.value })}
                />
              </label>
              <label>
                Rol
                <select
                  value={invite.role}
                  onChange={(event) =>
                    setInvite({ ...invite, role: event.target.value as 'admin' | 'seller' })
                  }
                >
                  <option value="seller">Vendedor</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
            </div>
            <button className="button primary" disabled={inviteMutation.isPending}>
              <Plus size={15} />
              Enviar invitación
            </button>
          </form>
        </section>
      )}

      {message && <div className="notice success">{message}</div>}
    </div>
  );
}
