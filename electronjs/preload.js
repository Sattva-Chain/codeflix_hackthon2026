// preload.js
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  storeToken: (token) => ipcRenderer.invoke("company-token", token),
  getToken: () => ipcRenderer.invoke("get-token"),
  clearToken: () => ipcRenderer.invoke("clear-token"),
  storeGithubToken: (token) => ipcRenderer.invoke("github-token", token),
  getGithubToken: () => ipcRenderer.invoke("get-github-token"),
  clearGithubToken: () => ipcRenderer.invoke("clear-github-token"),
  // 1. Sends the PDF data (base64) to the main process
  savePDF: (data, filename) => ipcRenderer.send("save-pdf", data, filename), 
  // 2. Receives the success message back from the main process
  onSavePDFSuccess: (callback) => ipcRenderer.on('save-pdf-success', (event, arg) => callback(arg)), 
});

console.log("Preload script loaded");
