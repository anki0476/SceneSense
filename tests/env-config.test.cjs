const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseVoiceEnv}=require('../desktop/env-config.cjs');
test('local voice configuration handles empty, quoted and provider-specific keys',()=>{
  assert.equal(parseVoiceEnv('OPENAI_API_KEY=\nSARVAM_API_KEY='),null);
  const source='OPENAI_API_KEY="sk-fixture-only-key"\nSARVAM_API_KEY=fixture-sarvam\nVOICE_PROVIDER=auto';
  assert.equal(parseVoiceEnv(source).provider,'sarvam');
  assert.equal(parseVoiceEnv(source+'\nVOICE_PROVIDER=openai').provider,'openai');
  assert.equal(parseVoiceEnv('OPENAI_API_KEY=sk-fixture-only-key').provider,'openai');
  assert.throws(()=>parseVoiceEnv(source+'\nVOICE_PROVIDER=invalid'));
});
