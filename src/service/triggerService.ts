const FSDB = require('file-system-db');
const zeropad = require('zeropad');
import { DeviceCacheService } from '../service/deviceCacheService';

// TODO: move to interfaces file when ready
interface Trigger {
  affectedDeviceId: string; // device related to this trigger
  triggerType: string; // device | absoluteTime | relativeTime | minTemp | maxTemp
  triggerValue: string | number; // number or device id related to trigger type
  triggerOffset?: number; // used for relative time
  action: string; // action to be performed
  actionValue: string | number; // value associated with action
  chainDeviceId?: string; // next trigger to perform when this is complete
  notify: string[];
}

interface FSDbEntry {
  ID: string;
  data: Trigger;
}

const dbName = 'triggerDb';

/*
 * I originally wanted to use mongodb, a tried and true system for this
 * Unforunately, I plan to run this on a raspberry pi clone, and all older hardware of
 * this type runs on ARMv7l CPUs, which are 32 bit.  Mongo does NOT support this.
 * Because the expected size and complexity of this database is very minimal, using
 * a much simpler json based data store will have to be sufficient.
 *
 * This is certainly NOT scalable, but for a system where you would expect
 * maybe a max of 100 triggers, it's okay.
 */
export class TriggerService {
  db: typeof FSDB;
  dayStart: number;
  dayEnd: number;
  deviceCache: DeviceCacheService;
  wrappers: any[];
  vendorMap: any; // TODO: interface

  // TODO: fix ts for wrappers.  Wrappers should extend a base class,
  // and TS should be an array of instances of the wrapper base class?
  constructor(deviceCache: DeviceCacheService, wrappers: any[]) {
    this.dayStart = 0;
    this.dayEnd = 0;
    this.#setDayLimits();
    this.#connect();
    this.deviceCache = deviceCache;
    this.wrappers = wrappers;
  }

  // note: setHours(...) uses the current timezone
  #setDayLimits = () => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    this.dayStart = Math.floor(start.getTime() / 1000);

    const end = new Date();
    end.setHours(24, 0, 0, 0);
    this.dayEnd = Math.floor(end.getTime() / 1000);
  };

  #connect = async () => {
    this.db = new FSDB(`./${dbName}.json`);
  };

  // note: don't use . in naming, it breaks FSDB
  #createTriggerId = (triggerType: Trigger['triggerType']) => {
    const numEntries = this.db.all().length;
    return `${triggerType}:${zeropad(numEntries + 1, 4)}`;
  };

  createTrigger = async (trigger: Trigger) => {
    // TODO: add some logic to prevent duplicate triggers
    const id = this.#createTriggerId(trigger.triggerType);
    this.db.set(id, trigger);
  };

  getTriggersByTime() {}

  // This only applies to time related and any triggers that can ONLY trigger once a day
  // ????
  // #filterTriggered = (triggers: Trigger[]) => {
  //   this.#setDayLimits;
  //   return triggers.filter((t: Trigger) => {
  //     if (t.lastTriggered > this.dayStart) return false;
  //     return true;
  //   });
  // };

  #handleHitActions = (hits: Trigger[]) => {
    hits.forEach(async (hit: Trigger) => {
      const device = await this.deviceCache.getDeviceById(hit.affectedDeviceId);
      console.log(`Performing trigger for device:`);
      console.log(device);
      const wrapper = this.wrappers.find(
        (wrapper: any) => wrapper.vendor === device.vendor,
      );
      console.log(`device belongs to ${wrapper.vendor}`);
      wrapper.performDeviceAction(device, hit.action);
    });
  };

  triggerByTemperature = (temperature: number) => {
    const triggers = this.db.all();

    const hits = triggers
      .filter((entry: FSDbEntry) => {
        const { triggerType, triggerValue } = entry.data;

        switch (triggerType) {
          case 'minTemp':
            return temperature <= triggerValue;
          case 'maxTemp':
            return temperature >= triggerValue;
          default:
            return false;
        }
      })
      .map((entry: FSDbEntry) => {
        return {
          ...entry.data,
        };
      });

    this.#handleHitActions(hits);
  };

  getTriggersBySourceDevice() {}
}
