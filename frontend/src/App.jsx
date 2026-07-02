import { Routes, Route } from 'react-router-dom';
import Navbar from './components/Navbar';
import SOSFab from './components/SOSFab';
import ChatWidget from './components/ChatWidget';
import Home from './pages/Home';
import MapPage from './pages/MapPage';
import SafeRoute from './pages/SafeRoute';
import Report from './pages/Report';
import Incidents from './pages/Incidents';
import SOS from './pages/SOS';
import Track from './pages/Track';
import Auth from './pages/Auth';
import Profile from './pages/Profile';
import Admin from './pages/Admin';
import NotFound from './pages/NotFound';

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/map" element={<MapPage />} />
          <Route path="/route" element={<SafeRoute />} />
          <Route path="/report" element={<Report />} />
          <Route path="/incidents" element={<Incidents />} />
          <Route path="/sos" element={<SOS />} />
          <Route path="/track/:token" element={<Track />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <SOSFab />
      <ChatWidget />
    </>
  );
}
