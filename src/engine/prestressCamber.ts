/**
 * Compute prestress camber displacements by superposition.
 *
 * For each prestressed member, equivalent nodal forces (axial compression +
 * eccentric moment) are assembled into a global load vector and solved using
 * the same frame stiffness matrix as the gravity analysis.  The resulting
 * displacement vector represents the upward camber from prestress and can be
 * added to the gravity displacements.
 */

import type { Node, Member, MaterialProperties, SavedPrestressDesign } from '../types';
import { solveForLoadVector, prestressEquivalentForces } from './analysis';

/**
 * Build a global load vector from all saved prestress designs,
 * solve for displacements, and return the camber displacement vector.
 *
 * Returns null if no prestress designs exist or if the solve fails.
 */
export function computePrestressCamber(
  nodes: Node[],
  members: Member[],
  material: MaterialProperties,
  designs: Record<number, SavedPrestressDesign>,
): number[] | null {
  const designEntries = Object.values(designs);
  if (designEntries.length === 0) return null;

  const nDof = nodes.length * 3;
  const F = Array(nDof).fill(0);

  const nodeIndex = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  for (const design of designEntries) {
    const member = members.find(m => m.id === design.memberId);
    if (!member) continue;

    const { cracking } = design.result;
    if (!cracking || cracking.P <= 0) continue;

    const startNode = nodes.find(n => n.id === member.startNodeId)!;
    const endNode = nodes.find(n => n.id === member.endNodeId)!;

    const feq = prestressEquivalentForces(
      member, startNode, endNode,
      cracking.P,  // kips
      cracking.e,  // in
    );

    const si = nodeIndex.get(member.startNodeId)! * 3;
    const ei = nodeIndex.get(member.endNodeId)! * 3;
    const dofMap = [si, si + 1, si + 2, ei, ei + 1, ei + 2];

    for (let i = 0; i < 6; i++) {
      F[dofMap[i]] += feq[i];
    }
  }

  return solveForLoadVector(nodes, members, material, F);
}
