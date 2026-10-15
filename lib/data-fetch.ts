import { trackFailure } from './analytics';

/**
 * fetch() for the site's own data files, used by every request the browser makes for them (verify-analytics checks
 * that nothing else calls fetch). It returns and throws exactly what fetch does, and reports a request that fails or
 * comes back with an error status as site_error `data_fetch`: the kind of failure only, never the address or the data.
 * A request the page cancels (AbortError) is not a failure.
 */
export async function dataFetch(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch (error) {
    if ((error as Error | null)?.name !== 'AbortError' && !init?.signal?.aborted) trackFailure('data_fetch');
    throw error;
  }
  if (!response.ok) trackFailure('data_fetch');
  return response;
}
