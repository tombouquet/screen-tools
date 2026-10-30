// The toolbar icon while a recording runs: the badge shows the countdown, then REC (or
// a pause sign), and the popup is switched off so a click on the icon reaches the
// background worker, which asks the recorder to stop.
const RECORD_RED = '#dc2626';
const PAUSED_GREY = '#6b7280';

/** The popup from the manifest, put back once the recording is over. */
function defaultPopup(): string {
  return chrome.runtime.getManifest().action?.default_popup ?? 'popup.html';
}

async function show(text: string, color: string, title: string): Promise<void> {
  await Promise.all([
    chrome.action.setPopup({ popup: '' }),
    chrome.action.setBadgeText({ text }),
    chrome.action.setBadgeBackgroundColor({ color }),
    chrome.action.setBadgeTextColor({ color: '#ffffff' }),
    chrome.action.setTitle({ title }),
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

/** Clears the badge and title. */
export async function clearBadge(): Promise<void> {
  await Promise.all([chrome.action.setBadgeText({ text: '' }), chrome.action.setTitle({ title: 'Screen Tools' })]);
}

/** Back to the menu popup with a clear badge. */
export async function resetToolbar(): Promise<void> {
  await chrome.action.setPopup({ popup: defaultPopup() });
  await clearBadge();
}
