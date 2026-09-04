import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import { AppIcon } from '../components/AppIcon';
import type { HolyricsMode, HolyricsSettings } from '../types';
import './HolyricsSettingsPage.css';

export function HolyricsSettingsPage() {
  const [form, setForm] = useState({
    mode: 'local' as HolyricsMode,
    host: '127.0.0.1',
    port: 8091,
    token: '',
    apiKey: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [testMessage, setTestMessage] = useState('');

  useEffect(() => {
    api
      .getHolyricsSettings()
      .then((settings: HolyricsSettings) => {
        setForm({
          mode: settings.mode || 'local',
          host: settings.host || '127.0.0.1',
          port: settings.port || 8091,
          token: settings.token || '',
          apiKey: settings.apiKey || '',
        });
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : 'Erro ao carregar configurações');
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSuccess('');
    setSaving(true);
    try {
      const saved = await api.saveHolyricsSettings(form);
      setForm({
        mode: saved.mode,
        host: saved.host,
        port: saved.port,
        token: saved.token,
        apiKey: saved.apiKey,
      });
      setSuccess('Configurações salvas');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest() {
    setError('');
    setTestMessage('');
    setTesting(true);
    try {
      await api.saveHolyricsSettings(form);
      const result = await api.testHolyrics();
      setTestMessage(result.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha no teste');
    } finally {
      setTesting(false);
    }
  }

  if (loading) {
    return <p className="empty-state">Carregando...</p>;
  }

  return (
    <div className="holyrics-settings-page">
      <section className="holyrics-hero">
        <div>
          <span className="holyrics-eyebrow"><AppIcon name="music" /> Integração de louvores</span>
          <h1>Conectar ao Holyrics</h1>
          <p>Configure uma vez para enviar os louvores dos cultos com poucos cliques.</p>
        </div>
        <Link to="/cultos" className="holyrics-cultos-link">
          <AppIcon name="calendar" /> Ir para cultos <AppIcon name="arrow" />
        </Link>
      </section>

      <div className="holyrics-settings-layout">
        <aside className="holyrics-guide card">
          <h2>Antes de começar</h2>
          <ol>
            <li><span>1</span><div><strong>Abra o Holyrics</strong><small>No computador usado pela igreja.</small></div></li>
            <li><span>2</span><div><strong>Ative o servidor da API</strong><small>Em Arquivo → Configurações → API Server.</small></div></li>
            <li><span>3</span><div><strong>Informe os dados</strong><small>Preencha ao lado e teste a conexão.</small></div></li>
          </ol>
          <p className="holyrics-guide-note"><AppIcon name="check" /> As músicas devem existir na biblioteca do Holyrics.</p>
        </aside>

        <form className="card holyrics-form" onSubmit={handleSave}>
          <div className="holyrics-form-heading">
            <span><AppIcon name="settings" /></span>
            <div><h2>Dados da conexão</h2><p>Escolha como este computador acessará o Holyrics.</p></div>
          </div>

          <div className="holyrics-feedback" aria-live="polite">
            {error && <p className="error-message" role="alert">{error}</p>}
            {success && <p className="success-message"><AppIcon name="check" />{success}</p>}
            {testMessage && <p className="success-message"><AppIcon name="check" />{testMessage}</p>}
          </div>

          <div className="form-group holyrics-field">
            <label>Como deseja conectar?</label>
            <div className="mode-toggle">
              <button
                type="button"
                className={form.mode === 'local' ? 'active' : ''}
                onClick={() => setForm((prev) => ({ ...prev, mode: 'local' }))}
              >
                <AppIcon name="panels" />
                <span><strong>Neste computador</strong><small>PC da igreja</small></span>
              </button>
              <button
                type="button"
                className={form.mode === 'internet' ? 'active' : ''}
                onClick={() => setForm((prev) => ({ ...prev, mode: 'internet' }))}
              >
                <AppIcon name="link" />
                <span><strong>Pela internet</strong><small>API do Holyrics</small></span>
              </button>
            </div>
          </div>

          {form.mode === 'local' ? (
            <>
              <div className="holyrics-row">
                <div className="form-group holyrics-field">
                  <label htmlFor="host">IP ou endereço do computador</label>
                  <input
                    id="host"
                    value={form.host}
                    onChange={(e) => setForm((prev) => ({ ...prev, host: e.target.value }))}
                    placeholder="127.0.0.1"
                    required
                  />
                </div>
                <div className="form-group holyrics-field">
                  <label htmlFor="port">Porta</label>
                  <input
                    id="port"
                    type="number"
                    value={form.port}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, port: Number(e.target.value) || 0 }))
                    }
                    placeholder="8091"
                    required
                  />
                </div>
              </div>
              <p className="hint">
                Se o Holyrics está neste mesmo computador, mantenha <code>127.0.0.1</code>.
              </p>
            </>
          ) : (
            <>
              <div className="form-group holyrics-field">
                <label htmlFor="apiKey">Chave da API</label>
                <input
                  id="apiKey"
                  value={form.apiKey}
                  onChange={(e) => setForm((prev) => ({ ...prev, apiKey: e.target.value }))}
                  placeholder="Cole a API Key do Holyrics"
                  required
                />
              </div>
              <p className="hint">Use a chave exibida na tela API Server do Holyrics.</p>
            </>
          )}

          <div className="form-group holyrics-field">
            <label htmlFor="token">Token de acesso</label>
            <input
              id="token"
              value={form.token}
              onChange={(e) => setForm((prev) => ({ ...prev, token: e.target.value }))}
              placeholder="Cole o token criado em Gerenciar permissões"
              required
            />
            <small><AppIcon name="lock" /> O token é usado somente para acessar o Holyrics.</small>
          </div>

          <div className="holyrics-actions">
            <button type="button" className="btn btn-secondary" onClick={handleTest} disabled={testing}>
              <AppIcon name="check" /> {testing ? 'Testando...' : 'Testar conexão'}
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              <AppIcon name="settings" /> {saving ? 'Salvando...' : 'Salvar configuração'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
