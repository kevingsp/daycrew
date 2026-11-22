import { createServer } from "node:net";
import { join } from "node:path";
import { configureCrew } from "./profile.mjs";
const probe=createServer();
await new Promise((resolve,reject)=>probe.once("error",()=>reject(Error("Close the running Daycrew window and try again."))).listen(47831,"127.0.0.1",()=>probe.close(resolve)));
await configureCrew(join(process.env.LOCALAPPDATA,"T3CodeWorkspaces"));
