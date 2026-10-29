import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeData, normalizeBackup } from '../src/data.js';
import { EXERCISES, BASE_EXERCISES } from '../src/model.js';

const workout = (exerciseId = 'bench-press') => ({ id:'saved-workout', name:'Sačuvani trening', date:'2026-10-20', notes:'', exercises:[{exerciseId,sets:[{weight:40,reps:10}]}] });
const custom = {id:'custom-my-machine',name:'Moja posebna sprava',group:'Leđa'};

test('legacy workout arrays load with all records intact and no custom definitions', () => {
  const input=[workout()];
  const result=normalizeData(input);
  assert.equal(result.version,2);
  assert.deepEqual(result.workouts,input);
  assert.deepEqual(result.customExercises,[]);
  assert.ok(Array.isArray(input));
});

test('version2 validates custom exercise references without mutating live catalog', () => {
  const previous=[...EXERCISES];
  const result=normalizeData({version:2,workouts:[workout(custom.id)],customExercises:[custom]});
  assert.equal(result.workouts[0].exercises[0].exerciseId,custom.id);
  assert.equal(result.customExercises[0].custom,true);
  assert.deepEqual(EXERCISES,previous);
});

test('rejects orphan workouts, duplicate IDs or names and malformed definitions', () => {
  for(const source of [
    {version:2,workouts:[workout(custom.id)],customExercises:[]},
    {version:2,workouts:[workout(),workout()],customExercises:[]},
    {version:2,workouts:[],customExercises:[custom,custom]},
    {version:2,workouts:[],customExercises:[custom,{...custom,id:'custom-copy'}]},
    {version:2,workouts:[],customExercises:[{...custom,name:'bench press'}]},
    {version:2,workouts:[],customExercises:[{name:'Bez identifikatora',group:'Leđa'}]},
    {version:3,workouts:[],customExercises:[]},
  ]) assert.throws(()=>normalizeData(source));
  assert.equal(EXERCISES.length,BASE_EXERCISES.length);
});

test('imports version1 backups and version2 backups with definitions and photos', () => {
  const old=normalizeBackup({app:'forma',version:1,workouts:[workout()],photos:{}});
  assert.equal(old.workouts.length,1);
  assert.deepEqual(old.customExercises,[]);
  const recent=normalizeBackup({app:'forma',version:2,workouts:[workout(custom.id)],customExercises:[custom],photos:{[custom.id]:'validated-by-photo-module'}});
  assert.equal(recent.customExercises[0].id,custom.id);
  assert.equal(recent.photos[custom.id],'validated-by-photo-module');
  assert.throws(()=>normalizeBackup({app:'foreign',version:1,workouts:[]}));
  assert.throws(()=>normalizeBackup({app:'forma',version:2,workouts:[],customExercises:[],photos:[]}));
});
