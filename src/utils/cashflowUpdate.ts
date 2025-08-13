export async function updateCashflowValue(
  itemId: string, 
  field: string, 
  value: string | number, 
  monthIndex?: number
): Promise<any> {
  const response = await fetch('/api/cashflow/values', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      itemId,
      field,
      value,
      monthIndex
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
}

export async function createCashflowItem(
  groupId: string,
  descricao: string,
  significado?: string
): Promise<any> {
  const response = await fetch('/api/cashflow/items', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    credentials: 'include',
    body: JSON.stringify({
      groupId,
      descricao,
      significado
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(error);
  }

  return response.json();
} 