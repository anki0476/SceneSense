# SceneSense interface

Visual reference: [TWITCH_DESIGN.md](TWITCH_DESIGN.md), supplied by the user. Design workflow: Nutlope/hallmark, app-screen scope, full redesign.

- Snow #F7F7F8 canvas, white surfaces, charcoal #0E0E10 type, violet #9147FF primary controls, dark violet #330C6E identity.
- Locally bundled, openly licensed Inter Variable. Roobert was not supplied; no unlicensed font is downloaded.
- Compact proportional type, hairline boundaries, pill buttons, 8px input corners, 2px panel corners. All colors, fonts and spacing are centralized in src/tokens.css. State transitions last at most 100ms and respect reduced motion.
- A top navigation switches between Studio, Voice, Connections and Activity. Existing components remain mounted to preserve voice session state and video references. View changes do not modify the file URL used by IPC sender validation.
- Studio leads with the actual OBS preview, reversible webcam controls beside it, and community reports below. Connections contains OBS, source confirmation and optional Twitch setup. Voice contains the existing local credential fields, mic preparation, hold-to-speak and transcription. Activity shows the existing connection and manual-action log.
- Real connection states only. No fabricated health scores, audience counts, active automation or stream status. Preview is explicitly OBS-local, not a Twitch viewer playback monitor.

Existing action handlers and credential boundaries are preserved. Presentation text is shortened and implementation-phase labels are removed. Source selection, restore verification, mic capture behavior and provider calls retain their existing implementation.

Before-edit source snapshot: .tmp-review/scenesense-before-ui. Visual comparison: .hallmark/compare.html. Functional desktop checks use simulated OBS and synthetic microphone/video inputs, not real provider credentials.

The mascot is named **Sense**, as chosen by the user on 2026-10-31. Its selected avatar is Libraries.dev's `bot-avatars` Mech at 32px, using default animation when idle and working animation during scene analysis. The shared React component is `src/SenseAvatar.tsx`. `src/SenseGuide.tsx` integrates animated pointing and explanation bubbles into the actual Studio OBS preview. It uses analysis rectangles mapped to broadcast-canvas coordinates. A proposed placement is visual-only until Apply; Keep here pauses watching, and Undo restores Sense's previous verified placement if the context is unchanged. These annotations stay in SceneSense's UI and are not added as OBS sources. The Windows-wide overlay still serves voice status only. Supporting copy is concise; diagnostics and detailed guidance live in expandable sections.
