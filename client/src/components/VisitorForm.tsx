import { useState } from 'react';
import { api } from '../api/client';
import { RELATIONSHIPS, type FamilyMember, type Relationship } from '../types';
import './VisitorForm.css';

interface Props {
  onSuccess: () => void;
}

const emptyMember = (): FamilyMember => ({ name: '', relationship: 'pai' });

export function VisitorForm({ onSuccess }: Props) {
  const [familyName, setFamilyName] = useState('');
  const [members, setMembers] = useState<FamilyMember[]>([emptyMember()]);
  const [origin, setOrigin] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function updateMember(index: number, field: keyof FamilyMember, value: string) {
    setMembers((prev) =>
      prev.map((member, i) =>
        i === index ? { ...member, [field]: value } : member
      )
    );
  }

  function addMember() {
    setMembers((prev) => [...prev, emptyMember()]);
  }

  function removeMember(index: number) {
    setMembers((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const validMembers = members
      .map((m) => ({ name: m.name.trim(), relationship: m.relationship }))
      .filter((m) => m.name);

    if (validMembers.length === 0) {
      setError('Informe ao menos um membro com nome');
      setLoading(false);
      return;
    }

    try {
      await api.createVisitor({ familyName, members: validMembers, origin });
      setFamilyName('');
      setMembers([emptyMember()]);
      setOrigin('');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="card">
      <h2>Registrar família visitante</h2>
      <p style={{ color: 'var(--text-muted)', marginBottom: '1.25rem', fontSize: '0.9rem' }}>
        Informe o nome da família, os membros com parentesco e de onde eles são.
      </p>

      {error && <p className="error-message">{error}</p>}

      <div className="form-group">
        <label htmlFor="familyName">Nome da família / responsável</label>
        <input
          id="familyName"
          value={familyName}
          onChange={(e) => setFamilyName(e.target.value)}
          placeholder="Ex: Família Silva"
          required
        />
      </div>

      <div className="form-group">
        <label>Membros da família</label>
        <div className="member-list">
          {members.map((member, index) => (
            <div key={index} className="member-row">
              <select
                value={member.relationship}
                onChange={(e) => updateMember(index, 'relationship', e.target.value as Relationship)}
                aria-label={`Parentesco do membro ${index + 1}`}
              >
                {RELATIONSHIPS.map((rel) => (
                  <option key={rel.value} value={rel.value}>
                    {rel.label}
                  </option>
                ))}
              </select>
              <input
                value={member.name}
                onChange={(e) => updateMember(index, 'name', e.target.value)}
                placeholder="Nome do membro"
                required={index === 0}
              />
              <button
                type="button"
                className="btn btn-secondary member-remove"
                onClick={() => removeMember(index)}
                disabled={members.length === 1}
                aria-label="Remover membro"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <button type="button" className="btn btn-secondary add-member-btn" onClick={addMember}>
          + Adicionar membro
        </button>
      </div>

      <div className="form-group">
        <label htmlFor="origin">De onde são</label>
        <input
          id="origin"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="Ex: Bairro Centro, Cidade vizinha"
          required
        />
      </div>

      <button type="submit" className="btn btn-primary" disabled={loading}>
        {loading ? 'Salvando...' : 'Registrar visitante'}
      </button>
    </form>
  );
}
