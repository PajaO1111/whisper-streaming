@echo off
setlocal

REM Přepni se do složky, kde leží tento BAT soubor
cd /d "%~dp0"

REM Pokud existuje virtuální prostředí .venv
if exist ".venv\Scripts\python.exe" (
    ".venv\Scripts\python.exe" "server.py"
    goto :eof
)

REM Pokud existuje virtuální prostředí venv
if exist "venv\Scripts\python.exe" (
    "venv\Scripts\python.exe" "server.py"
    goto :eof
)

REM Jinak použij systémový Python
py -3 "server.py" 2>nul
if %errorlevel%==0 goto :eof

python "server.py"
