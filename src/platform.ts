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
} from './settings.js';
import { LomiPlatformAccessory } from './platformAccessory.js';
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
    this.log.debug('LomiPlatform: Initializing platform...');
    this.Service = api.hap.Service;
    this.Characteristic = api.hap.Characteristic;

    this.email = config.email;
    this.password = config.password;
    this.deviceNickname = config.deviceNickname;

    // When Homebridge has finished launching, initialize the platform.
    this.api.on('didFinishLaunching', () => {
      this.log.debug('LomiPlatform: didFinishLaunching event received.');
      this.init().catch((error: unknown) => {
        this.log.error('LomiPlatform: Initialization error:', error);
      });
    });
  }

  /**
   * This method is called when cached accessories are loaded from disk.
   */
  configureAccessory(accessory: PlatformAccessory): void {
    this.log.info('LomiPlatform: Loading accessory from cache: ' + accessory.displayName);
    this.accessories.push(accessory);
  }

  async init(): Promise<void> {
    try {
      this.log.debug('LomiPlatform: Starting initialization...');
      // Log in via Cognito to get the bearer token.
      this.token = await this.login();
      this.log.debug('LomiPlatform: Token received.');
      // Fetch all devices registered to this account.
      const devices = await this.fetchDevices();
      this.log.debug(`LomiPlatform: Retrieved ${devices.length} device(s) from API.`);
      // Select the device matching the configured nickname.
      const selectedDevice = devices.find(
        (entry) => entry.userDevice.nickname === this.deviceNickname,
      );
      if (!selectedDevice) {
        this.log.warn(`LomiPlatform: No device found with nickname: ${this.deviceNickname}`);
        return;
      }
      this.log.debug(`LomiPlatform: Device "${selectedDevice.userDevice.nickname}" selected.`);
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
      this.log.info(`LomiPlatform: Registered accessory for device "${selectedDevice.userDevice.nickname}".`);
    } catch (error: unknown) {
      this.log.error('LomiPlatform: Error during initialization:', error);
    }
  }

  async login(): Promise<string> {
    this.log.debug('LomiPlatform: Logging in to Cognito...');
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

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      });
      const data: CognitoAuthResponse = await response.json();

      if (!response.ok || !data.AuthenticationResult) {
        const errorInfo = data.Message || response.statusText;
        this.log.error(`LomiPlatform: Cognito login failed with status ${response.status}: ${errorInfo}`);
        throw new Error(
          `Authentication failed: ${data.__type || response.statusText} ${data.Message ? '- ' + data.Message : ''}`,
        );
      }
      this.log.debug('LomiPlatform: Cognito login successful.');
      // Use the IdToken for subsequent API calls instead of the AccessToken.
      return data.AuthenticationResult.IdToken;
    } catch (error: unknown) {
      this.log.error('LomiPlatform: Exception during Cognito login:', error);
      throw error;
    }
  }

  async fetchDevices(): Promise<DeviceEntry[]> {
    if (!this.token) {
      throw new Error('LomiPlatform: No token available. Cannot fetch devices.');
    }
    try {
      this.log.debug('LomiPlatform: Fetching devices from API...');
      const response = await fetch(USER_DEVICES_ENDPOINT, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!response.ok) {
        const errorText = await response.text();
        this.log.error(`LomiPlatform: Failed to fetch devices. Status ${response.status}: ${errorText}`);
        throw new Error(`Failed to fetch devices: ${response.status}`);
      }
      const data: UserDevicesResponse = await response.json();
      this.log.debug('LomiPlatform: Devices fetched successfully.');
      return data.result;
    } catch (error: unknown) {
      this.log.error('LomiPlatform: Exception during fetchDevices:', error);
      throw error;
    }
  }

  async refreshDeviceStatus(deviceId: string): Promise<DeviceEntry | undefined> {
    try {
      this.log.debug(`LomiPlatform: Refreshing status for device ${deviceId}...`);
      const devices = await this.fetchDevices();
      const entry = devices.find((entry) => entry.userDevice.deviceId === deviceId);
      if (!entry) {
        this.log.warn(`LomiPlatform: Device with ID ${deviceId} not found during refresh.`);
      }
      return entry;
    } catch (error: unknown) {
      this.log.error(`LomiPlatform: Error refreshing device status for ${deviceId}:`, error);
      return undefined;
    }
  }
}
