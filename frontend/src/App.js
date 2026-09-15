import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router-dom';
import { DriverList, DriverDetail } from './components/Drivers';
import AboutPage from './components/AboutPage';
import './App.css';

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <div className="app-shell">
        <a className="skip-link" href="#main-content">Skip to content</a>
        <aside className="site-sidebar">
          <Link className="brand" to="/" aria-label="Good Driver home">
            <span className="brand-mark" aria-hidden="true" />
            <span className="brand-name">Good Driver</span>
          </Link>
          <nav className="site-nav" aria-label="Primary navigation">
            <NavLink to="/" end>
              <span className="nav-icon" aria-hidden="true" />
              Drivers
            </NavLink>
            <NavLink to="/about">
              <span className="nav-icon" aria-hidden="true" />
              About
            </NavLink>
          </nav>
        </aside>
        <div className="app-main" id="main-content" tabIndex="-1">
          <Routes>
            <Route path="/" element={<DriverList />} />
            <Route path="/drivers/:driverId" element={<DriverDetail />} />
            <Route path="/about" element={<AboutPage />} />
          </Routes>
        </div>
      </div>
    </BrowserRouter>
  );
}

export default App;
