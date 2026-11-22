import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdir, rename, stat, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "node:net";
import { setTimeout as sleep } from "node:timers/promises";
import { configure, configureCrew, alias, port, model, revision, hash, bytes } from "./profile.mjs";

const app = fileURLToPath(new URL("../",import.meta.url));
const home = join(process.env.LOCALAPPDATA,"T3CodeWorkspaces");
const store = join(home,"inkling");
const weights = join(store,model);

async function free(portNumber) {
  const probe=createServer();
  await new Promise((resolve,reject)=>probe.once("error",reject).listen(portNumber,"127.0.0.1",()=>probe.close(resolve)));
}
async function getWeights() {
  await mkdir(store,{recursive:true});
  const receipt=weights+".verified";
  if(existsSync(weights)){
    const info=await stat(weights);
    if(info.size===bytes && existsSync(receipt) && await readFile(receipt,"utf8")===hash+" "+info.mtimeMs) return;
  }
  const file=existsSync(weights)?weights:weights+".part";
  if(file!==weights){
    console.log("Downloading 16.53 GB from AtomicChat. Interrupted downloads can resume.");
    const url="https://huggingface.co/AtomicChat/Inkling-2-Mini-Uncensored-GGUF/resolve/"+revision+"/"+model;
    const curl=spawnSync("curl.exe",["--fail","--location","--retry","3","--continue-at","-","--output",file,url],{stdio:"inherit"});
    if(curl.status!==0) throw Error("Download interrupted. Run the launcher again to resume.");
  }
  const digest=createHash("sha256");
  for await(const chunk of createReadStream(file)) digest.update(chunk);
  if(digest.digest("hex")!==hash) throw Error("Model checksum mismatch. Move this file aside and retry: "+file);
  if(file!==weights) await rename(file,weights);
  await writeFile(receipt,hash+" "+(await stat(weights)).mtimeMs);
}
let llama,ui;
function stop(){ui?.kill();llama?.kill();}
process.on("exit",stop);
process.on("SIGINT",()=>process.exit(130));
process.on("SIGTERM",()=>process.exit(143));
try{
  await free(47831).catch(()=>{throw Error("Close the running Daycrew launcher before starting Inkling (port 47831 is in use).");});
  await free(port).catch(()=>{throw Error("Inkling's local port 47832 is already in use.");});
  const localExe=join(app,"llama","llama-server.exe");
  const exe=existsSync(localExe)?localExe:"llama-server.exe";
  const version=spawnSync(exe,["--version"],{encoding:"utf8"});
  const build=(version.stdout+" "+version.stderr).match(/version:\s*b?(\d+)/i);
  if(version.status!==0 || !build || Number(build[1])<12600) throw Error("Install llama.cpp b12600+ with CUDA. Put its unpacked files in the llama folder beside this launcher or on PATH.");
  if(spawnSync("where.exe",["pi"],{stdio:"ignore"}).status!==0) throw Error("Install Pi first: npm install -g @earendil-works/pi-coding-agent@1.6.0");
  await getWeights();
  await configureCrew(home);
  await configure(home);
  llama=spawn(exe,["-m",weights,"--host","127.0.0.1","--port",String(port),"--alias",alias,"--jinja","-c","16384","-ngl","99"],{stdio:"inherit"});
  let problem;
  llama.once("error",e=>{problem=e;});
  const until=Date.now()+300000;
  for(;;){
    if(problem || llama.exitCode!==null || llama.signalCode) throw problem ?? Error("llama-server stopped. See its output above.");
    try{
      const response=await fetch("http://127.0.0.1:"+port+"/v1/models",{signal:AbortSignal.timeout(2500)});
      if(response.ok && (await response.json()).data?.some(m=>m.id===alias)) break;
    }catch{}
    if(Date.now()>until) throw Error("The model did not become ready within five minutes.");
    await sleep(500);
  }
  console.log("Inkling is ready. In a new Daycrew task select Inkling Local and Inkling 2 Mini.");
  ui=spawn(join(app,"t3.exe"),["--host","127.0.0.1","--port","47831","--base-dir",home],{
    stdio:"inherit",env:{...process.env,T3CODE_TELEMETRY_ENABLED:"false",T3CODE_OTEL_SDK_DISABLED:"true"}
  });
  process.exitCode=await new Promise((resolve,reject)=>{ui.once("error",reject);ui.once("exit",c=>resolve(c??1));});
}catch(e){ console.error(e.message);process.exitCode=1; }finally{stop();}
