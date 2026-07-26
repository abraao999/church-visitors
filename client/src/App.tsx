import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { LivePrayerPage } from './pages/LivePrayerPage';
import { PrayerRequestsPage } from './pages/PrayerRequestsPage';
import { VisitorsPage } from './pages/VisitorsPage';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/visitantes" element={<VisitorsPage />} />
          <Route path="/oracao" element={<PrayerRequestsPage />} />
          <Route path="/live/oracao" element={<LivePrayerPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
