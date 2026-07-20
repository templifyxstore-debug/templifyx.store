# TemplifyX Product Sync System

## Overview
Products are now automatically synchronized between **file.html** (Admin Dashboard) and **productpage.html** (Customer View).

## How It Works

### 1. Data Storage
- **Storage Key**: `templifyx_v1` (localStorage)
- **Encryption**: XOR cipher with salt from `templifyx_salt`
- **Format**: Encrypted JSON array of product objects

### 2. file.html (Admin Dashboard)
When you add, edit, or delete products in file.html:
1. Changes are saved to localStorage with encryption
2. JSON structure: `[{id, name, code, description, previewImage, previewUrl, product_id}, ...]`
3. Data is encrypted using: `encrypt(JSON.stringify(products))`
4. Storage is updated immediately

### 3. productpage.html (Customer View)
When productpage.html loads:
1. DOMContentLoaded event triggers
2. `renderProductsOnPage()` is called
3. Function retrieves encrypted data from localStorage
4. Data is decrypted using: `decrypt(raw)`
5. JSON is parsed to get product array
6. Dynamic HTML is generated for each product
7. Event listeners are attached for filtering, cart, etc.

### 4. Real-Time Sync
When you switch between tabs or windows:
- `storage` event listener detects changes
- If `templifyx_v1` is modified, products are re-rendered
- Changes appear instantly without page refresh

## Product Data Structure
```javascript
{
  id: "p_abc123xyz",           // Internal ID
  name: "Product Name",         // Display name
  code: "TPL-001",             // Product code
  description: "...",          // Product description
  previewImage: "url|video",   // Image or video URL
  previewUrl: "https://...",   // Link to preview
  product_id: "PID-001"        // Public product ID
}
```

## Testing Sync

### Test 1: Add Product
1. Open file.html in one tab
2. Open productpage.html in another tab
3. Add a product in file.html
4. Product appears instantly in productpage.html (with storage event)
5. Or refresh productpage.html to see the new product

### Test 2: Edit Product
1. Edit product name in file.html
2. Product updates in productpage.html automatically

### Test 3: Delete Product
1. Delete product in file.html
2. Product disappears from productpage.html

## Functions

### In file.html:
- `saveProducts(arr)` - Encrypts and saves to storage
- `loadProducts()` - Decrypts and loads from storage

### In productpage.html:
- `loadProductsFromStorage()` - Decrypts and loads from storage
- `renderProductsOnPage()` - Generates dynamic HTML for products
- `attachCardEventListeners()` - Attaches click handlers for filtering/cart

## Security Notes
- Encryption is NOT cryptographically secure (XOR cipher)
- Use for obfuscation only, not sensitive data
- Both pages access localStorage on same origin
- Browser storage is not secure - use backend for sensitive data

## Troubleshooting

### Products not showing?
1. Check browser console for errors
2. Verify localStorage has key `templifyx_v1`
3. Check Network tab - no CORS issues?
4. Try opening file.html first to populate storage

### Sync not working?
1. Check if both pages use same encryption functions
2. Verify storage event listener is attached
3. Try refreshing both pages
4. Check browser privacy settings don't block storage

### Cart not working?
1. Cart uses separate key: `templifyxCart`
2. Stored as plain JSON (not encrypted)
3. Check if localStorage is accessible
