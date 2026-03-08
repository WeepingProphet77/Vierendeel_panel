/**
 * Post-processing utility to adjust frame analysis stresses
 * based on prestress precompression.
 *
 * Produces full MemberStresses objects so every consumer (tables, diagrams,
 * summary) automatically sees the adjusted values.
 */

import type {
  MemberStresses,
  FaceStress,
  AnalysisResults,
  SavedPrestressDesign,
} from '../types';

/**
 * Compute the precompressive stress (psi) at the extreme tension fiber
 * from a saved prestress design. Returns 0 if no design or no prestress force.
 *
 * Also returns the uniform axial precompression P/A (psi) which adds to
 * compressive stress everywhere.
 */
export function prestressPrecompression(design: SavedPrestressDesign): {
  tensionFiberPsi: number;  // P/A + P·e·yb/Ig  (reduces tension)
  axialPsi: number;         // P/A               (adds to compression)
} {
  const { result } = design;
  if (!result?.cracking) return { tensionFiberPsi: 0, axialPsi: 0 };

  const { P, e, sectionProps } = result.cracking;
  const { A, Ig, yb } = sectionProps;

  if (P <= 0 || A <= 0) return { tensionFiberPsi: 0, axialPsi: 0 };

  const axialPsi = (P * 1000) / A;
  const tensionFiberPsi = Math.max(0, axialPsi + (P * 1000 * e * yb) / Ig);

  return { tensionFiberPsi, axialPsi };
}

/** Adjust a single FaceStress for prestress precompression */
function adjustFace(
  face: FaceStress,
  tensionReliefPsi: number,
  compressionAddPsi: number,
): FaceStress {
  return {
    axialPsi: face.axialPsi,
    bendingPsi: face.bendingPsi,
    maxTensilePsi: Math.max(0, face.maxTensilePsi - tensionReliefPsi),
    maxCompressivePsi: face.maxCompressivePsi + compressionAddPsi,
  };
}

/** Determine status from adjusted governing stresses */
function computeStatus(
  tensilePsi: number,
  compressivePsi: number,
  fr: number,
  fcLimit: number,
): 'OK' | 'Cracked' | 'High Compression' {
  if (compressivePsi > fcLimit) return 'High Compression';
  if (tensilePsi > fr) return 'Cracked';
  return 'OK';
}

/**
 * Produce a fully adjusted MemberStresses from the raw frame stresses
 * and a saved prestress design. If no design exists for a member, the
 * original stresses are returned unchanged.
 */
export function adjustMemberStresses(
  raw: MemberStresses,
  design: SavedPrestressDesign | undefined,
  fr: number,
  fcLimit: number,
): MemberStresses {
  if (!design) return raw;

  const { tensionFiberPsi, axialPsi } = prestressPrecompression(design);
  if (tensionFiberPsi === 0 && axialPsi === 0) return raw;

  const startFace = adjustFace(raw.startFace, tensionFiberPsi, axialPsi);
  const endFace = adjustFace(raw.endFace, tensionFiberPsi, axialPsi);
  const maxSpan = adjustFace(raw.maxSpan, tensionFiberPsi, axialPsi);

  const governingTensilePsi = Math.max(
    startFace.maxTensilePsi,
    endFace.maxTensilePsi,
    maxSpan.maxTensilePsi,
  );
  const governingCompressivePsi = Math.max(
    startFace.maxCompressivePsi,
    endFace.maxCompressivePsi,
    maxSpan.maxCompressivePsi,
  );

  return {
    ...raw,
    startFace,
    endFace,
    maxSpan,
    governingTensilePsi,
    governingCompressivePsi,
    status: computeStatus(governingTensilePsi, governingCompressivePsi, fr, fcLimit),
  };
}

/**
 * Produce a full AnalysisResults with all member stresses adjusted for
 * any saved prestress designs, and with camber displacements superposed
 * onto the gravity displacements.
 */
export function applyPrestressToResults(
  results: AnalysisResults,
  designs: Record<number, SavedPrestressDesign>,
  fr: number,
  fcLimit: number,
  camberDisplacements: number[] | null,
  nodes: { id: number }[],
): AnalysisResults {
  // Short-circuit if no designs
  if (Object.keys(designs).length === 0) return results;

  // Superpose camber displacements onto gravity displacements
  let displacements = results.displacements;
  let maxDeflection = results.maxDeflection;

  if (camberDisplacements && camberDisplacements.length === displacements.length) {
    displacements = displacements.map((d, i) => d + camberDisplacements[i]);

    // Recompute max deflection from combined displacements
    let maxDefl = 0;
    let maxDeflNode = 0;
    const nodeIndex = new Map<number, number>();
    nodes.forEach((n, i) => nodeIndex.set(n.id, i));

    for (const node of nodes) {
      const ni = nodeIndex.get(node.id)! * 3;
      const dy = displacements[ni + 1]; // ft
      const dyIn = dy * 12; // inches
      if (Math.abs(dyIn) > Math.abs(maxDefl)) {
        maxDefl = dyIn;
        maxDeflNode = node.id;
      }
    }
    maxDeflection = { valueIn: maxDefl, nodeId: maxDeflNode };
  }

  return {
    ...results,
    displacements,
    maxDeflection,
    memberStresses: results.memberStresses.map(s =>
      adjustMemberStresses(s, designs[s.memberId], fr, fcLimit)
    ),
  };
}
