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

echo Abrindo o Uay Market... deixe esta janela aberta (pode minimizar).
REM Abre o navegador assim que o servidor responder (espera ate 90 s), em vez de um tempo fixo.
start "" /min powershell -NoProfile -Command "$i = 0; while ($i -lt 90 -and -not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) { Start-Sleep -Seconds 1; $i++ }; Start-Process 'http://localhost:3000'"
call npm start
pause
