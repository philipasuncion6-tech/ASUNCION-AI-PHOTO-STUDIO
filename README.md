# ASUNCION AI PHOTO STUDIO

A mobile-friendly photo studio interface for portrait creation concepts, signature frames, and future AI-powered image transformations.

## Current status

- Photo upload and browser preview: available.
- Local PNG export with optional signature frame and caption: available.
- Age, outfit, world/background and style selectors: interface is ready.
- Genuine AI age transformation, clothing replacement, and background replacement: **not connected yet**.
- `/api/generate`: secure Vercel endpoint placeholder returning HTTP 503 until an image-generation provider is selected and configured.

The app intentionally does not pretend that selecting an age or outfit has transformed the uploaded photo.

## Deploy on Vercel

Import this repository into Vercel. The root `index.html` is served as a static site and `api/generate.js` is a Vercel serverless function.

## Security

Do not put AI provider API keys in `index.html` or any browser-side JavaScript. Store secrets as Vercel Environment Variables and call the provider only from server-side code.

## Next implementation step

Choose an image-editing provider that supports reference-image editing and age/wardrobe/background instructions. Then implement authenticated upload handling, provider request/response processing, size limits, error handling, and output storage.
