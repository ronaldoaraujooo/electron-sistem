/// <reference types="vite/client" />
/// <reference types="react" />
/// <reference types="react-dom" />
interface Window {
  electron: {
    ipcRenderer: {
      invoke(channel: 'db:getPath'): Promise<string>;
      invoke(channel: 'db:openFolder', folderPath: string): Promise<void>;
      invoke(channel: string, ...args: unknown[]): Promise<any>;
    };
  };
}
