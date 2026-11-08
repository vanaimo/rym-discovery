@echo off
title Disinstalla Automazione RYM
echo Rimozione attivita' pianificata RYM_Daily_Discovery...
schtasks /delete /tn "RYM_Daily_Discovery" /f
if %ERRORLEVEL% equ 0 (
    echo [OK] Automazione rimossa con successo.
) else (
    echo [INFO] Nessuna automazione attiva trovata.
)
pause
