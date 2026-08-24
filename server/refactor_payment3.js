const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

code = code.replace(/await db\.execute\('BEGIN TRANSACTION'\);/, "const tx = await db.transaction('write');");
code = code.replace(/await db\.execute\('ROLLBACK'\);/g, "if (typeof tx !== 'undefined') await tx.rollback();");

// Replace db.execute with tx.execute inside the route only
const routeStart = code.indexOf("app.post('/api/payments'");
const routeEnd = code.indexOf("app.get('/api/settings'");
if (routeStart !== -1 && routeEnd !== -1) {
    let routeCode = code.substring(routeStart, routeEnd);
    routeCode = routeCode.replace(/await db\.execute\(\{/g, "await tx.execute({");
    routeCode = routeCode.replace(/await db\.execute\('COMMIT'\);/g, "await tx.commit();");
    code = code.substring(0, routeStart) + routeCode + code.substring(routeEnd);
}

fs.writeFileSync('server.js', code);
console.log('done regex');
