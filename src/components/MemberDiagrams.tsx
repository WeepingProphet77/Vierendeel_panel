import { useMemo } from 'react';
import type { Member, MemberForces, MemberStresses, MaterialProperties } from '../types';

interface Props {
  member: Member;
  forces: MemberForces;
  stresses: MemberStresses;
  material: MaterialProperties;
}

interface DiagramPoint {
  x: number;      // position along member (ft), 0 = start node
  value: number;   // force or stress value
}

/** Sample force/stress values along the member length */
function computeDiagramData(member: Member, forces: MemberForces) {
  const a = member.rigidOffsetStartFt;
  const b = member.rigidOffsetEndFt;
  const Lf = member.flexibleLengthFt;
  const L = member.centerlineLengthFt;
  const w = forces.uniformLoadKipPerFt;

  // Reconstruct node forces from face forces
  const V_start_node = forces.shearStartFaceKips;
  const M_start_node = forces.momentStartFaceFtKips - forces.shearStartFaceKips * a;
  const V_end_node = forces.shearEndFaceKips;
  const M_end_node = forces.momentEndFaceFtKips - forces.shearEndFaceKips * b;

  const V_face_start = forces.shearStartFaceKips;
  const M_face_start = forces.momentStartFaceFtKips;
  const P = forces.axialKips;

  const nFlex = 30; // sample points in flexible span

  // --- Axial ---
  const axial: DiagramPoint[] = [
    { x: 0, value: P },
    { x: L, value: P },
  ];

  // --- Shear ---
  const shear: DiagramPoint[] = [];
  // Start rigid zone: V is constant
  shear.push({ x: 0, value: V_start_node });
  shear.push({ x: a, value: V_start_node });
  // Flexible span: V(x) = V_face_start - w * x_flex
  if (member.orientation === 'horizontal' && Math.abs(w) > 1e-12) {
    for (let i = 0; i <= nFlex; i++) {
      const xf = (i / nFlex) * Lf;
      shear.push({ x: a + xf, value: V_face_start - w * xf });
    }
  } else {
    // Constant shear in flexible span
    shear.push({ x: a, value: V_face_start });
    shear.push({ x: a + Lf, value: V_face_start });
  }
  // End rigid zone: V is constant
  shear.push({ x: L - b, value: V_end_node });
  shear.push({ x: L, value: V_end_node });

  // --- Moment ---
  const moment: DiagramPoint[] = [];
  // Start rigid zone: M varies linearly
  moment.push({ x: 0, value: M_start_node });
  moment.push({ x: a, value: M_face_start });
  // Flexible span: M(x) = M_face_start + V_face_start * x_flex - w * x_flex^2 / 2
  if (member.orientation === 'horizontal' && Math.abs(w) > 1e-12) {
    for (let i = 0; i <= nFlex; i++) {
      const xf = (i / nFlex) * Lf;
      const M = M_face_start + V_face_start * xf - w * xf * xf / 2;
      moment.push({ x: a + xf, value: M });
    }
  } else {
    // Linear moment
    moment.push({ x: a, value: M_face_start });
    moment.push({ x: a + Lf, value: forces.momentEndFaceFtKips });
  }
  // End rigid zone: M varies linearly
  moment.push({ x: L - b, value: forces.momentEndFaceFtKips });
  moment.push({ x: L, value: M_end_node });

  return { axial, shear, moment };
}

/** Compute combined stress diagram (tension and compression at extreme fibers) */
function computeStressDiagram(
  member: Member, forces: MemberForces,
  momentPts: DiagramPoint[]
) {
  const A = member.areaIn2;
  const I = member.inertiaIn4;
  const c = member.depthIn / 2;
  const P = forces.axialKips;
  const axialStressPsi = (P * 1000) / A; // kips → lbs, / in²

  const tensionFiber: DiagramPoint[] = [];
  const compressionFiber: DiagramPoint[] = [];

  for (const pt of momentPts) {
    const M_kipIn = pt.value * 12; // ft-kips → kip-in
    const bendingPsi = (Math.abs(M_kipIn) * c / I) * 1000; // ksi → psi
    // Sign of bending: if M > 0, bottom fiber is in tension (for a horizontal beam with +y up)
    // For diagrams, show as ± from the member axis
    const sign = M_kipIn >= 0 ? 1 : -1;
    tensionFiber.push({ x: pt.x, value: axialStressPsi + sign * bendingPsi });
    compressionFiber.push({ x: pt.x, value: axialStressPsi - sign * bendingPsi });
  }

  return { tensionFiber, compressionFiber };
}

// Colors
const RIGID_FILL = 'var(--border)';
const POS_COLOR = '#4a9eff';
const NEG_COLOR = '#ff6644';
const TENSION_COLOR = '#ff6644';
const COMPRESSION_COLOR = '#4a9eff';
const AXIS_COLOR = 'var(--text-tertiary)';
const LABEL_COLOR = 'var(--text-secondary)';

interface DiagramSvgProps {
  title: string;
  points: DiagramPoint[];
  memberLength: number;
  rigidStart: number;
  rigidEnd: number;
  unit: string;
  width: number;
  height: number;
  /** If provided, draw two regions (e.g. tension/compression fibers) */
  points2?: DiagramPoint[];
  label1?: string;
  label2?: string;
  limitLines?: { value: number; label: string; color: string }[];
  startNodeId: number;
  endNodeId: number;
}

function DiagramSvg({
  title, points, memberLength, rigidStart, rigidEnd,
  unit, width, height, points2, label1, label2, limitLines,
  startNodeId, endNodeId,
}: DiagramSvgProps) {
  const marginLeft = 55;
  const marginRight = 20;
  const marginTop = 24;
  const marginBottom = 32;
  const plotW = width - marginLeft - marginRight;
  const plotH = height - marginTop - marginBottom;

  // Compute value range across all data
  const allValues = [...points.map(p => p.value), ...(points2 ?? []).map(p => p.value)];
  if (limitLines) allValues.push(...limitLines.map(l => l.value));
  let minVal = Math.min(0, ...allValues);
  let maxVal = Math.max(0, ...allValues);
  const valRange = maxVal - minVal || 1;
  // Add 15% padding
  minVal -= valRange * 0.15;
  maxVal += valRange * 0.15;

  const xScale = (x: number) => marginLeft + (x / memberLength) * plotW;
  const yScale = (v: number) => marginTop + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;
  const zeroY = yScale(0);

  // Build filled polygon path for a set of points
  function fillPath(pts: DiagramPoint[], color: string, opacity = 0.25) {
    if (pts.length < 2) return null;
    const pathPts = pts.map(p => `${xScale(p.x)},${yScale(p.value)}`);
    // Close back to zero line
    const first = xScale(pts[0].x);
    const last = xScale(pts[pts.length - 1].x);
    const d = `M ${first},${zeroY} L ${pathPts.join(' L ')} L ${last},${zeroY} Z`;
    return <path d={d} fill={color} opacity={opacity} />;
  }

  function linePath(pts: DiagramPoint[], color: string, strokeWidth = 1.5) {
    if (pts.length < 2) return null;
    const d = 'M ' + pts.map(p => `${xScale(p.x)},${yScale(p.value)}`).join(' L ');
    return <path d={d} fill="none" stroke={color} strokeWidth={strokeWidth} />;
  }

  // Label key values (start face, end face, extremes)
  function valueLabels(pts: DiagramPoint[]) {
    if (pts.length === 0) return null;
    const labels: { x: number; y: number; text: string }[] = [];
    // Start face
    const startFacePt = pts.find(p => Math.abs(p.x - rigidStart) < 0.01);
    if (startFacePt && Math.abs(startFacePt.value) > 1e-6) {
      labels.push({ x: xScale(startFacePt.x), y: yScale(startFacePt.value), text: startFacePt.value.toFixed(2) });
    }
    // End face
    const endFacePt = pts.find(p => Math.abs(p.x - (memberLength - rigidEnd)) < 0.01);
    if (endFacePt && Math.abs(endFacePt.value) > 1e-6) {
      labels.push({ x: xScale(endFacePt.x), y: yScale(endFacePt.value), text: endFacePt.value.toFixed(2) });
    }
    // Max absolute in flexible span
    const flexPts = pts.filter(p => p.x >= rigidStart - 0.01 && p.x <= memberLength - rigidEnd + 0.01);
    if (flexPts.length > 0) {
      const extreme = flexPts.reduce((best, p) => Math.abs(p.value) > Math.abs(best.value) ? p : best);
      if (Math.abs(extreme.value) > 1e-6 && Math.abs(extreme.x - rigidStart) > 0.1 && Math.abs(extreme.x - (memberLength - rigidEnd)) > 0.1) {
        labels.push({ x: xScale(extreme.x), y: yScale(extreme.value), text: extreme.value.toFixed(2) });
      }
    }
    return labels.map((l, i) => (
      <text key={i} x={l.x} y={l.y - 5} textAnchor="middle" fontSize="9" fill={LABEL_COLOR} fontWeight="600">
        {l.text}
      </text>
    ));
  }

  // Y-axis ticks
  const nTicks = 5;
  const tickStep = (maxVal - minVal) / nTicks;
  const ticks: number[] = [];
  for (let i = 0; i <= nTicks; i++) {
    ticks.push(minVal + i * tickStep);
  }

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold mb-1" style={{ color: LABEL_COLOR }}>{title} ({unit})</div>
      <svg width={width} height={height} style={{ display: 'block' }}>
        {/* Rigid zone shading */}
        {rigidStart > 0.001 && (
          <rect x={xScale(0)} y={marginTop} width={xScale(rigidStart) - xScale(0)} height={plotH}
            fill={RIGID_FILL} opacity={0.3} />
        )}
        {rigidEnd > 0.001 && (
          <rect x={xScale(memberLength - rigidEnd)} y={marginTop}
            width={xScale(memberLength) - xScale(memberLength - rigidEnd)} height={plotH}
            fill={RIGID_FILL} opacity={0.3} />
        )}

        {/* Rigid zone labels */}
        {rigidStart > 0.001 && (
          <text x={(xScale(0) + xScale(rigidStart)) / 2} y={marginTop + plotH + 24}
            textAnchor="middle" fontSize="8" fill={LABEL_COLOR} opacity={0.7}>rigid</text>
        )}
        {rigidEnd > 0.001 && (
          <text x={(xScale(memberLength - rigidEnd) + xScale(memberLength)) / 2} y={marginTop + plotH + 24}
            textAnchor="middle" fontSize="8" fill={LABEL_COLOR} opacity={0.7}>rigid</text>
        )}

        {/* Rigid zone boundary lines */}
        {rigidStart > 0.001 && (
          <line x1={xScale(rigidStart)} y1={marginTop} x2={xScale(rigidStart)} y2={marginTop + plotH}
            stroke={AXIS_COLOR} strokeWidth={1} strokeDasharray="3,3" />
        )}
        {rigidEnd > 0.001 && (
          <line x1={xScale(memberLength - rigidEnd)} y1={marginTop}
            x2={xScale(memberLength - rigidEnd)} y2={marginTop + plotH}
            stroke={AXIS_COLOR} strokeWidth={1} strokeDasharray="3,3" />
        )}

        {/* Y-axis ticks and grid */}
        {ticks.map((v, i) => (
          <g key={i}>
            <line x1={marginLeft} y1={yScale(v)} x2={marginLeft + plotW} y2={yScale(v)}
              stroke={AXIS_COLOR} strokeWidth={0.3} opacity={0.4} />
            <text x={marginLeft - 4} y={yScale(v) + 3} textAnchor="end" fontSize="8" fill={LABEL_COLOR}>
              {Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* Zero line */}
        <line x1={marginLeft} y1={zeroY} x2={marginLeft + plotW} y2={zeroY}
          stroke={AXIS_COLOR} strokeWidth={1} />

        {/* Member axis */}
        <line x1={xScale(0)} y1={zeroY} x2={xScale(memberLength)} y2={zeroY}
          stroke={AXIS_COLOR} strokeWidth={2} />

        {/* Limit lines */}
        {limitLines?.map((ll, i) => (
          <g key={i}>
            <line x1={marginLeft} y1={yScale(ll.value)} x2={marginLeft + plotW} y2={yScale(ll.value)}
              stroke={ll.color} strokeWidth={1} strokeDasharray="4,4" opacity={0.6} />
            <text x={marginLeft + plotW + 2} y={yScale(ll.value) + 3} fontSize="8" fill={ll.color}>
              {ll.label}
            </text>
          </g>
        ))}

        {/* Filled regions */}
        {points2 ? (
          <>
            {fillPath(points, TENSION_COLOR, 0.2)}
            {fillPath(points2, COMPRESSION_COLOR, 0.2)}
            {linePath(points, TENSION_COLOR)}
            {linePath(points2, COMPRESSION_COLOR)}
          </>
        ) : (
          <>
            {fillPath(points, POS_COLOR, 0.2)}
            {linePath(points, POS_COLOR)}
          </>
        )}

        {/* Value labels */}
        {valueLabels(points)}
        {points2 && valueLabels(points2)}

        {/* Node markers */}
        <circle cx={xScale(0)} cy={zeroY} r={3} fill={AXIS_COLOR} />
        <circle cx={xScale(memberLength)} cy={zeroY} r={3} fill={AXIS_COLOR} />

        {/* X-axis labels */}
        <text x={xScale(0)} y={marginTop + plotH + 14} textAnchor="middle" fontSize="8" fill={LABEL_COLOR}>
          Node {startNodeId}
        </text>
        <text x={xScale(memberLength)} y={marginTop + plotH + 14} textAnchor="middle" fontSize="8" fill={LABEL_COLOR}>
          Node {endNodeId}
        </text>

        {/* Legend for dual-line diagrams */}
        {points2 && label1 && label2 && (
          <g>
            <line x1={marginLeft} y1={8} x2={marginLeft + 15} y2={8} stroke={TENSION_COLOR} strokeWidth={2} />
            <text x={marginLeft + 18} y={11} fontSize="8" fill={LABEL_COLOR}>{label1}</text>
            <line x1={marginLeft + 80} y1={8} x2={marginLeft + 95} y2={8} stroke={COMPRESSION_COLOR} strokeWidth={2} />
            <text x={marginLeft + 98} y={11} fontSize="8" fill={LABEL_COLOR}>{label2}</text>
          </g>
        )}
      </svg>
    </div>
  );
}

export default function MemberDiagrams({ member, forces, stresses, material }: Props) {
  const diagWidth = 600;
  const diagHeight = 160;

  const { axial, shear, moment } = useMemo(
    () => computeDiagramData(member, forces),
    [member, forces]
  );

  const { tensionFiber, compressionFiber } = useMemo(
    () => computeStressDiagram(member, forces, moment),
    [member, forces, moment]
  );

  const fr = 7.5 * Math.sqrt(material.fcPsi);
  const fc_limit = 0.60 * material.fcPsi;

  return (
    <div className="p-3 rounded" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
      <div className="font-semibold text-sm mb-1" style={{ color: 'var(--accent)' }}>
        Member {member.id}: {member.label}
      </div>
      <div className="text-xs mb-3" style={{ color: 'var(--text-tertiary)' }}>
        {member.orientation} | CL={member.centerlineLengthFt.toFixed(2)} ft |
        Flex={member.flexibleLengthFt.toFixed(2)} ft |
        Offsets: {member.rigidOffsetStartFt.toFixed(2)} / {member.rigidOffsetEndFt.toFixed(2)} ft |
        b={member.thicknessIn}" d={member.depthIn}" |
        Status: <span className={
          stresses.status === 'OK' ? 'text-green-400' :
          stresses.status === 'Cracked' ? 'text-yellow-400' : 'text-red-400'
        }>{stresses.status}</span>
      </div>

      <DiagramSvg
        title="Axial Force (P)"
        points={axial}
        memberLength={member.centerlineLengthFt}
        rigidStart={member.rigidOffsetStartFt}
        rigidEnd={member.rigidOffsetEndFt}
        unit="kips"
        width={diagWidth}
        height={diagHeight}
        startNodeId={member.startNodeId}
        endNodeId={member.endNodeId}
      />

      <DiagramSvg
        title="Shear Force (V)"
        points={shear}
        memberLength={member.centerlineLengthFt}
        rigidStart={member.rigidOffsetStartFt}
        rigidEnd={member.rigidOffsetEndFt}
        unit="kips"
        width={diagWidth}
        height={diagHeight}
        startNodeId={member.startNodeId}
        endNodeId={member.endNodeId}
      />

      <DiagramSvg
        title="Bending Moment (M)"
        points={moment}
        memberLength={member.centerlineLengthFt}
        rigidStart={member.rigidOffsetStartFt}
        rigidEnd={member.rigidOffsetEndFt}
        unit="ft-kips"
        width={diagWidth}
        height={diagHeight}
        startNodeId={member.startNodeId}
        endNodeId={member.endNodeId}
      />

      <DiagramSvg
        title="Combined Stress (P/A ± Mc/I)"
        points={tensionFiber}
        points2={compressionFiber}
        label1="Tension fiber"
        label2="Compression fiber"
        memberLength={member.centerlineLengthFt}
        rigidStart={member.rigidOffsetStartFt}
        rigidEnd={member.rigidOffsetEndFt}
        unit="psi"
        width={diagWidth}
        height={diagHeight + 20}
        limitLines={[
          { value: fr, label: `f_r = ${fr.toFixed(0)}`, color: '#eab308' },
          { value: -fc_limit, label: `0.6f'c = ${fc_limit.toFixed(0)}`, color: '#ef4444' },
        ]}
        startNodeId={member.startNodeId}
        endNodeId={member.endNodeId}
      />
    </div>
  );
}
