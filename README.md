# RateYourMusic List Scraper & Dashboard

Sistema di monitoraggio e scraping per le liste preferite di RateYourMusic dell'utente `vanaimo` (a partire dal 05/11/2025).

## Caratteristiche
- **Scraping Liste RateYourMusic**: Estrae album, artisti, anno di pubblicazione, copertine in alta risoluzione e link diretti.
- **Deduplicazione Automatica**: Se più utenti consigliano lo stesso album, compare una sola volta con l'elenco dei rispettivi curatori/utenti.
- **Arricchimento Generi & Bandcamp**: Identifica automaticamente i generi musicali e crea i link diretti per l'ascolto/acquisto su Bandcamp.
- **Rilevamento Nuove Aggiunte**: Mantiene lo storico in `data/state.json` evidenziando con badge **NEW** gli album aggiunti recentemente dagli utenti nelle loro liste.
- **Dashboard HTML Elegante**: File [index.html](index.html) reattivo in Dark Mode con barra di ricerca istantanea, filtri per genere e curatore, ordinamento e link rapidi a RYM e Bandcamp.

## Come Avviare lo Scraper
Puoi aggiornare i dati e rigenerare la dashboard in due modi:

1. **Doppio clic sul file `run.bat`** (aprirà automaticamente il browser al termine).
2. Oppure da terminale eseguendo:
   ```bash
   node scraper.js
   ```

## File del Progetto
- `scraper.js`: Script principale per l'estrazione e l'aggiornamento dei dati.
- `generate_html.js`: Generatore della dashboard visuale interattiva.
- `index.html`: Dashboard finale visualizzabile in qualsiasi browser.
- `data/state.json`: Database locale per il tracciamento delle nuove uscite.
- `data/releases.json`: Tutti gli album estratti in formato JSON.
- `run.bat`: Launcher a 1-clic per Windows.
