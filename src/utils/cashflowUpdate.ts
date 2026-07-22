import { getCsrfToken } from '@/hooks/useCsrf';

function csrfHeaders(): Record<string, string> {
  const token = getCsrfToken();
  return token ? { 'X-CSRF-Token': token } : {};
}

export async function createCashflowItem(
  groupId: string,
  name: string,
  significado?: string,
): Promise<{ id: string; [key: string]: unknown }> {
  const response = await fetch('/api/cashflow/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...csrfHeaders(),
    },
    credentials: 'include',
    body: JSON.stringify({
      groupId,
      name, // novo campo
      descricao: name, // compatibilidade com API antiga
      significado,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}
