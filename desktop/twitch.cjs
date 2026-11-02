const WebSocket = require('ws');
const { z } = require('zod');
const SCOPE = 'user:read:chat';
function isBlocked(text) { return /^!blocked(?:\s|$)/i.test(text.trim()); }
async function request(url, init = {}) {
  const response = await fetch(url, { ...init, signal: AbortSignal.timeout(12000) });
  const body = await response.json();
  return { ok: response.ok, status: response.status, body };
}
class TwitchService {
  constructor(publish, { http = request, Socket = WebSocket, timers = globalThis } = {}) {
    this.publish = publish; this.http = http; this.Socket = Socket; this.timers = timers;
    this.state = { status: 'disconnected', reports: [] }; this.seen = new Set(); this.epoch = 0; this.sockets = new Set();
  }
  emit() { this.publish({ kind: 'twitch', ...this.state }); }
  async begin(input) {
    const clientId = z.string().regex(/^[a-zA-Z0-9]{10,100}$/).parse(input);
    this.disconnect(); const epoch = this.epoch;
    const r = await this.http('https://id.twitch.tv/oauth2/device', { method: 'POST', body: new URLSearchParams({ client_id: clientId, scopes: SCOPE }) });
    if (epoch !== this.epoch) throw new Error('Twitch connection cancelled.');
    if (!r.ok) throw new Error('Twitch could not start authorization. Check your Public application Client ID.');
    this.clientId = clientId;
    this.device = { code: r.body.device_code, expires: Date.now() + r.body.expires_in * 1000, interval: Math.max(5, r.body.interval || 5) * 1000 };
    const verification = new URL(r.body.verification_uri);
    if (verification.protocol !== 'https:' || verification.hostname !== 'www.twitch.tv' || verification.pathname !== '/activate') throw new Error('Unexpected Twitch authorization address.');
    this.verification = verification.href;
    this.state = { status: 'authorizing', code: r.body.user_code, reports: [] }; this.emit(); this.schedulePoll(epoch);
    return { code: r.body.user_code };
  }
  schedulePoll(epoch) { this.pollTimer = this.timers.setTimeout(() => this.poll(epoch).catch(() => this.fail('Twitch authorization failed. Try connecting again.', epoch)), this.device.interval); }
  async poll(epoch) {
    if (epoch !== this.epoch) return;
    if (Date.now() >= this.device.expires) return this.fail('Authorization expired. Connect Twitch again.', epoch);
    const r = await this.http('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: this.clientId, scopes: SCOPE, device_code: this.device.code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' }) });
    if (epoch !== this.epoch) return;
    if (!r.ok) {
      if (r.body.message === 'authorization_pending') return this.schedulePoll(epoch);
      if (r.body.message === 'slow_down') { this.device.interval += 5000; return this.schedulePoll(epoch); }
      return this.fail('Authorization declined or expired. Connect Twitch again.', epoch);
    }
    this.token = r.body.access_token; this.refreshToken = r.body.refresh_token;
    await this.validate(epoch);
    if (epoch !== this.epoch) return;
    this.scheduleRefresh(r.body.expires_in, epoch); this.openSocket(undefined, false, epoch);
  }
  async validate(epoch) {
    const r = await this.http('https://id.twitch.tv/oauth2/validate', { headers: { Authorization: `OAuth ${this.token}` } });
    if (epoch !== this.epoch) return;
    if (!r.ok || r.body.client_id !== this.clientId || !r.body.scopes.includes(SCOPE)) throw new Error('Invalid Twitch authorization.');
    this.userId = r.body.user_id; this.state.login = r.body.login;
  }
  scheduleRefresh(seconds, epoch) {
    this.timers.clearTimeout(this.refreshTimer);
    this.refreshTimer = this.timers.setTimeout(() => this.refresh(epoch).catch(() => this.fail('Twitch session expired. Please reconnect.', epoch)), Math.max(10000, (seconds - 120) * 1000));
    this.timers.clearInterval(this.validationTimer);
    this.validationTimer = this.timers.setInterval(() => this.validate(epoch).catch(() => this.fail('Twitch authorization was revoked. Reconnect to continue.', epoch)), 3600000);
  }
  async refresh(epoch) {
    const r = await this.http('https://id.twitch.tv/oauth2/token', { method: 'POST', body: new URLSearchParams({ client_id: this.clientId, grant_type: 'refresh_token', refresh_token: this.refreshToken }) });
    if (epoch !== this.epoch) return;
    if (!r.ok) throw new Error('Token refresh failed.');
    this.token = r.body.access_token; this.refreshToken = r.body.refresh_token; this.scheduleRefresh(r.body.expires_in, epoch);
  }
  openSocket(url = 'wss://eventsub.wss.twitch.tv/ws', transferred = false, epoch = this.epoch) {
    if (epoch !== this.epoch) return;
    const parsed = new URL(url);
    if (parsed.protocol !== 'wss:' || parsed.hostname !== 'eventsub.wss.twitch.tv') return this.fail('Unexpected Twitch reconnect address.', epoch);
    const old = this.socket; const socket = new this.Socket(url); this.sockets.add(socket);
    this.state.status = transferred ? 'reconnecting' : 'connecting'; this.emit();
    let timeout;
    const arm = ms => { this.timers.clearTimeout(timeout); timeout = this.timers.setTimeout(() => { socket.terminate(); }, ms); };
    arm(20000);
    socket.on('message', raw => {
      if (epoch !== this.epoch) return;
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.metadata.message_type === 'session_welcome') {
          this.socket = socket;
          if (transferred) { old?.close(); this.state.status = 'connected'; this.emit(); }
          else this.subscribe(msg.payload.session.id, epoch).catch(() => this.fail('Could not subscribe to Twitch chat. Check authorization and reconnect.', epoch));
          socket.keepalive = (msg.payload.session.keepalive_timeout_seconds || 10) * 1000 + 5000;
        }
        arm(socket.keepalive || 20000);
        if (msg.metadata.message_type === 'session_reconnect') this.openSocket(msg.payload.session.reconnect_url, true, epoch);
        if (msg.metadata.message_type === 'revocation') this.fail('Twitch revoked the chat subscription. Reconnect to continue.', epoch);
        if (msg.metadata.message_type === 'notification' && msg.payload.subscription.type === 'channel.chat.message') this.notification(msg);
      } catch { this.fail('Unexpected Twitch response. Please reconnect.', epoch); }
    });
    socket.on('error', () => {});
    socket.on('close', () => {
      this.timers.clearTimeout(timeout); this.sockets.delete(socket);
      if (epoch === this.epoch && (this.socket === socket || !this.socket || (transferred && this.socket === old))) this.fail('Twitch chat disconnected. Reconnect to resume reports.', epoch);
    });
  }
  async subscribe(id, epoch) {
    const r = await this.http('https://api.twitch.tv/helix/eventsub/subscriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${this.token}`, 'Client-Id': this.clientId, 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'channel.chat.message', version: '1', condition: { broadcaster_user_id: this.userId, user_id: this.userId }, transport: { method: 'websocket', session_id: id } })
    });
    if (epoch !== this.epoch) return;
    if (!r.ok) throw new Error('Subscription failed.');
    this.state.status = 'connected'; delete this.state.code; this.emit();
  }
  notification(msg) {
    const event = msg.payload.event, id = event.message_id;
    if (this.seen.has(id) || !isBlocked(event.message.text)) return;
    this.seen.add(id); if (this.seen.size > 500) this.seen.delete(this.seen.values().next().value);
    if (Date.now() - (this.lastReport || 0) < 3000) return;
    this.lastReport = Date.now();
    this.state.reports = [{ id, author: event.chatter_user_name, text: event.message.text.slice(0, 200), at: new Date().toISOString() }, ...this.state.reports].slice(0, 20); this.emit();
  }
  fail(message, epoch) { if (epoch !== this.epoch) return; this.disconnect(); this.state.status = 'error'; this.state.error = message; this.emit(); }
  disconnect() {
    this.epoch++; this.timers.clearTimeout(this.pollTimer); this.timers.clearTimeout(this.refreshTimer); this.timers.clearInterval(this.validationTimer);
    for (const socket of this.sockets) socket.terminate(); this.sockets.clear(); this.socket = null;
    this.token = null; this.refreshToken = null; this.device = null; this.verification = null; this.userId = null; this.clientId = null; this.seen.clear(); this.lastReport = 0;
    this.state = { status: 'disconnected', reports: [] }; this.emit();
  }
}
module.exports = { TwitchService, isBlocked };
