# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the Application

This is a vanilla JavaScript PWA that runs without build tools:

1. **Development Server**: Open `index.html` in a browser or use a local server like `python -m http.server 8000`
2. **Testing**: Manual testing in browser - no automated test framework
3. **PWA Installation**: Can be installed from browser when served over HTTPS

## Architecture Overview

### Core Structure
- **Frontend**: Vanilla HTML/CSS/JavaScript with no framework dependencies
- **Storage**: All data persisted in browser localStorage via `DB` module
- **Navigation**: Single-page app with tab-based navigation using templates
- **PWA Features**: Service worker for offline capability, manifest for app installation

### Module System
The application uses a modular architecture with these main components:

- **`js/database.js`**: Central data layer handling all CRUD operations for products, drivers, assignments, and sales
- **`js/app.js`**: Main application controller with tab navigation and dashboard functionality
- **`js/products.js`**: Product management UI and operations
- **`js/drivers.js`**: Driver management UI and operations  
- **`js/assignments.js`**: Product assignment to drivers functionality
- **`js/sales.js`**: Sales recording with multi-line item support
- **`js/reports.js`**: Sales and inventory reporting

### Data Flow
1. All modules interact through the global `DB` object
2. Each module follows the pattern: `init()` → `bindEvents()` → `load/update` methods
3. Data is immediately persisted to localStorage on changes
4. Cross-module communication happens via direct method calls (e.g., `DashboardModule.updateDashboard()`)

### Key Data Structures
- **Products**: `{id, name, totalQuantity, createdAt}`
- **Drivers**: `{id, name, phone, createdAt}`
- **Assignments**: `{id, driverId, productId, quantity, assignedAt}`
- **Sales**: `{id, driverId, customerAddress, customerDescription, totalAmount, saleDate, lineItems[]}`
- **LineItems**: `{productId, productName, quantity, price, isFreeGift}`

### Business Logic
- **Inventory Management**: Products start with 0 quantity, increased via assignments to drivers
- **Assignment Flow**: Assigning products to drivers deducts from main inventory (`totalQuantity`)
- **Sales Tracking**: Sales reduce driver inventory but don't affect main product quantities
- **Free Gifts**: Line items can be marked as free gifts (don't count toward sales totals)

## File Structure

```
/
├── index.html              # Main HTML with inline templates
├── manifest.json           # PWA manifest
├── service-worker.js       # Service worker for offline capability
├── css/
│   └── styles.css          # All application styles
├── js/
│   ├── database.js         # localStorage data layer
│   ├── app.js              # Main app controller & dashboard
│   ├── products.js         # Product management
│   ├── drivers.js          # Driver management
│   ├── assignments.js      # Assignment functionality
│   ├── sales.js            # Sales recording
│   └── reports.js          # Reporting functionality
└── images/
    └── icons/              # PWA icons (various sizes)
```

## Development Notes

- **No Build Process**: Direct file editing, refresh browser to see changes
- **State Management**: All state in localStorage, no complex state management needed
- **Error Handling**: Basic validation with `alert()` for user feedback
- **Mobile-First**: Responsive design optimized for mobile devices
- **Dependencies**: Only Font Awesome CDN for icons

## Common Operations

### Adding New Features
1. Add UI template to `index.html` if needed
2. Create or modify relevant module in `js/`
3. Update `database.js` if new data structures needed
4. Test manually in browser

### Debugging
- Check browser console for JavaScript errors
- Inspect localStorage in DevTools to see data
- Use browser's PWA debugging tools for service worker issues

### Data Management
- Clear localStorage to reset all data: `localStorage.clear()`
- Export data: Copy localStorage values from DevTools
- All data operations go through `DB` object methods