import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { DriverList, DriverDetail } from './components/Drivers';

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<DriverList />} />
        <Route path="/drivers/:driverId" element={<DriverDetail />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;