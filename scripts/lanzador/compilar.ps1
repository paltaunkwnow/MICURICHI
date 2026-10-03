<#
.SYNOPSIS
    Compila el lanzador Mi-Curichi.exe a partir de scripts/lanzador/MiCurichi.cs.

.DESCRIPTION
    Usa el compilador de C# que viene con .NET Framework 4 (csc.exe en
    C:\Windows\Microsoft.NET\Framework64\v4.0.30319), que está en toda instalación de
    Windows 10/11, así que no hace falta instalar nada. El binario resultante queda en la
    raíz del repositorio como Mi-Curichi.exe y NO se versiona (está en .gitignore): se
    regenera con este script.

    Doble clic en el .exe, o desde PowerShell:
        powershell -ExecutionPolicy Bypass -File scripts\lanzador\compilar.ps1
#>

$ErrorActionPreference = "Stop"

# Carpetas
$scriptDir = $PSScriptRoot
$repoRoot = (Resolve-Path (Join-Path $scriptDir "..\..")).Path
$fuente = Join-Path $scriptDir "MiCurichi.cs"
$salida = Join-Path $repoRoot "Mi-Curichi.exe"

if (-not (Test-Path $fuente)) {
    Write-Host "[ERROR] No encontré el código fuente: $fuente" -ForegroundColor Red
    exit 1
}

# Compilador csc.exe de .NET Framework 4 (presente en Windows sin instalar nada).
$csc = "C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path $csc)) {
    $csc = "C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
}
if (-not (Test-Path $csc)) {
    Write-Host "[ERROR] No encontré csc.exe (.NET Framework 4). Esperado en:" -ForegroundColor Red
    Write-Host "        C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe" -ForegroundColor Red
    exit 1
}

# Ícono propio opcional: si hay un .ico en las carpetas public/app de alguna de las apps, se usa.
$icono = $null
$posiblesIco = @(
    (Join-Path $repoRoot "apps\web-ciudadano\public"),
    (Join-Path $repoRoot "apps\web-ciudadano\src\app"),
    (Join-Path $repoRoot "apps\panel-admin\public"),
    (Join-Path $repoRoot "apps\panel-admin\src\app")
)
foreach ($carpeta in $posiblesIco) {
    if (Test-Path $carpeta) {
        $ico = Get-ChildItem -Path $carpeta -Filter *.ico -File -ErrorAction SilentlyContinue | Select-Object -First 1
        if ($ico) { $icono = $ico.FullName; break }
    }
}

# Argumentos de compilación.
$argumentos = @(
    "/target:exe",
    "/optimize+",
    "/nologo",
    "/out:`"$salida`""
)
if ($icono) {
    Write-Host "[INFO] Usando ícono propio: $icono" -ForegroundColor Cyan
    $argumentos += "/win32icon:`"$icono`""
} else {
    Write-Host "[INFO] Sin ícono propio (no hay ningún .ico en las apps); se compila sin ícono." -ForegroundColor Cyan
}
$argumentos += "`"$fuente`""

Write-Host "[INFO] Compilando Mi-Curichi.exe ..." -ForegroundColor Cyan
& $csc @argumentos
if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] La compilación falló (código $LASTEXITCODE)." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host "[ OK ] Compilado: $salida" -ForegroundColor Green
Write-Host "       Hacé doble clic en Mi-Curichi.exe para levantar el proyecto." -ForegroundColor Green
exit 0
