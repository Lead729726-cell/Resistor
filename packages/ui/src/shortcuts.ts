export const appleKeyboard=()=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform);
export const shortcutLabel=(key:string)=>`${appleKeyboard()?'⌘':'Ctrl+'}${key}`;
export {resolveShortcut,shortcutDefinitions,shortcutKeyLabel,nudgeVector} from '../../shortcuts/src/index';
export function editingText(target:EventTarget|null):boolean {
  return typeof Element!=='undefined'&&target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
}
export function deleteDesignKey(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'>,apple=appleKeyboard()):boolean {
  return !event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key==='Delete'||(apple&&event.key==='Backspace'));
}
