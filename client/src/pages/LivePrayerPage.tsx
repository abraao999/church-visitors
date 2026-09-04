import { AppIcon } from '../components/AppIcon';
import { ThemeToggle } from '../components/ThemeToggle';
import './LivePrayerPage.css';

export function LivePrayerPage() {
  return (
    <main className="live-page">
      <div className="live-header">
        <span className="live-brand">
          <span className="live-brand-cross">✝</span>
          Church Visitors
          <ThemeToggle compact />
        </span>
        <span className="live-badge live-badge-paused">Acesso encerrado</span>
        <span className="live-prayer-icon"><AppIcon name="lock" /></span>
        <h1>Este acesso não é mais válido</h1>
        <p>
          Para proteger os pedidos da sua igreja, cada acesso agora precisa de um link seguro.
        </p>
      </div>
      <div className="live-unavailable-card card">
        <h2>Solicite um novo link</h2>
        <p>Peça à equipe da sua igreja o QR Code ou o endereço atualizado para enviar seu pedido.</p>
      </div>
      <p className="live-footer-note"><AppIcon name="lock" /> Seus dados continuam protegidos</p>
    </main>
  );
}
