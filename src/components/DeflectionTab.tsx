import { useMemo, useState } from 'react';
import type { FrameModel, AnalysisResults, AppInputs } from '../types';

interface Props {
  frameModel: FrameModel;
  results: AnalysisResults | null;
  inputs: AppInputs;
}

export default function DeflectionTab({ frameModel, results, inputs }: Props) {
  if (!results) {
    return <div className="text-[#8899aa] text-sm">No analysis results available.</div>;
  }

  const { nodes, members } = frameModel;
  const nodeIndex = new Map<number, number>();
  nodes.forEach((n, i) => nodeIndex.set(n.id, i));

  // Auto-compute a reasonable default scale factor
  const maxDisp = Math.max(
    ...nodes.map(n => {
      const ni = nodeIndex.get(n.id)! * 3;
      return Math.sqrt(
        results.displacements[ni] ** 2 + results.displacements[ni + 1] ** 2
      );
    })
  );

  const targetDisp = inputs.panel.heightFt * 0.07; // 7% of panel height
  const autoScale = maxDisp > 0 ? targetDisp / maxDisp : 100;
  const defaultScale = Math.round(autoScale);

  const [scaleFactor, setScaleFactor] = useState<number>(defaultScale || 500);

  const getDisplacement = (nodeId: number) => {
    const ni = nodeIndex.get(nodeId)! * 3;
    return {
      dx: results.displacements[ni] * scaleFactor,
      dy: results.displacements[ni + 1] * scaleFactor,
    };
  };

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

  const getNode = (id: number): Node => nodes.find(n => n.id === id)!;

  // Interpolate deformed panel outline
  // Bottom edge nodes (sorted by x), top edge nodes, left edge, right edge
  const deformedCorners = useMemo(() => {
    // Panel corners displaced by interpolating from nearest nodes
    // Simple approach: find nodes at corners or closest to corners
    const corners = [
      { x: 0, y: 0 },
      { x: inputs.panel.widthFt, y: 0 },
      { x: inputs.panel.widthFt, y: inputs.panel.heightFt },
      { x: 0, y: inputs.panel.heightFt },
    ];

    return corners.map(c => {
      // Find nearest node
      let minDist = Infinity;
      let nearestNodeId = nodes[0]?.id ?? 0;
      for (const n of nodes) {
        const d = Math.sqrt((n.x - c.x) ** 2 + (n.y - c.y) ** 2);
        if (d < minDist) { minDist = d; nearestNodeId = n.id; }
      }
      const disp = getDisplacement(nearestNodeId);
      return { x: c.x + disp.dx, y: c.y + disp.dy };
    });
  }, [nodes, results, scaleFactor, inputs.panel]);

  // Deformed opening outlines
  const deformedOpenings = useMemo(() => {
    return inputs.openings.map(o => {
      const corners = [
        { x: o.centerXFt - o.widthFt / 2, y: o.centerYFt - o.heightFt / 2 },
        { x: o.centerXFt + o.widthFt / 2, y: o.centerYFt - o.heightFt / 2 },
        { x: o.centerXFt + o.widthFt / 2, y: o.centerYFt + o.heightFt / 2 },
        { x: o.centerXFt - o.widthFt / 2, y: o.centerYFt + o.heightFt / 2 },
      ];
      return corners.map(c => {
        let minDist = Infinity;
        let nearestNodeId = nodes[0]?.id ?? 0;
        for (const n of nodes) {
          const d = Math.sqrt((n.x - c.x) ** 2 + (n.y - c.y) ** 2);
          if (d < minDist) { minDist = d; nearestNodeId = n.id; }
        }
        const disp = getDisplacement(nearestNodeId);
        return { x: c.x + disp.dx, y: c.y + disp.dy };
      });
    });
  }, [nodes, results, scaleFactor, inputs.openings]);

  return (
    <div>
      {/* Scale slider */}
      <div className="flex items-center gap-3 mb-4 p-3 bg-[#16213e] rounded border border-[#2a3a5c]">
        <label className="text-xs text-[#8899aa]">Displacement Scale:</label>
        <input
          type="range"
          min={1}
          max={Math.max(10000, defaultScale * 3)}
          value={scaleFactor}
          onChange={e => setScaleFactor(parseInt(e.target.value))}
          className="flex-1"
        />
        <span className="text-xs text-[#c0c8d0] w-16 text-right">{scaleFactor}x</span>
      </div>

      {/* Max deflection info */}
      <div className="mb-4 p-3 bg-[#16213e] rounded border border-[#2a3a5c] text-xs text-[#8899aa]">
        <span className="font-semibold text-[#c0c8d0]">Max Vertical Deflection: </span>
        {results.maxDeflection.valueIn.toFixed(4)} in at Node {results.maxDeflection.nodeId}
        <span className="ml-4 text-[#667788]">
          (L/{Math.abs(results.maxDeflection.valueIn) > 0 ?
            Math.round(inputs.panel.widthFt * 12 / Math.abs(results.maxDeflection.valueIn)) : '∞'})
        </span>
      </div>

      {/* SVG */}
      <div className="bg-[#0f1629] rounded border border-[#2a3a5c] overflow-auto flex justify-center">
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
              fill="none" stroke="#2a3a5c" strokeWidth={1 / scale} strokeDasharray={`${4 / scale}`}
            />
            {inputs.openings.map((o, i) => (
              <rect
                key={i}
                x={o.centerXFt - o.widthFt / 2}
                y={o.centerYFt - o.heightFt / 2}
                width={o.widthFt} height={o.heightFt}
                fill="none" stroke="#2a3a5c" strokeWidth={0.8 / scale} strokeDasharray={`${3 / scale}`}
              />
            ))}

            {/* Undeformed frame (ghost) */}
            {members.map(m => {
              const sn = getNode(m.startNodeId);
              const en = getNode(m.endNodeId);
              return (
                <line key={m.id}
                  x1={sn.x} y1={sn.y} x2={en.x} y2={en.y}
                  stroke="#2a3a5c" strokeWidth={1.5 / scale}
                />
              );
            })}

            {/* Deformed panel outline */}
            {deformedCorners.length === 4 && (
              <polygon
                points={deformedCorners.map(c => `${c.x},${c.y}`).join(' ')}
                fill="#4a9eff" fillOpacity={0.08} stroke="#4a9eff" strokeWidth={1.2 / scale}
              />
            )}

            {/* Deformed openings */}
            {deformedOpenings.map((corners, i) => (
              <polygon
                key={i}
                points={corners.map(c => `${c.x},${c.y}`).join(' ')}
                fill="#0f1629" stroke="#4a9eff" strokeWidth={0.8 / scale}
              />
            ))}

            {/* Deformed frame */}
            {members.map(m => {
              const sn = getNode(m.startNodeId);
              const en = getNode(m.endNodeId);
              const ds = getDisplacement(m.startNodeId);
              const de = getDisplacement(m.endNodeId);
              return (
                <line key={m.id}
                  x1={sn.x + ds.dx} y1={sn.y + ds.dy}
                  x2={en.x + de.dx} y2={en.y + de.dy}
                  stroke="#ff6644" strokeWidth={2 / scale}
                />
              );
            })}

            {/* Deformed nodes */}
            {nodes.map(n => {
              const d = getDisplacement(n.id);
              return (
                <circle key={n.id}
                  cx={n.x + d.dx} cy={n.y + d.dy}
                  r={3 / scale} fill="#ff6644" stroke="#ffffff" strokeWidth={0.8 / scale}
                />
              );
            })}
          </g>
        </svg>
      </div>
    </div>
  );
}
