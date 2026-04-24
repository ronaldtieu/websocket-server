// Cube orientation model + tumble transitions.
//
// Cube has six face slots — top, bottom, north, south, east, west — and each
// slot holds either one of the six tile colors or the player's "face".
//
// Tipping the cube one square in a cardinal direction rotates the cube
// 90 degrees about a horizontal axis. Convention used here (right-handed,
// looking down at the board, +y = North, +x = East):
//
//   tip North: cube falls forward (its top edge moves North)
//     top    -> south
//     south  -> bottom
//     bottom -> north
//     north  -> top
//     east, west unchanged
//
//   tip South:
//     top    -> north
//     north  -> bottom
//     bottom -> south
//     south  -> top
//
//   tip East:
//     top    -> west
//     west   -> bottom
//     bottom -> east
//     east   -> top
//
//   tip West:
//     top    -> east
//     east   -> bottom
//     bottom -> west
//     west   -> top
//
// The "horizontal" labels (north/south/east/west) follow the cube body, not
// the world, so they mean "the face that was previously on the X side". The
// tumble update rotates them appropriately.
//
// All tumbles are deterministic given the input orientation and direction.

import type { CubeColor, CubeFace, CubeOrientation, Direction, FaceSlot } from './types.js';

const ALL_COLORS: CubeColor[] = ['red', 'yellow', 'blue', 'green', 'purple', 'white'];

export function tumble(o: CubeOrientation, dir: Direction): CubeOrientation {
  switch (dir) {
    case 'N':
      return {
        top: o.north,
        north: o.bottom,
        bottom: o.south,
        south: o.top,
        east: o.east,
        west: o.west,
      };
    case 'S':
      return {
        top: o.south,
        south: o.bottom,
        bottom: o.north,
        north: o.top,
        east: o.east,
        west: o.west,
      };
    case 'E':
      return {
        top: o.west,
        west: o.bottom,
        bottom: o.east,
        east: o.top,
        north: o.north,
        south: o.south,
      };
    case 'W':
      return {
        top: o.east,
        east: o.bottom,
        bottom: o.west,
        west: o.top,
        north: o.north,
        south: o.south,
      };
  }
}

export function topAfter(o: CubeOrientation, dir: Direction): CubeFace {
  return tumble(o, dir).top;
}

// Build a randomized starting orientation. One slot gets the player's face,
// the other five get five of the six colors (the dropped color is chosen
// randomly so the cube faithfully represents "5 colors + face").
export function randomOrientation(rng: () => number = Math.random): CubeOrientation {
  const slots: FaceSlot[] = ['top', 'bottom', 'north', 'south', 'east', 'west'];
  const shuffledSlots = shuffle(slots, rng);
  const faceSlot = shuffledSlots[0];
  const otherSlots = shuffledSlots.slice(1);

  const colors = shuffle(ALL_COLORS, rng);
  // Use the first 5 colors; drop one at random (which is implicit since we
  // only fill 5 non-face slots).
  const placement: Partial<Record<FaceSlot, CubeFace>> = {};
  placement[faceSlot] = 'face';
  for (let i = 0; i < otherSlots.length; i += 1) {
    placement[otherSlots[i]] = colors[i];
  }
  return {
    top: placement.top!,
    bottom: placement.bottom!,
    north: placement.north!,
    south: placement.south!,
    east: placement.east!,
    west: placement.west!,
  };
}

// Re-orient the cube so a given color sits on top. Used by the Color Match
// rule's preview/forced re-orient action. We achieve this by finding the
// slot currently holding the requested color and applying the tumble that
// would bring it to the top. If the requested color is already on top this
// is a no-op. If the requested color isn't on the cube at all (e.g. it was
// the dropped color), we reject.
//
// Returns null if the color isn't reachable (the player would need to pick
// a different color in that case).
export function reorientToTop(o: CubeOrientation, color: CubeColor): CubeOrientation | null {
  if (o.top === color) return o;
  // find which slot holds the color
  const slots: FaceSlot[] = ['top', 'bottom', 'north', 'south', 'east', 'west'];
  let foundSlot: FaceSlot | null = null;
  for (const s of slots) {
    if (o[s] === color) {
      foundSlot = s;
      break;
    }
  }
  if (foundSlot === null) return null;
  // map slot -> single tumble that brings it to top.
  // bottom -> need two tumbles (any axis). We pick North twice.
  switch (foundSlot) {
    case 'top':
      return o;
    case 'north':
      return tumble(o, 'N');
    case 'south':
      return tumble(o, 'S');
    case 'east':
      return tumble(o, 'E');
    case 'west':
      return tumble(o, 'W');
    case 'bottom':
      return tumble(tumble(o, 'N'), 'N');
  }
}

// All colors currently visible on top after tipping in each of the four
// directions (used for previews on the phone).
export function previewTops(o: CubeOrientation): Record<Direction, CubeFace> {
  return {
    N: topAfter(o, 'N'),
    E: topAfter(o, 'E'),
    S: topAfter(o, 'S'),
    W: topAfter(o, 'W'),
  };
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
