@echo off
setlocal EnableExtensions
chcp 65001 >nul
cd /d "%~dp0"

set "OPEN_FLAG="
if /I "%~1"=="--no-open" set "OPEN_FLAG=--no-open"

echo ============================================================
echo   General Record System
echo ============================================================

set "PYTHON_CMD="
python -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
if not errorlevel 1 set "PYTHON_CMD=python"

if not defined PYTHON_CMD (
  py -3 -c "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)" >nul 2>nul
  if not errorlevel 1 set "PYTHON_CMD=py -3"
)

if not defined PYTHON_CMD (
  echo [ERROR] Python 3.10 or newer was not found.
  echo         Install Python from https://www.python.org/downloads/
  echo         and enable "Add python.exe to PATH".
  echo.
  pause
  exit /b 1
)

if not exist "dist\index.html" (
  echo [INFO] Frontend build not found. Building it now...
  where npm >nul 2>nul
  if errorlevel 1 (
    echo [ERROR] Node.js and npm are required for the first build.
    echo         Install Node.js 18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
  )
  if not exist ".tmp" mkdir ".tmp"
  set "TEMP=%CD%\.tmp"
  set "TMP=%CD%\.tmp"
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    echo.
    pause
    exit /b 1
  )
  call npm run build
  if errorlevel 1 (
    echo [ERROR] Frontend build failed.
    echo.
    pause
    exit /b 1
  )
)

echo [INFO] Starting with config.json
echo [INFO] Optional env overrides: GRS_HOST, GRS_PORT, GRS_DB, GRS_PLAN_DB, GRS_DOCS_DB, GRS_OPEN_BROWSER, GRS_DEBUG
echo [INFO] Press Ctrl+C to stop the server.
echo.

%PYTHON_CMD% server.py %OPEN_FLAG%
if errorlevel 1 (
  echo.
  echo [ERROR] The server exited unexpectedly.
  echo         Check config.json, the port, or the database paths.
  echo         You can override settings without editing config.json, for example:
  echo             set GRS_PORT=8790
  echo             set GRS_DB=D:\data\my-records.db
  echo             set GRS_PLAN_DB=D:\data\my-plans.db
  echo             set GRS_DOCS_DB=D:\data\my-docs.db
  echo.
  pause
)

endlocal
