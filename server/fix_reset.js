const fs = require('fs');
let code = fs.readFileSync('server.js', 'utf8');

const routeStart = code.indexOf("app.post('/api/database/reset'");
const routeEnd = code.indexOf("app.get('/api/audit-logs'");
if (routeStart !== -1 && routeEnd !== -1) {
    let routeCode = code.substring(routeStart, routeEnd);
    routeCode = routeCode.replace(/db\.exec/g, "await tx.execute");
    code = code.substring(0, routeStart) + routeCode + code.substring(routeEnd);
}

fs.writeFileSync('server.js', code);
console.log('done fixing reset');
