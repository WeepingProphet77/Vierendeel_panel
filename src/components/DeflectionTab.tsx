import { useMemo, useState } from 'react';
import type { FrameModel, AnalysisResults, AppInputs, Node } from '../types';

interface Props {
  frameModel: FrameModel;
  results: AnalysisResults | null;
  inputs: AppInputs;
}

/** Interpolate displacement at an arbitrary point using inverse-distance weighting from all nodes */
function interpolateDisplacement(
  px: number, py: number,
  nodes: Node[],
  displacements: number[],
  nodeIndex: Map<number, number>,
  scaleFactor: number,
): { dx: number; dy: number } {
  let sumWx = 0, sumWy = 0, sumW = 0;
  for (const n of nodes) {
    const ni = nodeIndex.get(n.id)! * 3;
    const dist2 = (n.x - px) ** 2 + (n.y - py) ** 2;
    if (dist2 < 1e-10) {
      return {
        dx: displacements[ni] * scaleFactor,
        dy: displacements[ni + 1] * scaleFactor,
      };
    }
    const w = 1 / dist2;
    sumWx += w * displacements[ni] * scaleFactor;
    sumWy += w * displacements[ni + 1] * scaleFactor;
    sumW += w;
  }
  return { dx: sumWx / sumW, dy: sumWy / sumW };
}

/** Sample points along an edge with interpolated displacements, return deformed polyline */
function deformEdge(
  x0: number, y0: number, x1: number, y1: number,
  nSamples: number,
  nodes: Node[],
  displacements: number[],
  nodeIndex: Map<number, number>,
  scaleFactor: number,
): { x: number; y: number }[] {
  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= nSamples; i++) {
    const t = i / nSamples;
    const px = x0 + t * (x1 - x0);
    const py = y0 + t * (y1 - y0);
    const d = interpolateDisplacement(px, py, nodes, displacements, nodeIndex, scaleFactor);
    pts.push({ x: px + d.dx, y: py + d.dy });
  }
  return pts;
}

/** Generate cubic Hermite curve points for a deformed member using end rotations */
function memberCurvePoints(
  sx: number, sy: number, ex: number, ey: number,
  dxS: number, dyS: number, rzS: number,
  dxE: number, dyE: number, rzE: number,
  scaleFactor: number,
  nPts: number,
): { x: number; y: number }[] {
  const memberDx = ex - sx;
  const memberDy = ey - sy;
  const L = Math.sqrt(memberDx * memberDx + memberDy * memberDy);
  if (L < 1e-10) return [{ x: sx, y: sy }];

  const angle = Math.atan2(memberDy, memberDx);
  const cosA = Math.cos(angle);
  const sinA = Math.sin(angle);

  // Scaled rotations
  const theta0 = rzS * scaleFactor;
  const theta1 = rzE * scaleFactor;

  // Transform end displacements to local member coordinates
  // Local x = along member, local y = perpendicular (transverse)
  const v0 = (-sinA * dxS + cosA * dyS) * scaleFactor;  // transverse at start
  const v1 = (-sinA * dxE + cosA * dyE) * scaleFactor;  // transverse at end
  const u0 = (cosA * dxS + sinA * dyS) * scaleFactor;   // axial at start
  const u1 = (cosA * dxE + sinA * dyE) * scaleFactor;   // axial at end

  // Cubic Hermite shape functions for transverse deflection v(xi), xi in [0,1]:
  //   H1 = 1 - 3*xi^2 + 2*xi^3       (v at start)
  //   H2 = xi - 2*xi^2 + xi^3         (rotation at start, times L)
  //   H3 = 3*xi^2 - 2*xi^3            (v at end)
  //   H4 = -xi^2 + xi^3               (rotation at end, times L)

  const pts: { x: number; y: number }[] = [];
  for (let i = 0; i <= nPts; i++) {
    const xi = i / nPts;
    const xi2 = xi * xi;
    const xi3 = xi2 * xi;

    // Axial displacement (linear interpolation)
    const u = u0 + (u1 - u0) * xi;

    // Transverse displacement (cubic Hermite)
    const H1 = 1 - 3 * xi2 + 2 * xi3;
    const H2 = xi - 2 * xi2 + xi3;
    const H3 = 3 * xi2 - 2 * xi3;
    const H4 = -xi2 + xi3;
    const v = H1 * v0 + H2 * theta0 * L + H3 * v1 + H4 * theta1 * L;

    // Position along undeformed member + local deformations back to global
    const baseX = sx + xi * memberDx;
    const baseY = sy + xi * memberDy;
    const globalX = baseX + cosA * u - sinA * v;
    const globalY = baseY + sinA * u + cosA * v;

    pts.push({ x: globalX, y: globalY });
  }

  return pts;
}

function pointsToSvgPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  return 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ');
}

function pointsToClosedPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  return 'M ' + pts.map(p => `${p.x},${p.y}`).join(' L ') + ' Z';
}

export default function DeflectionTab({ frameModel, results, inputs }: Props) {
  const { nodes, members } = frameModel;

  const nodeIndex = useMemo(() => {
    const map = new Map<number, number>();
    nodes.forEach((n, i) => map.set(n.id, i));
    return map;
  }, [nodes]);

  const getNode = (id: number): Node => nodes.find(n => n.id === id)!;

  const maxDisp = useMemo(() => {
    if (!results) return 0;
    return Math.max(
      ...nodes.map(n => {
        const ni = nodeIndex.get(n.id)! * 3;
        return Math.sqrt(
          results.displacements[ni] ** 2 + results.displacements[ni + 1] ** 2
        );
      })
    );
  }, [nodes, nodeIndex, results]);

  const targetDisp = inputs.panel.heightFt * 0.07;
  const autoScale = maxDisp > 0 ? targetDisp / maxDisp : 100;
  const defaultScale = Math.round(autoScale);

  const [scaleFactor, setScaleFactor] = useState<number>(defaultScale || 500);

  const nSamplesPerEdge = 24;
  const nPtsPerMember = 20;

  // Deformed member curves with cubic Hermite interpolation
  const memberCurves = useMemo(() => {
    if (!results) return [];
    return members.map(m => {
      const sn = getNode(m.startNodeId);
      const en = getNode(m.endNodeId);
      const si = nodeIndex.get(m.startNodeId)! * 3;
      const ei = nodeIndex.get(m.endNodeId)! * 3;

      const pts = memberCurvePoints(
        sn.x, sn.y, en.x, en.y,
        results.displacements[si], results.displacements[si + 1], results.displacements[si + 2],
        results.displacements[ei], results.displacements[ei + 1], results.displacements[ei + 2],
        scaleFactor,
        nPtsPerMember,
      );
      return { id: m.id, pts };
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, nodes, nodeIndex, results, scaleFactor]);

  // Deformed panel outline (4 edges, each sampled with IDW interpolation)
  const deformedOutlinePath = useMemo(() => {
    if (!results) return '';
    const W = inputs.panel.widthFt;
    const H = inputs.panel.heightFt;
    const edges: [number, number, number, number][] = [
      [0, 0, W, 0],     // bottom
      [W, 0, W, H],     // right
      [W, H, 0, H],     // top
      [0, H, 0, 0],     // left
    ];
    const allPts: { x: number; y: number }[] = [];
    for (const [x0, y0, x1, y1] of edges) {
      const edgePts = deformEdge(x0, y0, x1, y1, nSamplesPerEdge, nodes, results.displacements, nodeIndex, scaleFactor);
      allPts.push(...(allPts.length > 0 ? edgePts.slice(1) : edgePts));
    }
    return pointsToClosedPath(allPts);
  }, [nodes, nodeIndex, results, scaleFactor, inputs.panel]);

  // Deformed openings (each opening = 4 edges, sampled)
  const deformedOpeningPaths = useMemo(() => {
    if (!results) return [];
    return inputs.openings.map(o => {
      const left = o.centerXFt - o.widthFt / 2;
      const right = o.centerXFt + o.widthFt / 2;
      const bot = o.centerYFt - o.heightFt / 2;
      const top = o.centerYFt + o.heightFt / 2;
      const edges: [number, number, number, number][] = [
        [left, bot, right, bot],
        [right, bot, right, top],
        [right, top, left, top],
        [left, top, left, bot],
      ];
      const allPts: { x: number; y: number }[] = [];
      for (const [x0, y0, x1, y1] of edges) {
        const edgePts = deformEdge(x0, y0, x1, y1, Math.round(nSamplesPerEdge / 2), nodes, results.displacements, nodeIndex, scaleFactor);
        allPts.push(...(allPts.length > 0 ? edgePts.slice(1) : edgePts));
      }
      return pointsToClosedPath(allPts);
    });
  }, [nodes, nodeIndex, results, scaleFactor, inputs.openings]);

  // Deformed node positions
  const deformedNodes = useMemo(() => {
    if (!results) return [];
    return nodes.map(n => {
      const ni = nodeIndex.get(n.id)! * 3;
      return {
        id: n.id,
        x: n.x + results.displacements[ni] * scaleFactor,
        y: n.y + results.displacements[ni + 1] * scaleFactor,
      };
    });
  }, [nodes, nodeIndex, results, scaleFactor]);

  if (!results) {
    return <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No analysis results available.</div>;
  }

  const pad = 2;
  const viewBox = {
    minX: -pad,
    minY: -pad,
    width: inputs.panel.widthFt + pad * 2,
    height: inputs.panel.heightFt + pad * 2,
  };
  const scale = Math.min(800 / viewBox.width, 500 / viewBox.height);
  const svgWidth = viewBox.width * scale;
  const svgHeight = viewBox.height * scale;

  return (
    <div>
      {/* Scale slider */}
      <div className="flex items-center gap-3 mb-4 p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
        <label className="text-xs" style={{ color: 'var(--text-secondary)' }}>Displacement Scale:</label>
        <input
          type="range"
          min={1}
          max={Math.max(10000, defaultScale * 3)}
          value={scaleFactor}
          onChange={e => setScaleFactor(parseInt(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs w-16 text-right" style={{ color: 'var(--text-primary)' }}>{scaleFactor}x</span>
      </div>

      {/* Max deflection info */}
      <div className="mb-4 p-3 rounded text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Max Vertical Deflection: </span>
        {results.maxDeflection.valueIn.toFixed(4)} in at Node {results.maxDeflection.nodeId}
        <span className="ml-4" style={{ color: 'var(--text-tertiary)' }}>
          (L/{Math.abs(results.maxDeflection.valueIn) > 0 ?
            Math.round(inputs.panel.widthFt * 12 / Math.abs(results.maxDeflection.valueIn)) : '\u221E'})
        </span>
      </div>

      {/* SVG */}
      <div className="rounded overflow-auto flex justify-center" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
        >
          <g transform={`translate(0, ${inputs.panel.heightFt}) scale(1, -1)`}>
            {/* Undeformed panel (ghost) */}
            <rect
              x={0} y={0}
              width={inputs.panel.widthFt} height={inputs.panel.heightFt}
              fill="none" stroke="var(--svg-ghost)" strokeWidth={1 / scale} strokeDasharray={`${4 / scale}`}
            />
            {inputs.openings.map((o, i) => (
              <rect
                key={i}
                x={o.centerXFt - o.widthFt / 2}
                y={o.centerYFt - o.heightFt / 2}
                width={o.widthFt} height={o.heightFt}
                fill="none" stroke="var(--svg-ghost)" strokeWidth={0.8 / scale} strokeDasharray={`${3 / scale}`}
              />
            ))}

            {/* Undeformed frame (ghost) */}
            {members.map(m => {
              const sn = getNode(m.startNodeId);
              const en = getNode(m.endNodeId);
              return (
                <line key={m.id}
                  x1={sn.x} y1={sn.y} x2={en.x} y2={en.y}
                  stroke="var(--svg-ghost)" strokeWidth={1.5 / scale}
                />
              );
            })}

            {/* Deformed panel outline */}
            <path
              d={deformedOutlinePath}
              fill="var(--svg-deformed-panel-fill)" fillOpacity={0.08}
              stroke="var(--svg-deformed-panel-fill)" strokeWidth={1.2 / scale}
            />

            {/* Deformed openings */}
            {deformedOpeningPaths.map((pathD, i) => (
              <path
                key={i}
                d={pathD}
                fill="var(--svg-deformed-opening-fill)"
                stroke="#4a9eff" strokeWidth={0.8 / scale}
              />
            ))}

            {/* Deformed frame - cubic Hermite curves showing double curvature */}
            {memberCurves.map(mc => (
              <path
                key={mc.id}
                d={pointsToSvgPath(mc.pts)}
                fill="none"
                stroke="#ff6644" strokeWidth={2 / scale}
              />
            ))}

            {/* Deformed nodes */}
            {deformedNodes.map(n => (
              <circle key={n.id}
                cx={n.x} cy={n.y}
                r={3 / scale} fill="#ff6644" stroke="#ffffff" strokeWidth={0.8 / scale}
              />
            ))}
          </g>
        </svg>
      </div>
    </div>
  );
}
