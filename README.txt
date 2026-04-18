DBL Logo Timeline App

Files:
- index.html
- styles.css
- app.js

What it does:
- Upload a BBGM / DBL export (.json or .json.gz)
- Reads each franchise's seasons array
- Pulls the main logo from each season's imgURL
- Renders one franchise per row and one year per column
- Uses faded empty cells before/after a franchise exists
- Keeps top years and left franchise column sticky while scrolling

Notes:
- This app is fully client-side. No database needed.
- It uses the pako CDN script in index.html to decompress .gz files in-browser.
- Row labels use the franchise's most recent location name.
