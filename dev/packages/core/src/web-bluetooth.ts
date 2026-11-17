import {BLE_SERVICE, BLE_REQUEST, BLE_RESPONSE, parseBluetoothSnapshot, validateBenchText, type BluetoothSnapshot} from '@aumanet/protocol';

// A small structural boundary also permits deterministic transport tests without a radio.
export interface BleCharacteristic extends EventTarget {
  value?: DataView;
  startNotifications(): Promise<unknown>;
  writeValueWithResponse(value: Uint8Array): Promise<unknown>;
}
export interface BleDevice extends EventTarget {
  name?: string;
  gatt?: {connected: boolean; connect(): Promise<{getPrimaryService(uuid: string): Promise<{getCharacteristic(uuid: string): Promise<BleCharacteristic>}>}>; disconnect(): void};
}
export interface WebBluetooth {
  getAvailability(): Promise<boolean>;
  requestDevice(options: {filters: {services: string[]}[]}): Promise<BleDevice>;
}
export type BluetoothState = 'disconnected' | 'connecting' | 'connected';
export class WebBluetoothAdapter {
  private device: BleDevice | undefined;
  private requestCharacteristic: BleCharacteristic | undefined;
  private responseCharacteristic: BleCharacteristic | undefined;
  private decoder = new TextDecoder('utf-8', {fatal:true});
  private buffer = '';
  private pending: {id: string; resolve(value: BluetoothSnapshot): void; reject(reason: Error): void; timer: ReturnType<typeof setTimeout>} | undefined;
  private node: string | undefined;
  private epoch = 0;
  private connecting = false;
  state: BluetoothState = 'disconnected';
  constructor(private bluetooth: WebBluetooth, private onState: (state: BluetoothState) => void = ()=>{}) {}
  private setState(state: BluetoothState) { this.state=state; this.onState(state); }
  private onDisconnect = () => { this.cleanup(new Error('Bluetooth disconnected. Reconnect the node; delivery may be unconfirmed.')); };
  private cleanup(error: Error) {
    this.epoch++;
    this.responseCharacteristic?.removeEventListener('characteristicvaluechanged',this.onNotification);
    this.device?.removeEventListener('gattserverdisconnected',this.onDisconnect);
    this.device?.gatt?.disconnect();
    this.requestCharacteristic=undefined; this.responseCharacteristic=undefined; this.node=undefined;
    this.buffer=''; this.decoder=new TextDecoder('utf-8',{fatal:true});
    if (this.pending) { clearTimeout(this.pending.timer); this.pending.reject(error); this.pending=undefined; }
    this.setState('disconnected');
  }
  disconnect() { this.cleanup(new Error('Bluetooth disconnected')); }
  async connect(reconnect=false): Promise<BluetoothSnapshot> {
    if (this.connecting) throw new Error('A connection is already in progress');
    this.disconnect(); this.setState('connecting');
    this.connecting=true;
    const epoch=this.epoch;
    const check=()=>{if(epoch!==this.epoch) throw new Error('Connection cancelled');};
    try {
      // requestDevice must run directly from the click, before any awaited availability check.
      if (!reconnect || !this.device) {
        const selected=await this.bluetooth.requestDevice({filters:[{services:[BLE_SERVICE]}]});
        check(); this.device=selected;
      }
      this.device.addEventListener('gattserverdisconnected',this.onDisconnect);
      const server=await this.device.gatt?.connect();
      if(epoch!==this.epoch) {this.device.gatt?.disconnect();check();}
      if (!server) throw new Error('This device has no Bluetooth GATT server');
      const service=await server.getPrimaryService(BLE_SERVICE);
      check();
      const request=await service.getCharacteristic(BLE_REQUEST); check(); this.requestCharacteristic=request;
      const response=await service.getCharacteristic(BLE_RESPONSE); check(); this.responseCharacteristic=response;
      this.responseCharacteristic.addEventListener('characteristicvaluechanged',this.onNotification);
      await this.responseCharacteristic.startNotifications();
      check();
      this.setState('connected');
      return await this.snapshot();
    } catch (error) { if(epoch===this.epoch) this.cleanup(error instanceof Error?error:new Error(String(error))); throw error; }
    finally {this.connecting=false;}
  }
  private onNotification = (event: Event) => {
    try {
      const value=(event.target as BleCharacteristic).value;
      if (!value) return;
      this.buffer+=this.decoder.decode(value,{stream:true});
      if (this.buffer.length>16384) throw new Error('Bluetooth response exceeded its limit');
      let end: number;
      while ((end=this.buffer.indexOf('\n'))>=0) {
        const line=this.buffer.slice(0,end); this.buffer=this.buffer.slice(end+1);
        const response=JSON.parse(line);
        if (!this.pending || response.requestId!==this.pending.id) continue;
        const pending=this.pending; this.pending=undefined; clearTimeout(pending.timer);
        try {
          if (response.ok!==true) throw new Error(typeof response.error==='string'?response.error:'Node rejected request');
          const snapshot=parseBluetoothSnapshot(response.snapshot);
          if (this.node && snapshot.node!==this.node) throw new Error('Connected node identity changed');
          this.node=snapshot.node; pending.resolve(snapshot);
        } catch (error) {
          const failure=error instanceof Error?error:new Error(String(error));
          pending.reject(failure); this.cleanup(failure);
        }
      }
    } catch (error) { this.cleanup(error instanceof Error?error:new Error(String(error))); }
  };
  private async rpc(op: string, fields: Record<string,string> = {}): Promise<BluetoothSnapshot> {
    if (this.state!=='connected' || !this.requestCharacteristic) throw new Error('Connect a Bluetooth node first');
    if (this.pending) throw new Error('Wait for the current node operation');
    const requestId=crypto.randomUUID().replaceAll('-','').slice(0,16);
    const bytes=new TextEncoder().encode(JSON.stringify({requestId,op,...fields})+'\n');
    const characteristic=this.requestCharacteristic;
    const epoch=this.epoch;
    return new Promise((resolve,reject)=>{
      this.pending={id:requestId,resolve,reject,timer:setTimeout(()=>this.cleanup(new Error('Node response timed out. Reconnect and check history before resending.')),45000)};
      void (async()=>{
        try {
          for (let offset=0;offset<bytes.length;offset+=20) {
            if (epoch!==this.epoch) return;
            await characteristic.writeValueWithResponse(bytes.slice(offset,offset+20));
          }
        } catch (error) { if(epoch===this.epoch) this.cleanup(error instanceof Error?error:new Error(String(error))); }
      })();
    });
  }
  snapshot() { return this.rpc('snapshot'); }
  startRadio() { return this.rpc('radio-start'); }
  send(id: string, text: string) {
    validateBenchText(text);
    if (!/^[a-f0-9]{16}$/.test(id)) throw new Error('Invalid message ID');
    return this.rpc('send',{id,text});
  }
}
export type {BluetoothSnapshot};
