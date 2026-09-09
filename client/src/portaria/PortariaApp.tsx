import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AppIcon } from '../components/AppIcon';
import { PanelObservationFields } from '../components/PanelObservationFields';
import { ThemeToggle } from '../components/ThemeToggle';
import { RELATIONSHIPS, VEHICLE_NOTICE_ACTIONS, type PortariaOfflinePermission, type Relationship, type VehicleNoticeAction, type VisitKind } from '../types';
import { VisitKindField } from '../components/VisitKindField';
import { maskPhoneInput } from '../utils/visitorFollowUp';
import { maskVehiclePlateInput } from '../utils/vehiclePlate';
import { claimPairing, inspectPairing, isPortariaApiError } from './api';
import { capturedAtFrom } from './clock';
import { MAX_VISITORS, PORTARIA_START_URL, SYNC_INTERVAL_MS, isStaleQueue, queueCapacity } from './constants';
import { clearOtherDeviceQueues, readClockOffset, readCredential, writeCredential } from './db';
import { precacheReady, registerPortariaServiceWorker } from '../pwa/registerPortariaSw';
import { decryptItem, enqueueItem, markItem, pendingItems, removeItem } from './queue';
import { statusLabel } from './summaries';
import { offlineSupport, isIosDevice, isStandaloneDisplay } from './support';
import { probeConnection, syncQueue } from './sync';
import type {
  ConnectionState,
  DeviceCredential,
  QueueItemRecord,
  QueuePayload,
  VehiclePayload,
  VisitorsPayload,
} from './types';
import './PortariaApp.css';

interface PortariaContextValue {
  support: ReturnType<typeof offlineSupport>;
  booting: boolean;
  session: DeviceCredential | null;
  items: QueueItemRecord[];
  connection: ConnectionState;
  connectionMessage: string;
  pending: number;
  capacity: ReturnType<typeof queueCapacity>;
  stale: boolean;
  updateAvailable: boolean;
  applyUpdate: () => void;
  refresh: () => Promise<void>;
  saveVisitors: (payload: VisitorsPayload) => Promise<void>;
  saveVehicle: (payload: VehiclePayload) => Promise<void>;
  retryItem: (item: QueueItemRecord) => Promise<void>;
  deleteItem: (item: QueueItemRecord) => Promise<void>;
  loadPayload: (item: QueueItemRecord) => Promise<QueuePayload>;
}

const PortariaContext = createContext<PortariaContextValue | null>(null);

function usePortaria() {
  const value = useContext(PortariaContext);
  if (!value) throw new Error('Portaria fora do provedor');
  return value;
}

function connectionCopy(state: ConnectionState): { title: string; detail: string } {
  if (state === 'offline') {
    return { title: 'Sem internet', detail: 'Você pode continuar cadastrando normalmente.' };
  }
  if (state === 'syncing') {
    return { title: 'Enviando cadastros salvos.', detail: 'Não feche esta tela por enquanto.' };
  }
  if (state === 'failed') {
    return {
      title: 'Não foi possível enviar.',
      detail: 'Seus cadastros continuam guardados neste aparelho.',
    };
  }
  if (state === 'revoked') {
    return { title: 'Este aparelho não possui mais acesso.', detail: 'Peça um novo pareamento ao responsável.' };
  }
  return { title: 'Conectado', detail: 'Os cadastros serão enviados automaticamente.' };
}

function PortariaProvider({ children }: { children: ReactNode }) {
  const support = useMemo(() => offlineSupport(), []);
  const [session, setSession] = useState<DeviceCredential | null>(null);
  const [booting, setBooting] = useState(true);
  const [items, setItems] = useState<QueueItemRecord[]>([]);
  const [connection, setConnection] = useState<ConnectionState>('offline');
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const applyUpdateRef = useRef(() => window.location.reload());
  const syncingRef = useRef(false);
  const formDirty = useRef(false);
  const connectionRef = useRef<ConnectionState>('offline');
  connectionRef.current = connection;

  const refresh = useCallback(async () => {
    try {
      const stored = await readCredential();
      setSession(stored);
      setBooting(false);
      if (!stored) {
        setItems([]);
        return;
      }
      setItems(await pendingItems(stored.publicId));
    } catch {
      try {
        setSession(await readCredential());
      } catch {
        setSession(null);
      }
      setBooting(false);
    }
  }, []);

  const runSync = useCallback(async () => {
    const stored = await readCredential();
    if (!stored || syncingRef.current || connectionRef.current === 'revoked') return;
    syncingRef.current = true;
    setConnection('syncing');
      const result = await syncQueue(stored);
      setConnection(result.state);
      if (typeof result.visitorFollowUpEnabled === 'boolean') {
        const next = { ...stored, visitorFollowUpEnabled: result.visitorFollowUpEnabled };
        if (next.visitorFollowUpEnabled !== stored.visitorFollowUpEnabled) {
          await writeCredential(next);
          setSession(next);
        }
      }
      setItems(await pendingItems(stored.publicId));
      syncingRef.current = false;
  }, []);

  useEffect(() => {
    void refresh();
    void registerPortariaServiceWorker((api) => {
      setUpdateAvailable(api.updateAvailable);
      applyUpdateRef.current = api.applyUpdate;
    });
  }, [refresh]);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    const boot = async () => {
      const probe = await probeConnection(session.credential);
      if (cancelled) return;
      if (probe.state === 'revoked') {
        setConnection('revoked');
        return;
      }
      if (probe.state === 'offline') {
        setConnection('offline');
        return;
      }
      if (typeof probe.visitorFollowUpEnabled === 'boolean') {
        const stored = await readCredential();
        if (stored && stored.visitorFollowUpEnabled !== probe.visitorFollowUpEnabled) {
          const next = { ...stored, visitorFollowUpEnabled: probe.visitorFollowUpEnabled };
          await writeCredential(next);
          setSession(next);
        }
      }
      await runSync();
    };
    void boot();
    const onOnline = () => {
      void runSync();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void runSync();
    };
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVisible);
    const timer = window.setInterval(() => {
      void pendingItems(session.publicId).then((current) => {
        if (current.some((item) => item.status === 'queued')) void runSync();
      });
    }, SYNC_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVisible);
      window.clearInterval(timer);
    };
  }, [session, runSync]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'PORTARIA_SYNC') void runSync();
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [runSync]);

  const saveVisitors = useCallback(
    async (payload: VisitorsPayload) => {
      if (!session) throw new Error('Este aparelho ainda não foi preparado.');
      if (connection === 'revoked') throw new Error('Este aparelho não possui mais acesso.');
      const offset = await readClockOffset();
      await enqueueItem({
        type: 'visitors',
        payload,
        capturedAt: capturedAtFrom(offset),
        publicId: session.publicId,
      });
      await refresh();
      void runSync();
    },
    [connection, refresh, runSync, session]
  );

  const saveVehicle = useCallback(
    async (payload: VehiclePayload) => {
      if (!session) throw new Error('Este aparelho ainda não foi preparado.');
      if (connection === 'revoked') throw new Error('Este aparelho não possui mais acesso.');
      const offset = await readClockOffset();
      await enqueueItem({
        type: 'vehicle_notice',
        payload,
        capturedAt: capturedAtFrom(offset),
        publicId: session.publicId,
      });
      await refresh();
      void runSync();
    },
    [connection, refresh, runSync, session]
  );

  const retryItem = useCallback(
    async (item: QueueItemRecord) => {
      await markItem(item, { status: 'queued', lastError: undefined, fieldErrors: undefined });
      await refresh();
      void runSync();
    },
    [refresh, runSync]
  );

  const deleteItem = useCallback(
    async (item: QueueItemRecord) => {
      await removeItem(item.localId);
      await refresh();
    },
    [refresh]
  );

  const value = useMemo<PortariaContextValue>(
    () => ({
      support,
      booting,
      session,
      items,
      connection,
      connectionMessage: connectionCopy(connection).title,
      pending: items.length,
      capacity: queueCapacity(items.length),
      stale: isStaleQueue(items[0]?.createdAt),
      updateAvailable,
      applyUpdate: () => {
        if (formDirty.current) return;
        applyUpdateRef.current();
      },
      refresh,
      saveVisitors,
      saveVehicle,
      retryItem,
      deleteItem,
      loadPayload: decryptItem,
    }),
    [booting, connection, deleteItem, items, refresh, retryItem, saveVehicle, saveVisitors, session, support, updateAvailable]
  );

  return <PortariaContext.Provider value={value}>{children}</PortariaContext.Provider>;
}

function Brand() {
  const { session } = usePortaria();
  return (
    <header className="portaria-brand">
      <span className="portaria-cross" aria-hidden="true">
        ✝
      </span>
      <div>
        <strong>{session?.churchName || 'Church Visitors'}</strong>
        <span>Portaria</span>
      </div>
      <ThemeToggle compact />
    </header>
  );
}

function StatusBanner() {
  const { connection, pending } = usePortaria();
  const copy = connectionCopy(connection);
  return (
    <div className={`portaria-status is-${connection}`} role="status">
      <AppIcon name={connection === 'offline' ? 'eyeOff' : connection === 'failed' || connection === 'revoked' ? 'info' : 'check'} />
      <div>
        <strong>{copy.title}</strong>
        <p>{copy.detail}</p>
      </div>
      {pending > 0 && connection !== 'revoked' && (
        <span className="portaria-status-count">{pending}</span>
      )}
    </div>
  );
}

function QueueFooter() {
  const { pending, connection } = usePortaria();
  if (pending === 0 || connection === 'revoked') return null;
  return (
    <div className="portaria-queue-footer">
      <AppIcon name="refresh" />
      <div>
        <strong>
          {pending === 1 ? '1 cadastro aguardando envio' : `${pending} cadastros aguardando envio`}
        </strong>
        <p>
          {connection === 'syncing'
            ? 'Enviando cadastros salvos.'
            : 'Enviaremos automaticamente quando a conexão voltar'}
        </p>
      </div>
      <Link to="/portaria/fila">Ver cadastros</Link>
    </div>
  );
}

function PortariaHome() {
  const { session, connection, capacity, stale, support } = usePortaria();
  const visitorsOff = !session?.permissions.includes('offline_visitors:create');
  const vehiclesOff = !session?.permissions.includes('offline_vehicle_notices:create');
  return (
    <main className="portaria-page">
      <Brand />
      <StatusBanner />
      <h1>Portaria</h1>
      {support.ok === false && <p className="portaria-note">{support.reason}</p>}
      {capacity === 'warn' && (
        <p className="portaria-warning">
          Este aparelho já tem muitos cadastros aguardando envio. Conecte-se à internet em breve.
        </p>
      )}
      {capacity === 'full' && (
        <p className="portaria-warning" role="alert">
          Este aparelho possui muitos cadastros aguardando envio. Conecte-se à internet antes de continuar.
        </p>
      )}
      {stale && (
        <p className="portaria-warning" role="alert">
          Há cadastros neste aparelho há mais de sete dias. Conecte-se à internet e peça ao responsável
          para conferir a fila.
        </p>
      )}
      <div className="portaria-cards">
        <Link className="portaria-card" to="/portaria/visitantes" aria-disabled={visitorsOff || capacity === 'full'}>
          <AppIcon name="users" />
          <strong>Registrar visitantes</strong>
          <span>Famílias e grupos</span>
        </Link>
        <Link className="portaria-card" to="/portaria/veiculos" aria-disabled={vehiclesOff || capacity === 'full'}>
          <AppIcon name="car" />
          <strong>Avisar sobre veículo</strong>
          <span>O aviso só chega com internet</span>
        </Link>
        <Link className="portaria-card" to="/portaria/oracao">
          <AppIcon name="prayer" />
          <strong>Pedido de oração</strong>
          <span>{connection === 'offline' ? 'Precisa de internet' : 'Somente online'}</span>
        </Link>
        <Link className="portaria-card" to="/portaria/fila">
          <AppIcon name="clipboard" />
          <strong>Cadastros deste aparelho</strong>
          <span>Fila local e revisão</span>
        </Link>
      </div>
      <QueueFooter />
    </main>
  );
}

function emptyPortariaPerson(id: number) {
  return {
    id,
    name: '',
    relationship: 'outro' as Relationship,
    panelObservation: '',
    showObservationOnPanel: false,
    includeFollowUp: false,
  };
}

function PortariaVisitors() {
  const { session, connection, saveVisitors, capacity } = usePortaria();
  const [city, setCity] = useState('');
  const [people, setPeople] = useState([emptyPortariaPerson(1)]);
  const [visitKind, setVisitKind] = useState<VisitKind | ''>('');
  const [visitKindError, setVisitKindError] = useState('');
  const [includeFollowUp, setIncludeFollowUp] = useState(false);
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const offline = connection === 'offline' || connection === 'failed';
  const followUpEnabled = session?.visitorFollowUpEnabled === true;

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (capacity === 'full') {
      setError('Este aparelho possui muitos cadastros aguardando envio. Conecte-se à internet antes de continuar.');
      return;
    }
    if (!visitKind) {
      setVisitKindError('Informe se esta é a primeira visita da família ou grupo.');
      setError('Confira os campos destacados antes de cadastrar.');
      return;
    }
    const selected = people.filter((person) =>
      people.length === 1 ? includeFollowUp : person.includeFollowUp
    );
    if (followUpEnabled && includeFollowUp && people.length > 1 && selected.length === 0) {
      setError('Escolha quem entra no acompanhamento.');
      return;
    }
    if (followUpEnabled && includeFollowUp && phone.replace(/\D/g, '').length < 10) {
      setError('Informe o telefone ou WhatsApp para o contato.');
      return;
    }
    const visitors = people.map((person) => ({
      name: person.name.trim(),
      city: city.trim(),
      relationship: person.relationship,
      panelObservation: person.panelObservation.trim(),
      showObservationOnPanel: person.showObservationOnPanel,
      visitKind,
      includeFollowUp: followUpEnabled && includeFollowUp && selected.some((item) => item.id === person.id),
    }));
    if (!city.trim() || visitors.some((person) => !person.name)) {
      setError('Informe a cidade e o nome de cada pessoa.');
      return;
    }
    setSaving(true);
    try {
      await saveVisitors({
        visitors,
        ...(followUpEnabled && includeFollowUp
          ? { contactConsent: true, phone: phone.replace(/\D/g, '') }
          : {}),
      });
      setPeople([emptyPortariaPerson(Date.now())]);
      setCity('');
      setVisitKind('');
      setVisitKindError('');
      setIncludeFollowUp(false);
      setPhone('');
      setMessage(
        followUpEnabled && includeFollowUp
          ? 'Cadastro e acompanhamento salvos neste aparelho'
          : 'Cadastro salvo neste aparelho'
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível guardar o cadastro.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="portaria-page">
      <Brand />
      <StatusBanner />
      <Link className="portaria-back" to={PORTARIA_START_URL}>
        <AppIcon name="arrow" /> Voltar para a portaria
      </Link>
      <h1>Registrar visitantes</h1>
      <form className="portaria-form" onSubmit={onSubmit}>
        <label>
          Cidade da família
          <input value={city} onChange={(event) => setCity(event.target.value)} maxLength={100} required />
        </label>
        <VisitKindField
          id="portaria-family-kind"
          value={visitKind}
          disabled={saving}
          error={visitKindError}
          onChange={(value) => {
            setVisitKind(value);
            setVisitKindError('');
          }}
        />
        <fieldset>
          <legend>Visitantes</legend>
          {people.map((person, index) => (
            <div className="portaria-person" key={person.id}>
              <label>
                Parentesco
                <select
                  value={person.relationship}
                  onChange={(event) =>
                    setPeople((current) =>
                      current.map((item) =>
                        item.id === person.id
                          ? { ...item, relationship: event.target.value as Relationship }
                          : item
                      )
                    )
                  }
                >
                  {RELATIONSHIPS.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nome completo
                <input
                  value={person.name}
                  onChange={(event) =>
                    setPeople((current) =>
                      current.map((item) =>
                        item.id === person.id ? { ...item, name: event.target.value } : item
                      )
                    )
                  }
                  maxLength={120}
                  required
                />
              </label>
              <PanelObservationFields
                id={`portaria-observation-${person.id}`}
                observation={person.panelObservation}
                showOnPanel={person.showObservationOnPanel}
                disabled={saving}
                onObservationChange={(value) =>
                  setPeople((current) =>
                    current.map((item) =>
                      item.id === person.id ? { ...item, panelObservation: value } : item
                    )
                  )
                }
                onShowChange={(value) =>
                  setPeople((current) =>
                    current.map((item) =>
                      item.id === person.id ? { ...item, showObservationOnPanel: value } : item
                    )
                  )
                }
              />
              {followUpEnabled && includeFollowUp && people.length > 1 && (
                <label className="portaria-choice">
                  <input
                    type="checkbox"
                    checked={person.includeFollowUp}
                    onChange={(event) =>
                      setPeople((current) =>
                        current.map((item) =>
                          item.id === person.id ? { ...item, includeFollowUp: event.target.checked } : item
                        )
                      )
                    }
                  />
                  Incluir {person.name.trim() || `visitante ${index + 1}`} no acompanhamento
                </label>
              )}
              {people.length > 1 && (
                <button
                  type="button"
                  className="portaria-text-btn"
                  onClick={() => setPeople((current) => current.filter((item) => item.id !== person.id))}
                >
                  Remover
                </button>
              )}
            </div>
          ))}
          {people.length < MAX_VISITORS && (
            <button
              type="button"
              className="portaria-secondary"
              onClick={() =>
                setPeople((current) => [...current, emptyPortariaPerson(Date.now())])
              }
            >
              <AppIcon name="plus" /> Adicionar pessoa
            </button>
          )}
        </fieldset>
        {followUpEnabled && (
          <fieldset className="portaria-follow">
            <legend>Acompanhamento</legend>
            <label className="portaria-choice">
              <input
                type="checkbox"
                checked={includeFollowUp}
                onChange={(event) => {
                  setIncludeFollowUp(event.target.checked);
                  if (!event.target.checked) {
                    setPhone('');
                    setPeople((current) => current.map((item) => ({ ...item, includeFollowUp: false })));
                  }
                }}
              />
              Autoriza a igreja a entrar em contato?
            </label>
            {includeFollowUp && (
              <>
                <label>
                  Telefone ou WhatsApp
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    placeholder="(00) 00000-0000"
                    value={phone}
                    onChange={(event) => setPhone(maskPhoneInput(event.target.value))}
                  />
                </label>
                <p className="portaria-field-hint">
                  O mesmo telefone vale para todas as pessoas marcadas. O primeiro contato fica para amanhã.
                </p>
              </>
            )}
          </fieldset>
        )}
        {offline && (
          <p className="portaria-note">
            Este cadastro ficará guardado neste aparelho até a internet voltar.
          </p>
        )}
        {error && <p className="portaria-error" role="alert">{error}</p>}
        {message && <p className="portaria-success" role="status">{message}</p>}
        <button type="submit" className="portaria-primary" disabled={saving || !session || capacity === 'full'}>
          {offline ? 'Salvar neste aparelho' : 'Registrar visitantes'}
        </button>
      </form>
      <QueueFooter />
    </main>
  );
}

function PortariaVehicles() {
  const { session, connection, saveVehicle, capacity } = usePortaria();
  const [plate, setPlate] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [requestedAction, setRequestedAction] = useState<VehicleNoticeAction>('remove_vehicle');
  const [otherDescription, setOtherDescription] = useState('');
  const [details, setDetails] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const offline = connection === 'offline' || connection === 'failed';

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    setSaving(true);
    try {
      await saveVehicle({ plate, vehicleModel, requestedAction, otherDescription, details });
      setPlate('');
      setVehicleModel('');
      setOtherDescription('');
      setDetails('');
      setMessage('Aviso guardado neste aparelho. Ele ainda não foi enviado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível guardar o aviso.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="portaria-page">
      <Brand />
      <StatusBanner />
      <Link className="portaria-back" to={PORTARIA_START_URL}>
        <AppIcon name="arrow" /> Voltar para a portaria
      </Link>
      <h1>Avisar sobre veículo</h1>
      <p className="portaria-warning">
        O aviso será exibido aos responsáveis somente quando a conexão voltar.
      </p>
      <form className="portaria-form" onSubmit={onSubmit}>
        <label>
          Placa
          <input
            value={plate}
            onChange={(event) => setPlate(maskVehiclePlateInput(event.target.value))}
            placeholder="ABC-1D23"
            required
          />
        </label>
        <label>
          Modelo ou descrição
          <input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} maxLength={120} required />
        </label>
        <fieldset>
          <legend>Ação solicitada</legend>
          {VEHICLE_NOTICE_ACTIONS.map((action) => (
            <label key={action.value} className="portaria-choice">
              <input
                type="radio"
                name="action"
                checked={requestedAction === action.value}
                onChange={() => setRequestedAction(action.value)}
              />
              {action.label}
            </label>
          ))}
        </fieldset>
        {requestedAction === 'other' && (
          <label>
            Descrição do aviso
            <input
              value={otherDescription}
              onChange={(event) => setOtherDescription(event.target.value)}
              maxLength={240}
              required
            />
          </label>
        )}
        <label>
          Observação
          <textarea value={details} onChange={(event) => setDetails(event.target.value)} maxLength={500} />
        </label>
        {error && <p className="portaria-error" role="alert">{error}</p>}
        {message && <p className="portaria-success" role="status">{message}</p>}
        <button type="submit" className="portaria-primary" disabled={saving || !session || capacity === 'full'}>
          {offline ? 'Salvar neste aparelho' : 'Enviar aviso'}
        </button>
      </form>
      <QueueFooter />
    </main>
  );
}

function PortariaPrayer() {
  const { connection } = usePortaria();
  const [text, setText] = useState('');
  const blocked = connection !== 'online' && connection !== 'syncing';
  return (
    <main className="portaria-page">
      <Brand />
      <StatusBanner />
      <Link className="portaria-back" to={PORTARIA_START_URL}>
        <AppIcon name="arrow" /> Voltar para a portaria
      </Link>
      <h1>Pedido de oração</h1>
      {blocked ? (
        <div className="portaria-locked">
          <AppIcon name="lock" />
          <p>Este formulário precisa de internet para proteger as informações enviadas.</p>
          {text && (
            <button
              type="button"
              className="portaria-secondary"
              onClick={() => void navigator.clipboard.writeText(text)}
            >
              Copiar texto digitado
            </button>
          )}
        </div>
      ) : (
        <p className="portaria-note">
          Pedidos de oração não ficam guardados neste aparelho. Use o portal público com internet.
        </p>
      )}
      <label>
        Texto (não será enviado offline)
        <textarea value={text} onChange={(event) => setText(event.target.value)} disabled={blocked} />
      </label>
    </main>
  );
}

function PortariaQueue() {
  const { items, connection, retryItem, deleteItem, pending } = usePortaria();
  const sentEstimate = items.filter((item) => item.status === 'syncing').length;
  return (
    <main className="portaria-page">
      <Brand />
      <StatusBanner />
      <h1>Sincronização</h1>
      <p className="portaria-progress">
        {connection === 'syncing'
          ? `Enviando cadastros. ${pending} ainda neste aparelho.`
          : pending
            ? `${pending} cadastro${pending > 1 ? 's' : ''} neste aparelho.`
            : 'Nenhum cadastro aguardando envio.'}
      </p>
      <section className="portaria-list" aria-label="Cadastros deste aparelho">
        <h2>Cadastros deste aparelho</h2>
        {items.length === 0 && <p>Os dados enviados são removidos deste aparelho.</p>}
        {items.map((item) => (
          <article key={item.localId} className={`portaria-item is-${item.status}`}>
            <div>
              <strong>{item.summary}</strong>
              <span>
                {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
                  new Date(item.capturedAt)
                )}
                {' · '}
                {statusLabel(item.status)}
              </span>
              {item.lastError && <p>{item.lastError}</p>}
            </div>
            <div className="portaria-item-actions">
              {item.status === 'review' && (
                <button type="button" onClick={() => void retryItem(item)}>
                  Tentar novamente
                </button>
              )}
              {(item.status === 'queued' || item.status === 'review') && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('Excluir este cadastro que ainda não foi enviado?')) {
                      void deleteItem(item);
                    }
                  }}
                >
                  Excluir
                </button>
              )}
            </div>
          </article>
        ))}
      </section>
      <p className="portaria-note">Os dados enviados são removidos deste aparelho.</p>
      <Link className="portaria-back" to={PORTARIA_START_URL}>
        Voltar para a portaria
      </Link>
      {sentEstimate > 0 && (
        <p className="portaria-muted">
          A sincronização continua automaticamente enquanto o sistema estiver aberto.
        </p>
      )}
    </main>
  );
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

function InstallHelp({ ready }: { ready: boolean }) {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (isStandaloneDisplay()) {
    return <p className="portaria-success">Aplicativo da portaria pronto neste aparelho.</p>;
  }
  if (!ready) {
    return <p className="portaria-note">Preparando os arquivos essenciais…</p>;
  }
  if (installEvent) {
    return (
      <button
        type="button"
        className="portaria-primary"
        onClick={() => void installEvent.prompt()}
      >
        Instalar aplicativo da portaria
      </button>
    );
  }
  if (isIosDevice()) {
    return (
      <ol className="portaria-install">
        <li>Toque em compartilhar.</li>
        <li>Escolha “Adicionar à Tela de Início”.</li>
        <li>Confirme “Adicionar”.</li>
      </ol>
    );
  }
  return (
    <p className="portaria-note">
      Use o menu do navegador para instalar o aplicativo da portaria nesta tela inicial.
    </p>
  );
}

function PortariaPairing() {
  const { refresh } = usePortaria();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('parear') || '';
  const [churchName, setChurchName] = useState('');
  const [deviceName, setDeviceName] = useState('Tablet da portaria');
  const [permissions, setPermissions] = useState<PortariaOfflinePermission[]>([
    'offline_visitors:create',
    'offline_vehicle_notices:create',
  ]);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [prepared, setPrepared] = useState(false);
  const support = offlineSupport();

  useEffect(() => {
    if (!token) return;
    inspectPairing(token)
      .then((info) => setChurchName(info.churchName))
      .catch((err) => setError(err instanceof Error ? err.message : 'Convite inválido.'));
  }, [token]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError('');
    if (support.ok === false) {
      setError(support.reason);
      return;
    }
    try {
      const claimed = await claimPairing(token, { deviceName, permissions });
      await writeCredential({
        credential: claimed.credential,
        publicId: claimed.publicId,
        churchName: claimed.churchName,
        deviceName: claimed.deviceName,
        permissions: claimed.permissions,
        visitorFollowUpEnabled: claimed.visitorFollowUpEnabled === true,
        createdAt: new Date().toISOString(),
        formatVersion: 1,
      });
      await clearOtherDeviceQueues(claimed.publicId);
      await refresh();
      const cached = await precacheReady();
      setReady(cached);
      setPrepared(cached);
      if (!cached) {
        setError('Não foi possível confirmar os arquivos offline. Mantenha a internet e abra o aplicativo de novo.');
      }
    } catch (err) {
      setError(isPortariaApiError(err) ? err.message : 'Não foi possível preparar o aparelho.');
    }
  }

  if (!token) {
    return (
      <main className="portaria-page">
        <Brand />
        <h1>Aparelho da portaria</h1>
        <p>Este aparelho ainda não foi preparado. Peça ao responsável um link de pareamento.</p>
        <Link className="portaria-back" to={PORTARIA_START_URL}>Abrir a portaria</Link>
      </main>
    );
  }

  return (
    <main className="portaria-page">
      <header className="portaria-brand">
        <span className="portaria-cross">✝</span>
        <div>
          <strong>{churchName || 'Church Visitors'}</strong>
          <span>Preparar aparelho</span>
        </div>
      </header>
      {prepared ? (
        <>
          <h1>Aparelho preparado</h1>
          <p>Confirme a instalação para usar sem internet.</p>
          <InstallHelp ready={ready} />
          <button type="button" className="portaria-primary" onClick={() => navigate(PORTARIA_START_URL, { replace: true })}>
            Abrir a portaria
          </button>
        </>
      ) : (
        <form className="portaria-form" onSubmit={onSubmit}>
          <h1>Preparar este aparelho</h1>
          <p>
            Igreja:{' '}
            <strong>{churchName || (error ? 'não confirmada' : 'validando…')}</strong>
          </p>
          <label>
            Nome do aparelho
            <input value={deviceName} onChange={(event) => setDeviceName(event.target.value)} maxLength={80} required />
          </label>
          <fieldset>
            <legend>Permitido offline</legend>
            <label className="portaria-choice">
              <input
                type="checkbox"
                checked={permissions.includes('offline_visitors:create')}
                onChange={() =>
                  setPermissions((current) =>
                    current.includes('offline_visitors:create')
                      ? current.filter((item) => item !== 'offline_visitors:create')
                      : [...current, 'offline_visitors:create']
                  )
                }
              />
              Registrar visitantes
            </label>
            <label className="portaria-choice">
              <input
                type="checkbox"
                checked={permissions.includes('offline_vehicle_notices:create')}
                onChange={() =>
                  setPermissions((current) =>
                    current.includes('offline_vehicle_notices:create')
                      ? current.filter((item) => item !== 'offline_vehicle_notices:create')
                      : [...current, 'offline_vehicle_notices:create']
                  )
                }
              />
              Enviar avisos de veículos
            </label>
            <label className="portaria-choice">
              <input type="checkbox" checked={false} disabled />
              Pedidos de oração
            </label>
          </fieldset>
          {error && <p className="portaria-error" role="alert">{error}</p>}
          <button type="submit" className="portaria-primary" disabled={!churchName || permissions.length === 0}>
            Preparar e instalar
          </button>
        </form>
      )}
    </main>
  );
}

function PortariaGate({ children }: { children: ReactNode }) {
  const { session, connection, updateAvailable, applyUpdate, booting } = usePortaria();
  const [params] = useSearchParams();
  if (booting) {
    return (
      <main className="portaria-page">
        <p>Carregando o aparelho…</p>
      </main>
    );
  }
  if (params.get('parear')) return <PortariaPairing />;
  if (!session) return <PortariaPairing />;
  return (
    <>
      <div className="portaria-live" aria-live="polite">
        {connection === 'syncing' ? 'Enviando cadastros salvos.' : null}
      </div>
      {updateAvailable && (
        <div className="portaria-update">
          <span>Nova versão disponível</span>
          <button type="button" onClick={applyUpdate}>
            Atualizar agora
          </button>
        </div>
      )}
      {children}
    </>
  );
}

export function PortariaApp() {
  const location = useLocation();
  useEffect(() => {
    document.title = 'Portaria';
    const manifest = document.querySelector('link[rel="manifest"]');
    const previous = manifest?.getAttribute('href') || '/site.webmanifest';
    manifest?.setAttribute('href', '/manifest.webmanifest');
    return () => {
      document.title = 'Church Visitors';
      manifest?.setAttribute('href', previous);
    };
  }, [location.pathname]);

  return (
    <PortariaProvider>
      <PortariaGate>
        {location.pathname.startsWith('/portaria/visitantes') ? (
          <PortariaVisitors />
        ) : location.pathname.startsWith('/portaria/veiculos') ? (
          <PortariaVehicles />
        ) : location.pathname.startsWith('/portaria/oracao') ? (
          <PortariaPrayer />
        ) : location.pathname.startsWith('/portaria/fila') ? (
          <PortariaQueue />
        ) : (
          <PortariaHome />
        )}
      </PortariaGate>
    </PortariaProvider>
  );
}
