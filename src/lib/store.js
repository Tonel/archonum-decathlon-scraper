import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** Writes JSON via a temp file and rename, so a crash never leaves a half-written file. */
export async function writeJsonAtomic(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  await rename(tmp, file);
}

export async function readJsonIfExists(file) {
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/** Runs async writers one at a time so concurrent workers never race on the same file. */
export function createSerialRunner() {
  let chain = Promise.resolve();
  return (task) => {
    const run = chain.then(task);
    chain = run.catch(() => {});
    return run;
  };
}

/**
 * Persistent store of unique product URLs for one category.
 * Shape: { category, updatedAt, totalPages, completedPages[], failedPages[], urls[] }
 */
export function emptyUrlStore(categoryUrl) {
  return {
    category: categoryUrl,
    updatedAt: null,
    totalPages: null,
    completedPages: [],
    failedPages: [],
    urls: [],
  };
}

/** Adds URLs to the store, keeping insertion order and skipping duplicates. Returns the number added. */
export function addUniqueUrls(store, urls) {
  const seen = new Set(store.urls);
  let added = 0;
  for (const url of urls) {
    if (seen.has(url)) continue;
    seen.add(url);
    store.urls.push(url);
    added += 1;
  }
  return added;
}
