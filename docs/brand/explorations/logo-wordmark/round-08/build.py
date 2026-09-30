"""Build a reference reconstruction and two complete R adaptations.

Run with fontTools installed and --font pointing to CormorantGaramond[wght].ttf.
The reference contour was isolated from the retained cream B image, fitted with
Potrace 1.16 at tolerance 0.15, and normalized to a 625-unit capital height.
The two adaptations below are explicit contour edits, not a stretched tail.
"""
import argparse
from pathlib import Path
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont
from fontTools.pens.svgPathPen import SVGPathPen

parser = argparse.ArgumentParser()
parser.add_argument('--font', required=True)
args = parser.parse_args()
dest = Path(__file__).resolve().parent

REFERENCE = '''M59.63 617.93
C60.51 613.96 68.46 608.22 77.74 605.12
C103.36 596.29 115.28 583.04 120.58 556.54
C123.67 540.64 125 456.27 124.12 299.91
C122.79 83.48 122.35 64.93 114.84 49.91
C105.57 31.8 91.87 20.76 72 16.78
C63.6 15.46 58.75 11.48 58.75 7.07
C58.75 0.88 70.67 0 178 0
C288.43 0 297.26 0.44 297.26 7.95
C297.26 11.93 294.17 15.46 290.19 15.46
C277.39 15.46 247.79 34.89 240.72 48.59
C234.54 59.63 232.77 79.51 231.89 164.75
L230.12 267.23 H251.77
C265.02 267.23 278.27 264.13 287.1 258.83
C305.21 247.35 329.95 214.22 363.52 154.59
C443.46 13.25 469.08 -24.29 515.02 -66.7
C563.16 -112.19 607.33 -128.09 674.03 -125
C703.62 -123.67 721.73 -120.14 740.72 -112.19
C755.3 -106.45 767.67 -99.38 768.55 -96.73
C769.43 -93.64 756.63 -92.31 731.45 -92.31
C695.23 -92.76 690.37 -91.87 664.75 -77.74
C616.61 -51.68 586.57 -12.81 493.82 141.78
C448.32 217.76 411.66 262.37 387.37 272.08
C375 276.5 375 276.94 405.92 286.66
C450.53 300.8 480.57 318.9 504.86 345.41
C534.01 377.65 545.05 407.69 545.05 458.48
C545.49 493.82 544.17 500.44 531.8 525.62
C506.18 577.3 454.06 610.87 383.39 620.58
C366.61 622.79 286.22 625 205.39 625
C72.88 625 58.3 624.12 59.63 617.93 Z
M346.73 587.01
C372.79 578.62 404.59 548.59 417.84 519.88
C426.24 502.21 427.56 491.17 427.56 448.32
C427.56 401.5 426.68 395.76 415.19 373.23
C385.6 315.37 344.08 293.73 264.13 293.73
H231.01 V443.46 V593.64 L247.79 595.41
C273.85 598.5 324.2 594.08 346.73 587.01 Z'''

# The outside bowl and its connection to the leg retain the reference geometry.
# Stem/counter and the inside leg are redrawn together for the lighter base.
BALANCED = '''M59.63 617.93
C60.51 613.96 68.46 608.22 77.74 605.12
C103.36 596.29 115.28 583.04 120.58 556.54
C123.67 540.64 125 456.27 124.12 299.91
C122.79 83.48 122.35 64.93 114.84 49.91
C105.57 31.8 91.87 20.76 72 16.78
C63.6 15.46 58.75 11.48 58.75 7.07
C58.75 0.88 70.67 0 164 0
C267 0 283 0.44 283 7.95
C283 11.93 280 15.46 276 15.46
C260 15.46 220 34.89 213 48.59
C206 59.63 205 79.51 204 164.75
L204 267.23 H265
C283 267.23 299 262 309 254
C329 243 354 209 385 151
C464 14 487 -23 531 -62
C575 -106 616 -121 674.03 -120
C703.62 -119 722 -116 741 -109
C755.3 -104 767.67 -98 768.55 -96.73
C769.43 -93.64 756.63 -92.31 731.45 -92.31
C695.23 -92.76 690.37 -91.87 664.75 -77.74
C616.61 -51.68 586.57 -12.81 493.82 141.78
C448.32 217.76 411.66 262.37 387.37 272.08
C375 276.5 375 276.94 405.92 286.66
C450.53 300.8 480.57 318.9 504.86 345.41
C534.01 377.65 545.05 407.69 545.05 458.48
C545.49 493.82 544.17 500.44 531.8 525.62
C506.18 577.3 454.06 610.87 383.39 620.58
C366.61 622.79 286.22 625 205.39 625
C72.88 625 58.3 624.12 59.63 617.93 Z
M355 595
C385 586 419 558 437 528
C452 506 458 485 458 448
C458 402 456 393 444 371
C414 317 356 294 264 294
H204 V443.46 V604 L225 605
C275 610 329 603 355 595 Z'''

FULLER = '''M59.63 617.93
C60.51 613.96 68.46 608.22 77.74 605.12
C103.36 596.29 115.28 583.04 120.58 556.54
C123.67 540.64 125 456.27 124.12 299.91
C122.79 83.48 122.35 64.93 114.84 49.91
C105.57 31.8 91.87 20.76 72 16.78
C63.6 15.46 58.75 11.48 58.75 7.07
C58.75 0.88 70.67 0 171 0
C279 0 291 0.44 291 7.95
C291 11.93 288 15.46 284 15.46
C271 15.46 234 34.89 227 48.59
C221 59.63 219 79.51 218 164.75
L218 267.23 H258
C274 267.23 288 263 298 257
C316 246 342 212 375 153
C454 14 478 -24 523 -64
C569 -110 611 -126 674.03 -123
C703.62 -122 722 -119 740.72 -111
C755.3 -106 767.67 -99 768.55 -96.73
C769.43 -93.64 756.63 -92.31 731.45 -92.31
C695.23 -92.76 690.37 -91.87 664.75 -77.74
C616.61 -51.68 586.57 -12.81 493.82 141.78
C448.32 217.76 411.66 262.37 387.37 272.08
C375 276.5 375 276.94 405.92 286.66
C450.53 300.8 480.57 318.9 504.86 345.41
C534.01 377.65 545.05 407.69 545.05 458.48
C545.49 493.82 544.17 500.44 531.8 525.62
C506.18 577.3 454.06 610.87 383.39 620.58
C366.61 622.79 286.22 625 205.39 625
C72.88 625 58.3 624.12 59.63 617.93 Z
M351 591
C380 582 412 553 429 524
C441 505 446 483 446 448
C446 402 442 394 431 372
C401 316 350 294 264 294
H218 V443.46 V600 L236 602
C275 605 327 599 351 591 Z'''

def isolated(path, name):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 920" role="img" aria-label="{name}"><g transform="translate(60 700) scale(1 -1)" fill="currentColor"><path d="{path}"/></g></svg>\n'

for slug,path in [('reference',REFERENCE),('balanced',BALANCED),('fuller',FULLER)]:
    (dest / f'{slug}-r.svg').write_text(isolated(path,slug))

for slug,weight,path in [('balanced',500,BALANCED),('fuller',600,FULLER)]:
    font=instantiateVariableFont(TTFont(args.font),{'wght':weight})
    glyphs=font.getGlyphSet()
    text='AMOURETTE'
    adjustments={'AM':-10,'MO':-10,'OU':-5,'UR':0,'RE':-110,'ET':-15,'TT':0,'TE':-15}
    x=0
    art=[]
    for i,letter in enumerate(text):
        if letter=='R':
            d=path
        else:
            pen=SVGPathPen(glyphs,ntos=lambda value:format(value,'.2f'))
            glyphs[letter].draw(pen)
            d=pen.getCommands()
        art.append(f'<g data-letter="{letter}" transform="translate({x} 0)"><path d="{d}"/></g>')
        x+=glyphs[letter].width
        if i+1<len(text):x+=100+adjustments.get(text[i:i+2],0)
    svg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {x+160} 920" role="img" aria-label="AMOURETTE: {slug} R adaptation"><title>AMOURETTE / {slug}</title><g transform="translate(80 740) scale(1 -1)" fill="currentColor">{"".join(art)}</g></svg>\n'
    (dest / f'{slug}-wordmark.svg').write_text(svg)
print('Built the full reference R, two complete adaptations and two wordmarks.')
