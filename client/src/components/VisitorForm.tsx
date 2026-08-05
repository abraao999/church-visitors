import { useState } from 'react';
import { api } from '../api/client';
import { RELATIONSHIPS, type Relationship } from '../types';
import './VisitorForm.css';

interface Props {
  onSuccess: () => void;
}

interface VisitorDraft {
  name: string;
  relationship: Relationship;
  city: string;
}

const emptyVisitor = (): VisitorDraft => ({ name: '', relationship: 'outro', city: '' });

export function VisitorForm({ onSuccess }: Props) {
  const [visitors, setVisitors] = useState<VisitorDraft[]>([emptyVisitor()]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function updateVisitor(index: number, field: keyof VisitorDraft, value: string) {
    setVisitors((prev) =>
      prev.map((visitor, i) => (i === index ? { ...visitor, [field]: value } : visitor))
    );
  }

  function addVisitor() {
    setVisitors((prev) => [...prev, emptyVisitor()]);
  }

  function removeVisitor(index: number) {
    setVisitors((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setLoading(true);

    const incomplete = visitors.some((v) => {
      const filled = [v.name, v.city].filter((value) => value.trim()).length;
      return filled === 1;
    });

    if (incomplete) {
      setError('Preencha nome e cidade de cada visitante');
      setLoading(false);
      return;
    }

    const validVisitors = visitors
      .map((v) => ({
        name: v.name.trim(),
        relationship: v.relationship,
        city: v.city.trim(),
      }))
      .filter((v) => v.name && v.city);

    if (validVisitors.length === 0) {
      setError('Informe ao menos um visitante com nome e cidade');
      setLoading(false);
      return;
    }

    try {
      await api.createVisitor({ visitors: validVisitors });
      setVisitors([emptyVisitor()]);
      setSuccess(
        validVisitors.length === 1
          ? 'Visitante registrado'
          : `${validVisitors.length} visitantes registrados`
      );
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <h2>Registrar visitantes</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Informe o nome, parentesco e cidade de cada visitante.
      </p>

      {error && <p className="error-message">{error}</p>}
      {success && <p className="success-message">{success}</p>}

      <div className="form-group">
        <label>Visitantes</label>
        <div className="member-list">
          {visitors.map((visitor, index) => (
            <div key={index} className="member-row member-row-city">
              <select
                value={visitor.relationship}
                onChange={(e) =>
                  updateVisitor(index, 'relationship', e.target.value as Relationship)
                }
                aria-label={`Parentesco do visitante ${index + 1}`}
              >
                {RELATIONSHIPS.map((rel) => (
                  <option key={rel.value} value={rel.value}>
                    {rel.label}
                  </option>
                ))}
              </select>
              <input
                value={visitor.name}
                onChange={(e) => updateVisitor(index, 'name', e.target.value)}
                placeholder="Nome do visitante"
                required={index === 0}
              />
              <input
                value={visitor.city}
                onChange={(e) => updateVisitor(index, 'city', e.target.value)}
                placeholder="Cidade"
                required={index === 0}
                aria-label={`Cidade do visitante ${index + 1}`}
              />
              <button
                type="button"
                className="btn btn-secondary member-remove"
                onClick={() => removeVisitor(index)}
                disabled={visitors.length === 1}
                aria-label="Remover visitante"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary add-member-btn" onClick={addVisitor}>
          + Adicionar nome
        </button>
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Salvando...' : 'Registrar'}
      </button>
    </form>
  );
}
