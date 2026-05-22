import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  generateKey: (machineId: string, durationDays?: number) => ipcRenderer.invoke('generate-key', machineId, durationDays),
  getMachineId: () => ipcRenderer.invoke('get-machine-id'),
  syncKeys: (count: number, durationDays?: number) => ipcRenderer.invoke('sync-keys', count, durationDays),
  listKeys: () => ipcRenderer.invoke('list-keys'),
  revokeKey: (key: string) => ipcRenderer.invoke('revoke-key', key),
  restoreKey: (key: string) => ipcRenderer.invoke('restore-key', key),
  deleteKey: (key: string) => ipcRenderer.invoke('delete-key', key),
  purgeKeys: () => ipcRenderer.invoke('purge-keys'),
});
