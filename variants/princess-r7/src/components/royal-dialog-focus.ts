/** Keep keyboard navigation within the finished-match controls. */
export function containRoyalDialogTab(event: {
  key:string; shiftKey:boolean; target:EventTarget|null;
  currentTarget:{querySelectorAll:(selector:string)=>NodeListOf<HTMLElement>};
  preventDefault:()=>void;
}) {
  if(event.key!=='Tab') return;
  const buttons=Array.from(event.currentTarget.querySelectorAll('button:not(:disabled):not([tabindex="-1"])'));
  if(!buttons.length){event.preventDefault();return;}
  const first=buttons[0],last=buttons[buttons.length-1];
  if(event.shiftKey && event.target===first){event.preventDefault();last.focus();}
  else if(!event.shiftKey && event.target===last){event.preventDefault();first.focus();}
}
