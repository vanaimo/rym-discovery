@echo off
title RateYourMusic Scraper & Auto-Sync
echo =====================================================
echo  Avvio RateYourMusic Scraper...
echo =====================================================
set PATH=C:\Users\alber\AppData\Local\Programs\Git\cmd;%PATH%
node scraper.js

echo.
echo =====================================================
echo  Sincronizzazione su GitHub Pages...
echo =====================================================
git add data/ index.html target_lists.json scraper.js generate_html.js README.md .github/
git diff --staged --quiet || (
    git commit -m "Aggiornamento automatico liste e dashboard"
    git push origin main
    echo [OK] Sito online aggiornato su https://vanaimo.github.io/rym-discovery/
)

echo.
echo Apertura del file index.html in locale...
start index.html
pause
