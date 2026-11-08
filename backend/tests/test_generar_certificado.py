"""Pruebas de conversión de certificados sin invocar LibreOffice ni Supabase."""
import base64
import importlib.util
import os
import pathlib
import sys
import types
import unittest
from unittest.mock import patch

# La conversión unitaria no necesita instalar python-pptx.
sys.modules.setdefault("pptx", types.SimpleNamespace(Presentation=None))
SCRIPT = pathlib.Path(__file__).resolve().parents[1] / "generar_certificado.py"
spec = importlib.util.spec_from_file_location("korva_generar_certificado_test", SCRIPT)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ConversionPdfTest(unittest.TestCase):
    def test_pdf_generado_con_perfil_aislado(self):
        llamadas = []

        def convertir(cmd, **kwargs):
            llamadas.append(cmd)
            self.assertTrue(kwargs["capture_output"])
            self.assertTrue(kwargs["text"])
            self.assertEqual(kwargs["timeout"], 60)
            self.assertTrue(any(a.startswith("-env:UserInstallation=file://") for a in cmd))
            self.assertEqual(cmd[-3], "--outdir")
            output = pathlib.Path(cmd[-2]) / "certificado.pdf"
            output.write_bytes(b"%PDF-1.4\nprueba")
            return types.SimpleNamespace(returncode=0, stdout="", stderr="")

        with patch.object(mod.subprocess, "run", side_effect=convertir):
            result = mod.pptx_a_pdf_base64(b"pptx-ficticio", "certificado")
        self.assertEqual(base64.b64decode(result), b"%PDF-1.4\nprueba")
        self.assertEqual(len(llamadas), 1)

    def test_no_anuncia_exito_si_libreoffice_no_crea_pdf(self):
        with patch.object(mod.subprocess, "run", return_value=types.SimpleNamespace(
            returncode=0, stderr="No se generó salida", stdout=""
        )):
            with self.assertRaisesRegex(RuntimeError, "archivo_creado=False"):
                mod.pptx_a_pdf_base64(b"pptx", "certificado")

    def test_muestra_error_original_si_libreoffice_falla(self):
        with patch.object(mod.subprocess, "run", return_value=types.SimpleNamespace(
            returncode=1, stderr="Error de conversión de prueba", stdout=""
        )):
            with self.assertRaisesRegex(RuntimeError, "Error de conversión de prueba"):
                mod.pptx_a_pdf_base64(b"pptx", "certificado")

    def test_cada_invocacion_usa_perfil_distinto(self):
        perfiles = []
        def convertir(cmd, **_):
            perfiles.append(next(a for a in cmd if a.startswith("-env:UserInstallation=")))
            pathlib.Path(cmd[-2], "certificado.pdf").write_bytes(b"%PDF")
            return types.SimpleNamespace(returncode=0, stderr="", stdout="")
        with patch.object(mod.subprocess, "run", side_effect=convertir):
            mod.pptx_a_pdf_base64(b"pptx", "certificado")
            mod.pptx_a_pdf_base64(b"pptx", "certificado")
        self.assertNotEqual(perfiles[0], perfiles[1])


if __name__ == "__main__":
    unittest.main()
