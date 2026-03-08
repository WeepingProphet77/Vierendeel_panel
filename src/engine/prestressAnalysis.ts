/**
 * Prestressed / Reinforced Concrete Beam Strength Calculator
 * Based on ACI 318 provisions and the Devalapura-Tadros (PCI) power formula.
 *
 * Ported from prestressed_beam_power/src/utils/beamCalculations.js
 * All units: ksi (stress), in (length), in² (area), kip (force), kip-in (moment)
 */

import type {
  PrestressSectionInput,
  SteelLayer,
  SteelPreset,
  PrestressDesignResult,
  LayerResult,
  CrackingResult,
} from '../types';
import {
  polygonSectionProperties,
  polygonCompressionForce,
  polygonCompressionCentroid,
} from './polygonSection';

// ─── ACI 318 helpers ────────────────────────────────────────────────────────

/**
 * Whitney stress-block depth factor β₁ per ACI 318-19 §22.2.2.4.3
 */
export function beta1(fc: number): number {
  if (fc <= 4) return 0.85;
  if (fc >= 8) return 0.65;
  return 0.85 - 0.05 * (fc - 4);
}

/**
 * Strength reduction factor φ per ACI 318-19 §21.2
 * Based on net tensile strain in the extreme tension steel layer.
 * εty = fpy / Es  (yield strain of outermost tension steel)
 */
export function phiFactor(epsilonT: number, epsilonTy: number): number {
  if (epsilonT >= epsilonTy + 0.003) return 0.90;
  if (epsilonT <= epsilonTy) return 0.65;
  return 0.65 + 0.25 * (epsilonT - epsilonTy) / 0.003;
}

// ─── Power formula ──────────────────────────────────────────────────────────

/**
 * Devalapura-Tadros / PCI power formula for steel stress.
 *
 *   fs = Es·εs · [ Q + (1 − Q) / [1 + (Es·εs / (K·fpy))^R ]^(1/R) ]
 *
 * The result is capped at:
 *   - fpy (yield) for mild steel (Grade 60, 65, 70)
 *   - fpu (ultimate) for prestressing steel (Gr. 150, 250, 270)
 * This is controlled by the steel.stressCap property.
 */
export function powerFormulaStress(epsilonS: number, steel: SteelPreset): number {
  const { Es, fpy, Q, R, K } = steel;
  // stressCap: fpy for mild steel, fpu for prestressing steel
  const cap = steel.stressCap ?? steel.fpu;

  if (Math.abs(epsilonS) < 1e-12) return 0;

  const absEps = Math.abs(epsilonS);
  const EsEps = Es * absEps;
  const ratio = EsEps / (K * fpy);
  const ratioR = Math.pow(ratio, R);
  const bracket = Math.pow(1 + ratioR, 1 / R);
  const fs = EsEps * (Q + (1 - Q) / bracket);

  // Cap at yield for mild steel, at ultimate for prestressing steel
  const fsCapped = Math.min(fs, cap);

  return epsilonS >= 0 ? fsCapped : -fsCapped;
}

// ─── Strain compatibility ───────────────────────────────────────────────────

/**
 * Total steel strain at layer i using strain compatibility.
 *
 *   εsi = εcu · (di / c − 1) + εso
 *
 * where εso = fse / Es  (initial strain from effective prestress, 0 for mild steel)
 * εcu = 0.003 per ACI 318
 */
export function steelStrain(di: number, c: number, fse: number, Es: number): number {
  const ecu = 0.003;
  const eso = fse / Es; // initial prestrain
  return ecu * (di / c - 1) + eso;
}

// ─── Section analysis ───────────────────────────────────────────────────────

/**
 * Compute the concrete compression force for a rectangular, T-section,
 * double tee, or hollow core section.
 */
export function concreteCompression(
  fc: number, a: number, bf: number, bw: number, hf: number,
  section: PrestressSectionInput | null = null
): number {
  // Handle custom polygon section
  if (section && section.sectionType === 'custom' && section.polygon && section.polygon.length >= 3) {
    return polygonCompressionForce(section.polygon, fc, a);
  }

  // Handle rectangular section (and fallback)
  if (a <= hf) {
    return 0.85 * fc * a * bf;
  }
  return 0.85 * fc * (hf * bf + (a - hf) * bw);
}

/**
 * Centroid of the compression block from the extreme compression fiber.
 */
export function compressionCentroid(
  a: number, bf: number, bw: number, hf: number,
  section: PrestressSectionInput | null = null
): number {
  // Handle custom polygon section
  if (section && section.sectionType === 'custom' && section.polygon && section.polygon.length >= 3) {
    return polygonCompressionCentroid(section.polygon, a);
  }

  // Handle rectangular section (and fallback)
  if (a <= hf) {
    return a / 2;
  }
  const flangeArea = hf * bf;
  const webArea = (a - hf) * bw;
  const totalArea = flangeArea + webArea;
  return (flangeArea * hf / 2 + webArea * (hf + (a - hf) / 2)) / totalArea;
}

/**
 * Main analysis: find neutral axis depth c by force equilibrium, then compute Mn.
 */
export function analyzeBeam(
  section: PrestressSectionInput,
  steelLayers: SteelLayer[]
): PrestressDesignResult {
  const { bf, bw, hf, h, fc } = section;
  const b1 = beta1(fc);

  // Bisection to find c where ΣF = 0
  let cLow = 0.01;
  let cHigh = h;
  let c = h / 2;
  const maxIter = 500;
  const tolerance = 1e-6;

  for (let iter = 0; iter < maxIter; iter++) {
    c = (cLow + cHigh) / 2;
    const a = b1 * c;

    // Concrete compression
    const Cc = concreteCompression(fc, a, bf, bw, hf, section);

    // Steel forces (positive = tension)
    let totalSteelForce = 0;
    for (const layer of steelLayers) {
      const eps = steelStrain(layer.depth, c, layer.fse, layer.steel.Es);
      const fs = powerFormulaStress(eps, layer.steel);
      totalSteelForce += fs * layer.area;
    }

    // Equilibrium: Cc − totalSteelForce = 0  (compression balances tension)
    const residual = Cc - totalSteelForce;

    if (Math.abs(residual) < tolerance) break;

    if (residual > 0) {
      // Too much compression → c is too large → reduce c
      cHigh = c;
    } else {
      // Too much tension → c is too small → increase c
      cLow = c;
    }
  }

  // Final results with converged c
  const a = b1 * c;
  const Cc = concreteCompression(fc, a, bf, bw, hf, section);
  const ccCentroid = compressionCentroid(a, bf, bw, hf, section);

  // Compute per-layer results
  const layerResults: LayerResult[] = steelLayers.map((layer) => {
    const eps = steelStrain(layer.depth, c, layer.fse, layer.steel.Es);
    const fs = powerFormulaStress(eps, layer.steel);
    const force = fs * layer.area;
    return {
      strain: eps,
      stress: fs,
      force,
      depth: layer.depth,
      area: layer.area,
      fse: layer.fse,
    };
  });

  // Nominal moment about the extreme compression fiber
  // Mn = Σ (steel tension forces × depth) − Cc × centroid_of_compression_block
  let Mn = 0;
  for (const lr of layerResults) {
    Mn += lr.force * lr.depth;
  }
  Mn -= Cc * ccCentroid;

  // Net tensile strain in outermost tension steel (for φ factor)
  let maxDepth = 0;
  let extremeTensionLayer: LayerResult | null = null;
  for (const lr of layerResults) {
    if (lr.depth > maxDepth) {
      maxDepth = lr.depth;
      extremeTensionLayer = lr;
    }
  }

  const epsilonT = extremeTensionLayer ? extremeTensionLayer.strain : 0;
  const epsilonTy = extremeTensionLayer
    ? steelLayers.find(l => l.depth === extremeTensionLayer!.depth)!.steel.fpy /
      steelLayers.find(l => l.depth === extremeTensionLayer!.depth)!.steel.Es
    : 0.002;

  const phi = phiFactor(epsilonT, epsilonTy);
  const phiMn = phi * Mn;

  // c/d ratio for ductility check
  const dt = maxDepth || 1;
  const cOverD = c / dt;

  // Prestress & cracking analysis
  const cracking = prestressAndCracking(section, steelLayers, phiMn);

  return {
    c,
    a,
    beta1: b1,
    Cc,
    layerResults,
    Mn,         // kip-in
    MnFt: Mn / 12,  // kip-ft
    phi,
    phiMn,      // kip-in
    phiMnFt: phiMn / 12,  // kip-ft
    epsilonT,
    cOverD,
    ductile: epsilonT >= epsilonTy + 0.003,
    transition: epsilonT >= epsilonTy && epsilonT < epsilonTy + 0.003,
    cracking,
  };
}

// ─── Gross section properties ────────────────────────────────────────────────

/**
 * Compute gross cross-section properties for all supported section types.
 *
 * Returns { A, yCg, Ig, yb, Sb }
 */
export function grossSectionProperties(section: PrestressSectionInput): {
  A: number; yCg: number; Ig: number; yb: number; Sb: number;
} {
  const { h } = section;

  let A: number;
  let yCg: number;
  let Ig: number;

  switch (section.sectionType) {
    case 'custom': {
      if (section.polygon && section.polygon.length >= 3) {
        const props = polygonSectionProperties(section.polygon);
        if (props) {
          A = props.A;
          yCg = props.yCg;
          Ig = props.Ig;
          break;
        }
      }
      // Fallback to rectangular
      const b = section.bw;
      A = b * h;
      yCg = h / 2;
      Ig = (b * Math.pow(h, 3)) / 12;
      break;
    }

    case 'rectangular':
    default: {
      const b = section.bf || section.bw;
      A = b * h;
      yCg = h / 2;
      Ig = (b * Math.pow(h, 3)) / 12;
    }
  }

  const yb = h - yCg;
  const Sb = Ig / yb;

  return { A, yCg, Ig, yb, Sb };
}

/**
 * Compute prestress force, eccentricity, cracking moment, and the 1.2Mcr check.
 */
export function prestressAndCracking(
  section: PrestressSectionInput,
  steelLayers: SteelLayer[],
  phiMn: number
): CrackingResult {
  const sectionProps = grossSectionProperties(section);
  const { A, yCg, Sb } = sectionProps;

  // Effective prestress force: only layers with fse > 0
  let P = 0;
  let PeMoment = 0; // Σ(fse_i × As_i × d_i)
  for (const layer of steelLayers) {
    if (layer.fse > 0) {
      const force = layer.fse * layer.area;
      P += force;
      PeMoment += force * layer.depth;
    }
  }

  // Eccentricity of prestress centroid from section centroid
  // e > 0 means prestress centroid is below section centroid (typical)
  const yps = P > 0 ? PeMoment / P : yCg;
  const e = yps - yCg;

  // Average precompressive stress
  const fpc = P / A;

  // Modulus of rupture: fr = 7.5√f'c (psi units) → convert to ksi
  // f'c is in ksi, so f'c_psi = fc × 1000
  const fc = section.fc;
  const fr = 7.5 * Math.sqrt(fc * 1000) / 1000; // ksi

  // Cracking moment: Mcr = Sb × (fr + P/A + P×e/Sb)
  const Mcr = Sb * (fr + P / A + P * e / Sb);
  const McrFt = Mcr / 12;

  // 1.2Mcr check: φMn ≥ 1.2Mcr
  const threshold = 1.2 * Mcr;
  const passesMinStrength = phiMn >= threshold;

  return {
    P,
    fpc,
    e,
    fr,
    Mcr,
    McrFt,
    passesMinStrength,
    sectionProps,
  };
}
