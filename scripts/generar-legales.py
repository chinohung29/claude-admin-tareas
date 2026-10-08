#!/usr/bin/env python3
"""Genera pwa/privacidad.html y pwa/terminos.html desde docs/legal/*.md (borradores: los datos a completar salen resaltados)."""
import html, re, sys
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MARCAS = r'(\[[^\]]*(?:A COMPLETAR|FECHA|CUIL|CUIT|DOMICILIO|EMAIL|NOMBRE|PLAZO|DEFINIR|CONFIRMAR|VERIFICAR|PROVEEDOR|UBICACIÓN|ENLACE|IVA|N° DE|POR EJEMPLO|ABOGADO|CONTADOR)[^\]]*\])'

def md2html(md):
    out, in_ul, in_tbl, para = [], False, False, []
    def inline(t):
        t = html.escape(t, quote=False)
        t = re.sub(r'\*\*(.+?)\*\*', r'<b>\1</b>', t)
        return re.sub(MARCAS, r'<mark>\1</mark>', t)
    def flush():
        nonlocal para
        if para: out.append('<p>' + inline(' '.join(para)) + '</p>'); para = []
    def close_ul():
        nonlocal in_ul
        if in_ul: out.append('</ul>'); in_ul = False
    def close_tbl():
        nonlocal in_tbl
        if in_tbl: out.append('</tbody></table>'); in_tbl = False
    for ln in md.split('\n'):
        s = ln.rstrip()
        if s.startswith('|'):
            flush(); close_ul()
            cells = [c.strip() for c in s.strip('|').split('|')]
            if all(re.fullmatch(r'-+', c) for c in cells): continue
            if not in_tbl:
                out.append('<table><thead><tr>' + ''.join('<th>' + inline(c) + '</th>' for c in cells) + '</tr></thead><tbody>'); in_tbl = True
            else:
                out.append('<tr>' + ''.join('<td>' + inline(c) + '</td>' for c in cells) + '</tr>')
            continue
        close_tbl()
        if not s: flush(); close_ul(); continue
        if s.startswith('# '): flush(); close_ul(); out.append('<h1>' + inline(s[2:]) + '</h1>'); continue
        if s.startswith('## '): flush(); close_ul(); out.append('<h2>' + inline(s[3:]) + '</h2>'); continue
        if s.startswith('> '): flush(); close_ul(); out.append('<p class="borrador">' + inline(s[2:]) + '</p>'); continue
        m = re.match(r'^(?:- |\d+\. )(.*)', s)
        if m:
            flush()
            if not in_ul: out.append('<ul>'); in_ul = True
            out.append('<li>' + inline(m.group(1)) + '</li>'); continue
        para.append(s)
    flush(); close_ul(); close_tbl()
    return '\n'.join(out)

PLANTILLA = '''<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>%(t)s</title>
<meta name="robots" content="noindex">
<link rel="stylesheet" href="styles.css">
</head>
<body class="legal">
<div class="wrap">
<p class="meta"><a href="./">&larr; Volver a la app</a> · <a href="%(o)s">%(on)s</a></p>
%(body)s
</div>
</body>
</html>
'''

for src, dst, t, o, on in [
    ('docs/legal/politica-de-privacidad.md', 'pwa/privacidad.html', 'Política de Privacidad', 'terminos.html', 'Términos y Condiciones'),
    ('docs/legal/terminos-y-condiciones.md', 'pwa/terminos.html', 'Términos y Condiciones', 'privacidad.html', 'Política de Privacidad'),
]:
    body = md2html((RAIZ / src).read_text(encoding='utf8'))
    (RAIZ / dst).write_text(PLANTILLA % dict(t=t, o=o, on=on, body=body), encoding='utf8')
    print(dst, len(body), 'caracteres,', body.count('<mark>'), 'datos a completar')
