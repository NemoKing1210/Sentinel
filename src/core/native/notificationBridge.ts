import { listen, type UnlistenFn } from '@tauri-apps/api/event';

const NOTIFICATION_EVENT = 'native:notification';

interface NotificationBridgeOptions {
  openReport: (itemId: string) => void;
}

export async function bindNativeNotifications(options: NotificationBridgeOptions): Promise<UnlistenFn> {
  return listen<{ itemId: string }>(NOTIFICATION_EVENT, (event) => {
    const itemId = event.payload?.itemId;
    if (itemId) options.openReport(itemId);
  });
}
