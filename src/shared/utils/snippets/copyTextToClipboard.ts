/* Copyright 2025 Esri
 *
 * Licensed under the Apache License Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Copies text to the clipboard, falling back to the legacy command when the async Clipboard API is
 * unavailable.
 *
 * Both paths are needed. `navigator.clipboard` requires a secure context and, inside a cross-origin
 * iframe, a `clipboard-write` permission the embedding page has to grant. When an embed does not grant
 * it, the older `execCommand` path still works, because it is driven purely by the user gesture.
 *
 * @returns true when the text reached the clipboard
 */
export const copyTextToClipboard = async (text: string): Promise<boolean> => {
    if (!text) {
        return false;
    }

    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch (err) {
        // blocked by permissions policy or an insecure context; try the legacy path below
        console.warn('clipboard API unavailable, falling back', err);
    }

    try {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        // readonly stops mobile keyboards appearing, and the off-screen position stops the page
        // scrolling when the textarea is focused for the selection
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.top = '-1000px';
        textarea.style.opacity = '0';

        document.body.appendChild(textarea);
        textarea.select();

        const succeeded = document.execCommand('copy');

        document.body.removeChild(textarea);

        return succeeded;
    } catch (err) {
        console.error('failed to copy to clipboard', err);
        return false;
    }
};

/**
 * Whether the app is running inside an iframe.
 *
 * Used to offer a clipboard fallback for the CSV export: a sandboxed frame cannot start a download
 * unless the embedding page sets `allow-downloads`, and the app has no way to influence that.
 */
export const isRunningInIframe = (): boolean => {
    try {
        return window.self !== window.top;
    } catch (err) {
        // reading window.top throws for a cross-origin parent, which itself proves it is embedded
        return true;
    }
};
