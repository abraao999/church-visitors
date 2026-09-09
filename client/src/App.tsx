import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider } from './auth/AuthContext';
import { BrandingProvider } from './theme/BrandingContext';
import { ChurchBrandingPage } from './pages/ChurchBrandingPage';
import { Layout } from './components/Layout';
import { PermissionRoute } from './components/PermissionRoute';
import { ProtectedRoute } from './components/ProtectedRoute';
import { HomePage } from './pages/HomePage';
import { GuestAccessesPage } from './pages/GuestAccessesPage';
import { HolyricsSettingsPage } from './pages/HolyricsSettingsPage';
import { ChurchSettingsPage } from './pages/ChurchSettingsPage';
import { ForbiddenPage } from './pages/ForbiddenPage';
import { InviteAcceptPage } from './pages/InviteAcceptPage';
import { TeamMemberPage } from './pages/TeamMemberPage';
import { TeamPage } from './pages/TeamPage';
import { LivePrayerPage } from './pages/LivePrayerPage';
import { LoginPage } from './pages/LoginPage';
import { PanelsPage } from './pages/PanelsPage';
import { HymnsPanelPage } from './pages/panels/HymnsPanelPage';
import { LegacyPanelRedirect } from './pages/panels/LegacyPanelRedirect';
import { PanelAccessMenu } from './pages/panels/PanelAccessMenu';
import { VehicleNoticesPanelPage } from './pages/panels/VehicleNoticesPanelPage';
import { WorshipPanelPage } from './pages/panels/WorshipPanelPage';
import { PrayerRequestsPage } from './pages/PrayerRequestsPage';
import { PublicAccessPage } from './pages/PublicAccessPage';
import { RecurrenceSeriesPage } from './pages/RecurrenceSeriesPage';
import { ServiceOccurrencePage } from './pages/ServiceOccurrencePage';
import { ServicesPage } from './pages/ServicesPage';
import { VehicleNoticesPage } from './pages/VehicleNoticesPage';
import { VisitorsPage } from './pages/VisitorsPage';
import { FollowUpPage } from './pages/FollowUpPage';
import { ReportsPage } from './pages/ReportsPage';
import { PortariaApp } from './portaria/PortariaApp';

export function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <BrandingProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/acesso/:token" element={<PublicAccessPage />} />
          <Route path="/acesso/:token/visitantes" element={<PublicAccessPage />} />
          <Route path="/acesso/:token/oracao" element={<PublicAccessPage />} />
          <Route path="/acesso/:token/veiculos" element={<PublicAccessPage />} />
          {/* Painéis por link de leitura: abrem na TV sem sessão de responsável. */}
          <Route path="/painel/:token" element={<PanelAccessMenu />} />
          <Route path="/painel/:token/louvores" element={<HymnsPanelPage />} />
          <Route path="/painel/:token/culto" element={<WorshipPanelPage />} />
          <Route path="/painel/:token/visitantes" element={<LegacyPanelRedirect />} />
          <Route path="/painel/:token/oracao" element={<LegacyPanelRedirect />} />
          <Route path="/painel/:token/veiculos" element={<VehicleNoticesPanelPage />} />
          <Route path="/convite/:token" element={<InviteAcceptPage />} />
          <Route path="/portaria/*" element={<PortariaApp />} />
          <Route path="/live/oracao" element={<Layout />}>
            <Route index element={<LivePrayerPage />} />
          </Route>
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/" element={<HomePage />} />
              <Route element={<PermissionRoute anyOf={['visitors:read', 'visitors:create']} />}>
                <Route path="/visitantes" element={<VisitorsPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['follow_up:read']} requireFollowUp />}>
                <Route path="/acompanhamento" element={<FollowUpPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['prayers:read', 'prayers:create']} />}>
                <Route path="/oracao" element={<PrayerRequestsPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['reports:read']} />}>
                <Route path="/relatorios" element={<ReportsPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['guest_accesses:read']} />}>
                <Route path="/acessos" element={<GuestAccessesPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['services:read']} />}>
                <Route path="/cultos" element={<ServicesPage />} />
                <Route path="/cultos/serie/:seriesId" element={<RecurrenceSeriesPage />} />
                <Route path="/cultos/:serviceId" element={<ServiceOccurrencePage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['vehicle_notices:read']} />}>
                <Route path="/avisos-veiculos" element={<VehicleNoticesPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['church:read', 'team:read']} />}>
                <Route path="/igreja" element={<ChurchSettingsPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['church:update']} />}>
                <Route path="/igreja/identidade" element={<ChurchBrandingPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['team:read']} />}>
                <Route path="/igreja/equipe" element={<TeamPage />} />
                <Route path="/igreja/equipe/:memberId" element={<TeamMemberPage />} />
              </Route>
              <Route path="/sem-acesso" element={<ForbiddenPage />} />
              <Route element={<PermissionRoute anyOf={['holyrics:read', 'holyrics:configure']} />}>
                <Route path="/configuracoes" element={<HolyricsSettingsPage />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['panels:open', 'prayers:project']} />}>
                <Route path="/paineis/culto" element={<WorshipPanelPage />} />
                <Route path="/painel/oracao" element={<LegacyPanelRedirect />} />
              </Route>
              <Route element={<PermissionRoute anyOf={['panels:open']} />}>
                <Route path="/paineis" element={<PanelsPage />} />
                <Route path="/painel/louvores" element={<HymnsPanelPage />} />
                <Route path="/painel/visitantes" element={<LegacyPanelRedirect />} />
                <Route path="/painel/veiculos" element={<VehicleNoticesPanelPage />} />
              </Route>
            </Route>
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </BrandingProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
