import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { VehicleNoticeAlert } from '../types';
import { hasPermission } from '../utils/permissions';
import { createVehicleAlertChannel } from './vehicleAlertChannel';
import {
  DEFAULT_VEHICLE_ALERT_PREFS,
  VEHICLE_ALERT_MAX_TOASTS,
  VEHICLE_ALERT_POLL_HIDDEN_MS,
  VEHICLE_ALERT_POLL_VISIBLE_MS,
  VEHICLE_ALERT_TOAST_MS,
  type VehicleAlertPrefs,
} from './vehicleAlertConstants';
import {
  claimVehicleAlertIds,
  loadVehicleAlertSeen,
  rememberVehicleAlertCursor,
  saveVehicleAlertSeen,
  type VehicleAlertSeenState,
} from './vehicleAlertDedup';
import {
  alertsAreActive,
  backoffDelay,
  browserNotificationBody,
  canReceiveVehicleAlerts,
  shouldNotifyStatus,
} from './vehicleAlertLogic';
import { clearVehicleAlertStorage, loadVehicleAlertPrefs, saveVehicleAlertPrefs } from './vehicleAlertPrefs';
import { createVehicleAlertSound } from './vehicleAlertSound';
import { VehicleAlertSettingsModal } from './VehicleAlertSettingsModal';
import { VehicleAlertToasts } from './VehicleAlertToasts';

interface VehicleAlertContextValue {
  pendingCount: number;
  openSettings: () => void;
  prefs: VehicleAlertPrefs;
}

const VehicleAlertContext = createContext<VehicleAlertContextValue | null>(null);

export function useVehicleAlerts() {
  return useContext(VehicleAlertContext);
}

function browserPermissionState(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export function VehicleAlertProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const canRead = Boolean(user && canReceiveVehicleAlerts(user.permissions));
  const canAnnounce = Boolean(user && hasPermission(user.permissions, 'vehicle_notices:announce'));
  const userId = user?.id || '';
  const churchName = user?.churchName || '';

  const [prefs, setPrefs] = useState<VehicleAlertPrefs>(DEFAULT_VEHICLE_ALERT_PREFS);
  const [draft, setDraft] = useState<VehicleAlertPrefs>(DEFAULT_VEHICLE_ALERT_PREFS);
  const [pendingCount, setPendingCount] = useState(0);
  const [toasts, setToasts] = useState<VehicleNoticeAlert[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [liveMessage, setLiveMessage] = useState('');
  const [persistError, setPersistError] = useState(false);
  const [browserState, setBrowserState] = useState<NotificationPermission | 'unsupported'>(
    browserPermissionState
  );
  const [saving, setSaving] = useState(false);

  const prefsRef = useRef(prefs);
  const seenRef = useRef<VehicleAlertSeenState>({ cursor: '', ids: {} });
  const operationalRef = useRef(false);
  const failuresRef = useRef(0);
  const soundRef = useRef(createVehicleAlertSound());
  const timersRef = useRef<number[]>([]);
  const pollTimerRef = useRef(0);
  const channelRef = useRef<ReturnType<typeof createVehicleAlertChannel> | null>(null);
  const scopeRef = useRef({ userId: '', churchName: '' });

  prefsRef.current = prefs;

  const persistSeen = useCallback(() => {
    if (userId && churchName) saveVehicleAlertSeen(userId, churchName, seenRef.current);
  }, [churchName, userId]);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((notice) => notice.id !== id));
  }, []);

  const showToasts = useCallback((notices: VehicleNoticeAlert[]) => {
    if (!prefsRef.current.inApp || notices.length === 0) return;
    setToasts((current) => {
      const merged = [...notices, ...current.filter((item) => !notices.some((next) => next.id === item.id))];
      return merged.slice(0, VEHICLE_ALERT_MAX_TOASTS);
    });
    notices.slice(0, VEHICLE_ALERT_MAX_TOASTS).forEach((notice) => {
      const timer = window.setTimeout(() => dismissToast(notice.id), VEHICLE_ALERT_TOAST_MS);
      timersRef.current.push(timer);
    });
    setLiveMessage(`Novo aviso de veículo: ${notices[0]?.plate}`);
  }, [dismissToast]);

  const notifyBrowser = useCallback((notice: VehicleNoticeAlert) => {
    if (
      !prefsRef.current.browser ||
      typeof Notification === 'undefined' ||
      Notification.permission !== 'granted' ||
      document.visibilityState === 'visible'
    ) {
      return;
    }
    const copy = browserNotificationBody(prefsRef.current, notice);
    const notification = new Notification(copy.title, { body: copy.body, tag: notice.id });
    notification.onclick = () => {
      window.focus();
      navigate(`/avisos-veiculos?aviso=${notice.id}`);
      notification.close();
    };
  }, [navigate]);

  const applyClaimed = useCallback((notices: VehicleNoticeAlert[]) => {
    const eligible = notices.filter((notice) => shouldNotifyStatus(notice.status));
    if (eligible.length === 0) return;
    const { next, claimed } = claimVehicleAlertIds(
      seenRef.current,
      eligible.map((notice) => notice.id)
    );
    seenRef.current = next;
    persistSeen();
    if (claimed.length === 0) return;
    channelRef.current?.post({ type: 'claimed', ids: claimed });
    if (!alertsAreActive(prefsRef.current, operationalRef.current)) return;

    const fresh = eligible.filter((notice) => claimed.includes(notice.id));
    if (prefsRef.current.sound && soundRef.current.isUnlocked()) {
      soundRef.current.play(prefsRef.current.volume);
    }
    showToasts(fresh);
    fresh.forEach(notifyBrowser);
  }, [notifyBrowser, persistSeen, showToasts]);

  const poll = useCallback(async () => {
    if (!canRead) return;
    try {
      const after = seenRef.current.cursor || undefined;
      const data = await api.getVehicleNoticeAlerts(after);
      operationalRef.current = data.operationalService;
      setPendingCount(data.pendingCount);
      seenRef.current = rememberVehicleAlertCursor(seenRef.current, data.nextCursor);
      persistSeen();
      applyClaimed(data.notices);
      failuresRef.current = 0;
      setPersistError(false);
    } catch {
      failuresRef.current += 1;
      if (failuresRef.current >= 3) setPersistError(true);
    }
  }, [applyClaimed, canRead, persistSeen]);

  const schedulePoll = useCallback(() => {
    window.clearTimeout(pollTimerRef.current);
    if (!canRead) return;
    const delay = backoffDelay(
      failuresRef.current,
      document.visibilityState === 'visible',
      VEHICLE_ALERT_POLL_VISIBLE_MS,
      VEHICLE_ALERT_POLL_HIDDEN_MS
    );
    pollTimerRef.current = window.setTimeout(async () => {
      await poll();
      schedulePoll();
    }, delay);
  }, [canRead, poll]);

  const pollRef = useRef(poll);
  const scheduleRef = useRef(schedulePoll);
  pollRef.current = poll;
  scheduleRef.current = schedulePoll;

  useEffect(() => {
    if (!userId || !churchName || !canRead) {
      setPendingCount(0);
      setToasts([]);
      return;
    }

    setPrefs(loadVehicleAlertPrefs(userId, churchName));
    seenRef.current = loadVehicleAlertSeen(userId, churchName);
    const sound = createVehicleAlertSound();
    soundRef.current = sound;
    const channel = createVehicleAlertChannel(userId, churchName, (message) => {
      if (message.type === 'claimed') {
        const { next } = claimVehicleAlertIds(seenRef.current, message.ids);
        seenRef.current = next;
        persistSeen();
      }
      if (message.type === 'pendingCount') setPendingCount(message.count);
      if (message.type === 'dismiss') dismissToast(message.id);
      if (message.type === 'announced') {
        dismissToast(message.id);
        setPendingCount((count) => Math.max(0, count - 1));
      }
    });

    channelRef.current = channel;
    const toastTimers: number[] = [];
    timersRef.current = toastTimers;
    void pollRef.current().then(() => scheduleRef.current());

    function onVisible() {
      if (document.visibilityState === 'visible') {
        void pollRef.current();
        scheduleRef.current();
      }
    }
    function onOnline() {
      void pollRef.current();
      scheduleRef.current();
    }

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);

    return () => {
      channel.close();
      channelRef.current = null;
      sound.dispose();
      window.clearTimeout(pollTimerRef.current);
      toastTimers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
    };
  }, [canRead, churchName, dismissToast, persistSeen, userId]);

  useEffect(() => {
    if (userId && churchName) {
      scopeRef.current = { userId, churchName };
      return;
    }
    const scope = scopeRef.current;
    setPendingCount(0);
    setToasts([]);
    setLiveMessage('');
    setSettingsOpen(false);
    seenRef.current = { cursor: '', ids: {} };
    if (scope.userId && scope.churchName) {
      clearVehicleAlertStorage(scope.userId, scope.churchName);
      scopeRef.current = { userId: '', churchName: '' };
    }
  }, [churchName, userId]);

  const openSettings = useCallback(() => {
    setDraft(prefs);
    setBrowserState(browserPermissionState());
    setSettingsOpen(true);
  }, [prefs]);

  const testAlert = useCallback(async () => {
    await soundRef.current.unlock();
    soundRef.current.play(draft.volume);
    setLiveMessage('Teste de alerta reproduzido.');
  }, [draft.volume]);

  const saveSettings = useCallback(async () => {
    if (!userId || !churchName) return;
    setSaving(true);
    try {
      let next = { ...draft, enabled: true };
      if (next.browser && typeof Notification !== 'undefined' && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        setBrowserState(permission);
        if (permission !== 'granted') next = { ...next, browser: false };
      }
      await soundRef.current.unlock();
      if (next.sound) soundRef.current.play(next.volume);
      saveVehicleAlertPrefs(userId, churchName, next);
      setPrefs(next);
      setDraft(next);
      setSettingsOpen(false);
      setLiveMessage('Alertas ativos neste computador.');
    } finally {
      setSaving(false);
    }
  }, [churchName, draft, userId]);

  const viewNotice = useCallback((id: string) => {
    dismissToast(id);
    navigate(`/avisos-veiculos?aviso=${id}`);
  }, [dismissToast, navigate]);

  const announceNotice = useCallback(async (notice: VehicleNoticeAlert) => {
    setBusyId(notice.id);
    try {
      await api.updateVehicleNoticeStatus(notice.id, 'announced', notice.updatedAt);
      dismissToast(notice.id);
      setPendingCount((count) => Math.max(0, count - 1));
      channelRef.current?.post({ type: 'announced', id: notice.id });
      setLiveMessage('Aviso marcado como anunciado.');
    } catch (error) {
      setLiveMessage(error instanceof Error ? error.message : 'Não foi possível atualizar o aviso.');
    } finally {
      setBusyId('');
    }
  }, [dismissToast]);

  const value = useMemo(
    () => ({ pendingCount, openSettings, prefs }),
    [openSettings, pendingCount, prefs]
  );

  return (
    <VehicleAlertContext.Provider value={value}>
      {children}
      {canRead && (
        <VehicleAlertToasts
          notices={toasts}
          canAnnounce={canAnnounce}
          busyId={busyId}
          liveMessage={liveMessage}
          onView={viewNotice}
          onAnnounce={announceNotice}
          onDismiss={dismissToast}
        />
      )}
      {canRead && persistError && (
        <div className="vehicle-alert-stack vehicle-alert-stack-footer">
          <p className="vehicle-alert-offline" role="status">
            Não foi possível atualizar os alertas. Nova tentativa em instantes.
          </p>
        </div>
      )}
      {settingsOpen && (
        <VehicleAlertSettingsModal
          prefs={draft}
          browserState={browserState}
          saving={saving}
          onChange={setDraft}
          onTest={testAlert}
          onCancel={() => setSettingsOpen(false)}
          onSave={saveSettings}
        />
      )}
    </VehicleAlertContext.Provider>
  );
}
