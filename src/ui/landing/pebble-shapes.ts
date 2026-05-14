/**
 * Organic-feeling rounded-rect radii for Pebble Garden tiles.
 *
 * Pixel-based on purpose — percentages produce ellipses that clip the
 * folder title at the corners. The six shapes rotate deterministically
 * across the grid so neighbouring pebbles look hand-cut rather than
 * stamped.
 */
export const PEBBLE_SHAPES: readonly string[] = [
  '48px 62px 52px 56px / 60px 48px 56px 52px',
  '58px 48px 52px 62px / 52px 60px 48px 56px',
  '52px 56px 62px 48px / 56px 52px 48px 60px',
  '62px 52px 48px 58px / 48px 56px 62px 52px',
  '52px 62px 56px 48px / 62px 52px 48px 56px',
  '48px 58px 52px 60px / 56px 48px 60px 52px',
]

export function pebbleShapeAt(index: number): string {
  if (PEBBLE_SHAPES.length === 0) return '48px'
  const safe =
    ((index % PEBBLE_SHAPES.length) + PEBBLE_SHAPES.length) %
    PEBBLE_SHAPES.length
  return PEBBLE_SHAPES[safe]!
}
