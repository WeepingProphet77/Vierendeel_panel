import { useMemo, useState } from 'react';
import type { FrameModel, AppInputs, Node } from '../types';

interface Props {
  frameModel: FrameModel;
  inputs: AppInputs;
  selectedMemberId: number | null;
  onSelectMember: (id: number | null) => void;
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

export default function ModelTab({ frameModel, inputs, selectedMemberId, onSelectMember }: Props) {
  const [hoveredMember, setHoveredMember] = useState<number | null>(null);
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
      {activeMember && (
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
        </div>
      )}

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
