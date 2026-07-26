import { PrayerForm } from '../components/PrayerForm';
import './LivePrayerPage.css';

export function LivePrayerPage() {
  return (
    <div className="live-page card">
      <div className="live-header">
        <span className="live-badge">🔴 Ao vivo</span>
        <h1>Pedido de Oração</h1>
        <p>
          Envie seu pedido de oração. Nossa equipe irá compartilhar com a igreja durante o culto.
        </p>
      </div>
      <PrayerForm source="live" compact />
    </div>
  );
}
