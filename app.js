const ARCHIVE_IDENTIFIER = 'RaveDownloads';
const PAGE_SIZE = 120;

const state = {
  tracks: [],
  filtered: [],
  visibleCount: PAGE_SIZE,
  currentTrack: null,
  queue: loadStoredArray('ravedial-queue'),
  favorites: new Set(loadStoredArray('ravedial-favorites')),
  favoritesOnly: false,
};

const els = {
  status: document.querySelector('#source-status'),
  search: document.querySelector('#search'),
  year: document.querySelector('#year-filter'),
  format: document.querySelector('#format-filter'),
  folder: document.querySelector('#folder-filter'),
  sort: document.querySelector('#sort-select'),
  random: document.querySelector('#random-button'),
  favorites: document.querySelector('#favorites-button'),
  trackList: document.querySelector('#track-list'),
  resultCount: document.querySelector('#result-count'),
  emptyState: document.querySelector('#empty-state'),
  loadMore: document.querySelector('#load-more'),
  template: document.querySelector('#track-template'),
  queueList: document.querySelector('#queue-list'),
  queueEmpty: document.querySelector('#queue-empty'),
  clearQueue: document.querySelector('#clear-queue'),
  audio: document.querySelector('#audio'),
  previous: document.querySelector('#previous-button'),
  next: document.querySelector('#next-button'),
  nowTitle: document.querySelector('#now-title'),
  nowMeta: document.querySelector('#now-meta'),
  nowSource: document.querySelector('#now-source'),
  statTracks: document.querySelector('#stat-tracks'),
  statYears: document.querySelector('#stat-years'),
  statFormats: document.querySelector('#stat-formats'),
  statFavorites: document.querySelector('#stat-favorites'),
};

init();

async function init() {
  bindEvents();
  renderFavoritesCount();
  renderQueue();

  try {
    const response = await fetch('./data/catalog.json', { cache: 'no-cache' });
    if (!response.ok) throw new Error(`Catalog request failed (${response.status})`);
    const catalog = await response.json();
    state.tracks = Array.isArray(catalog.tracks) ? catalog.tracks : [];

    if (!state.tracks.length) {
      throw new Error('The catalog is empty. Run the catalog builder or deploy workflow.');
    }

    populateFilters(catalog);
    els.statTracks.textContent = compactNumber(state.tracks.length);
    els.statYears.textContent = compactNumber(catalog.years?.length || 0);
    els.statFormats.textContent = compactNumber(catalog.formats?.length || 0);
    els.status.textContent = `Signal locked · ${state.tracks.length.toLocaleString()} recordings`;
    applyFilters();
  } catch (error) {
    console.error(error);
    els.status.textContent = 'Catalog unavailable';
    els.status.classList.add('error');
    els.resultCount.textContent = 'No catalog loaded';
    els.emptyState.hidden = false;
    els.emptyState.querySelector('strong').textContent = 'The archive index has not been built yet.';
    els.emptyState.querySelector('span').textContent = 'Run the GitHub Pages workflow to generate data/catalog.json.';
  }

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
}

function bindEvents() {
  const reapply = () => {
    state.visibleCount = PAGE_SIZE;
    applyFilters();
  };
  els.search.addEventListener('input', reapply);
  els.year.addEventListener('change', reapply);
  els.format.addEventListener('change', reapply);
  els.folder.addEventListener('change', reapply);
  els.sort.addEventListener('change', reapply);

  els.favorites.addEventListener('click', () => {
    state.favoritesOnly = !state.favoritesOnly;
    els.favorites.setAttribute('aria-pressed', String(state.favoritesOnly));
    els.favorites.textContent = state.favoritesOnly ? '♥ All recordings' : '♡ Favorites';
    reapply();
  });

  els.random.addEventListener('click', () => {
    const pool = state.filtered.length ? state.filtered : state.tracks;
    if (!pool.length) return;
    playTrack(pool[Math.floor(Math.random() * pool.length)]);
  });

  els.loadMore.addEventListener('click', () => {
    state.visibleCount += PAGE_SIZE;
    renderTracks();
  });

  els.clearQueue.addEventListener('click', () => {
    state.queue = [];
    persistQueue();
    renderQueue();
  });

  els.previous.addEventListener('click', playPrevious);
  els.next.addEventListener('click', playNext);
  els.audio.addEventListener('ended', playNext);
  els.audio.addEventListener('play', markPlayingCard);
}

function populateFilters(catalog) {
  addOptions(els.year, catalog.years || [], value => value);
  addOptions(els.format, catalog.formats || [], value => value.toUpperCase());
  addOptions(els.folder, catalog.folders || [], value => value);
}

function addOptions(select, values, labeler) {
  const fragment = document.createDocumentFragment();
  for (const value of values) {
    const option = document.createElement('option');
    option.value = String(value);
    option.textContent = labeler(value);
    fragment.append(option);
  }
  select.append(fragment);
}

function applyFilters() {
  const query = normalize(els.search.value);
  const year = els.year.value;
  const format = els.format.value;
  const folder = els.folder.value;

  state.filtered = state.tracks.filter(track => {
    if (state.favoritesOnly && !state.favorites.has(track.id)) return false;
    if (year && String(track.year || '') !== year) return false;
    if (format && track.format !== format) return false;
    if (folder && track.folderGroup !== folder) return false;
    if (query && !normalize(`${track.title} ${track.path} ${track.folder} ${track.year || ''}`).includes(query)) return false;
    return true;
  });

  sortTracks(state.filtered, els.sort.value);
  renderTracks();
}

function sortTracks(tracks, mode) {
  tracks.sort((a, b) => {
    switch (mode) {
      case 'title': return a.title.localeCompare(b.title, undefined, { numeric: true });
      case 'year-desc': return (b.year || 0) - (a.year || 0) || a.title.localeCompare(b.title);
      case 'year-asc': return (a.year || 9999) - (b.year || 9999) || a.title.localeCompare(b.title);
      case 'size-desc': return (b.size || 0) - (a.size || 0);
      default: return a.path.localeCompare(b.path, undefined, { numeric: true });
    }
  });
}

function renderTracks() {
  els.trackList.replaceChildren();
  const visible = state.filtered.slice(0, state.visibleCount);
  const fragment = document.createDocumentFragment();

  for (const track of visible) {
    const card = els.template.content.firstElementChild.cloneNode(true);
    card.dataset.trackId = track.id;
    if (state.currentTrack?.id === track.id) card.classList.add('is-playing');

    const play = card.querySelector('.play-button');
    const favorite = card.querySelector('.favorite-button');
    const queue = card.querySelector('.queue-button');
    const source = card.querySelector('.archive-link');

    card.querySelector('h3').textContent = track.title;
    card.querySelector('.track-meta').textContent = formatMeta(track);
    card.querySelector('.track-path').textContent = track.folder || 'Archive root';
    source.href = archiveFileUrl(track.path);
    favorite.setAttribute('aria-pressed', String(state.favorites.has(track.id)));
    favorite.textContent = state.favorites.has(track.id) ? '♥' : '♡';

    play.addEventListener('click', () => playTrack(track));
    favorite.addEventListener('click', () => toggleFavorite(track.id));
    queue.addEventListener('click', () => enqueue(track));
    fragment.append(card);
  }

  els.trackList.append(fragment);
  els.resultCount.textContent = `${state.filtered.length.toLocaleString()} result${state.filtered.length === 1 ? '' : 's'}`;
  els.emptyState.hidden = state.filtered.length !== 0;
  els.loadMore.hidden = state.visibleCount >= state.filtered.length;
}

function playTrack(track, { consumeQueue = false } = {}) {
  if (!track) return;
  state.currentTrack = track;
  els.audio.src = archiveFileUrl(track.path);
  els.nowTitle.textContent = track.title;
  els.nowMeta.textContent = formatMeta(track);
  els.nowSource.href = archiveFileUrl(track.path);
  els.nowSource.classList.remove('disabled');
  els.nowSource.setAttribute('aria-disabled', 'false');
  document.title = `${track.title} · RaveDial`;
  markPlayingCard();
  els.audio.play().catch(() => {});

  if (consumeQueue && state.queue[0]?.id === track.id) {
    state.queue.shift();
    persistQueue();
    renderQueue();
  }
}

function markPlayingCard() {
  document.querySelectorAll('.track-card.is-playing').forEach(card => card.classList.remove('is-playing'));
  if (!state.currentTrack) return;
  const current = document.querySelector(`[data-track-id="${CSS.escape(state.currentTrack.id)}"]`);
  current?.classList.add('is-playing');
}

function enqueue(track) {
  if (!state.queue.some(item => item.id === track.id)) {
    state.queue.push(track);
    persistQueue();
    renderQueue();
  }
}

function renderQueue() {
  els.queueList.replaceChildren();
  const fragment = document.createDocumentFragment();

  state.queue.forEach((track, index) => {
    const item = document.createElement('li');
    item.className = 'queue-item';

    const play = document.createElement('button');
    play.type = 'button';
    play.innerHTML = `<strong></strong><small></small>`;
    play.querySelector('strong').textContent = track.title;
    play.querySelector('small').textContent = `${index + 1}. ${track.year || track.format?.toUpperCase() || 'Archive recording'}`;
    play.addEventListener('click', () => playTrack(track));

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-queue';
    remove.setAttribute('aria-label', `Remove ${track.title} from queue`);
    remove.textContent = '×';
    remove.addEventListener('click', () => {
      state.queue = state.queue.filter(itemTrack => itemTrack.id !== track.id);
      persistQueue();
      renderQueue();
    });

    item.append(play, remove);
    fragment.append(item);
  });

  els.queueList.append(fragment);
  els.queueEmpty.hidden = state.queue.length > 0;
}

function playNext() {
  if (state.queue.length) {
    playTrack(state.queue[0], { consumeQueue: true });
    return;
  }
  const pool = state.filtered.length ? state.filtered : state.tracks;
  if (!pool.length) return;
  const index = Math.max(0, pool.findIndex(track => track.id === state.currentTrack?.id));
  playTrack(pool[(index + 1) % pool.length]);
}

function playPrevious() {
  const pool = state.filtered.length ? state.filtered : state.tracks;
  if (!pool.length) return;
  const index = Math.max(0, pool.findIndex(track => track.id === state.currentTrack?.id));
  playTrack(pool[(index - 1 + pool.length) % pool.length]);
}

function toggleFavorite(id) {
  if (state.favorites.has(id)) state.favorites.delete(id);
  else state.favorites.add(id);
  localStorage.setItem('ravedial-favorites', JSON.stringify([...state.favorites]));
  renderFavoritesCount();
  if (state.favoritesOnly) applyFilters();
  else renderTracks();
}

function renderFavoritesCount() {
  els.statFavorites.textContent = state.favorites.size.toLocaleString();
}

function persistQueue() {
  localStorage.setItem('ravedial-queue', JSON.stringify(state.queue.slice(0, 100)));
}

function loadStoredArray(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

function archiveFileUrl(path) {
  const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
  return `https://archive.org/download/${ARCHIVE_IDENTIFIER}/${encodedPath}`;
}

function formatMeta(track) {
  return [
    track.year || 'Year unknown',
    track.format?.toUpperCase(),
    track.duration ? formatDuration(track.duration) : null,
    track.size ? formatBytes(track.size) : null,
  ].filter(Boolean).join(' · ');
}

function formatDuration(seconds) {
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total) || total <= 0) return '';
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(value) / Math.log(1024)), units.length - 1);
  return `${(value / 1024 ** index).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
}

function compactNumber(value) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}

function normalize(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
