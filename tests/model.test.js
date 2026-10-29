import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkout, volume, stats, exerciseProgress, escapeHtml, SAMPLE_WORKOUTS } from '../src/model.js';

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
