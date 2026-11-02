const { test } = require('node:test');
const assert = require('node:assert/strict');
const { TwitchService } = require('../desktop/twitch.cjs');
function message(id, text) { return { payload: { event: { message_id:id, chatter_user_name:'Viewer', message:{text} } } }; }
test('reports are deduplicated and never invoke an action executor', () => {
  const events = []; const service = new TwitchService(x => events.push(x));
  service.notification(message('1','!blocked inventory'));
  service.notification(message('1','!blocked inventory'));
  service.notification(message('2','move my webcam'));
  assert.equal(service.state.reports.length,1);
  assert.equal(events.length,1);
  assert.equal(events[0].kind,'twitch');
  service.disconnect();
});
test('disconnect forgets credentials, verification URL and community reports', () => {
  const service = new TwitchService(() => {}); service.token='example'; service.refreshToken='example'; service.verification='https://www.twitch.tv/activate';
  service.notification(message('1','!blocked'));
  service.disconnect();
  assert.equal(service.token,null); assert.equal(service.refreshToken,null); assert.equal(service.verification,null); assert.equal(service.state.reports.length,0);
});
