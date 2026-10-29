import test from 'node:test';
import assert from 'node:assert/strict';
import { getPhotos, savePhoto, removePhoto, replacePhotos, clearPhotos } from '../src/photos.js';
import { BASE_EXERCISES, createCustomExercise, setCustomExercises } from '../src/model.js';

test('photo APIs validate exercise identifiers before touching storage', async () => {
  await assert.rejects(savePhoto('not-an-exercise', null), /ispravnu vježbu/);
  await assert.rejects(removePhoto('__proto__'), /ispravnu vježbu/);
  await assert.rejects(replacePhotos({ missing: 'data:image/png;base64,iVBORw0KGgo=' }), /ispravnu vježbu/);
});

test('uploads reject unsupported types, empty files and forged image MIME types', async () => {
  await assert.rejects(savePhoto('squat', new Blob(['<svg></svg>'], { type: 'image/svg+xml' })), /JPEG, PNG ili WEBP/);
  await assert.rejects(savePhoto('squat', new Blob([], { type: 'image/png' })), /ne smije biti prazna/);
  await assert.rejects(savePhoto('squat', new Blob(['<script>bad</script>'], { type: 'image/png' })), /nije ispravna/);
  await assert.rejects(savePhoto('squat', new Blob([new ArrayBuffer(12 * 1024 * 1024 + 1)], { type: 'image/jpeg' })), /12 MB/);
});

test('backup photos require known IDs and strict base64 raster image URLs', async () => {
  for (const value of [
    null, [], 'photo',
    { squat: 'https://example.com/photo.jpg' },
    { squat: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' },
    { squat: 'data:image/png;base64,not base64' },
    { squat: 'data:image/png;base64,PHNjcmlwdD4=' },
    { squat: 'data:image/png;base64,iVBORw0KGgo===' },
  ]) await assert.rejects(replacePhotos(value));
});

test('oversized backup photos are rejected before image decoding or persistence', async () => {
  const oversized = `data:image/png;base64,${'A'.repeat(2 * 1024 * 1024 + 200)}`;
  await assert.rejects(replacePhotos({ squat: oversized }), /prevelika/);
});

test('storage absence is reported honestly without pretending mutations succeeded', async () => {
  assert.equal(typeof globalThis.indexedDB, 'undefined');
  await assert.rejects(getPhotos(), /ne podržava lokalno čuvanje/);
  await assert.rejects(removePhoto('squat'), /ne podržava lokalno čuvanje/);
  await assert.rejects(clearPhotos(), /ne podržava lokalno čuvanje/);
  await assert.rejects(replacePhotos({}), /ne podržava lokalno čuvanje/);
});

test('photo validation uses the live custom catalog, including entries added after module import', async () => {
  const custom = createCustomExercise({ id: 'custom-photo', name: 'Moja posebna sprava', group: 'Noge' });
  await assert.rejects(savePhoto(custom.id, null), /ispravnu vježbu/);
  try {
    setCustomExercises([custom]);
    // Reaching file/storage validation proves the dynamic exercise ID was accepted.
    await assert.rejects(savePhoto(custom.id, null), /JPEG, PNG ili WEBP/);
    await assert.rejects(removePhoto(custom.id), /ne podržava lokalno čuvanje/);
  } finally { setCustomExercises([]); }
  await assert.rejects(removePhoto(custom.id), /ispravnu vježbu/);
});

test('photo restore accepts an explicit prospective catalog without changing runtime state', async () => {
  const custom = createCustomExercise({ id: 'custom-restore', name: 'Moja sprava iz kopije', group: 'Noge' });
  const photoMap = { [custom.id]: 'data:image/png;base64,iVBORw0KGgo=' };
  await assert.rejects(replacePhotos(photoMap), /ispravnu vježbu/);
  // Node has no Image decoder: acceptance of the ID reaches the next real prerequisite.
  await assert.rejects(replacePhotos(photoMap, [...BASE_EXERCISES, custom]), /obradu fotografija/);
  await assert.rejects(replacePhotos(photoMap), /ispravnu vježbu/);
});
