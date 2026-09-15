import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { DriverList, DriverDetail } from './components/Drivers';
import Login from './components/Login';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />

        <Route path="/drivers" element={<DriverList />} />
        <Route path="/drivers/:driverId" element={<DriverDetail />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
