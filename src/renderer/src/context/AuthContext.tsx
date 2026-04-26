/// <reference types="../../../preload/index.d.ts" />
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

interface User {
  id: number;
  username: string;
  nome: string;
  role: 'admin' | 'operador';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => Promise<void>;
  verifyMasterPassword: (senha: string) => Promise<boolean>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        // @ts-ignore
        const result = await window.electron.ipcRenderer.invoke('auth:verify', token);
        // @ts-ignore
        if (result.valid) {
          // @ts-ignore
          setUser(result.user);
        } else {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setToken(null);
        }
      }
      setIsLoading(false);
    };
    verifyToken();
  }, [token]);

  const login = async (username: string, password: string) => {
    // @ts-ignore
    const result = await window.electron.ipcRenderer.invoke('auth:login', username, password);
    // @ts-ignore
    if (result.success) {
      // @ts-ignore
      localStorage.setItem('token', result.token);
      // @ts-ignore
      localStorage.setItem('user', JSON.stringify(result.user));
      // @ts-ignore
      setToken(result.token);
      // @ts-ignore
      setUser(result.user);
      navigate('/dashboard');
    }
    return result;
  };

  const logout = async () => {
    if (token) {
      // @ts-ignore
      await window.electron.ipcRenderer.invoke('auth:logout', token);
    }
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setToken(null);
    setUser(null);
    navigate('/login');
  };

  const verifyMasterPassword = async (senha: string) => {
    // @ts-ignore
    return await window.electron.ipcRenderer.invoke('auth:verifyMasterPassword', senha);
  };

  return (
    <AuthContext.Provider value={{ user, token, isLoading, login, logout, verifyMasterPassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};