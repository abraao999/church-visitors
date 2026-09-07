import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { api } from '../api/client';
import { portariaPairingUrl } from '../portaria/constants';
import type { PortariaDevice, PortariaPairing } from '../types';
import { AppIcon } from './AppIcon';
import './PortariaDevicesSection.css';

function formatDate(value?: string): string {
  if (!value) return 'Ainda não conectou';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(
    new Date(value)
  );
}

function permissionLabel(permission: string): string {
  if (permission === 'offline_visitors:create') return 'Visitantes';
  if (permission === 'offline_vehicle_notices:create') return 'Avisos de veículos';
  return permission;
}

export function PortariaDevicesSection() {
  const [devices, setDevices] = useState<PortariaDevice[]>([]);
  const [pairing, setPairing] = useState<PortariaPairing | null>(null);
  const [qr, setQr] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const load = useCallback(async () => {
    try {
      setDevices(await api.getPortariaDevices());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar aparelhos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!pairing) {
      setQr('');
      return;
    }
    const url = portariaPairingUrl(pairing.token);
    void QRCode.toDataURL(url, { width: 220, margin: 2, errorCorrectionLevel: 'M' }).then(setQr);
  }, [pairing]);

  async function prepareDevice() {
    setError('');
    setFeedback('');
    try {
      const created = await api.createPortariaPairing();
      setPairing(created);
      setFeedback('Convite de 15 minutos criado. Abra o link no aparelho da portaria.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o convite.');
    }
  }

  async function rename(device: PortariaDevice) {
    const name = window.prompt('Nome do aparelho', device.name)?.trim();
    if (!name) return;
    setBusyId(device.id);
    try {
      const updated = await api.renamePortariaDevice(device.id, name);
      setDevices((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFeedback('Aparelho renomeado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível renomear.');
    } finally {
      setBusyId('');
    }
  }

  async function revoke(device: PortariaDevice) {
    if (
      !window.confirm(
        `Desativar “${device.name}”? Este aparelho deixará de enviar novos cadastros quando voltar a se conectar.`
      )
    ) {
      return;
    }
    setBusyId(device.id);
    try {
      const updated = await api.revokePortariaDevice(device.id);
      setDevices((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      setFeedback('Aparelho desativado.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível desativar.');
    } finally {
      setBusyId('');
    }
  }

  const pairingLink = pairing ? portariaPairingUrl(pairing.token) : '';

  return (
    <section className="portaria-admin" aria-labelledby="portaria-devices-title">
      <div className="portaria-admin-heading">
        <div>
          <h2 id="portaria-devices-title">Dispositivos da portaria</h2>
          <p>
            Prepare um celular ou tablet para cadastrar visitantes e avisos sem internet. O
            convite é de uso único e vale 15 minutos.
          </p>
        </div>
        <button type="button" className="btn btn-secondary" onClick={() => void prepareDevice()}>
          <AppIcon name="plus" /> Preparar novo aparelho
        </button>
      </div>

      {feedback && (
        <p className="success-message">
          <AppIcon name="check" /> {feedback}
        </p>
      )}
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}

      {pairing && (
        <article className="portaria-admin-pairing card">
          <div>
            <h3>Abra este link no aparelho da portaria</h3>
            <p>Depois do pareamento este convite deixa de funcionar.</p>
            <input value={pairingLink} readOnly onFocus={(event) => event.currentTarget.select()} />
            <small>
              Válido até{' '}
              {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short', dateStyle: 'short' }).format(
                new Date(pairing.expiresAt)
              )}
            </small>
            <button
              type="button"
              className="guest-action-button primary"
              onClick={() => void navigator.clipboard.writeText(pairingLink)}
            >
              <AppIcon name="copy" /> Copiar link
            </button>
          </div>
          {qr && <img src={qr} alt="QR Code para preparar o aparelho da portaria" width={180} height={180} />}
        </article>
      )}

      {loading ? (
        <p>Carregando aparelhos...</p>
      ) : devices.length === 0 ? (
        <p className="portaria-admin-empty">Nenhum aparelho preparado ainda.</p>
      ) : (
        <ul className="portaria-admin-list">
          {devices.map((device) => (
            <li key={device.id} className="card">
              <div>
                <strong>{device.name}</strong>
                <span className={device.active ? 'active' : 'inactive'}>
                  {device.active ? 'Ativo' : 'Desativado'}
                </span>
                <p>{device.permissions.map(permissionLabel).join(' · ')}</p>
                <p>Última conexão: {formatDate(device.lastUsedAt)}</p>
              </div>
              <div className="portaria-admin-actions">
                <button type="button" onClick={() => void rename(device)} disabled={busyId === device.id}>
                  Renomear aparelho
                </button>
                {device.active && (
                  <button type="button" className="danger" onClick={() => void revoke(device)} disabled={busyId === device.id}>
                    Desativar aparelho
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="portaria-admin-limit">
        Enquanto o aparelho estiver sem internet, a desativação só vale na próxima conexão. Não é
        possível apagar a fila remota de um tablet totalmente offline.
      </p>
    </section>
  );
}
