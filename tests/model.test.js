import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkout, volume, stats, exerciseProgress, escapeHtml, SAMPLE_WORKOUTS,
  BASE_EXERCISES, EXERCISES, EXERCISE_GROUPS, createCustomExercise, setCustomExercises,
  getCustomExercises, getExercise, normalizeSearch } from '../src/model.js';

const input = (changes = {}) => ({
  id: 'test-1', name: ' Trening snage ', date: '2026-10-20', notes: ' Bilješka ',
  exercises: [{ exerciseId: 'bench-press', sets: [{ weight: 50, reps: 10 }, { weight: 55, reps: 8 }] }],
  ...changes,
});

test('validates and normalizes a workout without mutating input', () => {
  const source = input();
  const workout = createWorkout(source);
  assert.equal(workout.name, 'Trening snage');
  assert.equal(workout.notes, 'Bilješka');
  assert.notEqual(workout.exercises, source.exercises);
  assert.equal(source.name, ' Trening snage ');
  assert.equal(volume(workout), 940);
});

test('accepts bodyweight sets and decimal comma input', () => {
  const workout = createWorkout(input({ exercises: [{ exerciseId: 'pull-up', sets: [
    { weight: '0', reps: '8' }, { weight: '2,5', reps: '6' },
  ] }] }));
  assert.deepEqual(workout.exercises[0].sets, [{ weight: 0, reps: 8 }, { weight: 2.5, reps: 6 }]);
  assert.equal(volume(workout), 15);
});

test('requires valid identity, name, calendar date and at least one set', () => {
  for (const changes of [
    { id: '' }, { id: 4 }, { name: ' ' }, { name: null }, { date: '2026-02-30' },
    { date: '2026-2-01' }, { date: '2026-13-01' }, { notes: {} }, { exercises: [] },
    { exercises: [{ exerciseId: 'unknown', sets: [{ weight: 1, reps: 1 }] }] },
    { exercises: [{ exerciseId: 'squat', sets: [] }] },
  ]) assert.throws(() => createWorkout(input(changes)));
  assert.doesNotThrow(() => createWorkout(input({ date: '2024-02-29' })));
});

test('rejects blank, negative, non-finite and invalid repetition values', () => {
  for (const set of [
    { weight: '', reps: 8 }, { weight: -1, reps: 8 }, { weight: Infinity, reps: 8 },
    { weight: null, reps: 8 }, { weight: 'abc', reps: 8 }, { weight: 10, reps: '' },
    { weight: 10, reps: 0 }, { weight: 10, reps: -2 }, { weight: 10, reps: 2.5 },
    { weight: 10, reps: NaN }, { weight: 10, reps: true },
  ]) assert.throws(() => createWorkout(input({ exercises: [{ exerciseId: 'squat', sets: [set] }] })));
});

test('computes totals and latest workout regardless of input order', () => {
  const older = createWorkout(input({ id: 'older', date: '2026-09-30' }));
  const recent = createWorkout(input({ id: 'recent', date: '2026-10-21' }));
  assert.deepEqual(stats([recent, older], new Date('2026-10-29T12:00:00Z')), {
    totalWorkouts: 2, totalVolume: 1880, totalSets: 4, totalReps: 36,
    thisMonthWorkouts: 1, lastWorkout: recent,
  });
  assert.deepEqual(stats([]), {
    totalWorkouts: 0, totalVolume: 0, totalSets: 0, totalReps: 0, thisMonthWorkouts: 0, lastWorkout: null,
  });
});

test('progress sorts sessions and combines repeated exercise entries within a workout', () => {
  const older = createWorkout(input({ id: 'older', date: '2026-10-19' }));
  const recent = createWorkout(input({ id: 'recent', exercises: [
    { exerciseId: 'squat', sets: [{ weight: 100, reps: 5 }] },
    { exerciseId: 'bench-press', sets: [{ weight: 60, reps: 8 }] },
    { exerciseId: 'bench-press', sets: [{ weight: 65, reps: 5 }] },
  ] }));
  assert.deepEqual(exerciseProgress([recent, older], 'bench-press'), [
    { date: older.date, workoutId: 'older', workoutName: older.name, maxWeight: 55, volume: 940, totalSets: 2, totalReps: 18 },
    { date: recent.date, workoutId: 'recent', workoutName: recent.name, maxWeight: 65, volume: 805, totalSets: 2, totalReps: 13 },
  ]);
  assert.deepEqual(exerciseProgress([older], 'squat'), []);
});

test('escapes user-supplied HTML before interpolation', () => {
  assert.equal(escapeHtml('<img src="x" onerror=\'bad\'>&'), '&lt;img src=&quot;x&quot; onerror=&#39;bad&#39;&gt;&amp;');
});

test('demo workouts are valid, distinctly identified and suitable for progress display', () => {
  assert.equal(SAMPLE_WORKOUTS.length, 6);
  assert.equal(new Set(SAMPLE_WORKOUTS.map(({ id }) => id)).size, 6);
  for (const workout of SAMPLE_WORKOUTS) {
    assert.ok(workout.id.startsWith('demo-'));
    assert.deepEqual(createWorkout(workout), workout);
  }
  assert.equal(exerciseProgress(SAMPLE_WORKOUTS, 'bench-press').length, 3);
});

test('expanded catalog preserves permanent IDs, has unique names and valid groups', () => {
  assert.ok(BASE_EXERCISES.length >= 100);
  assert.ok(Object.isFrozen(BASE_EXERCISES));
  assert.equal(new Set(BASE_EXERCISES.map(({ id }) => id)).size, BASE_EXERCISES.length);
  assert.equal(new Set(BASE_EXERCISES.map(({ name }) => normalizeSearch(name))).size, BASE_EXERCISES.length);
  for (const item of BASE_EXERCISES) {
    assert.ok(Object.isFrozen(item));
    assert.ok(EXERCISE_GROUPS.includes(item.group));
  }
  assert.deepEqual(BASE_EXERCISES.slice(0, 15).map(({ id }) => id), [
    'bench-press', 'squat', 'deadlift', 'row', 'overhead-press', 'lat-pulldown', 'pull-up',
    'incline-dumbbell-press', 'lateral-raise', 'biceps-curl', 'triceps-pushdown', 'leg-press',
    'romanian-deadlift', 'leg-curl', 'calf-raise',
  ]);
});

test('custom exercises normalize names and require safe IDs and known groups', () => {
  const created = createCustomExercise({ name: '  Moj   posebni potisak  ', group: 'Grudi' });
  assert.match(created.id, /^custom-/);
  assert.equal(created.name, 'Moj posebni potisak');
  assert.equal(created.custom, true);
  assert.equal(created.group, 'Grudi');
  for (const item of [
    null, [], { id: 'squat', name: 'Moja vježba', group: 'Noge' },
    { id: 'custom-', name: 'Moja vježba', group: 'Noge' },
    { id: 'custom-<script>', name: 'Moja vježba', group: 'Noge' },
    { name: ' ', group: 'Noge' }, { name: 'A', group: 'Noge' },
    { name: 'A'.repeat(101), group: 'Noge' }, { name: 'Moja vježba', group: 'Nepoznato' },
  ]) assert.throws(() => createCustomExercise(item));
});

test('custom duplicates ignore accents, capitalization and repeated whitespace', () => {
  for (const name of ['  BENCH   PRESS  ', 'cucanj', 'ČUČANJ', 'Biceps PREGIB']) {
    assert.throws(() => createCustomExercise({ name, group: 'Ruke' }), /nazivom već postoji/);
  }
  const first = createCustomExercise({ id: 'custom-first', name: 'Đavolji čekić', group: 'Ruke' });
  assert.throws(() => createCustomExercise({ id: 'custom-second', name: '  DJAVOLJI  cekic ', group: 'Ruke' }, [first]), /nazivom već postoji/);
  assert.throws(() => createCustomExercise({ id: 'custom-first', name: 'Drugo ime', group: 'Ruke' }, [first]), /identifikatorom već postoji/);
});

test('custom refresh preserves the live catalog reference and protects stored entries', () => {
  const reference = EXERCISES;
  const source = { id: 'custom-refresh', name: 'Moj potisak unazad', group: 'Ramena' };
  try {
    setCustomExercises([source]);
    assert.equal(EXERCISES, reference);
    assert.equal(reference.length, BASE_EXERCISES.length + 1);
    assert.equal(getExercise(source.id).name, source.name);
    source.name = 'Promijenjen izvor';
    const copy = getCustomExercises();
    copy[0].name = 'Promijenjena kopija';
    assert.equal(getExercise('custom-refresh').name, 'Moj potisak unazad');
    setCustomExercises([]);
    assert.equal(EXERCISES, reference);
    assert.equal(reference.length, BASE_EXERCISES.length);
    assert.equal(getExercise('custom-refresh'), undefined);
  } finally { setCustomExercises([]); }
});

test('invalid catalog replacement leaves the entire current collection unchanged', () => {
  const existing = { id: 'custom-existing', name: 'Moj uspravni potisak', group: 'Ramena' };
  try {
    setCustomExercises([existing]);
    const before = [...EXERCISES];
    assert.throws(() => setCustomExercises([
      { id: 'custom-a', name: 'Nova vježba', group: 'Noge' },
      { id: 'custom-b', name: 'NOVA VJEZBA', group: 'Noge' },
    ]), /nazivom već postoji/);
    assert.deepEqual(EXERCISES, before);
    assert.throws(() => setCustomExercises([
      { id: 'custom-repeat', name: 'Prva vježba', group: 'Noge' },
      { id: 'custom-repeat', name: 'Druga vježba', group: 'Noge' },
    ]), /identifikatorom već postoji/);
    assert.deepEqual(EXERCISES, before);
    assert.throws(() => setCustomExercises(null));
    assert.deepEqual(EXERCISES, before);
  } finally { setCustomExercises([]); }
});

test('workouts validate prospective backup catalogs and pick up live custom changes', () => {
  const custom = createCustomExercise({ id: 'custom-backup', name: 'Moj potisak na posebnoj spravi', group: 'Grudi' });
  const workoutInput = input({ exercises: [{ exerciseId: custom.id, sets: [{ weight: 20, reps: 12 }] }] });
  assert.throws(() => createWorkout(workoutInput), /ispravnu vježbu/);
  const prospective = [...BASE_EXERCISES, custom];
  const backupWorkout = createWorkout(workoutInput, prospective);
  assert.equal(volume(backupWorkout), 240);
  assert.equal(getExercise(custom.id), undefined);
  try {
    setCustomExercises([custom]);
    assert.deepEqual(createWorkout(workoutInput), backupWorkout);
    assert.throws(() => createWorkout(workoutInput, BASE_EXERCISES), /ispravnu vježbu/);
    assert.deepEqual(SAMPLE_WORKOUTS.map((item) => createWorkout(item)), SAMPLE_WORKOUTS);
  } finally { setCustomExercises([]); }
  assert.throws(() => createWorkout(workoutInput), /ispravnu vježbu/);
});
