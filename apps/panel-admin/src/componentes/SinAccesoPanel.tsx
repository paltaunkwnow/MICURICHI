import { LogOut } from 'lucide-react';

/**
 * Lo que ve una cuenta con sesión pero sin rol del panel (un `ciudadano`). Lleva «Cerrar sesión»:
 * sin él la cuenta quedaba atrapada, porque /login la devolvía aquí y no había forma de entrar
 * con otra.
 */
export function SinAccesoPanel({
  onCerrarSesion,
  cerrando,
}: {
  onCerrarSesion: () => void;
  cerrando: boolean;
}) {
  return (
    <div className="flex flex-col items-start gap-2 p-8" role="alert">
      <p className="error">Tu cuenta no tiene acceso al panel técnico.</p>
      <p className="ayuda">
        Pedí a un administrador que te asigne el rol de técnico o de ejecutivo, o cerrá la sesión
        para entrar con otra cuenta.
      </p>
      <button
        type="button"
        className="btn btn-secundario mt-2"
        data-testid="cerrar-sesion-sin-acceso"
        onClick={onCerrarSesion}
        disabled={cerrando}
      >
        <LogOut size={18} aria-hidden="true" />
        Cerrar sesión
      </button>
    </div>
  );
}
