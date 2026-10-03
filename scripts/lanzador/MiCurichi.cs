// Mi Curichi - Lanzador de la pila local en Docker.
//
// Un solo ejecutable (Mi-Curichi.exe) que levanta todo el proyecto con doble clic y ofrece un
// menu simple en espanol para alguien no tecnico. Reemplaza a los lanzadores viejos (iniciar.bat,
// iniciar.ps1, compartir-amigos.*, scripts/Launcher.cs, Iniciar-Curichi.exe).
//
// Se compila en C# 5 con el csc que viene con .NET Framework 4:
//   C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
// Por eso NO usa interpolacion de cadenas ($"..."), ?. , nameof, tuplas ni otras novedades.
//
// Reglas que respeta a proposito (defectos de los lanzadores viejos que NO se repiten):
//  - NO toca el .env si ya existe (el viejo le agregaba "-fotos" a S3_ACCESS_KEY en cada arranque).
//  - NO edita el archivo hosts ni pide elevacion: los navegadores resuelven *.localhost solos.
//  - NO abre http://localhost:3100 (la web y el panel ya no publican puertos: solo Caddy en 443).
//  - Muestra las cuentas de desarrollo (contraseñas cortas) solo en el estado local, nunca al compartir.
//  - NO usa rutas fijas A:\MICURICHI: el proyecto es el del propio .exe (o un padre).
//  - Los tuneles de cloudflared van dentro de un Job Object con KILL_ON_JOB_CLOSE, asi que mueren
//    al cerrar el lanzador aunque sea con la X.
//  - NUNCA hace "docker compose down" ni borra volumenes.

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Globalization;
using System.IO;
using System.Net;
using System.Runtime.InteropServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

namespace MiCurichiLanzador
{
    static class Program
    {
        // --- Configuracion fija de la instalacion local ---
        const string PerfilServicios = "servicios";
        const string PerfilMinio = "minio";
        const string UrlWeb = "https://localhost";
        const string UrlPanel = "https://panel.localhost";

        // Servicios de larga vida que deben quedar "running" y "healthy".
        static readonly string[] ServiciosSanos = new string[]
        {
            "postgis", "minio", "api-core", "geo-service", "web-ciudadano", "panel-admin", "proxy"
        };
        // Trabajos de una sola corrida que deben salir con codigo 0.
        static readonly string[] Trabajos = new string[] { "migraciones", "minio-init" };

        // --- Estado del proceso ---
        static string projectDir = "";
        static string dockerExe = "docker";
        static readonly List<Process> tuneles = new List<Process>();
        static IntPtr hJob = IntPtr.Zero;

        static int Main(string[] args)
        {
            try { Console.OutputEncoding = new UTF8Encoding(false); }
            catch { /* salida redirigida: no pasa nada */ }
            try { Console.Title = "Mi Curichi - Lanzador"; }
            catch { }

            bool sinNavegador = TieneFlag(args, "--sin-navegador");

            if (TieneFlag(args, "--ayuda") || TieneFlag(args, "-h") || TieneFlag(args, "/?"))
            {
                MostrarAyuda();
                return 0;
            }

            // Cierre ordenado de tuneles si matan el proceso con Ctrl+C o con la X.
            Console.CancelKeyPress += delegate(object s, ConsoleCancelEventArgs e)
            {
                CerrarTuneles();
            };
            AppDomain.CurrentDomain.ProcessExit += delegate(object s, EventArgs e)
            {
                if (hJob != IntPtr.Zero) { try { CloseHandle(hJob); } catch { } }
            };

            Banner();

            if (!DetectarProyecto())
            {
                Error("No encontre el proyecto (no hay 'docker-compose.yml' junto al ejecutable ni en sus carpetas superiores).");
                Info("Dejá el ejecutable Mi-Curichi.exe en la carpeta del proyecto (donde está docker-compose.yml) y volvé a abrirlo.");
                PausaSiInteractivo();
                return 1;
            }
            Ok("Carpeta del proyecto: " + projectDir);

            if (!DetectarDocker())
            {
                Error("No encontré Docker. Instalá Docker Desktop desde https://www.docker.com/products/docker-desktop");
                PausaSiInteractivo();
                return 1;
            }

            // --- Modos no interactivos (para automatizar y probar) ---
            if (TieneFlag(args, "--estado"))
            {
                bool sano = MostrarEstado();
                return sano ? 0 : 1;
            }
            if (TieneFlag(args, "--detener"))
            {
                DetenerTodo();
                return 0;
            }
            bool modoIniciar = TieneFlag(args, "--iniciar");

            // --- Arranque comun (interactivo y --iniciar) ---
            if (!AsegurarMotorDocker())
            {
                Error("El motor de Docker no respondió a tiempo. Abrí Docker Desktop a mano y volvé a intentar.");
                PausaSiInteractivo();
                return 1;
            }

            AsegurarEnv();

            Info("Levantando la pila en Docker (perfiles '" + PerfilServicios + "' y '" + PerfilMinio + "'). Esto puede tardar un rato la primera vez...");
            if (!ArrancarCompose())
            {
                Error("No se pudo arrancar la pila con 'docker compose up'. Mirá el detalle de arriba.");
                PausaSiInteractivo();
                return modoIniciar ? 1 : EntrarAlMenu(false);
            }

            bool listo = EsperarListo(240);
            bool sanoFinal = MostrarEstado();

            if (!sinNavegador)
            {
                Ok("Abriendo el navegador en " + UrlWeb + " ...");
                AbrirNavegador(UrlWeb);
            }

            if (modoIniciar)
            {
                return (listo && sanoFinal) ? 0 : 1;
            }

            return EntrarAlMenu(true);
        }

        // ============================ Deteccion de entorno ============================

        static bool DetectarProyecto()
        {
            // Empieza en la carpeta del .exe y sube por los padres buscando docker-compose.yml.
            string dir = AppDomain.CurrentDomain.BaseDirectory;
            try { dir = Path.GetFullPath(dir); }
            catch { }

            for (int i = 0; i < 8 && !string.IsNullOrEmpty(dir); i++)
            {
                try
                {
                    if (File.Exists(Path.Combine(dir, "docker-compose.yml")))
                    {
                        projectDir = dir;
                        Environment.CurrentDirectory = dir;
                        return true;
                    }
                    DirectoryInfo padre = Directory.GetParent(dir);
                    if (padre == null) break;
                    dir = padre.FullName;
                }
                catch { break; }
            }

            // Por si lo corren desde otra carpeta: probar tambien el directorio de trabajo actual.
            try
            {
                string cwd = Path.GetFullPath(Environment.CurrentDirectory);
                if (File.Exists(Path.Combine(cwd, "docker-compose.yml")))
                {
                    projectDir = cwd;
                    return true;
                }
            }
            catch { }

            return false;
        }

        static bool DetectarDocker()
        {
            // 1) Probar 'docker' tal cual (si esta en el PATH).
            string salida;
            if (Capturar("docker", "--version", out salida) == 0)
            {
                dockerExe = "docker";
                Ok("Docker detectado: " + PrimeraLinea(salida));
                return true;
            }
            // 2) Ruta tipica de Docker Desktop.
            string ruta = @"C:\Program Files\Docker\Docker\resources\bin\docker.exe";
            if (File.Exists(ruta) && Capturar(ruta, "--version", out salida) == 0)
            {
                dockerExe = ruta;
                Ok("Docker detectado: " + PrimeraLinea(salida));
                return true;
            }
            return false;
        }

        static bool AsegurarMotorDocker()
        {
            string salida;
            if (Capturar(dockerExe, "info", out salida) == 0)
            {
                Ok("El motor de Docker ya está en ejecución.");
                return true;
            }

            Aviso("El motor de Docker no responde. Intento abrir Docker Desktop...");
            string[] posibles = new string[]
            {
                @"C:\Program Files\Docker\Docker\Docker Desktop.exe",
                Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles), @"Docker\Docker\Docker Desktop.exe")
            };
            foreach (string exe in posibles)
            {
                if (File.Exists(exe))
                {
                    try
                    {
                        Process.Start(new ProcessStartInfo("explorer.exe", "\"" + exe + "\"") { UseShellExecute = true });
                        break;
                    }
                    catch { }
                }
            }

            Console.Write("Esperando a que Docker Desktop inicialice (hasta 180 s) ");
            DateTime limite = DateTime.Now.AddSeconds(180);
            while (DateTime.Now < limite)
            {
                Thread.Sleep(2000);
                Console.Write(".");
                if (Capturar(dockerExe, "info", out salida) == 0)
                {
                    Console.WriteLine();
                    Ok("Motor de Docker listo.");
                    return true;
                }
            }
            Console.WriteLine();
            return false;
        }

        static void AsegurarEnv()
        {
            string env = Path.Combine(projectDir, ".env");
            string ejemplo = Path.Combine(projectDir, ".env.example");

            if (File.Exists(env))
            {
                // El .env ya existe: NO se toca nunca.
                return;
            }
            if (File.Exists(ejemplo))
            {
                try
                {
                    File.Copy(ejemplo, env);
                    Aviso("Creé el archivo .env a partir de .env.example.");
                    Aviso("Abrí el .env y completá los secretos (contraseñas, sales y tokens) antes de usarlo en serio.");
                }
                catch (Exception ex)
                {
                    Aviso("No pude crear el .env automáticamente: " + ex.Message);
                }
            }
            else
            {
                Aviso("No hay .env ni .env.example en la carpeta del proyecto. Puede que la pila no arranque.");
            }
        }

        // ============================ Docker Compose ============================

        static string ComposeBase()
        {
            return "compose --profile " + PerfilServicios + " --profile " + PerfilMinio + " ";
        }

        static bool ArrancarCompose()
        {
            int code = ComposeUp();
            if (code != 0)
            {
                Aviso("Falló el arranque. Suele ser el montaje de la unidad " + LetraUnidad().ToUpperInvariant() + ": en Docker Desktop (WSL). Intento repararlo...");
                RepararMontajeWsl();
                Info("Reintento 'docker compose up'...");
                code = ComposeUp();
                if (code != 0)
                {
                    Aviso("Si vuelve a fallar: en Docker Desktop entrá a Settings > Resources > File sharing y compartí la unidad " + LetraUnidad().ToUpperInvariant() + ":, o mové el proyecto a C:.");
                }
            }
            return code == 0;
        }

        static int ComposeUp()
        {
            string salida;
            int code = Capturar(dockerExe, ComposeBase() + "up -d", out salida);
            if (!string.IsNullOrEmpty(salida))
            {
                foreach (string linea in Lineas(salida)) Console.WriteLine("  " + linea);
            }
            return code;
        }

        static string LetraUnidad()
        {
            try
            {
                string full = Path.GetFullPath(projectDir);
                if (full.Length >= 2 && full[1] == ':')
                {
                    return full.Substring(0, 1).ToLowerInvariant();
                }
            }
            catch { }
            return "c";
        }

        static void RepararMontajeWsl()
        {
            string l = LetraUnidad();
            string lMay = l.ToUpperInvariant();
            string sh =
                "umount -f -l /mnt/host/" + l + " 2>/dev/null; " +
                "mount -t drvfs " + lMay + ": /mnt/host/" + l + " 2>/dev/null; " +
                "mount --bind /mnt/host/" + l + " /tmp/docker-desktop-root/run/desktop/mnt/host/" + l + " 2>/dev/null";
            try
            {
                ProcessStartInfo psi = new ProcessStartInfo("wsl", "-d docker-desktop -e sh -c \"" + sh + "\"")
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    RedirectStandardOutput = true,
                    RedirectStandardError = true
                };
                using (Process p = Process.Start(psi))
                {
                    p.StandardOutput.ReadToEnd();
                    p.StandardError.ReadToEnd();
                    p.WaitForExit(8000);
                }
            }
            catch { }
        }

        // Lee el estado de todos los servicios de los perfiles. Devuelve service -> (state, health, exit).
        static Dictionary<string, string[]> LeerPs()
        {
            Dictionary<string, string[]> mapa = new Dictionary<string, string[]>(StringComparer.OrdinalIgnoreCase);
            string salida;
            Capturar(dockerExe, ComposeBase() + "ps --all --format \"{{.Service}}|{{.State}}|{{.Health}}|{{.ExitCode}}\"", out salida);
            foreach (string linea in Lineas(salida))
            {
                string[] partes = linea.Split('|');
                if (partes.Length >= 1 && partes[0].Length > 0 && partes[0].IndexOf(' ') < 0)
                {
                    string estado = partes.Length > 1 ? partes[1].Trim() : "";
                    string salud = partes.Length > 2 ? partes[2].Trim() : "";
                    string codigo = partes.Length > 3 ? partes[3].Trim() : "";
                    mapa[partes[0].Trim()] = new string[] { estado, salud, codigo };
                }
            }
            return mapa;
        }

        // Evalua si la pila esta lista. Llena 'faltan' con los servicios que todavia no estan bien.
        static bool EvaluarListo(Dictionary<string, string[]> ps, List<string> faltan)
        {
            foreach (string svc in ServiciosSanos)
            {
                if (!ps.ContainsKey(svc)) { faltan.Add(svc + " (todavía no aparece)"); continue; }
                string estado = ps[svc][0];
                string salud = ps[svc][1];
                if (!EsIgual(estado, "running")) { faltan.Add(svc + " (" + (estado.Length > 0 ? estado : "sin estado") + ")"); continue; }
                if (salud.Length > 0 && !EsIgual(salud, "healthy")) { faltan.Add(svc + " (" + salud + ")"); }
            }
            foreach (string job in Trabajos)
            {
                if (!ps.ContainsKey(job)) { faltan.Add(job + " (todavía no corrió)"); continue; }
                string estado = ps[job][0];
                string codigo = ps[job][2];
                if (!EsIgual(estado, "exited")) { faltan.Add(job + " (" + (estado.Length > 0 ? estado : "sin terminar") + ")"); continue; }
                if (codigo != "0") { faltan.Add(job + " (salió con código " + codigo + ")"); }
            }
            return faltan.Count == 0;
        }

        static bool EsperarListo(int segundos)
        {
            Info("Esperando a que todos los servicios estén listos (hasta " + segundos + " s)...");
            DateTime limite = DateTime.Now.AddSeconds(segundos);
            string ultimoReporte = "";
            while (DateTime.Now < limite)
            {
                List<string> faltan = new List<string>();
                bool listo = EvaluarListo(LeerPs(), faltan);
                if (listo)
                {
                    Ok("Todos los servicios están listos (migraciones ejecutadas y servicios sanos).");
                    return true;
                }
                string reporte = "Faltan: " + string.Join(", ", faltan.ToArray());
                if (reporte != ultimoReporte)
                {
                    Console.WriteLine("  " + reporte);
                    ultimoReporte = reporte;
                }
                else
                {
                    Console.Write(".");
                }
                Thread.Sleep(3000);
            }
            Console.WriteLine();
            Aviso("Se acabó la espera y algunos servicios siguen preparándose. Elegí 'Ver estado' en el menú para revisarlos.");
            return false;
        }

        // ============================ Estado ============================

        static bool MostrarEstado()
        {
            Dictionary<string, string[]> ps = LeerPs();
            List<string> faltan = new List<string>();
            bool listo = EvaluarListo(ps, faltan);

            Separador();
            Titulo("ESTADO DE MI CURICHI (LOCAL)");
            Separador();

            Console.WriteLine(" Mapa ciudadano (público): " + UrlWeb);
            Console.WriteLine(" Panel técnico:            " + UrlPanel);

            string apiPort = PuertoApiCore();
            string diag = DiagnosticoReady(apiPort);
            if (apiPort.Length > 0)
            {
                Console.WriteLine(" Diagnóstico api-core:     http://" + apiPort + "/ready  ->  " + diag);
            }
            else
            {
                Console.WriteLine(" Diagnóstico api-core:     (puerto no disponible)  ->  " + diag);
            }

            Console.WriteLine(Guion());
            Console.WriteLine(" Servicios:");
            List<string> todos = new List<string>();
            todos.AddRange(ServiciosSanos);
            todos.AddRange(Trabajos);
            foreach (string svc in todos)
            {
                string desc;
                if (!ps.ContainsKey(svc)) desc = "ausente";
                else
                {
                    string estado = ps[svc][0];
                    string salud = ps[svc][1];
                    string codigo = ps[svc][2];
                    if (EsIgual(estado, "exited")) desc = "terminó (código " + codigo + ")";
                    else if (salud.Length > 0) desc = estado + " / " + salud;
                    else desc = estado;
                }
                Console.WriteLine("   - " + svc.PadRight(16) + desc);
            }

            Console.WriteLine(Guion());
            // Solo en este equipo: el modo compartir no las muestra. Se puede entrar con el usuario
            // solo, sin @curichi.local. La contraseña sale del .env (SEED_*_PASSWORD) o, si no está,
            // del valor por defecto del seed, que es el nombre del rol.
            Console.WriteLine(" Cuentas para probar en este equipo (usuario / contraseña):");
            Console.WriteLine("   - Vecina (reportar):        vecina    / " + ClaveDeDesarrollo("VECINA", "vecina"));
            Console.WriteLine("   - Técnico (panel):          tecnico   / " + ClaveDeDesarrollo("TECNICO", "tecnico"));
            Console.WriteLine("   - Administrador (panel):    admin     / " + ClaveDeDesarrollo("ADMIN", "admin"));
            Console.WriteLine("   - Ejecutivo (/ejecutivo):   ejecutivo / " + ClaveDeDesarrollo("EJECUTIVO", "ejecutivo"));

            Console.WriteLine(Guion());
            if (listo) Ok("La pila está sana y lista para usar.");
            else Aviso("Todavía no está todo listo. Faltan: " + string.Join(", ", faltan.ToArray()));
            Separador();
            return listo;
        }

        /// <summary>
        /// La contraseña de una cuenta de desarrollo: SEED_&lt;ROL&gt;_PASSWORD del .env si está, si no el
        /// valor por defecto del seed. Solo lee el .env, nunca lo escribe.
        /// </summary>
        static string ClaveDeDesarrollo(string rol, string porDefecto)
        {
            try
            {
                string env = Path.Combine(projectDir, ".env");
                if (!File.Exists(env)) return porDefecto;
                string prefijo = "SEED_" + rol + "_PASSWORD=";
                foreach (string linea in File.ReadAllLines(env))
                {
                    string l = linea.Trim();
                    if (l.StartsWith(prefijo))
                    {
                        string valor = l.Substring(prefijo.Length).Trim().Trim('"', '\'');
                        return valor.Length > 0 ? valor : porDefecto;
                    }
                }
            }
            catch (Exception)
            {
                // Si no se puede leer el .env, se muestra el valor por defecto.
            }
            return porDefecto;
        }

        static string PuertoApiCore()
        {
            string salida;
            // 'port' no necesita los flags de perfil.
            if (Capturar(dockerExe, "compose port api-core 3001", out salida) == 0)
            {
                string p = PrimeraLinea(salida).Trim();
                if (p.Length > 0 && p.IndexOf(':') > 0) return p;
            }
            return "";
        }

        static string DiagnosticoReady(string hostPort)
        {
            if (string.IsNullOrEmpty(hostPort)) return "no disponible";
            try
            {
                HttpWebRequest req = (HttpWebRequest)WebRequest.Create("http://" + hostPort + "/ready");
                req.Timeout = 3000;
                req.Method = "GET";
                using (HttpWebResponse resp = (HttpWebResponse)req.GetResponse())
                {
                    int code = (int)resp.StatusCode;
                    string cuerpo = LeerCuerpo(resp);
                    if (cuerpo.IndexOf("\"degradado\":true", StringComparison.OrdinalIgnoreCase) >= 0)
                        return "responde (HTTP " + code + ", degradado)";
                    return "lista (HTTP " + code + ")";
                }
            }
            catch (WebException wex)
            {
                HttpWebResponse r = wex.Response as HttpWebResponse;
                if (r != null) return "con problemas (HTTP " + (int)r.StatusCode + ")";
                return "no responde";
            }
            catch
            {
                return "no responde";
            }
        }

        static string LeerCuerpo(HttpWebResponse resp)
        {
            try
            {
                using (StreamReader sr = new StreamReader(resp.GetResponseStream()))
                {
                    string t = sr.ReadToEnd();
                    return t.Length > 400 ? t.Substring(0, 400) : t;
                }
            }
            catch { return ""; }
        }

        // ============================ Menu interactivo ============================

        static int EntrarAlMenu(bool pilaArriba)
        {
            while (true)
            {
                Console.WriteLine();
                Separador();
                Titulo("MENÚ DE MI CURICHI");
                Separador();
                Console.WriteLine("  1) Abrir el mapa ciudadano");
                Console.WriteLine("  2) Abrir el panel técnico");
                Console.WriteLine("  3) Ver estado de los servicios");
                Console.WriteLine("  4) Ver los últimos registros (logs)");
                Console.WriteLine("  5) Actualizar con los últimos cambios del código (tarda)");
                Console.WriteLine("  6) Compartir con amigos por Internet (túneles)");
                Console.WriteLine("  7) Dejar de compartir");
                Console.WriteLine("  8) Correr las pruebas automáticas (E2E)");
                Console.WriteLine("  9) Detener todo");
                Console.WriteLine("  0) Salir");
                Separador();
                Console.Write("Elegí una opción [0-9]: ");

                string opc = LeerOpcion();
                Console.WriteLine();

                if (opc == "1") AbrirNavegador(UrlWeb);
                else if (opc == "2") AbrirNavegador(UrlPanel);
                else if (opc == "3") MostrarEstado();
                else if (opc == "4") VerLogs();
                else if (opc == "5") ActualizarConBuild();
                else if (opc == "6") CompartirConAmigos();
                else if (opc == "7") DejarDeCompartir();
                else if (opc == "8") CorrerE2E();
                else if (opc == "9") DetenerTodo();
                else if (opc == "0")
                {
                    if (tuneles.Count > 0)
                    {
                        Aviso("Tenés túneles abiertos: al salir se cierran y tus amigos pierden el acceso.");
                        CerrarTuneles();
                    }
                    Ok("Listo. Los contenedores quedan corriendo en segundo plano. ¡Hasta luego!");
                    return 0;
                }
                else Aviso("Opción no válida.");
            }
        }

        static void VerLogs()
        {
            Info("Últimos registros (no se quedan en vivo):");
            EjecutarVisible(dockerExe, ComposeBase() + "logs --tail=80");
        }

        static void ActualizarConBuild()
        {
            Aviso("Esto reconstruye las imágenes con los últimos cambios del código. Puede tardar varios minutos y usa bastante memoria.");
            Console.Write("¿Seguimos? [s/N]: ");
            string r = LeerOpcion();
            if (!(r.StartsWith("s") || r.StartsWith("S") || r.StartsWith("y") || r.StartsWith("Y")))
            {
                Info("Cancelado.");
                return;
            }
            Info("Reconstruyendo y levantando. Mirá el progreso abajo...");
            EjecutarVisible(dockerExe, ComposeBase() + "up -d --build");
            EsperarListo(240);
            MostrarEstado();
        }

        static void CorrerE2E()
        {
            string script = Path.Combine(projectDir, Path.Combine("e2e", Path.Combine("scripts", "correr-local.mjs")));
            if (!File.Exists(script))
            {
                Aviso("No encontré el script de pruebas en e2e/scripts/correr-local.mjs. Puede que todavía no exista en este proyecto.");
                return;
            }
            Console.Write("¿Qué grupo querés correr? [G1, G2, G3, G4, G5 o todos] (Enter = todos): ");
            string grupo = LeerLinea();
            if (string.IsNullOrEmpty(grupo)) grupo = "todos";
            Info("Corriendo las pruebas del grupo '" + grupo + "'. Mirá el resultado abajo...");
            EjecutarVisible("node", "e2e/scripts/correr-local.mjs --grupo " + grupo);
        }

        static void DetenerTodo()
        {
            Info("Deteniendo los contenedores (quedan guardados, no se borra nada)...");
            string salida;
            Capturar(dockerExe, ComposeBase() + "stop", out salida);
            if (!string.IsNullOrEmpty(salida))
            {
                foreach (string linea in Lineas(salida)) Console.WriteLine("  " + linea);
            }
            Ok("Contenedores detenidos. Para volver a levantarlos, abrí de nuevo Mi-Curichi.exe.");
        }

        // ============================ Compartir con amigos (tuneles) ============================

        static void CompartirConAmigos()
        {
            if (tuneles.Count > 0)
            {
                Aviso("Ya tenés túneles abiertos. Usá 'Dejar de compartir' primero si querés nuevos enlaces.");
                return;
            }

            string cf = BuscarCloudflared();
            if (string.IsNullOrEmpty(cf))
            {
                Error("No encontré cloudflared. Instalalo (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) o ponelo en el PATH.");
                return;
            }

            string carpetaLogs = Path.Combine(
                Path.Combine(Path.GetTempPath(), "mi-curichi-tuneles"),
                DateTime.Now.ToString("yyyy-MM-dd_HH-mm-ss", CultureInfo.InvariantCulture));
            try { Directory.CreateDirectory(carpetaLogs); }
            catch (Exception ex) { Error("No pude crear la carpeta de registros: " + ex.Message); return; }

            string logWeb = Path.Combine(carpetaLogs, "web.log");
            string logPanel = Path.Combine(carpetaLogs, "panel.log");

            AsegurarJob();

            Info("Creando los túneles HTTPS con Cloudflare...");
            Process pWeb = LanzarTunel(cf, "localhost", logWeb);
            Process pPanel = LanzarTunel(cf, "panel.localhost", logPanel);
            if (pWeb == null || pPanel == null)
            {
                Error("No pude lanzar cloudflared.");
                DejarDeCompartir();
                return;
            }

            Console.Write("Conectando con la red de Cloudflare ");
            string urlWeb = EsperarUrl(logWeb, 30);
            string urlPanel = EsperarUrl(logPanel, 30);
            Console.WriteLine();

            Separador();
            Titulo("MI CURICHI YA ESTÁ EN LÍNEA PARA TUS AMIGOS");
            Separador();
            Console.WriteLine(" Mapa ciudadano (para reportar y ver puntos):");
            Console.WriteLine("   " + (urlWeb != null ? urlWeb : "(no pude leer el enlace; revisá " + logWeb + ")"));
            Console.WriteLine();
            Console.WriteLine(" Panel técnico (validar, exportar, capas):");
            Console.WriteLine("   " + (urlPanel != null ? urlPanel : "(no pude leer el enlace; revisá " + logPanel + ")"));
            Console.WriteLine(Guion());
            Console.WriteLine(" Para tener en cuenta:");
            Console.WriteLine("  - Cada amigo crea su propia cuenta en «Crear cuenta» dentro del mapa ciudadano.");
            Console.WriteLine("  - El panel técnico queda accesible desde Internet: NO compartas cuentas de técnico");
            Console.WriteLine("    ni admin con contraseñas simples mientras los túneles estén abiertos.");
            Console.WriteLine("  - El botón «Panel técnico» dentro de la web apunta a panel.localhost y no funciona");
            Console.WriteLine("    desde afuera: pasales el enlace del panel de arriba directamente (limitación conocida).");
            Console.WriteLine("  - Todos tus amigos llegan con la misma IP, así que comparten los límites por IP");
            Console.WriteLine("    (cantidad de cuentas nuevas por hora, freno de inicio de sesión, etc.).");
            Console.WriteLine(Guion());
            Ok("Los túneles quedan activos mientras este lanzador siga abierto. Usá 'Dejar de compartir' para cerrarlos.");
            Separador();
        }

        static Process LanzarTunel(string cf, string hostHeader, string logFile)
        {
            try
            {
                string args = "tunnel --url https://localhost:443 --no-tls-verify --http-host-header " + hostHeader + " --logfile \"" + logFile + "\"";
                ProcessStartInfo psi = new ProcessStartInfo(cf, args)
                {
                    UseShellExecute = false,
                    CreateNoWindow = true,
                    WorkingDirectory = projectDir
                };
                Process p = Process.Start(psi);
                AsignarAlJob(p);
                tuneles.Add(p);
                return p;
            }
            catch (Exception ex)
            {
                Error("No pude lanzar cloudflared: " + ex.Message);
                return null;
            }
        }

        static string EsperarUrl(string logFile, int segundos)
        {
            Regex rx = new Regex("https://[a-zA-Z0-9\\-\\.]+\\.trycloudflare\\.com");
            DateTime limite = DateTime.Now.AddSeconds(segundos);
            while (DateTime.Now < limite)
            {
                try
                {
                    if (File.Exists(logFile))
                    {
                        string contenido;
                        using (FileStream fs = new FileStream(logFile, FileMode.Open, FileAccess.Read, FileShare.ReadWrite))
                        using (StreamReader sr = new StreamReader(fs))
                        {
                            contenido = sr.ReadToEnd();
                        }
                        Match m = rx.Match(contenido);
                        if (m.Success) return m.Value;
                    }
                }
                catch { }
                Console.Write(".");
                Thread.Sleep(800);
            }
            return null;
        }

        static void DejarDeCompartir()
        {
            if (tuneles.Count == 0)
            {
                Info("No hay túneles abiertos.");
                return;
            }
            CerrarTuneles();
            Ok("Túneles cerrados. Tus amigos ya no tienen acceso.");
        }

        static void CerrarTuneles()
        {
            foreach (Process p in tuneles)
            {
                try { if (p != null && !p.HasExited) p.Kill(); }
                catch { }
            }
            tuneles.Clear();
        }

        static string BuscarCloudflared()
        {
            string fijo = @"C:\Program Files (x86)\cloudflared\cloudflared.exe";
            if (File.Exists(fijo)) return fijo;

            string path = Environment.GetEnvironmentVariable("PATH");
            if (!string.IsNullOrEmpty(path))
            {
                foreach (string dir in path.Split(';'))
                {
                    if (string.IsNullOrEmpty(dir)) continue;
                    try
                    {
                        string cand = Path.Combine(dir.Trim(), "cloudflared.exe");
                        if (File.Exists(cand)) return cand;
                    }
                    catch { }
                }
            }
            return "";
        }

        // ============================ Job Object (P/Invoke) ============================

        static void AsegurarJob()
        {
            if (hJob != IntPtr.Zero) return;
            try
            {
                hJob = CreateJobObject(IntPtr.Zero, null);
                if (hJob == IntPtr.Zero) return;

                JOBOBJECT_EXTENDED_LIMIT_INFORMATION ext = new JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
                ext.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;

                int tam = Marshal.SizeOf(typeof(JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
                IntPtr p = Marshal.AllocHGlobal(tam);
                try
                {
                    Marshal.StructureToPtr(ext, p, false);
                    SetInformationJobObject(hJob, JobObjectExtendedLimitInformation, p, (uint)tam);
                }
                finally
                {
                    Marshal.FreeHGlobal(p);
                }
            }
            catch
            {
                hJob = IntPtr.Zero;
            }
        }

        static void AsignarAlJob(Process p)
        {
            if (hJob == IntPtr.Zero || p == null) return;
            try { AssignProcessToJobObject(hJob, p.Handle); }
            catch { }
        }

        const int JobObjectExtendedLimitInformation = 9;
        const uint JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE = 0x2000;

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }

        [DllImport("kernel32.dll", CharSet = CharSet.Unicode)]
        static extern IntPtr CreateJobObject(IntPtr lpJobAttributes, string lpName);

        [DllImport("kernel32.dll")]
        static extern bool SetInformationJobObject(IntPtr hJob, int infoClass, IntPtr lpInfo, uint cbInfoLength);

        [DllImport("kernel32.dll")]
        static extern bool AssignProcessToJobObject(IntPtr hJob, IntPtr hProcess);

        [DllImport("kernel32.dll", SetLastError = true)]
        static extern bool CloseHandle(IntPtr hObject);

        // ============================ Utilidades de proceso y salida ============================

        static int Capturar(string file, string args, out string salida)
        {
            ProcessStartInfo psi = new ProcessStartInfo(file, args)
            {
                WorkingDirectory = string.IsNullOrEmpty(projectDir) ? Environment.CurrentDirectory : projectDir,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            try
            {
                using (Process p = Process.Start(psi))
                {
                    string stdout = p.StandardOutput.ReadToEnd();
                    string stderr = p.StandardError.ReadToEnd();
                    p.WaitForExit();
                    salida = stdout;
                    if (!string.IsNullOrEmpty(stderr))
                    {
                        if (salida.Length > 0) salida += "\n";
                        salida += stderr;
                    }
                    return p.ExitCode;
                }
            }
            catch (Exception ex)
            {
                salida = ex.Message;
                return -1;
            }
        }

        static int EjecutarVisible(string file, string args)
        {
            ProcessStartInfo psi = new ProcessStartInfo(file, args)
            {
                WorkingDirectory = string.IsNullOrEmpty(projectDir) ? Environment.CurrentDirectory : projectDir,
                UseShellExecute = false
            };
            try
            {
                using (Process p = Process.Start(psi))
                {
                    p.WaitForExit();
                    return p.ExitCode;
                }
            }
            catch (Exception ex)
            {
                Error("No pude ejecutar: " + ex.Message);
                return -1;
            }
        }

        static void AbrirNavegador(string url)
        {
            try { Process.Start(new ProcessStartInfo(url) { UseShellExecute = true }); }
            catch (Exception ex) { Aviso("No pude abrir el navegador: " + ex.Message + ". Abrí a mano " + url); }
        }

        // ============================ Entrada de usuario ============================

        static string LeerOpcion()
        {
            try
            {
                if (Console.IsInputRedirected)
                {
                    string l = Console.ReadLine();
                    return l == null ? "0" : l.Trim();
                }
                ConsoleKeyInfo k = Console.ReadKey(true);
                return k.KeyChar.ToString();
            }
            catch
            {
                return "0";
            }
        }

        static string LeerLinea()
        {
            try
            {
                string l = Console.ReadLine();
                return l == null ? "" : l.Trim();
            }
            catch { return ""; }
        }

        static void PausaSiInteractivo()
        {
            try
            {
                if (!Console.IsInputRedirected)
                {
                    Console.WriteLine();
                    Console.WriteLine("Presioná una tecla para cerrar...");
                    Console.ReadKey(true);
                }
            }
            catch { }
        }

        // ============================ Texto / formato ============================

        static bool TieneFlag(string[] args, string flag)
        {
            foreach (string a in args)
            {
                if (EsIgual(a, flag)) return true;
            }
            return false;
        }

        static bool EsIgual(string a, string b)
        {
            return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        }

        static IEnumerable<string> Lineas(string texto)
        {
            if (string.IsNullOrEmpty(texto)) yield break;
            string[] partes = texto.Split(new char[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries);
            foreach (string p in partes) yield return p;
        }

        static string PrimeraLinea(string texto)
        {
            foreach (string l in Lineas(texto)) return l;
            return "";
        }

        static void Banner()
        {
            Separador();
            Titulo("MI CURICHI - LANZADOR LOCAL");
            Separador();
            Console.WriteLine();
        }

        static void Separador()
        {
            Console.WriteLine("================================================================================");
        }

        static string Guion()
        {
            return "--------------------------------------------------------------------------------";
        }

        static void Titulo(string t)
        {
            Console.WriteLine("  " + t);
        }

        static void Info(string msg) { Escribir("[INFO] ", ConsoleColor.Cyan, msg); }
        static void Ok(string msg) { Escribir("[ OK ] ", ConsoleColor.Green, msg); }
        static void Aviso(string msg) { Escribir("[AVISO] ", ConsoleColor.Yellow, msg); }
        static void Error(string msg) { Escribir("[ERROR] ", ConsoleColor.Red, msg); }

        static void Escribir(string etiqueta, ConsoleColor color, string msg)
        {
            try { Console.ForegroundColor = color; }
            catch { }
            Console.Write(etiqueta);
            try { Console.ResetColor(); }
            catch { }
            Console.WriteLine(msg);
        }

        static void MostrarAyuda()
        {
            Console.WriteLine("Mi Curichi - Lanzador local");
            Console.WriteLine();
            Console.WriteLine("Doble clic en Mi-Curichi.exe levanta toda la pila en Docker y abre un menú.");
            Console.WriteLine();
            Console.WriteLine("Uso desde la consola:");
            Console.WriteLine("  Mi-Curichi.exe                  Arranca la pila y abre el menú interactivo.");
            Console.WriteLine("  Mi-Curichi.exe --iniciar        Arranca, espera a que esté sana y sale (sin menú).");
            Console.WriteLine("  Mi-Curichi.exe --iniciar --sin-navegador");
            Console.WriteLine("                                  Igual que --iniciar pero no abre el navegador.");
            Console.WriteLine("  Mi-Curichi.exe --estado         Muestra el estado y sale con 0 si todo está sano, 1 si no.");
            Console.WriteLine("  Mi-Curichi.exe --detener        Detiene los contenedores (sin borrar nada) y sale.");
            Console.WriteLine("  Mi-Curichi.exe --ayuda          Muestra esta ayuda.");
            Console.WriteLine();
            Console.WriteLine("Direcciones:");
            Console.WriteLine("  Mapa ciudadano: " + UrlWeb);
            Console.WriteLine("  Panel técnico:  " + UrlPanel);
            Console.WriteLine();
            Console.WriteLine("Nunca borra datos: no hace 'docker compose down' ni toca los volúmenes ni el .env existente.");
        }
    }
}
