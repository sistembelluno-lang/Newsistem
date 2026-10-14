"""Disegna il logo NDXF (icona.png, icona.ico e logo.png) con Pillow.

Uso:  python grafica/crea_logo.py   (dalla cartella Nuvola2DXF)

Quadrato blu con la nuvola di punti di uno spigolo di muro che diventa a
destra una linea netta (la nuvola che diventa disegno CAD) e la scritta NDXF.
"""

import os
import random

from PIL import Image, ImageDraw, ImageFont

QUI = os.path.dirname(os.path.abspath(__file__))
RADICE = os.path.dirname(QUI)
FONT = ["/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf", "/usr/share/fonts/opentype/inter/Inter-Bold.otf",
        "C:/Windows/Fonts/segoeuib.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"]
BLU_SCURO = (12, 34, 68)
BLU = (24, 98, 196)
ARANCIO = (255, 146, 28)
BIANCO = (255, 255, 255)


def _font(dim):
    for f in FONT:
        if os.path.exists(f):
            return ImageFont.truetype(f, dim)
    return ImageFont.load_default()


def _sfondo(S):
    """Quadrato arrotondato con sfumatura diagonale."""
    grad = Image.new("RGB", (S, S))
    px = grad.load()
    for y in range(S):
        for x in range(S):
            f = (x + y) / (2 * S)
            px[x, y] = tuple(int(BLU_SCURO[i] + (BLU[i] - BLU_SCURO[i]) * (1 - f)) for i in range(3))
    maschera = Image.new("L", (S, S), 0)
    ImageDraw.Draw(maschera).rounded_rectangle((0, 0, S - 1, S - 1), radius=int(S * 0.2), fill=255)
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    img.paste(grad, (0, 0), maschera)
    return img


def logo(S=1024, testo=True):
    img = _sfondo(S)
    d = ImageDraw.Draw(img)
    rnd = random.Random(7)
    # una stanza: a sinistra ancora nuvola di punti, a destra già linea CAD
    L, R = S * 0.15, S * 0.85
    T, B = (S * 0.13, S * 0.47) if testo else (S * 0.2, S * 0.8)
    xm = S * 0.5  # dove la nuvola diventa linea
    w = int(S * (0.04 if testo else 0.07))
    r = S * (0.012 if testo else 0.02)
    lati = [((xm, T), (L, T)), ((L, T), (L, B)), ((L, B), (xm, B))]
    lung = [abs(b[0] - a[0]) + abs(b[1] - a[1]) for a, b in lati]
    for _ in range(320 if testo else 160):
        k = rnd.choices(range(3), weights=lung)[0]
        (ax, ay), (bx, by) = lati[k]
        t = rnd.random()
        x, y = ax + (bx - ax) * t, ay + (by - ay) * t
        sp = S * (0.011 if testo else 0.018)
        x += rnd.gauss(0, sp)
        y += rnd.gauss(0, sp)
        a = int(255 * (0.5 + 0.5 * rnd.random()))
        d.ellipse((x - r, y - r, x + r, y + r), fill=BIANCO + (a,))
    d.line((xm, T, R, T), fill=ARANCIO, width=w)
    d.line((R, T - w / 2, R, B + w / 2), fill=ARANCIO, width=w)
    d.line((R, B, xm, B), fill=ARANCIO, width=w)
    for yy in (T, B):  # vertici della polilinea
        d.ellipse((xm - w * 0.75, yy - w * 0.75, xm + w * 0.75, yy + w * 0.75), fill=BIANCO, outline=ARANCIO,
                  width=max(1, int(w * 0.3)))
    if testo:
        f = _font(int(S * 0.30))
        parti = [("N", BIANCO), ("DXF", ARANCIO)]
        larg = sum(d.textlength(t, font=f) for t, _ in parti)
        x = (S - larg) / 2
        y = S * 0.57
        for t, c in parti:
            d.text((x, y), t, font=f, fill=c)
            x += d.textlength(t, font=f)
    return img


def main():
    grande = logo(1024)
    grande.save(os.path.join(RADICE, "logo.png"))
    grande.resize((256, 256), Image.LANCZOS).save(os.path.join(RADICE, "icona.png"))
    # icona di Windows: sotto i 48 px la scritta non si leggerebbe, resta il simbolo
    piccolo = logo(1024, testo=False)
    immagini = {s: (grande if s >= 48 else piccolo).resize((s, s), Image.LANCZOS) for s in (16, 24, 32, 48, 64, 128, 256)}
    immagini[256].save(os.path.join(RADICE, "icona.ico"), sizes=[(s, s) for s in immagini],
                       append_images=[immagini[s] for s in (16, 24, 32, 48, 64, 128)])


if __name__ == "__main__":
    main()
