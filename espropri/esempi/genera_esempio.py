# Genera i dati d'esempio (fittizi) per provare ESPROPRI_SISTEM:
#  esempio.dxf  – foglio 1 con 12 particelle (layer PARTICELLE e numeri), strada, aree d'intervento:
#                 ESPROPRIO già tagliata sui limiti di particella con il numero dentro (modo «pezzi»),
#                 SERVITU e OCCUPAZIONE_TEMPORANEA come fasce intere (il programma le divide per particella);
#  ditte.csv    – elenco ditte con intestatari (anche più intestatari nella stessa cella, come nelle visure).
# Uso: python3 genera_esempio.py   (scrive i file accanto allo script)
import os
qui = os.path.dirname(os.path.abspath(__file__))
X0, Y0 = 1745000.0, 5112000.0          # coordinate Gauss-Boaga fittizie
W, H = 40.0, 30.0                      # particelle 40 x 30 m
out = ['0', 'SECTION', '2', 'HEADER', '9', '$INSUNITS', '70', '6', '0', 'ENDSEC', '0', 'SECTION', '2', 'ENTITIES']

def poly(layer, pts):
    out.extend(['0', 'LWPOLYLINE', '8', layer, '90', str(len(pts)), '70', '1'])
    for x, y in pts: out.extend(['10', '%.3f' % x, '20', '%.3f' % y])

def text(layer, x, y, t, h=1.8):
    out.extend(['0', 'TEXT', '8', layer, '10', '%.3f' % x, '20', '%.3f' % y, '40', str(h), '1', t])

num = 100
nums = {}
for r in range(3):
    for c in range(4):
        x, y = X0 + c * W, Y0 + r * H
        poly('PARTICELLE', [(x, y), (x + W, y), (x + W, y + H), (x, y + H)])
        text('PARTICELLE', x + 4, y + 4, str(num))
        nums[(r, c)] = num
        num += 1
# Strada sotto il foglio
poly('STRADA', [(X0, Y0 - 8), (X0 + 4 * W, Y0 - 8), (X0 + 4 * W, Y0), (X0, Y0)])
# Opera: fascia orizzontale tra y = 25 e 37 (esproprio), servitù 37-43, occupazione 43-51 (attraversa le righe 0 e 1)
for c in range(4):
    x = X0 + c * W
    # esproprio già tagliato: parte nella riga 0 (y 25-30) e nella riga 1 (y 30-37)
    poly('ESPROPRIO', [(x, Y0 + 25), (x + W, Y0 + 25), (x + W, Y0 + 30), (x, Y0 + 30)])
    text('ESPROPRIO', x + 20, Y0 + 27, str(nums[(0, c)]), 1.2)
    poly('ESPROPRIO', [(x, Y0 + 30), (x + W, Y0 + 30), (x + W, Y0 + 37), (x, Y0 + 37)])
    text('ESPROPRIO', x + 20, Y0 + 33, str(nums[(1, c)]), 1.2)
poly('SERVITU', [(X0, Y0 + 37), (X0 + 4 * W, Y0 + 37), (X0 + 4 * W, Y0 + 43), (X0, Y0 + 43)])
poly('OCCUPAZIONE_TEMPORANEA', [(X0 + 10, Y0 + 43), (X0 + 4 * W - 10, Y0 + 43), (X0 + 4 * W - 10, Y0 + 51), (X0 + 10, Y0 + 51)])
# Pozzetto: servitù ingombro opere (cerchio 1,5 m)
out.extend(['0', 'CIRCLE', '8', 'SERVITU_INGOMBRO', '10', '%.3f' % (X0 + 60), '20', '%.3f' % (Y0 + 40), '40', '1.5'])
out.extend(['0', 'ENDSEC', '0', 'EOF'])
open(os.path.join(qui, 'esempio.dxf'), 'w', newline='\r\n').write('\n'.join(out) + '\n')

righe = [
    'N. ditta;Comune;Foglio;Mappale;Qualità;Classe;Superficie mq;Reddito dominicale;Reddito agrario;Intestatari;Indirizzo;CAP;Città',
    '1;Comune di Prova;1;100;Seminativo;2;1200;5,58;3,41;ROSSI MARIO nato a BELLUNO (BL) il 12/03/1960 - CF: RSSMRA60C12A757T Proprieta\' 1/2; BIANCHI ANNA nata a FELTRE (BL) il 05/07/1962 - CF: BNCNNA62L45D530F Proprieta\' 1/2;Via Roma, 1;32100;Belluno (BL)',
    '1;Comune di Prova;1;101;Seminativo;2;1200;5,58;3,41;;;;',
    '2;Comune di Prova;1;102;Prato;3;1200;2,17;2,48;VERDI LUIGI nato a SEDICO (BL) il 01/01/1950 - CF: VRDLGU50A01I563Y Proprieta\' 1/1;Via dei Prati, 7;32036;Sedico (BL)',
    '3;Comune di Prova;1;103;Prato;3;1200;2,17;2,48;AGRICOLA ESEMPIO S.R.L. con sede in BELLUNO (BL) - CF: 01234567897 Proprieta\' 1/1;Via Industria, 3;32100;Belluno (BL)',
    '4;Comune di Prova;1;104;Seminativo;1;1200;7,44;4,34;NERI GIOVANNI nato a BELLUNO (BL) il 20/10/1945 - CF: NREGNN45R20A757T Usufrutto 1/1; NERI PAOLA nata a BELLUNO (BL) il 11/11/1975 - CF: NREPLA75S51A757N Nuda proprieta\' 1/1;Via Piave, 10;32100;Belluno (BL)',
    '4;Comune di Prova;1;105;Seminativo;1;1200;7,44;4,34;;;;',
    '5;Comune di Prova;1;106;Bosco ceduo;2;1200;0,93;0,31;GIALLI ELENA nata a AGORDO (BL) il 03/04/1980 - CF: GLLLNE80D43A083O Proprieta\' 1/1;Piazza Libertà, 2;32021;Agordo (BL)',
    '5;Comune di Prova;1;107;Bosco ceduo;2;1200;0,93;0,31;;;;',
]
def quota_campi(r):
    c = r.split(';', 9)
    if len(c) < 10: return r
    resto = c[9].rsplit(';', 3)
    if len(resto) == 4 and ';' in resto[0]: resto[0] = '"' + resto[0] + '"'
    return ';'.join(c[:9] + resto)
righe = [quota_campi(r) for r in righe]
open(os.path.join(qui, 'ditte.csv'), 'w', encoding='utf-8-sig').write('\r\n'.join(righe) + '\r\n')
print('scritti esempio.dxf e ditte.csv')
