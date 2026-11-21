"""Genera cuatro PDF con plantillas públicas y datos ficticios. Sin DB ni correos."""
import base64
import io
import json
from pathlib import Path
import subprocess
import sys
from urllib.request import urlopen

from pypdf import PdfReader

BASE = 'https://yvlpnshfqwkpcftotltb.supabase.co/storage/v1/object/public/korva-images/Plantillas/'
NOMBRE = 'Prueba Korva'
DORSAL = '0001'
BACKEND = Path(__file__).resolve().parents[1]
SALIDA = BACKEND / 'output' / 'pdf-prueba-desafios'


def descargar(nombre):
    with urlopen(BASE + nombre, timeout=45) as respuesta:
        datos = respuesta.read(10 * 1024 * 1024 + 1)
    if len(datos) > 10 * 1024 * 1024 or not datos.startswith(b'PK'):
        raise ValueError(f'Plantilla inválida: {nombre}')
    return base64.b64encode(datos).decode('ascii')


def generar():
    SALIDA.mkdir(parents=True, exist_ok=True)
    for desafio in ('CaminoSantiago', 'ViaAppia'):
        entrada = {
            'nombre': NOMBRE,
            'bib_number': DORSAL,
            'dorsal_template': descargar(f'Dorsales_{desafio}.pptx'),
            'postal_template': descargar(f'Postales_{desafio}.pptx'),
        }
        # Mismo programa de producción; no hay conversor alternativo para esta prueba.
        proceso = subprocess.run(
            [sys.executable, str(BACKEND / 'generar_bib_postal.py')],
            input=json.dumps(entrada), text=True, capture_output=True, timeout=150,
        )
        if proceso.returncode:
            raise RuntimeError(proceso.stderr[-3000:])
        resultado = json.loads(proceso.stdout)
        for tipo in ('dorsal', 'postal'):
            pdf = base64.b64decode(resultado[f'{tipo}_pdf'], validate=True)
            if not pdf.startswith(b'%PDF-'):
                raise ValueError(f'PDF inválido: {desafio}/{tipo}')
            lector = PdfReader(io.BytesIO(pdf))
            texto = ' '.join(' '.join(p.extract_text() or '' for p in lector.pages).split())
            if NOMBRE not in texto or '{{' in texto or '}}' in texto:
                raise ValueError(f'Nombre ausente o campos sin completar: {desafio}/{tipo}')
            if tipo == 'dorsal' and DORSAL not in texto:
                raise ValueError(f'Dorsal incorrecto: {desafio}')
            destino = SALIDA / f'{desafio}_{tipo}_PRUEBA.pdf'
            destino.write_bytes(pdf)
            print(f'OK: {destino.name} ({len(pdf)} bytes)')


if __name__ == '__main__':
    generar()
