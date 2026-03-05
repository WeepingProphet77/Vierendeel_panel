import { useState, useMemo, useCallback, useEffect } from 'react';
import './index.css';
import type { AppInputs, Opening, FrameModel, AnalysisResults, Member } from './types';
import { generateFrameModel } from './engine/frameModel';
import { runAnalysis } from './engine/analysis';
import InputPanel from './components/InputPanel';
import ModelTab from './components/ModelTab';
import ResultsTab from './components/ResultsTab';
import DeflectionTab from './components/DeflectionTab';
import SummaryTab from './components/SummaryTab';

function getDefaultOpenings(numOpenings: number, panelWidth: number, panelHeight: number): Opening[] {
  const openings: Opening[] = [];
  const openingWidth = Math.min(6, (panelWidth - 4 * (numOpenings + 1)) / numOpenings);
  const openingHeight = Math.max(3, panelHeight - 6);
  const spacing = panelWidth / (numOpenings + 1);

  for (let i = 0; i < numOpenings; i++) {
    openings.push({
      widthFt: Math.round(openingWidth * 10) / 10,
      heightFt: Math.round(openingHeight * 10) / 10,
      centerXFt: Math.round(spacing * (i + 1) * 10) / 10,
      centerYFt: Math.round((panelHeight / 2) * 10) / 10,
    });
  }
  return openings;
}

const defaultInputs: AppInputs = {
  panel: { widthFt: 30, heightFt: 12, defaultThicknessIn: 6, numOpenings: 2 },
  openings: getDefaultOpenings(2, 30, 12),
  supports: { leftXFt: 1.0, rightXFt: 29.0 },
  material: { unitWeightPcf: 150, fcPsi: 5000, ePsi: 57000 * Math.sqrt(5000) },
  loading: { glassWeightPsf: 15, superimposedDeadLoadPsf: 0 },
};

type TabId = 'model' | 'results' | 'deflection' | 'summary';

export default function App() {
  const [inputs, setInputs] = useState<AppInputs>(defaultInputs);
  const [activeTab, setActiveTab] = useState<TabId>('model');
  const [selectedMemberId, setSelectedMemberId] = useState<number | null>(null);
  const [dividerX, setDividerX] = useState(360);
  const [isDragging, setIsDragging] = useState(false);
  const [previousMembers, setPreviousMembers] = useState<Member[] | undefined>(undefined);

  // Generate frame model
  const frameModel: FrameModel = useMemo(() => {
    return generateFrameModel(
      inputs.panel,
      inputs.openings,
      inputs.supports,
      inputs.panel.defaultThicknessIn,
      previousMembers
    );
  }, [inputs.panel, inputs.openings, inputs.supports, previousMembers]);

  // Run analysis
  const analysisResult = useMemo(() => {
    if (frameModel.validationErrors.length > 0 || frameModel.nodes.length === 0) return null;
    const result = runAnalysis(
      frameModel.nodes,
      frameModel.members,
      inputs.openings,
      inputs.panel,
      inputs.material,
      inputs.loading
    );
    if ('error' in result) return null;
    return result;
  }, [frameModel, inputs.openings, inputs.panel, inputs.material, inputs.loading]);

  // Run validation test on mount
  useEffect(() => {
    const testPanel = { widthFt: 20, heightFt: 10, defaultThicknessIn: 6, numOpenings: 1 };
    const testOpenings = [{ widthFt: 8, heightFt: 6, centerXFt: 10, centerYFt: 5 }];
    const testSupports = { leftXFt: 1, rightXFt: 19 };
    const testMaterial = { unitWeightPcf: 150, fcPsi: 5000, ePsi: 57000 * Math.sqrt(5000) };
    const testLoading = { glassWeightPsf: 15, superimposedDeadLoadPsf: 0 };

    const testModel = generateFrameModel(testPanel, testOpenings, testSupports, 6);
    if (testModel.validationErrors.length === 0 && testModel.nodes.length > 0) {
      const result = runAnalysis(testModel.nodes, testModel.members, testOpenings, testPanel, testMaterial, testLoading);
      if ('error' in result) {
        console.error('Validation test FAILED:', result.error);
      } else {
        const residualPct = Math.abs(result.equilibriumResidual.verticalKips / result.totalWeight.total) * 100;
        if (residualPct < 0.1) {
          console.log(`Validation test PASSED: Equilibrium residual = ${residualPct.toFixed(4)}% of total load`);
        } else {
          console.warn(`Validation test WARNING: Equilibrium residual = ${residualPct.toFixed(2)}% of total load (> 0.1%)`);
        }
        console.log('Test results:', {
          totalWeight: result.totalWeight,
          reactions: result.reactions,
          maxDeflection: result.maxDeflection,
        });
      }
    } else {
      console.error('Validation test FAILED: Model generation errors:', testModel.validationErrors);
    }
  }, []);

  const handleInputChange = useCallback((newInputs: AppInputs) => {
    setInputs(prev => {
      // Check if number of openings changed, which changes topology
      if (prev.panel.numOpenings !== newInputs.panel.numOpenings) {
        setPreviousMembers(undefined);
        newInputs.openings = getDefaultOpenings(
          newInputs.panel.numOpenings,
          newInputs.panel.widthFt,
          newInputs.panel.heightFt
        );
      }
      return newInputs;
    });
  }, []);

  const handleMemberThicknessChange = useCallback((memberId: number, thickness: number) => {
    const updatedMembers = frameModel.members.map(m => {
      if (m.id === memberId) {
        return {
          ...m,
          thicknessIn: thickness,
          thicknessOverridden: true,
          areaIn2: thickness * m.depthIn,
          inertiaIn4: thickness * Math.pow(m.depthIn, 3) / 12,
        };
      }
      return m;
    });
    setPreviousMembers(updatedMembers);
  }, [frameModel.members]);

  // Resizable divider
  const handleMouseDown = useCallback(() => setIsDragging(true), []);

  useEffect(() => {
    if (!isDragging) return;
    const handleMouseMove = (e: MouseEvent) => {
      setDividerX(Math.max(280, Math.min(600, e.clientX)));
    };
    const handleMouseUp = () => setIsDragging(false);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'model', label: 'Model' },
    { id: 'results', label: 'Results' },
    { id: 'deflection', label: 'Deflection' },
    { id: 'summary', label: 'Summary' },
  ];

  return (
    <div className="flex h-screen w-screen overflow-hidden" style={{ userSelect: isDragging ? 'none' : 'auto' }}>
      {/* Left Panel - Inputs */}
      <div
        className="flex-shrink-0 overflow-y-auto bg-[#0f1629] border-r border-[#2a3a5c]"
        style={{ width: dividerX }}
      >
        <InputPanel
          inputs={inputs}
          onChange={handleInputChange}
          frameModel={frameModel}
          onMemberThicknessChange={handleMemberThicknessChange}
        />
      </div>

      {/* Resizable Divider */}
      <div
        className="flex-shrink-0 w-1.5 bg-[#2a3a5c] cursor-col-resize hover:bg-[#4a9eff] transition-colors"
        onMouseDown={handleMouseDown}
      />

      {/* Right Panel - Tabs */}
      <div className="flex-1 flex flex-col overflow-hidden bg-[#1a1a2e]">
        {/* Tab Bar */}
        <div className="flex border-b border-[#2a3a5c] bg-[#0f1629]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-2.5 text-sm font-medium transition-colors border-b-2 ${
                activeTab === tab.id
                  ? 'text-[#4a9eff] border-[#4a9eff] bg-[#1a1a2e]'
                  : 'text-[#8899aa] border-transparent hover:text-[#c0c8d0] hover:bg-[#16213e]'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Validation Errors */}
        {frameModel.validationErrors.length > 0 && (
          <div className="p-3 bg-red-900/30 border-b border-red-700 text-red-300 text-sm">
            {frameModel.validationErrors.map((e, i) => (
              <div key={i}>{e}</div>
            ))}
          </div>
        )}
        {frameModel.validationWarnings.length > 0 && (
          <div className="p-3 bg-yellow-900/30 border-b border-yellow-700 text-yellow-300 text-sm">
            {frameModel.validationWarnings.map((w, i) => (
              <div key={i}>{w}</div>
            ))}
          </div>
        )}

        {/* Tab Content */}
        <div className="flex-1 overflow-auto p-4">
          {activeTab === 'model' && (
            <ModelTab
              frameModel={frameModel}
              inputs={inputs}
              selectedMemberId={selectedMemberId}
              onSelectMember={setSelectedMemberId}
            />
          )}
          {activeTab === 'results' && (
            <ResultsTab
              frameModel={frameModel}
              results={analysisResult}
              material={inputs.material}
            />
          )}
          {activeTab === 'deflection' && (
            <DeflectionTab
              frameModel={frameModel}
              results={analysisResult}
              inputs={inputs}
            />
          )}
          {activeTab === 'summary' && (
            <SummaryTab
              frameModel={frameModel}
              results={analysisResult}
              inputs={inputs}
            />
          )}
        </div>
      </div>
    </div>
  );
}
