/**
 * Lightweight, dependency-free (beyond `sharp`, already added for
 * classification) image quality heuristics used to gate room-capture
 * uploads before they're accepted into a virtual tour.
 *
 * These are intentionally cheap approximations, not a full CV pipeline:
 *  - sharpness: variance of a Laplacian-convolved greyscale image. Low
 *    variance == flat/blurry image. This is the standard "blur detection"
 *    heuristic used in most lightweight image-quality tooling.
 *  - brightness: mean pixel luminance, flags under/over-exposed shots.
 */
import sharp from 'sharp';

export interface QualityScore {
  sharpness: number; // higher is sharper; ~<15 is very likely blurry at typical phone-photo resolutions
  brightness: number; // 0-255 mean luminance
  isBlurry: boolean;
  isTooDark: boolean;
  isTooBright: boolean;
}

const SHARPNESS_MIN = 15;
const BRIGHTNESS_MIN = 25;
const BRIGHTNESS_MAX = 235;

// 3x3 Laplacian kernel (edge/blur detector)
const LAPLACIAN_KERNEL = {
  width: 3,
  height: 3,
  kernel: [0, 1, 0, 1, -4, 1, 0, 1, 0],
};

export async function scoreImageQuality(filePath: string): Promise<QualityScore> {
  // Downscale first -- we only need a quality signal, not a pixel-perfect
  // measurement, and this keeps the check fast on large phone photos.
  const pipeline = sharp(filePath).resize({ width: 800, withoutEnlargement: true }).greyscale();

  const [brightnessStats, laplacianStats] = await Promise.all([
    pipeline.clone().stats(),
    pipeline.clone().convolve(LAPLACIAN_KERNEL).stats(),
  ]);

  const brightness = brightnessStats.channels[0]?.mean ?? 128;
  const sharpness = laplacianStats.channels[0]?.stdev ?? 0;

  return {
    sharpness,
    brightness,
    isBlurry: sharpness < SHARPNESS_MIN,
    isTooDark: brightness < BRIGHTNESS_MIN,
    isTooBright: brightness > BRIGHTNESS_MAX,
  };
}

export function qualityFailureReasons(score: QualityScore): string[] {
  const reasons: string[] = [];
  if (score.isBlurry) reasons.push(`Image looks blurry (sharpness score ${score.sharpness.toFixed(1)}, need >= ${SHARPNESS_MIN}). Hold the phone steady and refocus before capturing.`);
  if (score.isTooDark) reasons.push(`Image is too dark (brightness ${score.brightness.toFixed(0)}/255). Turn on more lights or open curtains before capturing this angle.`);
  if (score.isTooBright) reasons.push(`Image is overexposed (brightness ${score.brightness.toFixed(0)}/255). Avoid shooting directly into windows/lights.`);
  return reasons;
}
