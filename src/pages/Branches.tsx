import { useState, useEffect } from 'react';
import AddIcon from '@mui/icons-material/Add';
import EditIcon from '@mui/icons-material/Edit';
import DeleteIcon from '@mui/icons-material/Delete';
import CloseIcon from '@mui/icons-material/Close';
import PersonIcon from '@mui/icons-material/Person';
import ManageAccountsIcon from '@mui/icons-material/ManageAccounts';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import ReceiptIcon from '@mui/icons-material/Receipt';
import SaveIcon from '@mui/icons-material/Save';
import PictureAsPdfIcon from '@mui/icons-material/PictureAsPdf';

import { ipc } from '../utils/ipc';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface Empleado {
    id?: number;
    nombre: string;
    cargo: string;
    dni: string;
    cuil: string;
    direccion: string;
    partido: string;
    localidad: string;
    obra_social: string;
    fecha_ingreso: string;
    categoria_cct: string;
    sueldo_basico: number;
    jornada_laboral: string;
    contrato_filepath?: string;
}

export default function Branches() {
    const [empleados, setEmpleados] = useState<Empleado[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [isPayrollOpen, setIsPayrollOpen] = useState(false);
    const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
    const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
    const [payrollPreview, setPayrollPreview] = useState<any>(null);

    const [formData, setFormData] = useState<Empleado>({
        nombre: '', cargo: '', dni: '', cuil: '', direccion: '', partido: '',
        localidad: '', obra_social: '', fecha_ingreso: '', categoria_cct: '',
        sueldo_basico: 0, jornada_laboral: ''
    });

    useEffect(() => {
        loadEmpleados();
    }, []);

    const loadEmpleados = async () => {
        try {
            const data = await ipc.invoke('get-empleados', null);
            setEmpleados(data || []);
        } catch (error) {
            console.error("Error loading employees", error);
        }
    };

    const handleOpenForm = (emp: Empleado | null) => {
        if (emp) {
            setFormData(emp);
        } else {
            setFormData({
                nombre: '', cargo: '', dni: '', cuil: '', direccion: '', partido: '',
                localidad: '', obra_social: '', fecha_ingreso: '', categoria_cct: '',
                sueldo_basico: 0, jornada_laboral: 'Completa'
            });
        }
        setIsFormOpen(true);
    };

    const handleSaveEmpleado = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            if (formData.id) {
                await ipc.invoke('update-empleado', formData);
            } else {
                await ipc.invoke('save-empleado', formData);
            }
            setIsFormOpen(false);
            loadEmpleados();
        } catch (error) {
            alert('Error guardando empleado.');
            console.error(error);
        }
    };

    const handleDeleteEmpleado = async (id: number) => {
        if (confirm('¿Eliminar este empleado definitivamente?')) {
            await ipc.invoke('delete-empleado', id);
            loadEmpleados();
        }
    };

    const openAdminModal = async (emp: Empleado) => {
        setSelectedEmpleado(emp);
        setIsAdminOpen(true);
        if (emp.id) {
            const liqs = await ipc.invoke('get-liquidaciones-empleado', emp.id);
            setLiquidaciones(liqs || []);
        }
    };

    const handleUploadContrato = async () => {
        if (!selectedEmpleado || !selectedEmpleado.id) return;
        try {
            const res = await ipc.invoke('select-contrato-empleado', selectedEmpleado.id);
            if (res.success) {
                alert('Contrato adjuntado con éxito.');
                loadEmpleados();
                setSelectedEmpleado({ ...selectedEmpleado, contrato_filepath: res.filepath });
            }
        } catch (error) {
            alert('Error subiendo contrato.');
        }
    };

    const handleAbrirContrato = async () => {
        if (selectedEmpleado?.contrato_filepath) {
            const res = await ipc.invoke('abrir-archivo', selectedEmpleado.contrato_filepath);
            if (!res.success) {
                alert('No se pudo encontrar o abrir el archivo. ' + res.error);
            }
        }
    };

    const handleGenerarRecibo = () => {
        if (!selectedEmpleado) return;

        // Algoritmo de Liquidación
        const ingreso = new Date(selectedEmpleado.fecha_ingreso);
        const ahora = new Date();
        const difTiempo = Math.abs(ahora.getTime() - ingreso.getTime());
        const anios = Math.floor(difTiempo / (1000 * 3600 * 24 * 365.25));

        const basico = Number(selectedEmpleado.sueldo_basico) || 0;
        const antiguedad = basico * 0.01 * anios;
        const presentismo = (basico + antiguedad) * 0.0833;

        const totalRemunerativo = basico + antiguedad + presentismo;

        // Sumas No Remunerativas (Acuerdo Dic 2025 - Mar 2026)
        const sumaNoRem1 = 60000;
        const sumaNoRem2 = 40000;
        const totalNoRemunerativo = sumaNoRem1 + sumaNoRem2;

        const totalBruto = totalRemunerativo + totalNoRemunerativo;

        // Retenciones
        const jubilacion = totalRemunerativo * 0.11;
        const pami = totalRemunerativo * 0.03;
        const obraSocial = totalBruto * 0.03; // Calcula s/ Rem+NoRem en CCT 130/75
        const cuotaSindical = totalBruto * 0.02;
        const faecys = totalBruto * 0.005;
        const aporteSolidarioOS = 8500; // CAS OSECAC

        const totalRetenciones = jubilacion + pami + obraSocial + cuotaSindical + faecys + aporteSolidarioOS;
        const totalNeto = totalBruto - totalRetenciones;

        const conceptos = [
            { tipo: 'Remunerativo', descripcion: 'Sueldo Básico (Mes)', unidad: '30 días', importe: basico },
            { tipo: 'Remunerativo', descripcion: 'Antigüedad (1%)', unidad: `${anios} años`, importe: antiguedad },
            { tipo: 'Remunerativo', descripcion: 'Presentismo (Art 40)', unidad: '8.33%', importe: presentismo },
            { tipo: 'NoRemunerativo', descripcion: 'Asign. No Remunerativa Acuerdo 2025', unidad: 'Fijo', importe: sumaNoRem1 },
            { tipo: 'NoRemunerativo', descripcion: 'Asign. No Remunerativa Diciembre 2025', unidad: 'Fijo', importe: sumaNoRem2 },
            { tipo: 'Retencion', descripcion: 'Jubilación SIPA (11%)', unidad: '11%', importe: jubilacion },
            { tipo: 'Retencion', descripcion: 'Ley 19.032 PAMI (3%)', unidad: '3%', importe: pami },
            { tipo: 'Retencion', descripcion: 'Obra Social (3%)', unidad: '3%', importe: obraSocial },
            { tipo: 'Retencion', descripcion: 'Sindicato (2%)', unidad: '2%', importe: cuotaSindical },
            { tipo: 'Retencion', descripcion: 'FAECYS (0.5%)', unidad: '0.5%', importe: faecys },
            { tipo: 'Retencion', descripcion: 'Aporte Extra Ordinario OSECAC', unidad: 'Fijo', importe: aporteSolidarioOS },
        ];

        setPayrollPreview({
            periodo: ahora.toISOString().slice(0, 7), // YYYY-MM
            fecha_pago: ahora.toISOString().slice(0, 10),
            banco_deposito: 'Caja Fija',
            conceptos, totalBruto, totalRetenciones, totalNeto
        });
        setIsPayrollOpen(true);
    };

    const handleConfirmarLiquidacion = async () => {
        if (!selectedEmpleado || !selectedEmpleado.id || !payrollPreview) return;
        try {
            const data = {
                empleado_id: selectedEmpleado.id,
                periodo: payrollPreview.periodo,
                fecha_pago: payrollPreview.fecha_pago,
                banco_deposito: payrollPreview.banco_deposito,
                total_bruto: payrollPreview.totalBruto,
                total_retenciones: payrollPreview.totalRetenciones,
                total_neto: payrollPreview.totalNeto,
                conceptos: payrollPreview.conceptos
            };
            await ipc.invoke('save-liquidacion', data);

            // Generate PDF Format
            generatePDF(data, selectedEmpleado);

            setIsPayrollOpen(false);
            openAdminModal(selectedEmpleado); // Reload liqs
        } catch (e) {
            alert('Error al liquidar.');
        }
    };

    const generatePDF = (liq: any, emp: Empleado) => {
        const doc = new jsPDF('p', 'pt', 'a4');
        const drawRecibo = (startY: number, title: string) => {
            doc.setFontSize(10);
            doc.text(`Recibo de Sueldo - Ley 20.744 - Ejemplar: ${title}`, 40, startY + 20);
            doc.setFontSize(8);
            doc.text(`Empresa Ejemplo S.A. | CUIT: 30-00000000-0 | Domicilio Ficticio 123`, 40, startY + 35);
            doc.text(`Empleado: ${emp.nombre} | LEGAJO: ${emp.id} | CUIL: ${emp.cuil}`, 40, startY + 50);
            doc.text(`Categoría: ${emp.categoria_cct} | Ingreso: ${emp.fecha_ingreso} | Periodo: ${liq.periodo}`, 40, startY + 65);

            const tableData = liq.conceptos.map((c: any) => [
                c.descripcion,
                c.unidad,
                c.tipo === 'Remunerativo' ? `$${c.importe.toFixed(2)}` : '',
                c.tipo === 'NoRemunerativo' ? `$${c.importe.toFixed(2)}` : '',
                c.tipo === 'Retencion' ? `$${c.importe.toFixed(2)}` : ''
            ]);

            autoTable(doc, {
                startY: startY + 80,
                head: [['Concepto', 'Unidad/Porc', 'Remunerativo', 'No Remunerativo', 'Retenciones']],
                body: tableData,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: [79, 70, 229] }, // Indigo
                margin: { left: 40, right: 40 }
            });

            const finalY = (doc as any).lastAutoTable.finalY + 15;
            doc.setFontSize(9);
            doc.text(`TOTAL BRUTO: $${liq.total_bruto.toFixed(2)}`, 40, finalY);
            doc.text(`TOTAL RETENCIONES: $${liq.total_retenciones.toFixed(2)}`, 220, finalY);
            doc.text(`NETO A COBRAR: $${liq.total_neto.toFixed(2)}`, 400, finalY);

            doc.setFontSize(7);
            doc.text(`Firma Empleador ......................................`, 80, finalY + 40);
            doc.text(`Firma Empleado ......................................`, 350, finalY + 40);
            doc.text(`Art. 12 Ley 17250: Último depósito aportes mes ant.: Banco Nación. | No válido como recibo sin firma.`, 40, finalY + 60);
        };

        // Draw Duplicate and Original
        drawRecibo(20, 'EMPLEADOR');
        doc.setLineWidth(1);
        (doc as any).setLineDash([5, 5], 0);
        doc.line(40, 420, 550, 420); // Cut line
        (doc as any).setLineDash([], 0);
        drawRecibo(450, 'TRABAJADOR');

        doc.save(`ReciboSueldo_${emp.nombre.replace(/ /g, '_')}_${liq.periodo}.pdf`);
    };

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800">
            {/* Header */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Recursos Humanos</h1>
                    <p className="text-sm text-slate-500 mt-1">Gestión de Personal, Legajos y Liquidación de Sueldos (CCT 130/75)</p>
                </div>
                <button
                    onClick={() => handleOpenForm(null)}
                    className="flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-5 py-2.5 rounded-xl font-bold transition-all shadow-lg active:scale-95"
                >
                    <AddIcon fontSize="small" />
                    <span>Alta Empleado</span>
                </button>
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 overflow-y-auto pb-8">
                {empleados.map(emp => (
                    <div key={emp.id} className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 flex flex-col relative group hover:shadow-md transition-shadow">
                        <div className="absolute top-4 right-4 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => handleOpenForm(emp)} className="p-1.5 text-slate-400 hover:text-primary-600 bg-slate-50 rounded-lg"><EditIcon fontSize="small" /></button>
                            <button onClick={() => emp.id && handleDeleteEmpleado(emp.id)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-slate-50 rounded-lg"><DeleteIcon fontSize="small" /></button>
                        </div>

                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary-100 to-primary-50 flex items-center justify-center text-primary-600">
                                <PersonIcon fontSize="medium" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg leading-tight text-slate-800">{emp.nombre}</h3>
                                <p className="text-sm font-medium text-slate-500">{emp.categoria_cct || emp.cargo || 'Sin Categoría'}</p>
                            </div>
                        </div>

                        <div className="space-y-2 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-medium">CUIL</span>
                                <span className="font-mono text-slate-700">{emp.cuil || 'No registrado'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-medium">Básico</span>
                                <span className="font-bold text-slate-800">${emp.sueldo_basico?.toLocaleString('es-AR') || '0'}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-medium">Ingreso</span>
                                <span className="text-slate-700">{emp.fecha_ingreso || 'No registrado'}</span>
                            </div>
                        </div>

                        <button
                            onClick={() => openAdminModal(emp)}
                            className="mt-auto w-full py-2.5 bg-slate-50 hover:bg-primary-50 text-primary-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-colors border border-slate-100"
                        >
                            <ManageAccountsIcon fontSize="small" />
                            Administrar Empleado
                        </button>
                    </div>
                ))}
            </div>

            {/* Basic Info Form Modal */}
            {isFormOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between shrink-0">
                            <h2 className="text-xl font-bold">{formData.id ? 'Editar Empleado' : 'Alta de Nuevo Empleado'}</h2>
                            <button onClick={() => setIsFormOpen(false)} className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><CloseIcon /></button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            <form id="empForm" onSubmit={handleSaveEmpleado} className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre Completo</label>
                                    <input required type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">DNI</label>
                                    <input required type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.dni} onChange={e => setFormData({ ...formData, dni: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CUIL (Sin guiones)</label>
                                    <input required type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.cuil} onChange={e => setFormData({ ...formData, cuil: e.target.value })} />
                                </div>

                                <div className="col-span-2">
                                    <h4 className="font-bold text-primary-600 mt-4 border-b pb-2 mb-2">Datos Legales y de Convenio (CCT 130/75)</h4>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha de Ingreso (YYYY-MM-DD)</label>
                                    <input required type="date" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.fecha_ingreso} onChange={e => setFormData({ ...formData, fecha_ingreso: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Categoría CCT</label>
                                    <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.categoria_cct} onChange={e => setFormData({ ...formData, categoria_cct: e.target.value })}>
                                        <option value="">Seleccionar...</option>
                                        <option value="Vendedor A">Vendedor A</option>
                                        <option value="Vendedor B">Vendedor B</option>
                                        <option value="Cajero A">Cajero A</option>
                                        <option value="Cajero B">Cajero B</option>
                                        <option value="Administrativo A">Administrativo A</option>
                                        <option value="Maestranza A">Maestranza A</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sueldo Básico ($)</label>
                                    <input required type="number" step="0.01" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.sueldo_basico} onChange={e => setFormData({ ...formData, sueldo_basico: Number(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Jornada Laboral</label>
                                    <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.jornada_laboral} onChange={e => setFormData({ ...formData, jornada_laboral: e.target.value })}>
                                        <option value="Completa">Completa (200hs)</option>
                                        <option value="Media Jornada">Media Jornada</option>
                                        <option value="Parcial">Parcial (Específica)</option>
                                    </select>
                                </div>

                                <div className="col-span-2">
                                    <h4 className="font-bold text-primary-600 mt-4 border-b pb-2 mb-2">Contacto y Obra Social</h4>
                                </div>

                                <div className="col-span-2">
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección Completa</label>
                                    <input type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Localidad</label>
                                    <input type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.localidad} onChange={e => setFormData({ ...formData, localidad: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Obra Social</label>
                                    <input type="text" placeholder="Ej: OSECAC" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.obra_social} onChange={e => setFormData({ ...formData, obra_social: e.target.value })} />
                                </div>
                            </form>
                        </div>
                        <div className="p-4 border-t border-slate-100 flex gap-3 bg-white shrink-0">
                            <button onClick={() => setIsFormOpen(false)} className="flex-1 px-4 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">Cancelar</button>
                            <button form="empForm" type="submit" className="flex-1 px-4 py-3 bg-primary-600 text-white rounded-xl font-bold flex items-center justify-center gap-2"><SaveIcon fontSize="small" /> Guardar Legajo</button>
                        </div>
                    </div>
                </div>
            )}

            {/* Administrar Empleado Modal */}
            {isAdminOpen && selectedEmpleado && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-4xl h-[85vh] rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 flex flex-col">
                        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div className="flex items-center gap-4">
                                <div className="hidden sm:flex w-12 h-12 rounded-full bg-primary-100 text-primary-600 items-center justify-center"><PersonIcon /></div>
                                <div>
                                    <h2 className="text-xl font-bold">{selectedEmpleado.nombre}</h2>
                                    <p className="text-sm font-medium text-slate-500">Legajo y Liquidaciones | CUIL: {selectedEmpleado.cuil}</p>
                                </div>
                            </div>
                            <button onClick={() => setIsAdminOpen(false)} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-500"><CloseIcon /></button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6 bg-slate-50/30">

                            {/* Contract Section */}
                            <div className="bg-white border text-center border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col sm:flex-row items-center justify-between gap-4">
                                <div>
                                    <h4 className="font-bold text-lg flex items-center gap-2 justify-center sm:justify-start">
                                        <PictureAsPdfIcon className={selectedEmpleado.contrato_filepath ? 'text-rose-500' : 'text-slate-300'} />
                                        Contrato Laboral
                                    </h4>
                                    <p className="text-sm text-slate-500 mt-1">
                                        {selectedEmpleado.contrato_filepath ? 'Documento adjuntado.' : 'No se ha adjuntado un contrato firmado aún.'}
                                    </p>
                                </div>
                                <div className="flex gap-2 w-full sm:w-auto">
                                    {selectedEmpleado.contrato_filepath && (
                                        <button onClick={handleAbrirContrato} className="flex-1 sm:flex-none px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-sm font-bold shadow-sm">
                                            Ver PDF
                                        </button>
                                    )}
                                    <button onClick={handleUploadContrato} className="flex-1 sm:flex-none px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-sm">
                                        <CloudUploadIcon fontSize="small" /> Adjuntar
                                    </button>
                                </div>
                            </div>

                            {/* Payroll Section */}
                            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex-1 flex flex-col">
                                <div className="flex justify-between items-center mb-6">
                                    <h4 className="font-bold text-lg flex items-center gap-2"><ReceiptIcon className="text-emerald-500" /> Liquidaciones de Sueldo</h4>
                                    <button onClick={handleGenerarRecibo} className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-emerald-500/30 active:scale-95 transition-all">
                                        <AddIcon fontSize="small" /> Liquidar Periodo
                                    </button>
                                </div>

                                <div className="flex-1 flex flex-col items-center">
                                    {liquidaciones.length === 0 ? (
                                        <div className="flex-1 w-full flex flex-col justify-center items-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl p-8 text-center bg-slate-50">
                                            <ReceiptIcon sx={{ fontSize: 64, opacity: 0.2, marginBottom: '1rem' }} />
                                            <p className="font-bold text-lg mb-1 hidden sm:block">Aún no hay recibos generados</p>
                                            <p className="text-sm">Liquida el mes actual para generar el recibo en formato LCT.</p>
                                        </div>
                                    ) : (
                                        <div className="w-full flex flex-col gap-3">
                                            {liquidaciones.map(liq => (
                                                <div key={liq.id} className="border border-slate-100 p-4 rounded-xl flex items-center justify-between bg-slate-50 hover:bg-slate-100 transition-colors">
                                                    <div className="flex items-center gap-4">
                                                        <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center"><ReceiptIcon fontSize="small" /></div>
                                                        <div>
                                                            <p className="font-bold text-slate-800">Periodo {liq.periodo}</p>
                                                            <p className="text-xs text-slate-500">Neto: ${liq.total_neto.toLocaleString('es-AR')}</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={() => generatePDF(liq, selectedEmpleado)} className="p-2 text-slate-400 hover:text-rose-600 bg-white rounded-lg shadow-sm border border-slate-200">
                                                        <PictureAsPdfIcon fontSize="small" />
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            )}

            {/* Generar Recibo Modal */}
            {isPayrollOpen && payrollPreview && (
                <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-3xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 flex flex-col">
                        <div className="p-6 border-b border-emerald-100 bg-emerald-50/50 flex justify-between items-center text-emerald-900">
                            <h2 className="text-xl font-bold flex items-center gap-2"><ReceiptIcon /> Previsualización Recibo: {payrollPreview.periodo}</h2>
                            <button onClick={() => setIsPayrollOpen(false)} className="p-2 hover:bg-emerald-100 rounded-full transition-colors text-emerald-600"><CloseIcon /></button>
                        </div>
                        <div className="p-6 overflow-y-auto max-h-[60vh]">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 border-y border-slate-200 uppercase text-xs font-bold text-slate-500">
                                    <tr>
                                        <th className="py-3 px-4">Concepto</th>
                                        <th className="py-3 px-4">Unidad</th>
                                        <th className="py-3 px-4 text-emerald-600 text-right">Haberes</th>
                                        <th className="py-3 px-4 text-rose-600 text-right">Descuentos</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {payrollPreview.conceptos.map((c: any, i: number) => (
                                        <tr key={i} className="border-b border-slate-50 hover:bg-slate-50/50">
                                            <td className="py-3 px-4 font-medium">{c.descripcion}</td>
                                            <td className="py-3 px-4 text-slate-500">{c.unidad}</td>
                                            <td className="py-3 px-4 text-right">{c.tipo !== 'Retencion' ? `$${c.importe.toLocaleString('es-AR')}` : '-'}</td>
                                            <td className="py-3 px-4 text-right text-rose-600">{c.tipo === 'Retencion' ? `-$${c.importe.toLocaleString('es-AR')}` : '-'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            <div className="mt-6 flex justify-end">
                                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 w-64">
                                    <div className="flex justify-between text-sm mb-1 text-slate-500"><span>Bruto</span> <span>${payrollPreview.totalBruto.toLocaleString('es-AR')}</span></div>
                                    <div className="flex justify-between text-sm mb-2 text-rose-500"><span>Descuentos</span> <span>-${payrollPreview.totalRetenciones.toLocaleString('es-AR')}</span></div>
                                    <div className="flex justify-between text-lg font-bold text-emerald-600 pt-2 border-t border-slate-200"><span>Neto</span> <span>${payrollPreview.totalNeto.toLocaleString('es-AR')}</span></div>
                                </div>
                            </div>
                        </div>
                        <div className="p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0 justify-end">
                            <button onClick={() => setIsPayrollOpen(false)} className="px-6 py-2 bg-slate-100 rounded-xl font-bold text-slate-600">Cancelar</button>
                            <button onClick={handleConfirmarLiquidacion} className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold flex items-center gap-2"><SaveIcon fontSize="small" /> Liquidar y Exportar PDF</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
