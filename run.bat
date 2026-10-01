@echo off
title RateYourMusic Scraper
echo =====================================================
echo  Avvio RateYourMusic Scraper & Generatore HTML...
echo =====================================================
node scraper.js
echo.
echo Operazione completata. Apertura del file index.html nel browser...
start index.html
pause
