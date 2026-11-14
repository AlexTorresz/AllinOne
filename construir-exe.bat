@echo off
cd /d "%~dp0"
echo.
echo  === All in One: gerando o .exe ===
echo.
if not exist node_modules (
  echo Instalando dependencias (so na primeira vez)...
  call npm install
  if errorlevel 1 goto erro
)
call npm run build
if errorlevel 1 goto erro
echo.
echo  Pronto! O programa esta em:
echo  dist\All in One-win32-x64\All in One.exe
echo.
start "" "dist\All in One-win32-x64"
exit /b 0

:erro
echo.
echo  Algo deu errado. Copie a mensagem acima e me envie.
pause
exit /b 1
