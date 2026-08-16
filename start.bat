@echo off
title Portal EDGAR
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo  Necesitas Node.js. Abriendo https://nodejs.org ...
    start https://nodejs.org
    echo  Instala Node.js LTS y vuelve a ejecutar start.bat
    pause
    exit /b 1
)

where pnpm >nul 2>&1
if errorlevel 1 (
    echo  Instalando pnpm...
    call npm install -g pnpm
)

if not exist "node_modules\" (
    echo  Instalando dependencias - solo la primera vez...
    call pnpm approve-builds msw
    call pnpm install
    if errorlevel 1 (
        echo.
        echo  Error instalando dependencias.
        echo  Prueba ejecutar manualmente: pnpm install
        pause
        exit /b 1
    )
)

echo.
echo  Abriendo http://localhost:3000 ...
start http://localhost:3000
echo  Servidor listo. Pulsa Ctrl+C para detener.
echo.
call pnpm dev
pause
