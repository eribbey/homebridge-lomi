import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings.js';
import { LomiPlatform } from './platform.js';

export default (homebridge: API): void => {
  homebridge.registerPlatform(PLATFORM_NAME, LomiPlatform);
};
