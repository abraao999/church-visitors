import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { Layout } from './components/Layout';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { GuestAccessesPage } from './pages/GuestAccessesPage';
import { HolyricsSettingsPage } from './pages/HolyricsSettingsPage';
import { LivePrayerPage } from './pages/LivePrayerPage';
import { LoginPage } from './pages/LoginPage';
import { PanelsPage } from './pages/PanelsPage';
import { HymnsPanelPage } from './pages/panels/HymnsPanelPage';
import { PrayersPanelPage } from './pages/panels/PrayersPanelPage';
import { VisitorsPanelPage } from './pages/panels/VisitorsPanelPage';
import { PrayerRequestsPage } from './pages/PrayerRequestsPage';
import { PublicAccessPage } from './pages/PublicAccessPage';
import { ServicesPage } from './pages/ServicesPage';
import { VisitorsPage } from './pages/VisitorsPage';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/acesso/:token" element={<PublicAccessPage />} />
          <Route path="/live/oracao" element={<Layout />}>
            <Route index element={<LivePrayerPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route path="/visitantes" element={<VisitorsPage />} />
              <Route path="/oracao" element={<PrayerRequestsPage />} />
              <Route path="/acessos" element={<GuestAccessesPage />} />
              <Route path="/cultos" element={<ServicesPage />} />
              <Route path="/configuracoes" element={<HolyricsSettingsPage />} />
              <Route path="/paineis" element={<PanelsPage />} />
              <Route path="/painel/louvores" element={<HymnsPanelPage />} />
              <Route path="/painel/visitantes" element={<VisitorsPanelPage />} />
              <Route path="/painel/oracao" element={<PrayersPanelPage />} />
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
