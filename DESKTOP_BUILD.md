# Ma9icTV Windows desktop build

On Windows with Node.js 22 or newer, run:

```powershell
npm install
npm run desktop:pack
```

The portable Windows executable is created in the `release` folder. The first build downloads Electron and packaging dependencies. This is an unsigned local test executable; Windows SmartScreen may show an unknown-publisher warning. The app starts its local API on port 3210. Run the packaging command on Windows and resolve any reported build errors before distributing it.
