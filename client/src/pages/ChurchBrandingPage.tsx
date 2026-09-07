import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';
import { AppIcon } from '../components/AppIcon';
import { BrandMark } from '../components/BrandMark';
import { ChurchSectionNav } from '../components/ChurchSectionNav';
import { useBranding } from '../theme/BrandingContext';
import {
  DEFAULT_ACCENT_LIGHT,
  DEFAULT_PRIMARY_LIGHT,
  LOGO_ACCEPT,
  LOGO_HINT,
  isAllowedLogoFile,
  parseHexColor,
  validateBrandColor,
  type ChurchBrandingDraft,
} from '../utils/branding';
import './ChurchSettingsPage.css';
import './ChurchBrandingPage.css';

function ColorField({
  id,
  label,
  value,
  error,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error: string;
  onChange: (next: string) => void;
}) {
  const pickerValue = parseHexColor(value)?.toLowerCase() || value.toLowerCase();
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <div className="branding-color-field">
        <input
          id={`${id}-picker`}
          type="color"
          value={parseHexColor(value) ? pickerValue : '#2563eb'}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          aria-label={`Seletor visual de ${label.toLowerCase()}`}
        />
        <input
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value.toUpperCase())}
          spellCheck={false}
          autoComplete="off"
          inputMode="text"
          maxLength={7}
          aria-invalid={Boolean(error)}
          aria-describedby={`${id}-hint${error ? ` ${id}-error` : ''}`}
        />
      </div>
      <p id={`${id}-hint`} className="branding-field-hint">
        Formato #RRGGBB
      </p>
      {error && (
        <p id={`${id}-error`} className="error-message" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function BrandingPreviews({ draft }: { draft: ChurchBrandingDraft }) {
  const style = {
    '--preview-primary': draft.primaryColor || DEFAULT_PRIMARY_LIGHT,
    '--preview-accent': draft.accentColor || DEFAULT_ACCENT_LIGHT,
  } as CSSProperties;

  return (
    <section className="branding-previews" aria-label="Prévia da identidade visual">
      <article className="branding-preview-card" style={style}>
        <h3>Barra lateral administrativa</h3>
        <div className="branding-preview-sidebar" aria-hidden="true">
          <div className="branding-preview-brand">
            <BrandMark name={draft.name} logoUrl={draft.logoUrl} />
            <strong>{draft.name}</strong>
          </div>
          <span className="is-active">Início</span>
          <span>Visitantes</span>
          <span>Cultos</span>
        </div>
      </article>
      <article className="branding-preview-card" style={style}>
        <h3>Menu de acesso sem login</h3>
        <div className="branding-preview-public" aria-hidden="true">
          <div className="branding-preview-brand">
            <BrandMark name={draft.name} logoUrl={draft.logoUrl} />
            <strong>{draft.name}</strong>
          </div>
          <em>Visitantes</em>
          <em>Oração</em>
        </div>
      </article>
      <article className="branding-preview-card" style={style}>
        <h3>Painel projetado na TV</h3>
        <div className="branding-preview-tv" aria-hidden="true">
          <div className="branding-preview-brand">
            <BrandMark name={draft.name} logoUrl={draft.logoUrl} />
            <strong>{draft.name}</strong>
          </div>
          <p>Visitantes de hoje</p>
        </div>
      </article>
    </section>
  );
}

export function ChurchBrandingPage() {
  const { user, refreshUser, setChurchName } = useAuth();
  const { setPreview } = useBranding();
  const churchName = user?.churchName?.trim() || 'Igreja';
  const [logoUrl, setLogoUrl] = useState(user?.branding?.logoUrl || '');
  const [primaryColor, setPrimaryColor] = useState(
    user?.branding?.primaryColor || DEFAULT_PRIMARY_LIGHT
  );
  const [accentColor, setAccentColor] = useState(
    user?.branding?.accentColor || DEFAULT_ACCENT_LIGHT
  );
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [localLogoUrl, setLocalLogoUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [logoError, setLogoError] = useState('');

  useEffect(() => {
    api
      .getChurchBranding()
      .then((branding) => {
        setLogoUrl(branding.logoUrl || '');
        setPrimaryColor(branding.primaryColor || DEFAULT_PRIMARY_LIGHT);
        setAccentColor(branding.accentColor || DEFAULT_ACCENT_LIGHT);
        if (branding.name) setChurchName(branding.name);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar a identidade visual');
      })
      .finally(() => setLoading(false));
  }, [setChurchName]);

  const draft = useMemo<ChurchBrandingDraft>(
    () => ({
      name: churchName,
      logoUrl: localLogoUrl || logoUrl || undefined,
      primaryColor: parseHexColor(primaryColor) || undefined,
      accentColor: parseHexColor(accentColor) || undefined,
    }),
    [accentColor, churchName, localLogoUrl, logoUrl, primaryColor]
  );

  useEffect(() => {
    setPreview(draft);
    return () => setPreview(null);
  }, [draft, setPreview]);

  useEffect(() => {
    return () => {
      if (localLogoUrl) URL.revokeObjectURL(localLogoUrl);
    };
  }, [localLogoUrl]);

  const primaryCheck = validateBrandColor(primaryColor);
  const accentCheck = validateBrandColor(accentColor);
  const primaryError = 'error' in primaryCheck ? primaryCheck.error : '';
  const accentError = 'error' in accentCheck ? accentCheck.error : '';

  async function handleSave(event: FormEvent) {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (primaryError || accentError) {
      setError('Corrija as cores antes de salvar.');
      return;
    }
    setSaving(true);
    try {
      await api.updateChurchBranding({
        primaryColor: parseHexColor(primaryColor) || DEFAULT_PRIMARY_LIGHT,
        accentColor: parseHexColor(accentColor) || DEFAULT_ACCENT_LIGHT,
      });
      if (logoFile) {
        const uploaded = await api.uploadChurchLogo(logoFile);
        setLogoUrl(uploaded.logoUrl || '');
        setLogoFile(null);
        if (localLogoUrl) URL.revokeObjectURL(localLogoUrl);
        setLocalLogoUrl('');
      }
      await refreshUser();
      setSuccess('Identidade visual salva');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar a identidade visual');
    } finally {
      setSaving(false);
    }
  }

  async function handleRestore() {
    if (!window.confirm('Restaurar a identidade visual padrão do sistema? O logotipo personalizado será removido.')) {
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.updateChurchBranding({ restoreDefault: true });
      setLogoUrl('');
      setLogoFile(null);
      if (localLogoUrl) URL.revokeObjectURL(localLogoUrl);
      setLocalLogoUrl('');
      setPrimaryColor(DEFAULT_PRIMARY_LIGHT);
      setAccentColor(DEFAULT_ACCENT_LIGHT);
      await refreshUser();
      setSuccess('Identidade padrão restaurada');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao restaurar o padrão');
    } finally {
      setSaving(false);
    }
  }

  async function handleRemoveLogo() {
    if (!window.confirm('Remover o logotipo atual e voltar ao símbolo padrão?')) {
      return;
    }
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      await api.deleteChurchLogo();
      setLogoUrl('');
      setLogoFile(null);
      if (localLogoUrl) URL.revokeObjectURL(localLogoUrl);
      setLocalLogoUrl('');
      await refreshUser();
      setSuccess('Logotipo removido');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover o logotipo');
    } finally {
      setSaving(false);
    }
  }

  function handleLogoChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setLogoError('');
    if (!file) return;
    const allowed = isAllowedLogoFile(file);
    if ('error' in allowed) {
      setLogoError(allowed.error);
      return;
    }
    if (localLogoUrl) URL.revokeObjectURL(localLogoUrl);
    setLogoFile(file);
    setLocalLogoUrl(URL.createObjectURL(file));
  }

  if (loading) {
    return <p className="empty-state">Carregando...</p>;
  }

  return (
    <div className="church-settings-page church-branding-page">
      <ChurchSectionNav />
      <section className="church-settings-hero">
        <div>
          <span className="church-settings-eyebrow">
            <AppIcon name="home" /> Identidade da igreja
          </span>
          <h1>Identidade visual</h1>
          <p>
            O nome exibido é o cadastrado em Dados da igreja. As cores e o logotipo valem só para as
            páginas desta igreja.
          </p>
        </div>
      </section>

      <form className="card church-settings-form" onSubmit={handleSave}>
        <div className="church-settings-form-heading">
          <span>
            <AppIcon name="edit" />
          </span>
          <div>
            <h2>Marca e cores</h2>
            <p>A prévia muda na hora. Nada é publicado até você salvar.</p>
          </div>
        </div>

        <div className="church-settings-feedback" aria-live="polite">
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          {success && (
            <p className="success-message">
              <AppIcon name="check" />
              {success}
            </p>
          )}
        </div>

        <div className="form-group">
          <label htmlFor="church-display-name">Nome exibido</label>
          <input id="church-display-name" value={churchName} readOnly aria-readonly="true" />
          <p className="branding-field-hint">Altere o nome na aba Dados da igreja.</p>
        </div>

        <div className="form-group">
          <span id="logo-label">Logotipo</span>
          <div className="branding-logo-row">
            <div className="branding-logo-preview" aria-hidden="true">
              <BrandMark name={churchName} logoUrl={draft.logoUrl} />
            </div>
            <div className="branding-logo-actions">
              <label className="btn btn-secondary branding-file-label" htmlFor="church-logo">
                Enviar logotipo
              </label>
              <input
                id="church-logo"
                type="file"
                accept={LOGO_ACCEPT}
                onChange={handleLogoChange}
                aria-labelledby="logo-label"
                aria-describedby="logo-hint"
              />
              {(logoUrl || localLogoUrl) && (
                <button type="button" className="btn btn-danger" onClick={handleRemoveLogo} disabled={saving}>
                  Remover logotipo
                </button>
              )}
            </div>
          </div>
          <p id="logo-hint" className="branding-field-hint">
            {LOGO_HINT}
          </p>
          {logoError && (
            <p className="error-message" role="alert">
              {logoError}
            </p>
          )}
        </div>

        <div className="form-row">
          <ColorField
            id="brand-primary"
            label="Cor principal"
            value={primaryColor}
            error={primaryError}
            onChange={setPrimaryColor}
          />
          <ColorField
            id="brand-accent"
            label="Cor de destaque"
            value={accentColor}
            error={accentError}
            onChange={setAccentColor}
          />
        </div>

        <BrandingPreviews draft={draft} />

        <div className="church-settings-actions branding-actions">
          <button type="button" className="btn btn-secondary" onClick={handleRestore} disabled={saving}>
            Restaurar padrão
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={saving || Boolean(primaryError || accentError)}
          >
            {saving ? 'Salvando...' : 'Salvar identidade visual'}
          </button>
        </div>
      </form>
    </div>
  );
}
