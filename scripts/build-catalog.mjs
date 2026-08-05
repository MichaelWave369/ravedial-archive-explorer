import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, extname, basename } from 'node:path';

const IDENTIFIER = process.env.ARCHIVE_IDENTIFIER || 'RaveDownloads';
const OUTPUT = process.argv[2] || 'data/catalog.json';
const ENDPOINT = `https://archive.org/metadata/${IDENTIFIER}`;
const AUDIO_EXTENSIONS = new Set(['.mp3', '.ogg', '.oga', '.m4a', '.aac', '.wav', '.flac', '.opus']);

console.log(`Fetching Internet Archive metadata for ${IDENTIFIER}…`);
const response = await fetch(ENDPOINT, {
  headers: { 'user-agent': 'RaveDial-Archive-Explorer/0.1 (+https://github.com/MichaelWave369/ravedial-archive-explorer)' },
});

if (!response.ok) {
  throw new Error(`Internet Archive metadata request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const files = Array.isArray(payload.files) ? payload.files : [];
const seen = new Set();
const tracks = [];

for (const file of files) {
  const path = String(file.name || '').trim();
  const extension = extname(path).toLowerCase();
  if (!path || !AUDIO_EXTENSIONS.has(extension)) continue;
  if (path.startsWith('__ia_thumb') || path.includes('/__ia_thumb')) continue;

  const normalizedPath = path.toLowerCase();
  if (seen.has(normalizedPath)) continue;
  seen.add(normalizedPath);

  const folder = path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
  const segments = folder.split('/').filter(Boolean);
  const folderGroup = segments.slice(0, 2).join(' / ') || 'Archive root';
  const rawTitle = basename(path, extension);
  const title = cleanTitle(rawTitle);
  const yearMatch = `${path} ${file.title || ''}`.match(/(?:^|\D)((?:19[7-9]|20[0-2])\d)(?:\D|$)/);
  const year = yearMatch ? Number(yearMatch[1]) : null;
  const duration = parseDuration(file.length || file.duration || file.runtime);

  tracks.push({
    id: stableId(path),
    path,
    title,
    folder,
    folderGroup,
    year,
    format: extension.slice(1),
    size: toNumber(file.size),
    duration,
    source: file.source || null,
  });
}

tracks.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
const years = [...new Set(tracks.map(track => track.year).filter(Boolean))].sort((a, b) => b - a);
const formats = [...new Set(tracks.map(track => track.format))].sort();
const folders = [...new Set(tracks.map(track => track.folderGroup))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const catalog = {
  schemaVersion: 1,
  identifier: IDENTIFIER,
  sourceUrl: `https://archive.org/details/${IDENTIFIER}`,
  generatedAt: new Date().toISOString(),
  totalArchiveFiles: files.length,
  playableFiles: tracks.length,
  years,
  formats,
  folders,
  tracks,
};

await mkdir(dirname(OUTPUT), { recursive: true });
await writeFile(OUTPUT, JSON.stringify(catalog));
console.log(`Wrote ${tracks.length.toLocaleString()} playable recordings to ${OUTPUT}.`);

function cleanTitle(value) {
  return String(value)
    .replace(/[_]+/g, ' ')
    .replace(/\s+-\s+\d{2,3}kbps$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || 'Untitled recording';
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseDuration(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return Math.round(numeric);

  const parts = String(value).trim().split(':').map(Number);
  if (!parts.length || parts.some(part => !Number.isFinite(part))) return null;
  return Math.round(parts.reduce((total, part) => total * 60 + part, 0));
}

function stableId(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `rd-${(hash >>> 0).toString(36)}`;
}
