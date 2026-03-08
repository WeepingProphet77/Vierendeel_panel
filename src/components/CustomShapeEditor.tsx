/**
 * Interactive polygon cross-section editor.
 *
 * - Click or press Space/Enter to place a point on the 0.25" grid
 * - Arrow keys move the cursor in 0.25" increments
 * - Shift+Arrow moves in 1" increments
 * - Mouse moves the cursor to the nearest grid point
 * - Close the polygon by clicking the first point or pressing C
 * - Backspace removes the last point
 * - Line lengths are shown faintly on each segment
 */

import { useState, useRef, useEffect } from 'react';

const GRID = 0.25; // inches per grid cell
const FAST_STEP = 1.0; // shift+arrow step

interface Props {
  /** Current polygon vertices (inches, y=0 top) */
  polygon: { x: number; y: number }[];
  /** Called when the polygon changes */
  onChange: (polygon: { x: number; y: number }[]) => void;
  /** Overall max width hint for sizing the canvas (in) */
  maxWidth?: number;
  /** Overall max height hint for sizing the canvas (in) */
  maxHeight?: number;
}

function snap(v: number): number {
  return Math.round(v / GRID) * GRID;
}

function roundQ(v: number): number {
  return Math.round(v * 4) / 4;
}

function lineLengthLabel(len: number): string {
  if (len < 0.01) return '';
  return len.toFixed(2) + '"';
}

function isClosed(pts: { x: number; y: number }[]) {
  if (pts.length < 3) return false;
  const first = pts[0];
  const last = pts[pts.length - 1];
  return Math.abs(first.x - last.x) < 0.01 && Math.abs(first.y - last.y) < 0.01;
}

export default function CustomShapeEditor({ polygon, onChange, maxWidth = 24, maxHeight = 36 }: Props) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [closed, setClosed] = useState(polygon.length >= 3 && isClosed(polygon));
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  // Pixel layout
  const margin = 30;
  const pxPerIn = Math.min(
    (320 - 2 * margin) / maxWidth,
    (400 - 2 * margin) / maxHeight,
    16
  );
  const svgW = Math.ceil(maxWidth * pxPerIn + 2 * margin);
  const svgH = Math.ceil(maxHeight * pxPerIn + 2 * margin);

  function toSvgX(xIn: number) { return margin + xIn * pxPerIn; }
  function toSvgY(yIn: number) { return margin + yIn * pxPerIn; }

  function placePoint() {
    if (closed) return;
    const pt = { x: roundQ(cursor.x), y: roundQ(cursor.y) };

    if (polygon.length >= 3) {
      const first = polygon[0];
      if (Math.abs(pt.x - first.x) < GRID * 1.5 && Math.abs(pt.y - first.y) < GRID * 1.5) {
        onChange([...polygon, { x: first.x, y: first.y }]);
        setClosed(true);
        return;
      }
    }

    onChange([...polygon, pt]);
  }

  function closePolygon() {
    if (polygon.length < 3 || closed) return;
    const first = polygon[0];
    onChange([...polygon, { x: first.x, y: first.y }]);
    setClosed(true);
  }

  function removeLastPoint() {
    if (polygon.length === 0) return;
    if (closed) {
      setClosed(false);
      onChange(polygon.slice(0, -1));
    } else {
      onChange(polygon.slice(0, -1));
    }
  }

  function clearAll() {
    onChange([]);
    setClosed(false);
  }

  function handleMouseMove(e: React.MouseEvent<SVGSVGElement>) {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const x = snap((e.clientX - rect.left - margin) / pxPerIn);
    const y = snap((e.clientY - rect.top - margin) / pxPerIn);
    setCursor({
      x: Math.max(0, Math.min(maxWidth, x)),
      y: Math.max(0, Math.min(maxHeight, y)),
    });
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    const step = e.shiftKey ? FAST_STEP : GRID;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        setCursor(c => ({ ...c, y: roundQ(Math.max(0, c.y - step)) }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        setCursor(c => ({ ...c, y: roundQ(Math.min(maxHeight, c.y + step)) }));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setCursor(c => ({ ...c, x: roundQ(Math.max(0, c.x - step)) }));
        break;
      case 'ArrowRight':
        e.preventDefault();
        setCursor(c => ({ ...c, x: roundQ(Math.min(maxWidth, c.x + step)) }));
        break;
      case ' ':
      case 'Enter':
        e.preventDefault();
        placePoint();
        break;
      case 'Backspace':
      case 'Delete':
        e.preventDefault();
        removeLastPoint();
        break;
      case 'c':
      case 'C':
        e.preventDefault();
        closePolygon();
        break;
      case 'Escape':
        e.preventDefault();
        clearAll();
        break;
    }
  }

  // Auto-focus SVG on mount
  useEffect(() => {
    svgRef.current?.focus();
  }, []);

  // Build grid lines
  const gridLines: React.JSX.Element[] = [];
  const majorEvery = 1;
  for (let x = 0; x <= maxWidth; x += GRID) {
    const isMajor = Math.abs(x % majorEvery) < 0.01;
    gridLines.push(
      <line key={`vg${x}`}
        x1={toSvgX(x)} y1={margin} x2={toSvgX(x)} y2={toSvgY(maxHeight)}
        stroke="var(--text-hint)" strokeWidth={isMajor ? 0.5 : 0.15} opacity={isMajor ? 0.3 : 0.15} />
    );
  }
  for (let y = 0; y <= maxHeight; y += GRID) {
    const isMajor = Math.abs(y % majorEvery) < 0.01;
    gridLines.push(
      <line key={`hg${y}`}
        x1={margin} y1={toSvgY(y)} x2={toSvgX(maxWidth)} y2={toSvgY(y)}
        stroke="var(--text-hint)" strokeWidth={isMajor ? 0.5 : 0.15} opacity={isMajor ? 0.3 : 0.15} />
    );
  }

  // Build axis labels (every 2 inches)
  const axisLabels: React.JSX.Element[] = [];
  for (let x = 0; x <= maxWidth; x += 2) {
    axisLabels.push(
      <text key={`xl${x}`} x={toSvgX(x)} y={margin - 4}
        textAnchor="middle" fontSize="8" fill="var(--text-tertiary)">{x}</text>
    );
  }
  for (let y = 0; y <= maxHeight; y += 2) {
    axisLabels.push(
      <text key={`yl${y}`} x={margin - 4} y={toSvgY(y) + 3}
        textAnchor="end" fontSize="8" fill="var(--text-tertiary)">{y}</text>
    );
  }

  // Build polygon path
  const pts = closed ? polygon.slice(0, -1) : polygon;
  const polyPath = pts.length >= 2
    ? 'M ' + pts.map(p => `${toSvgX(p.x)},${toSvgY(p.y)}`).join(' L ') + (closed ? ' Z' : '')
    : '';

  // Segment lengths
  const segmentLabels: React.JSX.Element[] = [];
  const allPtsForLabels = closed ? [...pts, pts[0]] : polygon;
  for (let i = 0; i + 1 < allPtsForLabels.length; i++) {
    const p1 = allPtsForLabels[i];
    const p2 = allPtsForLabels[i + 1];
    const len = Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
    if (len < 0.01) continue;
    const mx = (toSvgX(p1.x) + toSvgX(p2.x)) / 2;
    const my = (toSvgY(p1.y) + toSvgY(p2.y)) / 2;
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const norm = Math.sqrt(dx * dx + dy * dy);
    const offsetX = (-dy / norm) * 8;
    const offsetY = (dx / norm) * 8;
    segmentLabels.push(
      <text key={`sl${i}`} x={mx + offsetX} y={my + offsetY}
        textAnchor="middle" fontSize="8" fill="var(--text-hint)" opacity={0.6}
        dominantBaseline="middle">
        {lineLengthLabel(len)}
      </text>
    );
  }

  const lastPt = polygon.length > 0 && !closed ? polygon[polygon.length - 1] : null;

  return (
    <div>
      <div className="flex items-center gap-3 mb-2">
        <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Custom Shape Editor
        </div>
        <div className="text-xs" style={{ color: 'var(--text-hint)' }}>
          cursor: ({cursor.x.toFixed(2)}, {cursor.y.toFixed(2)}) in
        </div>
        {polygon.length > 0 && (
          <button onClick={removeLastPoint} className="text-xs px-2 py-0.5 rounded"
            style={{ color: '#ef4444', border: '1px solid #ef4444' }}>
            Undo
          </button>
        )}
        {polygon.length >= 3 && !closed && (
          <button onClick={closePolygon} className="text-xs px-2 py-0.5 rounded"
            style={{ color: '#22c55e', border: '1px solid #22c55e' }}>
            Close (C)
          </button>
        )}
        {polygon.length > 0 && (
          <button onClick={clearAll} className="text-xs px-2 py-0.5 rounded"
            style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
            Clear
          </button>
        )}
      </div>

      <svg
        ref={svgRef}
        width={svgW}
        height={svgH}
        tabIndex={0}
        onMouseMove={handleMouseMove}
        onClick={placePoint}
        onKeyDown={handleKeyDown}
        style={{
          display: 'block',
          outline: 'none',
          cursor: closed ? 'default' : 'crosshair',
          background: 'var(--bg-input)',
          borderRadius: '4px',
          border: '1px solid var(--border)',
        }}
      >
        {gridLines}
        {axisLabels}

        {closed && polyPath && (
          <path d={polyPath} fill="var(--accent)" opacity={0.15} />
        )}

        {polyPath && (
          <path d={polyPath} fill="none" stroke="var(--accent)" strokeWidth={1.5} />
        )}

        {lastPt && !closed && (
          <line
            x1={toSvgX(lastPt.x)} y1={toSvgY(lastPt.y)}
            x2={toSvgX(cursor.x)} y2={toSvgY(cursor.y)}
            stroke="var(--accent)" strokeWidth={1} strokeDasharray="4,3" opacity={0.5}
          />
        )}

        {!closed && polygon.length >= 3 && (() => {
          const first = polygon[0];
          const dist = Math.sqrt((cursor.x - first.x) ** 2 + (cursor.y - first.y) ** 2);
          if (dist < GRID * 2) {
            return (
              <circle cx={toSvgX(first.x)} cy={toSvgY(first.y)} r={8}
                fill="none" stroke="#22c55e" strokeWidth={2} opacity={0.7} />
            );
          }
          return null;
        })()}

        {segmentLabels}

        {pts.map((p, i) => (
          <circle key={i}
            cx={toSvgX(p.x)} cy={toSvgY(p.y)} r={hoveredIdx === i ? 5 : 3.5}
            fill={i === 0 ? '#22c55e' : 'var(--accent)'}
            stroke="white" strokeWidth={0.5}
            onMouseEnter={() => setHoveredIdx(i)}
            onMouseLeave={() => setHoveredIdx(null)}
          />
        ))}

        {!closed && (
          <g>
            <line x1={toSvgX(cursor.x) - 6} y1={toSvgY(cursor.y)}
              x2={toSvgX(cursor.x) + 6} y2={toSvgY(cursor.y)}
              stroke="white" strokeWidth={1} opacity={0.7} />
            <line x1={toSvgX(cursor.x)} y1={toSvgY(cursor.y) - 6}
              x2={toSvgX(cursor.x)} y2={toSvgY(cursor.y) + 6}
              stroke="white" strokeWidth={1} opacity={0.7} />
          </g>
        )}
      </svg>

      <div className="text-xs mt-1 space-y-0.5" style={{ color: 'var(--text-hint)' }}>
        <div>Click or Space/Enter to place point. Arrow keys to move cursor ({GRID}" steps, Shift for {FAST_STEP}").</div>
        <div>C to close shape. Backspace to undo. Green dot = first point (click to close).</div>
      </div>
    </div>
  );
}
