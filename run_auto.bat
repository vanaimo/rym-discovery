@echo off
cd /d "%~dp0"
set PATH=C:\Program Files\nodejs;C:\Users\alber\AppData\Local\Programs\Git\cmd;%PATH%

:: Assicura che la cartella data esista
if not exist "data" mkdir data

echo ===================================================== >> "data\auto_run.log"
echo [AUTO RUN] %DATE% %TIME% >> "data\auto_run.log"
echo ===================================================== >> "data\auto_run.log"

:: 1. Esegui lo scraper per raccogliere nuovi dati
node scraper.js >> "data\auto_run.log" 2>&1

:: 2. Sincronizzazione automatica su GitHub Pages se ci sono modifiche
git add data/ index.html target_lists.json scraper.js generate_html.js README.md .github/ >> "data\auto_run.log" 2>&1
git diff --staged --quiet || (
    git commit -m "Auto-update RateYourMusic releases [auto-scheduler]" >> "data\auto_run.log" 2>&1
    git push origin main >> "data\auto_run.log" 2>&1
)

echo [AUTO RUN COMPLETATO] %DATE% %TIME% >> "data\auto_run.log"
