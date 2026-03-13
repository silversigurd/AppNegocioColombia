import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ipc } from '../utils/ipc';
import StorefrontIcon from '@mui/icons-material/Storefront';

const Login: React.FC = () => {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const navigate = useNavigate();
    const { login } = useAuth();

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');

        if (!username.trim() || !password.trim()) {
            setError('Por favor, ingresa usuario y contraseña.');
            return;
        }

        setLoading(true);
        try {
            const response = await ipc.invoke('login', username, password);
            if (response.success) {
                login(response.user);
                navigate('/');
            } else {
                setError(response.error || 'Credenciales inválidas.');
            }
        } catch (err) {
            console.error(err);
            setError('Error de conexión con la base de datos.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white p-4">
            <div className="bg-slate-800 p-8 rounded-2xl shadow-2xl border border-slate-700 w-full max-w-md flex flex-col items-center z-10 relative">
                <div className="bg-emerald-500/20 p-4 rounded-full mb-6">
                    <StorefrontIcon className="text-emerald-500 w-12 h-12" style={{ fontSize: 48 }} />
                </div>

                <h1 className="text-2xl font-bold mb-2">CommerceOS Pro</h1>
                <p className="text-slate-400 text-center mb-6 text-sm">
                    Inicia sesión para acceder a tu sistema.
                </p>

                <form onSubmit={handleLogin} className="w-full flex flex-col gap-4">
                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-300">Usuario</label>
                        <input
                            type="text"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            placeholder="Ej. Principal"
                            autoComplete="username"
                        />
                    </div>

                    <div>
                        <label className="block text-sm font-medium mb-1 text-slate-300">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
                            placeholder="••••••••"
                            autoComplete="current-password"
                        />
                    </div>

                    {error && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                            <p className="text-red-400 text-sm text-center">{error}</p>
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {loading ? 'Ingresando...' : 'Iniciar Sesión'}
                    </button>
                </form>
            </div>
        </div>
    );
};

export default Login;
