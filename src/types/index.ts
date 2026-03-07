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

// ─── Prestress Design Types ─────────────────────────────────────────────────

export interface SteelPreset {
  id: string;
  name: string;
  description: string;
  category: 'mild' | 'prestressing';
  Es: number;       // ksi
  fpu: number;      // ksi
  fpy: number;      // ksi
  stressCap: number; // ksi -- fpy for mild, fpu for prestressing
  Q: number;
  R: number;
  K: number;
  defaultFse: number; // ksi
}

export interface SteelLayer {
  id: number;
  steelPresetId: string;
  area: number;       // in^2
  depth: number;      // in from extreme compression fiber
  fse: number;        // ksi, effective prestress (0 for mild steel)
  steel: SteelPreset; // resolved preset reference
}

export interface PrestressSectionInput {
  sectionType: 'rectangular' | 'tbeam' | 'doubletee' | 'hollowcore';
  bf: number;   // flange width, in
  bw: number;   // web width, in
  hf: number;   // flange depth, in
  h: number;    // total depth, in
  fc: number;   // f'c, ksi
  // Double tee parameters
  numStems?: number;
  stemWidth?: number;
  // Hollow core parameters
  numVoids?: number;
  voidDiameter?: number;
  voidCenterDepth?: number;
}

export interface PrestressDesignResult {
  c: number;           // neutral axis depth, in
  a: number;           // stress block depth, in
  beta1: number;
  Cc: number;          // concrete compression force, kips
  Mn: number;          // nominal moment, kip-in
  MnFt: number;        // nominal moment, kip-ft
  phi: number;         // strength reduction factor
  phiMn: number;       // design moment capacity, kip-in
  phiMnFt: number;     // design moment capacity, kip-ft
  epsilonT: number;    // net tensile strain
  cOverD: number;      // c/d ratio
  ductile: boolean;
  transition: boolean;
  layerResults: LayerResult[];
  cracking: CrackingResult;
}

export interface LayerResult {
  strain: number;
  stress: number;  // ksi
  force: number;   // kips
  depth: number;
  area: number;
  fse: number;
}

export interface CrackingResult {
  P: number;             // effective prestress force, kips
  fpc: number;           // average precompressive stress, ksi
  e: number;             // eccentricity, in
  fr: number;            // modulus of rupture, ksi
  Mcr: number;           // cracking moment, kip-in
  McrFt: number;         // cracking moment, kip-ft
  passesMinStrength: boolean;  // phiMn >= 1.2*Mcr
  sectionProps: { A: number; yCg: number; Ig: number; yb: number; Sb: number };
}

export interface MemberPrestressDesign {
  memberId: number;
  memberLabel: string;
  section: PrestressSectionInput;
  layers: SteelLayer[];
  result: PrestressDesignResult | null;
}

/** Persisted prestress design with computed summary fields for table display */
export interface SavedPrestressDesign {
  memberId: number;
  section: PrestressSectionInput;
  layers: SteelLayer[];
  result: PrestressDesignResult;
  Mu: number;          // kip-ft (factored moment demand)
  phiMnFt: number;     // kip-ft (design capacity)
  utilization: number;  // Mu / φMn
}
