import * as pulumi from "@pulumi/pulumi";
import { loadConfig } from "./config";
import { createSecurityGroup } from "./networking";
import { createInstanceProfile } from "./iam";
import { buildUserData } from "./userData";
import { createCompute } from "./compute";

const cfg = loadConfig();
const sg = createSecurityGroup();
const profile = createInstanceProfile(cfg.githubSecretName);
const userData = buildUserData(cfg);
const { instance, eip } = createCompute(cfg, sg, profile, userData);

export const publicIp = eip.publicIp;
export const instanceId = instance.id;
export const sshCommand = pulumi.interpolate`ssh ${cfg.userName}@${eip.publicIp}`;
export const moshCommand = pulumi.interpolate`mosh ${cfg.userName}@${eip.publicIp}`;
