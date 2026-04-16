/**
 * PostProcessing — EffectComposer pipeline
 *
 * Bloom intensity levels from VISUAL_STYLE_GUIDE.md §5:
 *   Low  (Tier 1–2): intensity 0.4, radius 0.3, luminanceThreshold 0.8
 *   Mid  (Tier 3):   intensity 0.8, radius 0.5, luminanceThreshold 0.6
 *   High (Tier 4–5): intensity 1.4, radius 0.8, luminanceThreshold 0.4
 *
 * Default: "high" — Tier 5 monument crown must read as a light source.
 * Color law: bloom only amplifies existing palette colors (#00e5ff / #ffb347 / #ff3ea5).
 *
 * Additional passes (always on):
 *   ChromaticAberration — subtle radial RGB split (offset 0.0005 each axis),
 *     reinforces the sci-fi command-bridge aesthetic without calling attention to itself.
 *   Vignette — darkness 0.45, offset 0.3 — frames the globe, keeps center clean.
 *
 * ToneMapping note: ACES_FILMIC was removed 2026-04-13 to prevent GPU ReadPixels
 * stalls. EffectComposer is run with multisampling=0 (no MSAA FBO resolve) for
 * the same reason. The globe uses sRGB output with r3f's default renderer tone
 * mapping (ACESFilmicToneMapping), which handles HDR roll-off correctly.
 *
 * Bloom animation (two layers, both in useFrame — zero React re-renders):
 *
 *   1. Level-transition smoothing:
 *      When the bloom level changes (new tier-4/5 agent appears or leaves),
 *      intensity, radius, luminanceThreshold, and luminanceSmoothing lerp toward
 *      the target preset at BLOOM_LERP_SPEED. Transition completes in ~0.4 s.
 *      Prevents the jarring snap from low→high that occurs when the first T4/5
 *      agent spawns into a scene that was previously T1/2-only.
 *
 *   2. Camera-distance bloom scaling:
 *      mipmapBlur radius floods the scene at minDistance (1.8) — emissives fill
 *      the screen and the multi-scale blur halos cover everything. We scale
 *      radius + intensity down toward BLOOM_MIN_SCALE as the camera approaches
 *      BLOOM_NEAR_DIST, restoring full bloom beyond BLOOM_FAR_DIST.
 *
 * Both layers write directly to the BloomEffect instance via ref mutation.
 * No setState ⟹ no reconciler work during animation frames.
 */

import { EffectComposer, Bloom, ChromaticAberration, Vignette } from '@react-three/postprocessing';
import { BlendFunction, VignetteTechnique } from 'postprocessing';
import type { BloomEffect } from 'postprocessing';
import { useRef, useCallback } from 'react';
import type React from 'react';
import { useFrame } from '@react-three/fiber';
import {
  type BloomLevel,
  BLOOM_PRESETS,
  BLOOM_LERP_SPEED,
  bloomDistanceScale,
} from './postprocessing-constants';

export type { BloomLevel } from './postprocessing-constants';

// Chromatic aberration offset — 0.0005 per axis: detectable under scrutiny,
// invisible during casual viewing. Plain tuple — do NOT use a THREE.Vector2
// instance here: the postprocessing reconciler walks the Pass→Resolution backref
// and JSON.stringify blows up with "Converting circular structure to JSON".

interface PostProcessingProps {
  level?: BloomLevel;
}

export default function PostProcessing({ level = 'high' }: PostProcessingProps) {
  // Ref to the underlying BloomEffect instance.
  // All bloom animation is driven imperatively through this ref — no React state.
  const bloomRef = useRef<BloomEffect | null>(null);

  // Callback ref: runs immediately when the BloomEffect instance is created.
  // postprocessing v6 stores a back-reference: BloomEffect.resolution.resizable === BloomEffect.
  // The @react-three/postprocessing reconciler walks effect props with JSON.stringify when
  // the bloom level prop changes (e.g. first snapshot data arrives and bloomLevel updates).
  // That walk hits the circular reference and throws "Converting circular structure to JSON".
  // Patching toJSON on the Resolution instance breaks the cycle without changing behavior.
  const bloomCallbackRef = useCallback((effect: BloomEffect | null) => {
    bloomRef.current = effect;
    if (effect) {
      const resolution = (effect as unknown as Record<string, unknown>).resolution as Record<string, unknown> | undefined;
      if (resolution && typeof resolution.toJSON !== 'function') {
        // Use an arrow function (no `this`) — React Compiler does not support `this` syntax.
        // Capture `resolution` in the closure to read width/height at call time.
        resolution.toJSON = () => ({
          width: resolution.width as number,
          height: resolution.height as number,
        });
      }
    }
  }, []);

  // Current animated bloom values — lerp toward BLOOM_PRESETS[level] each frame.
  // Initialised from the starting level so the first frame has correct values.
  const lerpIntensityRef  = useRef(BLOOM_PRESETS[level].intensity);
  const lerpRadiusRef     = useRef(BLOOM_PRESETS[level].radius);
  const lerpThresholdRef  = useRef(BLOOM_PRESETS[level].luminanceThreshold);
  const lerpSmoothingRef  = useRef(BLOOM_PRESETS[level].luminanceSmoothing);

  useFrame(({ camera }, delta) => {
    const effect = bloomRef.current;
    if (!effect) return;

    const target = BLOOM_PRESETS[level];
    const step   = Math.min(1, BLOOM_LERP_SPEED * delta);

    // Lerp each parameter toward the target preset.
    lerpIntensityRef.current  += (target.intensity          - lerpIntensityRef.current)  * step;
    lerpRadiusRef.current     += (target.radius             - lerpRadiusRef.current)     * step;
    lerpThresholdRef.current  += (target.luminanceThreshold - lerpThresholdRef.current)  * step;
    lerpSmoothingRef.current  += (target.luminanceSmoothing - lerpSmoothingRef.current)  * step;

    // Camera-distance scale — smooth-step for perceptual linearity.
    const dist  = camera.position.length();
    const scale = bloomDistanceScale(dist);

    // Mutate the BloomEffect directly — no reconciler work, no effect reconstruction.
    effect.intensity                                  = lerpIntensityRef.current * scale;
    if (effect.mipmapBlurPass) effect.mipmapBlurPass.radius = lerpRadiusRef.current * scale;
    effect.luminanceMaterial.uniforms.threshold.value = lerpThresholdRef.current;
    effect.luminanceMaterial.uniforms.smoothing.value = lerpSmoothingRef.current;
  });

  // Initial Bloom props establish the effect at the correct starting values.
  // After the first frame, useFrame owns all bloom state — these props are frozen.
  const initial = BLOOM_PRESETS[level];

  return (
    // multisampling=0: disable MSAA FBO resolve — prevents GPU ReadPixels stalls
    // on certain GPU/driver combinations that were causing frame drops.
    <EffectComposer multisampling={0}>
      <Bloom
        ref={bloomCallbackRef as unknown as React.Ref<BloomEffect>}
        blendFunction={BlendFunction.ADD}
        intensity={initial.intensity}
        radius={initial.radius}
        luminanceThreshold={initial.luminanceThreshold}
        luminanceSmoothing={initial.luminanceSmoothing}
        mipmapBlur={false}
      />
      <ChromaticAberration
        blendFunction={BlendFunction.NORMAL}
        offset={[0.0005, 0.0005]}
        radialModulation={false}
      />
      <Vignette
        offset={0.3}
        darkness={0.45}
        technique={VignetteTechnique.DEFAULT}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  );
}
