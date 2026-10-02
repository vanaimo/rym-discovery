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

// Caches
const bandcampCache = new Map();
const bandcampArtistTagCache = new Map();
const dateCache = new Map();
const hdCoverCache = new Map();

function formatDateToIT(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) {
            const m = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (m) return `${m[3]}/${m[2]}/${m[1]}`;
            if (/^\d{4}$/.test(dateStr.trim())) return dateStr.trim();
            return dateStr;
        }
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yyyy = d.getFullYear();
        return `${dd}/${mm}/${yyyy}`;
    } catch (e) {
        return dateStr;
    }
}

async function getFullReleaseDate(artist, album, currentYear) {
    const cacheKey = `${artist.toLowerCase()}___${album.toLowerCase()}`;
    if (dateCache.has(cacheKey)) return dateCache.get(cacheKey);

    // 1. iTunes lookup (exact day/month/year)
    try {
        const query = encodeURIComponent(`${artist} ${album}`);
        const res = await axios.get(`https://itunes.apple.com/search?term=${query}&entity=album&limit=1`, { timeout: 4000 });
        if (res.data && res.data.results && res.data.results.length > 0) {
            const item = res.data.results[0];
            if (item.releaseDate) {
                const formatted = formatDateToIT(item.releaseDate);
                dateCache.set(cacheKey, formatted);
                return formatted;
            }
        }
    } catch (e) {}

    // 2. MusicBrainz lookup
    try {
        const query = encodeURIComponent(`release:"${album}" AND artist:"${artist}"`);
        const res = await axios.get(`https://musicbrainz.org/ws/2/release/?query=${query}&fmt=json&limit=1`, {
            headers: { 'User-Agent': 'RYMDiscovery/1.0.0 ( contact@example.com )' },
            timeout: 4000
        });
        if (res.data && res.data.releases && res.data.releases.length > 0) {
            const rel = res.data.releases[0];
            if (rel.date) {
                const formatted = formatDateToIT(rel.date);
                dateCache.set(cacheKey, formatted);
                return formatted;
            }
        }
    } catch (e) {}

    const fallback = currentYear || '';
    dateCache.set(cacheKey, fallback);
    return fallback;
}

async function getHDCover(artist, album, currentCover) {
    const cacheKey = `${artist.toLowerCase()}___${album.toLowerCase()}`;
    if (hdCoverCache.has(cacheKey)) return hdCoverCache.get(cacheKey);

    // 1. Check Bandcamp HD Cover (_10.jpg is full resolution)
    try {
        const query = encodeURIComponent(`${artist} ${album}`);
        const res = await axios.get(`https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=${query}`, {
            headers: { 'User-Agent': 'Bandcamp/3.0.0 (Android 14; Mobile)' },
            timeout: 4000
        });
        if (res.data && res.data.results && res.data.results.length > 0) {
            for (const item of res.data.results) {
                if (item.img && (item.type === 'a' || item.type === 't')) {
                    const hdUrl = item.img.replace(/_\d+\.jpg$/, '_10.jpg');
                    hdCoverCache.set(cacheKey, hdUrl);
                    return hdUrl;
                }
            }
        }
    } catch (e) {}

    // 2. Check iTunes HD Cover (600x600)
    try {
        const query = encodeURIComponent(`${artist} ${album}`);
        const res = await axios.get(`https://itunes.apple.com/search?term=${query}&entity=album&limit=1`, { timeout: 4000 });
        if (res.data && res.data.results && res.data.results.length > 0) {
            const item = res.data.results[0];
            if (item.artworkUrl100) {
                const hdUrl = item.artworkUrl100.replace('100x100bb', '600x600bb');
                hdCoverCache.set(cacheKey, hdUrl);
                return hdUrl;
            }
        }
    } catch (e) {}

    hdCoverCache.set(cacheKey, currentCover);
    return currentCover;
}

async function getBandcampData(artist, album) {
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
            let tags = [];

            for (const item of res.data.results) {
                if (item.tag_names && Array.isArray(item.tag_names) && item.tag_names.length > 0 && tags.length === 0) {
                    tags = item.tag_names;
                }

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

                let formattedTags = '';
                if (tags.length > 0) {
                    formattedTags = tags.slice(0, 3).map(t => t.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ');
                }

                let hdImg = null;
                if (bestMatch.img) {
                    hdImg = bestMatch.img.replace(/_\d+\.jpg$/, '_10.jpg');
                }

                const result = {
                    url: cleanUrl,
                    genre: formattedTags,
                    hdCover: hdImg
                };
                bandcampCache.set(cacheKey, result);
                return result;
            }
        }
    } catch (e) {
        // ignore
    }

    const empty = { url: null, genre: '', hdCover: null };
    bandcampCache.set(cacheKey, empty);
    return empty;
}

async function getBandcampArtistTags(artist) {
    const cacheKey = artist.toLowerCase().trim();
    if (bandcampArtistTagCache.has(cacheKey)) return bandcampArtistTagCache.get(cacheKey);

    try {
        const query = encodeURIComponent(artist);
        const res = await axios.get(`https://bandcamp.com/api/fuzzysearch/2/app_autocomplete?q=${query}`, {
            headers: {
                'User-Agent': 'Bandcamp/3.0.0 (Android 14; Mobile)',
                'Accept': 'application/json'
            },
            timeout: 5000
        });

        if (res.data && res.data.results) {
            for (const item of res.data.results) {
                if (item.type === 'b' && item.tag_names && item.tag_names.length > 0) {
                    const tags = item.tag_names.slice(0, 3).map(t => t.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')).join(', ');
                    bandcampArtistTagCache.set(cacheKey, tags);
                    return tags;
                }
            }
        }
    } catch (e) {
        // ignore
    }
    bandcampArtistTagCache.set(cacheKey, '');
    return '';
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
                    releaseDate: relDate,
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

    // SAFETY CHECK: If no releases were extracted, DO NOT overwrite existing dataset
    if (allReleases.length === 0) {
        console.warn('\n[!] ATTENZIONE: Nessun album estratto. I dati esistenti vengono preservati.');
        if (fs.existsSync(RELEASES_FILE)) {
            const existing = JSON.parse(fs.readFileSync(RELEASES_FILE, 'utf8'));
            const htmlContent = generateHtml(existing, { lastUpdated: new Date().toLocaleString('it-IT') });
            fs.writeFileSync(OUTPUT_HTML, htmlContent, 'utf8');
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

    console.log('\n[4/4] Arricchimento HD, Date GG/MM/AAAA e Bandcamp...');
    const batchSize = 15;
    for (let i = 0; i < allReleases.length; i += batchSize) {
        const chunk = allReleases.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (item) => {
            if (previousState[item.id]) {
                item.isNew = false;
                item.firstSeen = previousState[item.id].firstSeen;
                if (previousState[item.id].genre) item.genre = previousState[item.id].genre;
                if (previousState[item.id].bandcampUrl) item.bandcampUrl = previousState[item.id].bandcampUrl;
                if (previousState[item.id].releaseDate) item.releaseDate = previousState[item.id].releaseDate;
                if (previousState[item.id].cover && !previousState[item.id].cover.includes('/i/150/')) item.cover = previousState[item.id].cover;
            } else {
                item.isNew = !isFirstRun;
            }

            // Bandcamp Data & HD Cover
            if (!item.bandcampUrl || !item.genre) {
                const bcData = await getBandcampData(item.artist, item.title);
                item.bandcampUrl = bcData.url;
                if (bcData.genre) {
                    item.genre = bcData.genre;
                } else if (item.bandcampUrl) {
                    const artistTags = await getBandcampArtistTags(item.artist);
                    if (artistTags) item.genre = artistTags;
                }
                if (bcData.hdCover) {
                    item.cover = bcData.hdCover;
                }
            }

            // Upgrade cover to High Resolution if still low-res
            if (item.cover.includes('/i/150/') || item.cover.includes('/i/75/')) {
                item.cover = await getHDCover(item.artist, item.title, item.cover);
            }

            // Release Date (GG/MM/AAAA)
            if (!item.releaseDate || /^\d{4}$/.test(item.releaseDate)) {
                item.releaseDate = await getFullReleaseDate(item.artist, item.title, item.year);
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
            cover: r.cover,
            releaseDate: r.releaseDate,
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

// Quick enrich function to upgrade existing dataset to HD covers
async function enrichHDCovres() {
    if (!fs.existsSync(RELEASES_FILE)) return;
    console.log('Upgrade copertine in Alta Risoluzione (HD) per il dataset...');
    const releases = JSON.parse(fs.readFileSync(RELEASES_FILE, 'utf8'));

    const batchSize = 25;
    for (let i = 0; i < releases.length; i += batchSize) {
        const chunk = releases.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (item) => {
            if (item.cover.includes('/i/150/') || item.cover.includes('/i/75/')) {
                item.cover = await getHDCover(item.artist, item.title, item.cover);
            }
        }));
        if ((i + batchSize) % 300 === 0 || i + batchSize >= releases.length) {
            console.log(`Copertine HD elaborate: ${Math.min(i + batchSize, releases.length)} / ${releases.length}...`);
        }
    }

    fs.writeFileSync(RELEASES_FILE, JSON.stringify(releases, null, 2), 'utf8');
    const html = generateHtml(releases, { lastUpdated: new Date().toLocaleString('it-IT') });
    fs.writeFileSync(OUTPUT_HTML, html, 'utf8');
    console.log('Tutte le copertine sono state aggiornate in Alta Risoluzione HD!');
}

module.exports = { runScraper, enrichHDCovres, getHDCover, getFullReleaseDate, getBandcampData, getBandcampArtistTags };

if (require.main === module) {
    runScraper().catch(console.error);
}
