export type VehicleAlertChannelMessage =
  | { type: 'claimed'; ids: string[] }
  | { type: 'pendingCount'; count: number }
  | { type: 'dismiss'; id: string }
  | { type: 'announced'; id: string };

export function vehicleAlertChannelName(userId: string, churchName: string): string {
  return `cv-vehicle-alerts:${userId}:${churchName.trim().toLowerCase()}`;
}

export function createVehicleAlertChannel(
  userId: string,
  churchName: string,
  onMessage: (message: VehicleAlertChannelMessage) => void
) {
  const name = vehicleAlertChannelName(userId, churchName);
  let channel: BroadcastChannel | null = null;
  if (typeof BroadcastChannel !== 'undefined') {
    channel = new BroadcastChannel(name);
    channel.onmessage = (event: MessageEvent<VehicleAlertChannelMessage>) => {
      if (event.data && typeof event.data === 'object') onMessage(event.data);
    };
  }

  return {
    post(message: VehicleAlertChannelMessage) {
      channel?.postMessage(message);
    },
    close() {
      channel?.close();
      channel = null;
    },
  };
}
