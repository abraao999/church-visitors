import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api/client';
import type { PrayerRequest, Visitor } from '../types';
import './HomePage.css';

export function HomePage() {
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [prayers, setPrayers] = useState<PrayerRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const [v, p] = await Promise.all([api.getVisitors(), api.getPrayerRequests()]);
      setVisitors(v);
      setPrayers(p);
    } catch {
      // silently fail on dashboard
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 30000);
    return () => clearInterval(interval);
  }, [loadData]);

  const liveLink = `${window.location.origin}/live/oracao`;

  function copyLiveLink() {
    navigator.clipboard.writeText(liveLink);
  }

  return (
    <div className="home-page">
      <section className="hero card">
        <h1>Painel da Portaria</h1>
        <p>Bem-vindo! Gerencie visitantes e pedidos de oração do culto de hoje.</p>
      </section>

      <section className="stats-grid">
        <div className="stat-card card">
          <span className="stat-number">{loading ? '—' : visitors.length}</span>
          <span className="stat-label">Famílias visitantes</span>
          <Link to="/visitantes" className="stat-link">Gerenciar →</Link>
        </div>
        <div className="stat-card card">
          <span className="stat-number">{loading ? '—' : prayers.length}</span>
          <span className="stat-label">Pedidos de oração</span>
          <Link to="/oracao" className="stat-link">Gerenciar →</Link>
        </div>
      </section>

      <section className="live-link-card card">
        <h2>Link da Live</h2>
        <p>Compartilhe este link para que quem assiste online possa enviar pedidos de oração:</p>
        <div className="live-link-box">
          <code>{liveLink}</code>
          <button type="button" className="btn btn-secondary" onClick={copyLiveLink}>
            Copiar link
          </button>
        </div>
      </section>

      <section className="quick-actions">
        <Link to="/visitantes" className="action-card card">
          <span className="action-icon">👨‍👩‍👧‍👦</span>
          <h3>Registrar visitantes</h3>
          <p>Cadastre famílias e membros que chegaram hoje.</p>
        </Link>
        <Link to="/oracao" className="action-card card">
          <span className="action-icon">🙏</span>
          <h3>Pedidos de oração</h3>
          <p>Registre e visualize pedidos do culto.</p>
        </Link>
      </section>
    </div>
  );
}
