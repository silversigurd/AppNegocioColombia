import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Inventory from './pages/Inventory';
import POS from './pages/POS';
import Clients from './pages/Clients';
import Finance from './pages/Finance';
import Providers from './pages/Providers';
import Branches from './pages/Branches';
import LockIcon from '@mui/icons-material/Lock';
import { ipc } from './utils/ipc';

function App() {
  const [isActivated, setIsActivated] = useState<boolean | null>(null);
  const [machineId, setMachineId] = useState<string>('');
  const [activationKey, setActivationKey] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkLicenseStatus();
  }, []);

  const checkLicenseStatus = async () => {
    try {
      const result = await ipc.invoke('check-license');
      setIsActivated(result.activated);
      setMachineId(result.machineId);
    } catch (error) {
      console.error("Failed to check license:", error);
      setIsActivated(false);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async () => {
    setErrorMsg('');
    if (!activationKey.trim()) {
      setErrorMsg('Por favor, ingresa una llave de activación.');
      return;
    }

    setLoading(true);
    try {
      const result = await ipc.invoke('activate-license', activationKey);
      if (result.success) {
        setIsActivated(true);
      } else {
        setErrorMsg(result.error || 'Llave inválida. Verifica e intenta nuevamente.');
      }
    } catch (error) {
      setErrorMsg('Error fatal al verificar la llave.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
      </div>
    );
  }

  if (isActivated === false) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white p-4">
        <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md flex flex-col items-center">
          <div className="bg-red-500/20 p-4 rounded-full mb-6">
            <LockIcon className="text-red-500 w-12 h-12" style={{ fontSize: 48 }} />
          </div>

          <h1 className="text-2xl font-bold mb-2">Sistema Bloqueado</h1>
          <p className="text-slate-400 text-center mb-6 text-sm">
            Esta copia de <span className="text-emerald-400 font-semibold">CommerceOS Pro</span> no está activada o se ha detectado un cambio de hardware.
          </p>

          <div className="w-full bg-slate-900 rounded-lg p-4 mb-6 border border-slate-700 text-center">
            <p className="text-xs text-slate-500 uppercase font-semibold mb-1">Tu Código de Solicitud (Hardware ID)</p>
            <p className="text-xl font-mono text-emerald-400 select-all">{machineId}</p>
            <p className="text-xs text-slate-500 mt-2">Envía este código al desarrollador para obtener tu llave.</p>
          </div>

          <div className="w-full mb-6 relative">
            <label className="block text-sm font-medium mb-2 text-slate-300">Llave de Activación</label>
            <input
              type="text"
              value={activationKey}
              onChange={(e) => setActivationKey(e.target.value.toUpperCase())}
              className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white font-mono placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-colors uppercase tracking-widest text-center"
              placeholder="XXXX-XXXX-XXXX-XXXX"
            />
            {errorMsg && (
              <p className="text-red-400 text-sm mt-2 text-center">{errorMsg}</p>
            )}
          </div>

          <button
            onClick={handleActivate}
            disabled={loading || !activationKey.trim()}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 px-4 rounded-lg transition-colors flex justify-center items-center"
          >
            {loading ? 'Verificando...' : 'Desbloquear Sistema'}
          </button>
        </div>
      </div>
    );
  }

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
