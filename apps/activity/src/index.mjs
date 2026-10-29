#!/usr/bin/env node
import {runActivityCli} from './cli.mjs';
runActivityCli().catch(error=>{console.error(error.message);process.exitCode=error.name==='TerminalCancelled'?130:1;});
