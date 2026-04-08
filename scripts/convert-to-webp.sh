#!/bin/bash
# JPG/JPEG to WebP Converter Script
# Usage: ./convert-to-webp.sh <input_dir> [output_dir]
#        ./convert-to-webp.sh <input_file> [output_dir]
#
# Arguments:
#   input_dir/file: Path to directory containing JPG files or a single JPG file (required)
#   output_dir:     Output directory for WebP files (defaults to: <input_dir>/webp)
#
# Examples:
#   ./scripts/convert-to-webp.sh ./public/images
#   ./scripts/convert-to-webp.sh ./public/images ./optimized-images
#   ./scripts/convert-to-webp.sh ./photo.jpg ./output

set -e

# Parse arguments
if [ -z "$1" ]; then
    echo "Error: Input directory or file is required"
    echo ""
    echo "Usage:"
    echo "  $0 <input_dir> [output_dir]"
    echo "  $0 <input_file> [output_dir]"
    echo ""
    echo "Examples:"
    echo "  $0 ./public/winners/cards"
    echo "  $0 ./public/winners/cards ./optimized"
    echo "  $0 ./photo.jpg ./output"
    exit 1
fi

INPUT_PATH="$1"
OUTPUT_DIR="${2:-}"

# Check if input exists
if [ ! -e "$INPUT_PATH" ]; then
    echo "Error: Input path '$INPUT_PATH' does not exist"
    exit 1
fi

# Determine if input is a file or directory
IS_FILE=false
if [ -f "$INPUT_PATH" ]; then
    IS_FILE=true
    INPUT_DIR="$(dirname "$INPUT_PATH")"
    INPUT_FILENAME="$(basename "$INPUT_PATH")"
else
    INPUT_DIR="$INPUT_PATH"
fi

# Set default output directory
if [ -z "$OUTPUT_DIR" ]; then
    if [ "$IS_FILE" = true ]; then
        # For single file, default to same directory as input
        OUTPUT_DIR="$INPUT_DIR/webp"
    else
        # For directory, default to subdirectory 'webp'
        OUTPUT_DIR="$INPUT_DIR/webp"
    fi
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

echo "=== JPG/JPEG to WebP Converter ==="
echo ""
if [ "$IS_FILE" = true ]; then
    echo "Input file:  $INPUT_PATH"
else
    echo "Input dir:   $INPUT_DIR"
fi
echo "Output dir:  $OUTPUT_DIR"
echo ""

# Check for ImageMagick
if ! command -v magick &> /dev/null; then
    echo "Error: ImageMagick (magick) is not installed"
    echo "Install with: brew install imagemagick"
    exit 1
fi

echo "Converting images to WebP..."
echo ""

# Convert files
if [ "$IS_FILE" = true ]; then
    # Process single file
    if [[ "$INPUT_FILENAME" =~ \.(jpg|jpeg|JPG|JPEG|png|PNG)$ ]]; then
        magick "$INPUT_PATH" -define webp:lossless=false -quality 85 "$OUTPUT_DIR/${INPUT_FILENAME%.*}.webp"
        echo "✓ Converted: $INPUT_FILENAME → ${INPUT_FILENAME%.*}.webp"
    else
        echo "Error: File is not a supported image (JPG/PNG)"
        exit 1
    fi
else
    # Process directory
    img_count=$(find "$INPUT_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | wc -l)

    if [ "$img_count" -eq 0 ]; then
        echo "Warning: No supported image files found in $INPUT_DIR"
        exit 0
    fi

    echo "Found $img_count image files"
    echo ""

    # Convert all JPG/JPEG/PNG files to WebP with quality 85
    # Warning: Shell wildcards like "$INPUT_DIR"/*.jpg might fail if no files match. 
    # Safest is to find and execute, OR ensure at least one type exists.
    # Since we know img_count > 0, at least one exists.
    
    # We use a loop to handle paths correctly without CD or complex find -exec shell injection
    find "$INPUT_DIR" -maxdepth 1 -type f \( -iname "*.jpg" -o -iname "*.jpeg" -o -iname "*.png" \) | while read -r filepath; do
        filename=$(basename "$filepath")
        filename_no_ext="${filename%.*}"
        
        # Determine output path
        output_path="$OUTPUT_DIR/${filename_no_ext}.webp"
        
        magick "$filepath" -quality 85 -define webp:lossless=false "$output_path"
        echo "✓ Converted: $filename → ${filename_no_ext}.webp"
    done

    converted_count=$(find "$OUTPUT_DIR" -maxdepth 1 -name "*.webp" -type f | wc -l)
    echo "✓ Converted $converted_count files"
fi

echo ""
echo "Conversion complete!"
echo ""
echo "Results:"
python3 -c "
import os
import sys

input_dir = '$INPUT_DIR'
output_dir = '$OUTPUT_DIR'

# Calculate sizes
if os.path.exists(input_dir) and os.listdir(input_dir):
    jpg_files = [f for f in os.listdir(input_dir) if f.lower().endswith(('.jpg', '.jpeg', '.png'))]
    if jpg_files:
        jpg_total = sum(os.path.getsize(os.path.join(input_dir, f)) for f in jpg_files)
        webp_total = sum(os.path.getsize(os.path.join(output_dir, f))
                        for f in os.listdir(output_dir)
                        if f.endswith('.webp'))
        saving = (1 - webp_total/jpg_total) * 100 if jpg_total > 0 else 0
        print(f'Original JPG/JPEG:  {jpg_total/1024/1024:.2f} MB ({len(jpg_files)} files)')
        print(f'WebP:               {webp_total/1024/1024:.2f} MB ({len(jpg_files)} files)')
        print(f'Space saved:        {saving:.1f}%')
    else:
        print('No JPG/JPEG files found to calculate savings')
else:
    print('No files found')
" 2>/dev/null || echo "(Python calculation unavailable)"

echo ""
echo "Next steps:"
if [ "$IS_FILE" = false ]; then
    echo "1. Review files in: $OUTPUT_DIR"
    echo "2. Test with your application"
    echo "3. When ready, replace originals with: ./scripts/replace-with-webp.sh"
fi
echo ""