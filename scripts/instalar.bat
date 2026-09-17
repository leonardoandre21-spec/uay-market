@echo off
setlocal
title Uay Market - Instalacao
cd /d "%~dp0.."

echo ==============================================
echo   Uay Market - Instalacao no PC do mercado
echo ==============================================
echo.

REM Nao instala nem atualiza com o sistema aberto: o build regrava a pasta .next
REM e o Prisma troca arquivos em uso, e o caixa aberto quebra no meio.
powershell -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"
if not errorlevel 1 (
  echo [ERRO] O Uay Market esta aberto neste PC.
  echo Feche a janela preta do sistema ^(a do iniciar.bat^) e rode este arquivo de novo.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERRO] Node.js nao encontrado.
  echo Baixe e instale a versao LTS em https://nodejs.org e rode este arquivo de novo.
  pause
  exit /b 1
)

set NODE_MAJOR=
for /f "tokens=1 delims=v." %%a in ('node -v') do set NODE_MAJOR=%%a
echo Node.js encontrado:
node -v
if "%NODE_MAJOR%"=="" goto node_antigo
if %NODE_MAJOR% LSS 20 goto node_antigo

REM Banco ja existente: atualizacao (mantem) ou copia da pasta de outra maquina (dados de teste).
if not exist "prisma\dev.db" goto banco_ok
echo.
echo [ATENCAO] Ja existe um banco de dados em prisma\dev.db.
echo   - Se este PC ja usa o Uay Market e voce esta atualizando, responda S: os dados ficam.
echo   - Se e uma instalacao nova e o banco veio junto na copia da pasta ^(dados de teste^),
echo     responda N: esse banco e guardado de lado e o sistema comeca vazio.
choice /c SN /n /m "Manter o banco existente? [S/N] "
if errorlevel 2 (
  for /f %%d in ('powershell -NoProfile -Command "Get-Date -Format yyyyMMdd-HHmmss"') do set CARIMBO=%%d
  call :guardar_banco
)
:banco_ok

echo.
echo Conferindo o arquivo .env...
node scripts\segredo-env.mjs
if errorlevel 1 goto erro
findstr /c:"troque-por" ".env" >nul 2>nul
if not errorlevel 1 (
  echo [ERRO] O .env ainda esta com o segredo de exemplo. Edite SESSAO_SEGREDO no .env e rode de novo.
  pause
  exit /b 1
)

echo.
echo Instalando dependencias (pode levar alguns minutos)...
call npm install --no-audit --no-fund
if errorlevel 1 goto erro

echo.
echo Preparando o banco de dados...
call npx prisma migrate deploy
if errorlevel 1 goto erro
call npx prisma generate
if errorlevel 1 goto erro
call npm run db:seed
if errorlevel 1 goto erro

echo.
echo Gerando a versao de producao (pode levar alguns minutos)...
call npm run build
if errorlevel 1 goto erro

echo.
echo ==============================================
echo   Instalacao concluida!
echo   Pra abrir o sistema, use o arquivo scripts\iniciar.bat
echo   Login inicial: Administrador, PIN 1234 (troque em Configuracoes)
echo ==============================================
pause
exit /b 0

:guardar_banco
if "%CARIMBO%"=="" set CARIMBO=antigo
move /y "prisma\dev.db" "prisma\dev-guardado-%CARIMBO%.db" >nul
if exist "prisma\dev.db-journal" del /q "prisma\dev.db-journal"
echo Banco anterior guardado em prisma\dev-guardado-%CARIMBO%.db
exit /b 0

:node_antigo
echo [ERRO] Este Node.js e antigo demais. Instale a versao LTS 20 ou mais nova em https://nodejs.org
pause
exit /b 1

:erro
echo.
echo [ERRO] A instalacao falhou. Tire uma foto desta tela e mande pro suporte.
pause
exit /b 1
