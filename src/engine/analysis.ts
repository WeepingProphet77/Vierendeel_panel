import { multiply, transpose, inv, matrix } from 'mathjs';
import type { Matrix, MathCollection } from 'mathjs';
import type { Node, Member, Opening, MaterialProperties, Loading, PanelGeometry, AnalysisResults, MemberForces, MemberStresses, SupportReaction } from '../types';

function toArray2D(m: MathCollection): number[][] {
  return (m as Matrix).toArray() as number[][];
}

function toArray1D(m: MathCollection): number[] {
  return (m as Matrix).toArray() as number[];
}

function matMul(a: number[][], b: number[][]): number[][] {
  return toArray2D(multiply(matrix(a), matrix(b)));
}

function matMulVec(a: number[][], v: number[]): number[] {
  return toArray1D(multiply(matrix(a), matrix(v)));
}

function matTranspose(a: number[][]): number[][] {
  return toArray2D(transpose(matrix(a)));
}

function matInverse(a: number[][]): number[][] {
  return toArray2D(inv(matrix(a)));
}

/** Form the 6x6 stiffness matrix for a prismatic 2D frame element */
function flexibleStiffnessMatrix(E_ksf: number, A_ft2: number, I_ft4: number, Lf: number): number[][] {
  const EA_Lf = E_ksf * A_ft2 / Lf;
  const EI = E_ksf * I_ft4;
  const EI_Lf3 = EI / (Lf * Lf * Lf);
  const EI_Lf2 = EI / (Lf * Lf);
  const EI_Lf = EI / Lf;

  return [
    [EA_Lf,         0,              0,            -EA_Lf,        0,              0           ],
    [0,             12 * EI_Lf3,    6 * EI_Lf2,   0,            -12 * EI_Lf3,   6 * EI_Lf2 ],
    [0,             6 * EI_Lf2,     4 * EI_Lf,    0,            -6 * EI_Lf2,    2 * EI_Lf  ],
    [-EA_Lf,        0,              0,             EA_Lf,        0,              0           ],
    [0,             -12 * EI_Lf3,   -6 * EI_Lf2,  0,            12 * EI_Lf3,   -6 * EI_Lf2 ],
    [0,             6 * EI_Lf2,     2 * EI_Lf,    0,            -6 * EI_Lf2,    4 * EI_Lf  ],
  ];
}

/** Rigid offset transformation matrix */
function rigidOffsetTransform(a: number, b: number): number[][] {
  return [
    [1, 0, 0, 0, 0, 0],
    [0, 1, a, 0, 0, 0],
    [0, 0, 1, 0, 0, 0],
    [0, 0, 0, 1, 0, 0],
    [0, 0, 0, 0, 1, -b],
    [0, 0, 0, 0, 0, 1],
  ];
}

/** Rotation matrix for 2D frame element from local to global */
function rotationMatrix(angle: number): number[][] {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [
    [c,  s, 0, 0,  0, 0],
    [-s, c, 0, 0,  0, 0],
    [0,  0, 1, 0,  0, 0],
    [0,  0, 0, c,  s, 0],
    [0,  0, 0, -s, c, 0],
    [0,  0, 0, 0,  0, 1],
  ];
}

/** Get member angle from start node to end node */
function memberAngle(startNode: Node, endNode: Node): number {
  const dx = endNode.x - startNode.x;
  const dy = endNode.y - startNode.y;
  return Math.atan2(dy, dx);
}

/** Compute member local stiffness matrix with rigid offsets, in global coordinates */
function memberGlobalStiffness(member: Member, startNode: Node, endNode: Node, E_ksf: number): number[][] {
  const Lf = member.flexibleLengthFt;
  const A_ft2 = member.areaIn2 / 144;
  const I_ft4 = member.inertiaIn4 / 20736; // 12^4 = 20736

  const Kflex = flexibleStiffnessMatrix(E_ksf, A_ft2, I_ft4, Lf);
  const Trigid = rigidOffsetTransform(member.rigidOffsetStartFt, member.rigidOffsetEndFt);
  const TrigidT = matTranspose(Trigid);

  // K_local = T_rigid^T * K_flex * T_rigid
  const Klocal = matMul(TrigidT, matMul(Kflex, Trigid));

  const angle = memberAngle(startNode, endNode);
  const Trot = rotationMatrix(angle);
  const TrotT = matTranspose(Trot);

  // K_global = T_rot^T * K_local * T_rot
  return matMul(TrotT, matMul(Klocal, Trot));
}

interface LoadInfo {
  memberUniformLoadKipPerFt: number; // transverse load on flexible portion (local y, gravity projected)
  memberAxialLoadKipPerFt: number;   // axial load (local x, gravity projected)
}

/** Compute distributed loads on each member */
function computeMemberLoads(
  members: Member[],
  nodes: Node[],
  openings: Opening[],
  _panel: PanelGeometry,
  material: MaterialProperties,
  loading: Loading
): Map<number, LoadInfo> {
  const loads = new Map<number, LoadInfo>();
  const unitWeightKcf = material.unitWeightPcf / 1000; // kips per cubic foot

  for (const member of members) {
    const bFt = member.thicknessIn / 12;
    const dFt = member.depthIn / 12;

    if (member.orientation === 'horizontal') {
      // Self-weight: w = unit_weight * b * d (kcf * ft * ft = kip/ft)
      let w = unitWeightKcf * bFt * dFt;

      // Glass load: if this member is a header or sill for an opening
      const startNode = nodes.find(n => n.id === member.startNodeId)!;
      const endNode = nodes.find(n => n.id === member.endNodeId)!;
      const memberY = (startNode.y + endNode.y) / 2;
      const memberXStart = Math.min(startNode.x, endNode.x);
      const memberXEnd = Math.max(startNode.x, endNode.x);

      for (const o of openings) {
        const oBot = o.centerYFt - o.heightFt / 2;
        const oLeft = o.centerXFt - o.widthFt / 2;
        const oRight = o.centerXFt + o.widthFt / 2;

        // Check if this member is the header (above opening) or sill (below opening)
        // More robust: check if opening edges are within member span
        const openingWithinSpan = oLeft >= memberXStart - 0.01 && oRight <= memberXEnd + 0.01;

        // Check if this is the sill strip (immediately below the opening)
        const isBelowOpening = Math.abs(memberY - (oBot - dFt / 2)) < dFt;

        if (openingWithinSpan && isBelowOpening) {
          // Glass weight sits entirely on the sill (panel is vertical in service)
          const openingArea = o.widthFt * o.heightFt;
          const glassLoadKips = (loading.glassWeightPsf * openingArea) / 1000; // psf * ft² = lbs, /1000 = kips
          const flexSpan = member.flexibleLengthFt;
          if (flexSpan > 0) {
            w += glassLoadKips / flexSpan; // distribute as uniform load over flexible span
          }
        }
      }

      // Superimposed dead load - tributary area based on member depth
      if (loading.superimposedDeadLoadPsf > 0) {
        const tributaryWidth = dFt; // depth of the strip = tributary width
        const sdlKipPerFt = (loading.superimposedDeadLoadPsf / 1000) * tributaryWidth;
        w += sdlKipPerFt;
      }

      loads.set(member.id, { memberUniformLoadKipPerFt: w, memberAxialLoadKipPerFt: 0 });
    } else {
      // Vertical member: self-weight acts as axial load
      const w = unitWeightKcf * bFt * dFt; // kip/ft (distributed axial)

      // Superimposed dead load on vertical members
      let sdl = 0;
      if (loading.superimposedDeadLoadPsf > 0) {
        const tributaryWidth = dFt;
        sdl = (loading.superimposedDeadLoadPsf / 1000) * tributaryWidth;
      }

      loads.set(member.id, { memberUniformLoadKipPerFt: 0, memberAxialLoadKipPerFt: w + sdl });
    }
  }

  return loads;
}

/** Compute fixed-end forces for uniform load on flexible span, transformed to node DOFs */
function fixedEndForces(
  member: Member,
  startNode: Node,
  endNode: Node,
  loadInfo: LoadInfo,
  unitWeightKcf: number
): number[] {
  const w = loadInfo.memberUniformLoadKipPerFt; // transverse load on flexible portion
  const Lf = member.flexibleLengthFt;
  const a = member.rigidOffsetStartFt;
  const b = member.rigidOffsetEndFt;

  // Fixed-end forces on the flexible segment (in local coordinates)
  // For uniform load w on span Lf:
  // V_start = wLf/2, V_end = wLf/2
  // M_start = wLf²/12, M_end = -wLf²/12
  // Note: positive shear is in +y local direction (downward load gives negative local y forces)
  // For gravity loading on a horizontal member (angle=0), gravity is -y, so load is -w

  let f_flex: number[];

  if (member.orientation === 'horizontal') {
    // Transverse load in local -y direction (gravity)
    const wLf = w * Lf;
    const wLf2_12 = w * Lf * Lf / 12;

    // Fixed-end forces (reactions at fixed ends, opposing the load):
    // At start of flexible segment: Fy = wLf/2 (upward), M = wLf²/12 (CCW)
    // At end of flexible segment: Fy = wLf/2 (upward), M = -wLf²/12 (CW)
    f_flex = [
      0,             // axial at start
      wLf / 2,       // shear at start (upward reaction)
      wLf2_12,       // moment at start
      0,             // axial at end
      wLf / 2,       // shear at end (upward reaction)
      -wLf2_12,      // moment at end
    ];

    // Transform to node positions using rigid offset transformation
    // f_node = T_rigid^T * f_flex
    const Trigid = rigidOffsetTransform(a, b);
    const TrigidT = matTranspose(Trigid);
    f_flex = matMulVec(TrigidT, f_flex);

    // Add weight of rigid end zones as point loads at nodes
    const bFt = member.thicknessIn / 12;
    const dFt = member.depthIn / 12;
    const rigidWeightStart = unitWeightKcf * bFt * dFt * a; // kips
    const rigidWeightEnd = unitWeightKcf * bFt * dFt * b;
    f_flex[1] += rigidWeightStart; // upward reaction for start rigid zone weight
    f_flex[4] += rigidWeightEnd;   // upward reaction for end rigid zone weight

    // Now transform to global coordinates
    const angle = memberAngle(startNode, endNode);
    const Trot = rotationMatrix(angle);
    const TrotT = matTranspose(Trot);
    f_flex = matMulVec(TrotT, f_flex);

    // The fixed-end forces computed above are the REACTIONS (upward).
    // The equivalent nodal load vector should be the APPLIED loads (downward).
    // Actually, the FEF goes into the load vector as-is because we compute:
    // F_applied = -FEF (we want the negative of fixed-end reactions as applied loads)
    // No wait - standard approach: load vector = applied nodal loads + equivalent nodal loads
    // Equivalent nodal loads = the forces the distributed load would apply at the nodes
    // = same direction as the load
    // FEF (reactions) oppose the load, so equivalent nodal loads = -FEF? No...
    //
    // Actually, in the direct stiffness method:
    // Total member end forces = K*d + FEF
    // K*d = F_applied - FEF  =>  F = F_applied + FEF  but that's wrong too.
    //
    // Let me be precise:
    // [K]{d} = {F_nodal} where {F_nodal} = {F_applied_at_nodes} + {F_equivalent}
    // {F_equivalent} are the equivalent nodal forces from the distributed loads
    // These are equal in magnitude to the fixed-end REACTIONS, acting in the direction of the load
    // So for downward gravity: equivalent nodal forces are downward (negative y in global)
    //
    // Wait, fixed-end reactions for a downward UDL are upward. The equivalent nodal loads
    // for the global system are the NEGATIVE of the fixed-end reactions (because we transfer
    // the distributed load to the nodes, same direction as the actual load).
    //
    // Actually no. Let me reconsider. The standard formulation is:
    // For a member with distributed loads, the equivalent nodal force vector F_eq
    // is computed such that the work done by F_eq through virtual node displacements
    // equals the work done by the distributed loads. For a UDL of w (downward) on a
    // simply supported beam, the equivalent nodal forces are wL/2 downward at each end.
    // But for fixed-end conditions, the FEFs include moments too.
    //
    // The CORRECT approach: equivalent nodal forces in the global system = the nodal forces
    // that the distributed load produces at the nodes when the nodes are FREE. These are
    // computed as the NEGATIVE of the fixed-end forces.
    // Wait no - fixed-end forces ARE the reactions when nodes are fixed. To get equivalent
    // nodal loads for the stiffness equation, we use:
    // {F_eq} = - {FEF}  (negative of fixed-end forces/reactions)
    // because we want the applied equivalent loads, not the reactions.
    //
    // Let me reconsider one more time with a simple example:
    // Fixed-fixed beam, UDL w downward.
    // FEF at each end: V = wL/2 (upward), M = wL²/12 (start) and -wL²/12 (end)
    // These are REACTIONS. In the global equation:
    // [K]{d} = {F_applied} - {FEF}  ... no.
    //
    // The standard approach in structural analysis texts:
    // [K]{d} = {F} where {F} = {F_concentrated_at_nodes} + {F_equivalent_from_member_loads}
    // And {F_equivalent_from_member_loads} = negative of fixed-end forces
    // So the sign is: we SUBTRACT the fixed-end reactions from the load vector if we
    // define FEF as reactions. OR: we add the equivalent nodal loads which are in the
    // same direction as the actual loads.
    //
    // I'll use the convention where FEF = reactions at fixed ends (upward for gravity),
    // and the equivalent nodal loads = {F_eq} = {FEF} with reversed sign for moments
    // but SAME sign for forces... Actually this is getting confused.
    //
    // Let me just use the standard textbook approach:
    // The global load vector gets contributions from equivalent nodal loads.
    // For a horizontal member with downward UDL w:
    // Equivalent nodal forces (in global coords) are:
    //   Start node: Fy = -wLf/2 (downward), Mz = -wLf²/12
    //   End node:   Fy = -wLf/2 (downward), Mz = +wLf²/12
    // Then member end forces = K*d + FEF_local (where FEF is upward reactions)

    // I computed f_flex as the upward reactions (positive y = upward in local).
    // The equivalent nodal loads for the global stiffness equation are the NEGATIVE:
    for (let i = 0; i < 6; i++) f_flex[i] = -f_flex[i];
  } else {
    // Vertical member: axial gravity load
    // Self-weight acts as distributed axial load (downward)
    const wAxial = loadInfo.memberAxialLoadKipPerFt; // kip/ft downward
    const L = member.centerlineLengthFt;

    // For vertical members, the total weight is distributed along the length
    // Equivalent nodal forces: each node gets half the total weight, acting downward
    const totalWeight = wAxial * L; // kips

    // In global coordinates: Fy is negative (downward)
    f_flex = [
      0, -totalWeight / 2, 0,  // start node: Fx, Fy, Mz
      0, -totalWeight / 2, 0,  // end node: Fx, Fy, Mz
    ];
  }

  return f_flex;
}

/**
 * Compute the equivalent global nodal forces for a prestress tendon on a member.
 * The tendon at constant eccentricity e below the centroid with force P creates:
 *   - Axial compression P
 *   - Constant moment -P*e (hogging → upward camber)
 *
 * Returns a 6-element vector [Fx_start, Fy_start, Mz_start, Fx_end, Fy_end, Mz_end]
 * in global coordinates, to be assembled into the global load vector.
 */
export function prestressEquivalentForces(
  member: Member,
  startNode: Node,
  endNode: Node,
  P_kips: number,
  e_in: number,
): number[] {
  // Convert to consistent units (kips, ft)
  const P = P_kips;        // kips
  const e_ft = e_in / 12;  // eccentricity in ft

  // Local flexible-portion equivalent forces:
  // Axial: +P at start (rightward into member), -P at end (leftward into member) → compression
  // Moment: -P*e at start, +P*e at end → constant hogging moment throughout
  const f_flex = [P, 0, -P * e_ft, -P, 0, P * e_ft];

  // Transform through rigid offsets to node positions
  const Trigid = rigidOffsetTransform(member.rigidOffsetStartFt, member.rigidOffsetEndFt);
  const TrigidT = matTranspose(Trigid);
  const f_node = matMulVec(TrigidT, f_flex);

  // Rotate to global coordinates
  const angle = memberAngle(startNode, endNode);
  const Trot = rotationMatrix(angle);
  const TrotT = matTranspose(Trot);
  return matMulVec(TrotT, f_node);
}

/**
 * Assemble the global stiffness matrix and solve for an arbitrary load vector.
 * Returns the displacement vector, or null if the solve fails.
 * Used by the prestress camber calculation to superpose prestress effects.
 */
export function solveForLoadVector(
  nodes: Node[],
  members: Member[],
  material: MaterialProperties,
  F_input: number[],
): number[] | null {
  const nDof = nodes.length * 3;
  const E_psi = material.ePsi;
  const E_ksf = E_psi * 144 / 1000;

  const K: number[][] = Array.from({ length: nDof }, () => Array(nDof).fill(0));
  const nodeIndex = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  for (const member of members) {
    const startNode = nodes.find(n => n.id === member.startNodeId)!;
    const endNode = nodes.find(n => n.id === member.endNodeId)!;
    const Kg = memberGlobalStiffness(member, startNode, endNode, E_ksf);
    const si = nodeIndex.get(member.startNodeId)! * 3;
    const ei = nodeIndex.get(member.endNodeId)! * 3;
    const dofMap = [si, si + 1, si + 2, ei, ei + 1, ei + 2];
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K[dofMap[i]][dofMap[j]] += Kg[i][j];
      }
    }
  }

  // Apply boundary conditions
  const restrainedDofs: number[] = [];
  for (const node of nodes) {
    const ni = nodeIndex.get(node.id)! * 3;
    if (node.restraints.dx) restrainedDofs.push(ni);
    if (node.restraints.dy) restrainedDofs.push(ni + 1);
    if (node.restraints.rz) restrainedDofs.push(ni + 2);
  }

  const F = [...F_input];
  for (const dof of restrainedDofs) {
    for (let i = 0; i < nDof; i++) {
      K[dof][i] = 0;
      K[i][dof] = 0;
    }
    K[dof][dof] = 1;
    F[dof] = 0;
  }

  try {
    const Kinv = matInverse(K);
    return matMulVec(Kinv, F);
  } catch {
    return null;
  }
}

export function runAnalysis(
  nodes: Node[],
  members: Member[],
  openings: Opening[],
  panel: PanelGeometry,
  material: MaterialProperties,
  loading: Loading
): AnalysisResults | { error: string } {
  const nDof = nodes.length * 3;
  const E_psi = material.ePsi;
  const E_ksf = E_psi * 144 / 1000; // psi to ksf: psi * 144 in²/ft² / 1000 lb/kip
  const unitWeightKcf = material.unitWeightPcf / 1000;

  // Initialize global stiffness matrix and load vector
  const K: number[][] = Array.from({ length: nDof }, () => Array(nDof).fill(0));
  const F: number[] = Array(nDof).fill(0);

  // DOF mapping: node i -> DOFs [3*i, 3*i+1, 3*i+2] = [dx, dy, rz]
  const nodeIndex = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  // Assemble global stiffness matrix
  for (const member of members) {
    const startNode = nodes.find(n => n.id === member.startNodeId)!;
    const endNode = nodes.find(n => n.id === member.endNodeId)!;

    const Kg = memberGlobalStiffness(member, startNode, endNode, E_ksf);

    const si = nodeIndex.get(member.startNodeId)! * 3;
    const ei = nodeIndex.get(member.endNodeId)! * 3;
    const dofMap = [si, si + 1, si + 2, ei, ei + 1, ei + 2];

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        K[dofMap[i]][dofMap[j]] += Kg[i][j];
      }
    }
  }

  // Compute member loads and assemble load vector
  const memberLoads = computeMemberLoads(members, nodes, openings, panel, material, loading);

  for (const member of members) {
    const startNode = nodes.find(n => n.id === member.startNodeId)!;
    const endNode = nodes.find(n => n.id === member.endNodeId)!;
    const loadInfo = memberLoads.get(member.id)!;

    const feq = fixedEndForces(member, startNode, endNode, loadInfo, unitWeightKcf);

    const si = nodeIndex.get(member.startNodeId)! * 3;
    const ei = nodeIndex.get(member.endNodeId)! * 3;
    const dofMap = [si, si + 1, si + 2, ei, ei + 1, ei + 2];

    for (let i = 0; i < 6; i++) {
      F[dofMap[i]] += feq[i];
    }
  }

  // Store load vector before applying BCs (for reaction computation)
  const F_applied = [...F];

  // Apply boundary conditions
  const restrainedDofs: number[] = [];
  for (const node of nodes) {
    const ni = nodeIndex.get(node.id)! * 3;
    if (node.restraints.dx) restrainedDofs.push(ni);
    if (node.restraints.dy) restrainedDofs.push(ni + 1);
    if (node.restraints.rz) restrainedDofs.push(ni + 2);
  }

  // Save original K diagonal for restoring
  const K_full = K.map(row => [...row]);

  for (const dof of restrainedDofs) {
    for (let i = 0; i < nDof; i++) {
      K[dof][i] = 0;
      K[i][dof] = 0;
    }
    K[dof][dof] = 1;
    F[dof] = 0;
  }

  // Check for singularity (very basic check)
  let hasProblem = false;
  for (let i = 0; i < nDof; i++) {
    if (Math.abs(K[i][i]) < 1e-20) {
      hasProblem = true;
      break;
    }
  }
  if (hasProblem) {
    return { error: 'Global stiffness matrix appears singular. Check model connectivity and support conditions.' };
  }

  // Solve: d = K^-1 * F
  let displacements: number[];
  try {
    const Kinv = matInverse(K);
    displacements = matMulVec(Kinv, F);
  } catch {
    return { error: 'Failed to solve stiffness equations. Matrix may be singular.' };
  }

  // Compute reactions: R = K_full * d - F_applied
  const reactions_full = matMulVec(K_full, displacements);

  // Member force recovery
  const memberForces: MemberForces[] = [];
  const memberStresses: MemberStresses[] = [];
  const fr = 7.5 * Math.sqrt(material.fcPsi); // modulus of rupture
  const fc_limit = 0.60 * material.fcPsi;

  for (const member of members) {
    const startNode = nodes.find(n => n.id === member.startNodeId)!;
    const endNode = nodes.find(n => n.id === member.endNodeId)!;

    const si = nodeIndex.get(member.startNodeId)! * 3;
    const ei = nodeIndex.get(member.endNodeId)! * 3;

    // Global displacements at member nodes
    const d_global = [
      displacements[si], displacements[si + 1], displacements[si + 2],
      displacements[ei], displacements[ei + 1], displacements[ei + 2],
    ];

    // Transform to local coordinates
    const angle = memberAngle(startNode, endNode);
    const Trot = rotationMatrix(angle);
    const d_local = matMulVec(Trot, d_global);

    // Local stiffness with offsets
    const Lf = member.flexibleLengthFt;
    const A_ft2 = member.areaIn2 / 144;
    const I_ft4 = member.inertiaIn4 / 20736;

    const Kflex = flexibleStiffnessMatrix(E_ksf, A_ft2, I_ft4, Lf);
    const Trigid = rigidOffsetTransform(member.rigidOffsetStartFt, member.rigidOffsetEndFt);
    const TrigidT = matTranspose(Trigid);
    const Klocal = matMul(TrigidT, matMul(Kflex, Trigid));

    // Member end forces at nodes (local coords)
    const f_elastic = matMulVec(Klocal, d_local);

    // Add fixed-end forces (in local coordinates) to get total member forces
    // Total member end forces = K_local * d_local + FEF_local
    const loadInfo = memberLoads.get(member.id)!;
    const w = loadInfo.memberUniformLoadKipPerFt;
    const a_off = member.rigidOffsetStartFt;
    const b_off = member.rigidOffsetEndFt;

    let fef_local = [0, 0, 0, 0, 0, 0];
    if (member.orientation === 'horizontal' && Math.abs(w) > 1e-12) {
      // FEF for flexible portion
      const wLf = w * Lf;
      const wLf2_12 = w * Lf * Lf / 12;
      const fef_flex = [0, wLf / 2, wLf2_12, 0, wLf / 2, -wLf2_12];
      fef_local = matMulVec(TrigidT, fef_flex);

      // Add rigid zone weight
      const bFt = member.thicknessIn / 12;
      const dFt = member.depthIn / 12;
      fef_local[1] += unitWeightKcf * bFt * dFt * a_off;
      fef_local[4] += unitWeightKcf * bFt * dFt * b_off;
    }

    // Total member end forces (local)
    const f_total = f_elastic.map((v, i) => v + fef_local[i]);

    // DEBUG: print f_total, f_elastic, fef_local, d_local for first 2 members
    if (member.id <= 2) {
      console.log(`\n=== DEBUG Member ${member.id} ===`);
      console.log(`  d_local:   [${d_local.map(v => v.toFixed(8)).join(', ')}]`);
      console.log(`  f_elastic: [${f_elastic.map(v => v.toFixed(6)).join(', ')}]`);
      console.log(`  fef_local: [${fef_local.map(v => v.toFixed(6)).join(', ')}]`);
      console.log(`  f_total:   [${f_total.map(v => v.toFixed(6)).join(', ')}]`);
    }

    // f_total: [Axial_start, Shear_start, Moment_start, Axial_end, Shear_end, Moment_end]
    // Convention: positive axial = tension, positive shear = +y local, positive moment = CCW

    // Forces at node centerlines
    const P_start = f_total[0]; // axial at start node (tension +)
    const V_start = f_total[1]; // shear at start node (includes lumped rigid zone weight)
    const M_start = f_total[2]; // moment at start node (ft-kips)

    // Forces at face of joint (critical section)
    //
    // The rigid zone weights were lumped to the nodes in the FEF. When recovering
    // internal forces, we must account for this: the internal shear at the start face
    // is the node shear MINUS the lumped rigid zone weight (which is a concentrated
    // downward load at the node, on the node side of the face cut).
    //
    // Free body of start rigid zone (node to face):
    //   V_start (upward, from stiffness) - a_weight (downward, lumped load) = V_face_start
    //   M_face_start = M_start + V_face_start * a_off
    //
    // For the end face, derive from equilibrium of the flexible span to ensure
    // the parabolic moment distribution is consistent:
    //   V_face_end = V_face_start - w * Lf
    //   M_face_end = M_face_start + V_face_start * Lf - w * Lf^2 / 2

    let V_face_start: number;
    let M_face_start: number;
    let V_face_end: number;
    let M_face_end: number;

    if (member.orientation === 'horizontal') {
      const bFt = member.thicknessIn / 12;
      const dFt = member.depthIn / 12;
      const a_weight = unitWeightKcf * bFt * dFt * a_off;

      V_face_start = V_start - a_weight;
      M_face_start = M_start + V_face_start * a_off;

      // End face from equilibrium of flexible span
      V_face_end = V_face_start - w * Lf;
      M_face_end = M_face_start + V_face_start * Lf - w * Lf * Lf / 2;
    } else {
      // Vertical members: no transverse UDL, no rigid zone weight issue
      V_face_start = V_start;
      M_face_start = M_start + V_start * a_off;
      V_face_end = f_total[4];
      M_face_end = f_total[5] - f_total[4] * b_off;
    }

    // Compute peak moment in the flexible span for horizontal members with UDL.
    // The moment is parabolic: M(x_flex) = M_face_start + V_face_start * x_flex - w * x_flex^2 / 2
    // Peak occurs where dM/dx = 0 => x_flex = V_face_start / w (if V changes sign in the span)
    let maxMomentFtKips: number;
    let maxMomentLocationFt: number;

    if (member.orientation === 'horizontal' && Math.abs(w) > 1e-12) {
      const x_peak_flex = V_face_start / w; // distance from start face where V = 0
      if (x_peak_flex > 0 && x_peak_flex < Lf) {
        // Peak is within the flexible span
        const M_peak = M_face_start + V_face_start * x_peak_flex - w * x_peak_flex * x_peak_flex / 2;
        // Compare with face moments to find the true max
        const moments = [
          { m: M_face_start, loc: a_off },
          { m: M_face_end, loc: a_off + Lf },
          { m: M_peak, loc: a_off + x_peak_flex },
        ];
        const governing = moments.reduce((best, cur) =>
          Math.abs(cur.m) > Math.abs(best.m) ? cur : best
        );
        maxMomentFtKips = governing.m;
        maxMomentLocationFt = governing.loc;
      } else {
        // Peak is outside the span — max is at one of the faces
        if (Math.abs(M_face_start) >= Math.abs(M_face_end)) {
          maxMomentFtKips = M_face_start;
          maxMomentLocationFt = a_off;
        } else {
          maxMomentFtKips = M_face_end;
          maxMomentLocationFt = a_off + Lf;
        }
      }
    } else {
      // No UDL — moment is linear, max is at a face
      if (Math.abs(M_face_start) >= Math.abs(M_face_end)) {
        maxMomentFtKips = M_face_start;
        maxMomentLocationFt = a_off;
      } else {
        maxMomentFtKips = M_face_end;
        maxMomentLocationFt = a_off + Lf;
      }
    }

    memberForces.push({
      memberId: member.id,
      axialKips: P_start,
      shearStartFaceKips: V_face_start,
      shearEndFaceKips: V_face_end,
      momentStartFaceFtKips: M_face_start,
      momentEndFaceFtKips: M_face_end,
      maxMomentFtKips,
      maxMomentLocationFt,
      uniformLoadKipPerFt: w,
    });

    // Stress calculations
    const A = member.areaIn2;
    const I = member.inertiaIn4;
    const c = member.depthIn / 2; // distance to extreme fiber

    const axialStressPsi = (P_start * 1000) / A; // kips to lbs, then / in²

    // Helper: compute extreme fiber stresses at a given moment.
    // Combined stress = P/A ± Mc/I. The max tensile and compressive stresses
    // occur on opposite fibers. The sign of M determines which fiber is which,
    // but the MAGNITUDES of the peak stresses are independent of moment sign.
    function computeFaceStress(M_ftKips: number) {
      const M_kipIn = M_ftKips * 12; // ft-kips → kip-in
      const bendingPsi = (Math.abs(M_kipIn) * c / I) * 1000; // ksi → psi
      // Max tensile on extreme fiber: axial tension + bending tension
      const maxTensilePsi = axialStressPsi + bendingPsi;
      // Max compressive on opposite fiber: bending compression - axial tension
      const maxCompressivePsi = bendingPsi - axialStressPsi;
      return {
        axialPsi: axialStressPsi,
        bendingPsi,
        maxTensilePsi,
        maxCompressivePsi,
      };
    }

    const startFace = computeFaceStress(M_face_start);
    const endFace = computeFaceStress(M_face_end);
    const maxSpan = computeFaceStress(maxMomentFtKips);

    // Governing stresses across all critical sections
    const governingTensilePsi = Math.max(startFace.maxTensilePsi, endFace.maxTensilePsi, maxSpan.maxTensilePsi);
    const governingCompressivePsi = Math.max(startFace.maxCompressivePsi, endFace.maxCompressivePsi, maxSpan.maxCompressivePsi);

    let status: 'OK' | 'Cracked' | 'High Compression' = 'OK';
    if (governingTensilePsi > fr) status = 'Cracked';
    if (governingCompressivePsi > fc_limit) status = 'High Compression';

    memberStresses.push({
      memberId: member.id,
      startFace,
      endFace,
      maxSpan,
      governingTensilePsi,
      governingCompressivePsi,
      status,
    });
  }

  // Support reactions
  const supportReactions: SupportReaction[] = [];
  for (const node of nodes) {
    if (node.restraints.dx || node.restraints.dy) {
      const ni = nodeIndex.get(node.id)! * 3;
      const isLeft = node.restraints.dx;
      supportReactions.push({
        nodeId: node.id,
        label: isLeft ? 'Left Support (Pin)' : 'Right Support (Roller)',
        horizontalKips: node.restraints.dx ? reactions_full[ni] - F_applied[ni] : 0,
        verticalKips: node.restraints.dy ? reactions_full[ni + 1] - F_applied[ni + 1] : 0,
      });
    }
  }

  // Total weights
  let totalSelfWeight = 0;
  let totalGlassWeight = 0;
  let totalSuperimposed = 0;

  // Self-weight: sum of all member weights (including rigid zones)
  for (const member of members) {
    const bFt = member.thicknessIn / 12;
    const dFt = member.depthIn / 12;
    const weight = unitWeightKcf * bFt * dFt * member.centerlineLengthFt;
    totalSelfWeight += weight;
  }

  // Glass weight
  for (const o of openings) {
    totalGlassWeight += (loading.glassWeightPsf / 1000) * o.widthFt * o.heightFt;
  }

  // Superimposed dead load
  totalSuperimposed = (loading.superimposedDeadLoadPsf / 1000) * panel.widthFt * panel.heightFt;

  const totalWeight = totalSelfWeight + totalGlassWeight + totalSuperimposed;

  // Equilibrium check
  const totalVerticalReaction = supportReactions.reduce((sum, r) => sum + r.verticalKips, 0);
  // Actually reactions should be positive (upward). Let me check...
  // The F vector has downward loads (negative Fy). Reactions = K*d - F = upward forces at supports.
  // So totalVerticalReaction should be approximately equal to totalWeight in magnitude.
  // residual = totalVerticalReaction - totalWeight (should be near 0)
  // But our reaction calculation: R = K_full * d - F_applied. The F_applied has negative values for gravity.
  // So R at a support with dy restrained would be positive (upward) to balance the negative (downward) loads.
  // Wait, I need to be more careful. R_i = sum_j(K_full_ij * d_j) - F_applied_i
  // For a support DOF that's restrained, d_i = 0, and the reaction is the force needed.

  // Let me just compute residual differently: sum of all vertical reactions + sum of all applied vertical loads
  // If applied loads are negative (downward), and reactions are positive (upward), sum should be ~0
  const appliedVertical = F_applied.filter((_, i) => i % 3 === 1).reduce((s, v) => s + v, 0);
  const equilibriumVertical = totalVerticalReaction + appliedVertical;

  // Moment equilibrium about the left support node
  // Mirror the vertical residual pattern: totalReactionMoment + appliedMoment ≈ 0
  const refNode = nodes.find(n => n.restraints.dx)!;
  const refX = refNode.x;
  const refY = refNode.y;

  // Sum of reaction moments (only at restrained DOFs)
  let totalReactionMoment = 0;
  for (const node of nodes) {
    const ni = nodeIndex.get(node.id)! * 3;
    const armX = node.x - refX;
    const armY = node.y - refY;
    const rH = node.restraints.dx ? reactions_full[ni] - F_applied[ni] : 0;
    const rV = node.restraints.dy ? reactions_full[ni + 1] - F_applied[ni + 1] : 0;
    const rM = node.restraints.rz ? reactions_full[ni + 2] - F_applied[ni + 2] : 0;
    totalReactionMoment += -rH * armY + rV * armX + rM;
  }

  // Sum of applied load moments (all DOFs)
  let appliedMoment = 0;
  for (const node of nodes) {
    const ni = nodeIndex.get(node.id)! * 3;
    const armX = node.x - refX;
    const armY = node.y - refY;
    appliedMoment += -F_applied[ni] * armY + F_applied[ni + 1] * armX + F_applied[ni + 2];
  }

  const momentResidual = totalReactionMoment + appliedMoment;

  // Maximum deflection
  let maxDefl = 0;
  let maxDeflNode = 0;
  for (const node of nodes) {
    const ni = nodeIndex.get(node.id)! * 3;
    const dy = displacements[ni + 1]; // ft
    const dyIn = dy * 12; // inches
    if (Math.abs(dyIn) > Math.abs(maxDefl)) {
      maxDefl = dyIn;
      maxDeflNode = node.id;
    }
  }

  return {
    displacements,
    memberForces,
    memberStresses,
    reactions: supportReactions,
    totalWeight: {
      selfWeight: totalSelfWeight,
      glassWeight: totalGlassWeight,
      superimposedWeight: totalSuperimposed,
      total: totalWeight,
    },
    equilibriumResidual: {
      verticalKips: equilibriumVertical,
      momentFtKips: momentResidual,
    },
    maxDeflection: { valueIn: maxDefl, nodeId: maxDeflNode },
  };
}
