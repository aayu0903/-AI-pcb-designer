export interface Pin {
  id: string; // e.g. "U1_GND"
  name: string; // e.g. "GND"
  num: number; // pin number
  x: number; // schematic local X offset
  y: number; // schematic local Y offset
  pcbX: number; // local PCB coordinate X offset (mm)
  pcbY: number; // local PCB coordinate Y offset (mm)
  side?: 'top' | 'bottom' | 'left' | 'right'; // schematic pin direction
}

export interface Component {
  id: string; // e.g. "U1"
  name: string; // e.g. "ESP32-WROOM-32"
  type: 'mcu' | 'sensor' | 'actuator' | 'power' | 'connector' | 'passive';
  footprint: 'ESP32_SMD' | 'DHT11_TH' | 'OLED_I2C' | 'USB_C_16P' | 'R0805' | 'C0805' | 'LED0805' | 'SOT23' | 'BATT_CONN' | 'BUTTON_TH';
  value: string; // e.g. "ESP32", "10k", "100nF"
  x: number; // schematic global X
  y: number; // schematic global Y
  pcbX: number; // PCB global X (mm)
  pcbY: number; // PCB global Y (mm)
  pcbWidth: number; // PCB footprint width (mm)
  pcbHeight: number; // PCB footprint height (mm)
  rotation: number; // PCB rotation (0, 90, 180, 270)
  pins: Pin[];
  description: string;
}

export interface Net {
  id: string; // e.g. "net_gnd"
  name: string; // e.g. "GND"
  pinIds: string[]; // e.g. ["U1_1", "R1_2"]
  color?: string; // schematic display color
}

export interface TraceSegment {
  id: string;
  netId: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  layer: 'top' | 'bottom';
  width: number; // trace width in mm
}

export interface BoardSettings {
  width: number; // PCB width in mm (e.g. 100)
  height: number; // PCB height in mm (e.g. 80)
  solderMaskColor: 'green' | 'black' | 'blue' | 'red';
  gridSize: number; // mm grid size (e.g. 1 or 2.54)
  clearance: number; // mm minimum trace clearance (e.g. 0.5)
  traceWidth: number; // default trace width in mm (e.g. 0.3)
}

export interface DrcError {
  id: string;
  type: 'overlap' | 'unrouted' | 'clearance' | 'boundary';
  message: string;
  severity: 'error' | 'warning';
  netId?: string;
  x?: number;
  y?: number;
}

export interface BOMItem {
  id: string;
  designator: string; // e.g. "R1, R2"
  name: string; // e.g. "Resistor 10k"
  footprint: string;
  quantity: number;
  value: string;
  estimatedPrice: number; // USD
}
