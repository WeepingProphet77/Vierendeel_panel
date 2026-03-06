import { useCallback, useMemo } from 'react';
import type { FrameModel, AnalysisResults, AppInputs } from '../types';

interface Props {
  frameModel: FrameModel;
  results: AnalysisResults | null;
  inputs: AppInputs;
}

export default function SummaryTab({ frameModel, results, inputs }: Props) {
  const fr = 7.5 * Math.sqrt(inputs.material.fcPsi);
  const fc_limit = 0.60 * inputs.material.fcPsi;

  let govTensile = { memberId: 0, location: '', stress: 0, ratio: 0 };
  let govCompressive = { memberId: 0, location: '', stress: 0, ratio: 0 };

  if (results) {
    for (const s of results.memberStresses) {
      for (const [loc, face] of [['start', s.startFace], ['end', s.endFace]] as const) {
        const tRatio = face.maxTensilePsi / fr;
        if (tRatio > govTensile.ratio) {
          govTensile = { memberId: s.memberId, location: `${loc} face`, stress: face.maxTensilePsi, ratio: tRatio };
        }
        const cRatio = face.maxCompressivePsi / fc_limit;
        if (cRatio > govCompressive.ratio) {
          govCompressive = { memberId: s.memberId, location: `${loc} face`, stress: face.maxCompressivePsi, ratio: cRatio };
        }
      }
    }
  }

  const sortedMembers = useMemo(() => {
    if (!results) return [];
    return [...results.memberStresses].sort((a, b) => {
      const aMax = Math.max(
        a.startFace.maxTensilePsi / fr, a.endFace.maxTensilePsi / fr,
        a.startFace.maxCompressivePsi / fc_limit, a.endFace.maxCompressivePsi / fc_limit
      );
      const bMax = Math.max(
        b.startFace.maxTensilePsi / fr, b.endFace.maxTensilePsi / fr,
        b.startFace.maxCompressivePsi / fc_limit, b.endFace.maxCompressivePsi / fc_limit
      );
      return bMax - aMax;
    });
  }, [results, fr, fc_limit]);

  const exportCSV = useCallback(() => {
    if (!results) return;
    const rows: string[][] = [];
    rows.push(['Vierendeel Frame Analyzer - Summary Report']);
    rows.push([]);
    rows.push(['Panel Geometry']);
    rows.push(['Width (ft)', inputs.panel.widthFt.toString()]);
    rows.push(['Height (ft)', inputs.panel.heightFt.toString()]);
    rows.push(['Default Thickness (in)', inputs.panel.defaultThicknessIn.toString()]);
    rows.push([]);
    rows.push(['Loads']);
    rows.push(['Self-Weight (kips)', results.totalWeight.selfWeight.toFixed(3)]);
    rows.push(['Glass Weight (kips)', results.totalWeight.glassWeight.toFixed(3)]);
    rows.push(['Superimposed DL (kips)', results.totalWeight.superimposedWeight.toFixed(3)]);
    rows.push(['Total (kips)', results.totalWeight.total.toFixed(3)]);
    rows.push([]);
    rows.push(['Reactions']);
    for (const r of results.reactions) {
      rows.push([r.label, `V=${r.verticalKips.toFixed(3)} kips`, `H=${r.horizontalKips.toFixed(3)} kips`]);
    }
    rows.push([]);
    rows.push(['Max Deflection', `${results.maxDeflection.valueIn.toFixed(4)} in`, `Node ${results.maxDeflection.nodeId}`]);
    rows.push([]);
    rows.push(['Member Results']);
    rows.push(['ID', 'Label', 'Type', 'b(in)', 'FlexL(ft)', 'd(in)', 'P(kips)', 'V1(kips)', 'M1(ft-k)', 'ft1(psi)', 'fc1(psi)', 'V2(kips)', 'M2(ft-k)', 'ft2(psi)', 'fc2(psi)', 'Status']);
    for (const s of sortedMembers) {
      const m = frameModel.members.find(mm => mm.id === s.memberId)!;
      const f = results.memberForces.find(ff => ff.memberId === s.memberId)!;
      rows.push([
        m.id.toString(), m.label, m.orientation, m.thicknessIn.toFixed(1),
        m.flexibleLengthFt.toFixed(2), m.depthIn.toFixed(1),
        f.axialKips.toFixed(2), f.shearStartFaceKips.toFixed(2), f.momentStartFaceFtKips.toFixed(2),
        s.startFace.maxTensilePsi.toFixed(0), s.startFace.maxCompressivePsi.toFixed(0),
        f.shearEndFaceKips.toFixed(2), f.momentEndFaceFtKips.toFixed(2),
        s.endFace.maxTensilePsi.toFixed(0), s.endFace.maxCompressivePsi.toFixed(0),
        s.status,
      ]);
    }

    const csv = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'vierendeel_analysis_summary.csv';
    a.click();
    URL.revokeObjectURL(url);
  }, [results, frameModel, inputs, sortedMembers]);

  if (!results) {
    return <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No analysis results available.</div>;
  }

  return (
    <div>
      {/* Weight Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Applied Loads</h3>
          <div className="space-y-1 text-xs" style={{ color: 'var(--text-primary)' }}>
            <div className="flex justify-between"><span>Self-Weight:</span><span>{results.totalWeight.selfWeight.toFixed(3)} kips</span></div>
            <div className="flex justify-between"><span>Glass Weight:</span><span>{results.totalWeight.glassWeight.toFixed(3)} kips</span></div>
            <div className="flex justify-between"><span>Superimposed DL:</span><span>{results.totalWeight.superimposedWeight.toFixed(3)} kips</span></div>
            <div className="flex justify-between pt-1 font-semibold" style={{ borderTop: '1px solid var(--border)' }}>
              <span>Total:</span><span>{results.totalWeight.total.toFixed(3)} kips</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Support Reactions</h3>
          <div className="space-y-1 text-xs" style={{ color: 'var(--text-primary)' }}>
            {results.reactions.map(r => (
              <div key={r.nodeId} className="flex justify-between">
                <span>{r.label}:</span>
                <span>V = {r.verticalKips.toFixed(3)} k, H = {r.horizontalKips.toFixed(3)} k</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Key Results */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Max Deflection</h3>
          <div className="text-lg font-bold" style={{ color: 'var(--accent)' }}>{results.maxDeflection.valueIn.toFixed(4)}"</div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Node {results.maxDeflection.nodeId}</div>
        </div>

        <div className={`p-3 rounded border ${govTensile.ratio > 1 ? 'bg-yellow-900/20 border-yellow-700' : ''}`}
          style={govTensile.ratio <= 1 ? { background: 'var(--bg-input)', border: '1px solid var(--border)' } : undefined}>
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Governing Tensile Stress</h3>
          <div className={`text-lg font-bold ${govTensile.ratio > 1 ? 'text-yellow-400' : 'text-green-400'}`}>
            {govTensile.stress.toFixed(0)} psi
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Member {govTensile.memberId}, {govTensile.location} ({(govTensile.ratio * 100).toFixed(0)}% of f_r)
          </div>
        </div>

        <div className={`p-3 rounded border ${govCompressive.ratio > 1 ? 'bg-red-900/20 border-red-700' : ''}`}
          style={govCompressive.ratio <= 1 ? { background: 'var(--bg-input)', border: '1px solid var(--border)' } : undefined}>
          <h3 className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Governing Compressive Stress</h3>
          <div className={`text-lg font-bold ${govCompressive.ratio > 1 ? 'text-red-400' : 'text-green-400'}`}>
            {govCompressive.stress.toFixed(0)} psi
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Member {govCompressive.memberId}, {govCompressive.location} ({(govCompressive.ratio * 100).toFixed(0)}% of 0.6f'c)
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Members Sorted by Stress Ratio (Descending)</h3>
      <div className="overflow-x-auto mb-4">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Max ft/fr</th>
              <th>Max fc/0.6f'c</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {sortedMembers.map(s => {
              const m = frameModel.members.find(mm => mm.id === s.memberId)!;
              const maxTRatio = Math.max(s.startFace.maxTensilePsi, s.endFace.maxTensilePsi) / fr;
              const maxCRatio = Math.max(s.startFace.maxCompressivePsi, s.endFace.maxCompressivePsi) / fc_limit;

              let rowClass = '';
              if (s.status === 'High Compression') rowClass = 'bg-red-900/30';
              else if (s.status === 'Cracked') rowClass = 'bg-yellow-900/20';

              return (
                <tr key={s.memberId} className={rowClass}>
                  <td>{m.id}</td>
                  <td className="text-left" style={{ color: 'var(--text-secondary)' }}>{m.label}</td>
                  <td className={maxTRatio > 1 ? 'text-yellow-400 font-semibold' : ''}>
                    {(maxTRatio * 100).toFixed(1)}%
                  </td>
                  <td className={maxCRatio > 1 ? 'text-red-400 font-semibold' : ''}>
                    {(maxCRatio * 100).toFixed(1)}%
                  </td>
                  <td className={`text-left font-semibold ${
                    s.status === 'OK' ? 'text-green-400' :
                    s.status === 'Cracked' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {s.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Export */}
      <button
        onClick={exportCSV}
        className="px-4 py-2 text-white rounded text-sm font-medium hover:opacity-90 transition-opacity"
        style={{ background: 'var(--accent)' }}
      >
        Export Summary as CSV
      </button>
    </div>
  );
}
