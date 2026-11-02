# Phase 4: stream supervisor

Core promise: Sense reports relevant OBS control problems, and performs a bounded, verified repair only when the user asks.

## Implemented first slice

- Event-driven observations of a selected OBS microphone's mute state and visibility of the last confirmed webcam/game sources. A single available microphone input is preselected; multiple inputs require a choice. Desktop audio is not treated as a microphone.
- OBS disconnection and failed reads are unavailable monitoring states, not healthy stream results. Removed/replaced sources require reconfirmation. Issues disappear after successful recovery reads.
- Sense workspace panel, Showcase Pointer pointing gesture, and deduplicated notch notices. Notifications wait for active dictation to finish.
- Explicit microphone unmute and show-source repairs use OBS operations, validate current context, and read back the result. Ambiguous 'fix it' requests with several issues require the user to choose.
- Explicit 'Open OBS and reconnect' uses the existing desktop helper's launch-OBS operation and a saved OBS preset. Experimental computer setup must be enabled. No game launch, streaming, recording, arbitrary desktop action, or autonomous repair is permitted by this service.
- Voice commands and the existing command guide include these supported operations. Monitoring does not require an AI key, capture images, subscribe to audio meters, or continuously poll.

## Verification

The 174-test regression suite and TypeScript/Vite build passed. Nine focused supervisor cases cover read-only observation and recovery, exact repair writes, readback failures, ambiguous repairs, selection invalidation, stale-scene cancellation, disconnection, and desktop callback failures. The focused suite passed again after the last status refinements. No real OBS mutation, game launch, paid AI request, or live computer-use repair was performed in this pass. Desktop launch/reconnect and actual voice interpretation remain live acceptance gates.

## Low-load live acceptance, once the laptop has cooled

1. Restart the desktop app for updates, connect OBS, and confirm sources. No game is needed; monitoring a hidden Game Capture does not require it to capture a running game.
2. Open Sense and select the OBS microphone. Mute it in OBS; expect one issue and a notch notification. Leave it muted briefly and check that it stays reported without repeated notifications.
3. Ask 'Unmute my microphone' or use its repair button. Verify mute is off in OBS and the issue clears. Intentional mute states remain observations, not grounds for automatic unmuting.
4. Hide the confirmed webcam source. Expect the hidden-source warning despite OBS invalidating the placement selection. Ask 'Show my hidden webcam'; verify the exact source becomes visible. Reconfirm sources if placement controls need it.
5. Change scenes before requesting a source repair. The former source must not be changed.
6. Disconnect OBS. Monitoring must report unavailable. With computer setup enabled and a saved preset, explicitly request 'Open OBS and reconnect'. Verify the connection; do not launch a game or start any output.

## Remaining work

Black capture, frozen webcam, signal audibility, and audience delivery are not checked by this first slice. Add those separately with measured false-positive behavior and bounded processing cost. Healthy control states do not establish healthy video/audio. Asphalt placement/override/race testing remains deferred.
