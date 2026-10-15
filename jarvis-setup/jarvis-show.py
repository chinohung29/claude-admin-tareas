"""jarvis-show: espera dos aplausos y arranca OpenJarvis por voz.

Variables de entorno:
  JARVIS_CLAP_THRESH  Sensibilidad (pico de 0.0 a 1.0). Más bajo = más sensible.
                      Por defecto 0.30.
  JARVIS_MIC          Micrófono: número de dispositivo o parte del nombre.
                      Por defecto el micrófono predeterminado de Windows.

Opciones:
  --list-mics   Lista los micrófonos disponibles y sale.
  --calibrate   Muestra el nivel de sonido en vivo para elegir el umbral.
"""
import os
import socket
import subprocess
import sys
import time
import webbrowser
from pathlib import Path

import numpy as np
import sounddevice as sd

HERE = Path(__file__).resolve().parent
JINGLE = HERE / "voz" / "assets" / "jingle.mp3"
URL = "http://localhost:8000"
SAMPLE_RATE = 16000
BLOCK = 512  # ~32 ms
MIN_GAP = 0.15  # s mínimos entre aplausos (evita contar el eco)
MAX_GAP = 1.2   # s máximos entre el primero y el segundo


def pick_mic():
    raw = os.environ.get("JARVIS_MIC", "").strip()
    if not raw:
        return None
    if raw.isdigit():
        return int(raw)
    for i, d in enumerate(sd.query_devices()):
        if raw.lower() in d["name"].lower() and d["max_input_channels"] > 0:
            return i
    print(f"No encontré un micrófono que contenga '{raw}'. Usa --list-mics.")
    sys.exit(1)


def list_mics():
    for i, d in enumerate(sd.query_devices()):
        if d["max_input_channels"] > 0:
            print(f"  {i}: {d['name']}")


def get_threshold():
    try:
        return float(os.environ.get("JARVIS_CLAP_THRESH", "0.30"))
    except ValueError:
        print("JARVIS_CLAP_THRESH debe ser un número, por ejemplo 0.30")
        sys.exit(1)


def wait_for_double_clap(device, thresh, calibrate=False):
    last = None
    armed_until = 0.0
    with sd.InputStream(device=device, channels=1, samplerate=SAMPLE_RATE,
                        blocksize=BLOCK, dtype="float32") as stream:
        while True:
            data, _ = stream.read(BLOCK)
            peak = float(np.max(np.abs(data)))
            now = time.monotonic()
            if calibrate:
                print(f"\rnivel {peak:0.2f} " + "#" * int(peak * 40) + " " * 40, end="")
                continue
            if peak >= thresh and now >= armed_until:
                armed_until = now + MIN_GAP
                if last is not None and MIN_GAP <= now - last <= MAX_GAP:
                    return
                last = now
            elif last is not None and now - last > MAX_GAP:
                last = None


def play_jingle():
    if not JINGLE.exists():
        return
    ps = (
        "Add-Type -AssemblyName PresentationCore;"
        "$p=New-Object System.Windows.Media.MediaPlayer;"
        f"$p.Open([uri]'{JINGLE}');$p.Play();Start-Sleep -Milliseconds 500;"
        "while(-not $p.NaturalDuration.HasTimeSpan){Start-Sleep -Milliseconds 100};"
        "Start-Sleep -Seconds ([int]$p.NaturalDuration.TimeSpan.TotalSeconds+1)"
    )
    try:
        subprocess.Popen(["powershell", "-NoProfile", "-Command", ps],
                         creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0))
    except OSError as e:
        print(f"No pude reproducir el jingle: {e}")


def server_up():
    try:
        with socket.create_connection(("127.0.0.1", 8000), timeout=1):
            return True
    except OSError:
        return False


def main():
    if "--list-mics" in sys.argv:
        list_mics()
        return
    device = pick_mic()
    thresh = get_threshold()
    calibrate = "--calibrate" in sys.argv
    if calibrate:
        print("Calibración: aplaude y mira el nivel. Elige un umbral un poco menor al pico. Ctrl+C para salir.")
    else:
        print(f"Escuchando... da dos aplausos seguidos (umbral {thresh}). Ctrl+C para salir.")
    try:
        wait_for_double_clap(device, thresh, calibrate)
    except KeyboardInterrupt:
        print("\nCancelado.")
        return
    except sd.PortAudioError as e:
        print(f"No pude abrir el micrófono: {e}\n"
              "Revisa Configuración > Privacidad > Micrófono (permitir apps de escritorio) y usa --list-mics.")
        sys.exit(1)

    print("\nDos aplausos detectados.")
    play_jingle()
    if not server_up():
        print("Iniciando el servidor de OpenJarvis...")
        subprocess.Popen(["uv", "run", "jarvis", "start"], cwd=HERE,
                         creationflags=getattr(subprocess, "CREATE_NEW_CONSOLE", 0))
        for _ in range(40):
            if server_up():
                break
            time.sleep(0.5)
    webbrowser.open(URL)
    # El micrófono ya está liberado: chat --voice puede usarlo.
    sys.exit(subprocess.call(["uv", "run", "jarvis", "chat", "--voice"], cwd=HERE))


if __name__ == "__main__":
    main()
