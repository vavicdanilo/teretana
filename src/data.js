import { BASE_EXERCISES, createCustomExercise, createWorkout } from './model.js';

export const DATA_VERSION = 2;

// Validate a complete collection without changing the live exercise catalog.
export function normalizeData(input) {
  const source = Array.isArray(input)
    ? { version: DATA_VERSION, workouts: input, customExercises: [] }
    : input;
  if (!source || source.version !== DATA_VERSION || !Array.isArray(source.workouts)
      || source.workouts.length > 10000 || !Array.isArray(source.customExercises)
      || source.customExercises.length > 500) {
    throw new Error('Podaci treninga i biblioteke nijesu ispravni.');
  }
  const customExercises = [];
  for (const entry of source.customExercises) {
    if (!entry || typeof entry.id !== 'string') {
      throw new Error('Lična vježba mora imati sačuvan identifikator.');
    }
    customExercises.push(createCustomExercise(entry, [...BASE_EXERCISES, ...customExercises]));
  }
  const catalog = [...BASE_EXERCISES, ...customExercises];
  const workouts = source.workouts.map(item => createWorkout(item, catalog));
  if (new Set(workouts.map(item => item.id)).size !== workouts.length) {
    throw new Error('Podaci sadrže ponovljene identifikatore treninga.');
  }
  return { version: DATA_VERSION, workouts, customExercises };
}

export function normalizeBackup(input) {
  if (!input || input.app !== 'forma' || ![1, DATA_VERSION].includes(input.version)) {
    throw new Error('Ovo nije podržana Forma rezervna kopija.');
  }
  const data = normalizeData({
    version: DATA_VERSION,
    workouts: input.workouts,
    customExercises: input.version === 1 ? [] : input.customExercises,
  });
  const photos = input.photos ?? {};
  if (typeof photos !== 'object' || Array.isArray(photos)) {
    throw new Error('Zbirka fotografija u rezervnoj kopiji nije ispravna.');
  }
  return { ...data, photos };
}
