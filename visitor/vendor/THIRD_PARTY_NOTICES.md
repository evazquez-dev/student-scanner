# Visitor Kiosk Vendor Assets

The Visitor kiosk bundles these browser-local libraries so ID scanning and OCR do not call runtime CDNs or external OCR/barcode services.

- `zxing-wasm` version `3.1.2`, Apache-2.0. Used for local PDF417 barcode decoding.
- `tesseract.js` version `7.0.0`, Apache-2.0. Used for browser-local OCR orchestration.
- `tesseract.js-core` version `7.0.0`, Apache-2.0. Used for the local Tesseract WebAssembly core.
- `@tesseract.js-data/eng` version `1.0.0`, Apache-2.0. Used for the local English OCR model.

Original license files are retained in the package-specific vendor directories.
