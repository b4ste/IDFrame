# IDFrame

A private, browser-based ID photo editor and print sheet maker.

## Run locally

```sh
npm install
npm run dev
```

The app processes uploaded photos in browser memory only. Refreshing or closing the page removes the photo. It has no image upload service, account, or database.

## Features

- Drag, zoom, and position one photo with shared crop settings for every size.
- Export 1 × 1 inch, 2 × 2 inch, Philippine passport, 3.5 × 4.5 cm, and custom sizes as JPG or PNG at 300 DPI.
- Combine selected photo sizes on A4, A5, short bond, long bond, US Legal, 4R, or 5R sheets, with a copy count for each size, margins, spacing, orientation, and automatic page overflow.
- Download print sheets as PDF or page images, or print from the browser.

Use **Actual Size / 100% Scale** when printing. The PDF uses millimetres for its page and photo dimensions.

## Checks

```sh
npm run build
npm run lint
```

The bundled `public/vendor/jspdf.umd.min.js` is jsPDF 4.2.1, licensed under MIT. Its license is included alongside the file.
"# IDFrame" 
