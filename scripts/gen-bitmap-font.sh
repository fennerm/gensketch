#!/usr/bin/env bash
# Script for generating a bitmap font for PIXI rendering.
# Requirements:
# * fontbm (https://github.com/vladimirgamalyan/fontbm)
#
# Directories may need to be changed for your system

input_font=/usr/share/fonts/TTF/DejaVuSansMono.ttf
font_name="DejaVuSansMono"
outdir="frontend/assets"
fontsize=32
fontbm \
    --font-size="$fontsize" \
    --font-file="$input_font" \
    --texture-crop-width \
    --texture-crop-height \
    --spacing-vert=1 \
    --spacing-horiz=1 \
    --output="$font_name"

# For some reason fontbm sets a negative fontsize in the .fnt file which leads to fonts being
# rendered upside down.
sed -i "s/-$fontsize/$fontsize/g" "$font_name".fnt
mv "$font_name".fnt "$outdir"
mv "$font_name"_0.png "$outdir"/"$font_name"_0.png
