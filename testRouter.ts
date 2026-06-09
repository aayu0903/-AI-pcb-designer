import { generateNetlist } from './src/netlistEngine';
import { runAutoRouter } from './src/routerEngine';
import type { BoardSettings } from './src/types';

const settings: BoardSettings = {
  width: 100,
  height: 80,
  solderMaskColor: 'green',
  gridSize: 1.0,
  clearance: 0.5,
  traceWidth: 0.3
};

const { components, nets } = generateNetlist('I want a smart ESP32 IoT node with a temperature sensor (DHT11), an OLED screen, and USB-C power.');

console.log(`Components: ${components.length}`);
console.log(`Nets: ${nets.length}`);

const traces = runAutoRouter(components, nets, settings);
console.log(`Total Traces generated: ${traces.length}`);

nets.forEach(net => {
  const netTraces = traces.filter(t => t.netId === net.id);
  const pinCount = net.pinIds.length;
  console.log(`Net: ${net.name} (${net.id}) - Pins: ${pinCount} - Traces: ${netTraces.length}`);
});
