# Financial Journal

An offline-first personal finance journal for the web and Android. Transaction history is stored on-device in IndexedDB, with local storage as a fallback; it is not automatically shared between browsers or devices. Export a backup from Settings to protect or move your data.

## Run the web app

Serve this folder from `localhost` or an HTTPS host, then open `index.html`. The service worker caches the app shell for offline launches, and IndexedDB keeps transactions available without a connection.

## Build the Android APK

Install Node.js/npm, Java 17, Android SDK Platform 34, and Gradle 8.2.1. Then run:

```sh
npm install
npm run android:debug
```

The debug APK is written to `android/app/build/outputs/apk/debug/app-debug.apk`. The **Build Android APK** GitHub Actions workflow also builds and uploads this APK as an artifact.
