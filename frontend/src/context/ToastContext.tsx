import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';

const Ctx = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('');
  const timer = useRef<number>();

  const notify = useCallback((m: string) => {
    setMessage(m);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setMessage(''), 2400);
  }, []);

  return (
    <Ctx.Provider value={notify}>
      {children}
      {message && <div className="toast" role="status">{message}</div>}
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);
