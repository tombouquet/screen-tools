// The toolbar icon while a recording or screenshot runs: the badge shows the countdown,
// then REC (or a pause sign), or a full page's progress. The popup is switched off so a
// click on the icon reaches the background worker, which stops it.
import { browser } from 'wxt/browser';

const RECORD_RED = '#dc2626';
const PAUSED_GREY = '#6b7280';
const CAPTURE_BLUE = '#2563eb';

/** The popup from the manifest, put back once the recording or screenshot is over. */
function defaultPopup(): string {
  return browser.runtime.getManifest().action?.default_popup ?? 'popup.html';
}

async function show(text: string, color: string, title: string): Promise<void> {
  await Promise.all([
    browser.action.setPopup({ popup: '' }),
    browser.action.setBadgeText({ text }),
    browser.action.setBadgeBackgroundColor({ color }),
    browser.action.setBadgeTextColor({ color: '#ffffff' }),
    browser.action.setTitle({ title }),
  ]);
}

export function showCountdown(seconds: number): Promise<void> {
  return show(String(seconds), RECORD_RED, 'Screen Tools: starting… click to cancel');
}

export function showRecording(paused: boolean): Promise<void> {
  return paused
    ? show('❚❚', PAUSED_GREY, 'Screen Tools: paused. Click to stop recording')
    : show('REC', RECORD_RED, 'Screen Tools: recording. Click to stop');
}

export function showFullPageProgress(step: number, stepCount: number): Promise<void> {
  return show(`${step}/${stepCount}`, CAPTURE_BLUE, 'Screen Tools: capturing full page. Click or press Esc to stop');
}

export function showAreaSelection(): Promise<void> {
  return show('', CAPTURE_BLUE, 'Screen Tools: selecting an area. Click to cancel');
}

/** Clears the badge and title. */
async function clearBadge(): Promise<void> {
  await Promise.all([browser.action.setBadgeText({ text: '' }), browser.action.setTitle({ title: 'Screen Tools' })]);
}

/** Back to the menu popup with a clear badge. */
export async function resetToolbar(): Promise<void> {
  await browser.action.setPopup({ popup: defaultPopup() });
  await clearBadge();
}
