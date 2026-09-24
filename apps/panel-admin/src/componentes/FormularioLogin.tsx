'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Aviso } from '@/componentes/Aviso';
import { ErrorApi, iniciarSesion } from '@/lib/api';
import { CLAVE_YO, useUsuario } from '@/lib/sesion';

// Mismas reglas que LoginSchema de contracts, con mensajes en español para la interfaz.
const EsquemaLogin = z.object({
  email: z.email('Ingresá un email válido.').max(200),
  password: z.string().min(8, 'La contraseña tiene al menos 8 caracteres.').max(200),
});
type DatosLogin = z.infer<typeof EsquemaLogin>;

export function FormularioLogin() {
  const router = useRouter();
  const cliente = useQueryClient();
  const sesion = useUsuario();
  const parametros = useSearchParams();
  // `Protegido` manda aquí con ?caducada=1 cuando api-core contesta 401 a mitad de trabajo.
  const caducada = parametros?.get('caducada') === '1';
  const [mensajeError, setMensajeError] = useState<string | null>(null);

  // Con sesión vigente no tiene sentido mostrar el formulario.
  useEffect(() => {
    if (sesion.data) router.replace('/reportes');
  }, [sesion.data, router]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<DatosLogin>({ resolver: zodResolver(EsquemaLogin), mode: 'onBlur' });

  const entrar = useMutation({
    mutationFn: iniciarSesion,
    onMutate: () => setMensajeError(null),
    onSuccess: (usuario) => {
      cliente.setQueryData(CLAVE_YO, usuario);
      router.replace('/reportes');
    },
    onError: (e) => {
      if (e instanceof ErrorApi && e.estado === 401)
        setMensajeError('Email o contraseña incorrectos.');
      else if (e instanceof ErrorApi && e.estado === 429) {
        setMensajeError('Demasiados intentos. Esperá unos minutos y volvé a probar.');
      } else if (e instanceof ErrorApi) {
        // El 500 de api-core ya viene con un texto apto para leer; cualquier otro código se
        // muestra tal cual porque lo escribe el propio servicio, no la plataforma.
        setMensajeError(
          e.estado >= 500
            ? 'El servidor tuvo un problema. Probá de nuevo en un momento.'
            : e.message,
        );
      } else {
        // Un fallo de red llega como TypeError («Failed to fetch») o como DOMException
        // («TimeoutError»): texto de la plataforma, en inglés y sin utilidad para nadie.
        setMensajeError('No pudimos conectar con el servidor. Revisá que api-core esté en marcha.');
      }
    },
  });

  return (
    <main id="contenido" className="flex min-h-dvh items-center justify-center p-6">
      <div className="tarjeta w-full max-w-md p-8">
        <div className="mb-6 flex items-center gap-3">
          {/* biome-ignore lint/performance/noImgElement: logo estático pequeño, sin optimización de Next */}
          <img src="/icono.svg" alt="" width={48} height={48} />
          <div>
            <h1 className="text-2xl">Panel técnico</h1>
            <p className="text-tinta-600">Mi Curichi · moderación y análisis de reportes</p>
          </div>
        </div>

        <form
          onSubmit={handleSubmit((datos) => entrar.mutate(datos))}
          noValidate
          className="flex flex-col gap-4"
        >
          <div>
            <label htmlFor="email" className="mb-1 block font-semibold">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              className="campo"
              aria-invalid={errors.email ? 'true' : undefined}
              aria-describedby={errors.email ? 'email-error' : undefined}
              {...register('email')}
            />
            {errors.email && (
              <p id="email-error" className="error mt-1">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block font-semibold">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              className="campo"
              aria-invalid={errors.password ? 'true' : undefined}
              aria-describedby={errors.password ? 'password-error' : undefined}
              {...register('password')}
            />
            {errors.password && (
              <p id="password-error" className="error mt-1">
                {errors.password.message}
              </p>
            )}
          </div>

          <Aviso tipo="error" testId="error-login">
            {mensajeError}
          </Aviso>

          <button
            type="submit"
            className="btn btn-primario"
            data-testid="boton-login"
            disabled={entrar.isPending}
          >
            <LogIn size={20} aria-hidden="true" />
            {entrar.isPending ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>

        {caducada ? (
          <Aviso tipo="alerta" testId="sesion-caducada">
            Tu sesión caducó por inactividad. Volvé a entrar para seguir donde estabas; ningún
            cambio que ya hayas confirmado se perdió.
          </Aviso>
        ) : null}

        <p className="ayuda mt-6">
          Acceso solo para técnicos y administradores municipales. Entorno local: ver{' '}
          <code>packages/db/README.md</code>.
        </p>
      </div>
    </main>
  );
}
