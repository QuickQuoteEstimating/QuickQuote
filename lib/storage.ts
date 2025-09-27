import * as FileSystem from "expo-file-system";
import { supabase } from "./supabase";
import { openDB } from "./sqlite";

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const PHOTO_BUCKET =
  process.env.EXPO_PUBLIC_SUPABASE_STORAGE_BUCKET ?? "estimate-photos";
const PHOTO_DIRECTORY = `${FileSystem.documentDirectory ?? ""}photos`;

function encodeStoragePath(path: string): string {
  return path
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function getExtension(uri: string): string {
  const match = uri.match(/\.([a-zA-Z0-9]+)(?:\?|$)/);
  const raw = match ? match[1].toLowerCase() : "jpg";
  switch (raw) {
    case "jpeg":
      return "jpg";
    case "jpg":
    case "png":
    case "heic":
    case "heif":
    case "webp":
      return raw;
    default:
      return "jpg";
  }
}

function getContentType(extension: string): string {
  switch (extension) {
    case "png":
      return "image/png";
    case "webp":
      return "image/webp";
    case "heic":
    case "heif":
      return "image/heic";
    default:
      return "image/jpeg";
  }
}

async function ensureDirectoryExists(): Promise<void> {
  if (!FileSystem.documentDirectory) {
    throw new Error("Document directory is not available");
  }

  const info = await FileSystem.getInfoAsync(PHOTO_DIRECTORY);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(PHOTO_DIRECTORY, {
      intermediates: true,
    });
  }
}

async function getAccessToken(): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("Failed to read Supabase session", error);
      return null;
    }
    return data.session?.access_token ?? null;
  } catch (error) {
    console.warn("Failed to resolve Supabase session", error);
    return null;
  }
}

export function createPhotoStoragePath(
  estimateId: string,
  photoId: string,
  sourceUri?: string
): string {
  const extension = getExtension(sourceUri ?? "");
  return `${estimateId}/${photoId}.${extension}`;
}

export function deriveLocalPhotoUri(photoId: string, remoteUri: string): string {
  const extension = getExtension(remoteUri);
  return `${PHOTO_DIRECTORY}/${photoId}.${extension}`;
}

export async function persistLocalPhotoCopy(
  photoId: string,
  remoteUri: string,
  sourceUri: string
): Promise<string> {
  await ensureDirectoryExists();
  const localUri = deriveLocalPhotoUri(photoId, remoteUri);
  await FileSystem.deleteAsync(localUri, { idempotent: true });
  await FileSystem.copyAsync({ from: sourceUri, to: localUri });
  return localUri;
}

export async function deleteLocalPhoto(
  localUri?: string | null
): Promise<void> {
  if (localUri) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
  }
}

export async function uploadPhotoBinary(
  localUri: string,
  remoteUri: string,
  accessToken?: string | null
): Promise<void> {
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    throw new Error("No Supabase session available for upload");
  }
  if (!SUPABASE_URL) {
    throw new Error("Supabase URL is not configured for storage uploads");
  }

  const encodedPath = encodeStoragePath(remoteUri);
  const url = `${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${encodedPath}`;
  const contentType = getContentType(getExtension(remoteUri));

  const result = await FileSystem.uploadAsync(url, localUri, {
    httpMethod: "POST",
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
      "x-upsert": "true",
    },
  });

  if (result.status >= 400) {
    throw new Error(
      `Failed to upload photo ${remoteUri}: ${result.status} ${result.body}`
    );
  }
}

export async function downloadPhotoBinary(
  remoteUri: string,
  localUri: string,
  accessToken?: string | null
): Promise<boolean> {
  const token = accessToken ?? (await getAccessToken());
  if (!token) {
    return false;
  }
  if (!SUPABASE_URL) {
    console.warn("Supabase URL is not configured; skipping photo download");
    return false;
  }

  await ensureDirectoryExists();
  const encodedPath = encodeStoragePath(remoteUri);
  const url = `${SUPABASE_URL}/storage/v1/object/${PHOTO_BUCKET}/${encodedPath}`;

  try {
    const result = await FileSystem.downloadAsync(url, localUri, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (result.status >= 400) {
      await FileSystem.deleteAsync(localUri, { idempotent: true });
      return false;
    }

    return true;
  } catch (error) {
    await FileSystem.deleteAsync(localUri, { idempotent: true });
    throw error;
  }
}

export async function deleteRemotePhoto(remoteUri: string): Promise<void> {
  if (!remoteUri) {
    return;
  }
  await supabase.storage.from(PHOTO_BUCKET).remove([remoteUri]);
}

type PhotoRow = {
  id: string;
  estimate_id: string;
  uri: string;
  local_uri: string | null;
  description: string | null;
  version: number | null;
  updated_at: string | null;
  deleted_at: string | null;
};

export async function syncPhotoBinaries(): Promise<void> {
  try {
    const db = await openDB();
    const rows = await db.getAllAsync<PhotoRow>(
      `SELECT id, estimate_id, uri, local_uri, description, version, updated_at, deleted_at FROM photos`
    );

    if (!rows.length) {
      return;
    }

    await ensureDirectoryExists();
    const accessToken = await getAccessToken();
    const isOnline = !!accessToken;

    for (const row of rows) {
      const remoteUri = row.uri;
      if (!remoteUri) {
        continue;
      }

      const expectedLocalUri = deriveLocalPhotoUri(row.id, remoteUri);

      if (row.deleted_at) {
        await deleteLocalPhoto(row.local_uri ?? expectedLocalUri);
        if (row.local_uri) {
          await db.runAsync(`UPDATE photos SET local_uri = NULL WHERE id = ?`, [
            row.id,
          ]);
        }

        if (isOnline) {
          try {
            await deleteRemotePhoto(remoteUri);
          } catch (error) {
            console.warn(`Failed to delete remote photo ${row.id}`, error);
          }
        }

        continue;
      }

      const localUri = row.local_uri ?? expectedLocalUri;

      if (row.local_uri !== localUri) {
        await db.runAsync(`UPDATE photos SET local_uri = ? WHERE id = ?`, [
          localUri,
          row.id,
        ]);
      }

      const info = await FileSystem.getInfoAsync(localUri);
      if (!info.exists && isOnline) {
        try {
          const downloaded = await downloadPhotoBinary(
            remoteUri,
            localUri,
            accessToken
          );
          if (downloaded) {
            await db.runAsync(`UPDATE photos SET local_uri = ? WHERE id = ?`, [
              localUri,
              row.id,
            ]);
          }
        } catch (error) {
          console.warn(`Failed to download photo ${row.id}`, error);
        }
      }

      const updatedInfo = await FileSystem.getInfoAsync(localUri);
      if (updatedInfo.exists && isOnline) {
        try {
          await uploadPhotoBinary(localUri, remoteUri, accessToken);
        } catch (error) {
          console.warn(`Failed to upload photo ${row.id}`, error);
        }
      }
    }
  } catch (error) {
    console.error("Photo binary sync failed", error);
  }
}

export async function ensurePhotoDirectory(): Promise<void> {
  await ensureDirectoryExists();
}
