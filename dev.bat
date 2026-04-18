@echo off
echo ========================================================
echo       Iniciando Sistema de C^&G Electronics
echo ========================================================
echo.

echo Iniciando servidores... (Usando PowerShell)
echo.
echo ========================================================
echo IMPORTANTE: No cierres las ventanas azules/negras que 
echo se estan abriendo, o el sistema se apagara.
echo ========================================================
echo.

:: Se utiliza PowerShell dado que pnpm es un script ps1 en tu sistema
start "CYG: Backend (API)" powershell -ExecutionPolicy Bypass -NoExit -Command "cd artifacts\api-server; pnpm run dev"
start "CYG: Frontend (APP)" powershell -ExecutionPolicy Bypass -NoExit -Command "cd artifacts\inventario-ventas; pnpm run dev"

echo Esperando 6 segundos a que el servidor inicie...
ping 127.0.0.1 -n 6 >nul
start http://localhost:5000

exit
