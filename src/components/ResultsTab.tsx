import type { FrameModel, AnalysisResults, MaterialProperties } from '../types';

interface Props {
  frameModel: FrameModel;
  results: AnalysisResults | null;
  material: MaterialProperties;
}

export default function ResultsTab({ frameModel, results, material }: Props) {
  if (!results) {
    return <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No analysis results available. Check model for errors.</div>;
  }

  const fr = 7.5 * Math.sqrt(material.fcPsi);
  const fc_limit = 0.60 * material.fcPsi;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Member Forces and Stresses</h3>
      <div className="overflow-x-auto mb-6">
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Label</th>
              <th>Type</th>
              <th>b (in)</th>
              <th>Flex L (ft)</th>
              <th>d (in)</th>
              <th>P (kips)</th>
              <th>V₁ (kips)</th>
              <th>M₁ (ft-k)</th>
              <th>ft₁ (psi)</th>
              <th>fc₁ (psi)</th>
              <th>V₂ (kips)</th>
              <th>M₂ (ft-k)</th>
              <th>ft₂ (psi)</th>
              <th>fc₂ (psi)</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {frameModel.members.map(m => {
              const forces = results.memberForces.find(f => f.memberId === m.id);
              const stresses = results.memberStresses.find(s => s.memberId === m.id);
              if (!forces || !stresses) return null;

              let rowClass = '';
              if (stresses.status === 'High Compression') rowClass = 'bg-red-900/30';
              else if (stresses.status === 'Cracked') rowClass = 'bg-yellow-900/20';
              else rowClass = 'bg-green-900/10';

              return (
                <tr key={m.id} className={rowClass}>
                  <td>{m.id}</td>
                  <td className="text-left max-w-32 truncate" style={{ color: 'var(--text-secondary)' }} title={m.label}>{m.label}</td>
                  <td className="text-left">{m.orientation === 'horizontal' ? 'H' : 'V'}</td>
                  <td>{m.thicknessIn.toFixed(1)}</td>
                  <td>{m.flexibleLengthFt.toFixed(2)}</td>
                  <td>{m.depthIn.toFixed(1)}</td>
                  <td>{forces.axialKips.toFixed(2)}</td>
                  <td>{forces.shearStartFaceKips.toFixed(2)}</td>
                  <td>{forces.momentStartFaceFtKips.toFixed(2)}</td>
                  <td>{stresses.startFace.maxTensilePsi.toFixed(0)}</td>
                  <td>{stresses.startFace.maxCompressivePsi.toFixed(0)}</td>
                  <td>{forces.shearEndFaceKips.toFixed(2)}</td>
                  <td>{forces.momentEndFaceFtKips.toFixed(2)}</td>
                  <td>{stresses.endFace.maxTensilePsi.toFixed(0)}</td>
                  <td>{stresses.endFace.maxCompressivePsi.toFixed(0)}</td>
                  <td className={`text-left font-semibold ${
                    stresses.status === 'OK' ? 'text-green-400' :
                    stresses.status === 'Cracked' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {stresses.status}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Stress reference */}
      <div className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        f_r = {fr.toFixed(0)} psi (modulus of rupture) | 0.60 f'c = {fc_limit.toFixed(0)} psi
        <br />V₁/M₁/ft₁/fc₁ = start face | V₂/M₂/ft₂/fc₂ = end face | P = axial (+ tension)
      </div>

      {/* Reactions */}
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Support Reactions</h3>
      <div className="overflow-x-auto mb-4">
        <table>
          <thead>
            <tr>
              <th className="text-left">Support</th>
              <th>Node</th>
              <th>V (kips)</th>
              <th>H (kips)</th>
            </tr>
          </thead>
          <tbody>
            {results.reactions.map(r => (
              <tr key={r.nodeId}>
                <td className="text-left">{r.label}</td>
                <td>{r.nodeId}</td>
                <td>{r.verticalKips.toFixed(3)}</td>
                <td>{r.horizontalKips.toFixed(3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Equilibrium Check */}
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Equilibrium Check</h3>
      <div className="text-xs space-y-1 p-3 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
        <div>Total Applied Load: {results.totalWeight.total.toFixed(3)} kips</div>
        <div>Total Vertical Reactions: {results.reactions.reduce((s, r) => s + r.verticalKips, 0).toFixed(3)} kips</div>
        <div>Vertical Residual: {results.equilibriumResidual.verticalKips.toFixed(6)} kips
          {Math.abs(results.equilibriumResidual.verticalKips / results.totalWeight.total) > 0.001 && (
            <span className="text-yellow-400 ml-2">WARNING: Residual exceeds 0.1%</span>
          )}
        </div>
      </div>
    </div>
  );
}
