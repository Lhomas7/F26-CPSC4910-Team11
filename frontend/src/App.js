import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { DriverList, DriverDetail } from './components/Drivers';
import AboutPage from './components/AboutPage';
import './App.css';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app-shell">
        <header className="site-header">
          <Link className="brand" to="/">Good Driver</Link>
          <nav aria-label="Primary navigation">
            <Link to="/">Drivers</Link>
            <Link to="/about">About</Link>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<DriverList />} />
          <Route path="/drivers/:driverId" element={<DriverDetail />} />
          <Route path="/about" element={<AboutPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
