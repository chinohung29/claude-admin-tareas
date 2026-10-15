# OpenJarvis en Windows con voz en español

Todo corre local. Si algún paso pide una clave de API, pon la variable en el archivo `.env` de `jarvis\` (nunca en el navegador).

## Instalar

1. Descarga esta carpeta `jarvis-setup` a tu PC (por ejemplo `C:\Users\TU_USUARIO\`).
2. Abre PowerShell **en la carpeta donde quieres que quede `jarvis`** y corre:

```powershell
powershell -ExecutionPolicy Bypass -File .\jarvis-setup\install-jarvis-windows.ps1
```

Si tu PC tiene menos de 16 GB de RAM el script elige solo `gemma4:e2b`. Puedes forzarlo con `-Model gemma4:e2b`.

El script avisa antes de cada etapa, instala con `winget` lo que falte, y si algo falla muestra el error y una causa en español. Si dice que falta algo en el PATH, abre una terminal nueva y vuélvelo a correr (es seguro repetirlo).

Si Kokoro se queja de eSpeak:

```powershell
winget install -e --id eSpeak-NG.eSpeak-NG
setx PHONEMIZER_ESPEAK_LIBRARY "C:\Program Files\eSpeak NG\libespeak-ng.dll"
```

Luego abre otra terminal.

## Uso diario (desde la carpeta `jarvis`)

| Comando | Qué hace |
|---|---|
| `uv run jarvis start` | Servidor y web en http://localhost:8000 |
| `uv run jarvis chat --voice` | Conversar por voz |
| `.\jarvis-show` | Esperar dos aplausos y arrancar todo |

## jarvis-show

Escucha el micrófono; con dos aplausos seguidos reproduce `voz\assets\jingle.mp3` (si existe), inicia el servidor si no está arriba, abre la web y lanza `uv run jarvis chat --voice`.

```powershell
cd jarvis
.\jarvis-show
```

### Ajustar la sensibilidad

`JARVIS_CLAP_THRESH` es el volumen de pico (0.0 a 1.0) que cuenta como aplauso. Por defecto `0.30`.

- No detecta tus aplausos: **baja** el valor (`0.15`).
- Se activa con ruido, voz o golpes: **sube** el valor (`0.5`).

```powershell
.\jarvis-show --calibrate          # muestra el nivel en vivo; aplaude y mira el pico
$env:JARVIS_CLAP_THRESH = "0.2"    # solo esta ventana
setx JARVIS_CLAP_THRESH 0.2        # permanente (abre terminal nueva)
```

### Elegir micrófono

```powershell
.\jarvis-show --list-mics
$env:JARVIS_MIC = "2"              # número, o parte del nombre: "USB"
```

Si no abre el micrófono, activa Configuración > Privacidad > Micrófono > "Permitir que las aplicaciones de escritorio accedan".

## Aviso

Estos scripts se escribieron sin poder ejecutarlos en Windows. Si el instalador o los aplausos fallan, copia el error completo y se corrige.
