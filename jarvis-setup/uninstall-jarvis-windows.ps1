# Desinstalador de OpenJarvis para Windows
# Borra: carpeta jarvis, configuración .openjarvis, Ollama y sus modelos, Python 3.13 (winget)
# y las cachés de Hugging Face y uv. NO toca Git, uv ni Node.js.
# Uso:
#   powershell -ExecutionPolicy Bypass -File .\uninstall-jarvis-windows.ps1
#   (agrega -JarvisDir "D:\ruta\jarvis" si no está en C:\Users\TU_USUARIO\jarvis)
#   (agrega -SoloMostrar para ver qué borraría, sin borrar nada)
param(
    [string]$JarvisDir = (Join-Path $HOME "jarvis"),
    [switch]$SoloMostrar
)

$ErrorActionPreference = "Continue"

function Say($m)  { Write-Host "`n==> $m" -ForegroundColor Cyan }
function Warn($m) { Write-Host "    AVISO: $m" -ForegroundColor Yellow }

function Remove-Safe([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return }
    # Protección: nunca borrar la raíz de un disco ni la carpeta de usuario completa
    $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    if ($full.Length -le 3 -or $full -eq $HOME.TrimEnd('\') -or $full -eq $env:LOCALAPPDATA.TrimEnd('\')) {
        Warn "Ruta protegida, no borro: $full"; return
    }
    if (-not (Test-Path -LiteralPath $full)) { Write-Host "    (no existe) $full"; return }
    if ($SoloMostrar) { Write-Host "    [simulación] borraría $full"; return }
    Remove-Item -LiteralPath $full -Recurse -Force -ErrorAction Continue
    if (Test-Path -LiteralPath $full) { Warn "No pude borrar todo en $full (algún archivo está en uso). Cierra programas y reintenta." }
    else { Write-Host "    Borrado: $full" }
}

function Folder-GB([string]$Path) {
    if (-not (Test-Path -LiteralPath $Path)) { return 0 }
    $s = (Get-ChildItem -LiteralPath $Path -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum
    return [math]::Round(($s / 1GB), 2)
}

$Targets = @(
    $JarvisDir,
    (Join-Path $HOME ".openjarvis"),
    (Join-Path $HOME ".ollama"),
    (Join-Path $HOME ".cache\huggingface"),
    (Join-Path $env:LOCALAPPDATA "Ollama")
)

Say "Esto es lo que voy a borrar:"
$total = 0
foreach ($t in $Targets) {
    $gb = Folder-GB $t
    $total += $gb
    $estado = if (Test-Path -LiteralPath $t) { "$gb GB" } else { "no existe" }
    Write-Host ("    {0}  [{1}]" -f $t, $estado)
}
Write-Host "    + Ollama y Python 3.13 (desinstalados con winget), caché de uv y variable UV_PYTHON_PREFERENCE"
Write-Host "    Espacio aproximado a liberar: $total GB (más los programas)"
Write-Host "    NO se toca: Git, uv, Node.js ni la carpeta claude-admin-tareas (scripts)."

if ($SoloMostrar) { Write-Host "`nModo -SoloMostrar: no se borró nada."; return }

$resp = Read-Host "`nEscribe SI (en mayúsculas) para continuar"
if ($resp -cne "SI") { Write-Host "Cancelado. No se borró nada."; return }

Say "Paso 1: voy a cerrar Ollama y cualquier proceso de Jarvis que siga corriendo."
foreach ($n in "ollama", "ollama app", "ollama_llama_server") {
    Get-Process -Name $n -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
}
# Procesos de Python/uv que corran desde la carpeta jarvis
Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
    Where-Object { $_.ExecutablePath -and $_.ExecutablePath -like "$JarvisDir*" } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 2

Say "Paso 2: voy a desinstalar Ollama y Python 3.13 con winget."
winget uninstall -e --id Ollama.Ollama --silent
winget uninstall -e --id Python.Python.3.13 --silent

Say "Paso 3: voy a borrar las carpetas de Jarvis, modelos y cachés."
foreach ($t in $Targets) { Remove-Safe $t }
if (Get-Command uv -ErrorAction SilentlyContinue) { uv cache clean 2>$null }

Say "Paso 4: voy a quitar la variable UV_PYTHON_PREFERENCE si existe."
[Environment]::SetEnvironmentVariable("UV_PYTHON_PREFERENCE", $null, "User")
Remove-Item Env:\UV_PYTHON_PREFERENCE -ErrorAction SilentlyContinue

Say "Listo. Cierra esta terminal. Para empezar de cero abre una nueva y corre el instalador:"
Write-Host "    powershell -ExecutionPolicy Bypass -File .\claude-admin-tareas\jarvis-setup\install-jarvis-windows.ps1"
