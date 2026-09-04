import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { AppIcon } from './AppIcon';
import type { Service } from '../types';
import './ServiceForm.css';

interface Props {
  selectedDate: string;
  editing?: Service | null;
  onSuccess: (service?: Service, createdCount?: number) => void;
  onCancel?: () => void;
}

const WEEKDAY_LABELS = [
  'domingo',
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
  'sábado',
];

function toDateInputValue(dateStr: string): string {
  return dateStr.split('T')[0] ?? dateStr;
}

function countWeeklyUntilYearEnd(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return 0;

  let count = 0;
  const current = new Date(y, m - 1, d);
  const year = current.getFullYear();

  while (current.getFullYear() === year) {
    count += 1;
    current.setDate(current.getDate() + 7);
  }

  return count;
}

function weekdayLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return '';
  return WEEKDAY_LABELS[new Date(y, m - 1, d).getDay()] ?? '';
}

export function ServiceForm({ selectedDate, editing, onSuccess, onCancel }: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState('');
  const [recurring, setRecurring] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (editing) {
      setTitle(editing.title);
      setDate(toDateInputValue(editing.date));
      setTime(editing.time ?? '');
      setRecurring(false);
      setError('');
      return;
    }

    setTitle('');
    setDate(selectedDate);
    setTime('');
    setRecurring(false);
    setError('');
  }, [editing, selectedDate]);

  const recurrencePreview = useMemo(() => {
    if (!recurring || !date) return null;
    const count = countWeeklyUntilYearEnd(date);
    const weekday = weekdayLabel(date);
    const year = date.slice(0, 4);
    return { count, weekday, year };
  }, [recurring, date]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      if (editing) {
        await api.updateService(editing._id, {
          title: title.trim(),
          date,
          time: time.trim() || undefined,
          hymns: editing.hymns ?? [],
        });
        onSuccess();
      } else {
        if (recurring && !time.trim()) {
          setError('Horário é obrigatório para culto recorrente');
          setLoading(false);
          return;
        }

        const result = await api.createService({
          title: title.trim(),
          date,
          time: time.trim() || undefined,
          recurring,
        });
        onSuccess(result.service, result.createdCount);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  const isEditing = Boolean(editing);

  return (
    <form onSubmit={handleSubmit} className="card service-form">
      <div className="service-form-heading">
        <span><AppIcon name={isEditing ? 'edit' : 'plus'} /></span>
        <div>
          <h2>{isEditing ? 'Editar culto' : 'Novo culto'}</h2>
          <p>Informe os dados básicos. Os louvores serão adicionados em seguida.</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="form-group service-field">
        <label htmlFor="serviceTitle">Título do culto</label>
        <input
          id="serviceTitle"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Ex: Culto da manhã"
          required
        />
      </div>

      <div className="service-form-row">
        <div className="form-group service-field">
          <label htmlFor="serviceDate">Data</label>
          <input
            id="serviceDate"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            required
          />
        </div>
        <div className="form-group service-field">
          <label htmlFor="serviceTime">Horário{recurring ? '' : ' (opcional)'}</label>
          <input
            id="serviceTime"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required={recurring}
          />
        </div>
      </div>

      {!isEditing && (
        <div className="form-group recurring-option">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
            />
            <span><strong>Culto recorrente</strong><small>Repete semanalmente até o fim do ano.</small></span>
          </label>
          {recurrencePreview ? (
            <p className="recurring-hint">
              Será agendado toda {recurrencePreview.weekday}
              {time ? ` às ${time}` : ''} até o fim de {recurrencePreview.year}
              {' '}({recurrencePreview.count} cultos).
            </p>
          ) : null}
        </div>
      )}

      <div className="service-form-actions">
        {onCancel && (
          <button type="button" className="btn btn-secondary" onClick={onCancel}>
            Cancelar
          </button>
        )}
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {!loading && <AppIcon name="check" />}
          {loading
            ? 'Salvando...'
            : isEditing
              ? 'Salvar alterações'
              : recurring
                ? 'Criar cultos recorrentes'
                : 'Criar culto'}
        </button>
      </div>
    </form>
  );
}
