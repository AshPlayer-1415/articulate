import {createInterface,emitKeypressEvents} from 'node:readline';

export class TerminalCancelled extends Error {
  constructor(){super('Setup paused. Your saved progress is safe.');this.name='TerminalCancelled';}
}
// History-derived labels are data, including when they contain terminal escapes.
export function terminalText(value){return String(value).replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g,'').replace(/\x1b\[[0-?]*[ -/]*[@-~]/g,'').replace(/[\x00-\x1f\x7f-\x9f]/g,' ').replace(/\s+/g,' ').trim();}
const glyphs={A:['0110','1001','1111','1001','1001'],R:['1110','1001','1110','1010','1001'],T:['11111','00100','00100','00100','00100'],I:['111','010','010','010','111'],C:['0111','1000','1000','1000','0111'],U:['1001','1001','1001','1001','0110'],L:['1000','1000','1000','1000','1111'],E:['1111','1000','1110','1000','1111']};
const logo=Array.from({length:5},(_,row)=>[...'ARTICULATE'].map(c=>glyphs[c][row].replace(/1/g,'█').replace(/0/g,' ')).join('  '));

export function createTerminal({input=process.stdin,output=process.stdout,env=process.env,now=Date.now}={}) {
  const interactive=!!(input.isTTY&&output.isTTY&&typeof input.setRawMode==='function'&&env.TERM!=='dumb');
  const color=interactive&&env.NO_COLOR===undefined;
  const paint=(code,s)=>color?`\x1b[${code}m${s}\x1b[0m`:s;
  const width=()=>Math.max(16,(output.columns||80)-2);
  const clip=s=>{s=terminalText(s);return [...s].length>width()?[...s].slice(0,width()-1).join('')+'…':s;};
  const write=line=>output.write(line+'\n');
  let reader,answers,active=null,progressVisible=false,lastProgressAt=0,lastProgress='',progressPhase='';
  function stopProgress(message){if(progressVisible){output.write('\r\x1b[2K');progressVisible=false;}if(message)write('  '+paint('32','✓')+' '+clip(message));lastProgressAt=0;progressPhase='';}
  function progress(message,{phase='',force=false}={}) {
    if(!interactive)return;
    lastProgress=message;
    if(!force&&phase===progressPhase&&now()-lastProgressAt<100)return;
    output.write('\r\x1b[2K  '+paint('36','◌')+' '+clip(lastProgress));progressVisible=true;lastProgressAt=now();progressPhase=phase;
  }
  async function lineQuestion(question){
    if(!reader){reader=createInterface({input,crlfDelay:Infinity,terminal:false});answers=reader[Symbol.asyncIterator]();}
    output.write(question+' ');const answer=await answers.next();return answer.done?'':answer.value;
  }
  async function ask(question,{choices,multiple=false,initial=0}={}) {
    if(!interactive||!choices)return lineQuestion(question);
    if(active)throw new Error('A terminal question is already open');
    stopProgress();
    const items=choices.map(c=>typeof c==='string'?{label:c,value:c}:c);
    if(!items.length)throw new Error('A choice is required');
    emitKeypressEvents(input);
    const wasRaw=!!input.isRaw,wasFlowing=input.readableFlowing===true;
    let cursor=Math.max(0,Math.min(initial,items.length-1)),drawn=0,settled=false;
    const checked=new Set();
    input.setRawMode(true);input.resume();output.write('\x1b[?25l');
    return new Promise((resolve,reject)=>{
      function clear(){if(drawn)output.write(`\x1b[${drawn}A\r\x1b[0J`);drawn=0;}
      function render(){
        clear();
        const detail=terminalText(items[cursor].label),detailWidth=Math.max(12,width()-4);
        const detailLines=detail.length>width()-5?(detail.match(new RegExp(`.{1,${detailWidth}}`,'gu'))??[]):[];
        const size=Math.min(items.length,Math.max(1,Math.min(8,(output.rows||24)-10-detailLines.length)));
        const start=Math.max(0,Math.min(cursor-Math.floor(size/2),items.length-size));
        const lines=['  '+paint('1',clip(question))];
        for(let i=start;i<start+size;i++){
          const mark=multiple?(checked.has(i)?'◼':'◻'):(cursor===i?'●':'○');
          const label=clip(`${cursor===i?'›':' '} ${mark} ${items[i].label}`);
          lines.push('  '+(cursor===i?paint('36',label):label));
        }
        for(const line of detailLines)lines.push('    '+line);
        if(items[cursor].hint)lines.push('  '+paint('2',clip(items[cursor].hint)));
        if(items.length>size)lines.push('  '+paint('2',`${cursor+1} of ${items.length}`));
        lines.push('  '+paint('2',clip(multiple?'↑/↓ move · Space select · Enter save':'↑/↓ choose · Enter confirm · Esc go back')));
        if(multiple)lines.push('  '+paint('2',clip(`A select all · Esc go back · ${checked.size} selected`)));
        output.write(lines.join('\n')+'\n');drawn=lines.length;
      }
      function cleanup(){input.off('keypress',key);input.off('end',end);output.off('resize',render);input.setRawMode(wasRaw);if(!wasFlowing)input.pause();output.write('\x1b[?25h');active=null;}
      function finish(error){
        if(settled)return;settled=true;clear();cleanup();
        if(error){reject(error);return;}
        const result=multiple?items.filter((_,i)=>checked.has(i)).map(i=>i.value):items[cursor].value;
        write('  '+paint('32','✓')+' '+clip(question)+' '+paint('2',multiple?`${checked.size} selected`:terminalText(items[cursor].label)));
        resolve(result);
      }
      function end(){finish(new TerminalCancelled());}
      function key(text,k={}){
        if(k.ctrl&&k.name==='c'||k.name==='escape'){finish(new TerminalCancelled());return;}
        if(k.name==='up'||k.name==='left')cursor=(cursor+items.length-1)%items.length;
        else if(k.name==='down'||k.name==='right'||k.name==='tab')cursor=(cursor+1)%items.length;
        else if(k.name==='home')cursor=0;
        else if(k.name==='end')cursor=items.length-1;
        else if(multiple&&k.name==='space'){if(checked.has(cursor))checked.delete(cursor);else checked.add(cursor);}
        else if(multiple&&text?.toLowerCase()==='a'){if(checked.size===items.length)checked.clear();else items.forEach((_,i)=>checked.add(i));}
        else if(k.name==='return'||k.name==='enter'){finish();return;}
        else return;
        render();
      }
      active=()=>finish(new TerminalCancelled());input.on('keypress',key);input.once('end',end);output.on('resize',render);render();
    });
  }
  function welcome(){
    stopProgress();write('');write('  '+paint('2','WELCOME TO'));
    if(width()>=logo[0].length+2)for(const row of logo)write('  '+paint('36',row));else write('  '+paint('1;36','ARTICULATE'));
    write('');write('  '+paint('1','One shared understanding of how you work.'));
    write('  Bring your coding-agent activity together, review your preferences,');
    write('  and carry them into Codex, Claude and Cursor.');write('');
  }
  return {interactive,ask,progress,stopProgress,welcome,
    write:line=>{stopProgress();for(const part of String(line).split('\n'))write(terminalText(part));},
    section:(step,title)=>{stopProgress();write('');write('  '+paint('36',step)+'  '+paint('1',terminalText(title)));write('');},
    note:line=>{stopProgress();write('  '+terminalText(line));},
    success:line=>{stopProgress();write('  '+paint('32','✓')+' '+terminalText(line));},
    warning:line=>{stopProgress();write('  '+paint('33','!')+' '+terminalText(line));},
    close(){stopProgress();active?.();reader?.close();}
  };
}

export function confirmChoices(yesLabel='Yes, continue',noLabel='No, go back') {
  return {choices:[{value:'yes',label:yesLabel},{value:'no',label:noLabel}],initial:1};
}
