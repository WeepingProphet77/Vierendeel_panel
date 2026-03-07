/**
 * Modal for prestress/reinforcement design of a selected Vierendeel member.
 * User configures cross-section geometry, steel layers, then views ACI 318 capacity results.
 */

import { useState, useMemo, useCallback } from 'react';
import type { Member, MemberForces, MemberStresses, MaterialProperties, PrestressSectionInput, SteelLayer, SteelPreset } from '../types';
import { analyzeBeam } from '../engine/prestressAnalysis';
import steelPresets from '../data/steelPresets';
import PrestressDesignResults from './PrestressDesignResults';

interface Props {
  member: Member;
  forces: MemberForces;
  stresses: MemberStresses;
  material: MaterialProperties;
  onClose: () => void;
}

let nextLayerId = 1;

function defaultSection(member: Member, material: MaterialProperties): PrestressSectionInput {
  return {
    sectionType: 'rectangular',
    bf: member.thicknessIn,
    bw: member.thicknessIn,
    hf: member.depthIn * 0.2,
    h: member.depthIn,
    fc: material.fcPsi / 1000, // psi → ksi
  };
}

function makeLayer(preset: SteelPreset): SteelLayer {
  return {
    id: nextLayerId++,
    steelPresetId: preset.id,
    area: 0.153, // default: one #4 bar
    depth: 0,
    fse: preset.defaultFse,
    steel: preset,
  };
}

export default function PrestressDesignModal({ member, forces, stresses, material, onClose }: Props) {
  const [section, setSection] = useState<PrestressSectionInput>(() => defaultSection(member, material));
  const [layers, setLayers] = useState<SteelLayer[]>(() => {
    const preset = steelPresets.find(p => p.id === 'grade60')!;
    const layer = makeLayer(preset);
    layer.depth = member.depthIn - 2.5; // typical cover
    return [layer];
  });

  const Mu = Math.abs(forces.maxMomentFtKips);
  const Mservice = Mu; // simplified: same as factored for display

  const result = useMemo(() => {
    if (layers.length === 0) return null;
    if (layers.some(l => l.depth <= 0 || l.area <= 0)) return null;
    try {
      return analyzeBeam(section, layers);
    } catch {
      return null;
    }
  }, [section, layers]);

  const updateSection = useCallback(<K extends keyof PrestressSectionInput>(key: K, val: PrestressSectionInput[K]) => {
    setSection(prev => ({ ...prev, [key]: val }));
  }, []);

  const updateLayer = useCallback((id: number, field: keyof SteelLayer, val: number | string) => {
    setLayers(prev => prev.map(l => {
      if (l.id !== id) return l;
      if (field === 'steelPresetId') {
        const preset = steelPresets.find(p => p.id === val)!;
        return { ...l, steelPresetId: val as string, steel: preset, fse: preset.defaultFse };
      }
      return { ...l, [field]: val };
    }));
  }, []);

  const addLayer = useCallback(() => {
    const preset = steelPresets.find(p => p.id === 'grade60')!;
    const layer = makeLayer(preset);
    layer.depth = section.h - 2.5;
    setLayers(prev => [...prev, layer]);
  }, [section.h]);

  const removeLayer = useCallback((id: number) => {
    setLayers(prev => prev.filter(l => l.id !== id));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)' }}>
      <div className="rounded-lg shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto"
        style={{ background: 'var(--bg-panel)', border: '1px solid var(--border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between p-4" style={{ borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--accent)' }}>
              Prestress / Reinforcement Design
            </h2>
            <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Member {member.id}: {member.label} | Mu = {Mu.toFixed(2)} kip-ft | Gov. Tension = {stresses.governingTensilePsi.toFixed(0)} psi
            </div>
          </div>
          <button onClick={onClose} className="text-lg px-2 hover:opacity-70" style={{ color: 'var(--text-secondary)' }}>
            ✕
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* Section Geometry */}
          <div>
            <div className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>Section Geometry</div>
            <div className="grid grid-cols-6 gap-2">
              <div className="col-span-2">
                <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Type</label>
                <select value={section.sectionType}
                  onChange={e => updateSection('sectionType', e.target.value as PrestressSectionInput['sectionType'])}
                  className="w-full text-xs p-1.5 rounded"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                  <option value="rectangular">Rectangular</option>
                  <option value="tbeam">T-Beam</option>
                  <option value="doubletee">Double Tee</option>
                  <option value="hollowcore">Hollow Core</option>
                </select>
              </div>
              <NumInput label="h (in)" value={section.h} onChange={v => updateSection('h', v)} />
              <NumInput label="bw (in)" value={section.bw} onChange={v => updateSection('bw', v)} />
              {(section.sectionType === 'tbeam' || section.sectionType === 'doubletee') && (
                <>
                  <NumInput label="bf (in)" value={section.bf} onChange={v => updateSection('bf', v)} />
                  <NumInput label="hf (in)" value={section.hf} onChange={v => updateSection('hf', v)} />
                </>
              )}
              {section.sectionType === 'doubletee' && (
                <>
                  <NumInput label="# Stems" value={section.numStems ?? 2} onChange={v => updateSection('numStems', v)} />
                  <NumInput label="Stem W" value={section.stemWidth ?? section.bw} onChange={v => updateSection('stemWidth', v)} />
                </>
              )}
              {section.sectionType === 'hollowcore' && (
                <>
                  <NumInput label="bf (in)" value={section.bf} onChange={v => updateSection('bf', v)} />
                  <NumInput label="# Voids" value={section.numVoids ?? 0} onChange={v => updateSection('numVoids', v)} />
                  <NumInput label="Void ∅" value={section.voidDiameter ?? 0} onChange={v => updateSection('voidDiameter', v)} />
                  <NumInput label="Void d" value={section.voidCenterDepth ?? section.h / 2} onChange={v => updateSection('voidCenterDepth', v)} />
                </>
              )}
              <NumInput label="f'c (ksi)" value={section.fc} onChange={v => updateSection('fc', v)} step={0.5} />
            </div>
          </div>

          {/* Steel Layers */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Steel Layers</div>
              <button onClick={addLayer} className="text-xs px-2 py-0.5 rounded"
                style={{ background: 'var(--accent)', color: 'white' }}>
                + Add Layer
              </button>
            </div>
            {layers.length === 0 && (
              <div className="text-xs italic" style={{ color: 'var(--text-hint)' }}>No steel layers. Add one to begin design.</div>
            )}
            {layers.map((layer) => (
              <div key={layer.id} className="grid grid-cols-6 gap-2 mb-2 items-end">
                <div className="col-span-2">
                  <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>Steel Type</label>
                  <select value={layer.steelPresetId}
                    onChange={e => updateLayer(layer.id, 'steelPresetId', e.target.value)}
                    className="w-full text-xs p-1.5 rounded"
                    style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                    {steelPresets.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <NumInput label="As (in²)" value={layer.area} onChange={v => updateLayer(layer.id, 'area', v)} step={0.01} />
                <NumInput label="d (in)" value={layer.depth} onChange={v => updateLayer(layer.id, 'depth', v)} step={0.25} />
                <NumInput label="fse (ksi)" value={layer.fse} onChange={v => updateLayer(layer.id, 'fse', v)} step={1} />
                <div className="flex items-end">
                  <button onClick={() => removeLayer(layer.id)} className="text-xs px-2 py-1.5 rounded hover:opacity-70"
                    style={{ color: '#ef4444', border: '1px solid #ef4444' }}>
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Results */}
          {result ? (
            <PrestressDesignResults
              result={result}
              section={section}
              Mu={Mu}
              Mservice={Mservice}
              frameTensilePsi={stresses.governingTensilePsi}
            />
          ) : layers.length > 0 ? (
            <div className="text-xs p-3 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text-hint)' }}>
              Enter valid layer depths and areas to see results. Each layer depth must be &gt; 0 and within section height.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Small numeric input helper */
function NumInput({ label, value, onChange, step = 0.1 }: {
  label: string; value: number; onChange: (v: number) => void; step?: number;
}) {
  return (
    <div>
      <label className="text-xs block mb-1" style={{ color: 'var(--text-tertiary)' }}>{label}</label>
      <input type="number" value={value} step={step}
        onChange={e => onChange(parseFloat(e.target.value) || 0)}
        className="w-full text-xs p-1.5 rounded"
        style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text-primary)' }} />
    </div>
  );
}
