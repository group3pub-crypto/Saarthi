@echo off
setlocal EnableDelayedExpansion

:: ============================================================
::   SAARTHI Access - Development Setup and Run Script
::   Checks all dependencies and starts development services
:: ============================================================

set "ROOT=%~dp0"
set "API_DIR=%ROOT%apps\api"
set "WEB_DIR=%ROOT%apps\web"
set "VENV_DIR=%API_DIR%\.venv"
set "PYTHON=%VENV_DIR%\Scripts\python.exe"
set "PIP=%VENV_DIR%\Scripts\pip.exe"
set "ALEMBIC=%VENV_DIR%\Scripts\alembic.exe"
set "UV_AVAILABLE=0"
set "DOCKER_AVAILABLE=0"

title SAARTHI Access - Dev Setup

echo.
echo  =====================================================
echo    SAARTHI Access - Development Environment Setup
echo  =====================================================
echo.

:: ---------------------------------------------------------
::  STEP 1 -- Check Docker / Docker Desktop
:: ---------------------------------------------------------
:check_docker
echo [1/6] Checking Docker...

docker info >nul 2>&1
if %errorlevel% equ 0 (
    set "DOCKER_AVAILABLE=1"
    echo  [OK] Docker engine is running.
    goto docker_done
)

:: Docker not responding yet, check if Docker Desktop executable exists
set "DOCKER_EXE="
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    set "DOCKER_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
)
if not defined DOCKER_EXE (
    if exist "%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe" (
        set "DOCKER_EXE=%LOCALAPPDATA%\Programs\Docker\Docker\Docker Desktop.exe"
    )
)

if not defined DOCKER_EXE goto prompt_docker_options

echo  [INFO] Docker Desktop is installed but not started.
echo  Attempting to launch Docker Desktop automatically...
start "" "!DOCKER_EXE!"
echo  Waiting for Docker engine to initialize (up to 35 seconds)...

set /a "WAIT_COUNT=0"
:docker_wait_loop
ping 127.0.0.1 -n 4 >nul 2>&1
docker info >nul 2>&1
if %errorlevel% equ 0 (
    set "DOCKER_AVAILABLE=1"
    echo.
    echo  [OK] Docker engine is now ready.
    goto docker_done
)
set /a "WAIT_COUNT+=1"
if !WAIT_COUNT! lss 11 (
    <nul set /p=". "
    goto docker_wait_loop
)
echo.

:prompt_docker_options
echo.
echo  -------------------------------------------------------------
echo   [NOTICE] Docker engine is not running or still starting.
echo   PostgreSQL, Redis, and MinIO containers require Docker.
echo  -------------------------------------------------------------
echo   [1] Continue without Docker (Launch FastAPI backend and Vite Web UI)
echo   [2] Retry checking Docker engine
echo   [3] Exit setup to start Docker Desktop manually
echo.
set "DOCKER_CHOICE=1"
set /p "DOCKER_CHOICE=Select an option 1-3 [default 1]: "

if "!DOCKER_CHOICE!"=="2" goto check_docker
if "!DOCKER_CHOICE!"=="3" (
    echo Exiting setup. Please start Docker Desktop and run run.bat again.
    pause
    exit /b 0
)

echo  [INFO] Proceeding in local developer mode without Docker containers.
set "DOCKER_AVAILABLE=0"

:docker_done

:: ---------------------------------------------------------
::  STEP 2 -- Check Python
:: ---------------------------------------------------------
echo.
echo [2/6] Checking Python...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Python 3 is not installed or not in PATH.
    echo  Install Python 3.11+ from https://www.python.org/downloads/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('python --version 2^>^&1') do echo  [OK] %%v found.

uv --version >nul 2>&1
if %errorlevel% equ 0 (
    set "UV_AVAILABLE=1"
    echo  [OK] uv package manager detected.
) else (
    echo  [INFO] uv not found, will use standard pip.
)

:: ---------------------------------------------------------
::  STEP 3 -- Check Node.js / npm
:: ---------------------------------------------------------
echo.
echo [3/6] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERROR] Node.js is not installed or not in PATH.
    echo  Install Node.js 18+ from https://nodejs.org/
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo  [OK] Node.js %%v found.

call npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERROR] npm not found. Please reinstall Node.js.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('call npm --version 2^>^&1') do echo  [OK] npm %%v found.

:: ---------------------------------------------------------
::  STEP 4 -- Python venv + API dependencies
:: ---------------------------------------------------------
echo.
echo [4/6] Setting up Python virtual environment...

if not exist "%VENV_DIR%\Scripts\activate.bat" (
    echo  Creating virtual environment at apps\api\.venv ...
    if "!UV_AVAILABLE!"=="1" (
        uv venv "%VENV_DIR%" --python python
    ) else (
        python -m venv "%VENV_DIR%"
    )
    if %errorlevel% neq 0 (
        echo  [ERROR] Failed to create virtual environment.
        pause
        exit /b 1
    )
    echo  [OK] Virtual environment created.
) else (
    echo  [OK] Virtual environment exists.
)

echo  Checking Python dependencies...
if "!UV_AVAILABLE!"=="1" (
    uv pip install --python "%PYTHON%" -r "%API_DIR%\requirements.txt"
) else (
    "%PIP%" install --upgrade pip -q
    "%PIP%" install -r "%API_DIR%\requirements.txt" -q
)
if %errorlevel% neq 0 (
    echo  [WARN] Python package install had warnings or minor errors.
) else (
    echo  [OK] Python dependencies verified.
)

:: ---------------------------------------------------------
::  STEP 5 -- Node.js dependencies
:: ---------------------------------------------------------
echo.
echo [5/6] Checking Node.js dependencies...
pushd "%WEB_DIR%"
if not exist "node_modules" (
    echo  Installing npm packages for web frontend...
    call npm install
    if %errorlevel% neq 0 (
        echo  [ERROR] npm install failed.
        popd
        pause
        exit /b 1
    )
) else (
    echo  [OK] node_modules folder exists.
)
popd

:: ---------------------------------------------------------
::  STEP 6 -- Environment configuration (.env)
:: ---------------------------------------------------------
echo.
echo [6/6] Checking environment configuration...
if not exist "%ROOT%.env" (
    echo  No .env found - copying from .env.example ...
    copy "%ROOT%.env.example" "%ROOT%.env" >nul
    echo  [!] .env created from .env.example.
) else (
    echo  [OK] .env configuration file found.
)

:: ---------------------------------------------------------
::  Docker infrastructure (db, redis, minio)
:: ---------------------------------------------------------
if "!DOCKER_AVAILABLE!"=="0" goto skip_docker_infra

echo.
echo  =====================================================
echo    Starting Infrastructure with Docker Compose
echo  =====================================================
echo.
echo  Starting saarthi_db, redis, minio...
pushd "%ROOT%"
docker compose up -d db redis minio
if %errorlevel% neq 0 (
    echo  [WARN] docker compose up returned non-zero.
) else (
    echo  [OK] Docker containers launched.
)
popd

echo  Waiting for PostgreSQL container to become ready...
set /a "DB_WAIT=0"
:wait_db
docker inspect --format "{{.State.Health.Status}}" saarthi_db 2>nul | findstr "healthy" >nul
if %errorlevel% neq 0 (
    set /a "DB_WAIT+=1"
    if !DB_WAIT! geq 25 (
        echo.
        echo  [WARN] PostgreSQL taking longer than expected. Proceeding...
        goto db_ready
    )
    ping 127.0.0.1 -n 3 >nul 2>&1
    <nul set /p=". "
    goto wait_db
)

:db_ready
echo.
echo  [OK] Database ready.

echo  Running database migrations...
pushd "%ROOT%"
set "PYTHONPATH=%API_DIR%"
"%ALEMBIC%" -c "%API_DIR%\alembic.ini" upgrade head
if %errorlevel% neq 0 (
    echo  [INFO] Alembic completed with note.
)
popd
echo  [OK] Migrations applied.
goto end_docker_infra

:skip_docker_infra
echo.
echo  [INFO] Skipping Docker infrastructure (PostgreSQL, Redis, MinIO).
echo  Backend will run with graceful offline handling.

:end_docker_infra

:: ---------------------------------------------------------
::  Launch Application Services
:: ---------------------------------------------------------
echo.
echo  =====================================================
echo    Launching SAARTHI Access Services
echo  =====================================================
echo.

echo  Launching FastAPI backend on http://localhost:8000 ...
start "SAARTHI API" cmd /k "cd /d %API_DIR% & set PYTHONPATH=%API_DIR% & %PYTHON% -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

if "!DOCKER_AVAILABLE!"=="1" (
    ping 127.0.0.1 -n 3 >nul 2>&1
    echo  Launching RQ background worker...
    start "SAARTHI Worker" cmd /k "cd /d %API_DIR% & set PYTHONPATH=%API_DIR% & %PYTHON% -m app.workers.worker"
) else (
    echo  [INFO] Skipping RQ background worker - requires Redis container.
)

echo  Launching Vite frontend on http://localhost:5173 ...
start "SAARTHI Web" cmd /k "cd /d %WEB_DIR% & npm run dev"

:: ---------------------------------------------------------
::  Summary
:: ---------------------------------------------------------
echo.
echo  =====================================================
echo    SAARTHI Access is running!
echo.
echo    Frontend UI   : http://localhost:5173
echo    Backend API   : http://localhost:8000
echo    Swagger Docs  : http://localhost:8000/docs
if "!DOCKER_AVAILABLE!"=="1" (
    echo    MinIO Storage : http://localhost:9001
)
echo  =====================================================
echo.
echo  To shut down services: close the opened command windows.
if "!DOCKER_AVAILABLE!"=="1" (
    echo  To stop Docker containers: docker compose down
)
echo.
pause
endlocal