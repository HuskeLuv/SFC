/**
 * Auth mock helpers for API route tests.
 */
export function mockAuthPayload(overrides?: Partial<{ id: string; email: string; role: string }>) {
  return {
    id: overrides?.id ?? 'user-123',
    email: overrides?.email ?? 'test@test.com',
    role: overrides?.role ?? 'user',
  };
}

export function mockAuthAsUser(userId = 'user-123') {
  return {
    payload: mockAuthPayload({ id: userId }),
    targetUserId: userId,
    actingClient: null,
  };
}

export function mockAuthAsConsultant(consultantId: string, clientId: string) {
  return {
    payload: mockAuthPayload({ id: consultantId, role: 'consultant' }),
    targetUserId: clientId,
    actingClient: { id: clientId, consultantId },
  };
}
