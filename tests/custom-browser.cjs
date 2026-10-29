const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const { mkdtemp, readFile, rm } = require('node:fs/promises');
const { tmpdir } = require('node:os');
const { join } = require('node:path');

(async()=>{
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const temp=await mkdtemp(join(tmpdir(),'forma-custom-'));
  const click=selector=>page.locator(selector).first().click();
  const upload=async(selector,payload)=>{const event=page.waitForEvent('filechooser');await click(selector);await(await event).setFiles(payload);};
  const data=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('forma.workouts.v1')));
  try{
    await page.goto(process.env.FORMA_TEST_URL||'http://127.0.0.1:3000');
    await page.waitForSelector('.demo-tag');
    const legacy={id:'legacy-workout',name:'Moj stari trening',date:'2026-10-20',notes:'Sačuvana bilješka',exercises:[{exerciseId:'bench-press',sets:[{weight:50,reps:10}]}]};
    await page.evaluate(item=>{localStorage.setItem('forma.workouts.v1',JSON.stringify([item]));localStorage.setItem('forma.demo.v1','off');},legacy);
    await page.reload();await click('[data-nav="workouts"]');
    assert.equal(await page.locator('[data-workout]').count(),1,'legacy array migration preserves workout');
    assert.equal((await data())[0].id,'legacy-workout','reading legacy storage does not rewrite it');
    await click('[data-nav="exercises"]');
    assert.equal(await page.locator('.exercise-card').count(),156);
    await page.fill('#library-search','cucanj');
    assert.ok(await page.locator('.exercise-card').count()>3,'search folds accents');
    await page.fill('#library-search','Moja Hammer sprava');
    await click('[data-create-custom]');
    assert.equal(await page.inputValue('#custom-name'),'Moja Hammer sprava');
    await page.selectOption('#custom-group','Grudi');
    await page.fill('#custom-name','  BENCH   PRESS  ');await click('button[form="custom-exercise-form"]');
    await page.waitForSelector('#custom-error:not([hidden])');
    await page.fill('#custom-name','Moja Hammer sprava');await click('button[form="custom-exercise-form"]');
    await page.waitForSelector('.modal',{state:'detached'});
    let saved=await data();assert.equal(saved.workouts.length,1);assert.equal(saved.customExercises.length,1);
    const customId=saved.customExercises[0].id;
    const photo=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=100;c.height=100;c.getContext('2d').fillRect(0,0,100,100);return c.toDataURL('image/png').split(',')[1];});
    await upload(`[data-photo="${customId}"]`,{name:'moja-sprava.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await page.waitForSelector(`[data-exercise-id="${customId}"] .equipment-photo img`);
    // Destructive actions wait for asynchronous image decoding/storage to finish.
    await page.evaluate(()=>{
      const descriptor=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');
      window.restoreImageSource=()=>Object.defineProperty(HTMLImageElement.prototype,'src',descriptor);
      Object.defineProperty(HTMLImageElement.prototype,'src',{...descriptor,set(value){
        if(value.startsWith('blob:'))setTimeout(()=>descriptor.set.call(this,value),1000);
        else descriptor.set.call(this,value);
      }});
    });
    await upload(`[data-photo="${customId}"]`,{name:'nova-sprava.png',mimeType:'image/png',buffer:Buffer.from(photo,'base64')});
    await click('[data-nav="settings"]');await click('[data-action="clear"]');
    assert.equal(await page.locator('.confirm-modal').count(),0,'clear is blocked during a photo write');
    await page.waitForFunction(()=>document.querySelector('#toast').textContent==='Fotografija sprave je sačuvana.');
    await page.evaluate(()=>{window.restoreImageSource();delete window.restoreImageSource;});
    await click('[data-nav="exercises"]');await page.fill('#library-search','Moja Hammer sprava');
    await click(`[data-exercise-start="${customId}"]`);
    await page.fill('#workout-name','Trening sa ličnim vježbama');
    await page.fill('#workout-notes','Bilješka koja ostaje');
    for(const input of await page.locator('[data-value="weight"]').all())await input.fill('12,5');
    assert.ok(await page.locator('[data-preview-photo]').isVisible());
    // Create from dropdown and cancel once: the workout must survive both paths.
    await page.selectOption('#add-exercise','__new__');await click('#cancel-custom');
    assert.equal(await page.inputValue('#workout-name'),'Trening sa ličnim vježbama');
    assert.equal(await page.locator('[data-value="weight"]').first().inputValue(),'12,5');
    await page.fill('#workout-exercise-search','Druga lična sprava');
    await page.selectOption('#add-exercise','__new__');
    assert.equal(await page.inputValue('#custom-name'),'Druga lična sprava');
    await page.selectOption('#custom-group','Leđa');await click('button[form="custom-exercise-form"]');
    await page.waitForSelector('#workout-form');
    assert.equal(await page.inputValue('#workout-name'),'Trening sa ličnim vježbama');
    assert.equal(await page.inputValue('#workout-notes'),'Bilješka koja ostaje');
    assert.equal(await page.locator('.exercise-entry').count(),2);
    for(const input of await page.locator('.exercise-entry').nth(1).locator('[data-value="weight"]').all())await input.fill('20');
    await click('button[form="workout-form"]');await page.waitForSelector('.modal',{state:'detached'});
    await page.reload();await click('[data-nav="exercises"]');
    await click('[data-group="Moje vježbe"]');
    assert.equal(await page.locator('.exercise-card').count(),2);
    await page.waitForSelector(`[data-exercise-id="${customId}"] .equipment-photo img`);
    await click(`[data-exercise-progress="${customId}"]`);
    assert.equal(await page.locator('#chart-exercise').inputValue(),customId);
    assert.match(await page.locator('.records-list').innerText(),/12,5 kg/);
    await click('[data-nav="settings"]');
    const downloadEvent=page.waitForEvent('download');await click('[data-action="export"]');
    const path=join(temp,'custom-backup.json');await(await downloadEvent).saveAs(path);
    const backup=JSON.parse(await readFile(path,'utf8'));
    assert.equal(backup.version,2);assert.equal(backup.customExercises.length,2);assert.equal(backup.workouts.length,2);assert.ok(backup.photos[customId]);
    await page.evaluate(()=>{window.originalStorageWrite=Storage.prototype.setItem;Storage.prototype.setItem=function(){throw new DOMException('Denied','QuotaExceededError');};});
    await click('[data-action="clear"]');await click('#confirm-ok');await page.waitForSelector('#confirm-error:not([hidden])');
    assert.equal((await data()).customExercises.length,2,'failed clear keeps custom definitions');
    assert.ok(await page.evaluate(async id=>(await(await import('/src/photos.js')).getPhotos())[id],customId),'failed clear restores custom photo');
    await click('#confirm-cancel');await page.evaluate(()=>{Storage.prototype.setItem=window.originalStorageWrite;delete window.originalStorageWrite;});
    await click('[data-action="clear"]');await click('#confirm-ok');await page.waitForSelector('.modal',{state:'detached'});
    assert.equal((await data()).customExercises.length,0);
    await upload('[data-action="import"]',path);await click('#confirm-ok');await page.waitForSelector('.modal',{state:'detached'});
    assert.equal((await data()).customExercises.length,2);assert.equal((await data()).workouts.length,2);
    await click('[data-nav="exercises"]');await click('[data-group="Moje vježbe"]');
    await page.waitForSelector(`[data-exercise-id="${customId}"] .equipment-photo img`);
    // New custom labels must remain text even when they contain HTML syntax.
    await click('[data-action="new-exercise"]');await page.fill('#custom-name','Moja <b>sprava</b>');await page.selectOption('#custom-group','Noge');
    await click('button[form="custom-exercise-form"]');await page.waitForSelector('.modal',{state:'detached'});
    assert.equal(await page.locator('.exercise-card h3').innerText(),'Moja <b>sprava</b>');
    assert.equal(await page.locator('.exercise-card h3 b').count(),0);
    // v1 backup remains supported; import replaces only after full confirmation.
    const oldBackup={app:'forma',version:1,workouts:[legacy],photos:{}};
    await click('[data-nav="settings"]');
    await upload('[data-action="import"]',{name:'old-backup.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(oldBackup))});
    await click('#confirm-ok');await page.waitForSelector('.modal',{state:'detached'});
    assert.equal((await data()).customExercises.length,0);assert.equal((await data()).workouts.length,1);
    // Mobile custom-creation controls fit the screen and work without a keyboard shortcut.
    await page.setViewportSize({width:390,height:844});await page.waitForTimeout(300);
    await click('.mobile-menu');await click('[data-nav="exercises"]');await page.waitForTimeout(300);
    assert.deepEqual(await page.evaluate(()=>[innerWidth,document.documentElement.scrollWidth]),[390,390]);
    await click('[data-action="new-exercise"]');
    assert.ok(await page.locator('#custom-name').isVisible());await page.keyboard.press('Escape');await page.waitForSelector('.modal',{state:'detached'});
    assert.deepEqual(errors,[]);
    console.log('Custom exercise browser integration passed: legacy migration, 156 exercises, accent search, duplicate guard, custom creation from library/dropdown, draft preservation, photos, progress, reload, v2 backup round-trip, v1 import, XSS escaping, mobile.');
  }finally{await browser.close();await rm(temp,{recursive:true,force:true});}
})().catch(error=>{console.error(error);process.exitCode=1;});
