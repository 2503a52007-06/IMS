export async function readJsonResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  if (!text.trim()) {
    throw new Error(`Empty response from server (HTTP ${res.status}).`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Unexpected non-JSON response from API (HTTP ${res.status}). Make sure backend API routes are running.`
    );
  }
}
