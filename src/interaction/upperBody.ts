export interface UpperBody {
  x: number; headY: number; chestY: number;
  headRx: number; headRy: number; chestRx: number; chestRy: number;
}

// Segmentation has no anatomical landmarks. Estimate upper-body zones from
// connected silhouettes. Coordinates use bottom-origin y, radii in screen heights.
export function estimateUpperBodies(mask: Uint8Array, width: number, height: number): UpperBody[] {
  const visited = new Uint8Array(mask.length), queue = new Int32Array(mask.length);
  const components: { indices: number[]; bottom: number; top: number }[] = [];
  for (let seed = 0; seed < mask.length; seed++) {
    if (visited[seed] || mask[seed] < 128) continue;
    let read = 0, write = 1, bottom = height, top = 0;
    const indices: number[] = [];
    queue[0] = seed; visited[seed] = 1;
    while (read < write) {
      const i = queue[read++], x = i % width, y = Math.floor(i / width);
      indices.push(i); bottom = Math.min(bottom, y); top = Math.max(top, y);
      for (const n of [x > 0 ? i - 1 : -1, x + 1 < width ? i + 1 : -1, y > 0 ? i - width : -1, y + 1 < height ? i + width : -1]) {
        if (n >= 0 && !visited[n] && mask[n] > 127) { visited[n] = 1; queue[write++] = n; }
      }
    }
    if (indices.length >= mask.length * .006 && top - bottom >= height * .12) components.push({ indices, bottom, top });
  }
  return components.sort((a, b) => b.indices.length - a.indices.length).slice(0, 4).map(component => {
    const span = (component.top - component.bottom + 1) / height;
    const top = (component.top + 1) / height;
    const cropped = component.bottom <= 1;
    const headHeight = Math.min(.23, span * (cropped ? .34 : .22));
    const headY = top - headHeight * .52;
    const chestY = top - span * (cropped ? .59 : .38);
    const chestRy = Math.min(.21, span * (cropped ? .26 : .18));
    const upper = component.indices.filter(i => Math.floor(i / width) / height >= chestY - chestRy * .5);
    const xs = upper.map(i => i % width).sort((a, b) => a - b);
    // Quantiles reduce the influence of outstretched arms on the chest width.
    const left = xs[Math.floor(xs.length * .12)] ?? width * .4;
    const right = xs[Math.floor(xs.length * .88)] ?? width * .6;
    const chestRx = Math.max(.045, Math.min(.30, (right - left + 1) / height * .58));
    return { x: (left + right + 1) / (2 * width), headY, chestY,
      headRx: Math.min(chestRx * .63, headHeight * .48), headRy: headHeight * .54, chestRx, chestRy };
  });
}

// One envelope around connected head/chest lobes avoids opposing forces between
// them. The field changes y only; adjacent lanes receive a smaller smooth bend.
export function upperBodyOffset(x: number, lane: number, bodies: UpperBody[], aspect: number, padding: number, strength: number) {
  let offset = 0;
  for (const body of bodies) {
    const dx = Math.abs(x - body.x) * aspect;
    const spread = Math.max(body.chestRx, body.headRx) + padding + .10;
    if (dx >= spread) continue;
    const q = dx / spread, envelope = (1 - q * q) ** 3;
    const top = body.headY + body.headRy + padding * .45;
    const bottom = body.chestY - body.chestRy - padding * .45;
    const split = (top + bottom) * .5, halfHeight = (top - bottom) * .5;
    const relative = lane - split, direction = relative >= 0 ? 1 : -1;
    // The falloff slope stays below one even at maximum strength, so lanes do
    // not fold back across one another beside a stationary body.
    const displacement = direction * (halfHeight + .018) * Math.exp(-Math.abs(relative) / ((halfHeight + .018) * 1.5 + .04)) * envelope;
    let candidate = displacement * Math.min(1.5, Math.max(0, strength));
    candidate = candidate > 0 ? Math.min(candidate, (1 - lane) * .92) : Math.max(candidate, -lane * .92);
    if (Math.abs(candidate) > Math.abs(offset)) offset = candidate;
  }
  return offset;
}
