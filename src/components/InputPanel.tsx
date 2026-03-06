import { useState, useCallback } from 'react';
import type { AppInputs, FrameModel } from '../types';

interface Props {
  inputs: AppInputs;
  onChange: (inputs: AppInputs) => void;
  frameModel: FrameModel;
  onMemberThicknessChange: (memberId: number, thickness: number) => void;
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="mb-2">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-2 rounded text-sm font-semibold"
        style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}
      >
        {title}
        <span className="text-xs">{open ? '\u25BC' : '\u25B6'}</span>
      </button>
      {open && <div className="px-3 py-2 space-y-2">{children}</div>}
    </div>
  );
}

function Field({ label, unit, value, onChange, min, step }: {
  label: string; unit?: string; value: number; onChange: (v: number) => void; min?: number; step?: number;
}) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-xs flex-1 min-w-0" style={{ color: 'var(--text-secondary)' }}>{label}</label>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={e => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          step={step || 0.1}
          className="w-20 text-right"
        />
        {unit && <span className="text-xs w-8" style={{ color: 'var(--text-tertiary)' }}>{unit}</span>}
      </div>
    </div>
  );
}

export default function InputPanel({ inputs, onChange, frameModel, onMemberThicknessChange }: Props) {
  const update = useCallback((fn: (draft: AppInputs) => void) => {
    const next = JSON.parse(JSON.stringify(inputs)) as AppInputs;
    fn(next);
    onChange(next);
  }, [inputs, onChange]);

  return (
    <div className="p-3 text-sm">
      <h1 className="text-base font-bold mb-3" style={{ color: 'var(--text-primary)' }}>Vierendeel Frame Analyzer</h1>

      <Section title="Panel Geometry">
        <Field label="Width" unit="ft" value={inputs.panel.widthFt}
          onChange={v => update(d => { d.panel.widthFt = v; d.supports.rightXFt = v - 1; })} min={1} />
        <Field label="Height" unit="ft" value={inputs.panel.heightFt}
          onChange={v => update(d => { d.panel.heightFt = v; })} min={1} />
        <Field label="Default Thickness" unit="in" value={inputs.panel.defaultThicknessIn}
          onChange={v => update(d => { d.panel.defaultThicknessIn = v; })} min={1} step={0.5} />
        <div className="flex items-center gap-2">
          <label className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>Number of Openings</label>
          <select
            value={inputs.panel.numOpenings}
            onChange={e => update(d => { d.panel.numOpenings = parseInt(e.target.value); })}
            className="w-20 text-right"
          >
            {[1, 2, 3, 4].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
      </Section>

      <Section title="Openings">
        {(() => {
          // Sort openings by centerX for display and gap computation
          const sortedIndices = inputs.openings
            .map((_, i) => i)
            .sort((a, b) => inputs.openings[a].centerXFt - inputs.openings[b].centerXFt);

          return sortedIndices.map((origIdx, displayIdx) => {
            const o = inputs.openings[origIdx];
            const leftEdge = o.centerXFt - o.widthFt / 2;
            const bottomEdge = o.centerYFt - o.heightFt / 2;

            // Compute horizontal gap: distance from panel left (first) or previous opening right edge
            let gapFrom: number;
            if (displayIdx === 0) {
              gapFrom = leftEdge;
            } else {
              const prevIdx = sortedIndices[displayIdx - 1];
              const prev = inputs.openings[prevIdx];
              const prevRightEdge = prev.centerXFt + prev.widthFt / 2;
              gapFrom = leftEdge - prevRightEdge;
            }

            const gapLabel = displayIdx === 0
              ? 'Left Edge Setback'
              : `Gap from Opening ${displayIdx}`;

            return (
              <div key={origIdx} className="mb-3 p-2 rounded" style={{ background: 'var(--bg-card)' }}>
                <div className="text-xs font-semibold mb-1" style={{ color: 'var(--text-tertiary)' }}>Opening {displayIdx + 1}</div>
                <div className="space-y-1">
                  <Field label={gapLabel} unit="ft"
                    value={Math.round(gapFrom * 100) / 100}
                    onChange={v => update(d => {
                      let newLeftEdge: number;
                      if (displayIdx === 0) {
                        newLeftEdge = v;
                      } else {
                        const prevIdx2 = sortedIndices[displayIdx - 1];
                        const prev2 = d.openings[prevIdx2];
                        newLeftEdge = prev2.centerXFt + prev2.widthFt / 2 + v;
                      }
                      d.openings[origIdx].centerXFt = Math.round((newLeftEdge + d.openings[origIdx].widthFt / 2) * 100) / 100;
                    })} min={0} />
                  <Field label="Bottom Setback" unit="ft"
                    value={Math.round(bottomEdge * 100) / 100}
                    onChange={v => update(d => {
                      d.openings[origIdx].centerYFt = Math.round((v + d.openings[origIdx].heightFt / 2) * 100) / 100;
                    })} min={0} />
                  <Field label="Width" unit="ft" value={o.widthFt}
                    onChange={v => update(d => {
                      // Keep the left edge fixed when changing width
                      const curLeftEdge = d.openings[origIdx].centerXFt - d.openings[origIdx].widthFt / 2;
                      d.openings[origIdx].widthFt = v;
                      d.openings[origIdx].centerXFt = Math.round((curLeftEdge + v / 2) * 100) / 100;
                    })} min={0.5} />
                  <Field label="Height" unit="ft" value={o.heightFt}
                    onChange={v => update(d => {
                      // Keep the bottom edge fixed when changing height
                      const curBotEdge = d.openings[origIdx].centerYFt - d.openings[origIdx].heightFt / 2;
                      d.openings[origIdx].heightFt = v;
                      d.openings[origIdx].centerYFt = Math.round((curBotEdge + v / 2) * 100) / 100;
                    })} min={0.5} />
                </div>
              </div>
            );
          });
        })()}
      </Section>

      <Section title="Supports">
        <Field label="Left Support X" unit="ft" value={inputs.supports.leftXFt}
          onChange={v => update(d => { d.supports.leftXFt = v; })} min={0} />
        <Field label="Right Support X" unit="ft" value={inputs.supports.rightXFt}
          onChange={v => update(d => { d.supports.rightXFt = v; })} min={0} />
        <div className="text-xs mt-1" style={{ color: 'var(--text-hint)' }}>Left: Pin (dx, dy) | Right: Roller (dy)</div>
      </Section>

      <Section title="Material Properties">
        <Field label="Unit Weight" unit="pcf" value={inputs.material.unitWeightPcf}
          onChange={v => update(d => { d.material.unitWeightPcf = v; })} min={1} step={1} />
        <Field label="f'c" unit="psi" value={inputs.material.fcPsi}
          onChange={v => update(d => { d.material.fcPsi = v; d.material.ePsi = 57000 * Math.sqrt(v); })} min={1000} step={500} />
        <div className="text-xs" style={{ color: 'var(--text-hint)' }}>
          E = {(inputs.material.ePsi / 1000).toFixed(0)} ksi ({(inputs.material.ePsi).toFixed(0)} psi)
        </div>
      </Section>

      <Section title="Loading">
        <Field label="Glass Weight" unit="psf" value={inputs.loading.glassWeightPsf}
          onChange={v => update(d => { d.loading.glassWeightPsf = v; })} min={0} step={1} />
        <Field label="Superimposed DL" unit="psf" value={inputs.loading.superimposedDeadLoadPsf}
          onChange={v => update(d => { d.loading.superimposedDeadLoadPsf = v; })} min={0} step={1} />
      </Section>

      {frameModel.members.length > 0 && (
        <Section title="Member Thicknesses" defaultOpen={false}>
          <div className="text-xs mb-2" style={{ color: 'var(--text-hint)' }}>
            Override individual member thicknesses. Unmodified members use the panel default ({inputs.panel.defaultThicknessIn} in).
          </div>
          <div className="overflow-x-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="text-left">ID</th>
                  <th className="text-left">Label</th>
                  <th>Thickness (in)</th>
                </tr>
              </thead>
              <tbody>
                {frameModel.members.map(m => (
                  <tr key={m.id} className={m.thicknessOverridden ? 'bg-blue-900/20' : ''}>
                    <td>{m.id}</td>
                    <td className="text-left max-w-32 truncate" style={{ color: 'var(--text-secondary)' }} title={m.label}>{m.label}</td>
                    <td>
                      <input
                        type="number"
                        value={m.thicknessIn}
                        onChange={e => onMemberThicknessChange(m.id, parseFloat(e.target.value) || 1)}
                        min={1}
                        step={0.5}
                        className="w-16 text-right text-xs"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
