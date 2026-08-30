import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Database, PackageSearch, Plus, Save, Settings2, UsersRound } from 'lucide-react';
import {
  createCategory,
  createClient,
  createClientAddress,
  createClientContact,
  createProduct,
  createVariant,
  createBankAccount,
  inviteUser,
  listCategories,
  listClients,
  listProducts,
  listVariants,
  listBankAccounts,
  loadCompanySettings,
  updateCompanySettings,
} from '../lib/api';
import { useAuth } from '../auth/AuthProvider';

type Tab = 'catalog' | 'clients' | 'settings' | 'users';

type SettingsForm = {
  displayName: string;
  legalName: string;
  taxId: string;
  taxRate: string;
  defaultValidityDays: number;
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
  primaryAddress: '',
  footerAddress: '',
  location: 'Lima',
  district: 'Comas',
  country: 'Perú',
  brandColor: '#f47c20',
};

export function AdminPage() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>('catalog');
  const [message, setMessage] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [product, setProduct] = useState({ sku: '', name: '', categoryId: '', unitPriceUsd: '' });
  const [variant, setVariant] = useState({ productId: '', name: '', priceOverrideUsd: '' });
  const [customer, setCustomer] = useState({ legalName: '', tradeName: '', taxId: '' });
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

  const products = useQuery({ queryKey: ['products'], queryFn: listProducts });
  const categories = useQuery({ queryKey: ['categories'], queryFn: listCategories });
  const variants = useQuery({ queryKey: ['variants'], queryFn: () => listVariants() });
  const banks = useQuery({ queryKey: ['banks'], queryFn: listBankAccounts });
  const clients = useQuery({ queryKey: ['clients'], queryFn: listClients });
  const settings = useQuery({ queryKey: ['settings'], queryFn: loadCompanySettings });

  useEffect(() => {
    if (!settings.data) return;
    setSettingsForm({
      displayName: settings.data.display_name,
      legalName: settings.data.legal_name,
      taxId: settings.data.tax_id,
      taxRate: settings.data.tax_rate,
      defaultValidityDays: settings.data.default_validity_days,
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
    mutationFn: () => createProduct(product),
    onSuccess: () => {
      setProduct({ sku: '', name: '', categoryId: '', unitPriceUsd: '' });
      setMessage('Producto creado.');
      void queryClient.invalidateQueries({ queryKey: ['products'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear el producto.'),
  });

  const variantMutation = useMutation({
    mutationFn: () => createVariant(variant),
    onSuccess: () => {
      setVariant({ productId: '', name: '', priceOverrideUsd: '' });
      setMessage('Variante creada.');
      void queryClient.invalidateQueries({ queryKey: ['variants'] });
    },
    onError: (error) =>
      setMessage(error instanceof Error ? error.message : 'No se pudo crear la variante.'),
  });

  const clientMutation = useMutation({
    mutationFn: () => createClient(customer),
    onSuccess: () => {
      setCustomer({ legalName: '', tradeName: '', taxId: '' });
      setMessage('Cliente creado.');
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
                  onChange={(event) => setProduct({ ...product, unitPriceUsd: event.target.value })}
                  placeholder="0.0000"
                />
              </label>
            </div>
            <button className="button primary" disabled={productMutation.isPending}>
              <Save size={15} />
              Guardar producto
            </button>
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
              Guardar variante
            </button>
          </form>
          <div className="admin-list">
            {products.data?.slice(0, 20).map((item) => (
              <div key={item.id}>
                <strong>{item.sku}</strong>
                <span>{item.name}</span>
                <b>USD {item.unit_price_usd}</b>
              </div>
            ))}
          </div>
          {variants.data?.length ? (
            <div className="admin-list">
              {variants.data.slice(0, 20).map((item) => (
                <div key={item.id}>
                  <strong>Variante</strong>
                  <span>{item.name}</span>
                  <b>
                    {item.price_override_usd ? `USD ${item.price_override_usd}` : 'Precio base'}
                  </b>
                </div>
              ))}
            </div>
          ) : null}
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
          <form className="admin-form" onSubmit={submitClient}>
            <div className="two-columns">
              <label>
                Razón social
                <input
                  required
                  value={customer.legalName}
                  onChange={(event) => setCustomer({ ...customer, legalName: event.target.value })}
                />
              </label>
              <label>
                Nombre comercial
                <input
                  value={customer.tradeName}
                  onChange={(event) => setCustomer({ ...customer, tradeName: event.target.value })}
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
              <Plus size={15} />
              Crear cliente
            </button>
          </form>
          <div className="admin-section-heading">
            <div>
              <h2>Contactos y direcciones</h2>
              <p className="muted">
                Asigna datos opcionales que quedarán congelados en el documento.
              </p>
            </div>
          </div>
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
          <div className="admin-list">
            {clients.data?.slice(0, 20).map((item) => (
              <div key={item.id}>
                <strong>{item.tax_id}</strong>
                <span>{item.trade_name || item.legal_name}</span>
              </div>
            ))}
          </div>
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
              <h2>Cuentas bancarias</h2>
              <p className="muted">Se imprimen únicamente en proformas emitidas.</p>
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
