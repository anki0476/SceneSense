# Combined Phase 4 acceptance test

Run after the laptop has cooled. No broadcast or recording is required. Do not test repairs during a real stream until these checks pass.

## Implemented scope

OBS control-state monitoring, selected microphone, hidden/missing confirmed sources, connection availability, deduplicated Sense notices, requested verified control repairs, explicit OBS launch/reconnect through enabled computer setup and a saved preset, cancellation, and optional local video probes.

Video checks default off. The saved setting enables at most two 64 × 36 source snapshots per four-second cycle, with no image upload/storage and no model call. A black-game warning needs three dark samples across at least eight seconds. A possible webcam-freeze warning needs four identical visible samples spanning twelve seconds. Dark gameplay/loading screens and still images can produce false positives. Transparent empty cutouts are excluded from freeze warnings. Recovery samples clear video warnings. A read failure is unavailable evidence, not healthy video.

## One-session checklist

1. Restart for updates. Connect OBS, confirm Webcam/Game Capture, open Sense → Stream supervisor. Select the intended OBS microphone. Leave Local video checks off initially.
2. Mute that mic in OBS. Expect one warning and a Sense notice, without repeated notices while unchanged. Ask “Unmute my microphone.” Check OBS and the cleared warning. Muting intentionally must never cause autonomous unmuting.
3. Hide the confirmed webcam, then ask “Show my hidden webcam.” Verify only that scene item becomes visible. Repeat with the game source. Reconfirm placement sources if OBS invalidated them.
4. Report two issues together. Ask “Fix the reported issue.” Sense must require a choice instead of guessing. A specific repair must affect only its named issue.
5. Change scenes or remove/replace a source before repair. Sense must not mutate an old source. Confirm the new sources to resume monitoring them.
6. Disconnect OBS. Expect unavailable monitoring, not healthy status. With Experimental computer setup enabled and a saved preset, ask “Open OBS and reconnect.” Expect only OBS to open and reconnect; no game, stream or recording should start. Disabled computer setup or a missing preset should produce an actionable error. Try cancellation during a pending repair; commands already sent may have applied, so check OBS afterward.
7. Enable Local video checks. An unstarted black Game Capture can produce “Game capture looks black” after sustained evidence. “Review capture settings” or “Open settings for the black game capture” should open that source's OBS properties and must not claim to have fixed it. Actual automatic capture restarts are not implemented.
8. Once Asphalt testing resumes, verify the black warning clears with visible game content and does not repeatedly trigger during ordinary play. Watch loading screens and dark scenes for false positives.
9. Webcam freeze detection has synthetic frame-sequence coverage. A controlled paused-video-source test and natural live-camera movement are still acceptance gates; do not assume a perfectly still person is frozen. Confirm new frames clear a warning. Source settings review is assistance, not a verified repair.
10. Restart the app and confirm Local video checks and selected microphone are remembered. Turn video checks off to return to event-only control monitoring.

## Verification and limits

The full 180-test suite and TypeScript/Vite build passed after implementation. The expanded focused video/supervisor suite passed again with persistence and review-only action coverage. These are simulated OBS and pixel tests, not live repair acceptance. No OBS, game, stream, recording or paid AI request was started during this implementation.

The subsequent hidden desktop integration (`node scripts/supervisor-desktop-smoke.cjs`) also passed with GPU acceleration disabled. It exercises the actual React renderer, isolated preload bridge, IPC handlers and supervisor service against a local OBS WebSocket simulator: selected microphone detection, mute/hidden-source notifications, ambiguous repair refusal, exact repair readback, nativeImage decoding of fixture snapshots, video toggle rendering, and offline state. The fixture initially injected a source change during the separate audio-mixer mutation; that correctly triggered context-change rejection. The test now sequences the two independent faults, so each is tested without conflating their scopes. This run uses isolated temporary app preferences and no real OBS, game, camera, stream, recording or paid provider. Physical OBS launch/reconnect, actual voice interpretation, and real video false positives remain live acceptance gates. These cannot be marked complete from simulated evidence.

The supervisor cannot yet prove microphone audibility, audio clipping/noise quality, camera hardware health, network delivery, or the actual Twitch audience experience. Source images and OBS controls are partial evidence. These are future extensions, not claims of this prototype.
