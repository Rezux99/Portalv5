@echo off
title EDGAR Extraction Terminal
echo.
echo  ========================================
echo   EDGAR Extraction Terminal
echo  ========================================
echo.

where node >nul 2>&1 || (
    echo  [ERROR] Node.js no esta instalado.
    echo  Descargalo de https://nodejs.org e instalalo.
    echo.
    pause
    exit /b 1
)

where pnpm >nul 2>&1 || (
    echo  [INFO] pnpm no encontrado, instalando...
    npm install -g pnpm
    echo.
)

if not exist "node_modules\" (
    echo  [INFO] Instalando dependencias...
    pnpm install
    echo.
)

echo  [INFO] Arrancando servidor en http://localhost:3000
echo  Pulsa Ctrl+C para detener.
echo.
pnpm dev
