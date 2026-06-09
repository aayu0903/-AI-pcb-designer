import type { Component, Net, TraceSegment, BoardSettings } from './types';

interface GridPoint {
  x: number;
  y: number;
}

interface PathNode {
  x: number;
  y: number;
  g: number; // cost from start
  h: number; // heuristic cost to end
  f: number; // total cost (g + h)
  parent: PathNode | null;
  layer: 'top' | 'bottom';
}

export function runAutoRouter(
  components: Component[],
  nets: Net[],
  settings: BoardSettings
): TraceSegment[] {
  // 1. Establish grid dimensions
  // Scale PCB board dimensions (mm) to grid coordinates. Grid size e.g. 1mm.
  const gridSpacing = 1.0; // 1mm grid cells
  const width = Math.ceil(settings.width / gridSpacing);
  const height = Math.ceil(settings.height / gridSpacing);

  // 2. Initialize obstacle grids for 'top' and 'bottom' layers
  // null = empty, 'body' = component body obstacle, netId (string) = occupied by that net
  const gridTop: (string | null)[][] = Array(width).fill(null).map(() => Array(height).fill(null));
  const gridBottom: (string | null)[][] = Array(width).fill(null).map(() => Array(height).fill(null));

  // 3. Mark component bodies as obstacles on both layers (leaving a small border around pins)
  components.forEach(comp => {
    // Convert comp PCB coordinates to grid indices
    const cx = Math.round(comp.pcbX / gridSpacing);
    const cy = Math.round(comp.pcbY / gridSpacing);
    
    // Swap width/height if component is rotated 90 or 270 degrees
    const isRotated90or270 = comp.rotation === 90 || comp.rotation === 270;
    const pcbW = isRotated90or270 ? comp.pcbHeight : comp.pcbWidth;
    const pcbH = isRotated90or270 ? comp.pcbWidth : comp.pcbHeight;

    const w = Math.ceil(pcbW / gridSpacing);
    const h = Math.ceil(pcbH / gridSpacing);

    // Bounding box bounds (shrink slightly so routes can approach pins)
    const xStart = Math.max(0, cx - Math.floor(w / 2) + 1);
    const xEnd = Math.min(width - 1, cx + Math.floor(w / 2) - 1);
    const yStart = Math.max(0, cy - Math.floor(h / 2) + 1);
    const yEnd = Math.min(height - 1, cy + Math.floor(h / 2) - 1);

    for (let x = xStart; x <= xEnd; x++) {
      for (let y = yStart; y <= yEnd; y++) {
        gridTop[x][y] = 'body';
        gridBottom[x][y] = 'body';
      }
    }
  });

  const traces: TraceSegment[] = [];
  let segmentIdCounter = 1;

  // Helper to map pin ID to its absolute PCB coordinates on the board
  const getPinPcbCoords = (pinId: string): { x: number; y: number; comp: Component } | null => {
    const comp = components.find(c => pinId.startsWith(c.id + '_'));
    if (!comp) return null;

    const pinName = pinId.substring(comp.id.length + 1);
    const pin = comp.pins.find(p => p.name.toUpperCase() === pinName.toUpperCase());
    if (!pin) return null;

    // Apply component rotation to local pin offsets
    const rad = (comp.rotation * Math.PI) / 180;
    const rx = pin.pcbX * Math.cos(rad) - pin.pcbY * Math.sin(rad);
    const ry = pin.pcbX * Math.sin(rad) + pin.pcbY * Math.cos(rad);

    return {
      x: comp.pcbX + rx,
      y: comp.pcbY + ry,
      comp
    };
  };

  // 4. Route net connections sequentially
  // Sort nets: prioritize shorter nets first or power nets. Let's do simple order.
  nets.forEach(net => {
    if (net.pinIds.length < 2) return;

    // Connect pins sequentially: pin 0 -> pin 1 -> pin 2...
    for (let i = 0; i < net.pinIds.length - 1; i++) {
      const pinA = getPinPcbCoords(net.pinIds[i]);
      const pinB = getPinPcbCoords(net.pinIds[i + 1]);

      if (!pinA || !pinB) continue;

      // Convert mm to grid index
      const startGridX = Math.max(0, Math.min(width - 1, Math.round(pinA.x / gridSpacing)));
      const startGridY = Math.max(0, Math.min(height - 1, Math.round(pinA.y / gridSpacing)));
      const endGridX = Math.max(0, Math.min(width - 1, Math.round(pinB.x / gridSpacing)));
      const endGridY = Math.max(0, Math.min(height - 1, Math.round(pinB.y / gridSpacing)));

      // Save original cell states to restore them later
      const originalStartTop = gridTop[startGridX][startGridY];
      const originalEndTop = gridTop[endGridX][endGridY];
      const originalStartBottom = gridBottom[startGridX][startGridY];
      const originalEndBottom = gridBottom[endGridX][endGridY];

      // Temporarily clear starting and ending points in obstacle grids so pathfinding can start and end there
      gridTop[startGridX][startGridY] = null;
      gridTop[endGridX][endGridY] = null;
      gridBottom[startGridX][startGridY] = null;
      gridBottom[endGridX][endGridY] = null;

      // Try routing on TOP layer first. If it fails, try BOTTOM layer.
      let path = routeAStar(startGridX, startGridY, endGridX, endGridY, gridTop, net.id, 'top', width, height);
      let activeLayer: 'top' | 'bottom' = 'top';

      if (!path) {
        // Try bottom layer
        path = routeAStar(startGridX, startGridY, endGridX, endGridY, gridBottom, net.id, 'bottom', width, height);
        activeLayer = 'bottom';
      }

      // Restore original cell states
      gridTop[startGridX][startGridY] = originalStartTop;
      gridTop[endGridX][endGridY] = originalEndTop;
      gridBottom[startGridX][startGridY] = originalStartBottom;
      gridBottom[endGridX][endGridY] = originalEndBottom;

      if (path) {
        // Convert path points back to mm coordinates and create traces
        const mmPath = path.map(p => ({
          x: p.x * gridSpacing,
          y: p.y * gridSpacing
        }));

        // Coalesce straight line segments
        const simplified = simplifyPath(mmPath);

        // Add segments to trace list
        for (let j = 0; j < simplified.length - 1; j++) {
          traces.push({
            id: `seg_${segmentIdCounter++}`,
            netId: net.id,
            x1: simplified[j].x,
            y1: simplified[j].y,
            x2: simplified[j + 1].x,
            y2: simplified[j + 1].y,
            layer: activeLayer,
            width: settings.traceWidth
          });
        }

        // Add path to obstacles: label them with net.id
        const activeGrid = activeLayer === 'top' ? gridTop : gridBottom;
        path.forEach(pt => {
          activeGrid[pt.x][pt.y] = net.id;
        });
      }
    }
  });

  return traces;
}

// A* Pathfinding Algorithm Implementation
function routeAStar(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  obstacleGrid: (string | null)[][],
  netId: string,
  layer: 'top' | 'bottom',
  gridWidth: number,
  gridHeight: number
): GridPoint[] | null {
  const openList: PathNode[] = [];
  const closedList = Array(gridWidth).fill(false).map(() => Array(gridHeight).fill(false));

  const startNode: PathNode = {
    x: startX,
    y: startY,
    g: 0,
    h: Math.abs(startX - endX) + Math.abs(startY - endY),
    f: 0,
    parent: null,
    layer
  };
  startNode.f = startNode.g + startNode.h;
  openList.push(startNode);

  while (openList.length > 0) {
    // Get node with lowest f cost
    openList.sort((a, b) => a.f - b.f);
    const current = openList.shift()!;

    closedList[current.x][current.y] = true;

    // Check if we reached the destination
    if (current.x === endX && current.y === endY) {
      const path: GridPoint[] = [];
      let temp: PathNode | null = current;
      while (temp !== null) {
        path.push({ x: temp.x, y: temp.y });
        temp = temp.parent;
      }
      return path.reverse();
    }

    // Neighbors (orthogonal movement only: Up, Down, Left, Right)
    const dirs = [
      { dx: 0, dy: -1 },
      { dx: 0, dy: 1 },
      { dx: -1, dy: 0 },
      { dx: 1, dy: 0 }
    ];

    for (const d of dirs) {
      const nx = current.x + d.dx;
      const ny = current.y + d.dy;

      // Bounds check
      if (nx < 0 || nx >= gridWidth || ny < 0 || ny >= gridHeight) continue;

      // Obstacle check or closed check
      const cell = obstacleGrid[nx][ny];
      const isObstacle = cell === 'body' || (cell !== null && cell !== netId);
      if (closedList[nx][ny] || isObstacle) continue;

      const gCost = current.g + 1; // distance between neighbors is always 1
      const hCost = Math.abs(nx - endX) + Math.abs(ny - endY);
      const fCost = gCost + hCost;

      // Check if this point is already in openList with a lower cost
      const existing = openList.find(n => n.x === nx && n.y === ny);
      if (existing && existing.g <= gCost) continue;

      if (existing) {
        existing.g = gCost;
        existing.f = fCost;
        existing.parent = current;
      } else {
        openList.push({
          x: nx,
          y: ny,
          g: gCost,
          h: hCost,
          f: fCost,
          parent: current,
          layer
        });
      }
    }
  }

  return null; // No path found
}

// Coalesce collinear path points to simplify rendering and output
function simplifyPath(path: GridPoint[]): GridPoint[] {
  if (path.length <= 2) return path;

  const result: GridPoint[] = [path[0]];

  for (let i = 1; i < path.length - 1; i++) {
    const prev = path[i - 1];
    const curr = path[i];
    const next = path[i + 1];

    // Calculate directions
    const dx1 = curr.x - prev.x;
    const dy1 = curr.y - prev.y;
    const dx2 = next.x - curr.x;
    const dy2 = next.y - curr.y;

    // Check if direction changes (not collinear)
    const isCollinear = (dx1 * dy2 - dy1 * dx2) === 0;

    if (!isCollinear) {
      result.push(curr);
    }
  }

  result.push(path[path.length - 1]);
  return result;
}
