@echo off
echo Starting Water Billing System...

echo Starting backend...
start cmd /k "cd server && node server.js"

echo Starting frontend...
start cmd /k "npm run dev"

echo Done! Both servers are starting.
