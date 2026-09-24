-- Migración 0003 — límite de intentos de login y caducidad de sesión por inactividad (Parte 4).
--
-- Antes, el login solo estaba limitado por IP (20/15 min). Eso frena un ataque desde una IP, pero
-- no un credential stuffing distribuido contra una cuenta concreta: cada IP aporta sus 20 intentos.
-- Se añade un contador por cuenta además del de IP.
--
-- La clave se guarda HASHEADA con sal: la tabla no debe revelar qué correos existen ni desde qué
-- IP entra cada persona (§13, datos personales).

CREATE TABLE IF NOT EXISTS intento_login (
  id bigserial PRIMARY KEY,
  -- 'email:<sha256>' o 'ip:<sha256>'; nunca el valor en claro.
  clave text NOT NULL,
  exito boolean NOT NULL,
  creado_en timestamptz NOT NULL DEFAULT now()
);

-- Sirve tanto para contar la ventana reciente como para que el mantenimiento borre lo viejo.
CREATE INDEX IF NOT EXISTS intento_login_clave ON intento_login (clave, creado_en DESC);
CREATE INDEX IF NOT EXISTS intento_login_creado ON intento_login (creado_en);

-- Caducidad por inactividad: `expira_en` es el tope absoluto y `ultimo_uso_en` el deslizante.
-- Una cookie robada dejaba de servir solo al cumplirse los 7 días; ahora también si nadie la usa.
ALTER TABLE sesion ADD COLUMN IF NOT EXISTS ultimo_uso_en timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS sesion_ultimo_uso ON sesion (ultimo_uso_en);
