import { useState, useEffect, useCallback, useRef } from 'react';
import { Cpu, Layers, Box, FileText, CheckCircle, Play, Sparkles, RefreshCw, Trash2, Settings } from 'lucide-react';
import { SchematicView } from './components/SchematicView';
import { PcbLayoutView } from './components/PcbLayoutView';
import { Pcb3dView } from './components/Pcb3dView';
import { DrcReport } from './components/DrcReport';
import { ExportPanel } from './components/ExportPanel';
import { generateNetlist, PRESETS } from './netlistEngine';
import { runAutoRouter } from './routerEngine';
import type { Component, Net, TraceSegment, BoardSettings } from './types';

interface LogLine {
  id: string;
  time: string;
  message: string;
  type: 'info' | 'warn' | 'err' | 'success';
}

function App() {
  // 1. Initial State
  const [selectedPresetId, setSelectedPresetId] = useState<string>(PRESETS[0].id);
  const [prompt, setPrompt] = useState<string>(PRESETS[0].prompt);
  
  const [settings, setSettings] = useState<BoardSettings>({
    width: 100,
    height: 80,
    solderMaskColor: 'green',
    gridSize: 1.0,
    clearance: 0.5,
    traceWidth: 0.3
  });

  const [components, setComponents] = useState<Component[]>([]);
  const [nets, setNets] = useState<Net[]>([]);
  const [traces, setTraces] = useState<TraceSegment[]>([]);

  // Navigation tabs
  const [activeCenterTab, setActiveCenterTab] = useState<'schematic' | 'pcb' | '3d'>('schematic');
  const [activeRightTab, setActiveRightTab] = useState<'drc' | 'export'>('drc');

  // Logs terminal
  const [logs, setLogs] = useState<LogLine[]>([]);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  // Helper to add log lines
  const addLog = useCallback((message: string, type: 'info' | 'warn' | 'err' | 'success' = 'info') => {
    const time = new Date().toLocaleTimeString();
    const id = Math.random().toString(36).substring(7);
    setLogs(prev => [...prev, { id, time, message, type }]);
  }, []);

  // 2. Procedural Design Generation
  const handleGenerate = useCallback((customPrompt?: string) => {
    const activePrompt = customPrompt !== undefined ? customPrompt : prompt;
    
    // Clear logs
    setLogs([]);
    
    const logTime = new Date().toLocaleTimeString();
    const logId = Math.random().toString(36).substring(7);
    const initialLogs: LogLine[] = [
      { id: logId, time: logTime, message: `🚀 Starting AI Copilot EDA Engine...`, type: 'info' },
      { id: Math.random().toString(36).substring(7), time: logTime, message: `Prompt: "${activePrompt}"`, type: 'info' }
    ];
    setLogs(initialLogs);

    // Helper inside generation to push log updates synchronously to UI
    const addLogSync = (msg: string, t: 'info' | 'warn' | 'err' | 'success' = 'info') => {
      const timeStr = new Date().toLocaleTimeString();
      const randomId = Math.random().toString(36).substring(7);
      setLogs(prev => [...prev, { id: randomId, time: timeStr, message: msg, type: t }]);
    };

    setTimeout(() => {
      try {
        // Step 1: Netlist Generation
        addLogSync(`Generating Netlist components and electrical connections...`, 'info');
        const { components: genComps, nets: genNets } = generateNetlist(activePrompt);
        addLogSync(`Netlist generated successfully. Created ${genComps.length} components & ${genNets.length} electrical nets.`, 'success');
        
        genComps.forEach(c => {
          addLogSync(`  └─ [${c.id}] ${c.name} (${c.value}) - footprint: ${c.footprint}`, 'info');
        });

        // Step 2: Auto-routing
        addLogSync(`Running A* router grid solver (grid size: ${settings.gridSize}mm)...`, 'info');
        const genTraces = runAutoRouter(genComps, genNets, settings);
        
        // Check routing success
        const unroutedNets = genNets.filter(
          n => n.pinIds.length >= 2 && !genTraces.some(t => t.netId === n.id)
        );

        if (unroutedNets.length > 0) {
          addLogSync(`Auto-routing completed with warnings. ${unroutedNets.length} nets could not be routed.`, 'warn');
          unroutedNets.forEach(n => {
            addLogSync(`  ⚠️ Net [${n.name}] is unrouted due to density clearance limit.`, 'warn');
          });
        } else {
          addLogSync(`Auto-routing finished successfully. Fully routed all electrical nets.`, 'success');
        }
        addLogSync(`Generated ${genTraces.length} copper trace segments on board.`, 'success');

        setComponents(genComps);
        setNets(genNets);
        setTraces(genTraces);
      } catch (error: any) {
        addLogSync(`Generation failed: ${error.message || error}`, 'err');
      }
    }, 100);
  }, [prompt, settings]);

  // 3. Dynamic Router re-run (e.g. on component move / drag release)
  const handleRunRouter = useCallback(() => {
    addLog(`Initiating copper trace recalculation...`, 'info');
    
    setTimeout(() => {
      try {
        const routedTraces = runAutoRouter(components, nets, settings);
        setTraces(routedTraces);
        
        const unroutedNets = nets.filter(
          n => n.pinIds.length >= 2 && !routedTraces.some(t => t.netId === n.id)
        );

        if (unroutedNets.length > 0) {
          addLog(`Re-routing completed. ${unroutedNets.length} nets left unrouted.`, 'warn');
        } else {
          addLog(`Re-routing successful! All nets fully connected (${routedTraces.length} traces).`, 'success');
        }
      } catch (error: any) {
        addLog(`Re-routing failed: ${error.message || error}`, 'err');
      }
    }, 50);
  }, [components, nets, settings, addLog]);

  // 4. Component Drag Handler
  const handleComponentMove = useCallback((id: string, x: number, y: number) => {
    setComponents(prev => 
      prev.map(c => (c.id === id ? { ...c, pcbX: x, pcbY: y } : c))
    );
  }, []);

  // 5. Run Initial Generation on Mount
  useEffect(() => {
    handleGenerate();
  }, []);

  // 6. Auto-scroll terminal logs to bottom
  useEffect(() => {
    if (terminalEndRef.current) {
      terminalEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Handle preset clicks
  const selectPreset = (presetId: string, presetPrompt: string) => {
    setSelectedPresetId(presetId);
    setPrompt(presetPrompt);
    handleGenerate(presetPrompt);
  };

  return (
    <div className="dashboard-grid">
      {/* 1. Header Panel */}
      <header className="glass-panel header-panel">
        <div className="logo-container">
          <Cpu size={24} color="var(--primary)" />
          <h1 className="logo-text">AeroEDA Studio</h1>
          <span className="badge">v1.2.0 • AI-Powered</span>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            Status: <span style={{ color: 'var(--success)', fontWeight: 'bold' }}>● Online</span>
          </span>
          <button className="btn" onClick={() => handleGenerate()} title="Re-generate Design">
            <RefreshCw size={14} /> Refresh Design
          </button>
        </div>
      </header>

      {/* 2. Left Configuration Sidebar (Spans rows 2 & 3) */}
      <aside className="left-panel">
        {/* Card 1: AI Prompt Copilot */}
        <section className="glass-panel" style={{ display: 'flex', flexDirection: 'column', padding: 16 }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
            <Sparkles size={16} color="var(--primary)" /> AI Design Generator
          </h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 12 }}>
            Describe the features, sensors, microcontrollers, or power stages you want on the board.
          </p>
          <textarea
            className="form-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Type your design requirements..."
            style={{ marginBottom: 12, flex: 1, minHeight: 80 }}
          />
          <button className="btn btn-primary" onClick={() => handleGenerate()} style={{ width: '100%', justifyContent: 'center' }}>
            <Play size={14} /> Generate Schematic & Board
          </button>
        </section>

        {/* Card 2: Preset Layouts */}
        <section className="glass-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column' }}>
          <h3 style={{ fontSize: '0.95rem', marginBottom: 8 }}>Reference Templates</h3>
          <div className="preset-list" style={{ overflowY: 'auto', maxHeight: 180 }}>
            {PRESETS.map(p => (
              <div
                key={p.id}
                className={`preset-card ${selectedPresetId === p.id ? 'active' : ''}`}
                onClick={() => selectPreset(p.id, p.prompt)}
              >
                <div className="preset-name">{p.name}</div>
                <div className="preset-desc">{p.description}</div>
              </div>
            ))}
          </div>
        </section>

        {/* Card 3: Board Constraint Settings */}
        <section className="glass-panel" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 10, flex: 1, overflowY: 'auto' }}>
          <h3 style={{ fontSize: '0.95rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Settings size={16} color="var(--text-muted)" /> Board Configuration
          </h3>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Width (mm)</label>
              <input
                type="number"
                className="form-input"
                value={settings.width}
                onChange={(e) => setSettings(prev => ({ ...prev, width: Number(e.target.value) }))}
              />
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Height (mm)</label>
              <input
                type="number"
                className="form-input"
                value={settings.height}
                onChange={(e) => setSettings(prev => ({ ...prev, height: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.75rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Solder Mask Color</label>
            <select
              className="form-input"
              value={settings.solderMaskColor}
              onChange={(e) => setSettings(prev => ({ ...prev, solderMaskColor: e.target.value as any }))}
              style={{ background: 'var(--bg-main)' }}
            >
              <option value="green">Classic Green</option>
              <option value="black">Matte Black</option>
              <option value="blue">Royal Blue</option>
              <option value="red">Ruby Red</option>
            </select>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Grid size (mm)</label>
              <select
                className="form-input"
                value={settings.gridSize}
                onChange={(e) => setSettings(prev => ({ ...prev, gridSize: Number(e.target.value) }))}
                style={{ background: 'var(--bg-main)' }}
              >
                <option value={0.5}>0.5 mm</option>
                <option value={1.0}>1.0 mm</option>
                <option value={2.54}>2.54 mm</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Clearance (mm)</label>
              <input
                type="number"
                step="0.1"
                className="form-input"
                value={settings.clearance}
                onChange={(e) => setSettings(prev => ({ ...prev, clearance: Number(e.target.value) }))}
              />
            </div>
          </div>

          <div style={{ fontSize: '0.75rem' }}>
            <label style={{ display: 'block', color: 'var(--text-muted)', marginBottom: 4 }}>Default Trace Width (mm)</label>
            <input
              type="number"
              step="0.05"
              className="form-input"
              value={settings.traceWidth}
              onChange={(e) => setSettings(prev => ({ ...prev, traceWidth: Number(e.target.value) }))}
            />
          </div>
          
          <button
            className="btn"
            style={{ width: '100%', marginTop: 6, fontSize: '0.8rem', justifyContent: 'center' }}
            onClick={handleRunRouter}
          >
            Apply Constraints & Reroute
          </button>
        </section>
      </aside>

      {/* 3. Center Workspace Viewport (Main layout canvas) */}
      <main className="glass-panel center-panel">
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeCenterTab === 'schematic' ? 'active' : ''}`}
            onClick={() => setActiveCenterTab('schematic')}
          >
            <Cpu size={15} /> Schematic Schematic
          </button>
          <button
            className={`tab-btn ${activeCenterTab === 'pcb' ? 'active' : ''}`}
            onClick={() => setActiveCenterTab('pcb')}
          >
            <Layers size={15} /> 2D PCB Layout
          </button>
          <button
            className={`tab-btn ${activeCenterTab === '3d' ? 'active' : ''}`}
            onClick={() => setActiveCenterTab('3d')}
          >
            <Box size={15} /> 3D PCB View
          </button>
        </div>

        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {activeCenterTab === 'schematic' && (
            <SchematicView components={components} nets={nets} />
          )}
          {activeCenterTab === 'pcb' && (
            <PcbLayoutView
              components={components}
              traces={traces}
              nets={nets}
              settings={settings}
              onComponentMove={handleComponentMove}
              onRunRouter={handleRunRouter}
            />
          )}
          {activeCenterTab === '3d' && (
            <Pcb3dView components={components} traces={traces} settings={settings} />
          )}
        </div>
      </main>

      {/* 4. Right Sidebar (DRC / BOM & Gerbers Export Panel) */}
      <section className="glass-panel right-panel">
        <div className="tab-bar">
          <button
            className={`tab-btn ${activeRightTab === 'drc' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('drc')}
          >
            <CheckCircle size={15} /> DRC Report
          </button>
          <button
            className={`tab-btn ${activeRightTab === 'export' ? 'active' : ''}`}
            onClick={() => setActiveRightTab('export')}
          >
            <FileText size={15} /> Fabrication Export
          </button>
        </div>

        <div style={{ flex: 1, overflow: 'hidden' }}>
          {activeRightTab === 'drc' && (
            <DrcReport components={components} traces={traces} nets={nets} settings={settings} />
          )}
          {activeRightTab === 'export' && (
            <ExportPanel components={components} traces={traces} nets={nets} />
          )}
        </div>
      </section>

      {/* 5. Bottom System Log Terminal */}
      <footer className="glass-panel bottom-panel" style={{ display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '6px 12px',
            borderBottom: '1px solid var(--border-color)',
            background: 'rgba(0,0,0,0.2)'
          }}
        >
          <span style={{ fontSize: '0.75rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: 6, color: '#34d399' }}>
            <Layers size={12} /> System Process Terminal
          </span>
          <button
            className="btn"
            style={{ padding: '2px 6px', fontSize: '0.65rem', display: 'flex', alignItems: 'center', gap: 4 }}
            onClick={() => setLogs([])}
          >
            <Trash2 size={10} /> Clear Logs
          </button>
        </div>
        
        <div className="terminal">
          {logs.length === 0 ? (
            <div style={{ color: 'var(--text-dim)', fontStyle: 'italic', padding: 4 }}>No terminal logs to display.</div>
          ) : (
            logs.map(log => (
              <div key={log.id} className="terminal-line">
                <span style={{ color: 'var(--text-dim)', marginRight: 8 }}>[{log.time}]</span>
                <span className={`
                  ${log.type === 'info' ? 'terminal-info' : ''}
                  ${log.type === 'warn' ? 'terminal-warn' : ''}
                  ${log.type === 'err' ? 'terminal-err' : ''}
                  ${log.type === 'success' ? 'terminal-success' : ''}
                `}>
                  {log.message}
                </span>
              </div>
            ))
          )}
          <div ref={terminalEndRef} />
        </div>
      </footer>
    </div>
  );
}

export default App;
