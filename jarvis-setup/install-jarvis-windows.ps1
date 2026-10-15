# Instalador de OpenJarvis para Windows (voz en español)
# Uso (PowerShell, desde la carpeta donde quieres que quede "jarvis"):
#   powershell -ExecutionPolicy Bypass -File .\install-jarvis-windows.ps1
# Opcional: -Model gemma4:e2b  (si tu PC tiene poca memoria)
param(
    [string]$Model = "",
    [switch]$SkipModel
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Base = (Get-Location).Path
$JarvisDir = Join-Path $Base "jarvis"
$Resumen = [ordered]@{}

function Say($msg) { Write-Host "`n==> $msg" -ForegroundColor Cyan }
function Warn($msg) { Write-Host "    AVISO: $msg" -ForegroundColor Yellow }

function Refresh-Path {
    $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $u = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$m;$u"
}

function Explain-Error($text) {
    # Traduce causas comunes a español simple
    $t = $text.ToLower()
    if ($t -match "control de aplicaciones|application control|smart app control|blocked this file") { return "Windows (Smart App Control / Control de aplicaciones) bloquea el Python que descarga uv por no estar firmado. Uso el Python firmado de python.org." }
    if ($t -match "winget.*not recognized|'winget'") { return "Windows no tiene 'winget'. Instala 'App Installer' desde Microsoft Store y vuelve a correr el script." }
    if ($t -match "could not resolve|name or service|getaddrinfo|timed out|connection") { return "Problema de red: no se pudo descargar. Revisa tu internet o proxy y reintenta." }
    if ($t -match "no space left|not enough space|disk full") { return "No hay espacio suficiente en disco. Libera al menos 25 GB." }
    if ($t -match "msvc|microsoft visual c\+\+|link\.exe|failed to build|cl\.exe") { return "Falta un compilador de C++. Instala 'Build Tools for Visual Studio' (carga 'Desktop development with C++') y reintenta." }
    if ($t -match "espeak") { return "Kokoro no encuentra eSpeak NG. Ver el paso de respaldo de eSpeak en la guía." }
    if ($t -match "python.*(not found|no .*found)|requires-python") { return "No hay un Python compatible (3.10 a 3.13). uv lo descarga solo; revisa tu conexión." }
    if ($t -match "access is denied|permission") { return "Permisos insuficientes. Abre PowerShell como administrador o cierra programas que usen esos archivos." }
    return "No pude reconocer la causa. Lee el error de arriba; pégamelo y lo reviso."
}

function Invoke-Step([string]$Label, [scriptblock]$Block, [scriptblock]$Fix = $null) {
    try {
        & $Block
        if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Código de salida $LASTEXITCODE" }
    } catch {
        $err = $_.Exception.Message
        Write-Host "    FALLÓ: $Label" -ForegroundColor Red
        Write-Host "    Error: $err" -ForegroundColor Red
        Write-Host "    Causa probable: $(Explain-Error $err)" -ForegroundColor Yellow
        if ($Fix) {
            Write-Host "    Intentando corregir..." -ForegroundColor Yellow
            $global:LASTEXITCODE = 0
            & $Fix
            $global:LASTEXITCODE = 0
            & $Block
            if ($LASTEXITCODE -and $LASTEXITCODE -ne 0) { throw "Sigue fallando: $Label" }
        } else { throw }
    }
}

function Ensure-Tool($Cmd, $WingetId, $Nombre) {
    if (Get-Command $Cmd -ErrorAction SilentlyContinue) {
        Write-Host "    $Nombre ya está instalado."
        return
    }
    Write-Host "    Instalando $Nombre..."
    winget install -e --id $WingetId --accept-package-agreements --accept-source-agreements
    Refresh-Path
    if (-not (Get-Command $Cmd -ErrorAction SilentlyContinue)) {
        Warn "$Nombre se instaló pero no aparece en el PATH. Abre una terminal NUEVA y vuelve a correr este script."
    }
}

# ---------- 2. Herramientas (antes que el clon, porque se necesita Git) ----------
Say "Etapa 2: voy a verificar e instalar Git, uv, Node.js (>= 22.22) y Ollama con winget."
Ensure-Tool "git"    "Git.Git"           "Git"
Ensure-Tool "uv"     "astral-sh.uv"      "uv"
Ensure-Tool "node"   "OpenJS.NodeJS.LTS" "Node.js"
Ensure-Tool "ollama" "Ollama.Ollama"     "Ollama"
Refresh-Path

$nodeOk = $false
try {
    $v = [version]((node --version).TrimStart("v"))
    $nodeOk = ($v -ge [version]"22.22.0")
    Write-Host "    Node detectado: $v"
} catch {}
if (-not $nodeOk) {
    Warn "Node es más viejo que 22.22 o no responde. Actualizando..."
    winget upgrade -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
    Refresh-Path
    try {
        $v = [version]((node --version).TrimStart("v"))
        if ($v -lt [version]"22.22.0") { Warn "Node sigue en $v. Abre una terminal nueva y reintenta; si persiste, instala Node 22.22+ desde nodejs.org." }
    } catch { Warn "Abre una terminal nueva para que Windows actualice el PATH y vuelve a correr el script." }
}
foreach ($c in "git","uv","node","npm","ollama") {
    if (-not (Get-Command $c -ErrorAction SilentlyContinue)) {
        throw "Falta '$c' en el PATH. Cierra esta terminal, abre una NUEVA y vuelve a correr el script."
    }
}
$Resumen["Herramientas"] = "git, uv, node, ollama"

# ---------- 1. Clonar ----------
Say "Etapa 1: voy a clonar OpenJarvis en la carpeta 'jarvis' y entrar en ella."
if (Test-Path (Join-Path $JarvisDir ".git")) {
    Warn "La carpeta 'jarvis' ya existe; la reutilizo."
} else {
    Invoke-Step "git clone" { git clone https://github.com/open-jarvis/OpenJarvis $JarvisDir }
}
Set-Location $JarvisDir
$Resumen["Carpeta"] = $JarvisDir

# ---------- 3. Dependencias Python ----------
Say "Etapa 3: voy a instalar las dependencias (incluye faster-whisper para escuchar y Kokoro para hablar). uv elige el Python 3.10-3.13."
Invoke-Step "uv sync" { uv sync --extra desktop --extra voice }

# Windows con Smart App Control bloquea el Python sin firmar que baja uv (falla _ctypes).
Say "Verificando que Windows deje correr el Python del proyecto."
$global:LASTEXITCODE = 0
uv run python -c "import ctypes" 2>$null
if ($LASTEXITCODE -ne 0) {
    Warn "Windows bloqueó el Python de uv (Control de aplicaciones). Instalo Python 3.13 firmado de python.org y rehago el entorno."
    winget install -e --id Python.Python.3.13 --accept-package-agreements --accept-source-agreements
    Refresh-Path
    $env:UV_PYTHON_PREFERENCE = "only-system"
    setx UV_PYTHON_PREFERENCE only-system | Out-Null
    if (Test-Path ".venv") { Remove-Item ".venv" -Recurse -Force }
    $global:LASTEXITCODE = 0
    Invoke-Step "uv sync (Python del sistema)" { uv sync --extra desktop --extra voice }
    $global:LASTEXITCODE = 0
    uv run python -c "import ctypes" 2>$null
    if ($LASTEXITCODE -ne 0) {
        throw "Windows sigue bloqueando Python. Revisa Seguridad de Windows > Control de aplicaciones y navegador > Smart App Control. Si tu PC es de empresa, pide a TI que permita Python."
    }
}

# ---------- 4. Modelo ----------
if ([string]::IsNullOrEmpty($Model)) {
    $ramGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB)
    if ($ramGB -lt 16) {
        $Model = "gemma4:e2b"
        Warn "Tu PC tiene $ramGB GB de RAM (<16). Uso gemma4:e2b (7,2 GB) en vez de gemma4:e4b."
    } else { $Model = "gemma4:e4b" }
}
Say "Etapa 4: voy a descargar el modelo local $Model (varios GB, puede tardar)."
if (-not $SkipModel) {
    # Asegurar que Ollama responde
    $up = $false
    try { Invoke-RestMethod http://localhost:11434/api/tags -TimeoutSec 3 | Out-Null; $up = $true } catch {}
    if (-not $up) {
        Write-Host "    Arrancando Ollama en segundo plano..."
        Start-Process ollama -ArgumentList "serve" -WindowStyle Hidden
        Start-Sleep -Seconds 5
    }
    Invoke-Step "ollama pull" { ollama pull $Model }
}
$Resumen["Modelo"] = $Model

# ---------- 5. Configuración ----------
Say "Etapa 5: voy a escribir la configuración base (motor ollama, perfil de seguridad personal)."
Invoke-Step "bootstrap" { uv run jarvis _bootstrap --write-config --engine ollama --model $Model }
Invoke-Step "security.profile" { uv run jarvis config set security.profile personal }

# ---------- 6. Voz en español ----------
Say "Etapa 6: voy a configurar la voz y el reconocimiento en español (eSpeak NG ya viene con el paso 3)."
Invoke-Step "voice_id" { uv run jarvis config set speech.voice_id ef_dora }
Invoke-Step "language" { uv run jarvis config set speech.language es }

# ---------- 7. Interfaz web ----------
Say "Etapa 7: voy a compilar la interfaz web (npm install y npm run build)."
Push-Location (Join-Path $JarvisDir "frontend")
try {
    Invoke-Step "npm install" { npm install }
    Invoke-Step "npm run build" { npm run build }
} finally { Pop-Location }

# ---------- 8. Validación ----------
Say "Etapa 8: voy a validar con 'jarvis doctor' y probar una pregunta de texto."
uv run jarvis doctor
$doctorCode = $LASTEXITCODE
if ($doctorCode -ne 0) {
    Warn "El doctor reportó problemas. Léelos arriba; si menciona eSpeak, haz esto y abre terminal nueva:"
    Write-Host '      winget install -e --id eSpeak-NG.eSpeak-NG'
    Write-Host '      setx PHONEMIZER_ESPEAK_LIBRARY "C:\Program Files\eSpeak NG\libespeak-ng.dll"'
}
uv run jarvis ask "En una frase, ¿quién eres?"
Write-Host "    La prueba de voz es interactiva; hazla tú: uv run jarvis chat --voice"

# ---------- 9. jarvis-show ----------
Say "Etapa 9: voy a instalar el comando jarvis-show (detector de dos aplausos) dentro de jarvis."
Copy-Item (Join-Path $ScriptDir "jarvis-show.py")  $JarvisDir -Force
Copy-Item (Join-Path $ScriptDir "jarvis-show.cmd") $JarvisDir -Force
New-Item -ItemType Directory -Force (Join-Path $JarvisDir "voz\assets") | Out-Null

# ---------- 10. Resumen ----------
Say "Etapa 10: resumen."
$gb = [math]::Round((Get-ChildItem $JarvisDir -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1GB, 2)
$ollamaDir = Join-Path $env:USERPROFILE ".ollama\models"
$ogb = 0
if (Test-Path $ollamaDir) { $ogb = [math]::Round((Get-ChildItem $ollamaDir -Recurse -Force -ErrorAction SilentlyContinue | Measure-Object Length -Sum).Sum / 1GB, 2) }
Write-Host "Instalado: $($Resumen['Herramientas']), OpenJarvis, modelo $($Resumen['Modelo'])"
Write-Host "Ubicación: $JarvisDir  (modelos de Ollama en $ollamaDir)"
Write-Host "Disco: proyecto $gb GB + modelos Ollama $ogb GB"
Write-Host ""
Write-Host "Comandos del día a día (desde $JarvisDir):"
Write-Host "  1) uv run jarvis start          -> servidor + interfaz web en http://localhost:8000"
Write-Host "  2) uv run jarvis chat --voice   -> conversar por voz"
Write-Host "  3) .\jarvis-show                -> arrancar todo con dos aplausos"
