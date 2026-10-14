"""Avvio di Nuvola2DXF."""

import multiprocessing
import sys

if __name__ == "__main__":
    multiprocessing.freeze_support()
    if len(sys.argv) > 2 and sys.argv[1] == "--verifica":
        from nuvola2dxf.verifica import esegui

        sys.exit(esegui(sys.argv[2]))
    from nuvola2dxf.gui import main

    sys.exit(main())
