@echo off

title FAST - Teste local

cd /d "%~dp0"

echo.

echo  ============================================================

echo   FAST - TESTE LOCAL  (http://localhost:3000)

echo   Copia dos dados REAIS da producao (somente leitura) no banco fast-local

echo   Producao (fastunit.shardweb.app) NAO e afetada.

echo  ============================================================

echo.

start "" cmd /c "timeout /t 60 /nobreak >nul && start http://localhost:3000"

call npm run testar:local

pause

