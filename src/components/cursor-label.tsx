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

'use client';

import { gsap } from 'gsap';
import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';

export type CursorLabelAnimation = 'roll' | 'masked-lift' | 'fade' | 'none';

type Layer = { key: number; text: string; entering: boolean };

const ease = 'power4.out';

function Characters({ text }: { text: string }) {
  return (
    <>
      {Array.from(text).map((character, index) => (
        <span key={index} className="showcase-pointer-cursor-char" data-char>
          {character === ' ' ? ' ' : character}
        </span>
      ))}
    </>
  );
}

/**
 * Pill label that animates whenever its text changes. The outgoing text stays
 * mounted on top of the incoming one until its exit finishes, so names and
 * messages swap like the faces of a turning wheel instead of cutting over.
 */
export function CursorLabel({
  text,
  animation,
  reducedMotion,
  style,
}: {
  text: string;
  animation: CursorLabelAnimation;
  reducedMotion: boolean;
  style?: CSSProperties;
}) {
  const pill = useRef<HTMLSpanElement>(null);
  const width = useRef(0);
  const sequence = useRef(0);
  const [layers, setLayers] = useState<Layer[]>(() => [{ key: 0, text, entering: true }]);
  const current = layers[layers.length - 1];
  const animated = animation !== 'none' && !reducedMotion;

  if (current.text !== text) {
    const key = ++sequence.current;
    setLayers(
      animated
        ? [
            { ...current, entering: false },
            { key, text, entering: true },
          ]
        : [{ key, text, entering: false }],
    );
  }

  useLayoutEffect(() => {
    const element = pill.current;
    if (!element) return;
    const incoming = element.querySelector<HTMLElement>('[data-layer="in"]');
    const outgoing = element.querySelector<HTMLElement>('[data-layer="out"]');
    const previousWidth = width.current;
    gsap.set(element, { clearProps: 'width' });
    const nextWidth = element.getBoundingClientRect().width;
    width.current = nextWidth;
    const context = gsap.context(() => {
      if (!animated) return;
      if (previousWidth && Math.abs(previousWidth - nextWidth) > 0.5)
        gsap.fromTo(
          element,
          { width: previousWidth },
          { width: nextWidth, duration: 0.7, ease, clearProps: 'width' },
        );
      const done = () => setLayers((old) => old.filter((layer) => layer.entering));
      if (animation === 'roll') {
        const charsIn = incoming?.querySelectorAll('[data-char]') ?? [];
        gsap.fromTo(
          charsIn,
          { rotationX: -100, yPercent: 70, opacity: 0 },
          { rotationX: 0, yPercent: 0, opacity: 1, duration: 0.9, ease, stagger: 0.028 },
        );
        if (outgoing)
          gsap.to(outgoing.querySelectorAll('[data-char]'), {
            rotationX: 100,
            yPercent: -70,
            opacity: 0,
            duration: 0.6,
            ease,
            stagger: 0.02,
            onComplete: done,
          });
      } else if (animation === 'fade') {
        if (incoming)
          gsap.fromTo(
            incoming,
            { opacity: 0, scale: 0.82, filter: 'blur(4px)' },
            { opacity: 1, scale: 1, filter: 'blur(0px)', duration: 0.6, ease },
          );
        if (outgoing)
          gsap.to(outgoing, {
            opacity: 0,
            scale: 1.08,
            filter: 'blur(4px)',
            duration: 0.35,
            ease,
            onComplete: done,
          });
      } else if (animation === 'masked-lift') {
        const line = incoming?.querySelector('[data-lift-line]');
        if (line) gsap.fromTo(line, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease });
        if (outgoing) gsap.to(outgoing, { yPercent: -110, duration: 0.6, ease, onComplete: done });
      }
    }, element);
    return () => context.revert();
    // Layers change only when the text changes; `current.key` captures that.
  }, [current.key, animation, animated]);

  return (
    <span ref={pill} className="showcase-pointer-cursor-label" style={style}>
      {layers.map((layer) => {
        const role = layer.entering || layers.length === 1 ? 'in' : 'out';
        return (
          <span
            key={layer.key}
            className="showcase-pointer-cursor-label-text"
            data-layer={role}
            aria-hidden={role === 'out' || undefined}
          >
            {animated && animation === 'masked-lift' && role === 'in' ? (
              <span className="showcase-pointer-cursor-label-mask">
                <span data-lift-line>{layer.text}</span>
              </span>
            ) : animated && animation === 'roll' ? (
              <Characters text={layer.text} />
            ) : (
              layer.text
            )}
          </span>
        );
      })}
    </span>
  );
}
