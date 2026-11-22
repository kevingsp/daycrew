import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join } from "node:path";

export const alias = "inkling-2-mini-q4";
export const port = 47832;
export const model = "Inkling-2-Mini-Uncensored-AD-Q4_K.gguf";
export const revision = "40886ab636cabb4decf4998224f790b462ab048e";
export const hash = "36e99f1f56ca33cb356f19d7e3822938f65af1cde978ad13170238928d4c955f";
export const bytes = 16525559776;

async function readObject(file) {
  try {
    const data = JSON.parse((await readFile(file, "utf8")).replace(/^\uFEFF/, ""));
    if (!data || typeof data !== "object" || Array.isArray(data)) throw Error("Expected an object in " + file);
    return data;
  } catch (e) {
    if (e.code === "ENOENT") return {};
    throw e;
  }
}

async function update(file, edit) {
  const data = await readObject(file);
  const before = JSON.stringify(data);
  edit(data);
  if (JSON.stringify(data) === before) return;
  const tmp = file + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(data, null, 2) + "\n", { flag:"wx" });
  await rename(tmp, file);
}

export async function configure(home) {
  const agentDir = join(home, "inkling", "pi");
  const settingsDir = join(home, "userdata");
  await Promise.all([mkdir(agentDir,{recursive:true}),mkdir(settingsDir,{recursive:true})]);
  await update(join(agentDir,"models.json"), data => {
    data.providers ??= {};
    data.providers["daycrew-local"] = {
      baseUrl:"http://127.0.0.1:" + port + "/v1", api:"openai-completions", apiKey:"local",
      models:[{id:alias,name:"Inkling 2 Mini · Q4",input:["text"],contextWindow:16384,maxTokens:4096}]
    };
  });
  await update(join(agentDir,"settings.json"), data => {
    data.defaultProvider="daycrew-local"; data.defaultModel=alias;
  });
  await update(join(settingsDir,"settings.json"), data => {
    data.providerInstances ??= {};
    const old=data.providerInstances["daycrew-inkling"];
    if (old && old.driver !== "pi") throw Error("The provider ID daycrew-inkling is already in use.");
    data.providerInstances["daycrew-inkling"] = {
      ...old,driver:"pi",displayName:old?.displayName ?? "Inkling Local",enabled:true,
      environment:[...(old?.environment ?? []).filter(v=>v.name!=="PI_CODING_AGENT_DIR"),
        {name:"PI_CODING_AGENT_DIR",value:agentDir,sensitive:false}],
      config:{...old?.config,enabled:true}
    };
  });
}

export async function configureCrew(home) {
  const dir=join(home,"userdata");
  await mkdir(dir,{recursive:true});
  await update(join(dir,"settings.json"), data=>{
    data.providerInstances ??= {};
    for(const driver of ["codex","muse","grok","antigravity"]){
      const old=data.providerInstances[driver];
      if(old && old.driver!==driver) throw Error("Conflicting provider ID: "+driver);
      if(!old) data.providerInstances[driver]={driver,enabled:true,config:{enabled:true}};
    }
  });
}
