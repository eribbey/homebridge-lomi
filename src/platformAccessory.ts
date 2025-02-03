import { Service, PlatformAccessory } from 'homebridge';
import { LomiPlatform } from './platform';
import { DeviceEntry } from './platform';

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

    // Set up the accessory information service.
    this.accessory.getService(platform.Service.AccessoryInformation)!
      .setCharacteristic(platform.Characteristic.Manufacturer, 'Lomi')
      .setCharacteristic(
        platform.Characteristic.Model,
        deviceEntry.device.deviceType,
      )
      .setCharacteristic(
        platform.Characteristic.SerialNumber,
        deviceEntry.userDevice.deviceId,
      );

    // Set up (or add) a TemperatureSensor service to display the cycle time remaining.
    this.service =
      this.accessory.getService(platform.Service.TemperatureSensor) ||
      this.accessory.addService(platform.Service.TemperatureSensor);
    this.service.setCharacteristic(platform.Characteristic.CurrentTemperature, 0);

    // Perform an initial status update.
    this.updateStatus();

    // Schedule periodic status updates (every minute).
    this.updateInterval = setInterval(() => {
      this.updateStatus();
    }, 60 * 1000);
  }

  async updateStatus(): Promise<void> {
    try {
      // Retrieve the updated status for this device.
      const updatedEntry = await this.platform.refreshDeviceStatus(
        this.deviceEntry.userDevice.deviceId,
      );
      if (!updatedEntry) {
        this.platform.log.warn('Device not found during status update.');
        return;
      }
      this.deviceEntry = updatedEntry;

      // Update the accessory display name if it has changed.
      const nickname = updatedEntry.userDevice.nickname;
      if (this.accessory.displayName !== nickname) {
        this.accessory.displayName = nickname;
      }

      // Update the cycle time remaining if available.
      // (Assumes the API returns cycleTimeRemaining in seconds.)
      if (updatedEntry.userDevice.cycleTimeRemaining !== undefined) {
        const minutesRemaining = Math.round(
          updatedEntry.userDevice.cycleTimeRemaining / 60,
        );
        this.platform.log.debug(
          `Cycle time remaining for ${nickname}: ${minutesRemaining} minutes`,
        );
        this.service.setCharacteristic(
          this.platform.Characteristic.CurrentTemperature,
          minutesRemaining,
        );
      } else {
        this.platform.log.debug(
          `No cycle time remaining info available for ${nickname}`,
        );
        this.service.setCharacteristic(
          this.platform.Characteristic.CurrentTemperature,
          0,
        );
      }
    } catch (error: unknown) {
      this.platform.log.error(
        'Error updating Lomi accessory status:',
        error,
      );
    }
  }
}
