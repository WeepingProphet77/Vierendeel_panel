/**
 * Post-processing utility to adjust frame analysis stresses
 * based on prestress precompression.
 */

import type { MemberStresses, MemberPrestressDesign } from '../types';

export interface AdjustedMemberStresses {
  memberId: number;
  frameStresses: MemberStresses;
  prestressPrecompression: number; // psi, positive = compression
  adjustedTensilePsi: number;
  adjustedCompressivePsi: number;
  adjustedStatus: 'OK' | 'Cracked' | 'High Compression';
}

export function computeAdjustedStresses(
  memberStresses: MemberStresses,
  prestressDesign: MemberPrestressDesign | undefined,
  fr: number,       // modulus of rupture, psi
  fc_limit: number  // 0.60·f'c, psi
): AdjustedMemberStresses {
  if (!prestressDesign?.result?.cracking) {
    return {
      memberId: memberStresses.memberId,
      frameStresses: memberStresses,
      prestressPrecompression: 0,
      adjustedTensilePsi: memberStresses.governingTensilePsi,
      adjustedCompressivePsi: memberStresses.governingCompressivePsi,
      adjustedStatus: memberStresses.status,
    };
  }

  const { P, e, sectionProps } = prestressDesign.result.cracking;
  const { A, Ig, yb } = sectionProps;

  // Precompressive stress at extreme tension fiber (psi)
  // P is in kips, convert to lbs; A in in², Ig in in⁴, e and yb in in
  const fpc = (P * 1000 / A) + (P * 1000 * e * yb / Ig);
  const precompPsi = Math.max(0, fpc);

  // Adjusted tensile stress: subtract precompression from frame tensile stress
  const adjustedTensile = Math.max(0, memberStresses.governingTensilePsi - precompPsi);

  // Adjusted compressive stress: prestress adds compression
  const adjustedCompressive = memberStresses.governingCompressivePsi + (P * 1000 / A);

  // Re-evaluate status
  let adjustedStatus: 'OK' | 'Cracked' | 'High Compression' = 'OK';
  if (adjustedTensile > fr) adjustedStatus = 'Cracked';
  if (adjustedCompressive > fc_limit) {
    adjustedStatus = 'High Compression';
  }

  return {
    memberId: memberStresses.memberId,
    frameStresses: memberStresses,
    prestressPrecompression: precompPsi,
    adjustedTensilePsi: adjustedTensile,
    adjustedCompressivePsi: adjustedCompressive,
    adjustedStatus,
  };
}
