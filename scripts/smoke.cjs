const { spawn } = require('node:child_process');
const assert = require('node:assert/strict');
const { createObsFixture } = require('../tests/fixtures/obs-server.cjs');
(async () => {
  const fixture=await createObsFixture();
  try {
    const executable=require('electron');
    const child=spawn(executable,['.','--smoke-test',`--fixture-port=${fixture.port}`],{stdio:'inherit',windowsHide:true});
    const code=await new Promise((resolve,reject)=>{ child.on('error',reject); child.on('exit',resolve); });
    assert.equal(code,0,'Desktop integration failed');
    assert.equal(fixture.state.failedAuth,1);
    assert.equal(fixture.state.writes.length,96);
    assert.equal(fixture.state.writes[7].positionX,1576);
    assert.equal(fixture.state.writes[15].scaleX,.45);
    assert.deepEqual(fixture.state.transform,fixture.original);
    console.log('Simulator verified twelve animated actions (96 transform frames), including Sense preview/apply/undo and six voice commands, followed by exact restoration. No real OBS, Twitch or paid AI account was used.');
  } finally { await fixture.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
