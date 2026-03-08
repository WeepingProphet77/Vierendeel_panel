/**
 * Cross-section and strain profile diagram for the prestress design modal.
 * Ported from BeamDiagram.jsx and StrainDiagram.jsx, adapted to dark theme.
 */

import type { PrestressSectionInput, PrestressDesignResult, LayerResult } from '../types';

interface Props {
  section: PrestressSectionInput;
  result: PrestressDesignResult | null;
}

export default function PrestressSectionDiagram({ section, result }: Props) {
  const svgW = 520;
  const svgH = 260;
  const margin = 30;
  const sectionW = 160;
  const strainW = 120;
  const gap = 40;

  const { h, bw, bf, sectionType } = section;
  if (h <= 0 || bw <= 0) return null;

  // Scale to fit
  const maxDim = Math.max(h, bf, bw);
  const scale = (svgH - 2 * margin) / maxDim;
  const sectionCenterX = margin + sectionW / 2;
  const topY = margin;

  function yPos(depth: number) {
    return topY + depth * scale;
  }

  // Build section outline path
  function sectionOutline(): string {
    // Custom polygon
    if (sectionType === 'custom' && section.polygon && section.polygon.length >= 3) {
      const poly = section.polygon;
      // Find extents to center the polygon in the diagram
      let minX = Infinity, maxX = -Infinity;
      for (const v of poly) {
        if (v.x < minX) minX = v.x;
        if (v.x > maxX) maxX = v.x;
      }
      const polyW = maxX - minX;
      const offsetX = sectionCenterX - (polyW * scale) / 2 - minX * scale;

      return poly.map((v, i) => {
        const sx = offsetX + v.x * scale;
        const sy = topY + v.y * scale;
        return (i === 0 ? 'M ' : 'L ') + `${sx},${sy}`;
      }).join(' ') + ' Z';
    }

    // Rectangular (default)
    const webW = bw * scale;
    const left = sectionCenterX - webW / 2;
    return `M ${left},${topY} h ${webW} v ${h * scale} h ${-webW} Z`;
  }

  // Stress block
  function renderStressBlock() {
    if (!result) return null;
    const a = result.a;
    if (a <= 0) return null;
    const w = bw * scale;
    const blockH = Math.min(a, h) * scale;
    const left = sectionCenterX - w / 2;

    return (
      <rect x={left + 1} y={topY + 1} width={w - 2} height={blockH}
        fill="var(--accent)" opacity={0.2}
        stroke="var(--accent)" strokeWidth={0.5} strokeDasharray="3,2" />
    );
  }

  // Neutral axis line
  function renderNeutralAxis() {
    if (!result) return null;
    const naY = yPos(result.c);
    const w = bw * scale;
    return (
      <line x1={sectionCenterX - w / 2 - 10} y1={naY} x2={sectionCenterX + w / 2 + 10} y2={naY}
        stroke="#eab308" strokeWidth={1.5} strokeDasharray="6,3" />
    );
  }

  // Steel layer dots
  function renderSteelDots() {
    if (!result) return null;
    return result.layerResults.map((lr: LayerResult, i: number) => {
      const cy = yPos(lr.depth);
      const color = lr.force >= 0 ? '#ef4444' : 'var(--accent)';
      return (
        <circle key={i} cx={sectionCenterX} cy={cy} r={4}
          fill={color} stroke="white" strokeWidth={0.5} />
      );
    });
  }

  // Strain diagram
  const strainX = sectionCenterX + sectionW / 2 + gap;
  function renderStrainDiagram() {
    if (!result) return null;
    const ecu = -0.003;
    const maxTensileStrain = Math.max(...result.layerResults.map(lr => lr.strain), 0.003);
    const strainRange = Math.abs(ecu) + maxTensileStrain;
    const strainScale = strainW / strainRange;

    const zeroX = strainX + Math.abs(ecu) * strainScale;
    const topStrain = ecu;
    const botStrain = result.epsilonT;

    // Strain triangle
    const topStrainX = strainX + (Math.abs(ecu) + topStrain) * strainScale;
    const botStrainX = strainX + (Math.abs(ecu) + botStrain) * strainScale;

    return (
      <g>
        {/* Zero line */}
        <line x1={zeroX} y1={topY} x2={zeroX} y2={yPos(h)}
          stroke="var(--text-tertiary)" strokeWidth={0.5} strokeDasharray="2,2" />
        {/* Strain profile */}
        <line x1={topStrainX} y1={topY} x2={botStrainX} y2={yPos(h)}
          stroke="#22c55e" strokeWidth={2} />
        {/* Compression label */}
        <text x={topStrainX - 4} y={topY - 4} textAnchor="end" fontSize="9"
          fill="var(--text-secondary)">{ecu.toFixed(4)}</text>
        {/* Tension label */}
        <text x={botStrainX + 4} y={yPos(h) + 12} textAnchor="start" fontSize="9"
          fill="var(--text-secondary)">{botStrain.toFixed(4)}</text>
        {/* Layer strain dots */}
        {result.layerResults.map((lr, i) => {
          const lx = strainX + (Math.abs(ecu) + lr.strain) * strainScale;
          return (
            <g key={i}>
              <circle cx={lx} cy={yPos(lr.depth)} r={3}
                fill={lr.strain >= 0 ? '#ef4444' : 'var(--accent)'} />
              <text x={lx + 6} y={yPos(lr.depth) + 3} fontSize="8"
                fill="var(--text-tertiary)">{lr.strain.toFixed(4)}</text>
            </g>
          );
        })}
        <text x={strainX + strainW / 2} y={topY - 12} textAnchor="middle"
          fontSize="10" fill="var(--text-secondary)" fontWeight="600">Strain Profile</text>
      </g>
    );
  }

  return (
    <svg width={svgW} height={svgH} style={{ display: 'block' }}>
      {/* Section label */}
      <text x={sectionCenterX} y={topY - 12} textAnchor="middle"
        fontSize="10" fill="var(--text-secondary)" fontWeight="600">Cross Section</text>
      {/* Section outline */}
      <path d={sectionOutline()} fill="var(--bg-input)" stroke="var(--text-secondary)" strokeWidth={1.5} />
      {renderStressBlock()}
      {renderNeutralAxis()}
      {renderSteelDots()}
      {/* Dimension: h */}
      <line x1={sectionCenterX + (Math.max(bf, bw) * scale) / 2 + 12} y1={topY}
        x2={sectionCenterX + (Math.max(bf, bw) * scale) / 2 + 12} y2={yPos(h)}
        stroke="var(--text-tertiary)" strokeWidth={0.5} />
      <text x={sectionCenterX + (Math.max(bf, bw) * scale) / 2 + 16} y={yPos(h / 2) + 3}
        fontSize="8" fill="var(--text-tertiary)">h={h}"</text>
      {/* Strain diagram */}
      {renderStrainDiagram()}
      {/* Legend */}
      {result && (
        <g>
          <circle cx={margin} cy={svgH - 10} r={3} fill="#ef4444" />
          <text x={margin + 6} y={svgH - 7} fontSize="8" fill="var(--text-tertiary)">Tension</text>
          <circle cx={margin + 55} cy={svgH - 10} r={3} fill="var(--accent)" />
          <text x={margin + 61} y={svgH - 7} fontSize="8" fill="var(--text-tertiary)">Compression</text>
          <line x1={margin + 115} y1={svgH - 10} x2={margin + 130} y2={svgH - 10}
            stroke="#eab308" strokeWidth={1.5} strokeDasharray="4,2" />
          <text x={margin + 134} y={svgH - 7} fontSize="8" fill="var(--text-tertiary)">NA (c={result.c.toFixed(2)}")</text>
        </g>
      )}
    </svg>
  );
}
