@echo off
title EDGAR Extraction Terminal
echo.
echo  ========================================
echo   EDGAR Extraction Terminal
echo  ========================================
echo.

where node >nul 2>&1
if errorlevel 1 goto :install_node
goto :node_ok

:install_node
echo  [AVISO] Node.js no esta instalado. Descargando...
echo.
curl -Lo "%TEMP%\node-installer.msi" "https://nodejs.org/dist/v22.18.0/node-v22.18.0-x64.msi"
if errorlevel 1 (
    echo  [ERROR] No se pudo descargar Node.js.
    echo  Abriendo https://nodejs.org - instalalo y vuelve a ejecutar start.bat
    start https://nodejs.org
    pause
    exit /b 1
)
echo.
echo  [INFO] Instalando Node.js (puede pedir permisos)...
msiexec /i "%TEMP%\node-installer.msi" /qn
if errorlevel 1 msiexec /i "%TEMP%\node-installer.msi"
del "%TEMP%\node-installer.msi" >nul 2>&1
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
