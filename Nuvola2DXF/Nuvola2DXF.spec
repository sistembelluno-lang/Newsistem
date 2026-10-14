# -*- mode: python ; coding: utf-8 -*-
# Costruzione dell'eseguibile:  pyinstaller --noconfirm Nuvola2DXF.spec
from PyInstaller.utils.hooks import collect_dynamic_libs, collect_submodules

nascosti = collect_submodules("lazrs") + collect_submodules("pye57") + collect_submodules("laspy._compression") + [
    "laspy.lasappender", "laspy.compression", "laspy._compression.lazrsbackend",
]
binari = collect_dynamic_libs("lazrs") + collect_dynamic_libs("pye57")

a = Analysis(
    ["Nuvola2DXF.py"],
    pathex=[],
    binaries=binari,
    datas=[("icona.png", ".")],
    hiddenimports=nascosti,
    excludes=["tkinter", "matplotlib", "IPython", "PyQt5", "PyQt6", "PySide2",
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
    name="Nuvola2DXF",
    console=False,
    icon="icona.ico",
    upx=False,
)
