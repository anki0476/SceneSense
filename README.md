# SceneSense

**Stay in the game.** A Windows desktop companion for OBS and Twitch, built solo with OpenAI Codex.

Sense combines voice controls, webcam placement assistance, stream supervision, and Twitch community reports. This is a hackathon prototype, not a signed installer or a universal OBS repair agent.

## Run from source

Requirements: Windows x64, Node.js 22.12+ and npm, OBS Studio with WebSocket v5 (OBS 33.0.1 was used for live acceptance), and a microphone for voice commands. NVIDIA DirectML was used for native cutout testing; other hardware has not been verified.

1. Clone/download this repository.
2. Run `npm ci` in the project directory.
3. Copy `.env.example` to `.env`, enter your own API keys, and keep this file private.
4. Run `npm start` (builds the UI and launches Electron).

Alternatively, after dependencies are installed, double-click **Launch SceneSense.cmd**. `npm run dev` is only a visual browser preview and does not provide the desktop bridge for OBS, voice, or Twitch.

## Setup checklist

1. Install Node.js 22 LTS and OBS Studio on Windows x64.
2. Run `npm ci`, copy `.env.example` to `.env`, and fill your API keys.
3. Run `npm start` or open **Launch SceneSense.cmd**.
4. OBS: add a Video Capture Device and Game Capture targeting your game. Keep webcam above game in Sources.
5. OBS → Tools → WebSocket Server Settings: enable server and authentication. Copy password from Show Connect Info. Default port: 4455.
6. SceneSense → Connections: enter port/password → Connect OBS.
7. Enter a preset name → optionally enable Reconnect at startup → Save OBS preset. Use Connect saved preset later; Update/Delete manage it.
8. Choose active scene → Load sources → select webcam/game → Confirm sources. This saves the restore layout.
9. Voice: allow microphone access; prepare/test microphone if not ready. Hold Ctrl+Shift+Z and say “Move my webcam to the top right.”
10. Double-tap Z with Ctrl+Shift held for hands-free listening. Repeat or click Done to stop. Commands execute as speech is interpreted.
11. Sense: Check current frame for suggestions, or Start watching. Enable Auto-move for two-check automation. Allow webcam shrinking is separate. Preview/apply suggestions; Undo Sense Move restores the previous layout.
12. Supervisor: choose your OBS microphone and optionally enable Local video checks. Request repairs by voice.
13. Twitch: connect with your Public application Client ID and authorize. Send `!blocked inventory` in your channel chat; check Community signals.

**Presets:** connection presets save OBS credentials. Studio → Stream setups saves named layout/audio configurations after sources are confirmed.

**Demo recording:** use entire-screen/Display Capture to include the separate Sense notch. Window/Game Capture excludes other windows. Restart SceneSense after updates.

## OBS connection

In OBS, enable Tools → WebSocket Server Settings → Enable WebSocket server, retaining authentication. Connect in SceneSense using the local port (normally 4455) and password. Save a named preset if desired; saved passwords use Electron safeStorage for the local Windows account.

Create a scene with a visible game capture and webcam source, load sources in Connections, and confirm the two sources. Initial layout support expects an unrotated, uncropped, unflipped webcam with top-left alignment and no bounding box. Confirmation saves the layout restore point. Source visibility lists all top-level scene items; children inside nested groups are not expanded.

## API configuration and voice

`OPENAI_API_KEY` is required for image analysis and command interpretation. Our command interpreter calls OpenAI's Decisions endpoint using the model configured in desktop/voice-decisions.cjs; your key must have access to that endpoint/model. Voice can use OpenAI transcription or optional Sarvam streaming transcription. Set `SARVAM_API_KEY` and `VOICE_PROVIDER=sarvam` if using Sarvam; `auto` chooses Sarvam when its key is present. Use your own credentials; none are supplied with this project. Costs and provider access are the user's responsibility.

Hold Ctrl+Shift+Z to speak. Double-tap Z while holding Ctrl+Shift to latch hands-free listening; repeat or click Done to finish. The Voice page includes the supported-command guide. Example commands: “Move my webcam to the top right”, “Start watching”, “Stop watching”, “Unmute my microphone”, “Show my webcam”, and “Fix all reported issues”.

## Twitch connection

Register a Twitch developer application with a verified email and 2FA. Choose Public client type and Broadcaster Suite. Device-code authorization does not use a redirect callback; if the console requires a URL, an HTTPS localhost placeholder can be registered. Enter the application Client ID in SceneSense → Connections → Twitch, open authorization, and approve the user:read:chat permission.

The app subscribes to the authorized account's own-channel chat using EventSub WebSockets. Send `!blocked inventory` in that channel and check Studio → Community signals. Real authorization and message delivery were verified by the creator. Reports are read-only inputs and never directly execute OBS actions. Tokens remain session-only; reconnect after restarting the app. OBS broadcast-account setup is separate from this chat integration.

### Twitch setup steps

1. Sign in at https://dev.twitch.tv/console/apps. Enable Twitch account 2FA under Settings → Security and Privacy if required.
2. Register an application: unique name, category **Broadcaster Suite**, client type **Public**.
3. If the console requires a redirect URL, enter `https://localhost:3000`. Leave no empty extra URL rows. This is only a registration placeholder: SceneSense uses device authorization, not a server at that URL.
4. Open Manage for the registered app and copy its **Client ID**. No client secret is needed.
5. Open the **SceneSense desktop app** → Connections → Twitch. Paste Client ID → Connect Twitch.
6. Open the authorization link shown by SceneSense; enter/confirm the displayed device code if asked, sign into the intended creator account, and authorize chat access.
7. Return to SceneSense and wait for Connected. Open your own Twitch channel chat and send `!blocked inventory`. Confirm it appears under Studio → Community signals.
8. Reauthorize after restarting SceneSense; tokens are session-only. If authorization expires, start Connect Twitch again. If no report arrives, verify the authorized channel, connection status, and exact `!blocked` prefix.

**Broadcasting separately:** OBS → Settings → Stream → Twitch → Connect Account. Choose your game scene, check audio, then click Start Streaming only when ready to go public. Chat integration does not start a stream. Verify playback on your Twitch channel; stop streaming after testing.

## Scene awareness

Sense analyzes game-source snapshots, scores webcam obstruction, prioritizes clear corners, and searches additional positions if necessary. Preview/apply a suggestion, or enable automatic movement. Eligible auto moves need two agreeing checks; interior placements require approval. Shrinking is opt-in. Manual and voice control take priority, and scene changes cancel pending work. Stop watching preserves the undo action for Sense's last move while its source context remains valid.

Game snapshots are sent to OpenAI when scene awareness runs. The program preview and optional supervisor video checks are separate paths; those local health samples are not uploaded.

## Stream supervisor

Detects selected OBS microphone mute state, hidden confirmed sources, and OBS disconnection. Optional local 64×36 samples approximately every four seconds warn about repeated black game capture or unchanged visible webcam frames. These are possible faults, not proof of audience playback failure; static/dark content can trigger warnings.

Explicit repair requests can unmute the monitored microphone, show hidden confirmed sources, and open/reconnect OBS using a saved preset when computer setup is enabled. Combined supported repairs report verified results and unresolved issues. Black/frozen source review opens the exact OBS properties; it does not claim recovery. Reconnection does not start a broadcast or recording.

## Optional native webcam cutout

**Not required to run the app's other features.** The high-quality native cutout demonstrated locally needs a separately built/installed Windows OBS filter, ONNX Runtime DirectML binaries, and the RVM model. These binaries, SDKs, and weights are not committed. Installing npm dependencies alone does not install them.

See native/NOTICE.txt for upstream versions, sources and licenses. The existing native/build.ps1 expects the pinned local SDK layout under .tmp-review/native-obs-sdk and runtime/model layout under .tmp-review/native-matting. This bootstrap is not yet automated for a clean machine. The native feature must therefore be treated as developer-preview until distribution setup is completed. A separately installed OBS Background Removal plugin is supported as a lower-quality fallback.

Native pipeline: latest-frame buffering, ONNX Runtime DirectML inference using RVM MobileNetV3 FP32, and OBS GPU rendering. Tested at 640×360 and ratio .5. Quality is imperfect on difficult edges; a stalled worker can hold the last cutout frame. Changing a filter affects every scene reusing that OBS source.

## Validation

`npm run check` runs the Node tests and TypeScript/Vite build. `npm run test:desktop` uses an OBS protocol fixture, not a live Twitch account. Fixture tests do not establish visual quality or real-world latency.

Creator-reported live acceptance covered Asphalt menu/race placement, undo after Stop watching, manual/voice overrides, scene-change cancellation, microphone/visibility repairs, combined repairs, OBS cold-start reconnection, static-image freeze detection/recovery, and real Twitch chat delivery. A combined gameplay/voice/background-removal/supervision session had no noticeable lag on the creator's laptop. This is not a cross-hardware benchmark. Live Twitch broadcast playback verification is still pending confirmation.

## Third-party software and assets

This project integrates third-party libraries and UI components under their own licenses. Existing ReactDrops, React Bits and font notices are retained with the files and public assets. Native code is GPL-3.0-or-later as marked in its source; RVM and runtime dependencies retain their upstream terms. No blanket license is granted over third-party components. Before distributing native binaries/models, include their required notices and source obligations.

## Limitations and further work

Windows desktop only; browser mode is a visual preview. Not all OBS layouts/hardware are supported. Detection and transcription can fail. SceneSense does not promise arbitrary computer control or automatic repair of every fault. Experimental setup actions are bounded Windows helpers. Paid API access may be necessary. A signed installer and clean-machine native cutout bootstrap remain future distribution work.

Historical engineering notes and earlier measurements are archived in design/development-history.md; older entries describe superseded configurations. Current source code and this README take precedence.
