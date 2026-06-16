import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import MonitorDashboard from './components/MonitorDashboard';

function MainPage() {
  return(
    <Router>
      <Routes>
        {/*routes the path | tailwind configured at the component level*/} 
        <Route path="/" element ={<MonitorDashboard />} />

        {/*fallback route*/}
        <Route path="*" element={<Navigate to="/" replace/>} />
      </Routes>
    </Router>
  ); 
}

export default MainPage;