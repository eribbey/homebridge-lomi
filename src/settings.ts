import { PlatformConfig } from 'homebridge';

export const PLUGIN_NAME = 'homebridge-lomi';
export const PLATFORM_NAME = 'LomiPlatform';
export const COGNITO_REGION = 'us-east-1';
export const COGNITO_CLIENT_ID = '5hss880dr2s87m2gbrd50ft7th';
export const USER_DEVICES_ENDPOINT = 'https://api.lomi-app.net/userDevices';

export interface LomiPlatformConfig extends PlatformConfig {
  /** The user’s email (for Cognito authentication) */
  email: string;
  /** The user’s password (for Cognito authentication) */
  password: string;
  /**
   * The nickname of the Lomi device to display in Homebridge.
   * (This must match the “nickname” value in the device status JSON.)
   */
  deviceNickname: string;
  /** Optional name override for the accessory */
  name?: string;
}
