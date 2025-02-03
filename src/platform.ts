import {
  API,
  DynamicPlatformPlugin,
  Logger,
  PlatformAccessory,
  Service,
  Characteristic,
} from 'homebridge';
import {
  PLATFORM_NAME,
  PLUGIN_NAME,
  COGNITO_REGION,
  COGNITO_CLIENT_ID,
  USER_DEVICES_ENDPOINT,
  LomiPlatformConfig,
} from './settings';
import { LomiPlatformAccessory } from './platformAccessory';
import fetch from 'node-fetch';

interface CognitoAuthResponse {
  AuthenticationResult?: {
    AccessToken: string;
    IdToken: string;
    RefreshToken: string;
    ExpiresIn: number;
    TokenType: string;
  };
  ChallengeName?: string;
  ChallengeParameters?: Record<string, unknown>;
  CodeDeliveryDetails?: Record<string, unknown>;
  Message?: string;
  __type?: string;
}

export interface UserDevice {
  _id: string;
  userId: string;
  deviceId: string;
  nickname: string;
  deviceType: string;
  lastFilterResetDate: string | null;
  lastFilterCounter: number;
  filterCounterModifiedAt: string;
  createdAt: string;
  lastModified: string;
  removed: boolean;
  version: number;
  cycleTimeRemaining?: number;
}

export interface Device {
  _id: string;
  createdAt: string;
  deviceType: string;
  deviceVersion: string;
  lastModified: string;
  manufactureDate: string;
  refurbished: boolean;
  thingName: string;
  version: number;
  enrollment: unknown;
}

export interface DeviceEntry {
  userDevice: UserDevice;
  device: Device;
}

export interface UserDevicesResponse {
  result: DeviceEntry[];
}

export class LomiPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service;
  public readonly Characteristic: typeof Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  private token: string | null = null;
  private email: string;
  private password: string;
  private deviceNickname: string;

  constructor(
    public readonly log: Logger,
    public readonly config: LomiPlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('LomiPlatform Init');
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.email = config.email;
    this.password = config.password;
    this.deviceNickname = config.deviceNickname;

    // When Homebridge has finished launching, initialize the platform.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('DidFinishLaunching');
      this.init();
    });
  }

  /**
   * This method is called when cached accessories are loaded from disk.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('Loading accessory from cache: ' + accessory.displayName);
    this.accessories.push(accessory);
  }

  async init(): Promise<void> {
    try {
      // Log in via Cognito to get the bearer token.
      this.token = await this.login();
      // Fetch all devices registered to this account.
      const devices = await this.fetchDevices();
      // Select the device matching the configured nickname.
      const selectedDevice = devices.find(
        (entry) => entry.userDevice.nickname === this.deviceNickname,
      );
      if (!selectedDevice) {
        this.log.warn(`No device found with nickname: ${this.deviceNickname}`);
        return;
      }
      // Create a unique identifier for the accessory based on the deviceId.
      const uuid = this.api.hap.uuid.generate(selectedDevice.userDevice.deviceId);
      const accessory = new this.api.platformAccessory(
        selectedDevice.userDevice.nickname,
        uuid,
      );
      // Create the platform accessory instance.
      new LomiPlatformAccessory(this, accessory, selectedDevice, this.token);
      // Register the accessory with Homebridge.
      this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    } catch (error: unknown) {
      this.log.error('Error initializing Lomi platform:', error);
    }
  }

  async login(): Promise<string> {
    this.log.debug('Logging in to Cognito...');
    const endpoint = `https://cognito-idp.${COGNITO_REGION}.amazonaws.com/`;
    const headers = {
      'Content-Type': 'application/x-amz-json-1.1',
      'X-Amz-Target': 'AWSCognitoIdentityProviderService.InitiateAuth',
    };
    const body = {
      AuthFlow: 'USER_PASSWORD_AUTH',
      ClientId: COGNITO_CLIENT_ID,
      AuthParameters: {
        USERNAME: this.email,
        PASSWORD: this.password,
      },
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    const data: CognitoAuthResponse = await response.json();

    if (!response.ok || !data.AuthenticationResult) {
      throw new Error(
        `Authentication failed: ${data.__type || response.statusText} ${
          data.Message ? '- ' + data.Message : ''
        }`,
      );
    }

    this.log.debug('Cognito login successful.');
    return data.AuthenticationResult.AccessToken;
  }

  async fetchDevices(): Promise<DeviceEntry[]> {
    if (!this.token) {
      throw new Error('No token available');
    }
    const response = await fetch(USER_DEVICES_ENDPOINT, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${this.token}`,
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch devices: ${response.status}`);
    }
    const data: UserDevicesResponse = await response.json();
    return data.result;
  }

  async refreshDeviceStatus(deviceId: string): Promise<DeviceEntry | undefined> {
    const devices = await this.fetchDevices();
    return devices.find((entry) => entry.userDevice.deviceId === deviceId);
  }
}
