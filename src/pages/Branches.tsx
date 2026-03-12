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
    horas_parcial?: number;
    contrato_filepath?: string;
    modalidad_contratacion?: string;
    estado?: string;
    fecha_egreso?: string;
    causal_egreso?: string;
}

export default function Branches() {
    const [empleados, setEmpleados] = useState<Empleado[]>([]);
    const [isFormOpen, setIsFormOpen] = useState(false);
    const [isAdminOpen, setIsAdminOpen] = useState(false);
    const [isPayrollOpen, setIsPayrollOpen] = useState(false);
    const [selectedEmpleado, setSelectedEmpleado] = useState<Empleado | null>(null);
    const [liquidaciones, setLiquidaciones] = useState<any[]>([]);
    const [payrollPreview, setPayrollPreview] = useState<any>(null);

    // Desvinculación State
    const [isDesvinculacionOpen, setIsDesvinculacionOpen] = useState(false);
    const [desvinculacionData, setDesvinculacionData] = useState({
        causal_egreso: 'Renuncia del trabajador (Art. 240 LCT)',
        fecha_egreso: new Date().toISOString().slice(0, 10)
    });
    const [indemnizacion, setIndemnizacion] = useState<any>(null);
    const [empleadosDesvinculados, setEmpleadosDesvinculados] = useState<Empleado[]>([]);
    const [showHistorial, setShowHistorial] = useState(false);

    // Calcular indemnización según LCT
    const calcularIndemnizacion = (emp: Empleado, causal: string, fechaEgreso: string) => {
        const ingreso = new Date(emp.fecha_ingreso);
        const egreso = new Date(fechaEgreso);
        const msYear = 1000 * 3600 * 24 * 365.25;
        const aniosTotales = (egreso.getTime() - ingreso.getTime()) / msYear;
        const aniosRedondeados = Math.max(1, Math.ceil(aniosTotales)); // mínimo 1 año; redondear hacia arriba fracción > 3 meses
        const basico = Number(emp.sueldo_basico) || 0;
        // Mejor remuneración mensual normal y habitual (simplificado)
        const MRMNH = basico;

        // Aguinaldos proporcionales al año actual
        const inicioAnio = new Date(egreso.getFullYear(), 0, 1);
        const mesesTranscurridos = (egreso.getTime() - inicioAnio.getTime()) / (msYear / 12);
        const aguinaldoProporcional = (MRMNH / 12) * Math.min(mesesTranscurridos, 12);

        // Vacaciones proporcionales de LCT
        const diasVacacionesAnuales = aniosTotales < 5 ? 14 : aniosTotales < 10 ? 21 : aniosTotales < 20 ? 28 : 35;
        const diasVacacionesProp = Math.floor((diasVacacionesAnuales / 12) * (mesesTranscurridos % 12));
        const vacacionesProporcional = (MRMNH / 25) * diasVacacionesProp;

        let items: { concepto: string, monto: number, detalle: string }[] = [];
        let total = 0;

        // Preaviso (Art. 231-232)
        let diasPreaviso = 0;
        if (causal.includes('sin justa causa')) {
            diasPreaviso = aniosTotales < 0.25 ? 15 : aniosTotales < 5 ? 30 : 60;
            const preaviso = (MRMNH / 30) * diasPreaviso;
            items.push({ concepto: 'Preaviso (Art. 231 LCT)', monto: preaviso, detalle: `${diasPreaviso} días` });
            total += preaviso;

            // SAC sobre Preaviso
            const sacPreaviso = preaviso / 12;
            items.push({ concepto: 'SAC s/ Preaviso', monto: sacPreaviso, detalle: '(1/12 del preaviso)' });
            total += sacPreaviso;

            // Indemnización por antigüedad (Art. 245)
            const antiguedad = MRMNH * aniosRedondeados;
            items.push({ concepto: 'Indemnización por Antigüedad (Art. 245)', monto: antiguedad, detalle: `${aniosRedondeados} años x $${MRMNH.toLocaleString('es-AR')}` });
            total += antiguedad;
        }

        if (causal.includes('con justa causa')) {
            // Solo vacaciones y aguinald prop
            items.push({ concepto: 'Nota: Despido con justa causa (Art. 242)', monto: 0, detalle: 'No genera indemnización por antigüedad.' });
        }

        if (causal.includes('Renuncia')) {
            // Preaviso que debe el empleado al empleador (informativo)
            const diasPreaviso2 = aniosTotales < 0.25 ? 15 : 30;
            items.push({ concepto: 'Prórroga de preaviso a entregar al empleador', monto: 0, detalle: `${diasPreaviso2} días (s/ Art. 231)` });
        }

        // Vacaciones proporcionales y SAC siempre se pagan
        items.push({ concepto: 'Vacaciones Proporcionales (LCT)', monto: vacacionesProporcional, detalle: `${diasVacacionesProp} días` });
        total += vacacionesProporcional;

        items.push({ concepto: 'SAC Proporcional por período', monto: aguinaldoProporcional, detalle: `${Math.min(mesesTranscurridos, 12).toFixed(1)} meses` });
        total += aguinaldoProporcional;

        return { items, total, anios: aniosTotales.toFixed(2), MRMNH };
    };

    // CCT Categories Management
    const [categoriasCCT, setCategoriasCCT] = useState<string[]>(() => {
        const saved = localStorage.getItem('categorias_cct_list');
        if (saved) {
            try { return JSON.parse(saved); } catch (e) { }
        }
        return ['Vendedor A', 'Vendedor B', 'Cajero A', 'Cajero B', 'Administrativo A', 'Maestranza A'];
    });

    useEffect(() => {
        localStorage.setItem('categorias_cct_list', JSON.stringify(categoriasCCT));
    }, [categoriasCCT]);
    const [newCategoria, setNewCategoria] = useState('');
    const [isAddingCategoria, setIsAddingCategoria] = useState(false);

    const [formData, setFormData] = useState<Empleado>({
        nombre: '', cargo: '', dni: '', cuil: '', direccion: '', partido: '',
        localidad: '', obra_social: '', fecha_ingreso: '', categoria_cct: '',
        sueldo_basico: 0, jornada_laboral: '', horas_parcial: 0, modalidad_contratacion: 'Formal'
    });

    useEffect(() => {
        loadEmpleados();
        loadDesvinculados();
    }, []);

    const loadEmpleados = async () => {
        try {
            const data = await ipc.invoke('get-empleados', null);
            // Filter out Desvinculados at JS level too as a safety net
            const activos = (data || []).filter((e: Empleado) => e.estado !== 'Desvinculado');
            setEmpleados(activos);
        } catch (error) {
            console.error("Error loading employees", error);
        }
    };

    const loadDesvinculados = async () => {
        try {
            const data = await ipc.invoke('get-empleados-desvinculados', null);
            setEmpleadosDesvinculados(data || []);
        } catch (error) {
            console.error('Error loading desvinculados', error);
        }
    };

    const handleOpenForm = (emp: Empleado | null) => {
        if (emp) {
            setFormData(emp);
        } else {
            setFormData({
                nombre: '', cargo: '', dni: '', cuil: '', direccion: '', partido: '',
                localidad: '', obra_social: '', fecha_ingreso: '', categoria_cct: '',
                sueldo_basico: 0, jornada_laboral: 'Completa', horas_parcial: 0, modalidad_contratacion: 'Formal'
            });
        }
        setIsFormOpen(true);
    };

    const handleDniChange = (val: string) => {
        const numbers = val.replace(/\D/g, '').slice(0, 8);
        setFormData(prev => ({ ...prev, dni: numbers }));
    };

    const handleCuilChange = (val: string) => {
        let numbers = val.replace(/\D/g, '').slice(0, 11);
        let formatted = '';
        if (numbers.length > 0) formatted += numbers.slice(0, 2);
        if (numbers.length > 2) formatted += '-' + numbers.slice(2, 10);
        if (numbers.length > 10) formatted += '-' + numbers.slice(10, 11);
        setFormData(prev => ({ ...prev, cuil: formatted }));
    };

    const handleAddCategoria = () => {
        const cat = newCategoria.trim();
        if (cat) {
            setCategoriasCCT(prev => {
                if (!prev.includes(cat)) {
                    return [...prev, cat];
                }
                return prev;
            });
            setFormData(prev => ({ ...prev, categoria_cct: cat }));
            setNewCategoria('');
            setIsAddingCategoria(false);
        }
    };

    const handleDeleteCategoria = (cat: string) => {
        setCategoriasCCT(prev => prev.filter(c => c !== cat));
        if (formData.categoria_cct === cat) setFormData(prev => ({ ...prev, categoria_cct: '' }));
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

    const handleDeleteEmpleadoClick = (emp: Empleado) => {
        if (!emp.id) return;
        if (emp.modalidad_contratacion === 'Informal') {
            if (confirm(`¿Eliminar definitivamente a ${emp.nombre}? (Al ser informal se borrará por completo).`)) {
                ipc.invoke('delete-empleado', emp.id).then(() => loadEmpleados());
            }
        } else {
            const defaultCausal = 'Renuncia del trabajador (Art. 240 LCT)';
            const defaultFecha = new Date().toISOString().slice(0, 10);
            setSelectedEmpleado(emp);
            setDesvinculacionData({ causal_egreso: defaultCausal, fecha_egreso: defaultFecha });
            // Calculate pre-emptively
            const calc = calcularIndemnizacion(emp, defaultCausal, defaultFecha);
            setIndemnizacion(calc);
            setIsDesvinculacionOpen(true);
        }
    };

    const handleDesvinculacionChange = (field: 'causal_egreso' | 'fecha_egreso', value: string) => {
        const newData = { ...desvinculacionData, [field]: value };
        setDesvinculacionData(newData);
        if (selectedEmpleado) {
            const calc = calcularIndemnizacion(selectedEmpleado, newData.causal_egreso, newData.fecha_egreso);
            setIndemnizacion(calc);
        }
    };

    const handleConfirmDesvinculacion = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedEmpleado || !selectedEmpleado.id) return;

        try {
            await ipc.invoke('desvincular-empleado', {
                id: selectedEmpleado.id,
                causal_egreso: desvinculacionData.causal_egreso,
                fecha_egreso: desvinculacionData.fecha_egreso
            });
            setIsDesvinculacionOpen(false);
            setSelectedEmpleado(null);
            setIndemnizacion(null);
            loadEmpleados();
            loadDesvinculados();
        } catch (err) {
            alert('Error al desvincular empleado.');
            console.error(err);
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
                            <button onClick={() => handleDeleteEmpleadoClick(emp)} className="p-1.5 text-slate-400 hover:text-rose-600 bg-slate-50 rounded-lg"><DeleteIcon fontSize="small" /></button>
                        </div>

                        <div className="flex items-center gap-4 mb-4">
                            <div className="w-14 h-14 rounded-full bg-gradient-to-tr from-primary-100 to-primary-50 flex items-center justify-center text-primary-600">
                                <PersonIcon fontSize="medium" />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg leading-tight text-slate-800">{emp.nombre}</h3>
                                <p className="text-sm font-medium text-slate-500 flex items-center gap-2">
                                    {emp.categoria_cct || emp.cargo || 'Sin Categoría'}
                                    {emp.modalidad_contratacion === 'Informal' && (
                                        <span className="bg-rose-100 text-rose-700 text-[10px] uppercase font-black px-1.5 py-0.5 rounded-md">Informal</span>
                                    )}
                                </p>
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
                                <div className="col-span-2 flex gap-4">
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Nombre Completo</label>
                                        <input required type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.nombre} onChange={e => setFormData({ ...formData, nombre: e.target.value })} />
                                    </div>
                                    <div className="w-1/3">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Modalidad</label>
                                        <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold" value={formData.modalidad_contratacion || 'Formal'} onChange={e => setFormData({ ...formData, modalidad_contratacion: e.target.value })}>
                                            <option value="Formal">Formal (Registrado)</option>
                                            <option value="Informal">Informal (No Registrado)</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">DNI</label>
                                    <input required type="text" maxLength={8} className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.dni} onChange={e => handleDniChange(e.target.value)} placeholder="Solo números (Max 8)" />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CUIL</label>
                                    <input required type="text" maxLength={13} className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.cuil} onChange={e => handleCuilChange(e.target.value)} placeholder="00-00000000-0" />
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
                                    <div className="flex gap-2">
                                        {!isAddingCategoria ? (
                                            <>
                                                <select required className="flex-1 px-4 py-2 bg-slate-50 border rounded-xl" value={formData.categoria_cct} onChange={e => setFormData({ ...formData, categoria_cct: e.target.value })}>
                                                    <option value="">Seleccionar...</option>
                                                    {categoriasCCT.map(cat => (
                                                        <option key={cat} value={cat}>{cat}</option>
                                                    ))}
                                                </select>
                                                <button type="button" onClick={() => setIsAddingCategoria(true)} className="p-2 border rounded-xl hover:bg-slate-100 text-slate-500" title="Añadir nueva categoría">
                                                    <AddIcon />
                                                </button>
                                                {formData.categoria_cct && (
                                                    <button type="button" onClick={() => handleDeleteCategoria(formData.categoria_cct)} className="p-2 border rounded-xl hover:bg-rose-50 text-rose-500" title="Eliminar categoría seleccionada">
                                                        <DeleteIcon />
                                                    </button>
                                                )}
                                            </>
                                        ) : (
                                            <div className="flex w-full gap-2">
                                                <input autoFocus type="text" className="flex-1 px-4 py-2 bg-slate-50 border rounded-xl" placeholder="Nueva Categoría" value={newCategoria} onChange={e => setNewCategoria(e.target.value)} onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), handleAddCategoria())} />
                                                <button type="button" onClick={handleAddCategoria} className="px-3 bg-emerald-600 text-white rounded-xl font-bold">OK</button>
                                                <button type="button" onClick={() => { setIsAddingCategoria(false); setNewCategoria(''); }} className="p-2 border rounded-xl hover:bg-slate-100 text-slate-500"><CloseIcon /></button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Sueldo Básico ($)</label>
                                    <input required type="number" step="0.01" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.sueldo_basico} onChange={e => setFormData({ ...formData, sueldo_basico: Number(e.target.value) })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Jornada Laboral</label>
                                    <select required className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.jornada_laboral} onChange={e => setFormData({ ...formData, jornada_laboral: e.target.value })}>
                                        <option value="Completa">Completa</option>
                                        <option value="Media Jornada">Media Jornada</option>
                                        <option value="Parcial">Parcial (Específica)</option>
                                    </select>
                                </div>
                                {formData.jornada_laboral === 'Parcial' && (
                                    <div className="animate-fade-in">
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Horas Mensuales</label>
                                        <input required type="number" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" placeholder="Ej: 120" value={formData.horas_parcial || ''} onChange={e => setFormData({ ...formData, horas_parcial: Number(e.target.value) })} />
                                    </div>
                                )}

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

                            {selectedEmpleado.modalidad_contratacion === 'Informal' ? (
                                <div className="bg-rose-50 border border-rose-200 rounded-2xl p-8 flex flex-col items-center justify-center text-center">
                                    <CloseIcon sx={{ fontSize: 48 }} className="text-rose-300 mb-2" />
                                    <h3 className="text-rose-800 font-bold text-lg">Modo Informal Activo</h3>
                                    <p className="text-rose-600 text-sm mt-1 max-w-md">Para el personal no registrado (informal), el sistema bloquea automáticamente la generación de contratos laborales y recibos de sueldo oficiales (Art 80 LCT) para evitar contingencias legales o cálculos erróneos.</p>
                                </div>
                            ) : (
                                <>
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
                                </>
                            )}
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

            {/* Modal Baja / Desvinculación para Formales */}
            {isDesvinculacionOpen && selectedEmpleado && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-rose-100 bg-gradient-to-r from-rose-50 to-orange-50 flex justify-between items-center text-rose-900">
                            <div>
                                <h2 className="text-xl font-bold">Desvinculación Laboral</h2>
                                <p className="text-sm text-rose-600 font-medium">{selectedEmpleado.nombre} | Ingreso: {selectedEmpleado.fecha_ingreso}</p>
                            </div>
                            <button onClick={() => setIsDesvinculacionOpen(false)} className="p-2 hover:bg-rose-100 rounded-full transition-colors text-rose-600"><CloseIcon /></button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5">
                            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-800 text-sm">
                                ⚠️ Al confirmar, el empleado no se borrará de la Base de datos, sino que pasará al <strong>Historial de Bajas</strong> preservando todos sus recibos de sueldo.
                            </div>

                            <form id="desvincularForm" onSubmit={handleConfirmDesvinculacion} className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Causal de Egreso Legal</label>
                                    <select
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-rose-400"
                                        value={desvinculacionData.causal_egreso}
                                        onChange={e => handleDesvinculacionChange('causal_egreso', e.target.value)}
                                    >
                                        <option value="Renuncia del trabajador (Art. 240 LCT)">Renuncia del trabajador (Art. 240 LCT)</option>
                                        <option value="Despido sin justa causa (Art. 245 LCT)">Despido sin justa causa (Art. 245 LCT)</option>
                                        <option value="Despido con justa causa (Art. 242 LCT)">Despido con justa causa (Art. 242 LCT)</option>
                                        <option value="Extinción por mutuo acuerdo (Art. 241 LCT)">Extinción por mutuo acuerdo (Art. 241 LCT)</option>
                                        <option value="Fin de periodo de prueba (Art. 92 bis LCT)">Fin de periodo de prueba (Art. 92 bis LCT)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha de Baja Oficial</label>
                                    <input
                                        type="date"
                                        required
                                        className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 outline-none focus:border-rose-400"
                                        value={desvinculacionData.fecha_egreso}
                                        onChange={e => handleDesvinculacionChange('fecha_egreso', e.target.value)}
                                    />
                                </div>
                            </form>

                            {/* Indemnization Breakdown */}
                            {indemnizacion && (
                                <div className="bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden">
                                    <div className="bg-slate-100 px-4 py-2.5 flex items-center gap-2">
                                        <ReceiptIcon className="text-rose-500" fontSize="small" />
                                        <h4 className="font-bold text-sm text-slate-700">Liquidación Final Estimada (LCT) — {indemnizacion.anios} años de servicio</h4>
                                    </div>
                                    <table className="w-full text-sm">
                                        <thead>
                                            <tr className="border-b border-slate-200">
                                                <th className="text-left px-4 py-2 text-xs text-slate-500 font-bold uppercase">Concepto</th>
                                                <th className="text-left px-4 py-2 text-xs text-slate-500 font-bold uppercase">Detalle</th>
                                                <th className="text-right px-4 py-2 text-xs text-slate-500 font-bold uppercase">Monto</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {indemnizacion.items.map((item: any, i: number) => (
                                                <tr key={i} className="border-b border-slate-100 hover:bg-rose-50/30">
                                                    <td className="px-4 py-2.5 font-medium text-slate-700">{item.concepto}</td>
                                                    <td className="px-4 py-2.5 text-slate-400 text-xs">{item.detalle}</td>
                                                    <td className="px-4 py-2.5 text-right font-bold">{item.monto > 0 ? `$${Math.round(item.monto).toLocaleString('es-AR')}` : '—'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                    {indemnizacion.total > 0 && (
                                        <div className="px-4 py-3 bg-rose-600 flex justify-between items-center text-white">
                                            <span className="font-bold">TOTAL ESTIMADO A PAGAR</span>
                                            <span className="text-xl font-black">${Math.round(indemnizacion.total).toLocaleString('es-AR')}</span>
                                        </div>
                                    )}
                                    <p className="text-[10px] text-slate-400 px-4 py-2">* Cálculo orientativo basado en art. 231, 232, 241, 242, 245 LCT. No incluye retenciones o aportes patronales. Verificar con contador previo al pago.</p>
                                </div>
                            )}
                        </div>

                        <div className="p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0">
                            <button onClick={() => setIsDesvinculacionOpen(false)} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">Cancelar</button>
                            <button form="desvincularForm" type="submit" className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center justify-center gap-2">
                                <SaveIcon fontSize="small" /> Registrar Baja
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Historial de Desvinculados */}
            {empleadosDesvinculados.length > 0 && (
                <div className="mt-4">
                    <button
                        onClick={() => setShowHistorial(v => !v)}
                        className="flex items-center gap-2 text-sm font-bold text-slate-500 hover:text-slate-700 transition-colors mb-4"
                    >
                        <span className={`transition-transform ${showHistorial ? 'rotate-90' : ''}`}>▶</span>
                        Historial de Bajas / Desvinculaciones ({empleadosDesvinculados.length})
                    </button>
                    {showHistorial && (
                        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                            <table className="w-full text-sm">
                                <thead className="bg-slate-50 border-b border-slate-200">
                                    <tr>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Empleado</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Causal de Egreso</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">Fecha Baja</th>
                                        <th className="text-left px-4 py-3 text-xs font-bold text-slate-500 uppercase">CUIL</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {empleadosDesvinculados.map(emp => (
                                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-rose-50/20">
                                            <td className="px-4 py-3 font-semibold text-slate-700">{emp.nombre}</td>
                                            <td className="px-4 py-3 text-slate-500">{emp.causal_egreso}</td>
                                            <td className="px-4 py-3 text-slate-500">{emp.fecha_egreso}</td>
                                            <td className="px-4 py-3 font-mono text-slate-400">{emp.cuil}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

