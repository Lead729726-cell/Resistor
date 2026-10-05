export const appleKeyboard=()=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform);
export const shortcutLabel=(key:string)=>`${appleKeyboard()?'⌘':'Ctrl+'}${key}`;
export function editingText(target:EventTarget|null):boolean {
  return target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]');
}
export function deleteDesignKey(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'>,apple=appleKeyboard()):boolean {
  return !event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key==='Delete'||(apple&&event.key==='Backspace'));
}
