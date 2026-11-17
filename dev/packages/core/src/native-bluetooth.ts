import type {BleCharacteristic, BleDevice, WebBluetooth} from './web-bluetooth.js';

/** Structural subset of the Capacitor BLE client. No platform dependency in portable core. */
export interface NativeBleClient {
  initialize(options: {androidNeverForLocation: boolean}): Promise<void>;
  isEnabled(): Promise<boolean>;
  requestEnable(): Promise<void>;
  requestDevice(options: {services: string[]}): Promise<{deviceId: string; name?: string}>;
  connect(id: string, onDisconnect: (id: string) => void): Promise<void>;
  disconnect(id: string): Promise<void>;
  startNotifications(id: string, service: string, characteristic: string, callback: (value: DataView) => void): Promise<void>;
  write(id: string, service: string, characteristic: string, value: DataView): Promise<void>;
}

/** Reuses the exact framing/validation/retry rules of the browser adapter on Android. */
export class NativeBluetooth implements WebBluetooth {
  private initialized = false;
  constructor(private client: NativeBleClient) {}
  // Do not initialize here: initialize requests runtime permissions and belongs to a user gesture.
  async getAvailability() {
    if (!this.initialized) throw new Error('Bluetooth availability is checked when you connect.');
    return this.client.isEnabled();
  }
  async requestDevice(options: {filters: {services: string[]}[]}): Promise<BleDevice> {
    try { await this.client.initialize({androidNeverForLocation: true}); }
    catch (error) {
      if (error instanceof Error && /permission/i.test(error.message))
        throw new Error('Bluetooth permission denied. Allow Nearby devices in Android app permissions, then connect again.');
      throw error;
    }
    this.initialized = true;
    if (!await this.client.isEnabled()) await this.client.requestEnable();
    if (!await this.client.isEnabled()) throw new Error('Turn on Bluetooth, then connect again.');
    const selected = await this.client.requestDevice({services: options.filters.flatMap(filter => filter.services)});
    return new NativeDevice(this.client, selected.deviceId, selected.name);
  }
}

class NativeDevice extends EventTarget implements BleDevice {
  readonly name: string;
  private generation = 0;
  // Serializes physical teardown before reconnecting the same native GATT handle.
  private closing: Promise<void> = Promise.resolve();
  constructor(private client: NativeBleClient, private id: string, name?: string) {
    super(); this.name = name ?? 'AuMaNET node';
  }
  gatt = {
    connected: false,
    disconnect: () => {
      this.generation++;
      const connected = this.gatt.connected;
      this.gatt.connected = false;
      if (connected) this.closing = this.client.disconnect(this.id).catch(() => {});
    },
    connect: async () => {
      const generation = ++this.generation;
      await this.closing;
      await this.client.connect(this.id, () => {
        if (generation !== this.generation) return;
        this.gatt.connected = false;
        this.dispatchEvent(new Event('gattserverdisconnected'));
      });
      if (generation !== this.generation) {
        await this.client.disconnect(this.id).catch(() => {});
        throw new Error('Connection cancelled');
      }
      this.gatt.connected = true;
      return {getPrimaryService: async (service: string) => ({
        getCharacteristic: async (uuid: string): Promise<BleCharacteristic> => {
          const characteristic: BleCharacteristic = Object.assign(new EventTarget(), {
            startNotifications: async () => this.client.startNotifications(this.id, service, uuid, value => {
              if (generation !== this.generation || !this.gatt.connected) return;
              characteristic.value = value;
              characteristic.dispatchEvent(new Event('characteristicvaluechanged'));
            }),
            writeValueWithResponse: async (bytes: Uint8Array) => {
              if (generation !== this.generation || !this.gatt.connected) throw new Error('Bluetooth disconnected');
              await this.client.write(this.id, service, uuid, new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength));
            }
          });
          return characteristic;
        }
      })};
    }
  };
}
