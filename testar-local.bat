@echo off

title DU - Teste local

cd /d "%~dp0"

echo.
echo  ============================================================
echo   DU - TESTE LOCAL  (http://localhost:3001)
echo   Usa os dados locais (backend\data.json). Producao NAO e afetada.
echo   Login pelo Discord: preencha o .env da raiz antes.
echo  ============================================================
echo.

rem Abre o navegador assim que o servidor responder na porta 3001
start "" /min powershell -NoProfile -WindowStyle Hidden -Command "while (-not (Test-NetConnection localhost -Port 3001 -InformationLevel Quiet -WarningAction SilentlyContinue)) { Start-Sleep 2 }; Start-Process 'http://localhost:3001'"

call npm run local

pause
