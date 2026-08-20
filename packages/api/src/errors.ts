/**
 * Normalized application error. `message` is always safe to display to a user
 * (French, no internals); `cause` retains the original error for logs.
 */
export class AppError extends Error {
  readonly code: string;
  override readonly cause?: unknown;

  constructor(code: string, message: string, cause?: unknown) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;
  }
}

interface PostgrestLikeError {
  code?: string;
  message?: string;
  details?: string;
  hint?: string;
}

const USER_SAFE_MESSAGES: Record<string, string> = {
  '23505': 'Un élément identique existe déjà.',
  '23503': "Cet élément est lié à d'autres données.",
  '42501': "Vous n'avez pas les droits pour cette action.",
  PGRST116: "L'élément demandé est introuvable.",
};

/** Maps Supabase/PostgREST/network errors to a user-safe AppError. */
export function normalizeError(error: unknown, fallback = 'Une erreur est survenue.'): AppError {
  if (error instanceof AppError) return error;

  if (error !== null && typeof error === 'object') {
    const e = error as PostgrestLikeError;
    if (typeof e.code === 'string') {
      const safe = USER_SAFE_MESSAGES[e.code];
      if (safe) return new AppError(e.code, safe, error);
      if (e.code === 'PGRST301' || e.code === '401') {
        return new AppError(e.code, 'Votre session a expiré. Veuillez vous reconnecter.', error);
      }
    }
    if (typeof e.message === 'string' && e.message !== '') {
      // Network-level failures surface a generic connectivity message.
      if (/failed to fetch|networkerror|load failed/i.test(e.message)) {
        return new AppError('NETWORK', 'Connexion impossible. Vérifiez votre réseau.', error);
      }
    }
  }

  return new AppError('UNKNOWN', fallback, error);
}

/** Throws the PostgREST error if present, otherwise returns data. */
export function unwrap<T>(result: { data: T; error: unknown }): T {
  if (result.error) throw normalizeError(result.error);
  return result.data;
}
