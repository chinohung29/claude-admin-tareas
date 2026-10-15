@echo off
rem jarvis-show: espera dos aplausos y arranca OpenJarvis por voz.
rem Variables opcionales: JARVIS_CLAP_THRESH (sensibilidad), JARVIS_MIC (microfono)
cd /d "%~dp0"
uv run --with sounddevice --with numpy python jarvis-show.py %*
