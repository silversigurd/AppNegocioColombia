import { machineIdSync } from 'node-machine-id';
console.log('Machine ID:', machineIdSync({ original: true }));
