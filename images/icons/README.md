# PWA Icons

The icon files in this directory are currently empty and need to be generated.

## Required Icon Sizes

- **72x72px** - Android Chrome
- **96x96px** - Android Chrome
- **128x128px** - Android Chrome
- **144x144px** - Windows Metro Tile
- **152x152px** - iOS Safari
- **192x192px** - Android Chrome (standard), also used for maskable
- **384x384px** - Android Chrome splash screen

## Creating Icons

### Option 1: Use an online PWA icon generator
1. Visit: https://www.pwabuilder.com/imageGenerator
2. Upload your source image (recommended: 512x512px minimum)
3. Download the generated icon pack
4. Replace the empty files in this directory

### Option 2: Use a design tool
1. Create icons in the sizes listed above
2. Use the inventory/box theme with the app's primary color (#4A90E2)
3. Ensure icons work on both light and dark backgrounds
4. Save as PNG files with the exact filenames listed above

### Option 3: Command line tool (if Node.js available)
```bash
npx pwa-asset-generator [source-image] images/icons/ --icon-only --manifest manifest.json
```

## Design Guidelines

- **Theme**: Inventory/warehouse/box icon
- **Colors**: Primary #4A90E2, with white/transparent background
- **Style**: Modern, clean, professional
- **Maskable**: Should work well when cropped to circular shape
- **Contrast**: Visible on both light and dark backgrounds

## Verification

After generating icons, verify:
1. All files have content (not 0 bytes)
2. Icons display correctly in browser dev tools > Application > Manifest
3. App installs properly on mobile devices
4. Icons appear correctly on home screen after installation