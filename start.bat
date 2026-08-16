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
    npm install -g pnpm
)

if not exist "node_modules\" (
    echo  Instalando dependencias - solo la primera vez...
    pnpm install
    if errorlevel 1 (
        echo  Error. Ejecuta manualmente: pnpm install
        pause
        exit /b 1
    )
)

echo.
echo  Servidor listo en http://localhost:3000
echo  Pulsa Ctrl+C para detener.
echo.
pnpm dev
