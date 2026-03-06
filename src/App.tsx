import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Clients from './pages/Clients';
import Finance from './pages/Finance';
import Providers from './pages/Providers';
import Branches from './pages/Branches';

function App() {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="pos" element={<POS />} />
          <Route path="inventario" element={<Inventory />} />
          <Route path="clientes" element={<Clients />} />
          <Route path="proveedores" element={<Providers />} />
          <Route path="caja" element={<Finance />} />
          <Route path="sucursales" element={<Branches />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}

export default App;
