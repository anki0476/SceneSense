# SceneSense

### Webcam background removal

Studio → Webcam → Webcam background offers Original and Remove background. It controls a named filter on the confirmed OBS webcam; source position/size and layout restore points are unchanged. Changes affect OBS output immediately and all scenes that reuse the source. Compare the two modes in Program preview. Voice commands: “Remove my webcam background” and “Restore my webcam background”; the latter does not restore the layout.

Install [OBS Background Removal](https://github.com/royshil/obs-backgroundremoval) separately, restart OBS, reconnect and confirm sources, then use Check plugin. Windows release 1.4.1 was tested with OBS 33.0.1. SceneSense does not bundle the plugin or its models. The adapter uses the plugin's default MediaPipe/CPU model, two inference threads, and no background blur. Other enabled background-removal filters are left untouched; disable those manually before using Sense. Existing edge/model tuning on the SceneSense filter is preserved. Background removal runs locally without an AI API request; spoken intent still uses the existing voice providers.

Local checks on 2026-11-01 verified plugin loading, enabled/disabled readback, background removal in webcam frames, and unchanged transforms. Hair/motion quality and frame timing during simultaneous Asphalt gameplay still require live acceptance. Keep OBS rendering (visible preview or its local virtual-camera preview) when testing while offline; a hidden OBS with no active output can stop supplying frames to the filter.

A Windows desktop companion for OBS and Twitch. Local OBS controls, preview, streaming voice and the desktop voice notch are implemented; the creator reports responsive voice acceptance. Scene awareness is now available as an experimental image-based preview with optional automatic movement. **Image perception still needs acceptance on real Asphalt gameplay. Stream health supervision is the next phase.**

## Run

Requires Node.js 22.12+ (Node 22 LTS recommended), npm, Windows, and OBS Studio 28+ with WebSocket v5. No Python or background-removal plugin required.

```powershell
npm ci
npm start
```

On this configured workspace, you can also double-click **Launch SceneSense.cmd**. It builds the latest UI and opens the desktop app. It never installs dependencies automatically.

`npm run check` runs tests and builds the UI. `npm run test:desktop` builds and exercises the real desktop interface against a local authenticated OBS protocol simulator: wrong password, correct password, source selection, snapshot decoding, movement, resizing, restoration, stale-control disabling and disconnect. It saves `.artifacts/phase1-desktop-integration.png`. No real OBS or Twitch account is used by that test.

`npx electron . --smoke-test` loads the built app in a hidden window, checks the restricted bridge, saves `.artifacts/phase1-desktop.png`, and exits. `npm run dev` is a visual browser preview only; it cannot control OBS. In restricted execution environments, tests that use a local server need loopback network permission.

## 1. OBS setup

1. Download OBS from https://obsproject.com/ and install it.
2. Create a scene containing your game capture and a Video Capture Device for your webcam. Ensure both are visible.
3. For the Phase 1 webcam, use an unrotated, unflipped, uncropped top-level source. In Transform → Edit Transform, use top-left positional alignment and no bounding-box scaling. Nested scenes/groups are outside Phase 1.
4. Tools → WebSocket Server Settings → enable WebSocket server, keep port 4455 and authentication enabled. Copy the generated password into SceneSense, not into chat or source files. Only loopback connections are supported.
5. Connect in SceneSense, load the active scene's sources, select the game and webcam, and confirm. This captures the original transform for **this session**.
6. Test the four corner buttons and size controls. **Saved restore point** shows the position and dimensions captured at confirmation. Restore returns to that layout, not the previous action. **Restore verified against OBS** appears only after OBS read-back matches the saved transform and dimensions. Refreshing, changing scenes, removing sources or disconnecting invalidates that restore point. Disconnecting or quitting does not automatically move the webcam back: use Restore first if desired.

The preview now screenshots the active OBS program **scene**, including the real webcam placement and overlays. It updates automatically at up to four frames per second (actual speed depends on OBS screenshot latency), with an immediate refresh requested after layout changes. This is a responsive monitoring preview, not full-frame-rate video or a viewer-side Twitch playback check. It pauses while the app is hidden/minimized, retries failures with backoff, labels interrupted previews, and discards frames from outdated scene contexts. OBS Studio Mode transitions are not reproduced by a scene screenshot. It never opens the camera separately or adds a synthetic webcam inset.

### Smooth video preview

Click **Enable smooth video** beside the preview. SceneSense starts OBS Virtual Camera (unless already running), then opens **only the device labelled OBS Virtual Camera** as a local video stream. It requests up to 30 FPS at an ideal 720p resolution; actual format and latency depend on the driver, OBS output and hardware. No microphone audio is captured by this mode, and video is not recorded or uploaded. It never falls back to the physical/default webcam if the virtual device is missing.

In OBS, the gear beside Start/Stop Virtual Camera should use **Program** output (the default) to match the broadcast. A previously selected Source/Scene/Preview output may show something different. See https://obsproject.com/kb/virtual-camera-guide.

Screenshot polling stops while smooth video is active. **Use lightweight preview** releases SceneSense's virtual-camera capture and resumes polling. Disconnecting/closing also releases the capture. OBS Virtual Camera itself is intentionally left running so other apps using it are not interrupted; stop it in OBS when no longer needed. If opening the virtual device fails, the lightweight preview remains available with an actionable error. Windows camera privacy settings may need to allow desktop apps.

The desktop integration test uses a synthetic canvas video stream to verify switching and resource release. Real virtual-camera driver performance must still be verified on the creator's machine.

Restore omits inactive bounding-box dimensions: OBS may report these as zero when bounds are disabled, but rejects zero bounds in a SetSceneItemTransform request. The authenticated protocol fixture now models that validation so this regression cannot pass silently.

## 2. Twitch setup

1. Create/sign in to Twitch and enable two-factor authentication.
2. Visit https://dev.twitch.tv/console/apps and register a new application.
3. Name: a unique SceneSense development name; redirect URI: `http://localhost:3000`; category: Application Integration; Client Type: **Public**. This app uses device-code authorization and does not accept a client secret.
4. Copy the Client ID into SceneSense. Click Connect Twitch, then Open Twitch authorization. Approve the `user:read:chat` permission using your creator account.
5. The app subscribes to that account's own channel via EventSub WebSocket. Open the channel chat and type `!blocked inventory`. It should appear as a community signal. Broadcasting is not needed for the chat test.

Tokens stay in the desktop main process, in memory only. They refresh during the session and are validated hourly. Closing/disconnecting forgets them; restarting requires authorization again. Disconnect does not revoke Twitch's account-level grant; remove it in Twitch Connections if desired. Connection loss is shown explicitly; use Connect Twitch to restart. At most 20 reports are retained in memory, with a three-second global cooldown and message-ID deduplication. Chat text is rendered as text, never instructions or HTML. Reports cannot execute OBS actions.

## 3. Microphone check

Click Test microphone and speak for two seconds. The test reads the default input locally, does not record/upload audio, and releases the microphone afterward. Windows privacy settings may need to allow desktop microphone access. Decisions/transcription services are deferred to Phase 2; no API key is needed here.

## Phase 2: voice setup and testing

1. Check your available API credit balance at https://platform.openai.com/settings/organization/billing/overview. An existing usable balance is sufficient; a subscription-credit claim option is not required and may not appear in your account. ChatGPT access alone does not establish this application's API quota.
2. Create a SceneSense project and its API key in https://platform.openai.com/api-keys. The key must have access to the selected voice model and Decisions API, with sufficient credits/quota. Never paste it into chat or source files.
3. Restart SceneSense, connect OBS, load and confirm the webcam/game sources in **Connections**, then open **Voice**. Keys in the local `.env` load automatically; otherwise paste the project key into the local password field and click **Use key for this session**. Manually entered keys stay in the main process for this run and are not saved to disk or returned in renderer state. Entry alone does not validate API access.
4. Click **Prepare microphone** once, check the input name and moving level meter, and choose another input if necessary. The microphone stays ready locally until **Disable mic**, forgetting the key, or closing SceneSense. Its audio is discarded outside a hold. Hold **Ctrl+Shift+Z** (or the **Hold to speak** button), speak immediately, then release to finish. Releasing any key in the chord ends the hold. Keyboard repeat is ignored. The native hook observes the configured chord from app launch until exit and stores no typed text/history. A window-keyboard fallback supports the same hold while SceneSense is focused if the global hook is unavailable. Setup blockers now explain missing keys, sources or mic preparation instead of silently doing nothing.
5. Try: “Move my webcam to the top right… and make it smaller… actually, bottom left.” Completed layout intents are evaluated from partial transcripts and can execute before the final transcript. “Smaller” means one 10% reduction per interaction; “larger” means one 10% increase. Corrections use the interaction's original size rather than compound changes. Repeated transcript updates are deduplicated. Starting a new interaction permits another size step.
6. Say **undo that** to restore the beginning of the current changed interaction, or the preceding completed voice interaction if no current change has been applied. Say **restore** to return to the layout saved by Confirm sources. Undo/restore end action processing for that utterance; finish and start again for subsequent commands. Voice undo becomes invalid when the scene/source context changes.

Local capture starts with the hold, independently of the cloud handshake. Up to five seconds of held speech can be buffered in memory while connecting; exceeding this bound fails explicitly rather than replaying a long backlog. Release flushes the last partial PCM chunk before committing. This addresses both missing first words and clipped last words. Microphone readiness and cloud readiness are distinct: network setup can still delay the first text/action. The UI displays connection, first-transcript and interpretation timings; these are not ASR accuracy scores.

Only held microphone audio is uploaded, as 24 kHz PCM for OpenAI or 16 kHz PCM for Sarvam. Buffered held speech can finish uploading after release. Transcript text is sent to OpenAI Decisions for bounded layout choices. No screenshots, Twitch chat or game audio are intentionally captured or sent by this feature; sound picked up by the selected microphone is part of its audio. No local audio/transcript files are created. Transcripts remain visible in session memory. The local two-second microphone check remains offline.

### Optional Sarvam transcription

Before saving the keys, choose **Sarvam · realtime transcription**, then English (India) or automatic language detection. Enter your Sarvam key in the local password field and the OpenAI key in its separate field (Decisions still interprets the commands). To change providers, forget the current session keys and configure again. Neither key is persisted. We use `/speech-to-text-realtime/ws`, `saaras:v4`, balanced partials, mono linear16 at 16 kHz, and manual `speech_start`/`speech_end` boundaries. Partial transcripts replace the previous hypothesis rather than being appended. This is different from Sarvam's legacy streaming endpoint, which does not provide true interim results. See https://docs.sarvam.ai/api/api-guides-tutorials/speech-to-text/realtime-streaming and https://docs.sarvam.ai/api-reference/speech-to-text/transcribe/realtime/ws.

OpenAI's transcription setting now uses `delay: low` with webcam terminology hints instead of `minimal`. These are accuracy-oriented adjustments, not evidence that either provider will be accurate on a particular microphone. Compare providers with the same real speech before choosing a default.

The API implementation follows https://developers.openai.com/api/docs/guides/realtime-transcription (`gpt-live-transcribe`, transcription intent, incremental deltas) and https://developers.openai.com/api/docs/guides/decisions (`gpt-6-luna`, fixed choices). Provider handshake and text-only intent checks use real APIs separately; simulated tests do not establish speech accuracy or end-to-end latency. No payment or key is required to run the offline test suite.

Current voice limits: one speaker, four corners, single-step size changes, undo and restore. Other languages, configurable shortcuts, frames and custom sizes need more work. Partial speech can be misrecognized; actions are reversible, old results after cancellation are rejected, uncertain decisions are ignored, and scene changes stop the voice turn. Manual app layout buttons cancel the voice session first. Synthetic microphone tests do not measure real transcription accuracy.

## Engineering boundaries

- Electron: sandboxed renderer, context isolation, no renderer Node access, navigation/popups blocked, restrictive content policy, narrow IPC allowlist with main-frame validation.
- OBS: runtime input validation, serialized mutation operations, context checks before and after asynchronous reads, transform read-back verification, preserved restore point. Scene/source events invalidate pending selections and previews. No automatic retry of mutations after an ambiguous timeout.
- Secrets: no client secret, access tokens in renderer state or persisted chat history. Manual voice keys stay in memory; optional `.env` credentials are local plain text, and saved OBS passwords use Windows account encryption. No telemetry.
- No stream start/stop, scene creation/deletion, filesystem or arbitrary OBS RPC exposed to the UI. Phase 1 never controls your stream automatically.
- Live OBS/Twitch validation requires your configured applications. Protocol-fixture tests are not a claim of live integration verification.

## Architecture

`src/`: React interface and local microphone test. `desktop/preload.cjs`: restricted bridge. `desktop/main.cjs`: window/security and IPC. `desktop/obs.cjs`: OBS adapter and reversible controls. `desktop/twitch.cjs`: device authorization, EventSub lifecycle and report filtering. `tests/`: behavioral, simulated Twitch lifecycle and real-WebSocket protocol-fixture checks. `scripts/`: hidden desktop integration runner.

Voice, manual controls and image recommendations share the serialized OBS mutation path. Voice buffers audio immediately while an active image check yields control. Chat remains outside the control authority. Before release, add packaged signing/updates, broader OBS layout compatibility and real streaming-load verification.

## Live acceptance still required

The automated suite and simulated desktop integration pass. Phase 1 live acceptance remains pending until the following are verified on the creator's setup:

- [ ] Connect to installed OBS using its generated password.
- [ ] Select the actual game/webcam and inspect source snapshots.
- [ ] Move, resize and restore the webcam while watching OBS.
- [ ] Change the active OBS scene and confirm SceneSense disables stale controls.
- [ ] Authorize the real Twitch application and receive `!blocked` from channel chat.
- [ ] Run the microphone check and verify that capture stops afterward.

These checks do not require starting a public broadcast. Load testing with gameplay and an actual stream follows in later phases.

## Primary references

- https://www.electronjs.org/docs/latest/tutorial/security
- https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md
- https://dev.twitch.tv/docs/authentication/getting-tokens-oauth/#device-code-grant-flow
- https://dev.twitch.tv/docs/eventsub/handling-websocket-events/
- https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage

## Interface redesign

The interface follows the user-supplied TWITCH_DESIGN.md and Hallmark's app-screen workflow. Studio is the default view, with OBS preview and reversible webcam controls together. Connections holds the OBS/source/Twitch setup. Voice retains local keys, mic preparation and hold-to-speak. Activity shows connection and manual layout events.

Use the top navigation to switch views. Voice remains mounted, so switching to Studio does not release a prepared mic; Disable mic and Forget API key still release it explicitly. The desktop menu is available with Alt. Fonts are bundled locally; Inter's SIL Open Font License ships as Inter-OFL.txt. See DESIGN.md for tokens and scope, and .hallmark/compare.html for before/after screenshots.

Verification includes Hallmark's rendered default-workspace checks, all four views at 1440px and 375px, the unit/protocol suite, and simulated desktop OBS/voice/video acceptance. These checks do not establish real transcription accuracy.

### Persistent local voice credentials

SceneSense now reads the workspace .env file in the Electron main process at launch. OPENAI_API_KEY is required for Decisions. SARVAM_API_KEY is optional; VOICE_PROVIDER=auto selects Sarvam if that key is present, otherwise OpenAI. Explicit openai or sarvam overrides the automatic choice. VOICE_LANGUAGE accepts en-IN or auto for Sarvam. Edit the file locally, save, and restart the app. Keys are not returned to the renderer, printed, or embedded in the Vite build. The git-ignored .env stores credentials as local plain text; this supersedes earlier session-only storage descriptions for credentials loaded from that file. Forget API key clears the current session, not the .env file.

Run `node scripts/check-voice-provider.cjs` for a live provider handshake and one short Decisions request using local .env credentials. This uses the configured paid API accounts, prints sanitized pass/fail results only, uploads no microphone audio, and makes no OBS changes. It verifies access and one text instruction, not speech accuracy or typical latency.

### Live Decisions and shortcut diagnostics

All voice actions, including exact corner, size, undo and restore commands, now use `POST /v1/decisions`. Three fixed choice questions interpret the partial transcript in the context of OBS webcam controls; only allowed answers with confidence at least 0.8 can act. A local parser only recognizes complete revisions to cancel obsolete requests; it never selects an action for execution. Equivalent partials no longer repeatedly cancel an otherwise valid request. Decisions are coalesced and sequential, stale results are discarded, and OBS verifies applied transforms.

Run `node scripts/evaluate-voice-commands.cjs` to exercise 15 labeled text examples with real Decisions calls and local credentials. On 2026-10-31, all 15 passed, including short commands, negation, an incomplete corner, a how-to question, a correction and a compound request. Mean interpretation latency in that run was 346 ms (245–1120 ms); this excludes microphone, transcription and OBS time and is not a latency guarantee. No audio is uploaded and OBS is not changed by this script.

Voice displays keyboard receipt, audio duration received, transcription, decision status and component timings. Studio also shows voice feedback with a link to Voice. If the shortcut appears inert, check these stages in order. Desktop integration dispatches real renderer keyboard events across six holds and checks OBS changes before key release, with synthetic media and provider transports. It initializes the native hook but does not prove delivery of a physical key chord outside the app.

### Saved OBS preset

In Connections, enter the OBS port/password, optionally select Reconnect at startup, then Save OBS preset before connecting. Connect saved preset reuses the saved credential without returning it to the renderer. Delete preset removes it. The preset is stored in Electron's userData directory using safeStorage encryption tied to the Windows account, outside the project and Git. Startup auto-connect makes one attempt; open OBS first, or use Connect saved preset afterward. Source confirmation is still required after a new connection to establish a fresh restore point.

### Restart for updates

The header button runs the same TypeScript check and Vite production build used by npm start, then uses Electron relaunch to reopen the development app. No visible terminal is needed. Failed builds keep the current process open and report an error; repeated restart clicks are blocked. This applies changes already present in the local project, not remote downloads or dependency installation. Restart reloads .env and the saved OBS preset; source confirmation and microphone preparation are session-specific.

After Restart for updates, a dismissible status banner reports Already up to date or Updated successfully by comparing fingerprints of the running desktop code, compiled UI and dependency manifests with the rebuilt app. The restart receipt is consumed at the next launch. If files changed again or the receipt is unreadable, the app reports that it could not verify the expected build rather than claiming success. This compares local builds only; it does not check a remote release server.

Update banners now include a What's new bullet list from RELEASE_NOTES.json, filtered against the changelog snapshot captured when the previous app instance started. Add a new uniquely identified entry for each user-facing update. Already up-to-date restarts do not repeat old notes. Changed builds without supplied notes state that release notes were not provided rather than inventing a description.

OBS presets now support names and multiple saved connections. Select New preset, enter its name, port and password, then save. Select an existing preset to connect, rename or update it; a blank password retains its encrypted stored password. Names must be unique. Selecting startup reconnect and saving assigns that preset as the single startup connection. Deleting one preset leaves the others intact. The old single preset is read as My OBS studio and migrated to the collection format on the next save.

### Desktop voice notch

The Libraries.dev `thinking-orbs` indicator uses its separately tuned 20px size. A transparent, click-through, non-focusing Electron window appears at the top center of the display containing the pointer when a voice interaction begins. It follows actual connecting, listening and finishing states, briefly confirms completed actions, and dismisses errors after five seconds. It hides while idle and closes with SceneSense. Reduced-motion preferences pause the animation. The notch has no OBS, microphone, credential or general IPC access; it receives only status labels, never transcripts or keys. Windows capture protection is enabled to keep the control indicator out of screen captures where supported.

Always-on-top behavior is intended for normal windows and borderless games. Exclusive fullscreen games and Windows secure desktop may obscure standard desktop overlays; use borderless fullscreen for the game demo. The overlay is hidden during automated desktop tests, which still verify its renderer, state delivery, canvas, topmost flag and focus behavior.

### Phase 3: scene awareness preview

In Studio, below the live preview, click **Check current frame**. This uploads the selected Game Capture snapshot and local crops of the current webcam area and four candidate corners to OpenAI Decisions. The webcam image is never composited into this evidence. Display/window captures are currently excluded. The game source must be unrotated, uncropped, top-left aligned, and use no bounding-box scaling; offsets and ordinary positive scaling are mapped into source coordinates.

Five predicate questions assess obstruction in the actual region pixels; a choice question classifies the current obstruction. Only current obstruction probability at least 0.9, an obstruction-category confidence at least 0.8, and a candidate obstruction probability no higher than 0.1 can produce a recommendation. Among eligible corners, the closest to the current location is selected to reduce camera travel. These thresholds are provisional, not calibrated accuracy scores. A full-image/numeric-coordinate approach failed the synthetic check; localized crops resolved that example.

Default mode only suggests. Apply suggested placement verifies the captured layout is unchanged before writing and reads OBS back afterward. Recommendations expire within 12 seconds of capture; changed camera/game transforms, scene/selection changes, cancellation or voice priority reject the write. Restore saved layout retains its original restore point.

**Start watching** repeats a check eight seconds after the previous completes, with one request in flight. Automatic movement is opt-in and requires two consecutive matching recommendations for unchanged layout geometry, then a 20-second cooldown. Manual or voice use cancels pending analysis, resets agreement and pauses watching for 30 seconds. Source/context changes stop watching. Quota, network, model or capture errors stop the loop visibly. No watcher starts automatically after restart. Each check uses the configured paid API account; Stop watching ends further checks. Frames/crops remain in session memory, without local recordings.

`npx electron scripts/check-layout-provider.cjs` runs two real image requests against a generated synthetic racing HUD: one camera area covering speed information, and one clear corner. It captures no user content and makes no OBS changes. Both passed on 2026-10-31. This validates transport and those two examples, not real-game perception. Unit tests cover abstention, repeated agreement, expiration, manual override, crop geometry and stale OBS layouts; the desktop simulator checks recommendation, explicit apply, voice regression and exact restore.

Next acceptance: inspect several real Asphalt racing/menu frames with suggestion mode; verify the evidence boxes and proposed corners before enabling automatic movement. After that gate, add local stream-health checks, webcam frames/animations, mascot feedback and submission polish.

### Sense in the live Studio preview

A confident scene-awareness recommendation now brings the 32px Mech avatar into the actual OBS preview. Sense points to the current webcam footprint, identifies the possible obstruction category, and offers Preview move. The ghost rectangle does not mutate OBS. Apply move uses the verified, expiring recommendation. Keep here cancels the recommendation and pauses watching. Undo move restores the prior transform only while the scene, selected sources and resulting layout are unchanged. An Undo Sense move button remains available in the panel after the brief success bubble closes. Source, voice or manual changes invalidate the pending guide and undo record. No additional snapshots, models or API requests are used by the explanation itself.

Guide geometry is normalized to the OBS broadcast canvas, separately from the game-source crops. The pointer identifies the webcam-covered area; it does not claim a separately localized HUD element. Typewriter text has a full accessible status announcement and honors reduced motion. These creator-only annotations are DOM overlays in SceneSense, not broadcast overlays or a new system-wide Sense companion. The existing desktop notch continues to show voice status.

Copy throughout Studio, Voice, Connections and Activity is shortened. Voice timing diagnostics and watching mechanics are collapsed by default; connection errors and API upload notices remain visible.

### Sense voice app controls

All held dictation is addressed to Sense; its name is optional. “Start watching” and “Sense, start watching” have the same meaning. Hold Ctrl+Shift+Z, speak one app request, and release. Camera changes still execute from partial speech. App commands are selected by Decisions but executed only after final transcription and microphone release, so corrections can cancel a pending command and image checks do not compete with their own recording.

The closed action catalog in desktop/app-actions.cjs supports game checks; suggestion/automatic watching; stop/keep/preview/apply/undo; Studio/Voice/Connections/Activity navigation; smooth/lightweight/refresh preview; OBS connection and scene/source setup; existing preset selection/connect/save/delete/new form; Twitch connect/disconnect/authorization; microphone select/recheck/test/disable; restart/update dismissal; and voice help. Existing presets, sources and microphone inputs can be selected by their displayed names. Fields such as passwords, keys, new preset names and Client IDs must already be entered locally; voice actions reuse the selected/current form values without sending those field values to the intent model. First microphone preparation, OS permission prompts and external login/consent still require user interaction. Disabling the microphone requires a manual Prepare microphone to resume dictation. This is push-to-talk, not continuous ambient wake-word detection.

Only registered actions can execute. UI commands use a restricted acknowledgement channel with timeouts; no arbitrary clicking, shell commands or general IPC is exposed to the model. Fresh Sense recommendations survive voice handoff and are revalidated before explicit apply. Spoken “undo that” targets an available Sense placement when there is no camera change in the current hold; otherwise normal voice undo applies. Starting watch explicitly resumes checks after the voice pause, and generic start watching uses suggestions; enabling automatic placement requires explicit automatic wording. The Voice command list is available in Voice, or say “Show voice commands”.

Live text evaluation passed 17 app intent cases (optional name, named selectors, negation and questions) and 15 camera cases on 2026-10-31. Desktop simulation covers spoken navigation, check, preview, apply and undo plus the six existing camera holds. Real microphone accuracy remains user-tested separately.
Voice capture temporarily yields image checks while speech is active. Actual webcam changes keep the 30-second override pause; navigation alone does not introduce a new 30-second pause.
The desktop voice notch uses a 56px-tall pill with the animated 32px Sense Mech during listening. Connecting, finishing and result states retain their existing orbs. Its transparent host window is 340×88 and stays centered on the selected display.

### Appearance and disconnected preview

The header theme button switches between Dark and Light and saves the preference locally. Dark is the default when no preference exists. A small local bootstrap applies the preference before React renders. Voice commands include “dark theme”, “light theme” and “toggle theme”. Tokens cover the app, native form controls, status surfaces, Sense bubbles and adaptive voice effects; the desktop notch remains dark.

When OBS is disconnected, Program preview displays a static placeholder and a Connect your studio button. The image-loading animation and its WebGL setup were removed after a reported freeze. The dark theme remains available.

### Startup logo

SceneSense opens a separate, sandboxed startup window using the installed ReactDrops `LiquidGlassLogo` component and Clear Corner SVG. The configuration uses `ending="logo"`, light glass, drop strength 1.35, decay 1.6 and speed 0.85, with a white background in saved light mode or black in dark mode, and original logo colors. No wordmark or second text reveal is used. Rendering DPR is capped at 1.25; the component's measured fitting and shader implementation remain intact.

The main UI loads concurrently and appears after the logo settles. Sense's greeting waits until then. Reduced motion or unavailable hardware graphics shows a static original logo. Escape skips the sequence; renderer failures and an eight-second main-process watchdog release startup. The startup renderer has no microphone, API-key or OBS bridge. The four installed implementation files live in `src/components`; ReactDrops notices are retained in `src/components/ReactDrops.LICENSE.txt` and shipped in `public/reactdrops-component-license.txt`.

### Earlier native transport experiment

The native DirectML experiment is retained separately from the normal app toggle. `desktop/native-matting-bridge.cjs` runs an isolated Python worker, serves a session-protected loopback preview, and delivers foreground colour plus a lossless soft alpha mask to an OBS GPU canvas. Pending frames are replaced rather than queued indefinitely. The experimental runtime and official RVM models remain in `.tmp-review/native-matting`; they are not bundled with the app.

With OBS open and the existing local experiment environment installed, `node scripts/verify-native-matting-obs.cjs` tests the saved clip; add `--webcam` to test the physical Webcam source. These probes switch to a temporary QA scene, refuse to run during streaming/recording, and restore the original scene and virtual-camera state. They do not edit the original webcam filters or transform. A process-owned loopback guard prevents overlapping probes. `node scripts/verify-native-matting-lifecycle.cjs` checks actual worker shutdown and local-server access checks without capturing a webcam.

On 2026-11-01 the physical source-to-OBS path delivered 20.6 cutout updates/second, with 111 ms median and 140 ms p95 capture-request-to-canvas acknowledgement. OBS remained at 30 FPS with no skipped render frames over the 20-second probe. These are lower-bound transport timings, not physical camera-to-OBS presentation latency. Exact alpha agreement verifies transport, not segmentation accuracy. The 24-update/second and sub-100-ms goals remain unmet; live posed movement and Asphalt concurrency remain unvalidated. A lingering idle-socket shutdown required assisted recovery; corrected socket teardown subsequently passed a separate worker/viewer lifecycle check.

That experimental bridge was not promoted. Results and recovery receipts are indexed in `design/background-removal-evidence.json`; its local visual report is `.artifacts/native-integration-20261101/review.html`.

### Current direct OBS matting filter

The subsequent one-hour pass built and installed `scenesense_native_matting` directly in OBS 33.0.1. `native/scenesense-matting.c` processes captured textures with a bounded latest-frame DirectML worker and renders premultiplied soft-alpha output on the same webcam source. It removes the Python/snapshot/JPEG/browser bridge from the active path. Source IDs, position, size and existing voice layout controls remain unchanged. The app prefers this installed filter; the legacy adapter remains available when the native kind is absent.

Restart SceneSense after rebuilding to load the new backend. The webcam panel identifies the native engine as “Native GPU · Local”. Original disables both owned removal filters and restores the source's prior buffering state. Remove background enables the native filter. On this laptop the short direct-filter probe measured approximately 29 matte updates/s, OBS 30 FPS with no skipped frames, and a last processing/frame-age sample of 32/32 ms. These timings exclude camera exposure and final presentation. A ratio .6 detail trial was substantially slower and was reverted to .5. Hair fringes, posed motion and gameplay concurrency still need acceptance; no green-screen quality percentage is claimed.

`native/build.ps1` rebuilds against the pinned local SDK; `-Install` requires OBS closed. `native/NOTICE.txt` records the model/runtime/source notices. The installed filter is a local unsigned prototype, not a release installer. Verification receipts are in `.artifacts/native-filter`; all 110 regression tests and the TypeScript/Vite build passed. The actual app adapter was tested against OBS for Original/Native switching and unchanged camera transform.

The first blinking fix kept the last valid matte when the output lock was busy. Its 40 sparse samples missed a remaining failure shown in the user's next recording: the 250 ms stale-output cutoff made the cutout disappear to black. That cutoff no longer controls visibility. A cached cutout stays visible until replaced; delays are reported as `stalled` rather than hidden. A permanently stalled worker can therefore freeze the image and still requires recovery. Capture now runs at most once per OBS video tick, even when several consumers render the source.

The follow-up test replays the saved webcam clip through a temporary native-filtered OBS media source, captures 15 seconds of continuous virtual-camera output, and checks every decoded frame. `scripts/verify-native-continuity.cjs` (`SENSE_TEST_FIXTURE=1`) found zero missing cutouts across 451 frames, including sampled age spikes up to 406 ms; the worker advanced from 15 to 477 processed frames. OBS stayed at 30 FPS with no skipped frames. The original scene was restored and temporary scene removed. Receipts are in `.artifacts/native-blink-followup/continuity-results.json`. Live movement/gameplay acceptance remains pending. The 124-test regression suite, the expanded 13-test webcam adapter suite (including two new regression cases), and the build passed during this follow-up. Final Original/Remove switching was also verified against OBS with unchanged webcam position and size.

The subsequent frame-delivery pass (`buffered-handoff-v2`) separates input and output locks, transfers input/output buffer ownership by pointer swaps, reads a previous-tick GPU staging surface before submitting the next copy, and uploads a texture only when its output sequence changes. Quality stays at RVM FP32, 640 × 360, ratio .5. A matched saved-clip test reduced the longest near-identical-image run from 24 frames to 2, sampled median frame age from 110 to 63 ms, and sampled p95 from 406 to 110 ms. Both 451-frame runs had zero missing cutouts and OBS 30 FPS with no skipped frames. Near-identical-image detection is a proxy, not proof of motion correctness. The new timestamp includes staging time that the old timestamp excluded. A 2954 ms startup/first-inference warmup spike remains separately recorded; the steady-state sample does not claim instant startup. Real-webcam off/on/off timings and Original/Remove controls passed, with unchanged transform; 133 regression tests passed. The earlier filter DLL is backed up for rollback. Receipts and limitations are in `.artifacts/native-latency/comparison.json`. Optional `SENSE_TEST_OUTPUT` keeps before/after captures separate. Live movement and concurrent gameplay acceptance remain required.
