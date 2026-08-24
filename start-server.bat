@echo off
title Water Billing System Startup
echo =========================================
echo      Water Billing System Launcher
echo =========================================
echo.
echo Starting Backend Server (Port 5000)...
start "Water Billing Backend" cmd /k "cd server && npm install && node server.js"

echo.
echo Starting Frontend Application...
start "Water Billing Frontend" cmd /k "npm install && npm run dev -- --host"

echo.
echo Both servers are starting up in separate windows!
echo Please wait a moment, then open http://localhost:5173 in your browser.
echo.
pause
