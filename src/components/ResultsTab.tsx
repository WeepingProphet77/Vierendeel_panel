import { useState } from 'react';
import type { FrameModel, AnalysisResults, MaterialProperties, SavedPrestressDesign } from '../types';
import { isDesignStale } from '../types';
import MemberDiagrams from './MemberDiagrams';
import PrestressDesignModal from './PrestressDesignModal';

interface Props {
  frameModel: FrameModel;
  results: AnalysisResults | null;
  material: MaterialProperties;
  selectedMemberId: number | null;
  onSelectMember: (id: number | null) => void;
  prestressDesigns: Record<number, SavedPrestressDesign>;
  onSavePrestressDesign: (design: SavedPrestressDesign) => void;
  onSavePrestressBatch: (designs: SavedPrestressDesign[]) => void;
  onClearPrestressDesign: (memberId: number) => void;
}

export default function ResultsTab({ frameModel, results, material, selectedMemberId, onSelectMember, prestressDesigns, onSavePrestressDesign, onSavePrestressBatch, onClearPrestressDesign }: Props) {
  const [prestressModalOpen, setPrestressModalOpen] = useState(false);

  if (!results) {
    return <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>No analysis results available. Check model for errors.</div>;
  }

  const fr = 7.5 * Math.sqrt(material.fcPsi);
  const fc_limit = 0.60 * material.fcPsi;

  const selectedMember = selectedMemberId ? frameModel.members.find(m => m.id === selectedMemberId) : null;
  const selectedForces = selectedMemberId ? results.memberForces.find(f => f.memberId === selectedMemberId) : null;
  const selectedStresses = selectedMemberId ? results.memberStresses.find(s => s.memberId === selectedMemberId) : null;

  return (
    <div>
      <h3 className="text-sm font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>
        Member Forces and Stresses
        <span className="font-normal ml-2" style={{ color: 'var(--text-hint)' }}>(click a row to view diagrams)</span>
      </h3>
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
              <th>V₂ (kips)</th>
              <th>M₂ (ft-k)</th>
              <th>M_max (ft-k)</th>
              <th>Gov ft (psi)</th>
              <th>Gov fc (psi)</th>
              <th>Status</th>
              <th>Mu (ft-k)</th>
              <th>{'\u03C6'}Mn (ft-k)</th>
              <th>Util.</th>
            </tr>
          </thead>
          <tbody>
            {frameModel.members.map(m => {
              const forces = results.memberForces.find(f => f.memberId === m.id);
              const stresses = results.memberStresses.find(s => s.memberId === m.id);
              if (!forces || !stresses) return null;

              const pd = prestressDesigns[m.id];
              const fcKsi = material.fcPsi / 1000;
              const stale = pd ? isDesignStale(pd, m, fcKsi) : false;

              const isSelected = m.id === selectedMemberId;
              let rowClass = '';
              if (isSelected) rowClass = 'bg-blue-900/30';
              else if (stresses.status === 'High Compression') rowClass = 'bg-red-900/30';
              else if (stresses.status === 'Cracked') rowClass = 'bg-yellow-900/20';
              else rowClass = 'bg-green-900/10';

              const mMaxExceedsFaces = Math.abs(forces.maxMomentFtKips) > Math.abs(forces.momentStartFaceFtKips) + 0.01 &&
                Math.abs(forces.maxMomentFtKips) > Math.abs(forces.momentEndFaceFtKips) + 0.01;

              return (
                <tr key={m.id} className={`cursor-pointer ${rowClass}`}
                  onClick={() => onSelectMember(isSelected ? null : m.id)}>
                  <td>{m.id}</td>
                  <td className="text-left max-w-32 truncate" style={{ color: 'var(--text-secondary)' }} title={m.label}>{m.label}</td>
                  <td className="text-left">{m.orientation === 'horizontal' ? 'H' : 'V'}</td>
                  <td>{m.thicknessIn.toFixed(1)}</td>
                  <td>{m.flexibleLengthFt.toFixed(2)}</td>
                  <td>{m.depthIn.toFixed(1)}</td>
                  <td>{forces.axialKips.toFixed(2)}</td>
                  <td>{forces.shearStartFaceKips.toFixed(2)}</td>
                  <td>{forces.momentStartFaceFtKips.toFixed(2)}</td>
                  <td>{forces.shearEndFaceKips.toFixed(2)}</td>
                  <td>{forces.momentEndFaceFtKips.toFixed(2)}</td>
                  <td className={mMaxExceedsFaces ? 'font-semibold' : ''} style={mMaxExceedsFaces ? { color: 'var(--accent)' } : undefined}>
                    {forces.maxMomentFtKips.toFixed(2)}
                  </td>
                  <td className={stresses.governingTensilePsi > fr ? 'text-yellow-400 font-semibold' : ''}>
                    {stresses.governingTensilePsi.toFixed(0)}
                  </td>
                  <td className={stresses.governingCompressivePsi > fc_limit ? 'text-red-400 font-semibold' : ''}>
                    {stresses.governingCompressivePsi.toFixed(0)}
                  </td>
                  <td className={`text-left font-semibold ${
                    stresses.status === 'OK' ? 'text-green-400' :
                    stresses.status === 'Cracked' ? 'text-yellow-400' : 'text-red-400'
                  }`}>
                    {stresses.status}
                  </td>
                  {pd ? (
                    <>
                      <td>{pd.Mu.toFixed(2)}</td>
                      <td style={{ color: stale ? '#eab308' : 'var(--accent)' }}>{pd.phiMnFt.toFixed(2)}</td>
                      <td className={`font-semibold ${stale ? 'text-yellow-400' : pd.utilization <= 1.0 ? 'text-green-400' : 'text-red-400'}`}>
                        {stale ? 'Stale' : `${(pd.utilization * 100).toFixed(0)}%`}
                      </td>
                    </>
                  ) : stresses.status === 'Cracked' || stresses.status === 'High Compression' ? (
                    <>
                      <td style={{ color: 'var(--text-hint)' }}>—</td>
                      <td style={{ color: 'var(--text-hint)' }}>—</td>
                      <td>
                        <button
                          className="text-xs px-1.5 py-0.5 rounded font-semibold"
                          style={{ background: 'var(--accent)', color: 'white', fontSize: '0.6rem' }}
                          onClick={e => {
                            e.stopPropagation();
                            onSelectMember(m.id);
                            setPrestressModalOpen(true);
                          }}>
                          Design
                        </button>
                      </td>
                    </>
                  ) : (
                    <>
                      <td style={{ color: 'var(--text-hint)' }}>—</td>
                      <td style={{ color: 'var(--text-hint)' }}>—</td>
                      <td style={{ color: 'var(--text-hint)' }}>—</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Force/Stress Diagrams for selected member */}
      {selectedMember && selectedForces && selectedStresses && (
        <div className="mb-6">
          <MemberDiagrams
            member={selectedMember}
            forces={selectedForces}
            stresses={selectedStresses}
            material={material}
            onOpenPrestressDesign={() => setPrestressModalOpen(true)}
            prestressDesign={prestressDesigns[selectedMember.id]}
          />
        </div>
      )}

      {prestressModalOpen && selectedMember && selectedForces && selectedStresses && (
        <PrestressDesignModal
          member={selectedMember}
          forces={selectedForces}
          stresses={selectedStresses}
          material={material}
          savedDesign={prestressDesigns[selectedMember.id]}
          allDesigns={prestressDesigns}
          allMembers={frameModel.members}
          allForces={results.memberForces}
          onSave={onSavePrestressDesign}
          onSaveBatch={onSavePrestressBatch}
          onClear={onClearPrestressDesign}
          onClose={() => setPrestressModalOpen(false)}
        />
      )}

      {/* Stress reference */}
      <div className="text-xs mb-4" style={{ color: 'var(--text-tertiary)' }}>
        f_r = {fr.toFixed(0)} psi (modulus of rupture) | 0.60 f'c = {fc_limit.toFixed(0)} psi
        <br />V₁/M₁ = start face | V₂/M₂ = end face | M_max = peak moment in flex span | P = axial (+ tension)
        <br />Gov ft/fc = governing tensile/compressive stress across all critical sections (faces + mid-span)
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
