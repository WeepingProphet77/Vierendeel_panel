import { useMemo, useState } from 'react';
import type { FrameModel, AppInputs, Node, SavedPrestressDesign } from '../types';
import { isDesignStale } from '../types';

interface Props {
  frameModel: FrameModel;
  inputs: AppInputs;
  selectedMemberId: number | null;
  onSelectMember: (id: number | null) => void;
  prestressDesigns?: Record<number, SavedPrestressDesign>;
}

function SupportSymbol({ x, y, type, scale }: { x: number; y: number; type: 'pin' | 'roller'; scale: number }) {
  const s = 8 / scale;
  if (type === 'pin') {
    return (
      <g>
        <polygon
          points={`${x},${y} ${x - s},${y - s * 1.5} ${x + s},${y - s * 1.5}`}
          fill="none" stroke="#ff9944" strokeWidth={1.5 / scale}
        />
        <line x1={x - s * 1.2} y1={y - s * 1.5} x2={x + s * 1.2} y2={y - s * 1.5}
          stroke="#ff9944" strokeWidth={1.5 / scale} />
      </g>
    );
  }
  return (
    <g>
      <polygon
        points={`${x},${y} ${x - s},${y - s * 1.5} ${x + s},${y - s * 1.5}`}
        fill="none" stroke="#ff9944" strokeWidth={1.5 / scale}
      />
      <circle cx={x - s * 0.5} cy={y - s * 1.8} r={s * 0.3} fill="none" stroke="#ff9944" strokeWidth={1.5 / scale} />
      <circle cx={x + s * 0.5} cy={y - s * 1.8} r={s * 0.3} fill="none" stroke="#ff9944" strokeWidth={1.5 / scale} />
      <line x1={x - s * 1.2} y1={y - s * 2.2} x2={x + s * 1.2} y2={y - s * 2.2}
        stroke="#ff9944" strokeWidth={1.5 / scale} />
    </g>
  );
}

export default function ModelTab({ frameModel, inputs, selectedMemberId, onSelectMember, prestressDesigns = {} }: Props) {
  const [hoveredMember, setHoveredMember] = useState<number | null>(null);
  const [showReinforcement, setShowReinforcement] = useState(true);
  const { nodes, members } = frameModel;

  const viewBox = useMemo(() => {
    const pad = 2;
    return {
      minX: -pad,
      minY: -pad,
      width: inputs.panel.widthFt + pad * 2,
      height: inputs.panel.heightFt + pad * 2,
    };
  }, [inputs.panel]);

  const scale = useMemo(() => {
    return Math.min(800 / viewBox.width, 500 / viewBox.height);
  }, [viewBox]);

  const svgWidth = viewBox.width * scale;
  const svgHeight = viewBox.height * scale;

  const getNode = (id: number): Node => nodes.find(n => n.id === id)!;

  const activeMember = members.find(m => m.id === (hoveredMember ?? selectedMemberId));

  const maxThickness = Math.max(...members.map(m => m.thicknessIn), 1);
  const minStroke = 1.5;
  const maxStroke = 4;

  return (
    <div>
      {/* Toolbar */}
      {Object.keys(prestressDesigns).length > 0 && (
        <div className="flex items-center gap-3 mb-2">
          <label className="flex items-center gap-1.5 text-xs cursor-pointer" style={{ color: 'var(--text-secondary)' }}>
            <input type="checkbox" checked={showReinforcement} onChange={e => setShowReinforcement(e.target.checked)}
              className="accent-[var(--accent)]" />
            Show Reinforcement
          </label>
        </div>
      )}

      {/* SVG Visualization */}
      <div className="rounded mb-4 overflow-auto flex justify-center" style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        <svg
          width={svgWidth}
          height={svgHeight}
          viewBox={`${viewBox.minX} ${viewBox.minY} ${viewBox.width} ${viewBox.height}`}
          className="block"
        >
          <g transform={`translate(0, ${inputs.panel.heightFt}) scale(1, -1)`}>
            {/* Panel outline */}
            <rect
              x={0} y={0}
              width={inputs.panel.widthFt} height={inputs.panel.heightFt}
              fill="var(--svg-panel-fill)" fillOpacity={0.3} stroke="var(--svg-panel-stroke)" strokeWidth={1.5 / scale}
            />

            {/* Openings */}
            {inputs.openings.map((o, i) => (
              <rect
                key={i}
                x={o.centerXFt - o.widthFt / 2}
                y={o.centerYFt - o.heightFt / 2}
                width={o.widthFt}
                height={o.heightFt}
                fill="var(--svg-opening-fill)" stroke="var(--svg-opening-stroke)" strokeWidth={1 / scale}
              />
            ))}

            {/* Members */}
            {members.map(m => {
              const sn = getNode(m.startNodeId);
              const en = getNode(m.endNodeId);
              const isSelected = m.id === selectedMemberId;
              const isHovered = m.id === hoveredMember;
              const isHorizontal = m.orientation === 'horizontal';
              const color = isSelected || isHovered
                ? '#ffffff'
                : isHorizontal ? '#4a9eff' : '#44cc88';
              const strokeW = minStroke + (m.thicknessIn / maxThickness) * (maxStroke - minStroke);

              const dx = en.x - sn.x;
              const dy = en.y - sn.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              const ux = dx / len;
              const uy = dy / len;

              const rigidStartX = sn.x + ux * m.rigidOffsetStartFt;
              const rigidStartY = sn.y + uy * m.rigidOffsetStartFt;
              const rigidEndX = en.x - ux * m.rigidOffsetEndFt;
              const rigidEndY = en.y - uy * m.rigidOffsetEndFt;

              return (
                <g key={m.id}
                  onMouseEnter={() => setHoveredMember(m.id)}
                  onMouseLeave={() => setHoveredMember(null)}
                  onClick={() => onSelectMember(m.id === selectedMemberId ? null : m.id)}
                  style={{ cursor: 'pointer' }}
                >
                  {/* Rigid zones */}
                  <line x1={sn.x} y1={sn.y} x2={rigidStartX} y2={rigidStartY}
                    stroke={color} strokeWidth={(strokeW + 2) / scale} opacity={0.7} />
                  <line x1={rigidEndX} y1={rigidEndY} x2={en.x} y2={en.y}
                    stroke={color} strokeWidth={(strokeW + 2) / scale} opacity={0.7} />

                  {/* Flexible portion */}
                  <line x1={rigidStartX} y1={rigidStartY} x2={rigidEndX} y2={rigidEndY}
                    stroke={color} strokeWidth={strokeW / scale} />

                  {/* Member ID label */}
                  <g transform={`translate(${(sn.x + en.x) / 2}, ${(sn.y + en.y) / 2}) scale(1, -1)`}>
                    <text
                      x={0} y={0}
                      textAnchor="middle" dominantBaseline="central"
                      fontSize={8 / scale} fill={color} fontWeight="bold"
                    >
                      {m.id}
                    </text>
                  </g>
                </g>
              );
            })}

            {/* Reinforcement overlay */}
            {showReinforcement && members.map(m => {
              const pd = prestressDesigns[m.id];
              if (!pd) return null;

              const sn = getNode(m.startNodeId);
              const en = getNode(m.endNodeId);
              const dx = en.x - sn.x;
              const dy = en.y - sn.y;
              const len = Math.sqrt(dx * dx + dy * dy);
              if (len < 0.001) return null;

              const ux = dx / len;
              const uy = dy / len;
              // Normal (perpendicular) direction — depth extends this way
              const nx = -uy;
              const ny = ux;

              const depthFt = m.depthIn / 12;
              const halfD = depthFt / 2;

              // Utilization color — amber for stale designs
              const fcKsi = inputs.material.fcPsi / 1000;
              const stale = isDesignStale(pd, m, fcKsi);
              const outlineColor = stale ? '#eab308' : pd.utilization <= 1.0 ? '#22c55e' : '#ef4444';

              // Use flexible span endpoints
              const rsX = sn.x + ux * m.rigidOffsetStartFt;
              const rsY = sn.y + uy * m.rigidOffsetStartFt;
              const reX = en.x - ux * m.rigidOffsetEndFt;
              const reY = en.y - uy * m.rigidOffsetEndFt;

              // Build section outline for the flexible span
              let sectionPath: string;
              if (pd.section.sectionType === 'custom' && pd.section.polygon && pd.section.polygon.length >= 3) {
                // Custom polygon: draw profile at the member midpoint, aligned to member axis
                // The polygon is defined in inches with y=0 at top, so map to model coords
                const poly = pd.section.polygon;
                const midX = (rsX + reX) / 2;
                const midY = (rsY + reY) / 2;
                const polyScale = 1 / 12; // inches → feet
                // Find polygon centroid for centering
                let minPy = Infinity, maxPy = -Infinity, minPx = Infinity, maxPx = -Infinity;
                for (const v of poly) {
                  if (v.y < minPy) minPy = v.y;
                  if (v.y > maxPy) maxPy = v.y;
                  if (v.x < minPx) minPx = v.x;
                  if (v.x > maxPx) maxPx = v.x;
                }
                const cx = (minPx + maxPx) / 2;
                const cy = (minPy + maxPy) / 2;

                sectionPath = poly.map((v, i) => {
                  // Center and scale polygon, map to model coords
                  // Polygon x → along member axis, polygon y → depth (perpendicular)
                  const localAlong = (v.x - cx) * polyScale;
                  const localPerp = -(v.y - cy) * polyScale; // flip y: polygon y=0 is top, model normal points "up"
                  const px = midX + ux * localAlong + nx * localPerp;
                  const py = midY + uy * localAlong + ny * localPerp;
                  return (i === 0 ? 'M ' : 'L ') + `${px},${py}`;
                }).join(' ') + ' Z';
              } else {
                // Rectangular: draw rectangle along the flexible span
                const c1x = rsX + nx * halfD;
                const c1y = rsY + ny * halfD;
                const c2x = reX + nx * halfD;
                const c2y = reY + ny * halfD;
                const c3x = reX - nx * halfD;
                const c3y = reY - ny * halfD;
                const c4x = rsX - nx * halfD;
                const c4y = rsY - ny * halfD;
                sectionPath = `M ${c1x},${c1y} L ${c2x},${c2y} L ${c3x},${c3y} L ${c4x},${c4y} Z`;
              }

              // Steel layer marks (small ticks perpendicular to member axis)
              const layerMarks = pd.layers.map((layer, li) => {
                // layer.depth is inches from top of section
                const offsetFromCenter = (m.depthIn / 2 - layer.depth) / 12; // feet from centerline (positive = toward top)
                const tickLen = Math.max(depthFt * 0.15, 0.15); // tick half-length along member

                // Draw tick at midpoint of flexible span
                const midAlongX = (rsX + reX) / 2;
                const midAlongY = (rsY + reY) / 2;
                const cx = midAlongX + nx * offsetFromCenter;
                const cy = midAlongY + ny * offsetFromCenter;

                return (
                  <line key={li}
                    x1={cx - ux * tickLen} y1={cy - uy * tickLen}
                    x2={cx + ux * tickLen} y2={cy + uy * tickLen}
                    stroke="#ef4444" strokeWidth={1.5 / scale} opacity={0.8}
                  />
                );
              });

              return (
                <g key={`reinf-${m.id}`}>
                  <path d={sectionPath}
                    fill={outlineColor} fillOpacity={0.08}
                    stroke={outlineColor} strokeWidth={1 / scale}
                    strokeDasharray={`${3 / scale},${2 / scale}`} opacity={0.6}
                  />
                  {layerMarks}
                </g>
              );
            })}

            {/* Nodes */}
            {nodes.map(n => (
              <g key={n.id}>
                <circle cx={n.x} cy={n.y} r={4 / scale} fill="#ff6644" stroke="#ffffff" strokeWidth={1 / scale} />
                <g transform={`translate(${n.x}, ${n.y}) scale(1, -1)`}>
                  <text x={6 / scale} y={-4 / scale}
                    fontSize={7 / scale} fill="var(--svg-node-label)" fontWeight="bold">
                    {n.id}
                  </text>
                </g>
              </g>
            ))}

            {/* Supports */}
            {nodes.filter(n => n.restraints.dy).map(n => (
              <SupportSymbol
                key={n.id}
                x={n.x} y={n.y}
                type={n.restraints.dx ? 'pin' : 'roller'}
                scale={scale}
              />
            ))}
          </g>
        </svg>
      </div>

      {/* Member info tooltip */}
      {activeMember && (() => {
        const pd = prestressDesigns[activeMember.id];
        const pdStale = pd ? isDesignStale(pd, activeMember, inputs.material.fcPsi / 1000) : false;
        return (
          <div className="mb-4 p-3 rounded text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <div className="font-semibold mb-1" style={{ color: 'var(--accent)' }}>Member {activeMember.id}: {activeMember.label}</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: 'var(--text-secondary)' }}>
              <div>Type: {activeMember.orientation}</div>
              <div>CL Length: {activeMember.centerlineLengthFt.toFixed(3)} ft</div>
              <div>Flexible Length: {activeMember.flexibleLengthFt.toFixed(3)} ft</div>
              <div>Thickness: {activeMember.thicknessIn.toFixed(1)} in{activeMember.thicknessOverridden ? ' (override)' : ''}</div>
              <div>Depth: {activeMember.depthIn.toFixed(1)} in</div>
              <div>Offset Start: {activeMember.rigidOffsetStartFt.toFixed(3)} ft</div>
              <div>Offset End: {activeMember.rigidOffsetEndFt.toFixed(3)} ft</div>
              <div>A: {activeMember.areaIn2.toFixed(1)} in²</div>
              <div>I: {activeMember.inertiaIn4.toFixed(1)} in⁴</div>
            </div>
            {pd && (
              <div className="mt-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="font-semibold mb-0.5" style={{ color: pdStale ? '#eab308' : pd.utilization <= 1.0 ? '#22c55e' : '#ef4444' }}>
                  Reinforcement Design — {pdStale ? 'STALE — member geometry changed' : `${(pd.utilization * 100).toFixed(0)}% utilization`}
                </div>
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5" style={{ color: 'var(--text-secondary)' }}>
                  <div>Section: {pd.section.sectionType === 'custom' ? 'Custom' : `${pd.section.h.toFixed(1)}" × ${pd.section.bw.toFixed(1)}"`}</div>
                  <div>f'c: {pd.section.fc.toFixed(1)} ksi</div>
                  <div>Mu: {pd.Mu.toFixed(2)} ft-k</div>
                  <div>{'\u03C6'}Mn: {pd.phiMnFt.toFixed(2)} ft-k</div>
                  {pd.layers.map((l, i) => (
                    <div key={i} className="col-span-2">
                      Layer {i + 1}: {l.steel.name}, As={l.area.toFixed(3)} in², d={l.depth.toFixed(1)}"
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Node Table */}
      <div className="mb-4">
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Nodes</h3>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>X (ft)</th>
                <th>Y (ft)</th>
                <th>Restraints</th>
              </tr>
            </thead>
            <tbody>
              {nodes.map(n => (
                <tr key={n.id}>
                  <td>{n.id}</td>
                  <td>{n.x.toFixed(3)}</td>
                  <td>{n.y.toFixed(3)}</td>
                  <td className="text-left" style={{ color: 'var(--text-secondary)' }}>
                    {[n.restraints.dx && 'dx', n.restraints.dy && 'dy', n.restraints.rz && 'rz'].filter(Boolean).join(', ') || '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Member Table */}
      <div>
        <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Members</h3>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Label</th>
                <th>Type</th>
                <th>Start</th>
                <th>End</th>
                <th>CL Len (ft)</th>
                <th>Offset S (ft)</th>
                <th>Offset E (ft)</th>
                <th>Flex Len (ft)</th>
                <th>b (in)</th>
                <th>d (in)</th>
                <th>A (in²)</th>
                <th>I (in⁴)</th>
              </tr>
            </thead>
            <tbody>
              {members.map(m => (
                <tr
                  key={m.id}
                  className={`cursor-pointer ${m.id === selectedMemberId ? 'bg-blue-900/30' : ''}`}
                  style={m.id !== selectedMemberId ? { } : undefined}
                  onClick={() => onSelectMember(m.id === selectedMemberId ? null : m.id)}
                >
                  <td>{m.id}</td>
                  <td className="text-left max-w-48 truncate" style={{ color: 'var(--text-secondary)' }} title={m.label}>{m.label}</td>
                  <td className="text-left">{m.orientation === 'horizontal' ? 'H' : 'V'}</td>
                  <td>{m.startNodeId}</td>
                  <td>{m.endNodeId}</td>
                  <td>{m.centerlineLengthFt.toFixed(3)}</td>
                  <td>{m.rigidOffsetStartFt.toFixed(3)}</td>
                  <td>{m.rigidOffsetEndFt.toFixed(3)}</td>
                  <td>{m.flexibleLengthFt.toFixed(3)}</td>
                  <td>{m.thicknessIn.toFixed(1)}{m.thicknessOverridden ? '*' : ''}</td>
                  <td>{m.depthIn.toFixed(1)}</td>
                  <td>{m.areaIn2.toFixed(1)}</td>
                  <td>{m.inertiaIn4.toFixed(0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
