import { Service, PlatformAccessory } from 'homebridge';
import { LomiPlatform, DeviceEntry } from './platform.js';

export class LomiPlatformAccessory {
  private service: Service;
  private deviceEntry: DeviceEntry;
  private token: string;
  private updateInterval: NodeJS.Timeout;

  constructor(
    private readonly platform: LomiPlatform,
    private readonly accessory: PlatformAccessory,
    deviceEntry: DeviceEntry,
    token: string,
  ) {
    this.deviceEntry = deviceEntry;
    this.token = token;

    this.platform.log.debug(`LomiPlatformAccessory: Initializing accessory for device "${deviceEntry.userDevice.nickname}"`);

    // Set up the accessory information service.
    const infoService = this.accessory.getService(platform.Service.AccessoryInformation) ||
      this.accessory.addService(platform.Service.AccessoryInformation);
    infoService
      .setCharacteristic(platform.Characteristic.Manufacturer, 'Lomi')
      .setCharacteristic(platform.Characteristic.Model, deviceEntry.device.deviceType)
      .setCharacteristic(platform.Characteristic.SerialNumber, deviceEntry.userDevice.deviceId);

    // Set up (or add) a TemperatureSensor service to display the cycle time remaining.
    this.service = this.accessory.getService(platform.Service.TemperatureSensor) ||
      this.accessory.addService(platform.Service.TemperatureSensor);
    this.service.setCharacteristic(platform.Characteristic.CurrentTemperature, 0);

    // Perform an initial status update.
    this.updateStatus().catch((error: unknown) => {
      this.platform.log.error('LomiPlatformAccessory: Initial updateStatus error:', error);
    });

    // Schedule periodic status updates (every minute).
    this.updateInterval = setInterval(() => {
      this.updateStatus().catch((error: unknown) => {
        this.platform.log.error('LomiPlatformAccessory: Scheduled updateStatus error:', error);
      });
    }, 60 * 1000);
  }

  async updateStatus(): Promise<void> {
    this.platform.log.debug(`LomiPlatformAccessory: Updating status for device "${this.deviceEntry.userDevice.nickname}"`);
    try {
      // Retrieve the updated status for this device.
      const updatedEntry = await this.platform.refreshDeviceStatus(
        this.deviceEntry.userDevice.deviceId,
      );
      if (!updatedEntry) {
        this.platform.log.warn(`LomiPlatformAccessory: Device "${this.deviceEntry.userDevice.nickname}" not found during status update.`);
        return;
      }
      this.deviceEntry = updatedEntry;

      // Update the accessory display name if it has changed.
      const nickname = updatedEntry.userDevice.nickname;
      if (this.accessory.displayName !== nickname) {
        this.platform.log.debug(`LomiPlatformAccessory: Updating display name from "${this.accessory.displayName}" to "${nickname}"`);
        this.accessory.displayName = nickname;
      }

      // Update the cycle time remaining if available.
      if (updatedEntry.userDevice.cycleTimeRemaining !== undefined) {
        const minutesRemaining = Math.round(updatedEntry.userDevice.cycleTimeRemaining / 60);
        this.platform.log.debug(`LomiPlatformAccessory: Cycle time remaining for "${nickname}": ${minutesRemaining} minute(s)`);
        this.service.setCharacteristic(this.platform.Characteristic.CurrentTemperature, minutesRemaining);
      } else {
        this.platform.log.debug(`LomiPlatformAccessory: No cycle time remaining info available for "${nickname}". Setting to 0.`);
        this.service.setCharacteristic(this.platform.Characteristic.CurrentTemperature, 0);
      }
    } catch (error: unknown) {
      this.platform.log.error(`LomiPlatformAccessory: Error updating status for device "${this.deviceEntry.userDevice.nickname}":`, error);
    }
  }
}
