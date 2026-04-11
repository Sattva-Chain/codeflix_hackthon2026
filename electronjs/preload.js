const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  storeToken: (token) => ipcRenderer.invoke("company-token", token),
  getToken: () => ipcRenderer.invoke("get-token"),
  clearToken: () => ipcRenderer.invoke("clear-token"),
  savePDF: (data, filename) => ipcRenderer.send("save-pdf", data, filename),
  onSavePDFSuccess: (callback) =>
    ipcRenderer.on("save-pdf-success", (_event, arg) => callback(arg)),
});

console.log("Preload script loaded");
