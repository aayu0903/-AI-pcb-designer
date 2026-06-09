import React, { useState, useRef } from 'react';
import type { Component, Net } from '../types';
import { ZoomIn, ZoomOut, Maximize } from 'lucide-react';

interface SchematicViewProps {
  components: Component[];
  nets: Net[];
}

export const SchematicView: React.FC<SchematicViewProps> = ({ components, nets }) => {
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [selectedComp, setSelectedComp] = useState<Component | null>(null);
  
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Handle Pan start
  const handleMouseDown = (e: React.MouseEvent<SVGSVGElement>) => {
    // Only drag on left click on the background
    if (e.button !== 0) return;
    isDragging.current = true;
    dragStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!isDragging.current) return;
    setPan({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleZoom = (factor: number) => {
    setZoom(prev => Math.max(0.5, Math.min(2.5, prev * factor)));
  };

  const handleReset = () => {
    setZoom(1);
    setPan({ x: 50, y: 50 });
  };

  // Helper to find a pin's absolute schematic coordinates
  const getPinSchematicCoords = (pinId: string): { x: number; y: number } | null => {
    const comp = components.find(c => pinId.startsWith(c.id + '_'));
    if (!comp) return null;

    const pinName = pinId.substring(comp.id.length + 1);
    const pin = comp.pins.find(p => p.name.toUpperCase() === pinName.toUpperCase());
    if (!pin) return null;

    // Component size dimensions
    const compWidth = comp.type === 'mcu' ? 120 : (comp.type === 'connector' ? 70 : 60);
    const compHeight = comp.type === 'mcu' ? 160 : (comp.type === 'connector' ? 100 : 70);

    // Pin relative coordinates
    let pinRelX = pin.x;
    let pinRelY = pin.y;

    if (pin.side === 'left') {
      pinRelX = 0;
    } else if (pin.side === 'right') {
      pinRelX = compWidth;
    } else if (pin.side === 'top') {
      pinRelY = 0;
    } else if (pin.side === 'bottom') {
      pinRelY = compHeight;
    }

    return {
      x: comp.x + pinRelX,
      y: comp.y + pinRelY
    };
  };

  // Draw net wires orthogonally
  const renderNetWires = (net: Net) => {
    if (net.pinIds.length < 2) return null;

    // Connect pins in chain sequence
    const paths: React.JSX.Element[] = [];

    // Net colors based on purpose
    let wireColor = '#64748b'; // Slate signal
    if (net.name === 'GND') wireColor = '#334155'; // Dark Slate
    else if (net.name === '3.3V' || net.name === '5V_USB' || net.name === 'VBAT') wireColor = '#ef4444'; // Red Power
    else if (net.name.includes('SDA') || net.name.includes('SCL')) wireColor = '#f59e0b'; // Amber I2C
    else if (net.name.includes('DHT') || net.name.includes('DATA')) wireColor = '#10b981'; // Green Sensor

    for (let i = 0; i < net.pinIds.length - 1; i++) {
      const ptA = getPinSchematicCoords(net.pinIds[i]);
      const ptB = getPinSchematicCoords(net.pinIds[i + 1]);

      if (!ptA || !ptB) continue;

      // Draw orthogonal path: A -> MidX -> MidY -> B
      const midX = ptA.x + (ptB.x - ptA.x) / 2;
      const pathData = `M ${ptA.x} ${ptA.y} H ${midX} V ${ptB.y} H ${ptB.x}`;

      paths.push(
        <path
          key={`${net.id}_seg_${i}`}
          d={pathData}
          fill="none"
          stroke={wireColor}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      );

      // Add a dot at connecting junctions (if 3 or more pins connected to same net)
      if (net.pinIds.length > 2 && i > 0) {
        paths.push(
          <circle
            key={`${net.id}_junc_${i}`}
            cx={midX}
            cy={ptB.y}
            r="3.5"
            fill={wireColor}
          />
        );
      }
    }

    return <g key={net.id}>{paths}</g>;
  };

  // Custom schematic rendering based on component type
  const renderComponentSymbol = (comp: Component) => {
    // Width and height based on component type
    const width = comp.type === 'mcu' ? 120 : (comp.type === 'connector' ? 70 : 60);
    const height = comp.type === 'mcu' ? 160 : (comp.type === 'connector' ? 100 : 70);

    const isSelected = selectedComp?.id === comp.id;

    // Component graphics
    let graphic: React.JSX.Element | null = null;

    if (comp.type === 'passive') {
      if (comp.footprint.startsWith('R')) {
        // Resistor squiggle
        graphic = (
          <path
            d="M 10 35 H 20 L 23 25 L 27 45 L 31 25 L 35 45 L 39 25 L 43 45 L 47 25 L 50 35 H 60"
            fill="none"
            stroke={isSelected ? '#3b82f6' : '#94a3b8'}
            strokeWidth="2"
          />
        );
      } else if (comp.footprint.startsWith('C')) {
        // Capacitor plates
        graphic = (
          <g>
            <line x1="10" y1="35" x2="27" y2="35" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
            <line x1="27" y1="20" x2="27" y2="50" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="3" />
            <line x1="33" y1="20" x2="33" y2="50" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="3" />
            <line x1="33" y1="35" x2="50" y2="35" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
          </g>
        );
      } else if (comp.footprint.startsWith('LED')) {
        // LED symbol
        graphic = (
          <g>
            <line x1="10" y1="35" x2="25" y2="35" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
            <polygon points="25,20 40,35 25,50" fill="none" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
            <line x1="40" y1="20" x2="40" y2="50" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
            <line x1="40" y1="35" x2="55" y2="35" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
            {/* Emit arrows */}
            <path d="M 30 15 L 22 7 M 35 12 L 27 4" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="1.5" />
          </g>
        );
      }
    } else if (comp.footprint === 'BUTTON_TH') {
      // Push button
      graphic = (
        <g>
          <line x1="10" y1="35" x2="20" y2="35" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
          <line x1="40" y1="35" x2="50" y2="35" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2" />
          {/* Terminals */}
          <circle cx="20" cy="35" r="2.5" fill={isSelected ? '#3b82f6' : '#94a3b8'} />
          <circle cx="40" cy="35" r="2.5" fill={isSelected ? '#3b82f6' : '#94a3b8'} />
          {/* Lever */}
          <line x1="20" y1="33" x2="38" y2="20" stroke={isSelected ? '#3b82f6' : '#94a3b8'} strokeWidth="2.5" />
        </g>
      );
    }

    return (
      <g
        key={comp.id}
        transform={`translate(${comp.x}, ${comp.y})`}
        onClick={(e) => {
          e.stopPropagation();
          setSelectedComp(comp);
        }}
        style={{ cursor: 'pointer' }}
      >
        {/* Main symbol body box */}
        {!graphic ? (
          <rect
            width={width}
            height={height}
            fill="#1e293b"
            stroke={isSelected ? '#3b82f6' : '#475569'}
            strokeWidth={isSelected ? '2.5' : '1.5'}
            rx="6"
            filter="drop-shadow(0px 4px 6px rgba(0, 0, 0, 0.2))"
          />
        ) : (
          <rect
            width={width}
            height={height}
            fill="transparent"
            stroke={isSelected ? 'rgba(59, 130, 246, 0.15)' : 'transparent'}
            strokeWidth="2"
            rx="4"
          />
        )}

        {/* Custom icon graphics overlay */}
        {graphic}

        {/* Labels */}
        <text
          x={width / 2}
          y={comp.type === 'passive' || comp.footprint === 'BUTTON_TH' ? height - 5 : 20}
          textAnchor="middle"
          fill="#f8fafc"
          fontSize="11"
          fontWeight="bold"
          fontFamily="var(--font-title)"
        >
          {comp.id}
        </text>
        <text
          x={width / 2}
          y={comp.type === 'passive' || comp.footprint === 'BUTTON_TH' ? 15 : 35}
          textAnchor="middle"
          fill="#94a3b8"
          fontSize="9"
          fontFamily="var(--font-body)"
        >
          {comp.value}
        </text>

        {/* Pins rendering */}
        {comp.pins.map(pin => {
          let pinX = pin.x;
          let pinY = pin.y;
          let textX = pin.x;
          let textY = pin.y;
          let textAnchor: 'start' | 'end' | 'middle' = 'start';
          let linePath = '';

          // Determine offsets based on side pin sticks out
          const pinLineLen = 15;
          if (pin.side === 'left') {
            pinX = 0;
            linePath = `M 0 ${pinY} H -${pinLineLen}`;
            textX = 6;
            textY = pinY + 3;
            textAnchor = 'start';
          } else if (pin.side === 'right') {
            pinX = width;
            linePath = `M ${width} ${pinY} H ${width + pinLineLen}`;
            textX = width - 6;
            textY = pinY + 3;
            textAnchor = 'end';
          } else if (pin.side === 'top') {
            pinY = 0;
            linePath = `M ${pinX} 0 V -${pinLineLen}`;
            textX = pinX;
            textY = 12;
            textAnchor = 'middle';
          } else if (pin.side === 'bottom') {
            pinY = height;
            linePath = `M ${pinX} ${height} V ${height + pinLineLen}`;
            textX = pinX;
            textY = height - 12;
            textAnchor = 'middle';
          }

          return (
            <g key={pin.id}>
              {/* Pin lead line */}
              <path d={linePath} stroke="#64748b" strokeWidth="1.5" />
              {/* Pin label inside symbol */}
              {!(comp.type === 'passive') && (
                <text
                  x={textX}
                  y={textY}
                  fill="#cbd5e1"
                  fontSize="8"
                  textAnchor={textAnchor}
                  fontFamily="var(--font-mono)"
                >
                  {pin.name}
                </text>
              )}
              {/* Connection point dot (red if selectedComp) */}
              <circle
                cx={pin.side === 'left' ? pinX - pinLineLen : (pin.side === 'right' ? pinX + pinLineLen : pinX)}
                cy={pin.side === 'top' ? pinY - pinLineLen : (pin.side === 'bottom' ? pinY + pinLineLen : pinY)}
                r="2.5"
                fill="#475569"
                stroke="#64748b"
                strokeWidth="1"
              />
              {/* Pin number text */}
              <text
                x={pin.side === 'left' ? pinX - 8 : (pin.side === 'right' ? pinX + 8 : pinX)}
                y={pin.side === 'top' ? pinY - 5 : (pin.side === 'bottom' ? pinY + 8 : pinY - 5)}
                fill="#64748b"
                fontSize="7"
                textAnchor="middle"
                fontFamily="var(--font-mono)"
              >
                {pin.num}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {/* Zoom and Navigation controls */}
      <div style={{ position: 'absolute', top: 12, right: 12, display: 'flex', gap: 6, zIndex: 10 }}>
        <button className="btn" onClick={() => handleZoom(1.15)} title="Zoom In">
          <ZoomIn size={16} />
        </button>
        <button className="btn" onClick={() => handleZoom(0.85)} title="Zoom Out">
          <ZoomOut size={16} />
        </button>
        <button className="btn" onClick={handleReset} title="Fit Board">
          <Maximize size={16} />
        </button>
      </div>

      {/* SVG Canvas */}
      <svg
        width="100%"
        height="100%"
        className="grid-bg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{ cursor: isDragging.current ? 'grabbing' : 'grab' }}
      >
        <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
          {/* Wires */}
          {nets.map(net => renderNetWires(net))}

          {/* Components */}
          {components.map(comp => renderComponentSymbol(comp))}
        </g>
      </svg>

      {/* Selected Component Card overlay (left bottom) */}
      {selectedComp && (
        <div
          className="glass-panel"
          style={{
            position: 'absolute',
            bottom: 12,
            left: 12,
            width: 250,
            padding: 12,
            zIndex: 10,
            pointerEvents: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <h4 style={{ color: 'var(--primary)' }}>{selectedComp.id}</h4>
            <span className="badge" style={{ fontSize: '0.65rem' }}>{selectedComp.type.toUpperCase()}</span>
          </div>
          <p style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 4 }}>{selectedComp.name}</p>
          <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 8 }}>{selectedComp.description}</p>
          <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: 6, fontSize: '0.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-dim)' }}>Footprint:</span>
              <span style={{ fontFamily: 'var(--font-mono)' }}>{selectedComp.footprint}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
              <span style={{ color: 'var(--text-dim)' }}>Value:</span>
              <span>{selectedComp.value}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ color: 'var(--text-dim)' }}>Pins:</span>
              <span>{selectedComp.pins.length} pins</span>
            </div>
          </div>
          <button
            className="btn"
            style={{ width: '100%', marginTop: 8, fontSize: '0.7rem', padding: '4px 8px' }}
            onClick={() => setSelectedComp(null)}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
};
