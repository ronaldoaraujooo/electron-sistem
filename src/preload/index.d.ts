import { ElectronAPI } from '@electron-toolkit/preload'

declare global {
  interface Window {
    electron: ElectronAPI & {
      process: {
        versions: NodeJS.ProcessVersions;
      };
      ipcRenderer: any;
    };
    api: any
  }
}
