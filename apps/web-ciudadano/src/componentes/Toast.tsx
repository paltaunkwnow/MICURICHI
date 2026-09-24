'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

/** Cuánto dura un aviso efímero antes de desaparecer solo. */
const DURACION_MS = 2800;

const Contexto = createContext<(texto: string) => void>(() => {});

/** Aviso efímero del prototipo (`.toast`): confirma una acción sin robar el foco. */
export function ProveedorToast({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState<string | null>(null);
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mostrar = useCallback((t: string) => {
    setTexto(t);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setTexto(null), DURACION_MS);
  }, []);

  useEffect(
    () => () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    },
    [],
  );

  return (
    <Contexto.Provider value={mostrar}>
      {children}
      {/* `status` y no `alert`: es información de apoyo, no una interrupción. */}
      <output className="sr-only" aria-live="polite">
        {texto}
      </output>
      {texto ? (
        <div className="toast" aria-hidden="true">
          {texto}
        </div>
      ) : null}
    </Contexto.Provider>
  );
}

export function useToast() {
  return useContext(Contexto);
}
