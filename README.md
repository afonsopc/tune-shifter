<img width="128" height="128" alt="icon-128" src="https://github.com/user-attachments/assets/3875dd73-26da-41f1-938a-038b2a41f106" />

# Tune Shifter

Take control of any audio or video on the web. Change playback speed, add reverb, adjust volume, and preserve pitch, all from a sleek popup interface.

Developed by **[Afonso Coutinho](https://github.com/afonsopc)**.

<div align="center">

[![Chrome Web Store](https://img.shields.io/badge/Chrome_Web_Store-Install-4285F4?style=for-the-badge&logo=google-chrome&logoColor=white)](https://chromewebstore.google.com/detail/tune-shifter/empnmbaeakhblbiffifgmojmkjiflklp)
[![Firefox Add-ons](https://img.shields.io/badge/Firefox_Add--ons-Install-FF7139?style=for-the-badge&logo=firefox-browser&logoColor=white)](https://addons.mozilla.org/en-US/firefox/addon/tune-shifter)
![Safari](https://img.shields.io/badge/Safari_(Mac,_iPhone,_iPad)-Coming_soon-0FB5EE?style=for-the-badge&logo=safari&logoColor=white)

</div>

## About

**Tune Shifter** gives you studio-grade control over any media playing in your browser. Whether you're slowing down a guitar tutorial on YouTube, adding reverb to a lo-fi playlist, or speeding up a lecture.

https://github.com/user-attachments/assets/fbdcc12c-7429-4eea-a1d9-c4f1363b28d0

### Features

*   🎵 **Universal Control** - Works on any website with audio/video (YouTube, Spotify, Netflix, etc.)
*   ⏱️ **Playback Speed** - Adjust from 0.5x to 2x with fine-grained control
*   🎚️ **Reverb** - Add spatial depth with real-time convolution reverb
*   🔊 **Volume** - Boost or reduce volume beyond the player limits
*   🎼 **Pitch Preservation** - Toggle pitch correction when changing speed
*   💾 **Persistent Settings** - Your preferences are saved and automatically applied to new videos

## How to Use

1. **Pin the extension** to your toolbar
2. **Navigate to any page** with audio or video
3. **Click the Tune Shifter icon** to open the control panel
4. **Adjust settings** with the sliders - changes are saved automatically

Your settings persist across page reloads and new videos!

## Safari (Mac, iPhone, iPad)

Coming soon to the App Store. Once installed, open the Tune Shifter app and turn the extension on:

- **Mac:** Safari > Settings > Extensions > Tune Shifter
- **iPhone / iPad:** Settings > Apps > Safari > Extensions > Tune Shifter

Then open Tune Shifter from the Safari toolbar (Mac), the page menu (iPhone) or the extensions icon (iPad).
On iPhone and iPad the volume slider is hidden: iOS only lets the device buttons change media volume.

## Development

```sh
npm install
npm run build          # Chrome / Firefox -> dist/
npm run build:safari   # Safari web extension -> dist-safari/
npm run safari:dev     # builds the Mac app (Debug) and opens it, to test in Safari
npm run safari         # archives, signs and uploads the Mac and iOS builds to App Store Connect
```

The Xcode project lives in `safari/` (generated with `xcrun safari-web-extension-packager`).
`npm run safari` copies `dist-safari/` into `safari/Shared (Extension)/Resources/` before building.
App Store listing text is in `safari/listing.json` and is pushed with `bun scripts/asc-listing.ts all`;
the screenshots in `safari/screenshots/` are made from real captures with `swift scripts/safari-screenshots.swift`.

Privacy: [PRIVACY.md](PRIVACY.md).

