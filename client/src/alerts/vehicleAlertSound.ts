import { VEHICLE_ALERT_VOLUMES, type VehicleAlertVolume } from './vehicleAlertConstants.ts';

export function createVehicleAlertSound() {
  let context: AudioContext | null = null;
  let unlocked = false;

  function currentContext(): AudioContext | null {
    if (typeof AudioContext === 'undefined') return null;
    if (!context) context = new AudioContext();
    return context;
  }

  return {
    async unlock() {
      const ctx = currentContext();
      if (!ctx) return false;
      if (ctx.state === 'suspended') {
        await ctx.resume();
      }
      unlocked = ctx.state === 'running';
      return unlocked;
    },
    isUnlocked() {
      return unlocked;
    },
    play(volume: VehicleAlertVolume) {
      const ctx = currentContext();
      if (!ctx || ctx.state !== 'running') return false;
      const gain = ctx.createGain();
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(784, ctx.currentTime);
      osc.frequency.setValueAtTime(659, ctx.currentTime + 0.09);
      gain.gain.setValueAtTime(VEHICLE_ALERT_VOLUMES[volume], ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.24);
      return true;
    },
    dispose() {
      if (context) {
        void context.close();
        context = null;
      }
      unlocked = false;
    },
  };
}
