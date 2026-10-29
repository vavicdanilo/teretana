import { EXERCISES } from './model.js';

const DATABASE_NAME = 'teretana-exercise-photos';
const STORE_NAME = 'photos';
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_STORED_BYTES = 1.5 * 1024 * 1024;
const MAX_IMAGE_SIDE = 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
let databasePromise;

function assertExerciseId(exerciseId, catalog = EXERCISES) {
  if (!Array.isArray(catalog) || !catalog.some(({ id }) => id === exerciseId)) {
    throw new Error('Izaberi ispravnu vježbu za fotografiju.');
  }
}

function matchesImageType(bytes, type) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') {
    return [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value);
  }
  if (type === 'image/webp') {
    return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
      && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  }
  return false;
}

function validateDataURL(dataURL) {
  if (typeof dataURL !== 'string' || dataURL.length > MAX_STORED_BYTES * 4 / 3 + 100) {
    throw new Error('Fotografija iz rezervne kopije je prevelika. Najveća veličina je 1,5 MB.');
  }
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL);
  if (!match || match[2].length % 4 !== 0) {
    throw new Error('Fotografija nije u ispravnom JPEG, PNG ili WEBP formatu.');
  }
  const padding = match[2].endsWith('==') ? 2 : match[2].endsWith('=') ? 1 : 0;
  const byteLength = match[2].length / 4 * 3 - padding;
  if (byteLength > MAX_STORED_BYTES) {
    throw new Error('Fotografija iz rezervne kopije je prevelika. Najveća veličina je 1,5 MB.');
  }
  let bytes;
  try {
    bytes = Uint8Array.from(atob(match[2].slice(0, 24)), (character) => character.charCodeAt(0));
  } catch {
    throw new Error('Podaci fotografije nijesu ispravni.');
  }
  if (!matchesImageType(bytes, match[1])) throw new Error('Podaci fotografije ne odgovaraju formatu slike.');
  return dataURL;
}

function dataURLToBlob(dataURL) {
  const separator = dataURL.indexOf(',');
  const type = dataURL.slice(5, dataURL.indexOf(';'));
  const bytes = Uint8Array.from(atob(dataURL.slice(separator + 1)), (character) => character.charCodeAt(0));
  return new Blob([bytes], { type });
}

async function blobToDataURL(blob) {
  if (!(blob instanceof Blob) || !ALLOWED_TYPES.has(blob.type) || blob.size > MAX_STORED_BYTES) {
    throw new Error('Sačuvani podaci fotografije nijesu ispravni.');
  }
  let bytes;
  try { bytes = new Uint8Array(await blob.arrayBuffer()); } catch {
    throw new Error('Nije moguće pročitati sačuvanu fotografiju.');
  }
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 32768) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
  }
  return validateDataURL(`data:${blob.type};base64,${btoa(binary)}`);
}

function openDatabase() {
  if (!databasePromise) {
    databasePromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        reject(new Error('Ovaj preglednik ne podržava lokalno čuvanje fotografija.'));
        return;
      }
      let settled = false;
      let request;
      try {
        request = indexedDB.open(DATABASE_NAME, 1);
      } catch {
        reject(new Error('Lokalno čuvanje fotografija nije dostupno. Provjeri dozvole preglednika.'));
        return;
      }
      request.onupgradeneeded = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: 'exerciseId' });
      };
      request.onerror = () => {
        settled = true;
        reject(new Error('Nije moguće otvoriti lokalnu zbirku fotografija. Provjeri dozvole preglednika.'));
      };
      request.onblocked = () => {
        settled = true;
        reject(new Error('Zatvori ostale kartice ove aplikacije i ponovo pokušaj čuvanje fotografije.'));
      };
      request.onsuccess = () => {
        if (settled) {
          request.result.close();
          return;
        }
        settled = true;
        const database = request.result;
        database.onversionchange = () => {
          database.close();
          databasePromise = undefined;
        };
        resolve(database);
      };
    }).catch((error) => {
      databasePromise = undefined;
      throw error;
    });
  }
  return databasePromise;
}

async function transact(mode, operation, failureMessage) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    let transaction;
    let result;
    try {
      transaction = database.transaction(STORE_NAME, mode);
      transaction.oncomplete = () => resolve(result);
      transaction.onabort = () => reject(new Error(failureMessage));
      // Request errors abort the transaction; only a committed transaction resolves.
      transaction.onerror = () => {};
      const request = operation(transaction.objectStore(STORE_NAME));
      if (request) request.onsuccess = () => { result = request.result; };
    } catch {
      try { transaction?.abort(); } catch { /* Transaction may already be inactive. */ }
      reject(new Error(failureMessage));
    }
  });
}

function loadImage(source) {
  if (typeof Image === 'undefined') throw new Error('Ovaj preglednik ne podržava obradu fotografija.');
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        reject(new Error('Izabrana datoteka nije ispravna fotografija.'));
        return;
      }
      resolve(image);
    };
    image.onerror = () => reject(new Error('Izabrana datoteka nije ispravna fotografija.'));
    image.src = source;
  });
}

/** Read committed photos. No photo data is placed in localStorage. */
export async function getPhotos(catalog = EXERCISES) {
  const records = await transact('readonly', (store) => store.getAll(), 'Nije moguće učitati fotografije iz ovog preglednika.');
  const photos = {};
  for (const record of records) {
    assertExerciseId(record.exerciseId, catalog);
    // Read the initial dataURL format as well, preserving photos from older sessions.
    photos[record.exerciseId] = record.blob ? await blobToDataURL(record.blob) : validateDataURL(record.dataURL);
  }
  return photos;
}

/** Decode and rasterize uploaded photos before persisting them. */
export async function savePhoto(exerciseId, file) {
  assertExerciseId(exerciseId);
  if (typeof Blob === 'undefined' || !(file instanceof Blob) || !ALLOWED_TYPES.has(file.type)) {
    throw new Error('Izaberi JPEG, PNG ili WEBP fotografiju.');
  }
  if (file.size === 0 || file.size > MAX_SOURCE_BYTES) {
    throw new Error('Fotografija mora biti manja od 12 MB i ne smije biti prazna.');
  }
  let header;
  try { header = new Uint8Array(await file.slice(0, 16).arrayBuffer()); } catch {
    throw new Error('Nije moguće pročitati izabranu fotografiju.');
  }
  if (!matchesImageType(header, file.type)) throw new Error('Izabrana datoteka nije ispravna JPEG, PNG ili WEBP fotografija.');
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
    throw new Error('Ovaj preglednik ne podržava obradu fotografija.');
  }
  const objectURL = URL.createObjectURL(file);
  let dataURL;
  try {
    const image = await loadImage(objectURL);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d', { alpha: false });
    if (!context) throw new Error('Nije moguće pripremiti fotografiju u ovom pregledniku.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    dataURL = validateDataURL(canvas.toDataURL('image/jpeg', 0.8));
  } finally {
    URL.revokeObjectURL(objectURL);
  }
  const blob = dataURLToBlob(dataURL);
  await transact('readwrite', (store) => store.put({ exerciseId, blob }),
    'Fotografija nije sačuvana. Provjeri slobodan prostor i dozvole preglednika.');
  return dataURL;
}

export async function removePhoto(exerciseId) {
  assertExerciseId(exerciseId);
  await transact('readwrite', (store) => store.delete(exerciseId), 'Fotografija nije uklonjena. Pokušaj ponovo.');
}

/** Validate the full backup before atomically replacing the stored collection. */
export async function replacePhotos(map, catalog = EXERCISES) {
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    throw new Error('Zbirka fotografija u rezervnoj kopiji nije ispravna.');
  }
  const entries = Object.entries(map);
  // Complete structural validation before decoding images or opening a write transaction.
  for (const [exerciseId, dataURL] of entries) {
    assertExerciseId(exerciseId, catalog);
    validateDataURL(dataURL);
  }
  for (const [, dataURL] of entries) await loadImage(dataURL);
  const records = entries.map(([exerciseId, dataURL]) => ({ exerciseId, blob: dataURLToBlob(dataURL) }));
  await transact('readwrite', (store) => {
    store.clear();
    for (const record of records) store.put(record);
  }, 'Fotografije nijesu uvezene. Provjeri slobodan prostor i dozvole preglednika.');
}

export async function clearPhotos() {
  await transact('readwrite', (store) => store.clear(), 'Fotografije nijesu obrisane. Pokušaj ponovo.');
}
