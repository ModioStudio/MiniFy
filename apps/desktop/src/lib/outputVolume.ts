/**
 * MiniFy's own players (the Spotify Web Playback SDK and the YouTube iframe)
 * run at 63% of their raw level — first cut by 30%, then by another 10% of
 * that — because at full raw volume the app was louder than everything else
 * on the machine. The slider still reads 0–100, so 100 on the slider is 63 at
 * the player.
 *
 * Remote Spotify Connect devices are not scaled. A speaker has its own amp,
 * and capping it at 70% would just take away the top of its range.
 */
const OUTPUT_VOLUME_SCALE = 0.63;

/** Slider percent (0–100) -> percent handed to MiniFy's own player. */
export function toOutputVolume(percent: number): number {
  return Math.max(0, Math.min(100, percent)) * OUTPUT_VOLUME_SCALE;
}

/** Percent MiniFy's own player reports -> slider percent (0–100). */
export function fromOutputVolume(output: number): number {
  return Math.max(0, Math.min(100, Math.round(output / OUTPUT_VOLUME_SCALE)));
}
