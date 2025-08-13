import { NextRequest } from 'next/server';
import jwt from 'jsonwebtoken';

export interface JWTPayload {
  id: string;
  email: string;
}

export function verifyJWT(request: NextRequest): JWTPayload | null {
  try {
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      return null;
    }

    const payload = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
    return payload;
  } catch (error) {
    return null;
  }
}

export function requireAuth(request: NextRequest): JWTPayload {
  const payload = verifyJWT(request);
  
  if (!payload) {
    throw new Error('Não autorizado');
  }
  
  return payload;
} 