import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { LomiPlatform } from './platform';

export default (homebridge: API): void => {
  homebridge.registerPlatform(PLATFORM_NAME, LomiPlatform);
};
