import { useState, useEffect } from 'react';
import { useSettings } from '../context/SettingsContext';
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
import { 
    SMMLV_2026, AUX_TRANSPORTE_2026, TOPE_EXONERACION_EMPLEADOR, 
    INDEM_BAJO_PRIMER_ANO, INDEM_BAJO_SIGUIENTES, INDEM_ALTO_PRIMER_ANO, INDEM_ALTO_SIGUIENTES, 
    PERIODO_PRUEBA_MESES, PRESTACIONES, TOPE_AUX_TRANSPORTE, APORTES_EMPLEADO_2026,
    getDivisorHoras, getValorHoraOrdinaria, RECARGOS_2026
} from '../utils/colombiaConstants';

interface Empleado {
    id?: number;
    nombre: string;
    cargo: string;
    dni: string; // Argentina
    cuil: string; // Argentina
    cedula_ciudadania?: string; // Colombia
    documento_extranjeria?: string; // Colombia
    rut?: string; // Colombia
    eps?: string; // Colombia
    fondo_pensiones?: string; // Colombia
    arl?: string; // Colombia
    vacunacion_rabia?: boolean; // Colombia - Petshop
    matricula_profesional?: string; // Colombia - Veterinario
    direccion: string;
    telefono?: string;
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
    indemnizacion_json?: string;
    ajustes_proximos_json?: string;
}

export default function Branches() {
    const { settings } = useSettings();
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
    const [cuilError, setCuilError] = useState('');
    const [viewingIndemnizacion, setViewingIndemnizacion] = useState<any>(null);

    // Vacation State
    const [isVacationModalOpen, setIsVacationModalOpen] = useState(false);
    const [vacationData, setVacationData] = useState({
        dias: 0,
        periodo: new Date().getFullYear().toString(),
        total_restantes: 0
    });
    const [novedadesMes, setNovedadesMes] = useState({ heDiurnas: 0, heNocturnas: 0, recNocturno: 0, dominicales: 0 });

    // Calcular indemnización según LCT/Ley Bases (ARG) o CST (COL)
    const calcularIndemnizacion = (emp: Empleado, causal: string, fechaEgreso: string) => {
        const ingreso = new Date(emp.fecha_ingreso);
        const egreso = new Date(fechaEgreso);
        const msDay = 1000 * 3600 * 24;
        const msYear = msDay * 365.25;
        const totalDays = (egreso.getTime() - ingreso.getTime()) / msDay;
        const aniosTotales = totalDays / 365.25;
        const aniosRedondeados = Math.max(1, Math.ceil(aniosTotales));
        const basico = Number(emp.sueldo_basico) || 0;

        let items: { concepto: string, monto: number, detalle: string }[] = [];
        let total = 0;

        if (settings.pais === 'Colombia') {
            // LÓGICA COLOMBIA (CST Art. 64)
            const esIndefinido = emp.modalidad_contratacion?.includes('Indefinido') || emp.modalidad_contratacion === 'Formal';
            const esFijo = emp.modalidad_contratacion?.includes('Fijo') || emp.modalidad_contratacion?.includes('Obra');

            if (causal.includes('sin justa causa')) {
                if (esIndefinido) {
                    let diasIndemnizacion = 0;
                    if (basico < TOPE_EXONERACION_EMPLEADOR) {
                        diasIndemnizacion = aniosTotales <= 1 ? INDEM_BAJO_PRIMER_ANO : INDEM_BAJO_PRIMER_ANO + (Math.floor(aniosTotales - 1) * INDEM_BAJO_SIGUIENTES);
                    } else {
                        diasIndemnizacion = aniosTotales <= 1 ? INDEM_ALTO_PRIMER_ANO : INDEM_ALTO_PRIMER_ANO + (Math.floor(aniosTotales - 1) * INDEM_ALTO_SIGUIENTES);
                    }
                    const montoIndem = (basico / 30) * diasIndemnizacion;
                    items.push({ concepto: 'Indemnización Despido Injusto (Art. 64 CST)', monto: montoIndem, detalle: `${diasIndemnizacion.toFixed(1)} días de salario` });
                    total += montoIndem;
                } else if (esFijo) {
                    items.push({ concepto: 'Indemnización Contrato Fijo/Obra', monto: 0, detalle: 'Equivale a salarios faltantes para cumplir el término (Cálculo Manual requerido).' });
                }
            }

            // Prestaciones Sociales Proporcionales (Liquidación de Ley)
            const mesesTrans = (totalDays % 365.25) / 30.5;
            const prima = (basico * mesesTrans) * PRESTACIONES.PRIMA_SERVICIOS;
            const cesantias = (basico * mesesTrans) * PRESTACIONES.CESANTIAS;
            const intereses = (cesantias * PRESTACIONES.INT_CESANTIAS * mesesTrans) / 12;
            const vacaciones = (basico * (totalDays % 365.25)) / (1 / PRESTACIONES.VACACIONES);

            items.push({ concepto: 'Prima de Servicios Proporcional', monto: prima, detalle: 'Corte a la fecha de egreso' });
            items.push({ concepto: 'Cesantías Proporcionales', monto: cesantias, detalle: 'Base de 1 mes por año' });
            items.push({ concepto: 'Intereses sobre Cesantías', monto: intereses, detalle: '12% anual sobre saldo' });
            items.push({ concepto: 'Vacaciones Proporcionales', monto: vacaciones, detalle: '15 días por año (divisor 720)' });
            
            total += prima + cesantias + intereses + vacaciones;

            return { items, total, anios: aniosTotales.toFixed(2), MRMNH: basico, isWithinTrial: totalDays <= 60, trialMonths: 2 };

        } else {
            // LÓGICA ARGENTINA (LCT / Ley Bases 2024)
            let MRMNH = basico;
            if (settings.hrCctTope > 0 && MRMNH > settings.hrCctTope) {
                MRMNH = settings.hrCctTope;
            }

            const inicioAnio = new Date(egreso.getFullYear(), 0, 1);
            const mesesTranscurridos = (egreso.getTime() - inicioAnio.getTime()) / (msYear / 12);
            const aguinaldoProporcional = (Number(emp.sueldo_basico) / 12) * Math.min(mesesTranscurridos, 12);

            const diasVacacionesAnuales = aniosTotales < 5 ? 14 : aniosTotales < 10 ? 21 : aniosTotales < 20 ? 28 : 35;
            const diasVacacionesProp = Math.floor((diasVacacionesAnuales / 12) * (mesesTranscurridos % 12));
            const vacacionesProporcional = (Number(emp.sueldo_basico) / 25) * diasVacacionesProp;

            let trialMonths = 6;
            if (settings.hrEmpresaSize === 'pyme1') trialMonths = 12;
            else if (settings.hrEmpresaSize === 'pyme2') trialMonths = 8;

            const isWithinTrial = totalDays <= (trialMonths * 30.5);

            if (causal.includes('sin justa causa') && !isWithinTrial) {
                let diasPreaviso = aniosTotales < 5 ? 30 : 60;
                const preaviso = (MRMNH / 30) * diasPreaviso;
                items.push({ concepto: 'Preaviso (Art. 231 LCT)', monto: preaviso, detalle: `${diasPreaviso} días` });
                total += preaviso;

                const sacPreaviso = preaviso / 12;
                items.push({ concepto: 'SAC s/ Preaviso', monto: sacPreaviso, detalle: '(1/12 del preaviso)' });
                total += sacPreaviso;

                if (settings.hrAplicaFondoCese) {
                    items.push({ concepto: 'Antigüedad (Fondo de Cese)', monto: 0, detalle: 'Cubierto por aportes mensuales al Fondo de Cese Laboral.' });
                } else {
                    const antiguedad = MRMNH * aniosRedondeados;
                    items.push({ concepto: 'Indemnización por Antigüedad (Art. 245)', monto: antiguedad, detalle: `${aniosRedondeados} años x $${MRMNH.toLocaleString('es-AR')}` });
                    total += antiguedad;
                }
            }

            if (causal.includes('con justa causa')) {
                items.push({ concepto: 'Nota: Despido con justa causa (Art. 242)', monto: 0, detalle: 'No genera indemnización por antigüedad.' });
            }

            if (causal.includes('Fin de periodo de prueba') || (causal.includes('sin justa causa') && isWithinTrial)) {
                let diasPreaviso = 15;
                const preavisoPrueba = (MRMNH / 30) * diasPreaviso;
                items.push({ concepto: 'Preaviso Periodo Prueba (Art. 92 bis)', monto: preavisoPrueba, detalle: '15 días' });
                total += preavisoPrueba;
                const sacPreavisoPrueba = preavisoPrueba / 12;
                items.push({ concepto: 'SAC s/ Preaviso Pr.', monto: sacPreavisoPrueba, detalle: '(1/12)' });
                total += sacPreavisoPrueba;
            }

            items.push({ concepto: 'Vacaciones Proporcionales (LCT)', monto: vacacionesProporcional, detalle: `${diasVacacionesProp} días` });
            total += vacacionesProporcional;
            items.push({ concepto: 'SAC Proporcional por período', monto: aguinaldoProporcional, detalle: `${Math.min(mesesTranscurridos, 12).toFixed(1)} meses` });
            total += aguinaldoProporcional;

            return { items, total, anios: aniosTotales.toFixed(2), MRMNH, isWithinTrial, trialMonths };
        }
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
        sueldo_basico: 0, jornada_laboral: '', horas_parcial: 0, modalidad_contratacion: 'Formal', telefono: ''
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
        // Close other modals to prevent z-index blocking
        setIsAdminOpen(false);
        setIsPayrollOpen(false);
        setIsVacationModalOpen(false);
        setIsDesvinculacionOpen(false);
        setViewingIndemnizacion(null);
        setCuilError('');

        if (emp) {
            setFormData(emp);
        } else {
            setFormData({
                nombre: '', cargo: '', dni: '', cuil: '', direccion: '', partido: '',
                localidad: '', obra_social: '', fecha_ingreso: '', categoria_cct: '',
                sueldo_basico: 0, jornada_laboral: 'Completa', horas_parcial: 0, modalidad_contratacion: 'Formal', telefono: ''
            });
        }
        setIsFormOpen(true);
    };

    const handleCuilChange = (val: string) => {
        // The CUIL format is: XX-DNIDNI-X
        // We auto-lock the middle 8 digits to the DNI already registered.
        // The user only controls the 2-digit prefix and the 1-digit verification digit.
        const dniDigits = (formData.dni || '').replace(/\D/g, '');

        // Extract all typed digits
        const typed = val.replace(/\D/g, '');

        let prefix = '';
        let suffix = '';

        if (dniDigits.length > 0) {
            // Build the canonical full number: prefix(2) + dni(up to 8) + suffix(1)
            // User is typing so figure out what came before and after the DNI slot
            const beforeDni = typed.slice(0, 2);
            // Everything after the first 2 digits that isn't the DNI goes to suffix
            const afterPrefix = typed.slice(2);
            const dniInTyped = afterPrefix.slice(0, dniDigits.length);
            const afterDni = afterPrefix.slice(dniDigits.length);

            prefix = beforeDni.slice(0, 2);
            suffix = afterDni.slice(0, 1);

            // Build formatted CUIL with locked DNI
            let formatted = prefix;
            if (prefix.length === 2) {
                formatted += '-' + dniDigits;
                if (suffix.length === 1) {
                    formatted += '-' + suffix;
                }
            }

            // Validate: middle must match DNI
            if (dniInTyped.length > 0 && dniInTyped !== dniDigits.slice(0, dniInTyped.length)) {
                setCuilError(`El CUIL debe contener el mismo DNI (${dniDigits}) en el medio.`);
            } else {
                setCuilError('');
            }

            setFormData(prev => ({ ...prev, cuil: formatted }));
        } else {
            // No DNI yet — allow free typing with formatting
            const numbers = typed.slice(0, 11);
            let formatted = '';
            if (numbers.length > 0) formatted += numbers.slice(0, 2);
            if (numbers.length > 2) formatted += '-' + numbers.slice(2, 10);
            if (numbers.length > 10) formatted += '-' + numbers.slice(10, 11);
            setCuilError('Primero completá el campo DNI.');
            setFormData(prev => ({ ...prev, cuil: formatted }));
        }
    };

    // When DNI changes, auto-update the CUIL middle segment if CUIL prefix/suffix already entered
    const handleDniChange = (val: string) => {
        const numbers = val.replace(/\D/g, '').slice(0, 8);
        setFormData(prev => {
            // Re-derive CUIL with new DNI
            const existingCuil = (prev.cuil || '').replace(/\D/g, '');
            const existingPrefix = existingCuil.slice(0, 2);
            const existingSuffix = existingCuil.slice(10, 11);
            let newCuil = existingPrefix;
            if (existingPrefix.length === 2 && numbers.length > 0) {
                newCuil += '-' + numbers;
                if (existingSuffix) newCuil += '-' + existingSuffix;
            }
            const finalCuil = existingPrefix.length === 2 && numbers.length > 0 ? newCuil : prev.cuil;
            setCuilError('');
            return { ...prev, dni: numbers, cuil: finalCuil };
        });
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

        // Validate CUIL contains the same DNI
        const dniDigits = (formData.dni || '').replace(/\D/g, '');
        const cuilDigits = (formData.cuil || '').replace(/\D/g, '');
        const cuilMiddle = cuilDigits.slice(2, 10);
        if (dniDigits && cuilMiddle && cuilMiddle !== dniDigits.padStart(8, '0').slice(0, cuilMiddle.length) && cuilMiddle !== dniDigits) {
            setCuilError(`El CUIL ingresado no corresponde al DNI ${dniDigits}. El formato debe ser XX-${dniDigits}-X.`);
            return;
        }
        setCuilError('');

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
                fecha_egreso: desvinculacionData.fecha_egreso,
                indemnizacion_json: JSON.stringify(indemnizacion)
            });
            setIsDesvinculacionOpen(false);
            setIsAdminOpen(false);
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

        const basico = Number(selectedEmpleado.sueldo_basico) || 0;
        const ahora = new Date();
        const periodo = ahora.toISOString().slice(0, 7);

        if (settings.pais === 'Colombia') {
            // LÓGICA COLOMBIA 2026
            
            let conceptos: any[] = [];
            let totalRemunerativo = basico;
            conceptos.push({ tipo: 'Remunerativo', descripcion: 'Sueldo Básico', unidad: '30 días', importe: basico });

            // Auxilio de Transporte (si devenga menos de 2 SMMLV)
            let totalNoRemunerativo = 0;
            if (basico <= TOPE_AUX_TRANSPORTE) {
                totalNoRemunerativo += AUX_TRANSPORTE_2026;
                conceptos.push({ tipo: 'NoRemunerativo', descripcion: 'Auxilio de Transporte', unidad: 'Legal', importe: AUX_TRANSPORTE_2026 });
            }

            // Novedades y Recargos (CST 2026)
            const divisor = getDivisorHoras(ahora);
            const valorHora = getValorHoraOrdinaria(basico, ahora);
            
            if (novedadesMes.recNocturno > 0) {
                const montoRecNocturno = novedadesMes.recNocturno * valorHora * RECARGOS_2026.NOCTURNO;
                conceptos.push({ tipo: 'Remunerativo', descripcion: 'Recargo Nocturno', unidad: `${novedadesMes.recNocturno}h`, importe: montoRecNocturno });
                totalRemunerativo += montoRecNocturno;
            }
            if (novedadesMes.heDiurnas > 0) {
                const montoHED = novedadesMes.heDiurnas * valorHora * (1 + RECARGOS_2026.HORA_EXTRA_DIURNA);
                conceptos.push({ tipo: 'Remunerativo', descripcion: 'Horas Extras Diurnas', unidad: `${novedadesMes.heDiurnas}h`, importe: montoHED });
                totalRemunerativo += montoHED;
            }
            if (novedadesMes.heNocturnas > 0) {
                const montoHEN = novedadesMes.heNocturnas * valorHora * (1 + RECARGOS_2026.HORA_EXTRA_NOCTURNA);
                conceptos.push({ tipo: 'Remunerativo', descripcion: 'Horas Extras Nocturnas', unidad: `${novedadesMes.heNocturnas}h`, importe: montoHEN });
                totalRemunerativo += montoHEN;
            }
            if (novedadesMes.dominicales > 0) {
                const montoDominical = novedadesMes.dominicales * valorHora * (1 + RECARGOS_2026.DOMINICAL_ORDINARIO);
                conceptos.push({ tipo: 'Remunerativo', descripcion: 'Horas Dominicales', unidad: `${novedadesMes.dominicales}h`, importe: montoDominical });
                totalRemunerativo += montoDominical;
            }
            
            // Retenciones (Salud 4%, Pensión 4%) sobre el total remunerativo (devengado gravable)
            const salud = totalRemunerativo * APORTES_EMPLEADO_2026.SALUD;
            const pension = totalRemunerativo * APORTES_EMPLEADO_2026.PENSION;
            conceptos.push({ tipo: 'Retencion', descripcion: 'Aporte Salud (4%)', unidad: '4%', importe: salud });
            conceptos.push({ tipo: 'Retencion', descripcion: 'Aporte Pensión (4%)', unidad: '4%', importe: pension });

            const totalRetenciones = salud + pension;
            const totalBruto = totalRemunerativo + totalNoRemunerativo;
            const totalNeto = totalBruto - totalRetenciones;

            setPayrollPreview({
                periodo,
                fecha_pago: ahora.toISOString().slice(0, 10),
                banco_deposito: 'Transferencia Bancaria',
                conceptos, totalBruto, totalRetenciones, totalNeto
            });

        } else {
            // LÓGICA ARGENTINA (CCT 130/75)
            const ingreso = new Date(selectedEmpleado.fecha_ingreso);
            const difTiempo = Math.abs(ahora.getTime() - ingreso.getTime());
            const anios = Math.floor(difTiempo / (1000 * 3600 * 24 * 365.25));

            const antiguedad = basico * 0.01 * anios;
            const presentismo = (basico + antiguedad) * 0.0833;

            const totalRemunerativo = basico + antiguedad + presentismo;
            const sumaNoRem1 = 60000;
            const sumaNoRem2 = 40000;
            const totalNoRemunerativo = sumaNoRem1 + sumaNoRem2;
            const totalBruto = totalRemunerativo + totalNoRemunerativo;

            const jubilacion = totalRemunerativo * 0.11;
            const pami = totalRemunerativo * 0.03;
            const obraSocial = totalBruto * 0.03;
            const cuotaSindical = totalBruto * 0.02;
            const faecys = totalBruto * 0.005;
            const aporteSolidarioOS = 8500;

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
                periodo,
                fecha_pago: ahora.toISOString().slice(0, 10),
                banco_deposito: 'Caja Fija',
                conceptos, totalBruto, totalRetenciones, totalNeto
            });
        }
        setIsPayrollOpen(true);
    };

    const handleGenerarNotaCompensacion = () => {
        if (!selectedEmpleado) return;
        const emp = selectedEmpleado;
        const doc = new jsPDF('p', 'pt', 'a4');
        const hoy = new Date();
        const dias = hoy.getDate();
        const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
        const mes = meses[hoy.getMonth()];
        const anio = hoy.getFullYear();

        const valorDiaBruto = Number(selectedEmpleado.sueldo_basico) / 30;
        const deducciones = settings.pais === 'Colombia' ? 0.08 : 0.195; // 8% en COL vs 19.5% en ARG
        const valorDiaNeto = valorDiaBruto * (1 - deducciones);
        const locale = settings.pais === 'Colombia' ? 'es-CO' : 'es-AR';
        const montoStr = (valorDiaNeto * vacationData.dias).toLocaleString(locale, { minimumFractionDigits: settings.pais === 'Colombia' ? 0 : 2 });

        doc.setFontSize(11);
        doc.text(`${settings.pais === 'Colombia' ? 'Colombia' : 'La Plata'}, ${dias} de ${mes} de ${anio}`, 400, 60, { align: 'right' });

        const margin = 50;
        const startY = 150;
        const lineHeight = 18;

        doc.setFont('helvetica', 'normal');
        const idLabel = settings.pais === 'Colombia' ? 'Cédula' : 'DNI';
        const idValue = settings.pais === 'Colombia' ? (emp.cedula_ciudadania || emp.dni || '________') : (emp.dni || '________');
        
        const locName = settings.pais === 'Colombia' ? 'Colombia' : 'La Plata';
        let text = `Por medio de la presente, yo ${emp.nombre}, ${idLabel} ${idValue}, dejo constancia de que he solicitado a la empresa ${settings.businessName || 'Comercio Pepito'} la posibilidad de percibir una compensación económica de $${montoStr} a cambio de no gozar de ${vacationData.dias} días de vacaciones correspondientes al período ${vacationData.periodo}.`;

        const splitText = doc.splitTextToSize(text, 500);
        doc.text(splitText, margin, startY);

        let nextY = startY + (splitText.length * lineHeight) + 20;

        let text2 = settings.pais === 'Colombia'
            ? `Asimismo, declaro que fui informado/a por la empresa de que, conforme al Código Sustantivo del Trabajo (CST), los recargos y compensaciones económicas no salariales acordadas corresponden al pago sustitutivo de la licencia, siempre sujeto al ordenamiento y límites legales vigentes.`
            : `Asimismo, declaro que fui informado/a por la empresa de que, conforme a la Ley de Contrato de Trabajo (Art. 162 y 164), los días por licencia deben ser gozados y no pueden ser reemplazados por el pago, salvo en caso de extinción del vínculo laboral.`;
        const splitText2 = doc.splitTextToSize(text2, 500);
        doc.text(splitText2, margin, nextY);

        nextY += (splitText2.length * lineHeight) + 20;

        let text3 = `Firmo la presente dejando constancia de que mi solicitud fue voluntaria, que acepto el monto antes mencionado y que he sido notificado/a de la imposibilidad legal de acceder a ella originalmente.`;
        const splitText3 = doc.splitTextToSize(text3, 500);
        doc.text(splitText3, margin, nextY);

        nextY += 100;

        doc.text(`Firma del empleado`, margin, nextY);
        doc.text(`Aclaración: ___________________________`, margin, nextY + 20);
        doc.text(`${idLabel}: ${idValue}`, margin, nextY + 40);

        doc.text(`Firma del empleador`, 350, nextY);
        doc.text(`Aclaración: ___________________________`, 350, nextY + 20);
        doc.text(`Cargo: ___________________________`, 350, nextY + 40);

        doc.save(`Compensacion_Economica_${emp.nombre.replace(/ /g, '_')}.pdf`);
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
        const formatCurr = (val: number) => val.toLocaleString(settings.pais === 'Colombia' ? 'es-CO' : 'es-AR', { minimumFractionDigits: settings.pais === 'Colombia' ? 0 : 2 });
        const drawRecibo = (startY: number, title: string) => {
            doc.setFontSize(10);
            const tituloLey = settings.pais === 'Colombia' ? 'Nómina - Código Sustantivo del Trabajo' : 'Recibo de Sueldo - Ley 20.744';
            doc.text(`${tituloLey} - Ejemplar: ${title}`, 40, startY + 20);
            doc.setFontSize(8);
            const identificadorEmpresa = settings.pais === 'Colombia' ? 'NIT: 900.000.000-0' : 'CUIT: 30-00000000-0';
            doc.text(`${settings.businessName || 'Empresa Ejemplo S.A.'} | ${identificadorEmpresa} | Domicilio Ficticio 123`, 40, startY + 35);
            const idEmpLabel = settings.pais === 'Colombia' ? `C.C./RUT: ${emp.cedula_ciudadania || emp.rut || ''}` : `CUIL: ${emp.cuil || ''}`;
            doc.text(`Empleado: ${emp.nombre} | LEGAJO: ${emp.id} | ${idEmpLabel}`, 40, startY + 50);
            doc.text(`Categoría: ${emp.categoria_cct || emp.cargo || ''} | Ingreso: ${emp.fecha_ingreso} | Periodo: ${liq.periodo}`, 40, startY + 65);

            const tableData = liq.conceptos.map((c: any) => [
                c.descripcion,
                c.unidad,
                c.tipo === 'Remunerativo' ? `$${formatCurr(c.importe)}` : '',
                c.tipo === 'NoRemunerativo' ? `$${formatCurr(c.importe)}` : '',
                c.tipo === 'Retencion' ? `$${formatCurr(c.importe)}` : ''
            ]);

            autoTable(doc, {
                startY: startY + 80,
                head: [['Concepto', 'Unidad/Porc', settings.pais === 'Colombia' ? 'Devengado' : 'Remunerativo', settings.pais === 'Colombia' ? 'Base/Otros' : 'No Remunerativo', 'Deducciones']],
                body: tableData,
                styles: { fontSize: 8, cellPadding: 2 },
                headStyles: { fillColor: settings.pais === 'Colombia' ? [16, 185, 129] : [79, 70, 229] }, // Emerald vs Indigo
                margin: { left: 40, right: 40 }
            });

            const finalY = (doc as any).lastAutoTable.finalY + 15;
            doc.setFontSize(9);
            doc.text(`TOTAL DEVENGADO: $${formatCurr(liq.total_bruto)}`, 40, finalY);
            doc.text(`TOTAL DEDUCCIONES: $${formatCurr(liq.total_retenciones)}`, 220, finalY);
            doc.text(`NETO A PAGAR: $${formatCurr(liq.total_neto)}`, 400, finalY);

            doc.setFontSize(7);
            doc.text(`Firma Empleador ......................................`, 80, finalY + 40);
            doc.text(`Firma Empleado ......................................`, 350, finalY + 40);
            
            if (settings.pais === 'Colombia') {
                const cuneRandom = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                doc.text(`CUNE Sistema (Local): ${cuneRandom} | No válido como nómina electrónica DIAN.`, 40, finalY + 60);
            } else {
                doc.text(`Art. 12 Ley 17250: Último depósito aportes mes ant.: Banco Nación. | No válido como recibo sin firma.`, 40, finalY + 60);
            }
        };

        // Draw Duplicate and Original
        drawRecibo(20, 'EMPLEADOR');
        doc.setLineWidth(1);
        (doc as any).setLineDash([5, 5], 0);
        doc.line(40, 420, 550, 420); // Cut line
        (doc as any).setLineDash([], 0);
        drawRecibo(450, 'TRABAJADOR');

        doc.save(`Nomina_${emp.nombre.replace(/ /g, '_')}_${liq.periodo}.pdf`);
    };

    return (
        <div className="flex flex-col h-full animate-fade-in text-slate-800">
            {/* Header */}
            <div className="flex justify-between items-end mb-6">
                <div>
                    <h1 className="text-2xl font-bold">Recursos Humanos</h1>
                    <p className="text-sm text-slate-500 mt-1">
                        {settings.pais === 'Colombia' 
                            ? 'Gestión de Personal, Legajos y Nómina (CST 2026)' 
                            : 'Gestión de Personal, Legajos y Liquidación de Sueldos (CCT 130/75)'}
                    </p>
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
                                <span className="text-slate-400 font-medium">{settings.pais === 'Colombia' ? 'Cédula/RUT' : 'CUIL'}</span>
                                <span className="font-mono text-slate-700">{settings.pais === 'Colombia' ? (emp.cedula_ciudadania || emp.rut || 'No reg.') : (emp.cuil || 'No reg.')}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-slate-400 font-medium">Básico</span>
                                <span className="font-bold text-slate-800">${emp.sueldo_basico?.toLocaleString(settings.pais === 'Colombia' ? 'es-CO' : 'es-AR') || '0'}</span>
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
                                {settings.pais === 'Colombia' ? (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Cédula Ciudadanía</label>
                                            <input required type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.cedula_ciudadania || ''} onChange={e => setFormData({ ...formData, cedula_ciudadania: e.target.value })} placeholder="1.234.567.890" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">RUT</label>
                                            <input type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-mono" value={formData.rut || ''} onChange={e => setFormData({ ...formData, rut: e.target.value })} placeholder="12345678-9" />
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">DNI</label>
                                            <input required type="text" maxLength={8} className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.dni} onChange={e => handleDniChange(e.target.value)} placeholder="Solo números (Max 8)" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">CUIL</label>
                                            <input
                                                required
                                                type="text"
                                                maxLength={13}
                                                className={`w-full px-4 py-2 bg-slate-50 border rounded-xl font-mono ${cuilError ? 'border-rose-400 focus:ring-rose-300' : 'border-slate-200'}`}
                                                value={formData.cuil}
                                                onChange={e => handleCuilChange(e.target.value)}
                                                placeholder={formData.dni ? `XX-${formData.dni}-X` : '00-00000000-0'}
                                            />
                                            {cuilError
                                                ? <p className="text-xs text-rose-500 mt-1 font-semibold">{cuilError}</p>
                                                : <p className="text-xs text-slate-400 mt-1">Formato: XX-{formData.dni || 'DNI'}-X</p>
                                            }
                                        </div>
                                    </>
                                )}

                                <div className="col-span-2">
                                    <h4 className="font-bold text-primary-600 mt-4 border-b pb-2 mb-2">
                                        {settings.pais === 'Colombia' ? 'Datos Legales y de Nómina (CST 2026)' : 'Datos Legales y de Convenio (CCT 130/75)'}
                                    </h4>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fecha de Ingreso (DD-MM-YYYY)</label>
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
                                    <input required type="number" step="0.01" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.sueldo_basico} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, sueldo_basico: Number(e.target.value) })} />
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
                                        <input required type="number" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" placeholder="Ej: 120" value={formData.horas_parcial || ''} onFocus={(e) => e.target.select()} onChange={e => setFormData({ ...formData, horas_parcial: Number(e.target.value) })} />
                                    </div>
                                )}

                                <div className="col-span-2">
                                    <h4 className="font-bold text-primary-600 mt-4 border-b pb-2 mb-2">Contacto y Cobertura Médica</h4>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Dirección Completa</label>
                                    <input type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.direccion} onChange={e => setFormData({ ...formData, direccion: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Teléfono</label>
                                    <input type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.telefono || ''} onChange={e => setFormData({ ...formData, telefono: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Localidad</label>
                                    <input type="text" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.localidad} onChange={e => setFormData({ ...formData, localidad: e.target.value })} />
                                </div>
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">{settings.pais === 'Colombia' ? 'EPS / Salud' : 'Cobertura Médica'}</label>
                                    <input type="text" placeholder={settings.pais === 'Colombia' ? 'Ej: Sanitas' : 'Ej: OSECAC'} className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={settings.pais === 'Colombia' ? (formData.eps || '') : formData.obra_social} onChange={e => settings.pais === 'Colombia' ? setFormData({...formData, eps: e.target.value}) : setFormData({ ...formData, obra_social: e.target.value })} />
                                </div>
                                {settings.pais === 'Colombia' && (
                                    <>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Fondo de Pensiones</label>
                                            <input type="text" placeholder="Ej: Porvenir" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.fondo_pensiones || ''} onChange={e => setFormData({...formData, fondo_pensiones: e.target.value})} />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">ARL</label>
                                            <input type="text" placeholder="Ej: Positiva" className="w-full px-4 py-2 bg-slate-50 border rounded-xl" value={formData.arl || ''} onChange={e => setFormData({...formData, arl: e.target.value})} />
                                        </div>
                                    </>
                                )}
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
                                            <button onClick={() => { setVacationData({ dias: 0, periodo: new Date().getFullYear().toString(), total_restantes: 0 }); setIsVacationModalOpen(true); }} className="px-5 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold flex items-center gap-2 shadow-lg shadow-amber-500/30 active:scale-95 transition-all">
                                                <ReceiptIcon fontSize="small" /> Compensación Económica
                                            </button>
                                        </div>

                                        {settings.pais === 'Colombia' && (
                                            <div className="mb-6 p-4 bg-emerald-50 border border-emerald-100 rounded-2xl">
                                                <p className="text-xs font-bold text-emerald-800 uppercase mb-3">Novedades del Mes (Horas Extra y Recargos CST 2026)</p>
                                                <p className="text-[10px] text-emerald-600 mb-2 font-mono">Divisor horas: {getDivisorHoras(new Date())} | Valor ordinario: $ {getValorHoraOrdinaria(Number(selectedEmpleado.sueldo_basico) || 0, new Date()).toLocaleString('es-CO', {maximumFractionDigits:0})}</p>
                                                <div className="grid grid-cols-4 gap-3">
                                                    <div>
                                                        <label className="block text-[10px] text-emerald-700 mb-1 font-bold">Rec. Nocturno (35%)</label>
                                                        <input type="number" step="0.5" className="w-full p-2 text-sm border-emerald-200 rounded-lg outline-none focus:ring-emerald-300" 
                                                            value={novedadesMes.recNocturno} onChange={e => setNovedadesMes({...novedadesMes, recNocturno: Number(e.target.value)})} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] text-emerald-700 mb-1 font-bold">H.E. Diurna (25%)</label>
                                                        <input type="number" step="0.5" className="w-full p-2 text-sm border-emerald-200 rounded-lg outline-none focus:ring-emerald-300" 
                                                            value={novedadesMes.heDiurnas} onChange={e => setNovedadesMes({...novedadesMes, heDiurnas: Number(e.target.value)})} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] text-emerald-700 mb-1 font-bold">H.E. Nocturna (75%)</label>
                                                        <input type="number" step="0.5" className="w-full p-2 text-sm border-emerald-200 rounded-lg outline-none focus:ring-emerald-300" 
                                                            value={novedadesMes.heNocturnas} onChange={e => setNovedadesMes({...novedadesMes, heNocturnas: Number(e.target.value)})} />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[10px] text-emerald-700 mb-1 font-bold">Dominical (90%)</label>
                                                        <input type="number" step="0.5" className="w-full p-2 text-sm border-emerald-200 rounded-lg outline-none focus:ring-emerald-300" 
                                                            value={novedadesMes.dominicales} onChange={e => setNovedadesMes({...novedadesMes, dominicales: Number(e.target.value)})} />
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="flex-1 flex flex-col items-center">
                                            {liquidaciones.length === 0 ? (
                                                <div className="flex-1 w-full flex flex-col justify-center items-center text-slate-400 border-2 border-dashed border-slate-100 rounded-2xl p-8 text-center bg-slate-50">
                                                    <ReceiptIcon sx={{ fontSize: 64, opacity: 0.2, marginBottom: '1rem' }} />
                                                    <p className="font-bold text-lg mb-1 hidden sm:block">Aún no hay recibos generados</p>
                                                    <p className="text-sm">Liquida el mes actual para generar el recibo en formato {settings.pais === 'Colombia' ? 'CST' : 'LCT'}.</p>
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
                                ⚠️ <strong>Historial Preservado:</strong> El empleado pasará al Historial de Bajas conservando datos y recibos. <br />
                                {settings.pais === 'Colombia' ? (
                                    <>⚖️ <strong>CST 2026:</strong> Cálculo estimativo basado en el Art. 64 (Indemnización). Verificable mediante planillas base.</>
                                ) : (
                                    <>⚖️ <strong>Actualización Ley Bases (2024):</strong> Las multas por registración deficiente han sido derogadas. El cálculo actual corresponde a LCT base.</>
                                )}
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
                                        <option value="Fin de periodo de prueba (Art. 92 bis)">Fin de periodo de prueba (Art. 92 bis)</option>
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
                                        <h4 className="font-bold text-sm text-slate-700">Liquidación Final Estimada ({settings.pais === 'Colombia' ? 'CST' : 'LCT'}) — {indemnizacion.anios} años de servicio</h4>
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
                                    <p className="text-[10px] text-slate-400 px-4 py-2">* Cálculo orientativo basado en {settings.pais === 'Colombia' ? 'CST Art. 64' : 'art. 231, 232, 241, 242, 245 LCT'}. No incluye retenciones o aportes patronales. Verificar con contador previo al pago.</p>
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
                                        <th className="text-right px-4 py-3 text-xs font-bold text-slate-500 uppercase">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {empleadosDesvinculados.map(emp => (
                                        <tr key={emp.id} className="border-b border-slate-50 hover:bg-rose-50/20">
                                            <td className="px-4 py-3 font-semibold text-slate-700">{emp.nombre}</td>
                                            <td className="px-4 py-3 text-slate-500">{emp.causal_egreso}</td>
                                            <td className="px-4 py-3 text-slate-500">{emp.fecha_egreso}</td>
                                            <td className="px-4 py-3 font-mono text-slate-400">{emp.cuil}</td>
                                            <td className="px-4 py-3 text-right">
                                                {emp.indemnizacion_json && (
                                                    <button
                                                        onClick={() => { setSelectedEmpleado(emp); setViewingIndemnizacion(JSON.parse(emp.indemnizacion_json!)); }}
                                                        className="px-3 py-1 bg-white border border-slate-200 shadow-sm text-xs font-bold text-slate-600 rounded-lg hover:text-rose-600 hover:border-rose-200 transition-colors"
                                                    >
                                                        Ver Detalle
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

            {/* Modal Detalle de Baja Preservado */}
            {viewingIndemnizacion && selectedEmpleado && (
                <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200 flex flex-col max-h-[90vh]">
                        <div className="p-5 border-b border-rose-100 bg-gradient-to-r from-slate-50 to-slate-100 flex justify-between items-center text-slate-800">
                            <div>
                                <h2 className="text-xl font-bold">Detalle de Liquidación Final</h2>
                                <p className="text-sm text-slate-500 font-medium">Archivado: {selectedEmpleado.nombre} | Baja: {selectedEmpleado.fecha_egreso}</p>
                            </div>
                            <button onClick={() => { setViewingIndemnizacion(null); setSelectedEmpleado(null); }} className="p-2 hover:bg-slate-200 rounded-full transition-colors text-slate-600"><CloseIcon /></button>
                        </div>

                        <div className="p-6 overflow-y-auto flex-1 space-y-5" id="print-dismissal-detail">
                            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden print-area">
                                <div className="bg-slate-100 px-4 py-3 flex items-center gap-2">
                                    <ReceiptIcon className="text-rose-500" fontSize="small" />
                                    <div className="w-full">
                                        <h4 className="font-bold text-sm text-slate-700">Liquidación Final (Cálculo a fecha de baja)</h4>
                                        <p className="text-xs text-slate-500 mt-1">
                                            <strong>Causal:</strong> {selectedEmpleado.causal_egreso} <br />
                                            <strong>Antigüedad calculada:</strong> {viewingIndemnizacion.anios} años
                                        </p>
                                    </div>
                                </div>
                                <table className="w-full text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50">
                                            <th className="text-left px-4 py-2 text-xs text-slate-500 font-bold uppercase">Concepto</th>
                                            <th className="text-left px-4 py-2 text-xs text-slate-500 font-bold uppercase">Detalle</th>
                                            <th className="text-right px-4 py-2 text-xs text-slate-500 font-bold uppercase">Monto Estimado</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {viewingIndemnizacion.items?.map((item: any, i: number) => (
                                            <tr key={i} className="border-b border-slate-100 hover:bg-slate-50">
                                                <td className="px-4 py-2.5 font-medium text-slate-700">{item.concepto}</td>
                                                <td className="px-4 py-2.5 text-slate-400 text-xs">{item.detalle}</td>
                                                <td className="px-4 py-2.5 text-right font-bold">{item.monto > 0 ? `$${Math.round(item.monto).toLocaleString('es-AR')}` : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {viewingIndemnizacion.total > 0 && (
                                    <div className="px-4 py-4 bg-slate-800 flex justify-between items-center text-white">
                                        <span className="font-bold">TOTAL ESTIMADO</span>
                                        <span className="text-xl font-black">${Math.round(viewingIndemnizacion.total).toLocaleString('es-AR')}</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-5 border-t border-slate-100 flex gap-3 bg-white shrink-0">
                            <button onClick={() => { setViewingIndemnizacion(null); setSelectedEmpleado(null); }} className="flex-1 py-3 bg-slate-100 rounded-xl font-bold text-slate-600">Cerrar</button>
                            <button
                                onClick={() => window.print()}
                                className="flex-1 py-3 bg-slate-800 hover:bg-slate-900 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                            >
                                <ReceiptIcon fontSize="small" /> Imprimir Detalle
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {viewingIndemnizacion && selectedEmpleado && (
                <div className="hidden print:block print-only p-8 text-black bg-white w-full min-h-screen">
                    <div className="mb-6 pb-4 border-b-2 border-slate-800">
                        <h2 className="text-2xl font-bold m-0">Detalle de Liquidación Final</h2>
                        <p className="mt-2 text-sm"><strong>Empleado:</strong> {selectedEmpleado.nombre} (CUIL: {selectedEmpleado.cuil})</p>
                        <p className="text-sm"><strong>Ingreso:</strong> {selectedEmpleado.fecha_ingreso} | <strong>Egreso:</strong> {selectedEmpleado.fecha_egreso}</p>
                        <p className="text-sm"><strong>Causal:</strong> {selectedEmpleado.causal_egreso}</p>
                    </div>
                    <table className="w-full border-collapse mt-4 text-sm">
                        <thead className="bg-slate-100">
                            <tr>
                                <th className="border border-slate-300 p-3 text-left font-bold text-slate-700">Concepto</th>
                                <th className="border border-slate-300 p-3 text-left font-bold text-slate-700">Detalle</th>
                                <th className="border border-slate-300 p-3 text-right font-bold text-slate-700">Monto</th>
                            </tr>
                        </thead>
                        <tbody>
                            {viewingIndemnizacion.items?.map((item: any, idx: number) => (
                                <tr key={idx}>
                                    <td className="border border-slate-300 p-3 text-slate-800">{item.concepto}</td>
                                    <td className="border border-slate-300 p-3 text-slate-600">{item.detalle}</td>
                                    <td className="border border-slate-300 p-3 text-right font-bold text-slate-800">{item.monto > 0 ? '$' + Math.round(item.monto).toLocaleString('es-AR') : '—'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    {viewingIndemnizacion.total > 0 && (
                        <div className="bg-slate-800 text-white mt-6 p-4 flex justify-between font-bold text-lg rounded-xl">
                            <span>TOTAL ESTIMADO</span>
                            <span>${Math.round(viewingIndemnizacion.total).toLocaleString('es-AR')}</span>
                        </div>
                    )}
                </div>
            )}

            {/* Compensación Económica Modal */}
            {isVacationModalOpen && selectedEmpleado && (
                <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in text-slate-800">
                    <div className="bg-white w-full max-w-md rounded-3xl shadow-2xl overflow-hidden animate-scale-in border border-slate-200">
                        <div className="p-6 border-b border-amber-100 bg-amber-50 flex justify-between items-center text-amber-900 font-bold">
                            <h2 className="text-xl flex items-center gap-2"><ReceiptIcon /> Compensación Económica</h2>
                            <button onClick={() => setIsVacationModalOpen(false)} className="p-2 hover:bg-amber-100 rounded-full transition-colors text-amber-600"><CloseIcon /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase mb-2">Empleado</p>
                                <p className="font-bold text-slate-800">{selectedEmpleado.nombre}</p>
                                <p className="text-xs text-slate-500">Sueldo Básico: ${selectedEmpleado.sueldo_basico.toLocaleString('es-AR')}</p>
                            </div>

                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Días a Compensar</label>
                                    <input
                                        type="number"
                                        className="w-full px-4 py-2 bg-slate-50 border rounded-xl font-bold"
                                        value={vacationData.dias}
                                        onChange={e => setVacationData({ ...vacationData, dias: Number(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Período (Año)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-2 bg-slate-50 border rounded-xl"
                                    value={vacationData.periodo}
                                    onChange={e => setVacationData({ ...vacationData, periodo: e.target.value })}
                                />
                            </div>

                            <div className="p-4 bg-amber-50 border border-amber-100 rounded-xl">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-bold text-amber-800">Monto Neto Calculado</span>
                                    <span className="text-xl font-black text-amber-900">${((Number(selectedEmpleado.sueldo_basico) / 30) * 0.805 * vacationData.dias).toLocaleString('es-AR')}</span>
                                </div>
                                <p className="text-[10px] text-amber-600 mt-1 italic text-center">Cálculo: (Bruto / 30) - 19.5% de aportes.</p>
                            </div>
                        </div>
                        <div className="p-6 border-t border-slate-100 flex flex-col gap-2">
                            <button
                                onClick={handleGenerarNotaCompensacion}
                                className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-slate-900 transition-colors"
                            >
                                <PictureAsPdfIcon fontSize="small" /> Generar Nota de Solicitud (PDF)
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

