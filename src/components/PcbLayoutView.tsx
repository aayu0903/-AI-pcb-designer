import { useState, useRef } from 'react';
import type { Component, TraceSegment, BoardSettings, Net } from '../types';
import { Play } from 'lucide-react';

interface PcbLayoutViewProps {
  components: Component[];
  traces: TraceSegment[];
  nets: Net[];
  settings: BoardSettings;
  onComponentMove: (id: string, x: number, y: number) => void;
  onRunRouter: () => void;
}

export const PcbLayoutView: React.FC<PcbLayoutViewProps> = ({
  components,
  traces,
  settings,
  onComponentMove,
  onRunRouter,
}) => {
  const [zoom, setZoom] = useState<number>(5); // Default zoom level (pixels per mm)
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [draggedCompId, setDraggedCompId] = useState<string | null>(null);

  const isPanning = useRef<boolean>(false);
  const panStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const dragOffset = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Grid snap helper
  const snapToGrid = (val: number, step: number): number => {
    return Math.round(val / step) * step;
  };

  // Convert client coordinate to board space coordinate (mm)
  const clientToBoardCoords = (clientX: number, clientY: number, svgEl: SVGSVGElement) => {
    const rect = svgEl.getBoundingClientRect();
    const x = (clientX - rect.left - pan.x) / zoom;
    const y = (clientY - rect.top - pan.y) / zoom;
    return { x, y };
  };

  // Pan handlers
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    if (e.button !== 0) return; // Only drag with left click
    if ((e.target as SVGElement).closest('.footprint-group')) return; // Don't pan if dragging component

    isPanning.current = true;
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgEl = e.currentTarget;

    if (isPanning.current) {
      setPan({
        x: e.clientX - panStart.current.x,
        y: e.clientY - panStart.current.y
      });
    } else if (draggedCompId) {
      const { x, y } = clientToBoardCoords(e.clientX, e.clientY, svgEl);
      const snappedX = snapToGrid(x - dragOffset.current.x, settings.gridSize);
      const snappedY = snapToGrid(y - dragOffset.current.y, settings.gridSize);

      // Clamp component within board boundaries
      const clampedX = Math.max(5, Math.min(settings.width - 5, snappedX));
      const clampedY = Math.max(5, Math.min(settings.height - 5, snappedY));

      onComponentMove(draggedCompId, clampedX, clampedY);
    }
  };

  const handleMouseUp = () => {
    isPanning.current = false;
    if (draggedCompId) {
      setDraggedCompId(null);
      // Auto-route on release to refresh copper connections
      onRunRouter();
    }
  };

  // Start dragging component
  const handleCompMouseDown = (e: React.MouseEvent, comp: Component, svgEl: SVGSVGElement) => {
    e.stopPropagation();
    if (e.button !== 0) return;

    const { x, y } = clientToBoardCoords(e.clientX, e.clientY, svgEl);
    dragOffset.current = {
      x: x - comp.pcbX,
      y: y - comp.pcbY
    };
    setDraggedCompId(comp.id);
  };

  const handleZoom = (factor: number) => {
    setZoom((prev: number) => Math.max(2, Math.min(20, prev * factor)));
  };

  // Draw footprints
  const renderFootprint = (comp: Component, svgEl: SVGSVGElement | null) => {
    const w = comp.pcbWidth;
    const h = comp.pcbHeight;
    const isSelected = draggedCompId === comp.id;

    // Draw footprint pins (pads)
    const pads = comp.pins.map(pin => {
      // Local pin pad offsets (applying rotation)
      const rad = (comp.rotation * Math.PI) / 180;
      const rx = pin.pcbX * Math.cos(rad) - pin.pcbY * Math.sin(rad);
      const ry = pin.pcbX * Math.sin(rad) + pin.pcbY * Math.cos(rad);

      const isSmd = comp.footprint.includes('SMD') || comp.footprint.startsWith('R') || comp.footprint.startsWith('C') || comp.footprint.startsWith('LED') || comp.footprint.startsWith('USB') || comp.footprint.startsWith('SOT');

      if (isSmd) {
        // SMD pad (rectangular copper-gold)
        const padW = 1.0;
        const padH = 1.8;
        return (
          <rect
            key={pin.id}
            x={comp.pcbX + rx - padW / 2}
            y={comp.pcbY + ry - padH / 2}
            width={padW}
            height={padH}
            fill="#ffa502"
            stroke="#ff7f50"
            strokeWidth="0.1"
            rx="0.1"
          />
        );
      } else {
        // Through-Hole pad (circular golden ring with a black hole)
        return (
          <g key={pin.id}>
            <circle
              cx={comp.pcbX + rx}
              cy={comp.pcbY + ry}
              r="0.9"
              fill="#ffa502"
              stroke="#b57c1e"
              strokeWidth="0.1"
            />
            <circle
              cx={comp.pcbX + rx}
              cy={comp.pcbY + ry}
              r="0.45"
              fill="#080c14"
            />
          </g>
        );
      }
    });

    return (
      <g
        key={comp.id}
        className="footprint-group"
        onMouseDown={(e) => svgEl && handleCompMouseDown(e, comp, svgEl)}
        style={{ cursor: isSelected ? 'grabbing' : 'grab' }}
      >
        {/* Silkscreen component outline */}
        <rect
          x={comp.pcbX - w / 2}
          y={comp.pcbY - h / 2}
          width={w}
          height={h}
          fill="transparent"
          stroke={isSelected ? '#3b82f6' : 'rgba(255, 255, 255, 0.45)'}
          strokeWidth="0.25"
          strokeDasharray={comp.type === 'passive' ? '' : '1, 0.5'}
          transform={`rotate(${comp.rotation}, ${comp.pcbX}, ${comp.pcbY})`}
        />

        {/* Pin pads */}
        {pads}

        {/* Silkscreen text designator */}
        <text
          x={comp.pcbX}
          y={comp.pcbY + h / 2 + 2.5}
          fill="rgba(255, 255, 255, 0.8)"
          fontSize="2"
          textAnchor="middle"
          fontWeight="bold"
          fontFamily="var(--font-mono)"
          pointerEvents="none"
        >
          {comp.id}
        </text>
      </g>
    );
  };

  const svgRef = useRef<SVGSVGElement>(null);

  // Soldermask color classes
  const boardBgClass = `pcb-grid-bg ${settings.solderMaskColor}`;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Board overlay HUD */}
      <div
        style={{
          position: 'absolute',
          top: 12,
          left: 12,
          display: 'flex',
          gap: 12,
          zIndex: 10,
          pointerEvents: 'none'
        }}
      >
        <div className="glass-panel" style={{ padding: '8px 12px', fontSize: '0.8rem', pointerEvents: 'auto' }}>
          <div style={{ display: 'flex', gap: 15 }}>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Board:</span>{' '}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{settings.width}x{settings.height} mm</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Grid:</span>{' '}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{settings.gridSize} mm</strong>
            </div>
            <div>
              <span style={{ color: 'var(--text-dim)' }}>Clearance:</span>{' '}
              <strong style={{ fontFamily: 'var(--font-mono)' }}>{settings.clearance} mm</strong>
            </div>
          </div>
        </div>
      </div>

      {/* Control panel buttons (right side) */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 10 }}>
        <button
          className="btn btn-primary"
          onClick={onRunRouter}
          title="Run Auto-Router Engine"
        >
          <Play size={16} /> Auto-Route
        </button>
        <button className="btn" onClick={() => handleZoom(1.2)} title="Zoom In">
          +
        </button>
        <button className="btn" onClick={() => handleZoom(0.8)} title="Zoom Out">
          -
        </button>
      </div>

      {/* SVG Canvas for Board */}
      <svg
        ref={svgRef}
        width="100%"
        height="100%"
        className={boardBgClass}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isPanning.current ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* PCB physical board outline (shadow / background mask) */}
          <rect
            x="0"
            y="0"
            width={settings.width}
            height={settings.height}
            fill={
              settings.solderMaskColor === 'green' ? '#07301c' :
              settings.solderMaskColor === 'black' ? '#09090b' :
              settings.solderMaskColor === 'blue' ? '#081628' : '#1f0d0f'
            }
            stroke="rgba(255, 255, 255, 0.2)"
            strokeWidth="0.5"
            rx="2"
          />

          {/* Copper traces (Top layer = Red, Bottom layer = Blue) */}
          {traces.map(trace => (
            <line
              key={trace.id}
              x1={trace.x1}
              y1={trace.y1}
              x2={trace.x2}
              y2={trace.y2}
              stroke={trace.layer === 'top' ? 'var(--copper-top)' : 'var(--copper-bottom)'}
              strokeWidth={trace.width}
              strokeLinecap="round"
              opacity="0.85"
            />
          ))}

          {/* Vias (where traces switch layers, let's draw at intersections or endpoints if they existed,
              or simple pads. For now, show pads clearly on top of traces) */}

          {/* Footprints (pass svgRef down so offset conversions work) */}
          {components.map(comp => renderFootprint(comp, svgRef.current))}

          {/* Board Silkscreen text / details */}
          <text
            x={settings.width / 2}
            y={5}
            fill="rgba(255, 255, 255, 0.4)"
            fontSize="3"
            fontWeight="bold"
            textAnchor="middle"
            fontFamily="var(--font-title)"
          >
            AeroEDA DESIGN STUDIO
          </text>
          <text
            x={settings.width / 2}
            y={settings.height - 3}
            fill="rgba(255, 255, 255, 0.3)"
            fontSize="2"
            textAnchor="middle"
            fontFamily="var(--font-mono)"
          >
            REV 1.0 • COPPER 2-LAYER
          </text>
        </g>
      </svg>

      {/* Layer legend HUD */}
      <div
        style={{
          position: 'absolute',
          bottom: 12,
          left: 12,
          display: 'flex',
          gap: 12,
          zIndex: 10
        }}
      >
        <div className="glass-panel" style={{ padding: '8px 12px', fontSize: '0.75rem', display: 'flex', gap: 15 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--copper-top)' }} />
            <span>Top Layer (Red)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: 'var(--copper-bottom)' }} />
            <span>Bottom Layer (Blue)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: '#ffa502' }} />
            <span>Pads (Gold)</span>
          </div>
        </div>
      </div>
    </div>
  );
};
