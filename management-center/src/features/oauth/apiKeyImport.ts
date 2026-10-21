import { authFilesApi } from '@/services/api';

/** Shared state shape of the API-key credential imports (OpenCode Go / Devin CLI). */
export interface ApiKeyImportState {
  apiKey: string;
  showKey: boolean;
  loading: boolean;
  error?: string;
  success: boolean;
}

/** Uploads a generated credential JSON as an auth file; throws when the backend rejects it. */
export async function uploadCredentialJson(
  fileName: string,
  credential: Record<string, unknown>,
  fallbackError: string
): Promise<void> {
  const file = new File([JSON.stringify(credential, null, 2)], fileName, {
    type: 'application/json',
  });
  const result = await authFilesApi.uploadFiles([file]);
  if (result.failed.length > 0 || result.uploaded < 1) {
    throw new Error(result.failed[0]?.error || fallbackError);
  }
}
