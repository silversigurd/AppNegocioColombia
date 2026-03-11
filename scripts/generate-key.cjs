const crypto = require('crypto');
const { machineIdSync } = require('node-machine-id');

const SECRET_SALT = 'CommerceOS_Pro_Secret_2026';

function generateKey(providedMachineId) {
    let machineId = providedMachineId;
    if (!machineId) {
        machineId = machineIdSync({ original: true }); // Auto-grab if no arg provided
    }

    const hash = crypto.createHmac('sha256', SECRET_SALT)
        .update(machineId)
        .digest('hex');

    // Format the hash to make it look like a product key (e.g., XXXX-XXXX-XXXX)
    const formattedKey = hash.substring(0, 16).toUpperCase().match(/.{1,4}/g).join('-');
    console.log(`\n=========================================`);
    console.log(`Hardware ID: ${machineId}`);
    console.log(`Activation Key: ${formattedKey}`);
    console.log(`=========================================\n`);
}

const arg = process.argv[2];
generateKey(arg);
