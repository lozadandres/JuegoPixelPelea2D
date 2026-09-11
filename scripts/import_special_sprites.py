"""Importa los cuadros de carga y lanzamiento de los cuatro poderes."""

from pathlib import Path
from PIL import Image

from import_luna_sprites import remove_baked_checker, remove_tiny_components


SOURCE = Path(r"C:\Users\lozad\Downloads")
ROOT = Path(__file__).resolve().parents[1] / "public" / "sprites"
PREFIX = "ChatGPT Image 16 jul 2026, "

# personaje: archivo, celdas totales, celdas de anticipación/carga/lanzamiento
SPECIALS = {
    "kenji": ("17_54_58.png", 8, [1, 2, 4]),
    "luna": ("17_55_03.png", 7, [1, 2, 4]),
    "bruno": ("17_55_09.png", 8, [1, 3, 6]),
    "rayo": ("17_54_52.png", 8, [1, 3, 5]),
}

# Recortes del efecto puro en la hoja original. Estas zonas excluyen por
# completo al luchador para evitar que el proyectil dibuje una segunda copia.
PROJECTILE_CROPS = {
    "kenji": (0.60, 0.20, 0.94, 0.69),
    "luna": (0.69, 0.12, 0.94, 0.68),
    "bruno": (0.64, 0.60, 0.96, 0.96),
    "rayo": (0.835, 0.22, 0.95, 0.76),
}

# Porción horizontal que pertenece únicamente al efecto. En las hojas de
# Kenji, Luna y Rayo el personaje aparece a la derecha del poder.
EFFECT_RIGHT_EDGE = {"kenji": 0.77, "luna": 0.80, "rayo": 0.56}


def expanded_special_frame(sheet: Image.Image, cells: int, index: int, margin: float = 0) -> Image.Image:
    """Extrae exactamente una pose del luchador, sin invadir celdas vecinas."""
    cell_width = sheet.width / cells
    left = max(0, round((index - margin) * cell_width))
    right = min(sheet.width, round((index + 1 + margin) * cell_width))
    source = remove_baked_checker(sheet.crop((left, 0, right, sheet.height)))
    alpha = source.getchannel("A")
    px = alpha.load()
    seen: set[tuple[int, int]] = set()
    components: list[list[tuple[int, int]]] = []
    for y in range(alpha.height):
        for x in range(alpha.width):
            if px[x, y] < 24 or (x, y) in seen:
                continue
            stack = [(x, y)]
            seen.add((x, y))
            component: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                component.append((cx, cy))
                for nx, ny in ((cx - 1, cy), (cx + 1, cy), (cx, cy - 1), (cx, cy + 1)):
                    if 0 <= nx < alpha.width and 0 <= ny < alpha.height and px[nx, ny] >= 24 and (nx, ny) not in seen:
                        seen.add((nx, ny)); stack.append((nx, ny))
            if len(component) >= 80:
                components.append(component)

    target_x = (right - left) / 2
    main = max(
        components,
        key=lambda c: len(c) / (
            1 + 2 * abs((min(p[0] for p in c) + max(p[0] for p in c)) / 2 - target_x) / cell_width
        ),
    )
    keep = set(main)
    cleaned = source.copy()
    out_alpha = cleaned.getchannel("A")
    out = out_alpha.load()
    for y in range(alpha.height):
        for x in range(alpha.width):
            if (x, y) not in keep:
                out[x, y] = 0
    cleaned.putalpha(out_alpha)
    bbox = cleaned.getbbox()
    if not bbox:
        raise RuntimeError(f"No se detectó el poder en la celda {index}")
    subject = cleaned.crop(bbox)
    scale = min(168 / subject.height, 312 / subject.width)
    subject = subject.resize((round(subject.width * scale), round(subject.height * scale)), Image.Resampling.LANCZOS)
    canvas = Image.new("RGBA", (320, 176), (0, 0, 0, 0))
    canvas.alpha_composite(subject, ((320 - subject.width) // 2, 176 - subject.height))
    return remove_tiny_components(canvas, minimum_area=20)


def build_projectile_frames(character: str, sheet: Image.Image) -> None:
    source = remove_baked_checker(sheet.convert("RGBA"))
    x1, y1, x2, y2 = PROJECTILE_CROPS[character]
    effect = source.crop((round(source.width * x1), round(source.height * y1), round(source.width * x2), round(source.height * y2)))
    alpha = effect.getchannel("A")
    mask = alpha.load()
    if character in EFFECT_RIGHT_EDGE:
        cutoff = round(effect.width * EFFECT_RIGHT_EDGE[character])
        for y in range(effect.height):
            for x in range(cutoff, effect.width):
                mask[x, y] = 0
    elif character == "bruno":
        # La onda sísmica ocupa el suelo; las piernas de poses vecinas están
        # en la parte superior y no forman parte del poder.
        cutoff = round(effect.height * 0.36)
        for y in range(cutoff):
            for x in range(effect.width):
                mask[x, y] = 0
    effect.putalpha(alpha)
    bbox = effect.getbbox()
    if not bbox:
        raise RuntimeError(f"No se detectó el efecto liberado de {character}")
    effect = effect.crop(bbox)
    for index, pulse in enumerate((0.90, 1.0, 0.94)):
        scale = min(304 / effect.width, 136 / effect.height) * pulse
        resized = effect.resize((max(1, round(effect.width * scale)), max(1, round(effect.height * scale))), Image.Resampling.LANCZOS)
        canvas = Image.new("RGBA", (320, 152), (0, 0, 0, 0))
        canvas.alpha_composite(resized, ((320 - resized.width) // 2, (152 - resized.height) // 2))
        canvas = remove_tiny_components(canvas, minimum_area=180)
        canvas.save(ROOT / character / f"proj_{index}.png", optimize=True)


def main() -> None:
    for character, (filename, cells, selected) in SPECIALS.items():
        sheet = Image.open(SOURCE / f"{PREFIX}{filename}")
        for frame, cell_index in enumerate(selected):
            # Las poses de Rebeca sobresalen más de su celda; las demás deben
            # permanecer estrictas para no capturar una segunda figura.
            margin = 0.25 if character == "bruno" else 0
            image = expanded_special_frame(sheet, cells, cell_index, margin)
            image.save(
                ROOT / character / f"special_{frame}.png", optimize=True
            )
        build_projectile_frames(character, sheet)
    print("Poderes especiales importados para Kenji, Luna, Rebeca y Rayo")


if __name__ == "__main__":
    main()
