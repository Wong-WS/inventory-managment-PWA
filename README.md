# Mobile-First Inventory Management PWA

A Progressive Web Application (PWA) for managing inventory, drivers, product assignments, and sales records.

## Features

### Core Features
1. **Add Products**: Form to add product name and quantity
2. **Manage Drivers**: Add/view drivers with names and phone numbers
3. **Assign Products**: Assign products and quantities to drivers with history tracking
4. **Record Sales**: Multi-line sales form with customer address, product quantities, prices, and optional free gifts
5. **View Reports**: Driver sales totals by day/week/month/year and current inventory levels

### Technical Implementation
- Built with HTML/CSS/JavaScript 
- Data stored in localStorage
- Mobile-responsive design with tab navigation
- PWA with service worker and manifest for offline capability and installation

## Data Structure
- Products: {id, name, totalQuantity, createdAt}
- Drivers: {id, name, phone, createdAt}
- Assignments: {id, driverId, productId, quantity, assignedAt}
- Sales: {id, driverId, customerAddress, customerDescription, totalAmount, saleDate, lineItems[]}
- LineItems: {productId, productName, quantity, price, isFreeGift}

## UI Layout
- Tab navigation: Dashboard, Products, Drivers, Assign, Sales, Reports
- Dashboard: Summary cards with totals and recent activity
- Forms: Mobile-friendly inputs with appropriate validation
- Sales form: Dynamic line items with add/remove buttons

## How to Use

### Installation
This is a PWA and can be installed on your device:
1. Open the application in a modern browser
2. For mobile devices, tap the "Add to Home Screen" option
3. For desktop browsers, look for the install icon in the address bar

### Running Locally
To run this application locally:
1. Clone or download the repository
2. Open index.html in a web browser
3. For best PWA experience, use a local server

## User Guide

### Adding Products
1. Navigate to the Products tab
2. Enter product name and initial quantity
3. Click "Add Product"

### Managing Drivers
1. Navigate to the Drivers tab
2. Enter driver name and phone number
3. Click "Add Driver"

### Assigning Products to Drivers
1. Navigate to the Assign tab
2. Select a driver and product
3. Enter quantity to assign
4. Click "Assign Products"

### Recording Sales
1. Navigate to the Sales tab
2. Select the driver who made the sale
3. Enter customer address and optional description
4. Add products, quantities, and prices in the line items
5. Mark any items as free gifts if applicable
6. Click "Record Sale"

### Viewing Reports
1. Navigate to the Reports tab
2. Select between Sales Reports and Inventory Reports
3. Apply filters as needed
4. Click "Generate Report"

## Technical Notes
- The application works offline after initial load
- All data is stored in the browser's localStorage
- No backend server is required

## Browser Compatibility
- Chrome (recommended for best PWA experience)
- Firefox
- Safari
- Edge
