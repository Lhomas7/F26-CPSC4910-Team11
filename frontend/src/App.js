import { BrowserRouter } from 'react-router-dom';

import { AppRoutes } from './app/AppRoutes';
import { AuthProvider } from './auth/AuthContext';

function App() {
  return (
    <AuthProvider>
      <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AppRoutes />
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
