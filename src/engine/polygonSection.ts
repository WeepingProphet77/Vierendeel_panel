/**
 * Compute cross-section properties from an arbitrary closed polygon.
 *
 * Vertices are in (x, y) inches where y=0 is the extreme compression fiber
 * (top of section) and y increases downward.
 *
 * Uses the shoelace formula for area and centroid, and the second-moment
 * formula for the moment of inertia about the centroidal axis.
 */

export interface PolygonVertex {
  x: number;
  y: number;
}

export interface PolygonSectionProps {
  A: number;     // cross-sectional area, in²
  yCg: number;   // centroid depth from top, in
  Ig: number;    // moment of inertia about centroidal horizontal axis, in⁴
  yb: number;    // distance from centroid to bottom fiber, in
  Sb: number;    // section modulus at bottom fiber, in³
  h: number;     // total depth (yMax - yMin), in
  yMin: number;  // topmost y
  yMax: number;  // bottommost y
}

/**
 * Compute gross section properties of a closed polygon.
 * Vertices should define a simple (non-self-intersecting) polygon.
 * Works for both CW and CCW vertex orderings.
 */
export function polygonSectionProperties(verts: PolygonVertex[]): PolygonSectionProps | null {
  const n = verts.length;
  if (n < 3) return null;

  // Shoelace for area and centroid
  let signedArea2 = 0;
  let cySum = 0;

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = verts[i].x * verts[j].y - verts[j].x * verts[i].y;
    signedArea2 += cross;
    cySum += (verts[i].y + verts[j].y) * cross;
  }

  const A = Math.abs(signedArea2) / 2;
  if (A < 1e-6) return null;

  const sign = signedArea2 >= 0 ? 1 : -1;
  const yCg = (sign * cySum) / (3 * sign * signedArea2);

  // Moment of inertia about the x-axis (y=0) using polygon formula
  // Ix = (1/12) Σ (xi·yj − xj·yi)(yi² + yi·yj + yj²)
  let Ix0 = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const cross = verts[i].x * verts[j].y - verts[j].x * verts[i].y;
    Ix0 += cross * (verts[i].y * verts[i].y + verts[i].y * verts[j].y + verts[j].y * verts[j].y);
  }
  Ix0 = Math.abs(Ix0) / 12;

  // Parallel axis theorem: Ig = Ix0 - A * yCg²
  const Ig = Ix0 - A * yCg * yCg;

  // Extents
  let yMin = Infinity, yMax = -Infinity;
  for (const v of verts) {
    if (v.y < yMin) yMin = v.y;
    if (v.y > yMax) yMax = v.y;
  }

  const h = yMax - yMin;
  const yb = yMax - yCg;
  const Sb = yb > 0 ? Ig / yb : 0;

  return { A, yCg, Ig, yb, Sb, h, yMin, yMax };
}

/**
 * Compute the width of the polygon at a given depth y by intersecting
 * a horizontal line at y with all polygon edges.
 *
 * Returns the total width (sum of all horizontal chord segments).
 * Used for Whitney stress block integration.
 */
export function polygonWidthAtDepth(verts: PolygonVertex[], y: number): number {
  const n = verts.length;
  const intersections: number[] = [];

  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const y1 = verts[i].y;
    const y2 = verts[j].y;

    // Check if the edge crosses y
    if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
      const t = (y - y1) / (y2 - y1);
      const x = verts[i].x + t * (verts[j].x - verts[i].x);
      intersections.push(x);
    }
  }

  // Sort intersections and sum widths of pairs
  intersections.sort((a, b) => a - b);
  let width = 0;
  for (let i = 0; i + 1 < intersections.length; i += 2) {
    width += intersections[i + 1] - intersections[i];
  }

  return width;
}

/**
 * Compute the concrete compression force for a custom polygon section
 * using Whitney stress block. Integrates 0.85·f'c over the polygon
 * area from y=0 to y=a using numerical strips.
 */
export function polygonCompressionForce(
  verts: PolygonVertex[],
  fc: number,
  a: number,
): number {
  // Numerical integration with 0.25" strips (matching quarter-inch grid)
  const nStrips = Math.max(1, Math.ceil(a / 0.25));
  const dy = a / nStrips;
  let area = 0;

  for (let i = 0; i < nStrips; i++) {
    const yMid = i * dy + dy / 2;
    const w = polygonWidthAtDepth(verts, yMid);
    area += w * dy;
  }

  return 0.85 * fc * area;
}

/**
 * Compute the centroid of the compression block within a polygon.
 * Returns the depth of the centroid from the top (y=0).
 */
export function polygonCompressionCentroid(
  verts: PolygonVertex[],
  a: number,
): number {
  const nStrips = Math.max(1, Math.ceil(a / 0.25));
  const dy = a / nStrips;
  let totalArea = 0;
  let moment = 0;

  for (let i = 0; i < nStrips; i++) {
    const yMid = i * dy + dy / 2;
    const w = polygonWidthAtDepth(verts, yMid);
    const dA = w * dy;
    totalArea += dA;
    moment += dA * yMid;
  }

  return totalArea > 0 ? moment / totalArea : a / 2;
}
