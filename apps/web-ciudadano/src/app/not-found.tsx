import Link from 'next/link';

export default function NoEncontrado() {
  return (
    <main id="contenido" className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="titular text-4xl">No encontramos esta página</h1>
      <p className="text-tinta-600">
        Puede que el enlace esté mal escrito o que la página ya no exista.
      </p>
      <Link href="/" className="btn-primario btn no-underline">
        Ir al mapa
      </Link>
    </main>
  );
}
