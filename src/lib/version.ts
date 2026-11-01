import { browser } from 'wxt/browser';

export const currentVersion = () => browser.runtime.getManifest().version;
