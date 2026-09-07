import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { AppIcon } from './AppIcon';
import type { RecurrenceFrequency, Service } from '../types';
import {
  DURATION_OPTIONS,
  WEEKDAY_LABELS,
  addMinutesClock,
  countOccurrences,
  longDateLabel,
  requestId,
  shiftToWeekday,
  weekdayFromIso,
  yearEndIso,
} from '../utils/serviceSchedule';
import './ServiceForm.css';

interface Props {
  selectedDate: string;
  editing?: Service | null;
  editScope?: 'this' | 'thisAndFuture';
  onSuccess: (service?: Service, createdCount?: number, seriesId?: string) => void;
  onCancel?: () => void;
}

export function ServiceForm({
  selectedDate,
  editing,
  editScope = 'this',
  onSuccess,
  onCancel,
}: Props) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(selectedDate);
  const [time, setTime] = useState('19:00');
  const [durationMinutes, setDurationMinutes] = useState(120);
  const [customDuration, setCustomDuration] = useState(false);
  const [recurring, setRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('weekly');
  const [weekday, setWeekday] = useState(weekdayFromIso(selectedDate));
  const [endDate, setEndDate] = useState(yearEndIso(selectedDate));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const isEditing = Boolean(editing);

  useEffect(() => {
    if (editing) {
      const dateValue = editing.dateKey || editing.date.split('T')[0] || selectedDate;
      setTitle(editing.title);
      setDate(dateValue);
      setTime(editing.time || '19:00');
      setDurationMinutes(editing.durationMinutes || 120);
      setCustomDuration(!DURATION_OPTIONS.some((item) => item.value === (editing.durationMinutes || 120)));
      setRecurring(false);
      setError('');
      return;
    }

    setTitle('');
    setDate(selectedDate);
    setTime('19:00');
    setDurationMinutes(120);
    setCustomDuration(false);
    setRecurring(false);
    setFrequency('weekly');
    setWeekday(weekdayFromIso(selectedDate));
    setEndDate(yearEndIso(selectedDate));
    setError('');
  }, [editing, selectedDate]);

  useEffect(() => {
    if (!isEditing && recurring) {
      setDate((current) => shiftToWeekday(current, weekday));
    }
  }, [weekday, recurring, isEditing]);

  const preview = useMemo(() => {
    if (!date || !time) return null;
    const firstDate = recurring ? shiftToWeekday(date, weekday) : date;
    const count = recurring ? countOccurrences(firstDate, endDate, frequency) : 1;
    return {
      firstLabel: longDateLabel(firstDate),
      reception: addMinutesClock(time, -30),
      start: time,
      end: addMinutesClock(time, durationMinutes),
      repeat:
        recurring && frequency === 'weekly'
          ? `todos os ${WEEKDAY_LABELS[weekday]}s`
          : recurring
            ? `a cada duas semanas, ${WEEKDAY_LABELS[weekday]}`
            : 'culto único',
      count,
      limitError:
        recurring && count >= 100
          ? 'Uma série pode ter no máximo 100 cultos. Encurte a data final.'
          : null,
    };
  }, [date, time, durationMinutes, recurring, frequency, weekday, endDate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (preview?.limitError) {
      setError(preview.limitError);
      return;
    }
    setLoading(true);

    try {
      if (editing) {
        await api.updateService(editing._id, {
          title: title.trim(),
          date,
          time,
          durationMinutes,
          hymns: editing.hymns ?? [],
          updatedAt: editing.updatedAt,
          editScope,
        });
        onSuccess();
      } else {
        const result = await api.createService({
          title: title.trim(),
          date: recurring ? shiftToWeekday(date, weekday) : date,
          time,
          durationMinutes,
          recurring,
          frequency: recurring ? frequency : undefined,
          weekday: recurring ? weekday : undefined,
          endDate: recurring ? endDate : undefined,
          requestId: requestId(),
        });
        onSuccess(result.service, result.createdCount, result.seriesId);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card service-form service-form-wide">
      <div className="service-form-heading">
        <span><AppIcon name={isEditing ? 'edit' : 'plus'} /></span>
        <div>
          <p className="service-form-kicker">Calendário de cultos</p>
          <h2>{isEditing ? 'Editar culto' : 'Novo culto'}</h2>
          <p>Organize o horário e escolha se ele será repetido.</p>
        </div>
      </div>

      {error && <p className="error-message">{error}</p>}

      <div className="service-form-grid">
        <div className="service-form-card">
          <h3>Informações do culto</h3>

          <div className="form-group service-field">
            <label htmlFor="serviceTitle">Nome do culto</label>
            <input
              id="serviceTitle"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Culto da noite"
              required
            />
          </div>

          <div className="service-form-row">
            <div className="form-group service-field">
              <label htmlFor="serviceDate">
                {recurring ? 'Data da primeira ocorrência' : 'Data'}
              </label>
              <input
                id="serviceDate"
                type="date"
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setWeekday(weekdayFromIso(e.target.value));
                }}
                required
              />
            </div>
            <div className="form-group service-field">
              <label htmlFor="serviceTime">Horário</label>
              <input
                id="serviceTime"
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="form-group service-field">
            <label htmlFor="serviceDuration">Duração prevista</label>
            <select
              id="serviceDuration"
              value={customDuration ? 'custom' : String(durationMinutes)}
              onChange={(e) => {
                if (e.target.value === 'custom') {
                  setCustomDuration(true);
                  return;
                }
                setCustomDuration(false);
                setDurationMinutes(Number(e.target.value));
              }}
            >
              {DURATION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Personalizada</option>
            </select>
          </div>

          {customDuration && (
            <div className="form-group service-field">
              <label htmlFor="serviceCustomDuration">Duração em minutos</label>
              <input
                id="serviceCustomDuration"
                type="number"
                min={15}
                max={720}
                step={15}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
              />
            </div>
          )}

          {!isEditing && (
            <>
              <div className="form-group recurring-option">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={recurring}
                    onChange={(e) => setRecurring(e.target.checked)}
                  />
                  <span>
                    <strong>Culto recorrente</strong>
                    <small>O sistema criará automaticamente as próximas ocorrências.</small>
                  </span>
                </label>
              </div>

              {recurring && (
                <>
                  <div className="service-form-row">
                    <div className="form-group service-field">
                      <label htmlFor="serviceFrequency">Repetir</label>
                      <select
                        id="serviceFrequency"
                        value={frequency}
                        onChange={(e) => setFrequency(e.target.value as RecurrenceFrequency)}
                      >
                        <option value="weekly">Toda semana</option>
                        <option value="biweekly">A cada duas semanas</option>
                      </select>
                    </div>
                    <div className="form-group service-field">
                      <label htmlFor="serviceWeekday">Dia da semana</label>
                      <select
                        id="serviceWeekday"
                        value={weekday}
                        onChange={(e) => setWeekday(Number(e.target.value))}
                      >
                        {WEEKDAY_LABELS.map((label, index) => (
                          <option key={label} value={index}>
                            {label.charAt(0).toUpperCase() + label.slice(1)}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="form-group service-field">
                    <label htmlFor="serviceEndDate">Repetir até</label>
                    <input
                      id="serviceEndDate"
                      type="date"
                      value={endDate}
                      min={date}
                      onChange={(e) => setEndDate(e.target.value)}
                      required
                    />
                  </div>
                  {preview && (
                    <p className="recurring-hint">
                      {preview.limitError || `Serão criados ${preview.count} cultos.`}
                    </p>
                  )}
                </>
              )}
            </>
          )}
        </div>

        <aside className="service-form-card service-preview-card">
          <h3>Como funcionará</h3>
          {preview ? (
            <ol className="service-preview-list">
              <li>
                <AppIcon name="calendar" />
                <div>
                  <strong>Primeira ocorrência</strong>
                  <span>{preview.firstLabel}</span>
                </div>
              </li>
              <li>
                <AppIcon name="qr" />
                <div>
                  <strong>Recepção abre automaticamente</strong>
                  <span>{preview.reception} · 30 minutos antes</span>
                </div>
              </li>
              <li>
                <AppIcon name="clock" />
                <div>
                  <strong>Culto começa</strong>
                  <span>{preview.start}</span>
                </div>
              </li>
              <li>
                <AppIcon name="check" />
                <div>
                  <strong>Encerramento automático</strong>
                  <span>{preview.end}</span>
                </div>
              </li>
            </ol>
          ) : null}
          <p className="service-preview-note">
            <AppIcon name="info" />
            Visitantes, orações e avisos de veículos enviados nesse período serão vinculados a este culto.
          </p>
        </aside>
      </div>

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
