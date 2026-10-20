export const appleKeyboard=()=>typeof navigator!=='undefined'&&/Mac|iPhone|iPad/.test(navigator.platform);
export const shortcutLabel=(key:string)=>`${appleKeyboard()?'⌘':'Ctrl+'}${key}`;
export {resolveShortcut,shortcutDecision,shortcutDefinitions,shortcutKeyLabel,nudgeVector} from '../../shortcuts/src/index';
/** Electron menu accelerators must use the same focused-canvas path as physical keys. */
export function dispatchMenuHistory(command:'undo'|'redo',target:Element|null=document.activeElement,apple=appleKeyboard()):boolean {
  if(!target||editingText(target)||!target.closest('.schematic-svg,.mos-viewer canvas'))return false;
  const event=new KeyboardEvent('keydown',{key:command==='redo'?'Z':'z',code:'KeyZ',ctrlKey:!apple,metaKey:apple,shiftKey:command==='redo',bubbles:true,cancelable:true});
  target.dispatchEvent(event);return event.defaultPrevented;
}
export function editingText(target:EventTarget|null):boolean {
  return typeof Element!=='undefined'&&target instanceof Element&&!!target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"]),[role="textbox"]');
}
export function deleteDesignKey(event:Pick<KeyboardEvent,'key'|'ctrlKey'|'metaKey'|'altKey'>,apple=appleKeyboard()):boolean {
  return !event.ctrlKey&&!event.metaKey&&!event.altKey&&(event.key==='Delete'||(apple&&event.key==='Backspace'));
}
