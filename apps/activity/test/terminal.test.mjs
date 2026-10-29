import test from 'node:test';
import assert from 'node:assert/strict';
import {PassThrough} from 'node:stream';
import {createTerminal,confirmChoices,TerminalCancelled,terminalText} from '../src/terminal.mjs';

function fixture(){
  const input=new PassThrough(),output=new PassThrough();let text='';
  input.isTTY=output.isTTY=true;output.columns=80;output.rows=24;input.isRaw=false;
  input.setRawMode=value=>{input.isRaw=value;};output.on('data',data=>text+=data.toString());
  const terminal=createTerminal({input,output,env:{TERM:'xterm-256color'}});
  return {input,output,terminal,text:()=>text,key:(name,text='')=>input.emit('keypress',text,{name}),close(){terminal.close();input.destroy();output.destroy();}};
}

test('Enter preserves the explicit No default; arrows choose Yes and restore terminal input',async()=>{
  const f=fixture();try {
    let answer=f.terminal.ask('Read local activity?',confirmChoices());
    assert.equal(f.input.isRaw,true);f.key('return');assert.equal(await answer,'no');assert.equal(f.input.isRaw,false);
    answer=f.terminal.ask('Read local activity?',confirmChoices());f.key('up');f.key('return');assert.equal(await answer,'yes');
    assert.equal(f.input.isRaw,false);assert.equal(f.input.listenerCount('keypress'),0);assert.equal(f.output.listenerCount('resize'),0);
    assert.match(f.text(),/Enter confirm/);assert.match(f.text(),/\x1b\[\?25h/);
  }finally{f.close();}
});

test('preference selection starts empty, supports individual choices and explicit select-all confirmation',async()=>{
  const f=fixture();try {
    const options={multiple:true,choices:[{label:'First rule',value:'first'},{label:'Second rule',value:'second'}]};
    let answer=f.terminal.ask('Review preferences',options);f.key('down');f.key('space');f.key('return');assert.deepEqual(await answer,['second']);
    answer=f.terminal.ask('Review preferences',options);f.key('a','a');f.key('return');assert.deepEqual(await answer,['first','second']);
    answer=f.terminal.ask('Review preferences',options);f.key('return');assert.deepEqual(await answer,[]);
  }finally{f.close();}
});

test('Escape and end-of-input cancel without accepting a choice and restore raw mode',async()=>{
  const f=fixture();try {
    let answer=f.terminal.ask('Confirm?',confirmChoices());f.key('escape');await assert.rejects(answer,TerminalCancelled);assert.equal(f.input.isRaw,false);
    answer=f.terminal.ask('Confirm?',confirmChoices());f.input.emit('end');await assert.rejects(answer,TerminalCancelled);assert.equal(f.input.listenerCount('keypress'),0);
  }finally{f.close();}
});

test('history labels cannot inject terminal commands and long selected rules remain readable',async()=>{
  const f=fixture();try {
    const rule='When debugging, '+('show a small concrete example and explain the expected result. ').repeat(4);
    const answer=f.terminal.ask('Review',{multiple:true,choices:[{label:rule+'\x1b]52;c;secret\x07\x1b[2J',value:'rule'}]});
    assert(!f.text().includes('52;c;secret'));assert(!f.text().includes('\x1b[2J'));
    assert(f.text().includes('expected result.'));
    f.key('return');await answer;
    assert.equal(terminalText('before\x1b[31mafter\nnext'),'beforeafter next');
  }finally{f.close();}
});

test('piped input keeps the existing scripted answers and contains no terminal controls',async()=>{
  const input=new PassThrough(),output=new PassThrough();let text='';output.on('data',b=>text+=b);const terminal=createTerminal({input,output});
  try{input.end('yes\nall\n');assert.equal(await terminal.ask('Continue?',confirmChoices()),'yes');assert.equal(await terminal.ask('Review?'),'all');assert(!text.includes('\x1b'));}finally{terminal.close();}
});

test('progress updates reuse one line and are throttled while the final summary remains visible',()=>{
  const f=fixture();try{f.terminal.welcome();for(let n=0;n<100;n++)f.terminal.progress('Checking '+n,{phase:'analysis'});f.terminal.stopProgress('Activity checked');assert.equal((f.text().match(/Checking /g)??[]).length,1);assert.match(f.text(),/WELCOME TO/);assert.match(f.text(),/Activity checked/);}finally{f.close();}
});
