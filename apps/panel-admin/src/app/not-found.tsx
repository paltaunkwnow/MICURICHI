import Link from 'next/link';

/** 404 del panel: sin esto Next devuelve su página por defecto, en inglés y fuera del kit. */
export default function NoEncontrado() {
  return (
    <div className="p-8">
      <h1 className="text-2xl">Esa pantalla no existe</h1>
      <p className="mt-2 text-tinta-600">
        Puede que el enlace esté mal escrito o que la pantalla se haya movido.
      </p>
      <Link href="/reportes" className="btn btn-primario mt-6 no-underline">
        Ir a la bandeja
      </Link>
    </div>
  );
}
