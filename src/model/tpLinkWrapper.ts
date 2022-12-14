import { Client } from 'tplink-smarthome-api';
import { device, ExternalDeviceCache, ExternalDeviceLookup } from '../interfaces';
import { DeviceCacheService } from '../service/deviceCacheService';

interface PreferredState {
  index: number;
  brightness: number;
}

// TODO: try to integrate this with existing type
interface KasaDevice {
  host: string; // IP address
  port: number;
  _sysInfo: {
    sw_ver: string;
    hw_ver: string;
    model: string;
    deviceId: string;
    oemId: string;
    hwId: string;
    rssi: number;
    latitude_i: number;
    longitude_i: number;
    alias: string;
    status: string;
    mic_type: string;
    feature: string;
    mac: string;
    updating: number;
    led_off: number;
    relay_state: number;
    brightness?: number;
    on_time: number;
    icon_hash: string;
    dev_name: string;
    active_mode: string;
    next_action: { type: number };
    preferred_state: PreferredState[];
    err_code: number;
  };
}

export class KasaWrapper {
  vendor: string;
  api: Client;
  devices: { [key: string]: device };
  cacheDevice: ExternalDeviceCache;
  lookupDevice: ExternalDeviceLookup;

  constructor(deviceCache: DeviceCacheService) {
    // This is needed because this library throws uncatchable errors if an unexpected device type exists
    // Probably cameras cause this issue?
    process.on('uncaughtException', (err) => {
      if (
        err.message &&
        err.message === 'Could not determine device from sysinfo'
      )
        return; //ignore invalid device crash
      console.log('UNHANDLED EXCEPION');
      console.log(err);
      process.exit(1);
    });

    this.vendor = 'kasa';
    this.api = new Client();
    this.devices = {};
    this.cacheDevice = (d) => deviceCache.updateDevice(d);
    this.lookupDevice = (d) => deviceCache.getDeviceById(d);

    this.api.startDiscovery().on('plug-online', (device) => {
      this.handleDeviceEvent(device);
    });
  }

  #formatDeviceResponse(
    device: KasaDevice['_sysInfo'],
    ip: string,
    port: number,
  ): device {
    const { alias, deviceId, dev_name, relay_state, brightness, on_time } =
      device;

    return {
      ip,
      port,
      name: alias,
      id: deviceId,
      type: dev_name,
      status: relay_state === 1 ? 'on' : 'off',
      onACPower: true,
      hasBrightness: brightness ? true : false,
      brightness: brightness ? brightness : undefined,
      hasVolume: false, // TODO: does Kasa support this?
      vendor: this.vendor,
      onTime: on_time,
      lastUpdated: Date.now(),
    };
  }

  #updateDeviceState(device: device) {
    console.log(`updating device: ${device.name}`); // TODO: use logger
    this.devices[device.id] = device;
    console.log(`tracking ${Object.keys(this.devices).length} devices`);
    this.cacheDevice(device);
  }

  async handleDeviceEvent(device: KasaDevice) {
    this.#updateDeviceState(
      this.#formatDeviceResponse(device._sysInfo, device.host, device.port),
    );
  }

  // TODO: be more specific about what actions can be
  async performDeviceAction(device: device, action: string) {
    console.log(`requested action ${action} for`);
    console.log(device);
    const { status, ip } = await this.lookupDevice(device.id);

    switch (action) {
      case 'turnOn':
        if (status !== 'on') {
          this.api.getDevice({ host: ip }).then((d) => {
            console.log(`${device.name} | ${device.id} turn on`);
            d.setPowerState(true);
          });
        } else {
          console.log(`${device.name} | ${device.id} turn on request noOp`);
        }
        break;
      case 'turnOff':
        if (status !== 'off') {
          this.api.getDevice({ host: ip }).then((d) => {
            console.log(`${device.name} | ${device.id} turn off`);
            d.setPowerState(false);
          });
        } else {
          console.log(`${device.name} | ${device.id} turn off request noOp`);
        }
        break;
      case 'setBrightness':
        console.log(`Request to set brightness for ${device.name} not yet implemented`);
        break;
    }
    // switch statement of  actions
    // client.getDevice({host: host}).then((device) => action)
  }
}
