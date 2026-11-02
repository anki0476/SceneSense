/*!
ReactDrops Component License 1.0

Copyright (c) 2026 ReactDrops

1. Scope and definitions

This license applies to ReactDrops software and associated documentation that
expressly carry this license or are distributed under a LICENSE file containing
it (the "Software"). "Licensor" means the copyright holder granting rights in
the Software, and only to the extent that holder has authority to grant them.
"You" means the individual or entity exercising these rights.

An "End Product" is a website, application, service, or other finished project
whose primary purpose is something other than providing reusable components,
source code, templates, or development assets to others.

2. Permitted uses

Subject to this license, Licensor grants You a worldwide, non-exclusive,
royalty-free license to use, copy, modify, and incorporate the Software into
unlimited personal, internal, and commercial End Products. You may charge for
End Products, subscriptions, development services, and work for clients.

You may distribute the Software as an integrated part of an End Product,
including in browser-delivered JavaScript. You may provide End Product source
code to a client, and share the Software with employees and contractors who
need it to develop or maintain End Products. Those recipients may use the
Software for those purposes subject to this license. This permission does not
authorize them to redistribute the Software as a reusable development asset.

3. Restricted redistribution

Unless You obtain separate written permission from Licensor, You may not sell,
sublicense, publish, share, or otherwise redistribute the Software, or a
substantial portion of it, whether unchanged or modified:

(a) as a standalone component, component library, UI kit, source-code bundle,
    registry, or other collection of reusable development assets;
(b) as part of a theme, template, starter project, or similar product offered
    to multiple recipients for reuse in their own projects; or
(c) through a builder or generation service that offers the Software as
    reusable blocks or source-code exports for others' projects.

These restrictions apply to paid and free redistribution. Renaming, restyling,
repackaging, translating, or modifying the Software does not remove them.
Building separate finished websites or applications for multiple clients is
permitted; offering a reusable template or kit containing the Software is not.

Public source-code hosting by Licensor is not permission to republish the
Software under another license. This license does not override any separate
rights granted directly by Licensor or applicable code-hosting terms.

4. Notices and ownership

Retain this license and applicable copyright and third-party notices in source
copies of the Software and permitted source distributions. No visible credit
or ReactDrops logo is required in an End Product's user interface.

Licensor retains ownership of its Software. You retain rights in Your own
contributions, subject to the license for any incorporated Software. No rights
to trademarks, trade names, or logos are granted by this license.

5. Third-party materials and separate grants

Dependencies, fonts, images, videos, and other third-party materials remain
subject to their respective licenses. Separately identified third-party code
is licensed under its stated terms, and these restrictions do not limit rights
granted by its copyright holders. Retain all required third-party notices.
Demo media are not licensed by this document; obtain Your own permission or
replace them with media You are entitled to use.

This license does not revoke rights granted under other valid licenses. It does
not assert ownership of third-party work or grant rights Licensor lacks.

6. Termination

The permissions granted here continue unless terminated for a material breach.
If You fail to cure a material breach within 30 days after receiving written
notice from Licensor, Your permissions terminate. On termination, cease uses
and distributions requiring this license. Rights under independently granted
licenses and rights that applicable law does not allow to be restricted remain
unaffected. Sections 3 through 7 survive termination.

7. Disclaimer

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE, TITLE, AND NON-INFRINGEMENT. TO THE MAXIMUM EXTENT
PERMITTED BY APPLICABLE LAW, LICENSOR AND CONTRIBUTORS SHALL NOT BE LIABLE FOR
ANY CLAIM, DAMAGES, OR OTHER LIABILITY, WHETHER IN CONTRACT, TORT, OR OTHERWISE,
ARISING FROM, OUT OF, OR IN CONNECTION WITH THE SOFTWARE OR ITS USE.

This license does not limit rights or exceptions that applicable law makes
non-waivable. No other permissions are granted by implication.
*/

export type Point = { x: number; y: number };

/** Minimum-jerk position profile, the velocity curve of an unhurried human reach. */
export function minimumJerk(t: number) {
  const p = Math.min(1, Math.max(0, t));
  return p * p * p * (10 + p * (6 * p - 15));
}

/** Deterministic pseudo-random sequence so a script replays the same arcs every loop. */
export function createRandom(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return (state >>> 0) / 4294967296;
  };
}

export function hashString(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export type ReachPlan = {
  duration: number;
  /** Position at progress 0..1 along the whole reach, including the corrective sub-movement. */
  at: (progress: number) => Point;
};

export type CursorEasing = 'human' | 'ease-in-out' | 'ease-out' | 'linear';

/** Rules for how a cursor travels. The defaults reproduce an unhurried human hand. */
export type CursorMotion = {
  /** Fixed time of every reach in ms (the Fitts's law intercept). */
  reachTime?: number;
  /** Extra ms per bit of difficulty, log2(1 + distance / target size) (the Fitts's law slope). */
  reachScale?: number;
  /** Longest single reach in ms. */
  maxReach?: number;
  /** Sideways bend of the path: 0 is straight, 1 natural, 2 strongly arced. */
  curvature?: number;
  /** Overshoot and correction on long reaches: 0 is off, 1 natural. */
  overshoot?: number;
  /** Velocity profile along the path. Human is the minimum-jerk profile of real reaches. */
  easing?: CursorEasing;
  /** How far from the target center a cursor lands: 0 is the exact center. */
  landingSpread?: number;
  /** How many times slower drags and box selections move than free reaches. */
  dragPace?: number;
};

export const defaultCursorMotion: Required<CursorMotion> = {
  reachTime: 240,
  reachScale: 150,
  maxReach: 1500,
  curvature: 1,
  overshoot: 1,
  easing: 'human',
  landingSpread: 1,
  dragPace: 1.45,
};

const easings: Record<CursorEasing, (t: number) => number> = {
  human: minimumJerk,
  'ease-in-out': (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  'ease-out': (t) => 1 - (1 - t) ** 3,
  linear: (t) => t,
};

/**
 * A curved reach in two sub-movements: a fast primary arc that slightly
 * overshoots long moves, then a short correction onto the target. Duration
 * follows Fitts's law, so far or small targets take longer than near, large ones.
 */
export function planReach(
  from: Point,
  to: Point,
  targetSize: number,
  random: () => number,
  pace = 1,
  motion: Required<CursorMotion> = defaultCursorMotion,
): ReachPlan {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);
  if (distance < 0.5) return { duration: 0, at: () => to };
  const width = Math.max(18, targetSize);
  const duration = Math.min(
    motion.maxReach,
    (motion.reachTime + motion.reachScale * Math.log2(1 + distance / width)) * pace,
  );
  const ux = dx / distance;
  const uy = dy / distance;
  const ease = easings[motion.easing] ?? minimumJerk;
  // Wrist rotation bends real reaches; alternate sides with a random magnitude.
  // Draw every random number even when a rule is off, so paths stay reproducible.
  const side = random() < 0.5 ? -1 : 1;
  const bend = side * (0.06 + random() * 0.12) * distance * motion.curvature;
  const overshootJitter = 0.6 + random() * 0.4;
  const overshoot =
    distance > 160 ? Math.min(12, distance * 0.035) * overshootJitter * motion.overshoot : 0;
  const aim = { x: to.x + ux * overshoot, y: to.y + uy * overshoot };
  const control = {
    x: (from.x + aim.x) / 2 - uy * bend,
    y: (from.y + aim.y) / 2 + ux * bend,
  };
  const split = overshoot > 0.01 ? 0.84 : 1;
  return {
    duration,
    at(progress) {
      if (progress < split) {
        const t = ease(progress / split);
        const a = 1 - t;
        return {
          x: a * a * from.x + 2 * a * t * control.x + t * t * aim.x,
          y: a * a * from.y + 2 * a * t * control.y + t * t * aim.y,
        };
      }
      if (split === 1) return { ...to };
      const t = ease((progress - split) / (1 - split));
      return { x: aim.x + (to.x - aim.x) * t, y: aim.y + (to.y - aim.y) * t };
    },
  };
}

/** Smooth, bounded idle sway built from incommensurate sines. */
export function idleSway(time: number, phase: number): Point {
  const t = time / 1000 + phase;
  return {
    x: Math.sin(t * 1.3) * 0.6 + Math.sin(t * 2.9 + 1.7) * 0.3 + Math.sin(t * 0.7 + 4.1) * 0.4,
    y: Math.sin(t * 1.1 + 2.3) * 0.55 + Math.sin(t * 2.3 + 0.4) * 0.3 + Math.sin(t * 0.5) * 0.35,
  };
}

/** Critically damped spring step toward a target (exact for a constant target). */
export function springStep(
  value: number,
  velocity: number,
  target: number,
  omega: number,
  dt: number,
) {
  const x = value - target;
  const exp = Math.exp(-omega * dt);
  const nextX = (x + (velocity + omega * x) * dt) * exp;
  const nextV = (velocity - omega * (velocity + omega * x) * dt) * exp;
  return [target + nextX, nextV] as const;
}

/** White or near-black text for a cursor color, by WCAG relative luminance. */
export function readableTextColor(color: string) {
  const hex = color.trim().replace(/^#/, '');
  if (!/^[\da-f]{3}([\da-f]{3})?$/i.test(hex)) return '#ffffff';
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join('') : hex;
  const channel = (offset: number) => {
    const value = parseInt(full.slice(offset, offset + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  // Like collaboration tools, keep white text on saturated colors and switch to dark
  // only where white falls below 2.2:1 (yellows, limes, pale tints).
  return 1.05 / (luminance + 0.05) >= 2.2 ? '#ffffff' : '#141414';
}
