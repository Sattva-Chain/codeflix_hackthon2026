import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { fileURLToPath } from "url";
import path from "path";
import Store from "electron-store";
import fs from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const store = new Store();

const indexPath = path.resolve(__dirname, "../client/dist/index.html");
/** Packaged app, or local run with: npm run start:dist (loads client/dist, no Vite). */
const useBuiltUi = app.isPackaged || process.argv.includes("--dist");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  console.log("--------------------------------------------------");
  if (useBuiltUi) {
    if (fs.existsSync(indexPath)) {
      console.log("🚀 Loading UI from:", indexPath);
      win.loadFile(indexPath);
    } else {
      console.error(
        "❌ Built UI not found at",
        indexPath,
        "- run: npm run build --prefix ../client"
      );
    }
  } else {
    console.log("🚀 Dev mode: loading Vite at http://localhost:5173");
    win.loadURL("http://localhost:5173").catch((err) => {
      console.error(
        "Failed to load dev server. Run from electronjs: npm run dev   (or build client and use npm run start:dist)",
        err
      );
    });
    win.webContents.openDevTools({ mode: "detach" });
  }
}

/* ------------------------------------------------------------------
    🔐 AUTH TOKEN STORAGE HANDLERS
------------------------------------------------------------------ */
ipcMain.handle("company-token", (event, token) => {
  store.set("companyToken", token);
  return true;
});

ipcMain.handle("get-token", () => {
  return store.get("companyToken");
});

ipcMain.handle("clear-token", () => {
  store.delete("companyToken");
  return true;
});

ipcMain.handle("github-token", (event, token) => {
  store.set("githubToken", token);
  return true;
});

ipcMain.handle("get-github-token", () => {
  return store.get("githubToken");
});

ipcMain.handle("clear-github-token", () => {
  store.delete("githubToken");
  return true;
});

/* ------------------------------------------------------------------
    📄 PDF SAVE HANDLER
------------------------------------------------------------------ */
ipcMain.on("save-pdf", async (event, pdfDataUri, defaultFilename) => {
  try {
    const win = BrowserWindow.getFocusedWindow();
    const { filePath } = await dialog.showSaveDialog(win, {
      defaultPath: defaultFilename,
      filters: [{ name: "PDF Files", extensions: ["pdf"] }],
    });

    if (!filePath) return;

    const base64Data = pdfDataUri.split('base64,')[1];
    fs.writeFileSync(filePath, Buffer.from(base64Data, "base64"));
    
    event.sender.send('save-pdf-success', {
        message: `Saved to: ${path.basename(filePath)}`,
        filePath: filePath
    });
  } catch (err) {
    dialog.showErrorBox('Save Error', err.message);
  }
});

/* ------------------------------------------------------------------
    🚀 APP BOOT
------------------------------------------------------------------ */
app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
