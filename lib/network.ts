import NetInfo from "@react-native-community/netinfo";

/**
 * Checks if the device currently has an active internet connection.
 * Returns `true` if online, `false` if offline.
 */
export async function isOnline(): Promise<boolean> {
  try {
    const state = await NetInfo.fetch();
    return !!state.isConnected;
  } catch {
    return false;
  }
}
