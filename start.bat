@echo off
title EDGAR Extraction Terminal
echo.
echo  ========================================
echo   EDGAR Extraction Terminal
echo  ========================================
echo.

where node >nul 2>&1
if not errorlevel 1 goto :node_ok

echo  [AVISO] Node.js no esta instalado.
echo.

where winget >nul 2>&1
if not errorlevel 1 goto :winget_install

echo  [INFO] winget no disponible. Abriendo web de Node.js...
start https://nodejs.org
echo.
echo  1. Descarga e instala Node.js (LTS)
echo  2. Cierra esta ventana y vuelve a ejecutar start.bat
echo.
pause
exit /b 1

:winget_install
echo  [INFO] Instalando Node.js con winget (puede pedir permisos)...
winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
if errorlevel 1 (
    echo  [ERROR] La instalacion fallo. Abriendo web de Node.js...
    start https://nodejs.org
    echo  Instala Node.js manualmente y vuelve a ejecutar start.bat
    pause
    exit /b 1
)
echo  [OK] Node.js instalado. Refrescando PATH...
set "PATH=%ProgramFiles%\nodejs;%PATH%"
echo.

:node_ok
where pnpm >nul 2>&1
if errorlevel 1 (
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
