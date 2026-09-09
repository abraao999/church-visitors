import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import type { Service } from '../types';
import { hasPermission } from '../utils/permissions';
import { longDateLabel, serviceDateKey } from '../utils/serviceSchedule';

interface Props {
  value?: string;
  onChange: (serviceId: string | undefined) => void;
  label?: string;
}

export function ServiceLinkField({ value, onChange, label = 'Culto associado' }: Props) {
  const { user } = useAuth();
  const canChoose = hasPermission(user?.permissions, 'services:read') || user?.role === 'owner';
  const [active, setActive] = useState<Service | null>(null);
  const [options, setOptions] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await api.getActiveService();
        if (cancelled) return;
        setActive(current.service);
        if (current.service) onChange(current.service._id);
        if (canChoose) {
          const from = new Date();
          from.setDate(from.getDate() - 1);
          const to = new Date();
          to.setDate(to.getDate() + 14);
          const asKey = (value: Date) =>
            `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
          const list = await api.getServices({
            from: asKey(from),
            to: asKey(to),
          });
          if (!cancelled) setOptions(list.filter((item) => item.status !== 'cancelled'));
        }
      } catch {
        if (!cancelled) setActive(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  // Carrega o culto ativo uma vez ao abrir o formulário.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- evita resetar o seletor a cada digitação
  }, [canChoose]);

  if (loading) {
    return <p className="service-link-note">Localizando o culto ativo...</p>;
  }

  if (!canChoose) {
    return (
      <p className="service-link-note">
        {active
          ? `Este registro será vinculado a ${active.title}.`
          : 'Não há culto ativo agora. O registro ficará sem culto associado.'}
      </p>
    );
  }

  return (
    <div className="form-group service-field">
      <label htmlFor="linkedService">{label}</label>
      <select
        id="linkedService"
        value={value || ''}
        onChange={(e) => onChange(e.target.value || undefined)}
      >
        <option value="">Sem culto associado</option>
        {options.map((service) => (
          <option key={service._id} value={service._id}>
            {service.title} · {longDateLabel(service.dateKey || serviceDateKey(service.date))}
            {service.time ? ` · ${service.time}` : ''}
          </option>
        ))}
      </select>
    </div>
  );
}
