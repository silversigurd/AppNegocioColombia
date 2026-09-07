// Plan comercial horneado en el build (VITE_APP_PLAN). Ver INSTRUCCIONES_SISTEMA.txt.
export const APP_PLAN = (import.meta.env.VITE_APP_PLAN as string) || 'avanzado';
export const hasHR = APP_PLAN !== 'basico';
