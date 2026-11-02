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

## OBS connection

In OBS, enable Tools → WebSocket Server Settings → Enable WebSocket server, retaining authentication. Connect in SceneSense using the local port (normally 4455) and password. Save a named preset if desired; saved passwords use Electron safeStorage for the local Windows account.

Create a scene with a visible game capture and webcam source, load sources in Connections, and confirm the two sources. Initial layout support expects an unrotated, uncropped, unflipped webcam with top-left alignment and no bounding box. Confirmation saves the layout restore point. Source visibility lists all top-level scene items; children inside nested groups are not expanded.

## API configuration and voice

`OPENAI_API_KEY` is required for image analysis and command interpretation. Our command interpreter calls OpenAI's Decisions endpoint using the model configured in desktop/voice-decisions.cjs; your key must have access to that endpoint/model. Voice can use OpenAI transcription or optional Sarvam streaming transcription. Set `SARVAM_API_KEY` and `VOICE_PROVIDER=sarvam` if using Sarvam; `auto` chooses Sarvam when its key is present. Use your own credentials; none are supplied with this project. Costs and provider access are the user's responsibility.

Hold Ctrl+Shift+Z to speak. Double-tap Z while holding Ctrl+Shift to latch hands-free listening; repeat or click Done to finish. The Voice page includes the supported-command guide. Example commands: “Move my webcam to the top right”, “Start watching”, “Stop watching”, “Unmute my microphone”, “Show my webcam”, and “Fix all reported issues”.

## Twitch connection

Register a Twitch developer application with a verified email and 2FA. Choose Public client type and Broadcaster Suite. Device-code authorization does not use a redirect callback; if the console requires a URL, an HTTPS localhost placeholder can be registered. Enter the application Client ID in SceneSense → Connections → Twitch, open authorization, and approve the user:read:chat permission.

The app subscribes to the authorized account's own-channel chat using EventSub WebSockets. Send `!blocked inventory` in that channel and check Studio → Community signals. Real authorization and message delivery were verified by the creator. Reports are read-only inputs and never directly execute OBS actions. Tokens remain session-only; reconnect after restarting the app. OBS broadcast-account setup is separate from this chat integration.

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
