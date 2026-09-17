@echo off
setlocal
title Uay Market - Sistema
cd /d "%~dp0.."

REM Se ja estiver rodando, so abre o navegador.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  start "" "http://localhost:3000"
  exit /b 0
)

REM Backup automatico diario do banco antes de abrir. Com o sistema aberto,
REM ele mesmo gera um backup a cada 24 h em backups\uay-market-*.db.
if not exist "backups" mkdir "backups"
set HOJE=
for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyy-MM-dd"') do set HOJE=%%d
if "%HOJE%"=="" set HOJE=sem-data
if not exist "backups\auto-%HOJE%.db" (
  copy /y "prisma\dev.db" "backups\auto-%HOJE%.db" >nul 2>nul
)

REM Apaga backups automaticos deste script com mais de 30 dias.
forfiles /p "backups" /m "auto-*.db" /d -30 /c "cmd /c del @path" >nul 2>nul

echo Abrindo o Uay Market... deixe esta janela aberta (pode minimizar).
REM Abre o navegador assim que o servidor responder (espera ate 90 s), em vez de um tempo fixo.
start "" /min powershell -NoProfile -Command "$i = 0; while ($i -lt 90 -and -not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 1; $i++ }; Start-Process 'http://localhost:3000'"
call npm start
pause
