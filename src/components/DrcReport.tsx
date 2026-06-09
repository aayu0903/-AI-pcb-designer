import { useMemo } from 'react';
import type { Component, TraceSegment, Net, BoardSettings, DrcError } from '../types';
import { ShieldCheck, AlertTriangle, XCircle } from 'lucide-react';

interface DrcReportProps {
  components: Component[];
  traces: TraceSegment[];
  nets: Net[];
  settings: BoardSettings;
}

// 2D Line segment intersection helper
function checkLineIntersection(
  x1: number, y1: number, x2: number, y2: number,
  x3: number, y3: number, x4: number, y4: number
): boolean {
  const det = (x2 - x1) * (y4 - y3) - (y2 - y1) * (x4 - x3);
  if (det === 0) return false; // Parallel

  const lambda = ((y4 - y3) * (x4 - x1) + (x3 - x4) * (y4 - y1)) / det;
  const gamma = ((y1 - y2) * (x4 - x1) + (x2 - x1) * (y4 - y1)) / det;

  return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
}

export const DrcReport: React.FC<DrcReportProps> = ({ components, traces, nets, settings }) => {
  const errors = useMemo<DrcError[]>(() => {
    const list: DrcError[] = [];

    // 1. Check Board Boundary Violations
    components.forEach(comp => {
      const halfW = comp.pcbWidth / 2;
      const halfH = comp.pcbHeight / 2;
      const left = comp.pcbX - halfW;
      const right = comp.pcbX + halfW;
      const top = comp.pcbY - halfH;
      const bottom = comp.pcbY + halfH;

      if (left < 0 || right > settings.width || top < 0 || bottom > settings.height) {
        list.push({
          id: `boundary_${comp.id}`,
          type: 'boundary',
          message: `Component ${comp.id} (${comp.name}) is outside board boundary limits.`,
          severity: 'error',
          x: comp.pcbX,
          y: comp.pcbY
        });
      }
    });

    // 2. Check Trace collisions (Short circuits)
    // Check all pairs of trace segments. If they belong to different nets and intersect on the same layer, it's a short circuit.
    for (let i = 0; i < traces.length; i++) {
      for (let j = i + 1; j < traces.length; j++) {
        const t1 = traces[i];
        const t2 = traces[j];

        if (t1.netId !== t2.netId && t1.layer === t2.layer) {
          const isIntersecting = checkLineIntersection(
            t1.x1, t1.y1, t1.x2, t1.y2,
            t2.x1, t2.y1, t2.x2, t2.y2
          );

          if (isIntersecting) {
            const net1Name = nets.find(n => n.id === t1.netId)?.name || t1.netId;
            const net2Name = nets.find(n => n.id === t2.netId)?.name || t2.netId;
            list.push({
              id: `short_${t1.id}_${t2.id}`,
              type: 'overlap',
              message: `Short Circuit: Collision between net '${net1Name}' and net '${net2Name}' on Layer: ${t1.layer.toUpperCase()}.`,
              severity: 'error',
              x: (t1.x1 + t1.x2) / 2,
              y: (t1.y1 + t1.y2) / 2
            });
          }
        }
      }
    }

    // 3. Check for Unrouted Nets
    // Simple check: for each net, is there at least one trace segment?
    // If not, it's completely unrouted. If a net has multiple connections but fewer traces than N-1, some segments are unrouted.
    nets.forEach(net => {
      if (net.pinIds.length < 2) return;

      const hasTraces = traces.some(t => t.netId === net.id);
      if (!hasTraces) {
        list.push({
          id: `unrouted_${net.id}`,
          type: 'unrouted',
          message: `Net '${net.name}' is completely unrouted.`,
          severity: 'error',
          netId: net.id
        });
      }
    });

    return list;
  }, [components, traces, nets, settings]);

  const errorCount = errors.filter(e => e.severity === 'error').length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 className="card-title">
          <ShieldCheck size={18} color={errorCount === 0 ? 'var(--success)' : 'var(--danger)'} /> Design Rule Check (DRC)
        </h3>
        <span style={{ fontSize: '0.8rem', color: errorCount === 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 'bold' }}>
          {errorCount === 0 ? 'Passed' : `${errorCount} Errors`}
        </span>
      </div>

      <div style={{ padding: 16, flex: 1, overflowY: 'auto' }}>
        {errors.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 10, color: 'var(--text-muted)', textAlign: 'center' }}>
            <ShieldCheck size={48} color="var(--success)" />
            <div>
              <p style={{ fontWeight: 600, color: 'var(--text-main)' }}>No DRC Violations Found!</p>
              <p style={{ fontSize: '0.75rem', marginTop: 4 }}>Your board footprint boundaries, trace layouts, and electrical nets are valid.</p>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {errors.map(err => (
              <div
                key={err.id}
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: err.severity === 'error' ? 'rgba(239, 68, 68, 0.08)' : 'rgba(245, 158, 11, 0.08)',
                  border: `1px solid ${err.severity === 'error' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(245, 158, 11, 0.2)'}`,
                  display: 'flex',
                  gap: 12
                }}
              >
                <div style={{ marginTop: 2 }}>
                  {err.severity === 'error' ? (
                    <XCircle size={16} color="var(--danger)" />
                  ) : (
                    <AlertTriangle size={16} color="var(--warning)" />
                  )}
                </div>
                <div>
                  <p style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-main)' }}>{err.message}</p>
                  <div style={{ display: 'flex', gap: 12, marginTop: 4, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                    <span>Type: {err.type.toUpperCase()}</span>
                    {err.x !== undefined && err.y !== undefined && (
                      <span>Location: ({err.x.toFixed(1)}, {err.y.toFixed(1)}) mm</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
