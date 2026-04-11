/// <reference types="vite/client" />

interface ElectronApi {
  storeToken: (token: string) => Promise<void>;
  getToken: () => Promise<string | null>;
  clearToken: () => Promise<void>;
  savePDF: (data: string, filename: string) => void;
  onSavePDFSuccess: (callback: (args: { message: string; filePath: string }) => void) => void;
}

interface Window {
  electronAPI?: ElectronApi;
}
