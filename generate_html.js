const fs = require('fs');
const path = require('path');

function generateHtml(releases, metadata = {}) {
    const totalCount = releases.length;
    const newCount = releases.filter(r => r.isNew).length;
    const bandcampCount = releases.filter(r => r.bandcampUrl).length;
    const uniqueCurators = new Set();
    const uniqueGenres = new Set();
    const uniquePeriods = new Map(); // key -> label

    const monthNames = [
        'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
        'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
    ];

    releases.forEach(r => {
        (r.curators || []).forEach(c => uniqueCurators.add(c.user));
        if (r.genre) {
            r.genre.split(',').forEach(g => {
                const clean = g.trim();
                if (clean) uniqueGenres.add(clean);
            });
        }

        // Extract period for clustering
        if (r.releaseDate) {
            const parts = r.releaseDate.split('/');
            if (parts.length === 3) {
                const mm = parseInt(parts[1], 10);
                const yyyy = parts[2];
                if (mm >= 1 && mm <= 12 && yyyy) {
                    const key = `${yyyy}-${String(mm).padStart(2, '0')}`;
                    const label = `${monthNames[mm - 1]} ${yyyy}`;
                    uniquePeriods.set(key, label);
                }
            } else if (/^\d{4}$/.test(r.releaseDate)) {
                uniquePeriods.set(r.releaseDate, `Anno ${r.releaseDate}`);
            }
        } else if (r.year && /^\d{4}$/.test(r.year)) {
            uniquePeriods.set(r.year, `Anno ${r.year}`);
        }
    });

    const lastUpdated = metadata.lastUpdated || new Date().toLocaleString('it-IT');
    const sortedGenres = Array.from(uniqueGenres).filter(Boolean).sort();
    const sortedCurators = Array.from(uniqueCurators).filter(Boolean).sort();
    const sortedPeriodKeys = Array.from(uniquePeriods.keys()).sort().reverse();

    const releasesJson = JSON.stringify(releases).replace(/</g, '\\u003c');

    return `<!DOCTYPE html>
<html lang="it" class="dark">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="referrer" content="no-referrer">
    <title>RateYourMusic - Nuove Aggiunte & Liste Consigliate</title>
    <!-- Tailwind CSS CDN -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
        tailwind.config = {
            darkMode: 'class',
            theme: {
                extend: {
                    colors: {
                        darkbg: '#0b0f19',
                        cardbg: '#1e293b',
                        bordercolor: '#334155',
                        brand: '#38bdf8',
                        bandcamp: '#1da0c3',
                        spotify: '#1db954'
                    }
                }
            }
        }
    </script>
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        body {
            background-color: #0b0f19;
            color: #f1f5f9;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        }
        .album-card {
            transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .album-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 12px 24px -10px rgba(56, 189, 248, 0.25);
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: #0f172a;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #334155;
            border-radius: 4px;
        }
    </style>
</head>
<body class="min-h-screen flex flex-col custom-scrollbar">

    <!-- Header / Navbar -->
    <header class="sticky top-0 z-40 backdrop-blur-md bg-slate-900/90 border-b border-slate-800 shadow-xl">
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div class="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div>
                    <div class="flex items-center gap-3">
                        <div class="p-2.5 bg-gradient-to-tr from-sky-500 to-indigo-600 rounded-xl shadow-lg shadow-sky-500/20 text-white">
                            <i class="fa-solid fa-compact-disc fa-spin text-xl" style="animation-duration: 10s;"></i>
                        </div>
                        <div>
                            <h1 class="text-xl sm:text-2xl font-black tracking-tight text-white flex items-center gap-2">
                                RateYourMusic <span class="text-sky-400">Discover</span>
                            </h1>
                            <p class="text-xs text-slate-400">
                                Nuove aggiunte e uscite dalle liste di <span class="text-slate-200 font-medium">vanaimo</span>
                            </p>
                        </div>
                    </div>
                </div>

                <!-- Stats summary -->
                <div class="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 md:pb-0">
                    <div class="bg-slate-800/80 border border-slate-700/60 px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
                        <i class="fa-solid fa-music text-sky-400 text-sm"></i>
                        <div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Album Unici</div>
                            <div class="text-sm font-bold text-white" id="stat-total">${totalCount}</div>
                        </div>
                    </div>
                    <div class="bg-slate-800/80 border border-slate-700/60 px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
                        <i class="fa-brands fa-bandcamp text-cyan-400 text-sm"></i>
                        <div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Bandcamp</div>
                            <div class="text-sm font-bold text-cyan-400">${bandcampCount}</div>
                        </div>
                    </div>
                    <div class="bg-slate-800/80 border border-slate-700/60 px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
                        <i class="fa-solid fa-sparkles text-amber-400 text-sm"></i>
                        <div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Novità</div>
                            <div class="text-sm font-bold text-amber-400" id="stat-new">${newCount}</div>
                        </div>
                    </div>
                    <div class="bg-slate-800/80 border border-slate-700/60 px-3.5 py-1.5 rounded-lg flex items-center gap-2.5">
                        <i class="fa-solid fa-users text-emerald-400 text-sm"></i>
                        <div>
                            <div class="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">Utenti</div>
                            <div class="text-sm font-bold text-emerald-400">${sortedCurators.length}</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Controls: Search, Filters, Date Clustering & Sort -->
            <div class="mt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-3">
                <!-- Search input -->
                <div class="lg:col-span-4 relative">
                    <i class="fa-solid fa-magnifying-glass absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-sm"></i>
                    <input type="text" id="searchInput" placeholder="Cerca artista, album, genere o data..." 
                        class="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent transition">
                </div>

                <!-- Date Cluster Filter -->
                <div class="lg:col-span-3">
                    <select id="dateFilter" class="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 transition">
                        <option value="">Tutte le date di uscita</option>
                        ${sortedPeriodKeys.map(k => `<option value="${k}">${uniquePeriods.get(k)}</option>`).join('')}
                    </select>
                </div>

                <!-- Genre Filter -->
                <div class="lg:col-span-2">
                    <select id="genreFilter" class="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 transition">
                        <option value="">Tutti i generi (${sortedGenres.length})</option>
                        ${sortedGenres.map(g => `<option value="${g}">${g}</option>`).join('')}
                    </select>
                </div>

                <!-- Curator Filter -->
                <div class="lg:col-span-1">
                    <select id="curatorFilter" class="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-2 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 transition">
                        <option value="">Tutti gli utenti</option>
                        ${sortedCurators.map(c => `<option value="${c}">${c}</option>`).join('')}
                    </select>
                </div>

                <!-- Sort & View Mode -->
                <div class="lg:col-span-2 flex items-center gap-1.5">
                    <select id="sortBy" class="w-full bg-slate-800/90 border border-slate-700/80 rounded-xl px-2.5 py-2 text-xs text-slate-200 focus:outline-none focus:ring-2 focus:ring-sky-500 transition font-medium">
                        <option value="recent-added" selected>Più recenti nelle liste</option>
                        <option value="release-date-desc">Data uscita (Più recenti)</option>
                        <option value="release-date-asc">Data uscita (Più vecchi)</option>
                        <option value="artist-asc">Artista (A-Z)</option>
                        <option value="album-asc">Album (A-Z)</option>
                    </select>

                    <button id="toggleClusterView" title="Attiva/Disattiva vista raggruppata per data" class="p-2 rounded-xl border border-slate-700/80 bg-slate-800 text-slate-400 hover:text-sky-400 hover:border-sky-400/50 transition flex-shrink-0">
                        <i class="fa-solid fa-layer-group"></i>
                    </button>
                    
                    <button id="toggleNewOnly" title="Mostra solo nuove aggiunte" class="p-2 rounded-xl border border-slate-700/80 bg-slate-800 text-slate-400 hover:text-amber-400 hover:border-amber-400/50 transition flex-shrink-0">
                        <i class="fa-solid fa-sparkles"></i>
                    </button>
                </div>
            </div>
        </div>
    </header>

    <!-- Main Content Area -->
    <main class="flex-grow max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        
        <!-- Results count & Active filters info -->
        <div class="flex items-center justify-between mb-6 text-sm text-slate-400">
            <div>
                Mostrando <span id="displayedCount" class="font-bold text-white">${totalCount}</span> album
                <span id="activeFilterBadge" class="hidden ml-2 px-2 py-0.5 bg-sky-500/20 text-sky-400 text-xs rounded-full border border-sky-500/30">Filtro attivo</span>
                <span id="clusterModeBadge" class="hidden ml-2 px-2 py-0.5 bg-indigo-500/20 text-indigo-400 text-xs rounded-full border border-indigo-500/30">Vista Cluster Attiva</span>
            </div>
            <div class="text-xs text-slate-500">
                Ultimo aggiornamento: ${lastUpdated}
            </div>
        </div>

        <!-- Albums Container (Grid or Clusters) -->
        <div id="albumsContainer">
            <div id="albumsGrid" class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                <!-- Rendered by JS -->
            </div>
        </div>

        <!-- Empty State -->
        <div id="emptyState" class="hidden flex flex-col items-center justify-center py-20 text-center">
            <div class="w-16 h-16 rounded-full bg-slate-800 flex items-center justify-center text-slate-500 text-2xl mb-4">
                <i class="fa-solid fa-record-vinyl"></i>
            </div>
            <h3 class="text-lg font-bold text-white mb-1">Nessun album trovato</h3>
            <p class="text-sm text-slate-400 max-w-sm">Prova a modificare i filtri di ricerca, la data di uscita o la selezione dell'utente.</p>
            <button onclick="resetFilters()" class="mt-4 px-4 py-2 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition">
                Resetta Filtri
            </button>
        </div>
    </main>

    <!-- Footer -->
    <footer class="bg-slate-950 border-t border-slate-900 py-6 text-center text-xs text-slate-500">
        <div class="max-w-7xl mx-auto px-4">
            <p>Generato automaticamente con Playwright & Music Discovery Engine.</p>
            <p class="mt-1 text-slate-600">Dati sincronizzati da RateYourMusic, Bandcamp & Spotify.</p>
        </div>
    </footer>

    <!-- Client-side script -->
    <script>
        const releases = ${releasesJson};
        let onlyNew = false;
        let clusterViewMode = false;

        const monthNames = [
            'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
        ];

        function escapeHtml(str) {
            if (!str) return '';
            return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        }

        function parseReleaseDateTimestamp(dateStr) {
            if (!dateStr) return 0;
            const parts = dateStr.split('/');
            if (parts.length === 3) {
                const dd = parseInt(parts[0], 10) || 1;
                const mm = parseInt(parts[1], 10) || 1;
                const yyyy = parseInt(parts[2], 10) || 0;
                return new Date(yyyy, mm - 1, dd).getTime();
            }
            if (/^\\d{4}$/.test(dateStr)) {
                return new Date(parseInt(dateStr, 10), 0, 1).getTime();
            }
            return 0;
        }

        function getReleaseClusterKey(dateStr, yearStr) {
            if (dateStr) {
                const parts = dateStr.split('/');
                if (parts.length === 3) {
                    const mm = parseInt(parts[1], 10);
                    const yyyy = parts[2];
                    if (mm >= 1 && mm <= 12 && yyyy) {
                        return { key: \`\${yyyy}-\${String(mm).padStart(2, '0')}\`, label: \`\${monthNames[mm - 1]} \${yyyy}\` };
                    }
                } else if (/^\\d{4}$/.test(dateStr)) {
                    return { key: dateStr, label: \`Anno \${dateStr}\` };
                }
            }
            if (yearStr && /^\\d{4}$/.test(yearStr)) {
                return { key: yearStr, label: \`Anno \${yearStr}\` };
            }
            return { key: '0000', label: 'Data non specificata' };
        }

        function getLatestAdditionMetric(item) {
            let maxItemId = 0;
            if (item.latestItemId) maxItemId = item.latestItemId;
            if (item.curators && item.curators.length > 0) {
                for (const c of item.curators) {
                    if (c.itemId && c.itemId > maxItemId) maxItemId = c.itemId;
                }
            }
            if (maxItemId > 0) return maxItemId;
            return item.addedOrder ? (1000000 - item.addedOrder) : 0;
        }

        function cleanCoverUrl(cover) {
            if (!cover || cover.includes('blocked_art') || cover.includes('blank.png')) {
                return 'https://via.placeholder.com/300x300/1e293b/94a3b8?text=No+Cover';
            }
            return cover;
        }

        function renderCard(item) {
            const coverUrl = cleanCoverUrl(item.cover);
            const genres = item.genre ? item.genre.split(',').map(g => g.trim()).filter(Boolean) : [];
            const rymUrl = item.rymUrl ? (item.rymUrl.startsWith('http') ? item.rymUrl : 'https://rateyourmusic.com' + item.rymUrl) : '#';
            const artistUrl = item.artistUrl ? (item.artistUrl.startsWith('http') ? item.artistUrl : 'https://rateyourmusic.com' + item.artistUrl) : ('https://rateyourmusic.com/search?searchterm=' + encodeURIComponent(item.artist) + '&type=a');
            const displayDate = item.releaseDate || item.year || '';

            const hasBandcamp = !!item.bandcampUrl;
            const streamUrl = hasBandcamp ? item.bandcampUrl : (item.spotifyUrl || ('https://open.spotify.com/search/' + encodeURIComponent(item.artist + ' ' + item.title)));
            
            const streamBtnHtml = hasBandcamp ? \`
                <a href="\${escapeHtml(streamUrl)}" target="_blank" rel="noopener noreferrer" 
                   class="mt-1 w-full bg-slate-800/80 hover:bg-cyan-950/60 text-cyan-400 hover:text-cyan-300 border border-cyan-800/40 hover:border-cyan-500/60 text-xs font-semibold py-1.5 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition">
                    <i class="fa-brands fa-bandcamp text-sm text-cyan-400"></i>
                    <span>Ascolta su Bandcamp</span>
                </a>
            \` : \`
                <a href="\${escapeHtml(streamUrl)}" target="_blank" rel="noopener noreferrer" 
                   class="mt-1 w-full bg-slate-800/80 hover:bg-emerald-950/60 text-emerald-400 hover:text-emerald-300 border border-emerald-800/40 hover:border-emerald-500/60 text-xs font-semibold py-1.5 px-3 rounded-xl flex items-center justify-center gap-2 shadow-sm transition">
                    <i class="fa-brands fa-spotify text-sm text-emerald-400"></i>
                    <span>Ascolta su Spotify</span>
                </a>
            \`;

            const overlayStreamBtn = hasBandcamp ? \`
                <a href="\${escapeHtml(streamUrl)}" target="_blank" rel="noopener noreferrer" 
                   class="flex-1 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow transition">
                    <i class="fa-brands fa-bandcamp"></i> Bandcamp
                </a>
            \` : \`
                <a href="\${escapeHtml(streamUrl)}" target="_blank" rel="noopener noreferrer" 
                   class="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 shadow transition">
                    <i class="fa-brands fa-spotify"></i> Spotify
                </a>
            \`;

            const curatorsHtml = (item.curators || []).map(c => {
                const posStr = c.position ? \` #\${c.position}\` : '';
                return \`<a href="\${escapeHtml(c.listUrl)}" target="_blank" rel="noopener noreferrer" 
                    title="Aggiunto da \${escapeHtml(c.user)} nella lista '\${escapeHtml(c.listTitle)}'\${posStr ? ' (Posizione' + posStr + ')' : ''}"
                    class="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700 transition">
                    <i class="fa-solid fa-user-tag text-[9px] text-sky-400"></i>
                    <span>\${escapeHtml(c.user)}\${posStr}</span>
                </a>\`;
            }).join('');

            const genresHtml = genres.slice(0, 3).map(g => {
                return \`<span class="text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800/40">\${escapeHtml(g)}</span>\`;
            }).join('');

            const newBadge = item.isNew ? \`<span class="absolute top-3 left-3 bg-amber-500 text-slate-950 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shadow-md flex items-center gap-1">
                <i class="fa-solid fa-sparkles"></i> NEW
            </span>\` : '';

            return \`
            <div class="album-card bg-slate-900 border border-slate-800/90 hover:border-slate-700 rounded-2xl overflow-hidden flex flex-col justify-between shadow-md">
                <div>
                    <!-- Album Cover Container -->
                    <div class="relative overflow-hidden bg-slate-950 group aspect-square">
                        <img src="\${escapeHtml(coverUrl)}" alt="\${escapeHtml(item.title)}" 
                             loading="lazy"
                             referrerpolicy="no-referrer"
                             onerror="this.onerror=null; this.src='https://via.placeholder.com/300x300/1e293b/94a3b8?text=No+Cover';"
                             class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105">
                        
                        \${newBadge}

                        <!-- Overlay actions -->
                        <div class="absolute inset-0 bg-gradient-to-t from-slate-950/90 via-slate-950/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-4">
                            <div class="flex items-center gap-2 w-full">
                                <a href="\${escapeHtml(rymUrl)}" target="_blank" rel="noopener noreferrer" 
                                   class="flex-1 bg-slate-800/90 hover:bg-slate-700 text-white text-xs font-semibold py-1.5 px-3 rounded-lg flex items-center justify-center gap-1.5 border border-slate-700 transition">
                                    <i class="fa-solid fa-arrow-up-right-from-square text-[10px]"></i> RYM Album
                                </a>
                                \${overlayStreamBtn}
                            </div>
                        </div>
                    </div>

                    <!-- Album Info -->
                    <div class="p-4">
                        <div class="flex items-start justify-between gap-2">
                            <h3 class="font-bold text-white text-base leading-snug line-clamp-1 hover:text-sky-400 transition">
                                <a href="\${escapeHtml(rymUrl)}" target="_blank" rel="noopener noreferrer">\${escapeHtml(item.title)}</a>
                            </h3>
                        </div>

                        <!-- Clickable Artist with RYM Profile Link -->
                        <div class="text-sm font-medium text-slate-400 mt-1 line-clamp-1">
                            <a href="\${escapeHtml(artistUrl)}" target="_blank" rel="noopener noreferrer" class="hover:text-sky-400 hover:underline transition">
                                <i class="fa-solid fa-microphone-lines text-xs text-sky-400/80 mr-1"></i>\${escapeHtml(item.artist)}
                            </a>
                        </div>

                        <!-- Formatted Release Date (GG/MM/AAAA) -->
                        <div class="flex items-center gap-1.5 text-xs text-slate-400 mt-2 font-mono">
                            <i class="fa-regular fa-calendar-days text-sky-400 text-xs"></i>
                            <span>\${escapeHtml(displayDate)}</span>
                        </div>

                        <!-- Genres -->
                        \${genresHtml ? \`<div class="flex flex-wrap gap-1.5 mt-2.5">\${genresHtml}</div>\` : ''}
                    </div>
                </div>

                <!-- Footer: Curators & Stream button -->
                <div class="px-4 pb-4 pt-1 border-t border-slate-800/60 flex flex-col gap-2.5">
                    <div class="text-[11px] text-slate-500 font-medium">Consigliato da:</div>
                    <div class="flex flex-wrap gap-1.5">
                        \${curatorsHtml}
                    </div>
                    
                    \${streamBtnHtml}
                </div>
            </div>
            \`;
        }

        function filterAndSortReleases() {
            const query = document.getElementById('searchInput').value.toLowerCase().trim();
            const dateFilter = document.getElementById('dateFilter').value;
            const genreFilter = document.getElementById('genreFilter').value;
            const curatorFilter = document.getElementById('curatorFilter').value;
            const sortBy = document.getElementById('sortBy').value;

            let filtered = releases.filter(item => {
                if (onlyNew && !item.isNew) return false;

                if (curatorFilter) {
                    const hasCurator = (item.curators || []).some(c => c.user === curatorFilter);
                    if (!hasCurator) return false;
                }

                if (genreFilter) {
                    const itemGenres = (item.genre || '').toLowerCase();
                    if (!itemGenres.includes(genreFilter.toLowerCase())) return false;
                }

                if (dateFilter) {
                    const cluster = getReleaseClusterKey(item.releaseDate, item.year);
                    if (cluster.key !== dateFilter && item.year !== dateFilter && !item.releaseDate?.includes(dateFilter)) {
                        return false;
                    }
                }

                if (query) {
                    const titleMatch = (item.title || '').toLowerCase().includes(query);
                    const artistMatch = (item.artist || '').toLowerCase().includes(query);
                    const genreMatch = (item.genre || '').toLowerCase().includes(query);
                    const dateMatch = (item.releaseDate || '').includes(query) || (item.year || '').includes(query);
                    const curatorMatch = (item.curators || []).some(c => c.user.toLowerCase().includes(query) || (c.listTitle || '').toLowerCase().includes(query));
                    if (!titleMatch && !artistMatch && !genreMatch && !curatorMatch && !dateMatch) return false;
                }

                return true;
            });

            // Sorting
            filtered.sort((a, b) => {
                if (sortBy === 'artist-asc') {
                    return (a.artist || '').localeCompare(b.artist || '');
                } else if (sortBy === 'album-asc') {
                    return (a.title || '').localeCompare(b.title || '');
                } else if (sortBy === 'release-date-desc') {
                    const timeA = parseReleaseDateTimestamp(a.releaseDate) || (parseInt(a.year, 10) * 100000000) || 0;
                    const timeB = parseReleaseDateTimestamp(b.releaseDate) || (parseInt(b.year, 10) * 100000000) || 0;
                    return timeB - timeA;
                } else if (sortBy === 'release-date-asc') {
                    const timeA = parseReleaseDateTimestamp(a.releaseDate) || (parseInt(a.year, 10) * 100000000) || 0;
                    const timeB = parseReleaseDateTimestamp(b.releaseDate) || (parseInt(b.year, 10) * 100000000) || 0;
                    return timeA - timeB;
                } else {
                    const metricA = getLatestAdditionMetric(a);
                    const metricB = getLatestAdditionMetric(b);
                    return metricB - metricA;
                }
            });

            const container = document.getElementById('albumsContainer');
            const empty = document.getElementById('emptyState');
            const countElem = document.getElementById('displayedCount');

            countElem.innerText = filtered.length;

            if (filtered.length === 0) {
                container.innerHTML = '';
                empty.classList.remove('hidden');
            } else {
                empty.classList.add('hidden');

                if (clusterViewMode) {
                    const clustersMap = new Map();
                    filtered.forEach(item => {
                        const cluster = getReleaseClusterKey(item.releaseDate, item.year);
                        if (!clustersMap.has(cluster.key)) {
                            clustersMap.set(cluster.key, { label: cluster.label, items: [] });
                        }
                        clustersMap.get(cluster.key).items.push(item);
                    });

                    let clusterHtml = '';
                    for (const [key, group] of clustersMap.entries()) {
                        clusterHtml += \`
                        <div class="mb-10">
                            <div class="flex items-center gap-3 mb-4 pb-2 border-b border-slate-800">
                                <div class="px-3 py-1 bg-gradient-to-r from-sky-500/20 to-indigo-500/20 border border-sky-500/30 rounded-xl text-sky-400 font-bold text-sm flex items-center gap-2">
                                    <i class="fa-regular fa-calendar-check text-sky-400"></i>
                                    <span>\${escapeHtml(group.label)}</span>
                                </div>
                                <span class="text-xs text-slate-500">(\${group.items.length} album)</span>
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                \${group.items.map(renderCard).join('')}
                            </div>
                        </div>
                        \`;
                    }
                    container.innerHTML = clusterHtml;
                } else {
                    container.innerHTML = \`<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">\${filtered.map(renderCard).join('')}</div>\`;
                }
            }

            const activeBadge = document.getElementById('activeFilterBadge');
            if (query || genreFilter || curatorFilter || dateFilter || onlyNew) {
                activeBadge.classList.remove('hidden');
            } else {
                activeBadge.classList.add('hidden');
            }

            const clusterBadge = document.getElementById('clusterModeBadge');
            if (clusterViewMode) {
                clusterBadge.classList.remove('hidden');
            } else {
                clusterBadge.classList.add('hidden');
            }
        }

        function resetFilters() {
            document.getElementById('searchInput').value = '';
            document.getElementById('dateFilter').value = '';
            document.getElementById('genreFilter').value = '';
            document.getElementById('curatorFilter').value = '';
            onlyNew = false;
            updateNewButtonState();
            filterAndSortReleases();
        }

        function updateNewButtonState() {
            const btn = document.getElementById('toggleNewOnly');
            if (onlyNew) {
                btn.classList.add('bg-amber-500', 'text-slate-950', 'border-amber-400');
                btn.classList.remove('bg-slate-800', 'text-slate-400');
            } else {
                btn.classList.remove('bg-amber-500', 'text-slate-950', 'border-amber-400');
                btn.classList.add('bg-slate-800', 'text-slate-400');
            }
        }

        function updateClusterButtonState() {
            const btn = document.getElementById('toggleClusterView');
            if (clusterViewMode) {
                btn.classList.add('bg-sky-500', 'text-slate-950', 'border-sky-400');
                btn.classList.remove('bg-slate-800', 'text-slate-400');
            } else {
                btn.classList.remove('bg-sky-500', 'text-slate-950', 'border-sky-400');
                btn.classList.add('bg-slate-800', 'text-slate-400');
            }
        }

        document.getElementById('searchInput').addEventListener('input', filterAndSortReleases);
        document.getElementById('dateFilter').addEventListener('change', filterAndSortReleases);
        document.getElementById('genreFilter').addEventListener('change', filterAndSortReleases);
        document.getElementById('curatorFilter').addEventListener('change', filterAndSortReleases);
        document.getElementById('sortBy').addEventListener('change', filterAndSortReleases);
        
        document.getElementById('toggleNewOnly').addEventListener('click', () => {
            onlyNew = !onlyNew;
            updateNewButtonState();
            filterAndSortReleases();
        });

        document.getElementById('toggleClusterView').addEventListener('click', () => {
            clusterViewMode = !clusterViewMode;
            updateClusterButtonState();
            filterAndSortReleases();
        });

        // Initial render
        filterAndSortReleases();
    </script>
</body>
</html>`;
}

module.exports = { generateHtml };
