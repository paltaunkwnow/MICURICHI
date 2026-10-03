# Lanzador de Mi Curichi (`Mi-Curichi.exe`)

Un solo ejecutable que levanta toda la pila local en Docker con doble clic y ofrece un menú
simple en español. Reemplaza a los lanzadores viejos (`iniciar.bat`, `iniciar.ps1`,
`compartir-amigos.*`, `scripts/Launcher.cs`, `Iniciar-Curichi.exe`).

## Archivos

- `MiCurichi.cs` — código fuente (C# 5; compila con el `csc` de .NET Framework 4, que ya viene
  con Windows).
- `compilar.ps1` — compila `MiCurichi.cs` a `Mi-Curichi.exe` **en la raíz del repositorio**.

El binario `Mi-Curichi.exe` **no se versiona** (está en `.gitignore`): se regenera con el script.

## Compilar

```powershell
powershell -ExecutionPolicy Bypass -File scripts\lanzador\compilar.ps1
```

No hace falta instalar nada: usa `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`.
Si hay un `.ico` propio en `apps/web-ciudadano/public` (o en las carpetas `public`/`app` de las
apps), lo usa como ícono; si no, compila sin ícono.

## Usar

Doble clic en `Mi-Curichi.exe`, o desde la consola:

| Comando | Qué hace |
|---|---|
| `Mi-Curichi.exe` | Arranca la pila y abre el menú interactivo. |
| `Mi-Curichi.exe --iniciar` | Arranca, espera a que esté sana y sale (sin menú). |
| `Mi-Curichi.exe --iniciar --sin-navegador` | Igual que `--iniciar` pero no abre el navegador. |
| `Mi-Curichi.exe --estado` | Muestra el estado y sale con 0 si todo está sano, 1 si no. |
| `Mi-Curichi.exe --detener` | Detiene los contenedores (sin borrar nada) y sale. |
| `Mi-Curichi.exe --ayuda` | Muestra la ayuda. |

El menú tiene: abrir el mapa ciudadano, abrir el panel técnico, ver estado, ver los últimos
registros, actualizar con los últimos cambios del código (reconstruye imágenes), compartir con
amigos por túneles de Cloudflare, dejar de compartir, correr las pruebas E2E y detener todo.

## Qué hace y qué nunca hace

- Busca el proyecto en la carpeta del propio `.exe` y en sus carpetas superiores (sin rutas fijas).
- Encuentra Docker en el `PATH` o en `C:\Program Files\Docker\Docker\resources\bin\docker.exe`; si
  el motor no responde, abre Docker Desktop y espera hasta 180 s.
- Levanta `docker compose --profile servicios --profile minio up -d` y, si falla por el montaje de
  la unidad en Docker/WSL, lo repara una vez y reintenta.
- Espera a que todos los servicios de esos perfiles estén `healthy` y a que `migraciones` salga con
  código 0 (hasta 240 s), mostrando cuáles faltan.
- Las direcciones son `https://localhost` (mapa) y `https://panel.localhost` (panel): los
  navegadores resuelven `*.localhost` solos, sin tocar el archivo `hosts`.
- Al compartir con amigos, los procesos `cloudflared` viven dentro de un *Job Object* de Windows
  con `KILL_ON_JOB_CLOSE`, así que se cierran al cerrar el lanzador aunque sea con la X.
- **Nunca** hace `docker compose down`, **nunca** borra volúmenes, **nunca** toca un `.env` que ya
  existe, **nunca** edita el archivo `hosts`, **nunca** pide elevación y **nunca** imprime
  contraseñas.
