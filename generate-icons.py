#!/usr/bin/env python3
"""
Generate PWA icons for inventory management app
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    """Create a simple icon with the app name initial"""
    # Create a new image with a gradient background
    img = Image.new('RGB', (size, size), color='#4CAF50')
    draw = ImageDraw.Draw(img)

    # Draw a border
    border_width = max(2, size // 40)
    draw.rectangle(
        [(border_width, border_width), (size - border_width, size - border_width)],
        outline='#2E7D32',
        width=border_width
    )

    # Draw the letter "I" for Inventory
    try:
        # Try to use a system font
        font_size = size // 2
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        # Fallback to default font
        font = ImageFont.load_default()

    text = "IM"

    # Get text bounding box for centering
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]

    # Center the text
    x = (size - text_width) // 2
    y = (size - text_height) // 2 - bbox[1]

    # Draw text with shadow
    shadow_offset = max(1, size // 100)
    draw.text((x + shadow_offset, y + shadow_offset), text, fill='#1B5E20', font=font)
    draw.text((x, y), text, fill='white', font=font)

    # Save the image
    img.save(output_path, 'PNG')
    print(f"Created {output_path} ({size}x{size})")

def main():
    # Icon sizes needed for PWA
    sizes = [72, 96, 128, 144, 152, 192, 384, 512]

    # Create icons directory if it doesn't exist
    icons_dir = 'images/icons'
    os.makedirs(icons_dir, exist_ok=True)

    # Generate each icon size
    for size in sizes:
        output_path = f'{icons_dir}/icon-{size}x{size}.png'
        create_icon(size, output_path)

    print(f"\nSuccessfully generated {len(sizes)} PWA icons!")

if __name__ == '__main__':
    main()
