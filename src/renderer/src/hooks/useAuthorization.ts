import { useAuth } from '../context/AuthContext';

export function useAuthorization() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const isOperador = user?.role === 'operador';
  return { isAdmin, isOperador, role: user?.role };
}