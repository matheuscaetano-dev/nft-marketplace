import { HttpResponse } from 'msw';
import type { ApiErrorResponse, SessionResponse } from '../contracts/api';
import { defaultSessionExpiresAt, getDb, mutate } from './db';
import type { MockDatabaseState, MockUser } from './db/types';

export interface MockAuthFailure {
  response: Response;
}

export type MockAuthResult = MockUser | MockAuthFailure;

export function apiError(
  status: number,
  code: ApiErrorResponse['code'],
  message: string,
  fieldErrors?: Record<string, string[]>,
  details?: Record<string, unknown>,
): Response {
  const body: ApiErrorResponse = {
    code,
    message,
    ...(fieldErrors ? { fieldErrors } : {}),
    ...(details ? { details } : {}),
  };
  return HttpResponse.json(body, { status });
}

export function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return isJsonObject(body) ? body : undefined;
  } catch {
    return undefined;
  }
}

export async function hashPassword(password: string, salt: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`${salt}:${password}`),
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function constantTimeEquals(left: string, right: string): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyPassword(user: MockUser, password: string): Promise<boolean> {
  const candidateHash = await hashPassword(password, user.passwordSalt);
  return constantTimeEquals(candidateHash, user.passwordHash);
}

export function accountSummary(user: MockUser) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    username: user.username,
  };
}

export function sessionResponse(token: string, user: MockUser, expiresAt: number): SessionResponse {
  return {
    user: accountSummary(user),
    token,
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

export function createSession(userId: string): SessionResponse {
  const token = `mock-${crypto.randomUUID()}`;
  const expiresAt = defaultSessionExpiresAt();
  const user = getDb().users[userId];
  if (!user) {
    throw new Error(`Cannot create a session for missing user ${userId}.`);
  }

  mutate((draft) => {
    draft.sessions[token] = { userId, expiresAt };
  });
  return sessionResponse(token, user, expiresAt);
}

export function requireAuth(request: Request): MockAuthResult {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { response: apiError(401, 'SESSION_INVALID', 'Autenticação necessária.') };
  }

  const session = getDb().sessions[token];
  if (!session) {
    return { response: apiError(401, 'SESSION_INVALID', 'Sessão inválida.') };
  }
  if (session.expiresAt <= Date.now()) {
    mutate((draft) => {
      delete draft.sessions[token];
    });
    return { response: apiError(401, 'SESSION_EXPIRED', 'Sua sessão expirou.') };
  }

  const user = getDb().users[session.userId];
  if (!user) {
    return { response: apiError(401, 'SESSION_INVALID', 'Sessão inválida.') };
  }
  return user;
}

export function isAuthFailure(result: MockAuthResult): result is MockAuthFailure {
  return 'response' in result;
}

export function newPasswordSalt(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function registerUser(input: {
  email: string;
  displayName: string;
  username: string;
  passwordSalt: string;
  passwordHash: string;
  visitorId?: string;
}): MockUser | undefined {
  return mutate((draft) => {
    const normalizedEmail = input.email.trim().toLocaleLowerCase();
    if (Object.values(draft.users).some((user) => user.email.toLocaleLowerCase() === normalizedEmail)) {
      return undefined;
    }

    const id = createIdWithinDraft(draft);
    const user: MockUser = {
      id,
      email: normalizedEmail,
      displayName: input.displayName.trim(),
      username: input.username.trim(),
      passwordSalt: input.passwordSalt,
      passwordHash: input.passwordHash,
    };
    draft.users[id] = user;
    draft.favorites[id] = [];
    draft.carts[id] = { items: [], version: 1 };
    draft.profiles[id] = {
      email: user.email,
      displayName: user.displayName,
      username: user.username,
      ensName: '',
    };
    draft.wallets[id] = [];
    if (input.visitorId) {
      const visitorCart = draft.visitorCarts[input.visitorId];
      if (visitorCart) {
        const merged = mergeCartLines(draft, draft.carts[id].items, visitorCart.items);
        if (merged) {
          draft.carts[id] = { items: merged, version: draft.carts[id].version + 1 };
          delete draft.visitorCarts[input.visitorId];
        }
      }
    }
    return user;
  });
}

function mergeCartLines(
  state: MockDatabaseState,
  existingItems: MockDatabaseState['carts'][string]['items'],
  incomingItems: MockDatabaseState['carts'][string]['items'],
) {
  const merged = structuredClone(existingItems);
  for (const incoming of incomingItems) {
    const nft = state.nfts[incoming.nftId];
    const edition = nft?.editions.find((entry) => entry.id === incoming.editionId);
    if (!edition || incoming.quantity < 1 || incoming.quantity > edition.availableQuantity) {
      return undefined;
    }
    const current = merged.find((item) => (
      item.nftId === incoming.nftId && item.editionId === incoming.editionId
    ));
    if (current) {
      current.quantity += incoming.quantity;
      if (current.quantity > edition.availableQuantity) return undefined;
    } else {
      merged.push(structuredClone(incoming));
    }
  }
  return merged;
}

function createIdWithinDraft(draft: MockDatabaseState): string {
  const id = `user-${draft.nextId}`;
  draft.nextId += 1;
  return id;
}

export function validateCredentials(body: Record<string, unknown>): {
  email: string;
  password: string;
  visitorId?: string;
} | undefined {
  if (typeof body.email !== 'string' || typeof body.password !== 'string') {
    return undefined;
  }
  return {
    email: body.email.trim().toLocaleLowerCase(),
    password: body.password,
    ...(typeof body.visitorId === 'string' ? { visitorId: body.visitorId } : {}),
  };
}

export function getUserByEmail(email: string): MockUser | undefined {
  return Object.values(getDb().users).find((user) => user.email.toLocaleLowerCase() === email);
}

export function invalidateSession(request: Request): Response | undefined {
  const authorization = request.headers.get('Authorization');
  const token = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || !getDb().sessions[token]) {
    return apiError(401, 'SESSION_INVALID', 'Sessão inválida.');
  }

  mutate((draft) => {
    delete draft.sessions[token];
  });
  return undefined;
}
