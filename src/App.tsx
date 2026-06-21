import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Layout from '@/components/Layout';
import Dashboard from '@/pages/Dashboard';
import Configs from '@/pages/Configs';
import Encryption from '@/pages/Encryption';
import Logs from '@/pages/Logs';
import Clients from '@/pages/Clients';
import LogAnalysis from '@/pages/LogAnalysis';
import AlertConfig from '@/pages/AlertConfig';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/configs" element={<Configs />} />
          <Route path="/encryption" element={<Encryption />} />
          <Route path="/logs" element={<Logs />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/analysis" element={<LogAnalysis />} />
          <Route path="/alerts" element={<AlertConfig />} />
        </Route>
      </Routes>
    </Router>
  );
}
