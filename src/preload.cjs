'use strict';
const { contextBridge, ipcRenderer } = require('electron');
const call = (name, ...args) =>
  ipcRenderer.invoke('horizon:' + name, ...args).then((r) => {
    if (!r.ok) throw Error(r.error);
    return r.value;
  });
contextBridge.exposeInMainWorld(
  'horizon',
  Object.freeze({
    status: () => call('status'),
    chooseImport: () => call('choose-import'),
    create: (password) => call('create', password),
    unlock: (password) => call('unlock', password),
    read: () => call('read'),
    save: (state, revision) => call('save', state, revision),
    destructiveSave: (state, revision) => call('destructive-save', state, revision),
    backup: () => call('backup'),
    importData: () => call('import'),
    restore: (password) => call('restore', password),
    changePassword: (oldPassword, newPassword) => call('password', oldPassword, newPassword),
    lock: () => call('lock'),
    activity: () => ipcRenderer.send('horizon:activity'),
  })
);
