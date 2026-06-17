import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MonitorDashboard from './components/MonitorDashboard';
import './App.css';

export default function App() {
  return (
    <Router>
      <Routes>
        {/* main dashboard route */}
        <Route path="/" element={<MonitorDashboard />} />

        {/* fallback — redirect anything unknown back to home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}