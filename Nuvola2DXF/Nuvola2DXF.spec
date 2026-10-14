# -*- mode: python ; coding: utf-8 -*-
# Costruzione dell'eseguibile:  pyinstaller --noconfirm Nuvola2DXF.spec
import importlib.util
import os

from PyInstaller.utils.hooks import collect_dynamic_libs, collect_submodules

# Windows 10/11: PySide6 (Qt6); Windows 7: PySide2 (Qt5). Si esclude l'altra.
QT_ESCLUSO = "PySide2" if importlib.util.find_spec("PySide6") else "PySide6"

nascosti = collect_submodules("lazrs") + collect_submodules("pye57") + collect_submodules("laspy._compression") + [
    "laspy.lasappender", "laspy.compression", "laspy._compression.lazrsbackend",
]
binari = collect_dynamic_libs("lazrs") + collect_dynamic_libs("pye57")

a = Analysis(
    ["Nuvola2DXF.py"],
    pathex=[],
    binaries=binari,
    datas=[("icona.png", "."), ("logo.png", ".")],
    hiddenimports=nascosti,
    excludes=["tkinter", "matplotlib", "IPython", "PyQt5", "PyQt6", QT_ESCLUSO,
              "pyqtgraph.opengl", "pyqtgraph.examples", "pytest"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name=os.environ.get("NOME_EXE", "Nuvola2DXF"),
    console=False,
    icon="icona.ico",
    upx=False,
)
