import React, { useState, useEffect } from 'react';
import { ipc } from '../utils/ipc';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';

export default function Users() {
    const [users, setUsers] = useState<{ id: number; username: string; rol: string; empleado_id: number | null; empleado_nombre: string | null; fecha_creacion: string }[]>([]);
    const [empleados, setEmpleados] = useState<{ id: number; nombre: string }[]>([]);
    const [loading, setLoading] = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);

    const [editingUser, setEditingUser] = useState<number | null>(null);
    const [formData, setFormData] = useState<{
        username: string;
        password: string;
        rol: 'Admin' | 'Empleado';
        empleado_id: number | '';
    }>({
        username: '',
        password: '',
        rol: 'Empleado',
        empleado_id: ''
    });
    const [formError, setFormError] = useState('');

    useEffect(() => {
        loadUsers();
        ipc.invoke('get-empleados').then((data: any[]) => setEmpleados(data)).catch(console.error);
    }, []);

    const loadUsers = async () => {
        setLoading(true);
        try {
            const data = await ipc.invoke('get-usuarios');
            setUsers(data);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const handleOpenModal = (user: any = null) => {
        setFormError('');
        if (user) {
            setEditingUser(user.id);
            setFormData({
                username: user.username,
                password: '',
                rol: user.rol,
                empleado_id: user.empleado_id ?? ''
            });
        } else {
            setEditingUser(null);
            setFormData({
                username: '',
                password: '',
                rol: 'Empleado',
                empleado_id: ''
            });
        }
        setIsModalOpen(true);
    };

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');

        if (!formData.username.trim()) {
            setFormError('El nombre de usuario es requerido.');
            return;
        }

        if (!editingUser && !formData.password.trim()) {
            setFormError('La contraseña es requerida para nuevos usuarios.');
            return;
        }

        try {
            if (editingUser) {
                const res = await ipc.invoke('update-usuario', { id: editingUser, ...formData });
                if (!res.success) throw new Error(res.error);
            } else {
                const res = await ipc.invoke('save-usuario', formData);
                if (!res.success) {
                    setFormError(res.error || 'Error al guardar el usuario.');
                    return;
                }
            }
            setIsModalOpen(false);
            loadUsers();
        } catch (error: any) {
            console.error(error);
            setFormError(error.message || 'Ocurrió un error inesperado al guardar.');
        }
    };

    const handleDelete = async (id: number, username: string) => {
        if (window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${username}? Esta acción no se puede deshacer.`)) {
            try {
                const res = await ipc.invoke('delete-usuario', id);
                if (res.success) {
                    loadUsers();
                } else {
                    alert(res.error || 'Error al eliminar el usuario.');
                }
            } catch (error) {
                console.error(error);
                alert('No se pudo conectar con la base de datos.');
            }
        }
    };

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800">
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <AdminPanelSettingsIcon className="text-emerald-600" />
                        Administración de Usuarios
                    </h1>
                    <p className="text-sm text-slate-500 mt-1">Crea y gestiona las credenciales de acceso para tus empleados.</p>
                </div>
                <button
                    onClick={() => handleOpenModal()}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/30 active:scale-95"
                >
                    <AddIcon fontSize="small" />
                    <span>Nuevo Usuario</span>
                </button>
            </div>

            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 flex-1 overflow-hidden flex flex-col">
                <div className="overflow-x-auto flex-1">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 z-10">
                            <tr className="border-b border-slate-100 text-[11px] font-black text-slate-400 uppercase tracking-widest bg-slate-50/80 backdrop-blur-md">
                                <th className="px-6 py-4">Usuario</th>
                                <th className="px-6 py-4">Empleado Vinculado</th>
                                <th className="px-6 py-4">Rol</th>
                                <th className="px-6 py-4 text-right">Acciones</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr>
                                    <td colSpan={3} className="px-6 py-12 text-center text-slate-400">Cargando...</td>
                                </tr>
                            ) : users.map((u) => (
                                <tr key={u.id} className="hover:bg-slate-50/50 transition-colors group">
                                    <td className="px-6 py-4">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                                                <PersonIcon fontSize="small" />
                                            </div>
                                            <p className="text-sm font-bold text-slate-700 leading-tight">{u.username}</p>
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        {u.empleado_nombre
                                            ? <span className="text-sm font-semibold text-slate-700">{u.empleado_nombre}</span>
                                            : <span className="text-xs text-slate-400 italic">Sin vincular</span>
                                        }
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className={`text-[10px] font-black uppercase px-2 py-1 rounded-full ${u.rol === 'Admin' ? 'bg-primary-50 text-primary-600' : 'bg-emerald-50 text-emerald-600'}`}>
                                            {u.rol}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => handleOpenModal(u)}
                                                className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-slate-600 flex items-center justify-center hover:bg-emerald-600 hover:text-white hover:border-emerald-600 transition-all shadow-sm active:scale-90"
                                            >
                                                <EditIcon fontSize="small" />
                                            </button>
                                            <button
                                                onClick={() => handleDelete(u.id, u.username)}
                                                disabled={u.username === 'Principal'}
                                                title={u.username === 'Principal' ? 'El usuario Principal no puede ser eliminado.' : 'Eliminar Usuario'}
                                                className="w-9 h-9 rounded-xl bg-white border border-slate-200 text-rose-500 flex items-center justify-center hover:bg-rose-600 hover:text-white hover:border-rose-600 transition-all shadow-sm active:scale-90 disabled:opacity-30 disabled:hover:bg-white disabled:hover:text-rose-500 disabled:hover:border-slate-200"
                                            >
                                                <DeleteIcon fontSize="small" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
                    <div className="bg-white w-full max-w-sm rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
                            <h2 className="text-xl font-bold text-slate-800">
                                {editingUser ? 'Editar Usuario' : 'Nuevo Usuario'}
                            </h2>
                            <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400">
                                <CloseIcon />
                            </button>
                        </div>

                        <form onSubmit={handleSave} className="p-6 space-y-4">
                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Nombre de Usuario</label>
                                <input
                                    required
                                    type="text"
                                    disabled={formData.username === 'Principal'} // Protected from rename
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all font-bold text-slate-700 disabled:opacity-50"
                                    value={formData.username}
                                    autoComplete="off"
                                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">
                                    {editingUser ? 'Nueva Contraseña (dejar en blanco para no cambiar)' : 'Contraseña'}
                                </label>
                                <input
                                    type="password"
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all font-bold text-slate-700"
                                    value={formData.password}
                                    autoComplete="new-password"
                                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Nivel de Acceso</label>
                                <div className="flex gap-2">
                                    <select
                                        className="flex-1 px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all font-bold text-slate-700 appearance-none disabled:opacity-50"
                                        value={formData.rol}
                                        disabled={formData.username === 'Principal'} // Cannot demote root admin
                                        onChange={(e) => setFormData({ ...formData, rol: e.target.value as 'Admin' | 'Empleado' })}
                                    >
                                        <option value="Admin">Administrador (Total)</option>
                                        <option value="Empleado">Empleado (Solo Ventas y Stock)</option>
                                    </select>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[11px] font-black uppercase text-slate-400 mb-1 ml-1">Empleado Vinculado (para el Ticket)</label>
                                <select
                                    className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl outline-none focus:ring-4 focus:ring-emerald-50 focus:border-emerald-400 transition-all font-bold text-slate-700 appearance-none"
                                    value={formData.empleado_id}
                                    onChange={(e) => setFormData({ ...formData, empleado_id: e.target.value === '' ? '' : Number(e.target.value) })}
                                >
                                    <option value="">-- Sin vincular (usar nombre de usuario) --</option>
                                    {empleados.map(emp => (
                                        <option key={emp.id} value={emp.id}>{emp.nombre}</option>
                                    ))}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1 ml-1">Si se vincula, el ticket imprimirá el nombre real del empleado.</p>
                            </div>

                            {formError && (
                                <p className="text-red-500 text-sm mt-2 text-center font-semibold">{formError}</p>
                            )}

                            <div className="pt-4 border-t border-slate-100 flex gap-3">
                                <button type="button" onClick={() => setIsModalOpen(false)} className="flex-1 px-4 py-3 rounded-xl font-bold text-slate-500 bg-slate-100 hover:bg-slate-200 transition-colors">
                                    Cancelar
                                </button>
                                <button type="submit" className="flex-1 px-4 py-3 rounded-xl font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-500/30">
                                    Guardar
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
