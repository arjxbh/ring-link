import { Client } from 'tplink-smarthome-api';
import { device } from '../interfaces';

interface PreferredState {
    index: number;
    brightness: number;
}

// TODO: try to integrate this with existing type
interface KasaDevice {
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
        next_action: { type: number; };
        preferred_state: PreferredState[];
        err_code: number;
    }
}

export class KasaWrapper {
    vendor: string;
    api: Client;
    devices: { [key: string]: device };

    constructor () {

        // This is needed because this library throws uncatchable errors if an unexpected device type exists
        // Probably cameras cause this issue?
        process.on('uncaughtException', err => {
            if (err.message && err.message === 'Could not determine device from sysinfo') return; //ignore invalid device crash
            console.log('UNHANDLED EXCEPION');
            console.log(err);
            process.exit(1);
        });

        this.vendor='kasa';
        this.api = new Client();
        this.devices = {};

        this.api.startDiscovery()
        .on('plug-online', device => {
            this.handleDeviceEvent(device);
        })        
    }

    #formatDeviceResponse(device: KasaDevice["_sysInfo"]): device {
        const { alias, deviceId, dev_name, relay_state, brightness, on_time } = device;

        return {
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
        }
    }

    #updateDeviceState(device: device) {
        console.log(`updating device: ${device.name}`) // TODO: use logger
        this.devices[device.id] = device;
        console.log(`tracking ${Object.keys(this.devices).length} devices`);
    }

    async handleDeviceEvent(device: KasaDevice) {
        this.#updateDeviceState(this.#formatDeviceResponse(device._sysInfo));
    }
}