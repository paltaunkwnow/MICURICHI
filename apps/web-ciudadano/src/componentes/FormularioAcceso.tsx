'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CONFIG_DOMINIO } from 'contracts';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { crearCuenta, ErrorApi, iniciarSesion } from '@/lib/api';
import { guardarCorreoParaEntrar, tomarCorreoParaEntrar } from '@/lib/correo-para-entrar';
import { mensajeDeError } from '@/lib/errores';
import { CLAVE_YO, useSesion } from '@/lib/sesion';
import { Aviso } from './Aviso';

/**
 * Entrar y crear cuenta, en un solo componente porque son el mismo formulario con un campo de
 * diferencia. Mantenerlos juntos evita que uno se quede atrás cuando cambie una regla.
 *
 * A DÓNDE VUELVE LA PERSONA. Las dos pantallas aceptan `?volver=/ruta`, y ahí es donde se la
 * manda al terminar. Es lo que hace que «quiero reportar → necesito cuenta → entro → sigo
 * reportando» no pierda el hilo. Solo se aceptan rutas internas que empiecen por «/» y no por
 * «//»: con una URL completa, este parámetro sería una redirección abierta de manual, y bastaría
 * mandarle a alguien un enlace a nuestro propio dominio para acabar depositándolo en otro sitio
 * justo después de escribir su contraseña.
 */
function destinoSeguro(valor: string | null | undefined): string {
  if (!valor) return '/';
  if (!valor.startsWith('/') || valor.startsWith('//')) return '/';
  // `\` lo normalizan algunos navegadores a `/`, así que `/\ajeno.example` acabaría fuera.
  if (valor.startsWith('/\\')) return '/';
  return valor;
}

const EsquemaEntrar = z.object({
  email: z.string().trim().min(1, 'Escribí tu correo o usuario.').max(200),
  password: z.string().min(1, 'Escribí tu contraseña.').max(200),
});

const EsquemaAlta = z.object({
  nombre: z
    .string()
    .trim()
    .min(2, 'Escribí tu nombre o cómo querés que te llamemos.')
    .max(80, 'Máximo 80 caracteres.'),
  email: z.email('Escribí un correo electrónico válido.').max(200),
  password: z
    .string()
    .min(
      CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD,
      `Usá al menos ${CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD} caracteres.`,
    )
    .max(200, 'Máximo 200 caracteres.'),
});

type DatosEntrar = z.infer<typeof EsquemaEntrar>;
type DatosAlta = z.infer<typeof EsquemaAlta>;

export function FormularioAcceso({ modo }: { modo: 'entrar' | 'alta' }) {
  const alta = modo === 'alta';
  const router = useRouter();
  const cliente = useQueryClient();
  const parametros = useSearchParams();
  const { usuario } = useSesion();
  const volver = destinoSeguro(parametros?.get('volver'));
  const [aviso, setAviso] = useState<string | null>(null);
  const [listo, setListo] = useState(false);

  // Con sesión abierta no tiene sentido enseñar el formulario.
  useEffect(() => {
    if (usuario) router.replace(volver);
  }, [usuario, router, volver]);

  const form = useForm<DatosEntrar & Partial<DatosAlta>>({
    resolver: zodResolver((alta ? EsquemaAlta : EsquemaEntrar) as never),
    mode: 'onBlur',
    defaultValues: { email: '' },
  });

  // El correo del alta recién hecha viaja por `sessionStorage` y no por la URL, que lo dejaría en
  // el historial y en los registros (ver `lib/correo-para-entrar.ts`). Se lee ya montado: en el
  // servidor no hay almacenamiento, y leerlo al renderizar desajustaría la hidratación. Se toma una
  // sola vez y solo en el formulario de entrada; sin almacenamiento, el campo queda vacío.
  useEffect(() => {
    if (alta) return;
    const correo = tomarCorreoParaEntrar();
    if (correo) form.setValue('email', correo);
  }, [alta, form]);

  const entrar = useMutation({
    mutationFn: (d: DatosEntrar) => iniciarSesion({ email: d.email, password: d.password }),
    onMutate: () => setAviso(null),
    onSuccess: async (usuario) => {
      // La caché se refresca antes de navegar: si no, la pantalla de destino se pintaría todavía
      // con «sin sesión» y volvería a pedir cuenta justo después de entrar.
      await cliente.invalidateQueries({ queryKey: CLAVE_YO });
      const esStaff =
        usuario.rol === 'tecnico' || usuario.rol === 'admin' || usuario.rol === 'ejecutivo';
      const destinoFinal = volver === '/' && esStaff ? '/cuenta' : volver;
      router.replace(destinoFinal);
    },
    onError: (e) => {
      if (e instanceof ErrorApi && e.estado === 401)
        // Mismo texto para «ese correo no existe» y «esa contraseña no es»: decir cuál de las
        // dos falló convierte la pantalla en un buscador de cuentas registradas.
        setAviso('Correo o contraseña incorrectos.');
      else if (e instanceof ErrorApi && e.estado === 429)
        setAviso('Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.');
      else setAviso(mensajeDeError(e));
    },
  });

  const registrar = useMutation({
    mutationFn: (d: DatosAlta) => crearCuenta(d),
    onMutate: () => setAviso(null),
    onSuccess: (_respuesta, d) => {
      // Para que «Iniciar sesión» lo muestre ya escrito. Se guarda siempre, exista o no el correo:
      // el servidor responde igual y esta pantalla tampoco puede distinguir los dos casos.
      guardarCorreoParaEntrar(d.email);
      setListo(true);
    },
    onError: (e) => {
      if (e instanceof ErrorApi && e.estado === 429)
        setAviso(
          'Se crearon demasiadas cuentas desde esta conexión. Probá de nuevo dentro de un rato.',
        );
      else setAviso(mensajeDeError(e));
    },
  });

  const enviando = entrar.isPending || registrar.isPending;

  if (listo) return <AltaHecha volver={volver} />;

  return (
    <div className="tarjeta w-full max-w-md p-7">
      <h1 className="mb-1 text-2xl">{alta ? 'Crear cuenta' : 'Iniciar sesión'}</h1>
      <p className="ayuda mb-5">
        {alta
          ? 'Con una cuenta podés enviar reportes. Ver el mapa no la necesita.'
          : 'Entrá para enviar un reporte. Ver el mapa no necesita cuenta.'}
      </p>

      {volver !== '/' && (
        <Aviso tono="info" className="mb-4">
          Al terminar volvés a donde estabas.
        </Aviso>
      )}

      <form
        noValidate
        onSubmit={form.handleSubmit((d) => {
          if (alta) registrar.mutate(d as DatosAlta);
          else entrar.mutate(d);
        })}
      >
        {alta && (
          <div className="mb-4">
            <label className="lbl" htmlFor="nombre">
              Tu nombre
            </label>
            <input
              id="nombre"
              className="campo"
              autoComplete="name"
              aria-invalid={form.formState.errors.nombre ? 'true' : undefined}
              aria-describedby={form.formState.errors.nombre ? 'error-nombre' : 'ayuda-nombre'}
              {...form.register('nombre')}
            />
            <p className="ayuda mt-1" id="ayuda-nombre">
              Solo lo ve el equipo municipal. En el mapa nunca aparece quién reportó.
            </p>
            {form.formState.errors.nombre && (
              <p className="error mt-1" id="error-nombre">
                {form.formState.errors.nombre.message}
              </p>
            )}
          </div>
        )}

        <div className="mb-4">
          <label className="lbl" htmlFor="email">
            {alta ? 'Correo electrónico' : 'Correo electrónico o usuario'}
          </label>
          <input
            id="email"
            type={alta ? 'email' : 'text'}
            inputMode={alta ? 'email' : 'text'}
            placeholder={alta ? 'tu@email.com' : 'vecina o tu@email.com'}
            className="campo"
            autoComplete="username"
            aria-invalid={form.formState.errors.email ? 'true' : undefined}
            aria-describedby={form.formState.errors.email ? 'error-email' : undefined}
            {...form.register('email')}
          />
          {form.formState.errors.email && (
            <p className="error mt-1" id="error-email">
              {form.formState.errors.email.message}
            </p>
          )}
        </div>

        <div className="mb-5">
          <label className="lbl" htmlFor="password">
            Contraseña
          </label>
          <input
            id="password"
            type="password"
            className="campo"
            autoComplete={alta ? 'new-password' : 'current-password'}
            aria-invalid={form.formState.errors.password ? 'true' : undefined}
            aria-describedby={
              form.formState.errors.password
                ? 'error-password'
                : alta
                  ? 'ayuda-password'
                  : undefined
            }
            {...form.register('password')}
          />
          {alta && !form.formState.errors.password && (
            <p className="ayuda mt-1" id="ayuda-password">
              Mínimo {CONFIG_DOMINIO.PASSWORD_MIN_LONGITUD} caracteres.
            </p>
          )}
          {form.formState.errors.password && (
            <p className="error mt-1" id="error-password">
              {form.formState.errors.password.message}
            </p>
          )}
        </div>

        {/* `aria-live` para que el lector de pantalla lo anuncie: quien no ve la tarjeta no se
            entera de que apareció un error debajo del botón. */}
        <div aria-live="polite">
          {aviso && (
            <Aviso tono="err" className="mb-4">
              {aviso}
            </Aviso>
          )}
        </div>

        <button type="submit" className="btn btn-bloque" disabled={enviando}>
          {enviando ? 'Enviando…' : alta ? 'Crear cuenta' : 'Entrar'}
        </button>
      </form>

      <p className="ayuda mt-5">
        {alta ? (
          <>
            ¿Ya tenés cuenta?{' '}
            <Link href={`/ingresar?volver=${encodeURIComponent(volver)}`}>Iniciá sesión</Link>.
          </>
        ) : (
          <>
            ¿Todavía no tenés cuenta?{' '}
            <Link href={`/crear-cuenta?volver=${encodeURIComponent(volver)}`}>Creá una</Link>.
          </>
        )}
      </p>
      <p className="ayuda mt-2">
        <Link href="/">Volver al mapa</Link> — verlo no necesita cuenta.
      </p>
    </div>
  );
}

/**
 * Alta hecha. El servidor responde lo mismo exista o no el correo, así que esta pantalla
 * tampoco puede decir «ya tenías cuenta» ni «cuenta creada»: dice lo único cierto en los dos
 * casos, que ya se puede entrar con ese correo y esa contraseña.
 *
 * Solo recibe a dónde volver, y por eso no puede distinguir los dos casos. Tampoco inicia sesión
 * sola: con un correo ya registrado, entrar sin contraseña revelaría que existe. El correo no va
 * en el enlace: `registrar` lo deja en `sessionStorage` y `/ingresar` lo toma al montar.
 */
export function AltaHecha({ volver }: { volver: string }) {
  return (
    <div className="tarjeta w-full max-w-md p-7">
      <h1 className="mb-2 text-2xl">Ya podés entrar</h1>
      <Aviso tono="ok">
        Si ese correo no tenía cuenta, acaba de crearse. Iniciá sesión con el correo y la contraseña
        que elegiste.
      </Aviso>
      <Link
        href={`/ingresar?volver=${encodeURIComponent(volver)}`}
        className="btn btn-bloque mt-5 no-underline"
      >
        Iniciar sesión
      </Link>
    </div>
  );
}
