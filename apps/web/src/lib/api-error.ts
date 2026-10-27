export async function readApiError(response: Response): Promise<string> {
  try {
    const body = await response.json();
    return typeof body?.error === 'string' ? body.error : `Request failed (${response.status})`;
  } catch {
    return `Request failed (${response.status})`;
  }
}
