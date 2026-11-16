import {ESPLoader,Transport} from 'esptool-js';
export async function openNode(port){
  const transport=new Transport(port,false);
  // Suppress library terminal output: flash backups can include private material.
  const terminal={clean(){},writeLine(){},write(){}};
  const esp=new ESPLoader({transport,baudrate:460800,romBaudrate:460800,terminal,debugLogging:false,enableTracing:false});
  try{
    await esp.main();
    if(esp.chip?.CHIP_NAME!=='ESP32-S3')throw Error('Use the supported ESP32-S3 board.');
    const security=await esp.getSecurityInfo();
    if(security.parsedFlags.SECURE_BOOT_EN||security.parsedFlags.SECURE_DOWNLOAD_ENABLE||security.flashCryptCnt!==0)throw Error('This board uses a protected flash configuration. Use its supported recovery procedure.');
    if(await esp.detectFlashSize()!=='8MB')throw Error('This installer requires the supported 8 MiB board.');
    const readMac=async()=>String(await esp.chip.readMac(esp)).replaceAll(':','').toLowerCase();
    const mac=await readMac();if(!/^[0-9a-f]{12}$/.test(mac))throw Error('Unable to identify this board.');
    return {mac,readMac,async readFlash(...args){try{return await esp.readFlash(...args);}catch{throw Error('USB flash read failed. Keep the backup and reconnect before trying again.');}},async writeFlash(options){try{await esp.writeFlash(options);}catch{throw Error('USB flash write outcome is unknown. Keep the backup and use USB recovery; no automatic retry will run.');}},close:()=>transport.disconnect()};
  }catch(error){await transport.disconnect().catch(()=>{});throw error;}
}
