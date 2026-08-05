import { useEffect, useState } from 'react';
import { api } from '../api/client';
import type { Hymn, Service } from '../types';
import './ServiceForm.css';

interface Props {
  service: Service;
  onSuccess: () => void;
  onCancel: () => void;
}

const emptyHymn = (): Hymn => ({ title: '', artist: '', performedBy: '' });

function mapHymn(h: Hymn): Hymn {
  return {
    title: h.title ?? '',
    artist: h.artist || (h as Hymn & { singer?: string }).singer || '',
    performedBy: h.performedBy ?? '',
  };
}

export function HymnsForm({ service, onSuccess, onCancel }: Props) {
  const [hymns, setHymns] = useState<Hymn[]>([emptyHymn()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setHymns(service.hymns.length > 0 ? service.hymns.map(mapHymn) : [emptyHymn()]);
    setError('');
  }, [service]);

  function updateHymn(index: number, field: keyof Hymn, value: string) {
    setHymns((prev) =>
      prev.map((hymn, i) => (i === index ? { ...hymn, [field]: value } : hymn))
    );
  }

  function addHymn() {
    setHymns((prev) => [...prev, emptyHymn()]);
  }

  function removeHymn(index: number) {
    setHymns((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const incomplete = hymns.some((h) => {
      const filled = [h.title, h.artist, h.performedBy].filter((v) => v.trim()).length;
      return filled > 0 && filled < 3;
    });

    if (incomplete) {
      setError('Preencha nome do louvor, cantor (dono da música) e quem vai cantar no culto');
      setLoading(false);
      return;
    }

    const validHymns = hymns
      .map((h) => ({
        title: h.title.trim(),
        artist: h.artist.trim(),
        performedBy: h.performedBy.trim(),
      }))
      .filter((h) => h.title && h.artist && h.performedBy);

    try {
      await api.updateService(service._id, {
        title: service.title,
        date: service.date.split('T')[0] ?? service.date,
        time: service.time || undefined,
        hymns: validHymns,
      });
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar louvores');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card service-form">
      <h2>Louvores do culto</h2>
      <p className="service-form-hint">
        {service.title}
        {service.time ? ` · ${service.time}` : ''} — informe o louvor, o cantor (dono da música) e
        quem vai cantar no culto.
      </p>

      {error && <p className="error-message">{error}</p>}

      <div className="form-group">
        <label>Louvores</label>
        <div className="hymn-list">
          {hymns.map((hymn, index) => (
            <div key={index} className="hymn-row hymn-row-3">
              <span className="hymn-order">{index + 1}</span>
              <input
                value={hymn.title}
                onChange={(e) => updateHymn(index, 'title', e.target.value)}
                placeholder="Nome do louvor"
                aria-label={`Nome do louvor ${index + 1}`}
              />
              <input
                value={hymn.artist}
                onChange={(e) => updateHymn(index, 'artist', e.target.value)}
                placeholder="Cantor (dono da música)"
                aria-label={`Cantor dono da música ${index + 1}`}
              />
              <input
                value={hymn.performedBy}
                onChange={(e) => updateHymn(index, 'performedBy', e.target.value)}
                placeholder="Quem canta no culto (ex: jovens, irmãos)"
                aria-label={`Quem canta no culto ${index + 1}`}
              />
              <button
                type="button"
                className="btn btn-secondary hymn-remove"
                onClick={() => removeHymn(index)}
                disabled={hymns.length === 1}
                aria-label="Remover louvor"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary add-hymn-btn" onClick={addHymn}>
          + Adicionar louvor
        </button>
      </div>

      <div className="service-form-actions">
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button type="submit" className="btn btn-primary" disabled={loading}>
          {loading ? 'Salvando...' : 'Salvar louvores'}
        </button>
      </div>
    </form>
  );
}
