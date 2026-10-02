const { chromium } = require('playwright-chromium');
const cheerio = require('cheerio');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { generateHtml } = require('./generate_html');

const CUTOFF_DATE = new Date('2025-11-05T00:00:00Z'); // 05/11/2025
const DATA_DIR = path.join(__dirname, 'data');
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const RELEASES_FILE = path.join(DATA_DIR, 'releases.json');
const OUTPUT_HTML = path.join(__dirname, 'index.html');

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Caches to avoid redundant API calls
const genreCache = new Map();
const bandcampCache = new Map();

async function fetchGenreDeezer(artist, album) {
    const cacheKey = `${artist.toLowerCase()}___${album.toLowerCase()}`;
    if (genreCache.has(cacheKey)) return genreCache.get(cacheKey);

    try {
        const query = encodeURIComponent(`artist:"${artist}" album:"${album}"`);
        const res = await axios.get(`https://api.deezer.com/search/album?q=${query}`, { timeout: 4000 });
        if (res.data && res.data.data && res.data.data.length > 0) {
            const item = res.data.data[0];
            const detail = await axios.get(`https://api.deezer.com/album/${item.id}`, { timeout: 4000 });
            const genres = detail.data.genres && detail.data.genres.data ? detail.data.genres.data.map(g => g.name).join(', ') : '';
            const result = {
                genre: genres,
                deezerCover: item.cover_big || item.cover_xl
            };
            genreCache.set(cacheKey, result);
            return result;
        }
    } catch (e) {
        // ignore
    }
    const emptyResult = { genre: '', deezerCover: null };
    genreCache.set(cacheKey, emptyResult);
    return emptyResult;
}

async function getRealBandcampUrl(artist, album) {
    const cacheKey = `${artist.toLowerCase()}___${album.toLowerCase()}`;
    if (bandcampCache.has(cacheKey)) return bandcampCache.get(cacheKey);

    try {
        const query = encodeURIComponent(`${artist} ${album}`);
        const res = await axios.get(`https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=${query}`, {
            headers: {
                'User-Agent': 'Bandcamp/3.0.0 (Android 14; Mobile)',
                'Accept': 'application/json'
            },
            timeout: 5000
        });

        if (res.data && res.data.results && res.data.results.length > 0) {
            const normArtist = artist.toLowerCase().replace(/[^\w\s]/g, '');
            const normAlbum = album.toLowerCase().replace(/[^\w\s]/g, '');

            let bestMatch = null;

            for (const item of res.data.results) {
                const itemName = (item.name || item.album_name || '').toLowerCase().replace(/[^\w\s]/g, '');
                const bandName = (item.band_name || '').toLowerCase().replace(/[^\w\s]/g, '');

                const albumScore = (itemName.includes(normAlbum) || normAlbum.includes(itemName));
                const artistScore = (bandName.includes(normArtist) || normArtist.includes(bandName));

                if (albumScore && artistScore) {
                    bestMatch = item;
                    if (item.type === 'a') break;
                } else if (albumScore && !bestMatch) {
                    bestMatch = item;
                }
            }

            if (bestMatch && bestMatch.url) {
                let cleanUrl = bestMatch.url;
                const match = cleanUrl.match(/https?:\/\/[a-zA-Z0-9\-_.]+\.bandcamp\.com\/(album|track)\/[a-zA-Z0-9\-_]+/);
                if (match) {
                    cleanUrl = match[0];
                } else {
                    const parts = cleanUrl.split('https://');
                    if (parts.length > 2) {
                        cleanUrl = 'https://' + parts[parts.length - 1];
                    }
                }
                bandcampCache.set(cacheKey, cleanUrl);
                return cleanUrl;
            }
        }
    } catch (e) {
        // ignore
    }
    bandcampCache.set(cacheKey, null);
    return null;
}

function normalizeKey(artist, album) {
    return `${artist.toLowerCase().trim().replace(/[^\w\s]/g, '')}___${album.toLowerCase().trim().replace(/[^\w\s]/g, '')}`;
}

async function navigateWithSafety(page, url) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 50000 });
    
    let notified = false;
    let attempts = 0;
    while (attempts < 20) {
        attempts++;
        await page.waitForTimeout(1000);
        const title = await page.title();
        
        if (title.includes('Security check') || title.includes('Ci siamo quasi') || title.includes('Just a moment') || title.includes('Cloudflare')) {
            if (!notified) {
                console.log(`\n\n[!] Verifica anti-bot in corso...`);
                notified = true;
            }
            await page.waitForTimeout(2000);
        } else {
            break;
        }
    }
}

function parseListHtml(html, listMeta, releasesMap, globalCounter) {
    const $ = cheerio.load(html);
    let count = 0;

    $('td.list_art').each((_, artTd) => {
        const tr = $(artTd).closest('tr');
        const img = $(artTd).find('img');
        let coverSrc = img.attr('data-src') || img.attr('src') || '';
        if (coverSrc.startsWith('//')) coverSrc = 'https:' + coverSrc;
        if (coverSrc.includes('blank.png')) coverSrc = '';

        const artistAnchor = tr.find('a.list_artist');
        const albumAnchor = tr.find('a.list_album');
        const relDate = tr.find('.rel_date').text().replace(/[()]/g, '').trim();

        const itemAnchor = tr.find('a[id^="item"]');
        const rawItemId = itemAnchor.attr('id') ? itemAnchor.attr('id').replace('item', '') : '';
        const itemId = parseInt(rawItemId, 10) || 0;
        const positionText = tr.find('td.number').text().trim() || tr.find('.list_mobile_number').text().replace('.', '').trim();
        const position = parseInt(positionText, 10) || 0;

        const artist = artistAnchor.text().trim();
        const artistHref = artistAnchor.attr('href') || '';
        const artistUrl = artistHref ? (artistHref.startsWith('http') ? artistHref : `https://rateyourmusic.com${artistHref}`) : '';
        
        const title = albumAnchor.text().trim();
        const albumHref = albumAnchor.attr('href') || '';
        const rymUrl = albumHref ? (albumHref.startsWith('http') ? albumHref : `https://rateyourmusic.com${albumHref}`) : '';

        if (artist && title) {
            count++;
            globalCounter.val++;
            const key = normalizeKey(artist, title);

            if (!releasesMap.has(key)) {
                releasesMap.set(key, {
                    id: key,
                    artist,
                    artistUrl,
                    title,
                    year: relDate,
                    cover: coverSrc,
                    rymUrl,
                    bandcampUrl: null,
                    spotifyUrl: `https://open.spotify.com/search/${encodeURIComponent(artist + ' ' + title)}`,
                    genre: '',
                    curators: [],
                    latestItemId: itemId,
                    addedOrder: globalCounter.val,
                    firstSeen: new Date().toISOString()
                });
            }

            const release = releasesMap.get(key);
            if (itemId > (release.latestItemId || 0)) {
                release.latestItemId = itemId;
            }
            if (!release.artistUrl && artistUrl) {
                release.artistUrl = artistUrl;
            }

            if (!release.curators.some(c => c.user === listMeta.user)) {
                release.curators.push({
                    user: listMeta.user,
                    userUrl: listMeta.userUrl,
                    listTitle: listMeta.listTitle,
                    listUrl: listMeta.listUrl,
                    favoriteDate: listMeta.favoriteDate,
                    itemId: itemId,
                    position: position
                });
            }

            if (!release.cover && coverSrc) {
                release.cover = coverSrc;
            }
        }
    });

    const nextPages = [];
    $('a.navlink, a.navlinknext, .pages a').each((_, a) => {
        const href = $(a).attr('href');
        if (href && href.startsWith(listMeta.relativeUrl) && !nextPages.includes(href)) {
            nextPages.push(href);
        }
    });

    return { count, nextPages };
}

async function runScraper() {
    console.log('=====================================================');
    console.log(' RateYourMusic List Scraper & New Additions Tracker  ');
    console.log('=====================================================\n');

    const isCI = !!process.env.CI;
    const userDataDir = path.join(__dirname, '.chrome_profile');
    
    console.log(`[1/4] Avvio del browser (${isCI ? 'Ambiente CI/Cloud' : 'Ambiente Locale'})...`);
    
    const launchOptions = {
        headless: isCI ? true : false,
        viewport: { width: 1280, height: 900 },
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    };

    if (!isCI && process.platform === 'win32' && fs.existsSync('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')) {
        launchOptions.executablePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
    }

    const context = await chromium.launchPersistentContext(userDataDir, launchOptions);
    const page = context.pages()[0] || await context.newPage();

    console.log('[2/4] Recupero delle liste preferite di vanaimo dal 05/11/2025...');
    let targetLists = [];

    try {
        await navigateWithSafety(page, 'https://rateyourmusic.com/favorite/by?user_req=vanaimo');
        await page.waitForTimeout(2000);
        const favHtml = await page.content();
        const $fav = cheerio.load(favHtml);

        $fav('table tr').each((i, el) => {
            const tds = $fav(el).find('td');
            if (tds.length >= 4) {
                const dateStr = $fav(tds[0]).text().trim();
                const userAnchor = $fav(tds[2]).find('a.user');
                const listAnchor = $fav(tds[3]).find('a.list');

                if (dateStr && listAnchor.length) {
                    const [mm, dd, yyyy] = dateStr.split('/');
                    const itemDate = new Date(`${yyyy}-${mm}-${dd}T00:00:00Z`);

                    if (itemDate >= CUTOFF_DATE) {
                        const listHref = listAnchor.attr('href');
                        targetLists.push({
                            favoriteDate: dateStr,
                            user: userAnchor.text().trim(),
                            userUrl: `https://rateyourmusic.com${userAnchor.attr('href')}`,
                            listTitle: listAnchor.text().trim(),
                            listUrl: listHref.startsWith('http') ? listHref : `https://rateyourmusic.com${listHref}`,
                            relativeUrl: listHref.replace(/\/$/, '')
                        });
                    }
                }
            }
        });
    } catch (e) {
        console.warn('Recupero target da target_lists.json:', e.message);
    }

    if (targetLists.length === 0 && fs.existsSync(path.join(__dirname, 'target_lists.json'))) {
        targetLists = JSON.parse(fs.readFileSync(path.join(__dirname, 'target_lists.json'), 'utf8')).map(l => ({
            ...l,
            relativeUrl: l.listUrl.replace('https://rateyourmusic.com', '').replace(/\/$/, '')
        }));
    }

    console.log(`Trovate ${targetLists.length} liste autorizzate.\n`);

    const releasesMap = new Map();
    const globalCounter = { val: 0 };

    console.log('[3/4] Scansione ed estrazione delle liste...');
    for (let idx = 0; idx < targetLists.length; idx++) {
        const listMeta = targetLists[idx];
        process.stdout.write(`[${idx + 1}/${targetLists.length}] ${listMeta.user} - "${listMeta.listTitle}" `);

        try {
            await navigateWithSafety(page, listMeta.listUrl);
            await page.waitForTimeout(1000);

            let listHtml = await page.content();
            const { count, nextPages } = parseListHtml(listHtml, listMeta, releasesMap, globalCounter);
            let totalForThisList = count;

            for (const nextPageHref of nextPages) {
                const fullNextUrl = nextPageHref.startsWith('http') ? nextPageHref : `https://rateyourmusic.com${nextPageHref}`;
                try {
                    await navigateWithSafety(page, fullNextUrl);
                    await page.waitForTimeout(800);
                    const subHtml = await page.content();
                    const subRes = parseListHtml(subHtml, listMeta, releasesMap, globalCounter);
                    totalForThisList += subRes.count;
                } catch (pe) {}
            }

            console.log(`(${totalForThisList} album estratti)`);
        } catch (err) {
            console.log(`(errore: ${err.message})`);
        }

        await page.waitForTimeout(1200);
    }

    await context.close();

    const allReleases = Array.from(releasesMap.values());
    console.log(`\nTotale album unici estratti dopo deduplicazione: ${allReleases.length}`);

    // SAFETY CHECK: If no releases were extracted (e.g. Cloudflare IP block in CI), DO NOT overwrite existing dataset!
    if (allReleases.length === 0) {
        console.warn('\n[!] ATTENZIONE: Nessun album estratto durante la scansione (possibile blocco IP/Cloudflare). I dati esistenti vengono preservati.');
        if (fs.existsSync(RELEASES_FILE)) {
            const existing = JSON.parse(fs.readFileSync(RELEASES_FILE, 'utf8'));
            const htmlContent = generateHtml(existing, { lastUpdated: new Date().toLocaleString('it-IT') });
            fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
            console.log(`Dashboard ripristinata con i ${existing.length} album precedenti.`);
        }
        return;
    }

    // Load previous state
    let previousState = {};
    if (fs.existsSync(STATE_FILE)) {
        try {
            previousState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        } catch (e) {}
    }

    const isFirstRun = Object.keys(previousState).length === 0;

    console.log('\n[4/4] Arricchimento generi e ricerca reale Bandcamp / Spotify...');
    const batchSize = 12;
    for (let i = 0; i < allReleases.length; i += batchSize) {
        const chunk = allReleases.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (item) => {
            if (previousState[item.id]) {
                item.isNew = false;
                item.firstSeen = previousState[item.id].firstSeen;
                if (previousState[item.id].genre) {
                    item.genre = previousState[item.id].genre;
                }
                if (previousState[item.id].bandcampUrl) {
                    item.bandcampUrl = previousState[item.id].bandcampUrl;
                }
            } else {
                item.isNew = !isFirstRun;
            }

            // Deezer genre
            if (!item.genre) {
                const deezerInfo = await fetchGenreDeezer(item.artist, item.title);
                if (deezerInfo.genre) item.genre = deezerInfo.genre;
                if (!item.cover && deezerInfo.deezerCover) item.cover = deezerInfo.deezerCover;
            }

            // Real Bandcamp URL
            if (item.bandcampUrl === undefined || item.bandcampUrl === null || item.bandcampUrl.includes('/search?')) {
                const realBcUrl = await getRealBandcampUrl(item.artist, item.title);
                item.bandcampUrl = realBcUrl;
            }

            item.spotifyUrl = `https://open.spotify.com/search/${encodeURIComponent(item.artist + ' ' + item.title)}`;
        }));
    }

    // Save updated state
    const newState = {};
    allReleases.forEach(r => {
        newState[r.id] = {
            id: r.id,
            artist: r.artist,
            artistUrl: r.artistUrl,
            title: r.title,
            genre: r.genre,
            bandcampUrl: r.bandcampUrl,
            latestItemId: r.latestItemId,
            firstSeen: r.firstSeen,
            lastSeen: new Date().toISOString()
        };
    });

    fs.writeFileSync(STATE_FILE, JSON.stringify(newState, null, 2), 'utf8');
    fs.writeFileSync(RELEASES_FILE, JSON.stringify(allReleases, null, 2), 'utf8');

    // Generate HTML dashboard
    const htmlContent = generateHtml(allReleases, {
        lastUpdated: new Date().toLocaleString('it-IT')
    });

    fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');

    console.log(`\n=====================================================`);
    console.log(` COMPLETATO CON SUCCESSO!`);
    console.log(` Dashboard salvata in: ${OUTPUT_HTML}`);
    console.log(` Totale album unici: ${allReleases.length}`);
    console.log(` Con link Bandcamp reale: ${allReleases.filter(r => r.bandcampUrl).length}`);
    console.log(` Con fallback Spotify: ${allReleases.filter(r => !r.bandcampUrl).length}`);
    console.log(`=====================================================\n`);
}

module.exports = { runScraper, fetchGenreDeezer, getRealBandcampUrl };

if (require.main === module) {
    runScraper().catch(console.error);
}
