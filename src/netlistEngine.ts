import type { Component, Pin, Net } from './types';

// Helper to create pins for components
function createPins(compId: string, pinData: { num: number; name: string; x: number; y: number; pcbX: number; pcbY: number; side?: 'left' | 'right' | 'top' | 'bottom' }[]): Pin[] {
  return pinData.map(p => ({
    id: `${compId}_${p.name.toUpperCase()}`,
    name: p.name,
    num: p.num,
    x: p.x,
    y: p.y,
    pcbX: p.pcbX,
    pcbY: p.pcbY,
    side: p.side || 'left',
  }));
}

export const PRESETS = [
  {
    id: 'esp32_iot',
    name: 'ESP32 Weather Station Node',
    description: 'An ESP32-based IoT node with a DHT11 temperature/humidity sensor, I2C OLED display, USB-C power input, and charging circuit.',
    prompt: 'I want a smart ESP32 IoT node with a temperature sensor (DHT11), an OLED screen, and USB-C power.'
  },
  {
    id: 'arduino_clone',
    name: 'Arduino Micro Dev Board',
    description: 'A compact Arduino-compatible board featuring an ATmega328P MCU (represented via SOT/QFP style), USB-C, power regulator, reset button, and status LEDs.',
    prompt: 'Create an Arduino clone with a reset button, status LED, and USB-C port.'
  },
  {
    id: 'lipo_charger',
    name: 'LiPo Battery Charger & regulator',
    description: 'A power management board with USB-C input, a LiPo battery connector, battery charge controller, and a 3.3V voltage regulator with filter capacitors.',
    prompt: 'I need a USB-C battery charger board for a lithium-polymer battery with safety charging status LEDs.'
  }
];

export function generateNetlist(prompt: string): { components: Component[]; nets: Net[] } {
  const query = prompt.toLowerCase();

  const components: Component[] = [];
  const nets: Net[] = [];

  // Common power nets
  const netGnd: Net = { id: 'net_gnd', name: 'GND', pinIds: [] };
  const net3v3: Net = { id: 'net_3v3', name: '3.3V', pinIds: [] };
  const netVbus: Net = { id: 'net_vbus', name: '5V_USB', pinIds: [] };

  // Helper to connect pins
  const connectPin = (net: Net, pinId: string) => {
    if (!net.pinIds.includes(pinId)) {
      net.pinIds.push(pinId);
    }
  };

  // 1. ALWAYS ADD A POWER CONNECTOR (USB-C) for power input
  const usb: Component = {
    id: 'J1',
    name: 'USB-C Connector',
    type: 'connector',
    footprint: 'USB_C_16P',
    value: 'USB-C',
    x: 100,
    y: 300,
    pcbX: 10,
    pcbY: 40,
    pcbWidth: 9,
    pcbHeight: 8,
    rotation: 0,
    pins: [],
    description: '16-pin USB Type-C connector for power and routing.'
  };
  usb.pins = createPins('J1', [
    { num: 1, name: 'GND', x: 0, y: 10, pcbX: -4, pcbY: 3, side: 'left' },
    { num: 2, name: 'VBUS', x: 40, y: 10, pcbX: -4, pcbY: -3, side: 'right' },
    { num: 3, name: 'CC1', x: 40, y: 20, pcbX: -2, pcbY: 3, side: 'right' },
    { num: 4, name: 'CC2', x: 40, y: 30, pcbX: 2, pcbY: 3, side: 'right' },
    { num: 5, name: 'D-', x: 40, y: 40, pcbX: -1, pcbY: -3, side: 'right' },
    { num: 6, name: 'D+', x: 40, y: 50, pcbX: 1, pcbY: -3, side: 'right' }
  ]);
  components.push(usb);
  connectPin(netGnd, 'J1_GND');
  connectPin(netVbus, 'J1_VBUS');

  // Let's add CC pull-downs for USB-C (needed to request 5V from source)
  const rcc1: Component = {
    id: 'R_CC1',
    name: '5.1k Pull-down',
    type: 'passive',
    footprint: 'R0805',
    value: '5.1k',
    x: 180,
    y: 220,
    pcbX: 15,
    pcbY: 32,
    pcbWidth: 2,
    pcbHeight: 1.2,
    rotation: 90,
    pins: [],
    description: 'USB-C Configuration Channel pull-down resistor.'
  };
  rcc1.pins = createPins('R_CC1', [
    { num: 1, name: '1', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
    { num: 2, name: '2', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
  ]);
  components.push(rcc1);
  connectPin(netGnd, 'R_CC1_2');

  const cc1Net: Net = { id: 'net_cc1', name: 'CC1', pinIds: ['J1_CC1', 'R_CC1_1'] };
  nets.push(cc1Net);

  // Check what main MCU we want: ESP32 or ATmega328P (default to ESP32 if IoT/esp is mentioned, Arduino/ATMega if arduino clone)
  const isArduino = query.includes('arduino') || query.includes('atmega') || query.includes('clone');
  const isLipoOnly = query.includes('lipo') || query.includes('charger') || query.includes('battery') && !query.includes('esp') && !query.includes('arduino');
  const isEsp32 = query.includes('esp32') || query.includes('iot') || query.includes('sensor') || query.includes('weather') || (!isArduino && !isLipoOnly);

  if (isEsp32) {
    // 2. ADD ESP32-WROOM-32 MCU
    const mcu: Component = {
      id: 'U1',
      name: 'ESP32 Module',
      type: 'mcu',
      footprint: 'ESP32_SMD',
      value: 'ESP32-WROOM-32E',
      x: 350,
      y: 200,
      pcbX: 50,
      pcbY: 40,
      pcbWidth: 18,
      pcbHeight: 25.5,
      rotation: 0,
      pins: [],
      description: 'Wi-Fi & Bluetooth microcontroller module.'
    };
    mcu.pins = createPins('U1', [
      { num: 1, name: 'GND', x: 0, y: 10, pcbX: -9, pcbY: 10, side: 'left' },
      { num: 2, name: '3V3', x: 0, y: 20, pcbX: -9, pcbY: 8, side: 'left' },
      { num: 3, name: 'EN', x: 0, y: 30, pcbX: -9, pcbY: 6, side: 'left' },
      { num: 4, name: 'IO34', x: 0, y: 40, pcbX: -9, pcbY: 4, side: 'left' },
      { num: 5, name: 'IO35', x: 0, y: 50, pcbX: -9, pcbY: 2, side: 'left' },
      { num: 6, name: 'IO32', x: 0, y: 60, pcbX: -9, pcbY: 0, side: 'left' },
      { num: 7, name: 'IO33', x: 0, y: 70, pcbX: -9, pcbY: -2, side: 'left' },
      { num: 8, name: 'IO25', x: 0, y: 80, pcbX: -9, pcbY: -4, side: 'left' },
      { num: 9, name: 'IO26', x: 0, y: 90, pcbX: -9, pcbY: -6, side: 'left' },
      { num: 10, name: 'IO27', x: 0, y: 100, pcbX: -9, pcbY: -8, side: 'left' },
      { num: 11, name: 'IO14', x: 0, y: 110, pcbX: -9, pcbY: -10, side: 'left' },
      // Right side
      { num: 12, name: 'GND2', x: 100, y: 10, pcbX: 9, pcbY: 10, side: 'right' },
      { num: 13, name: 'IO23', x: 100, y: 20, pcbX: 9, pcbY: 8, side: 'right' },
      { num: 14, name: 'IO22', x: 100, y: 30, pcbX: 9, pcbY: 6, side: 'right' },
      { num: 15, name: 'TXD', x: 100, y: 40, pcbX: 9, pcbY: 4, side: 'right' },
      { num: 16, name: 'RXD', x: 100, y: 50, pcbX: 9, pcbY: 2, side: 'right' },
      { num: 17, name: 'IO21', x: 100, y: 60, pcbX: 9, pcbY: 0, side: 'right' },
      { num: 18, name: 'IO19', x: 100, y: 70, pcbX: 9, pcbY: -2, side: 'right' },
      { num: 19, name: 'IO18', x: 100, y: 80, pcbX: 9, pcbY: -4, side: 'right' },
      { num: 20, name: 'IO5', x: 100, y: 90, pcbX: 9, pcbY: -6, side: 'right' },
      { num: 21, name: 'IO17', x: 100, y: 100, pcbX: 9, pcbY: -8, side: 'right' },
      { num: 22, name: 'IO16', x: 100, y: 110, pcbX: 9, pcbY: -10, side: 'right' }
    ]);
    components.push(mcu);
    connectPin(netGnd, 'U1_GND');
    connectPin(netGnd, 'U1_GND2');
    connectPin(net3v3, 'U1_3V3');

    // 3. ADD LDO Voltage Regulator (5V USB -> 3.3V MCU)
    const ldo: Component = {
      id: 'U2',
      name: '3.3V LDO Regulator',
      type: 'power',
      footprint: 'SOT23',
      value: 'AP2112K-3.3',
      x: 220,
      y: 400,
      pcbX: 25,
      pcbY: 55,
      pcbWidth: 3,
      pcbHeight: 2.8,
      rotation: 0,
      pins: [],
      description: 'Low Dropout voltage regulator, stepping 5V down to 3.3V.'
    };
    ldo.pins = createPins('U2', [
      { num: 1, name: 'GND', x: 0, y: 10, pcbX: -1, pcbY: -1, side: 'left' },
      { num: 2, name: 'VIN', x: 0, y: 30, pcbX: -1, pcbY: 1, side: 'left' },
      { num: 3, name: 'VOUT', x: 60, y: 20, pcbX: 1, pcbY: 0, side: 'right' }
    ]);
    components.push(ldo);
    connectPin(netGnd, 'U2_GND');
    connectPin(netVbus, 'U2_VIN');
    connectPin(net3v3, 'U2_VOUT');

    // LDO Decoupling Capacitors
    const cIn: Component = {
      id: 'C1',
      name: 'Input Capacitor',
      type: 'passive',
      footprint: 'C0805',
      value: '10uF',
      x: 180,
      y: 480,
      pcbX: 20,
      pcbY: 55,
      pcbWidth: 2,
      pcbHeight: 1.25,
      rotation: 90,
      pins: [],
      description: 'LDO input decoupling filter capacitor.'
    };
    cIn.pins = createPins('C1', [
      { num: 1, name: '1', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
      { num: 2, name: '2', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
    ]);
    components.push(cIn);
    connectPin(netVbus, 'C1_1');
    connectPin(netGnd, 'C1_2');

    const cOut: Component = {
      id: 'C2',
      name: 'Output Capacitor',
      type: 'passive',
      footprint: 'C0805',
      value: '10uF',
      x: 290,
      y: 480,
      pcbX: 30,
      pcbY: 55,
      pcbWidth: 2,
      pcbHeight: 1.25,
      rotation: 90,
      pins: [],
      description: 'LDO output stabilization capacitor.'
    };
    cOut.pins = createPins('C2', [
      { num: 1, name: '1', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
      { num: 2, name: '2', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
    ]);
    components.push(cOut);
    connectPin(net3v3, 'C2_1');
    connectPin(netGnd, 'C2_2');

    // ESP32 EN Pull-Up (Reset Circuitry)
    const rEn: Component = {
      id: 'R_EN',
      name: 'EN Pull-up',
      type: 'passive',
      footprint: 'R0805',
      value: '10k',
      x: 350,
      y: 100,
      pcbX: 43,
      pcbY: 56,
      pcbWidth: 2,
      pcbHeight: 1.2,
      rotation: 0,
      pins: [],
      description: 'Resistor holding the EN reset pin high.'
    };
    rEn.pins = createPins('R_EN', [
      { num: 1, name: '1', x: 0, y: 10, pcbX: -0.8, pcbY: 0, side: 'left' },
      { num: 2, name: '2', x: 20, y: 10, pcbX: 0.8, pcbY: 0, side: 'right' }
    ]);
    components.push(rEn);
    connectPin(net3v3, 'R_EN_1');
    
    const enNet: Net = { id: 'net_en', name: 'ESP_EN', pinIds: ['U1_EN', 'R_EN_2'] };
    nets.push(enNet);

    // 4. DHT11 SENSOR (if sensor or temperature is requested, default to yes for ESP32 weather node)
    if (query.includes('sensor') || query.includes('dht') || query.includes('temp') || query.includes('weather') || query.includes('humidity') || true) {
      const dht: Component = {
        id: 'SEN1',
        name: 'DHT11 Temp/Humid Sensor',
        type: 'sensor',
        footprint: 'DHT11_TH',
        value: 'DHT11',
        x: 600,
        y: 100,
        pcbX: 85,
        pcbY: 20,
        pcbWidth: 12,
        pcbHeight: 15,
        rotation: 0,
        pins: [],
        description: 'Single-bus digital temperature and humidity sensor.'
      };
      dht.pins = createPins('SEN1', [
        { num: 1, name: 'VCC', x: 0, y: 10, pcbX: -3.81, pcbY: -5, side: 'left' },
        { num: 2, name: 'DATA', x: 0, y: 20, pcbX: -1.27, pcbY: -5, side: 'left' },
        { num: 3, name: 'NC', x: 0, y: 30, pcbX: 1.27, pcbY: -5, side: 'left' },
        { num: 4, name: 'GND', x: 0, y: 40, pcbX: 3.81, pcbY: -5, side: 'left' }
      ]);
      components.push(dht);
      connectPin(net3v3, 'SEN1_VCC');
      connectPin(netGnd, 'SEN1_GND');

      // DHT Data Net connected to GPIO14
      const dhtNet: Net = { id: 'net_dht_data', name: 'DHT_DATA', pinIds: ['SEN1_DATA', 'U1_IO14'] };
      nets.push(dhtNet);

      // Pull up resistor for DHT11 data line
      const rDht: Component = {
        id: 'R_DHT',
        name: 'DHT Pull-up',
        type: 'passive',
        footprint: 'R0805',
        value: '4.7k',
        x: 550,
        y: 40,
        pcbX: 80,
        pcbY: 30,
        pcbWidth: 2,
        pcbHeight: 1.2,
        rotation: 90,
        pins: [],
        description: 'DHT11 Single-bus data line pull-up resistor.'
      };
      rDht.pins = createPins('R_DHT', [
        { num: 1, name: '1', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
        { num: 2, name: '2', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
      ]);
      components.push(rDht);
      connectPin(net3v3, 'R_DHT_1');
      connectPin(dhtNet, 'R_DHT_2');
    }

    // 5. OLED DISPLAY (if display or screen or oled is requested, default to yes for weather node)
    if (query.includes('display') || query.includes('screen') || query.includes('oled') || query.includes('weather') || true) {
      const oled: Component = {
        id: 'DS1',
        name: '0.96" OLED Display',
        type: 'actuator',
        footprint: 'OLED_I2C',
        value: 'SSD1306',
        x: 600,
        y: 350,
        pcbX: 85,
        pcbY: 60,
        pcbWidth: 27,
        pcbHeight: 15,
        rotation: 180,
        pins: [],
        description: '128x64 pixel I2C OLED graphical display.'
      };
      oled.pins = createPins('DS1', [
        { num: 1, name: 'GND', x: 0, y: 10, pcbX: -3.81, pcbY: 5, side: 'left' },
        { num: 2, name: 'VCC', x: 0, y: 20, pcbX: -1.27, pcbY: 5, side: 'left' },
        { num: 3, name: 'SCL', x: 0, y: 30, pcbX: 1.27, pcbY: 5, side: 'left' },
        { num: 4, name: 'SDA', x: 0, y: 40, pcbX: 3.81, pcbY: 5, side: 'left' }
      ]);
      components.push(oled);
      connectPin(netGnd, 'DS1_GND');
      connectPin(net3v3, 'DS1_VCC');

      // I2C Nets connected to ESP32 IO22 (SCL) and IO21 (SDA)
      const sclNet: Net = { id: 'net_scl', name: 'I2C_SCL', pinIds: ['DS1_SCL', 'U1_IO22'] };
      const sdaNet: Net = { id: 'net_sda', name: 'I2C_SDA', pinIds: ['DS1_SDA', 'U1_IO21'] };
      nets.push(sclNet);
      nets.push(sdaNet);

      // I2C Pull up resistors
      const rpScl: Component = {
        id: 'R_SCL',
        name: 'SCL Pull-up',
        type: 'passive',
        footprint: 'R0805',
        value: '4.7k',
        x: 500,
        y: 320,
        pcbX: 70,
        pcbY: 55,
        pcbWidth: 2,
        pcbHeight: 1.2,
        rotation: 0,
        pins: [],
        description: 'I2C SCL bus pull-up resistor.'
      };
      rpScl.pins = createPins('R_SCL', [
        { num: 1, name: '1', x: 0, y: 10, pcbX: -0.8, pcbY: 0, side: 'left' },
        { num: 2, name: '2', x: 20, y: 10, pcbX: 0.8, pcbY: 0, side: 'right' }
      ]);
      components.push(rpScl);
      connectPin(net3v3, 'R_SCL_1');
      connectPin(sclNet, 'R_SCL_2');

      const rpSda: Component = {
        id: 'R_SDA',
        name: 'SDA Pull-up',
        type: 'passive',
        footprint: 'R0805',
        value: '4.7k',
        x: 500,
        y: 380,
        pcbX: 70,
        pcbY: 48,
        pcbWidth: 2,
        pcbHeight: 1.2,
        rotation: 0,
        pins: [],
        description: 'I2C SDA bus pull-up resistor.'
      };
      rpSda.pins = createPins('R_SDA', [
        { num: 1, name: '1', x: 0, y: 10, pcbX: -0.8, pcbY: 0, side: 'left' },
        { num: 2, name: '2', x: 20, y: 10, pcbX: 0.8, pcbY: 0, side: 'right' }
      ]);
      components.push(rpSda);
      connectPin(net3v3, 'R_SDA_1');
      connectPin(sdaNet, 'R_SDA_2');
    }

    // 6. Optional Button or LED (if requested in prompt)
    if (query.includes('button') || query.includes('switch') || query.includes('key')) {
      const btn: Component = {
        id: 'SW1',
        name: 'Tactile Button',
        type: 'actuator',
        footprint: 'BUTTON_TH',
        value: 'Reset/Input',
        x: 350,
        y: 480,
        pcbX: 40,
        pcbY: 15,
        pcbWidth: 6,
        pcbHeight: 6,
        rotation: 0,
        pins: [],
        description: 'Momentary contact pushbutton.'
      };
      btn.pins = createPins('SW1', [
        { num: 1, name: 'A', x: 0, y: 10, pcbX: -2.5, pcbY: 2.5, side: 'left' },
        { num: 2, name: 'B', x: 40, y: 10, pcbX: 2.5, pcbY: 2.5, side: 'right' },
        { num: 3, name: 'C', x: 0, y: 30, pcbX: -2.5, pcbY: -2.5, side: 'left' }
      ]);
      components.push(btn);
      connectPin(netGnd, 'SW1_A');
      
      const btnNet: Net = { id: 'net_button', name: 'BUTTON', pinIds: ['SW1_B', 'U1_IO19'] };
      nets.push(btnNet);
      
      // Pull up for button
      const rBtn: Component = {
        id: 'R_SW1',
        name: 'Button Pull-up',
        type: 'passive',
        footprint: 'R0805',
        value: '10k',
        x: 430,
        y: 480,
        pcbX: 48,
        pcbY: 15,
        pcbWidth: 2,
        pcbHeight: 1.2,
        rotation: 0,
        pins: [],
        description: 'Input button state stabilizing pull-up resistor.'
      };
      rBtn.pins = createPins('R_SW1', [
        { num: 1, name: '1', x: 0, y: 10, pcbX: -0.8, pcbY: 0, side: 'left' },
        { num: 2, name: '2', x: 20, y: 10, pcbX: 0.8, pcbY: 0, side: 'right' }
      ]);
      components.push(rBtn);
      connectPin(net3v3, 'R_SW1_1');
      connectPin(btnNet, 'R_SW1_2');
    }

    if (query.includes('led') || query.includes('light') || query.includes('indicator')) {
      const led: Component = {
        id: 'D3',
        name: 'Status LED',
        type: 'actuator',
        footprint: 'LED0805',
        value: 'Red',
        x: 480,
        y: 200,
        pcbX: 68,
        pcbY: 20,
        pcbWidth: 2,
        pcbHeight: 1.25,
        rotation: 90,
        pins: [],
        description: 'Light emitting diode indicating board status.'
      };
      led.pins = createPins('D3', [
        { num: 1, name: 'A', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' }, // Anode
        { num: 2, name: 'K', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' } // Cathode
      ]);
      components.push(led);
      connectPin(netGnd, 'D3_K');

      const ledNet: Net = { id: 'net_led', name: 'STATUS_LED', pinIds: ['D3_A', 'U1_IO18'] }; // Connect pin A to ESP32 IO18
      nets.push(ledNet);
    }
  } else if (isArduino) {
    // Arduino-like implementation
    const mcu: Component = {
      id: 'U1',
      name: 'ATmega328P MCU',
      type: 'mcu',
      footprint: 'ESP32_SMD', // Reuse large footprint visual
      value: 'ATmega328P',
      x: 350,
      y: 200,
      pcbX: 50,
      pcbY: 40,
      pcbWidth: 15,
      pcbHeight: 15,
      rotation: 0,
      pins: [],
      description: '8-bit AVR RISC microcontroller.'
    };
    mcu.pins = createPins('U1', [
      { num: 1, name: 'VCC', x: 0, y: 10, pcbX: -7.5, pcbY: 5, side: 'left' },
      { num: 2, name: 'GND', x: 0, y: 20, pcbX: -7.5, pcbY: 2.5, side: 'left' },
      { num: 3, name: 'RESET', x: 0, y: 30, pcbX: -7.5, pcbY: 0, side: 'left' },
      { num: 4, name: 'PD0_RX', x: 0, y: 40, pcbX: -7.5, pcbY: -2.5, side: 'left' },
      { num: 5, name: 'PD1_TX', x: 0, y: 50, pcbX: -7.5, pcbY: -5, side: 'left' },
      { num: 6, name: 'PB0_LED', x: 100, y: 10, pcbX: 7.5, pcbY: 5, side: 'right' },
      { num: 7, name: 'PC4_SDA', x: 100, y: 20, pcbX: 7.5, pcbY: 2.5, side: 'right' },
      { num: 8, name: 'PC5_SCL', x: 100, y: 30, pcbX: 7.5, pcbY: 0, side: 'right' }
    ]);
    components.push(mcu);
    connectPin(netGnd, 'U1_GND');
    connectPin(net3v3, 'U1_VCC'); // Run clone on 3.3v or 5v, let's use 3.3V LDO for safety

    // Power Regulator for 5V -> 3.3V
    const ldo: Component = {
      id: 'U2',
      name: '3.3V LDO Regulator',
      type: 'power',
      footprint: 'SOT23',
      value: 'LM1117-3.3',
      x: 220,
      y: 400,
      pcbX: 25,
      pcbY: 55,
      pcbWidth: 3,
      pcbHeight: 2.8,
      rotation: 0,
      pins: [],
      description: 'LDO stepping down USB 5V to 3.3V.'
    };
    ldo.pins = createPins('U2', [
      { num: 1, name: 'GND', x: 0, y: 10, pcbX: -1, pcbY: -1, side: 'left' },
      { num: 2, name: 'VIN', x: 0, y: 30, pcbX: -1, pcbY: 1, side: 'left' },
      { num: 3, name: 'VOUT', x: 60, y: 20, pcbX: 1, pcbY: 0, side: 'right' }
    ]);
    components.push(ldo);
    connectPin(netGnd, 'U2_GND');
    connectPin(netVbus, 'U2_VIN');
    connectPin(net3v3, 'U2_VOUT');

    // Reset switch
    const btn: Component = {
      id: 'SW1',
      name: 'Reset Button',
      type: 'actuator',
      footprint: 'BUTTON_TH',
      value: 'Reset',
      x: 350,
      y: 80,
      pcbX: 50,
      pcbY: 15,
      pcbWidth: 6,
      pcbHeight: 6,
      rotation: 0,
      pins: [],
      description: 'Reset momentary button.'
    };
    btn.pins = createPins('SW1', [
      { num: 1, name: 'A', x: 0, y: 10, pcbX: -2.5, pcbY: 2.5, side: 'left' },
      { num: 2, name: 'B', x: 40, y: 10, pcbX: 2.5, pcbY: 2.5, side: 'right' }
    ]);
    components.push(btn);
    connectPin(netGnd, 'SW1_A');

    const resetNet: Net = { id: 'net_reset', name: 'MCU_RESET', pinIds: ['SW1_B', 'U1_RESET'] };
    nets.push(resetNet);

    // Reset Pull up
    const rReset: Component = {
      id: 'R_RST',
      name: 'Reset Pull-up',
      type: 'passive',
      footprint: 'R0805',
      value: '10k',
      x: 280,
      y: 80,
      pcbX: 42,
      pcbY: 20,
      pcbWidth: 2,
      pcbHeight: 1.2,
      rotation: 0,
      pins: [],
      description: 'MCU reset line pull-up.'
    };
    rReset.pins = createPins('R_RST', [
      { num: 1, name: '1', x: 0, y: 10, pcbX: -0.8, pcbY: 0, side: 'left' },
      { num: 2, name: '2', x: 20, y: 10, pcbX: 0.8, pcbY: 0, side: 'right' }
    ]);
    components.push(rReset);
    connectPin(net3v3, 'R_RST_1');
    connectPin(resetNet, 'R_RST_2');

    // Status LED
    const led: Component = {
      id: 'D1',
      name: 'Power Indicator',
      type: 'actuator',
      footprint: 'LED0805',
      value: 'Green',
      x: 480,
      y: 150,
      pcbX: 70,
      pcbY: 25,
      pcbWidth: 2,
      pcbHeight: 1.25,
      rotation: 90,
      pins: [],
      description: 'Power-on indication LED.'
    };
    led.pins = createPins('D1', [
      { num: 1, name: 'A', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
      { num: 2, name: 'K', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
    ]);
    components.push(led);
    connectPin(netGnd, 'D1_K');
    connectPin(net3v3, 'D1_A');

    // TX/RX LEDs
    const txLed: Component = {
      id: 'D2',
      name: 'TX Active LED',
      type: 'actuator',
      footprint: 'LED0805',
      value: 'Orange',
      x: 480,
      y: 220,
      pcbX: 70,
      pcbY: 35,
      pcbWidth: 2,
      pcbHeight: 1.25,
      rotation: 90,
      pins: [],
      description: 'Serial TX activity indicator LED.'
    };
    txLed.pins = createPins('D2', [
      { num: 1, name: 'A', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
      { num: 2, name: 'K', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
    ]);
    components.push(txLed);
    connectPin(netGnd, 'D2_K');

    const txNet: Net = { id: 'net_tx', name: 'TX_LINE', pinIds: ['D2_A', 'U1_PD1_TX'] };
    nets.push(txNet);
  } else {
    // Pure Power/LiPo Charger Board
    // Charger IC
    const charger: Component = {
      id: 'U1',
      name: 'TP4056 Battery Charger',
      type: 'power',
      footprint: 'SOT23', // Repurpose footprint style
      value: 'TP4056',
      x: 350,
      y: 200,
      pcbX: 45,
      pcbY: 40,
      pcbWidth: 5,
      pcbHeight: 4,
      rotation: 0,
      pins: [],
      description: '1A Linear Lithium-Ion battery charger with thermal regulation.'
    };
    charger.pins = createPins('U1', [
      { num: 1, name: 'TEMP', x: 0, y: 10, pcbX: -2, pcbY: 1.5, side: 'left' },
      { num: 2, name: 'PROG', x: 0, y: 20, pcbX: -2, pcbY: 0, side: 'left' },
      { num: 3, name: 'GND', x: 0, y: 30, pcbX: -2, pcbY: -1.5, side: 'left' },
      { num: 4, name: 'VCC', x: 100, y: 10, pcbX: 2, pcbY: 1.5, side: 'right' },
      { num: 5, name: 'BAT', x: 100, y: 20, pcbX: 2, pcbY: 0, side: 'right' },
      { num: 6, name: 'STDBY', x: 100, y: 30, pcbX: 2, pcbY: -1.5, side: 'right' },
      { num: 7, name: 'CHRG', x: 100, y: 40, pcbX: 0, pcbY: -1.5, side: 'right' }
    ]);
    components.push(charger);
    connectPin(netGnd, 'U1_GND');
    connectPin(netGnd, 'U1_TEMP'); // Disable temp sensing by grounding
    connectPin(netVbus, 'U1_VCC');

    // Battery connector
    const batt: Component = {
      id: 'J2',
      name: 'LiPo JST-PH Connector',
      type: 'connector',
      footprint: 'BATT_CONN',
      value: 'JST 2-Pin',
      x: 550,
      y: 200,
      pcbX: 80,
      pcbY: 40,
      pcbWidth: 7,
      pcbHeight: 6,
      rotation: 180,
      pins: [],
      description: 'LiPo battery interface terminal.'
    };
    batt.pins = createPins('J2', [
      { num: 1, name: 'BAT+', x: 0, y: 10, pcbX: -1.5, pcbY: 0, side: 'left' },
      { num: 2, name: 'BAT-', x: 0, y: 20, pcbX: 1.5, pcbY: 0, side: 'left' }
    ]);
    components.push(batt);
    connectPin(netGnd, 'J2_BAT-');

    const batNet: Net = { id: 'net_bat', name: 'VBAT', pinIds: ['U1_BAT', 'J2_BAT+'] };
    nets.push(batNet);

    // Charge program resistor (sets charge current)
    const rProg: Component = {
      id: 'R_PROG',
      name: '1.2k Prog Resistor',
      type: 'passive',
      footprint: 'R0805',
      value: '1.2k (1A)',
      x: 280,
      y: 280,
      pcbX: 35,
      pcbY: 30,
      pcbWidth: 2,
      pcbHeight: 1.2,
      rotation: 0,
      pins: [],
      description: 'Sets TP4056 charge current to 1A.'
    };
    rProg.pins = createPins('R_PROG', [
      { num: 1, name: '1', x: 0, y: 10, pcbX: -0.8, pcbY: 0, side: 'left' },
      { num: 2, name: '2', x: 20, y: 10, pcbX: 0.8, pcbY: 0, side: 'right' }
    ]);
    components.push(rProg);
    connectPin(netGnd, 'R_PROG_2');
    
    const progNet: Net = { id: 'net_prog', name: 'CHG_PROG', pinIds: ['U1_PROG', 'R_PROG_1'] };
    nets.push(progNet);

    // Status LEDs
    const chgLed: Component = {
      id: 'D1',
      name: 'Charging Red LED',
      type: 'actuator',
      footprint: 'LED0805',
      value: 'Red',
      x: 480,
      y: 100,
      pcbX: 55,
      pcbY: 20,
      pcbWidth: 2,
      pcbHeight: 1.25,
      rotation: 90,
      pins: [],
      description: 'Charging indicator LED.'
    };
    chgLed.pins = createPins('D1', [
      { num: 1, name: 'A', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
      { num: 2, name: 'K', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
    ]);
    components.push(chgLed);
    connectPin(netVbus, 'D1_A');

    const chgNet: Net = { id: 'net_chg_status', name: 'CHRG_LED', pinIds: ['D1_K', 'U1_CHRG'] };
    nets.push(chgNet);

    const stdbyLed: Component = {
      id: 'D2',
      name: 'Standby Blue LED',
      type: 'actuator',
      footprint: 'LED0805',
      value: 'Blue',
      x: 480,
      y: 300,
      pcbX: 55,
      pcbY: 60,
      pcbWidth: 2,
      pcbHeight: 1.25,
      rotation: 90,
      pins: [],
      description: 'Charge complete indicator LED.'
    };
    stdbyLed.pins = createPins('D2', [
      { num: 1, name: 'A', x: 0, y: 10, pcbX: 0, pcbY: 0.8, side: 'left' },
      { num: 2, name: 'K', x: 20, y: 10, pcbX: 0, pcbY: -0.8, side: 'right' }
    ]);
    components.push(stdbyLed);
    connectPin(netVbus, 'D2_A');

    const stdbyNet: Net = { id: 'net_stdby_status', name: 'STDBY_LED', pinIds: ['D2_K', 'U1_STDBY'] };
    nets.push(stdbyNet);
  }

  // Always append global power/ground nets
  nets.push(netGnd);
  nets.push(netVbus);
  if (isEsp32 || isArduino) {
    nets.push(net3v3);
  }

  return { components, nets };
}
