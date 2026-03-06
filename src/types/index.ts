export interface PanelGeometry {
  widthFt: number;
  heightFt: number;
  defaultThicknessIn: number;
  numOpenings: number;
}

export interface Opening {
  widthFt: number;
  heightFt: number;
  centerXFt: number;
  centerYFt: number;
}

export interface Supports {
  leftXFt: number;
  rightXFt: number;
}

export interface MaterialProperties {
  unitWeightPcf: number;
  fcPsi: number;
  ePsi: number; // computed: 57000 * sqrt(f'c)
}

export interface Loading {
  glassWeightPsf: number;
  superimposedDeadLoadPsf: number;
}

export interface Node {
  id: number;
  x: number; // ft
  y: number; // ft
  restraints: { dx: boolean; dy: boolean; rz: boolean };
}

export interface Member {
  id: number;
  label: string;
  startNodeId: number;
  endNodeId: number;
  centerlineLengthFt: number;
  rigidOffsetStartFt: number;
  rigidOffsetEndFt: number;
  flexibleLengthFt: number;
  thicknessIn: number;
  thicknessOverridden: boolean;
  depthIn: number;
  areaIn2: number;
  inertiaIn4: number;
  orientation: 'horizontal' | 'vertical';
}

export interface FrameModel {
  nodes: Node[];
  members: Member[];
  validationErrors: string[];
  validationWarnings: string[];
}

export interface MemberForces {
  memberId: number;
  axialKips: number;
  shearStartFaceKips: number;
  shearEndFaceKips: number;
  momentStartFaceFtKips: number;
  momentEndFaceFtKips: number;
  /** Peak moment in flexible span (ft-kips) — may exceed face moments for members with UDL */
  maxMomentFtKips: number;
  /** Location of peak moment measured from start node (ft) */
  maxMomentLocationFt: number;
  /** Uniform transverse load on flexible span (kip/ft), for diagram interpolation */
  uniformLoadKipPerFt: number;
}

export interface FaceStress {
  axialPsi: number;
  bendingPsi: number;
  maxTensilePsi: number;
  maxCompressivePsi: number;
}

export interface MemberStresses {
  memberId: number;
  startFace: FaceStress;
  endFace: FaceStress;
  /** Peak stress at location of max moment in flexible span */
  maxSpan: FaceStress;
  /** Governing (worst-case) tensile and compressive stress across all locations */
  governingTensilePsi: number;
  governingCompressivePsi: number;
  status: 'OK' | 'Cracked' | 'High Compression';
}

export interface SupportReaction {
  nodeId: number;
  label: string;
  verticalKips: number;
  horizontalKips: number;
}

export interface AnalysisResults {
  displacements: number[]; // global DOF vector
  memberForces: MemberForces[];
  memberStresses: MemberStresses[];
  reactions: SupportReaction[];
  totalWeight: { selfWeight: number; glassWeight: number; superimposedWeight: number; total: number };
  equilibriumResidual: { verticalKips: number; momentFtKips: number };
  maxDeflection: { valueIn: number; nodeId: number };
}

export interface AppInputs {
  panel: PanelGeometry;
  openings: Opening[];
  supports: Supports;
  material: MaterialProperties;
  loading: Loading;
}
