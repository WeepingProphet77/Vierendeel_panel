/**
 * Results display within the prestress design modal.
 * Shows capacity checks, ductility, cracking analysis, and diagrams.
 */

import type { PrestressDesignResult, PrestressSectionInput } from '../types';
import PrestressSectionDiagram from './PrestressSectionDiagram';

interface Props {
  result: PrestressDesignResult;
  section: PrestressSectionInput;
  Mu: number;       // factored moment demand, kip-ft
  Mservice?: number;  // service moment, kip-ft (reserved for future use)
  frameTensilePsi: number;
}

export default function PrestressDesignResults({ result, section, Mu, frameTensilePsi }: Props) {
  const { phiMnFt, MnFt, phi, epsilonT, cOverD, ductile, transition, cracking, layerResults } = result;
  const capacityPass = phiMnFt >= Mu;
  const mcrPass = cracking.passesMinStrength;

  // Precompressive stress at tension face (psi)
  const { P, e, sectionProps } = cracking;
  const { A, Ig, yb } = sectionProps;
  const precompPsi = P > 0 ? (P * 1000 / A) + (P * 1000 * e * yb / Ig) : 0;
  const netTensilePsi = Math.max(0, frameTensilePsi - precompPsi);

  return (
    <div className="space-y-4">
      {/* Capacity Check */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-3 rounded" style={{
          background: capacityPass ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${capacityPass ? '#22c55e' : '#ef4444'}`
        }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            Flexural Capacity Check
          </div>
          <div className={`text-lg font-bold ${capacityPass ? 'text-green-400' : 'text-red-400'}`}>
            {capacityPass ? 'PASS' : 'FAIL'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            <span style={{ color: 'var(--accent)' }}>{'\u03C6'}Mn = {phiMnFt.toFixed(2)} kip-ft</span>
            {' vs '}
            Mu = {Mu.toFixed(2)} kip-ft
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Mn = {MnFt.toFixed(2)} kip-ft | {'\u03C6'} = {phi.toFixed(3)}
          </div>
        </div>

        <div className="p-3 rounded" style={{
          background: mcrPass ? 'rgba(34,197,94,0.1)' : 'rgba(234,179,8,0.1)',
          border: `1px solid ${mcrPass ? '#22c55e' : '#eab308'}`
        }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>
            1.2Mcr Check
          </div>
          <div className={`text-lg font-bold ${mcrPass ? 'text-green-400' : 'text-yellow-400'}`}>
            {mcrPass ? 'PASS' : 'FAIL'}
          </div>
          <div className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
            {'\u03C6'}Mn = {result.phiMnFt.toFixed(2)} vs 1.2Mcr = {(cracking.McrFt * 1.2).toFixed(2)} kip-ft
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Mcr = {cracking.McrFt.toFixed(2)} kip-ft | fr = {(cracking.fr * 1000).toFixed(0)} psi
          </div>
        </div>
      </div>

      {/* Ductility and Stress Info */}
      <div className="grid grid-cols-3 gap-3">
        <div className="p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Ductility</div>
          <div className={`text-sm font-bold ${ductile ? 'text-green-400' : transition ? 'text-yellow-400' : 'text-red-400'}`}>
            {ductile ? 'Tension-Controlled' : transition ? 'Transition' : 'Compression-Controlled'}
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            c/d = {cOverD.toFixed(3)} | {'\u03B5'}t = {epsilonT.toFixed(5)}
          </div>
        </div>

        <div className="p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Prestress at Tension Face</div>
          <div className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
            {precompPsi.toFixed(0)} psi
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            P = {P.toFixed(2)} kips | e = {e.toFixed(2)} in
          </div>
        </div>

        <div className="p-3 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Net Service Tensile Stress</div>
          <div className={`text-sm font-bold ${netTensilePsi <= 0 ? 'text-green-400' : 'text-yellow-400'}`}>
            {netTensilePsi.toFixed(0)} psi
          </div>
          <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
            Frame: {frameTensilePsi.toFixed(0)} - Prestress: {precompPsi.toFixed(0)}
          </div>
        </div>
      </div>

      {/* Layer Results Table */}
      {layerResults.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-secondary)' }}>Steel Layer Results</div>
          <table>
            <thead>
              <tr>
                <th>Layer</th>
                <th>d (in)</th>
                <th>As (in{'\u00B2'})</th>
                <th>fse (ksi)</th>
                <th>{'\u03B5'}s</th>
                <th>fs (ksi)</th>
                <th>Force (kips)</th>
              </tr>
            </thead>
            <tbody>
              {layerResults.map((lr, i) => (
                <tr key={i}>
                  <td>{i + 1}</td>
                  <td>{lr.depth.toFixed(2)}</td>
                  <td>{lr.area.toFixed(3)}</td>
                  <td>{lr.fse.toFixed(1)}</td>
                  <td>{lr.strain.toFixed(5)}</td>
                  <td>{lr.stress.toFixed(1)}</td>
                  <td className={lr.force >= 0 ? 'text-red-400' : 'text-blue-400'}>
                    {lr.force.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Section & Strain Diagram */}
      <PrestressSectionDiagram section={section} result={result} />

      {/* Section Properties */}
      <div className="text-xs p-2 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-tertiary)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-secondary)' }}>Gross Section: </span>
        A = {sectionProps.A.toFixed(1)} in{'\u00B2'} |
        yCg = {sectionProps.yCg.toFixed(2)} in |
        Ig = {sectionProps.Ig.toFixed(0)} in{'\u2074'} |
        yb = {sectionProps.yb.toFixed(2)} in |
        Sb = {sectionProps.Sb.toFixed(0)} in{'\u00B3'}
      </div>
    </div>
  );
}
