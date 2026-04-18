const fs = require('fs');
const filePath = 'c:\\Users\\payal\\OneDrive\\Desktop\\Company_Projects\\ThindiFood\\Frontend\\src\\modules\\Food\\hooks\\useRestaurantNotifications.js';
let content = fs.readFileSync(filePath, 'utf8');

// Add console.log to socket listener
if (content.includes("socketRef.current.on('payment_pending'")) {
    content = content.replace(
        "debugLog('💰 Payment pending request received:', payload);",
        "console.log('DEBUG: Socket payment_pending received:', payload); debugLog('💰 Payment pending request received:', payload);"
    );
}

// Add console.log to handleIncomingPaymentAlert
if (content.includes("const handleIncomingPaymentAlert =")) {
    content = content.replace(
        "if (!paymentData?.sessionId) return;",
        "console.log('DEBUG: handleIncomingPaymentAlert called with:', paymentData); if (!paymentData?.sessionId) return;"
    );
}

fs.writeFileSync(filePath, content);
console.log('Hook updated with logs');
