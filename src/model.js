export const EXERCISES = Object.freeze([
  { id: 'bench-press', name: 'Bench press', group: 'Grudi' },
  { id: 'squat', name: 'Čučanj', group: 'Noge' },
  { id: 'deadlift', name: 'Mrtvo dizanje', group: 'Leđa' },
  { id: 'row', name: 'Veslanje', group: 'Leđa' },
  { id: 'overhead-press', name: 'Potisak iznad glave', group: 'Ramena' },
  { id: 'lat-pulldown', name: 'Povlačenje na lat mašini', group: 'Leđa' },
  { id: 'pull-up', name: 'Zgibovi', group: 'Leđa' },
  { id: 'incline-dumbbell-press', name: 'Kosi potisak bučicama', group: 'Grudi' },
  { id: 'lateral-raise', name: 'Lateralno podizanje', group: 'Ramena' },
  { id: 'biceps-curl', name: 'Biceps pregib', group: 'Ruke' },
  { id: 'triceps-pushdown', name: 'Triceps na sajli', group: 'Ruke' },
  { id: 'leg-press', name: 'Leg press', group: 'Noge' },
  { id: 'romanian-deadlift', name: 'Rumunsko mrtvo dizanje', group: 'Noge' },
  { id: 'leg-curl', name: 'Pregib za zadnju ložu', group: 'Noge' },
  { id: 'calf-raise', name: 'Podizanje na prste', group: 'Noge' },
].map(Object.freeze));

const exerciseIds = new Set(EXERCISES.map((exercise) => exercise.id));
const round = (number) => Math.round((number + Number.EPSILON) * 100) / 100;

function localDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function numberFromInput(value) {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string' || value.trim() === '') return NaN;
  return Number(value.trim().replace(',', '.'));
}

/** Validate a workout and return a new, normalized object suitable for storage. */
export function createWorkout(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('Podaci treninga nijesu ispravni.');
  }
  const id = input.id === undefined ? globalThis.crypto.randomUUID() : input.id;
  if (typeof id !== 'string' || !id.trim() || id.length > 200) {
    throw new Error('Identifikator treninga nije ispravan.');
  }
  if (typeof input.name !== 'string' || !input.name.trim()) {
    throw new Error('Unesi naziv treninga.');
  }
  if (!isCalendarDate(input.date)) throw new Error('Unesi ispravan datum treninga.');
  if (input.notes !== undefined && typeof input.notes !== 'string') {
    throw new Error('Bilješka mora biti tekst.');
  }
  if (!Array.isArray(input.exercises) || input.exercises.length === 0) {
    throw new Error('Dodaj bar jednu vježbu.');
  }
  const exercises = input.exercises.map((exercise, index) => {
    if (!exercise || typeof exercise !== 'object' || !exerciseIds.has(exercise.exerciseId)) {
      throw new Error(`Izaberi ispravnu vježbu na poziciji ${index + 1}.`);
    }
    if (!Array.isArray(exercise.sets) || exercise.sets.length === 0) {
      throw new Error(`Dodaj bar jednu seriju za vježbu ${index + 1}.`);
    }
    const sets = exercise.sets.map((set, setIndex) => {
      if (!set || typeof set !== 'object') throw new Error('Podaci serije nijesu ispravni.');
      const weight = numberFromInput(set.weight);
      const reps = numberFromInput(set.reps);
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error(`Unesi težinu od 0 kg ili više za seriju ${setIndex + 1}.`);
      }
      if (!Number.isSafeInteger(reps) || reps < 1) {
        throw new Error(`Unesi cijeli broj ponavljanja veći od 0 za seriju ${setIndex + 1}.`);
      }
      if (!Number.isFinite(weight * reps) || weight * reps > Number.MAX_SAFE_INTEGER) {
        throw new Error('Unesena težina ili broj ponavljanja su preveliki.');
      }
      return { weight, reps };
    });
    return { exerciseId: exercise.exerciseId, sets };
  });
  return { id: id.trim(), name: input.name.trim(), date: input.date, notes: (input.notes ?? '').trim(), exercises };
}

/** External load volume, in kilograms. Bodyweight-only sets contribute zero. */
export function volume(workout) {
  return round(workout.exercises.reduce((total, exercise) => total + exercise.sets.reduce(
    (exerciseTotal, set) => exerciseTotal + set.weight * set.reps, 0,
  ), 0));
}

export function stats(workouts, now = new Date()) {
  let totalSets = 0;
  let totalReps = 0;
  let totalVolume = 0;
  let lastWorkout = null;
  let thisMonthWorkouts = 0;
  const month = localDate(now).slice(0, 7);
  for (const workout of workouts) {
    totalVolume += volume(workout);
    if (!lastWorkout || workout.date > lastWorkout.date) lastWorkout = workout;
    if (workout.date.slice(0, 7) === month) thisMonthWorkouts += 1;
    for (const exercise of workout.exercises) {
      totalSets += exercise.sets.length;
      totalReps += exercise.sets.reduce((sum, set) => sum + set.reps, 0);
    }
  }
  return { totalWorkouts: workouts.length, totalVolume: round(totalVolume), totalSets, totalReps, thisMonthWorkouts, lastWorkout };
}

/** One point per training session; sessions on the same date stay distinct. */
export function exerciseProgress(workouts, exerciseId) {
  return workouts.flatMap((workout) => {
    const exercises = workout.exercises.filter((exercise) => exercise.exerciseId === exerciseId);
    const sets = exercises.flatMap((exercise) => exercise.sets);
    if (!sets.length) return [];
    return [{
      date: workout.date,
      workoutId: workout.id,
      workoutName: workout.name,
      maxWeight: Math.max(...sets.map((set) => set.weight)),
      volume: round(sets.reduce((sum, set) => sum + set.weight * set.reps, 0)),
      totalSets: sets.length,
      totalReps: sets.reduce((sum, set) => sum + set.reps, 0),
    }];
  }).sort((a, b) => a.date.localeCompare(b.date));
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function daysAgo(days) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() - days);
  return localDate(date);
}

const demoSets = (weight, reps = 10) => Array.from({ length: 3 }, () => ({ weight, reps }));

// Display-only examples. The application must explicitly label these as demo data.
// Do not seed the user's real workout storage with this collection.
export const SAMPLE_WORKOUTS = [
  { id: 'demo-1', date: daysAgo(31), name: 'Gornji dio tijela', notes: '', exercises: [
    { exerciseId: 'bench-press', sets: demoSets(50) },
    { exerciseId: 'row', sets: demoSets(40) },
    { exerciseId: 'biceps-curl', sets: demoSets(10, 12) },
  ] },
  { id: 'demo-2', date: daysAgo(24), name: 'Noge i snaga', notes: '', exercises: [
    { exerciseId: 'squat', sets: demoSets(60, 8) },
    { exerciseId: 'romanian-deadlift', sets: demoSets(50, 10) },
    { exerciseId: 'calf-raise', sets: demoSets(20, 15) },
  ] },
  { id: 'demo-3', date: daysAgo(17), name: 'Gornji dio tijela', notes: '', exercises: [
    { exerciseId: 'bench-press', sets: demoSets(55) },
    { exerciseId: 'row', sets: demoSets(45) },
    { exerciseId: 'overhead-press', sets: demoSets(25, 8) },
  ] },
  { id: 'demo-4', date: daysAgo(10), name: 'Noge i snaga', notes: '', exercises: [
    { exerciseId: 'squat', sets: demoSets(65, 8) },
    { exerciseId: 'romanian-deadlift', sets: demoSets(55, 10) },
    { exerciseId: 'leg-press', sets: demoSets(100, 12) },
  ] },
  { id: 'demo-5', date: daysAgo(5), name: 'Gornji dio tijela', notes: 'Primjer treninga', exercises: [
    { exerciseId: 'bench-press', sets: demoSets(60, 8) },
    { exerciseId: 'row', sets: demoSets(50) },
    { exerciseId: 'biceps-curl', sets: demoSets(12.5, 12) },
  ] },
  { id: 'demo-6', date: daysAgo(1), name: 'Noge i snaga', notes: 'Primjer treninga', exercises: [
    { exerciseId: 'squat', sets: demoSets(70, 8) },
    { exerciseId: 'romanian-deadlift', sets: demoSets(60, 10) },
    { exerciseId: 'leg-press', sets: demoSets(110, 12) },
  ] },
].map(createWorkout);
