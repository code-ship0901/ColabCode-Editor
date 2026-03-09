@echo off
echo Starting ColabCode...

:: Start Backend
start cmd /k "cd backend && node server.js"

:: Start Frontend
start cmd /k "cd app && npm run dev"

echo Backend and Frontend are starting in separate windows.
echo Portal ready at http://localhost:5173
pause
