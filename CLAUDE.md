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

- **`js/database.js`**: Central data layer handling all CRUD operations for products, drivers, assignments, orders, and users
- **`js/app.js`**: Main application controller with tab navigation and role-based dashboard functionality
- **`js/auth.js`**: Authentication system with multi-role support (Admin, Sales Rep, Driver)
- **`js/products.js`**: Product management UI and operations
- **`js/drivers.js`**: Driver management UI and operations  
- **`js/assignments.js`**: Product assignment to drivers functionality
- **`js/orders.js`**: Order management with workflow system (pending/completed/cancelled)
- **`js/users.js`**: User management system with role-based access control
- **`js/my-orders.js`**: Driver interface for viewing assigned orders
- **`js/my-inventory.js`**: Driver interface for inventory monitoring with low stock alerts
- **`js/reports.js`**: Order and inventory reporting

### Data Flow
1. All modules interact through the global `DB` object
2. Each module follows the pattern: `init()` → `bindEvents()` → `load/update` methods
3. Data is immediately persisted to localStorage on changes
4. Cross-module communication happens via direct method calls (e.g., `DashboardModule.updateDashboard()`)

### Key Data Structures
- **Products**: `{id, name, totalQuantity, createdAt}`
- **Drivers**: `{id, name, phone, createdAt, linkedUserId?}`
- **Users**: `{id, username, password, name, role, isActive, createdAt, driverId?}`
- **Assignments**: `{id, driverId, productId, quantity, assignedAt}`
- **Orders**: `{id, driverId, salesRepId, customerAddress, customerDescription, deliveryMethod, totalAmount, status, createdAt, completedAt?, lineItems[]}`
- **LineItems**: `{productId, productName, category, actualQuantity, isFreeGift}`

### Business Logic
- **User Roles**: Admin (full access), Sales Rep (orders + dashboard), Driver (view orders + inventory)
- **Authentication**: Secure PBKDF2 password hashing with session management
- **Inventory Management**: Products start with 0 quantity, increased via assignments to drivers
- **Assignment Flow**: Assigning products to drivers deducts from main inventory (`totalQuantity`)
- **Order Workflow**: Sales reps create orders → drivers view them → sales reps complete/cancel
- **Inventory Deduction**: Order creation reduces driver inventory, cancellation restores it
- **Driver Linking**: User accounts linked to driver profiles for proper data access

## File Structure

```
/
├── index.html              # Main HTML with inline templates
├── manifest.json           # PWA manifest
├── service-worker.js       # Service worker for offline capability
├── css/
│   └── styles.css          # All application styles
├── js/
│   ├── database.js         # localStorage data layer with user/order management
│   ├── app.js              # Main app controller & role-based dashboard
│   ├── auth.js             # Authentication & session management
│   ├── products.js         # Product management
│   ├── drivers.js          # Driver management
│   ├── assignments.js      # Assignment functionality
│   ├── orders.js           # Order workflow system
│   ├── users.js            # User management system
│   ├── my-orders.js        # Driver order interface
│   ├── my-inventory.js     # Driver inventory interface
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