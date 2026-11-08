@echo off
title Autenticazione GitHub - rym-discovery
echo =====================================================
echo  Verifica e Connessione GitHub (account vanaimo)
echo =====================================================
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;C:\Users\alber\AppData\Local\Programs\Git\cmd;%PATH%

echo.
echo Tento il caricamento su GitHub...
git push -u origin main

if %ERRORLEVEL% equ 0 (
    echo.
    echo =====================================================
    echo  [OK] Connessione riuscita! 
    echo  Il tuo account GitHub e' configurato e autorizzato.
    echo  Le esecuzioni automatiche potranno aggiornare il sito
    echo  senza alcun intervento manuale.
    echo =====================================================
) else (
    echo.
    echo =====================================================
    echo  [ATTENZIONE] Il push non e' andato a buon fine.
    echo  Se si e' aperta una finestra del browser, accedi con
    echo  l'account GitHub "vanaimo" e autorizza Git Credential Manager.
    echo =====================================================
)

pause
