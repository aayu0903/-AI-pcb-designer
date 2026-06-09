import { useState, useMemo } from 'react';
import type { Component, TraceSegment, Net, BOMItem } from '../types';
import { Download, FileText, CheckCircle } from 'lucide-react';

interface ExportPanelProps {
  components: Component[];
  traces: TraceSegment[];
  nets: Net[];
}

export const ExportPanel: React.FC<ExportPanelProps> = ({ components, traces }) => {
  const [activeTab, setActiveTab] = useState<'bom' | 'gerber'>('bom');
  const [downloadedStatus, setDownloadedStatus] = useState<string | null>(null);

  // --- 1. Compute BOM (Bill of Materials) ---
  const bomList = useMemo<BOMItem[]>(() => {
    const map: { [key: string]: BOMItem } = {};

    components.forEach(comp => {
      // Group by footprint + value
      const key = `${comp.footprint}_${comp.value}`;
      const price = comp.type === 'mcu' ? 4.50 :
                    comp.type === 'sensor' ? 1.20 :
                    comp.type === 'actuator' ? 1.80 :
                    comp.type === 'connector' ? 0.60 :
                    comp.type === 'power' ? 0.45 : 0.05;

      if (map[key]) {
        map[key].quantity += 1;
        map[key].designator += `, ${comp.id}`;
      } else {
        map[key] = {
          id: key,
          designator: comp.id,
          name: comp.name,
          footprint: comp.footprint,
          quantity: 1,
          value: comp.value,
          estimatedPrice: price
        };
      }
    });

    return Object.values(map).sort((a, b) => a.designator.localeCompare(b.designator));
  }, [components]);

  const totalBOMCost = bomList.reduce((sum: number, item: BOMItem) => sum + (item.estimatedPrice * item.quantity), 0);

  // Export BOM to CSV
  const handleExportBOM = () => {
    let csv = 'Designator,Component Name,Value,Footprint,Quantity,Est Unit Price (USD),Est Total Price (USD)\r\n';
    bomList.forEach((item: BOMItem) => {
      csv += `"${item.designator}","${item.name}","${item.value}","${item.footprint}",${item.quantity},${item.estimatedPrice.toFixed(2)},${(item.estimatedPrice * item.quantity).toFixed(2)}\r\n`;
    });
    csv += `\r\n,,,,,Total cost (USD),${totalBOMCost.toFixed(2)}\r\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'AeroEDA_BOM.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerStatusFeedback('BOM CSV successfully downloaded!');
  };

  // --- 2. RS-274X Gerber Code Generation ---
  const generateGerberLayer = (layer: 'gtl' | 'gbl' | 'gto' | 'gts' | 'txt'): string => {
    const date = new Date().toISOString();
    let code = `%%AeroEDA Gerber Exporter Rev 1.0%%\r\n`;
    code += `%%Generated on ${date}%%\r\n`;
    code += `%FSLAX36Y36*%\r\n`; // Format: 3 integer, 6 decimal
    code += `%MOMM*%\r\n`;     // Unit: Millimeters
    code += `%IPDEC*%\r\n`;     // Image format: Positive
    code += `%LPD*%\r\n`;      // Layer polarity: Dark

    // Helper to format coordinates to Gerber 3.6 format (multiplied by 1,000,000)
    const fmt = (num: number) => {
      const scaled = Math.round(num * 1000000);
      return scaled.toString().padStart(9, '0');
    };

    if (layer === 'gtl' || layer === 'gbl') {
      // --- Copper Layers (Top/Bottom Traces & Pads) ---
      // Aperture definitions
      code += `%ADD10C,0.8000*% (via pad)\r\n`;
      code += `%ADD11R,1.0000X1.8000*% (SMD pad)\r\n`;
      code += `%ADD12C,1.8000*% (TH pad)\r\n`;
      code += `%ADD13C,0.3000*% (Default trace width)\r\n`;

      // Draw pads
      components.forEach(comp => {
        comp.pins.forEach(pin => {
          const rad = (comp.rotation * Math.PI) / 180;
          const rx = pin.pcbX * Math.cos(rad) - pin.pcbY * Math.sin(rad);
          const ry = pin.pcbX * Math.sin(rad) + pin.pcbY * Math.cos(rad);
          const px = comp.pcbX + rx;
          const py = comp.pcbY + ry;

          const isSmd = comp.footprint.includes('SMD') || comp.footprint.startsWith('R') || comp.footprint.startsWith('C') || comp.footprint.startsWith('LED') || comp.footprint.startsWith('USB') || comp.footprint.startsWith('SOT');

          if (isSmd) {
            code += `D11*\r\n`; // Select SMD Rect aperture
          } else {
            code += `D12*\r\n`; // Select TH Circ aperture
          }
          code += `X${fmt(px)}Y${fmt(py)}D03*\r\n`; // Flash pad
        });
      });

      // Draw traces
      code += `D13*\r\n`; // Select trace aperture
      const activeLayer = layer === 'gtl' ? 'top' : 'bottom';
      traces.filter(t => t.layer === activeLayer).forEach(trace => {
        code += `X${fmt(trace.x1)}Y${fmt(trace.y1)}D02*\r\n`; // Move to start
        code += `X${fmt(trace.x2)}Y${fmt(trace.y2)}D01*\r\n`; // Draw line to end
      });

    } else if (layer === 'gto') {
      // --- Silkscreen Top (Component Outlines & Labels) ---
      code += `%ADD10C,0.1500*% (Silkscreen line width)\r\n`;
      code += `D10*\r\n`;

      components.forEach(comp => {
        const w = comp.pcbWidth;
        const h = comp.pcbHeight;
        
        // Outlines corners
        const x1 = comp.pcbX - w/2;
        const x2 = comp.pcbX + w/2;
        const y1 = comp.pcbY - h/2;
        const y2 = comp.pcbY + h/2;

        // Draw basic rectangle boundary
        code += `X${fmt(x1)}Y${fmt(y1)}D02*\r\n`;
        code += `X${fmt(x2)}Y${fmt(y1)}D01*\r\n`;
        code += `X${fmt(x2)}Y${fmt(y2)}D01*\r\n`;
        code += `X${fmt(x1)}Y${fmt(y2)}D01*\r\n`;
        code += `X${fmt(x1)}Y${fmt(y1)}D01*\r\n`;
      });
    } else if (layer === 'gts') {
      // --- Solder Mask Openings (pads only, slightly larger than copper pads) ---
      code += `%ADD11R,1.1000X1.9000*% (SMD opening)\r\n`;
      code += `%ADD12C,1.9500*% (TH opening)\r\n`;

      components.forEach(comp => {
        comp.pins.forEach(pin => {
          const rad = (comp.rotation * Math.PI) / 180;
          const rx = pin.pcbX * Math.cos(rad) - pin.pcbY * Math.sin(rad);
          const ry = pin.pcbX * Math.sin(rad) + pin.pcbY * Math.cos(rad);
          const px = comp.pcbX + rx;
          const py = comp.pcbY + ry;

          const isSmd = comp.footprint.includes('SMD') || comp.footprint.startsWith('R') || comp.footprint.startsWith('C') || comp.footprint.startsWith('LED') || comp.footprint.startsWith('USB') || comp.footprint.startsWith('SOT');

          if (isSmd) {
            code += `D11*\r\n`;
          } else {
            code += `D12*\r\n`;
          }
          code += `X${fmt(px)}Y${fmt(py)}D03*\r\n`;
        });
      });
    } else if (layer === 'txt') {
      // --- NC Drill Holes file ---
      code = `M48\r\n`;
      code += `METRIC\r\n`;
      code += `T01C0.800\r\n`; // Tool definition: 0.8mm drills
      code += `%\r\n`;
      code += `T01\r\n`;

      components.forEach(comp => {
        // Only TH parts have drill holes
        const isSmd = comp.footprint.includes('SMD') || comp.footprint.startsWith('R') || comp.footprint.startsWith('C') || comp.footprint.startsWith('LED') || comp.footprint.startsWith('USB') || comp.footprint.startsWith('SOT');
        if (!isSmd) {
          comp.pins.forEach(pin => {
            const rad = (comp.rotation * Math.PI) / 180;
            const rx = pin.pcbX * Math.cos(rad) - pin.pcbY * Math.sin(rad);
            const ry = pin.pcbX * Math.sin(rad) + pin.pcbY * Math.cos(rad);
            const px = comp.pcbX + rx;
            const py = comp.pcbY + ry;

            // Excellon format coordinate
            code += `X${Math.round(px * 1000)}Y${Math.round(py * 1000)}\r\n`;
          });
        }
      });
      code += `M30\r\n`;
      return code;
    }

    code += `M02*\r\n`; // Gerber file EOF
    return code;
  };

  const downloadGerberFile = (fileName: string, fileContent: string) => {
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    triggerStatusFeedback(`${fileName} successfully generated and downloaded!`);
  };

  const triggerStatusFeedback = (msg: string) => {
    setDownloadedStatus(msg);
    setTimeout(() => setDownloadedStatus(null), 3000);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Exporter selector */}
      <div className="tab-bar">
        <button
          className={`tab-btn ${activeTab === 'bom' ? 'active' : ''}`}
          onClick={() => setActiveTab('bom')}
        >
          <FileText size={16} /> Bill of Materials (BOM)
        </button>
        <button
          className={`tab-btn ${activeTab === 'gerber' ? 'active' : ''}`}
          onClick={() => setActiveTab('gerber')}
        >
          <Download size={16} /> Gerber Exporter (RS-274X)
        </button>
      </div>

      <div className="card-body">
        {/* Toast status feedback */}
        {downloadedStatus && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: 6,
              background: 'rgba(16, 185, 129, 0.15)',
              border: '1px solid rgba(16, 185, 129, 0.3)',
              color: 'var(--success)',
              fontSize: '0.8rem',
              fontWeight: 600,
              marginBottom: 12,
              animation: 'fadeIn 0.2s ease'
            }}
          >
            <CheckCircle size={16} />
            <span>{downloadedStatus}</span>
          </div>
        )}

        {activeTab === 'bom' ? (
          // BOM Tab
          <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Total Components: <strong>{components.length}</strong> • Total Cost: <strong>${totalBOMCost.toFixed(2)}</strong>
              </span>
              <button className="btn btn-success" onClick={handleExportBOM}>
                <Download size={14} /> Export BOM (CSV)
              </button>
            </div>

            <div style={{ flex: 1, overflowX: 'auto', border: '1px solid var(--border-color)', borderRadius: 8 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-dim)' }}>
                    <th style={{ padding: 10 }}>Designators</th>
                    <th style={{ padding: 10 }}>Part Name</th>
                    <th style={{ padding: 10 }}>Value</th>
                    <th style={{ padding: 10 }}>Footprint</th>
                    <th style={{ padding: 10 }}>Qty</th>
                    <th style={{ padding: 10 }}>Est Price</th>
                  </tr>
                </thead>
                <tbody>
                  {bomList.map((item: BOMItem) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                      <td style={{ padding: 10, fontFamily: 'var(--font-mono)', color: 'var(--primary)' }}>{item.designator}</td>
                      <td style={{ padding: 10, fontWeight: 500 }}>{item.name}</td>
                      <td style={{ padding: 10, color: 'var(--text-muted)' }}>{item.value}</td>
                      <td style={{ padding: 10, fontFamily: 'var(--font-mono)', color: 'var(--text-dim)' }}>{item.footprint}</td>
                      <td style={{ padding: 10, fontWeight: 'bold' }}>{item.quantity}</td>
                      <td style={{ padding: 10 }}>${(item.estimatedPrice * item.quantity).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          // Gerber Tab
          <div>
            <div style={{ marginBottom: 16 }}>
              <h4 style={{ fontSize: '0.9rem', marginBottom: 4 }}>Standard RS-274X Fabrication Files</h4>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                Download individual Gerber layer files matching industry standard PCB manufacturers (JLCPCB, PCBWay, OSHPark).
              </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div
                className="glass-panel"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong style={{ fontSize: '0.8rem', display: 'block' }}>Top Copper Layer</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>project_top_copper.gtl</span>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => downloadGerberFile('project_top_copper.gtl', generateGerberLayer('gtl'))}
                >
                  <Download size={14} />
                </button>
              </div>

              <div
                className="glass-panel"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong style={{ fontSize: '0.8rem', display: 'block' }}>Bottom Copper Layer</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>project_bottom_copper.gbl</span>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => downloadGerberFile('project_bottom_copper.gbl', generateGerberLayer('gbl'))}
                >
                  <Download size={14} />
                </button>
              </div>

              <div
                className="glass-panel"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong style={{ fontSize: '0.8rem', display: 'block' }}>Top Solder Mask</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>project_solder_mask.gts</span>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => downloadGerberFile('project_solder_mask.gts', generateGerberLayer('gts'))}
                >
                  <Download size={14} />
                </button>
              </div>

              <div
                className="glass-panel"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              >
                <div>
                  <strong style={{ fontSize: '0.8rem', display: 'block' }}>Top Silkscreen</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>project_silkscreen.gto</span>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => downloadGerberFile('project_silkscreen.gto', generateGerberLayer('gto'))}
                >
                  <Download size={14} />
                </button>
              </div>

              <div
                className="glass-panel"
                style={{ padding: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gridColumn: '1 / span 2' }}
              >
                <div>
                  <strong style={{ fontSize: '0.8rem', display: 'block' }}>Excellon Drill Holes File</strong>
                  <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>project_drill_holes.txt</span>
                </div>
                <button
                  className="btn"
                  style={{ padding: '6px 10px' }}
                  onClick={() => downloadGerberFile('project_drill_holes.txt', generateGerberLayer('txt'))}
                >
                  <Download size={14} />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
